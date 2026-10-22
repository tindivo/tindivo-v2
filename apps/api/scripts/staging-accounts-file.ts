/**
 * Archivo de contraseñas de `seed-staging.ts` (sin red: se prueba con vitest).
 *
 * - Nace PRIVADO: se crea dentro de una carpeta nueva que primero se restringe al usuario actual
 *   (`securePrivateDir`) y cuya identidad (ino/dev) se comprueba antes y después. El archivo se abre
 *   exclusivo (`wx`, 0600) y su ACL (o modo) se lee y verifica ANTES de escribir ningún secreto.
 * - Se verifica por identidad (ino/dev) que lo abierto es el archivo que hay en la ruta.
 * - NUNCA borra nada por ruta: ante cualquier fallo cierra el descriptor y deja lo creado (vacío,
 *   sin secretos); el error dice qué ruta quedó.
 * - Cada escritura se completa entera (`writeAll`) y se fuerza a disco ANTES de activar la
 *   contraseña en Auth; así una caída a mitad nunca deja una contraseña activa que no esté escrita.
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  statSync,
  writeSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export type WriteFn = (fd: number, buf: Buffer, offset: number, length: number) => number

const defaultWrite: WriteFn = (fd, buf, offset, length) => writeSync(fd, buf, offset, length)

/** Escribe `text` entero (UTF-8), repitiendo las escrituras cortas; lanza si no avanza. */
function writeAll(fd: number, text: string, write: WriteFn = defaultWrite): void {
  const buf = Buffer.from(text, 'utf8')
  let off = 0
  while (off < buf.length) {
    const n = write(fd, buf, off, buf.length - off)
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('La escritura del archivo de contraseñas no avanzó.')
    }
    off += n
  }
}

function currentUser(): string {
  const domain = process.env.USERDOMAIN ?? ''
  const name = process.env.USERNAME ?? ''
  if (!domain || !name) {
    throw new Error('No se pudo determinar el usuario actual (USERDOMAIN/USERNAME).')
  }
  return `${domain}\\${name}`
}

/** Entradas de acceso (`usuario`, `permisos`) que imprime `icacls <path>`. */
function readAcl(path: string): { who: string; perms: string }[] {
  const out = execFileSync('icacls', [path], { encoding: 'utf8' })
  const entries: { who: string; perms: string }[] = []
  for (const raw of out.split(/\r?\n/)) {
    let line = raw.trim()
    if (line.toLowerCase().startsWith(path.toLowerCase())) line = line.slice(path.length).trim()
    const m = /^(.+?):((?:\([^)]*\))+)$/.exec(line)
    if (m?.[1] && m[2]) entries.push({ who: m[1], perms: m[2] })
  }
  return entries
}

/**
 * Verifica leyendo el sistema que `path` es privado para el usuario actual: en Windows una sola
 * entrada de ACL, la del usuario, con control total (`(OI)(CI)(F)` si es carpeta; en un archivo
 * vale la heredada `(I)(F)`); en otro SO, modo 700 (carpeta) o 600 (archivo).
 */
export function assertPrivateAcl(path: string, kind: 'file' | 'dir'): void {
  if (process.platform === 'win32') {
    const user = currentUser()
    const entries = readAcl(path)
    const only = entries[0]
    const needed = kind === 'dir' ? '(OI)(CI)(F)' : '(F)'
    if (
      entries.length !== 1 ||
      !only ||
      only.who.toLowerCase() !== user.toLowerCase() ||
      !only.perms.includes(needed)
    ) {
      throw new Error(`El acceso a ${path} no es privado (ACL: ${entries.length} entradas).`)
    }
    return
  }
  const want = kind === 'dir' ? 0o700 : 0o600
  if ((statSync(path).mode & 0o777) !== want) {
    throw new Error(`El acceso a ${path} no es privado (modo distinto de ${want.toString(8)}).`)
  }
}

/** Restringe la carpeta al usuario actual y lo verifica; lanza si no se logra. */
export function securePrivateDir(path: string): void {
  if (process.platform === 'win32') {
    execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${currentUser()}:(OI)(CI)F`], {
      stdio: 'pipe',
    })
  } else {
    chmodSync(path, 0o700)
  }
  assertPrivateAcl(path, 'dir')
}

/**
 * Derechos que permiten RENOMBRAR, BORRAR o reapropiarse de una entrada de la carpeta: borrar
 * subcarpetas y archivos (0x40), Delete (0x10000), cambiar permisos (0x40000), tomar posesión
 * (0x80000) y GENERIC_ALL (0x10000000). Crear entradas nuevas (AppendData, CreateFiles) no basta
 * para sustituir las nuestras, así que no se consideran.
 */
export const DANGEROUS = 0x40 | 0x10000 | 0x40000 | 0x80000 | 0x10000000

export type Ace = { sid: string; rights: number; allow: boolean; inheritOnly: boolean }

/** Función PURA: una línea por cada ACE de permiso, efectiva en el nivel, peligrosa y de un SID no permitido. */
export function boundaryViolations(
  levels: { path: string; aces: Ace[] }[],
  allowedSids: readonly string[],
): string[] {
  const out: string[] = []
  for (const { path, aces } of levels) {
    for (const a of aces) {
      if (a.allow && !a.inheritOnly && (a.rights & DANGEROUS) !== 0 && !allowedSids.includes(a.sid)) {
        out.push(`${path}: ${a.sid} tiene 0x${(a.rights >>> 0).toString(16)}`)
      }
    }
  }
  return out
}

const ACL_SCRIPT = [
  '$p = $env:TINDIVO_ACL_PATH',
  "Write-Output ('ME|' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value)",
  '$acl = Get-Acl -LiteralPath $p',
  'foreach ($r in $acl.Access) {',
  "  $sid = 'ERR'",
  '  try { $sid = $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch {}',
  "  Write-Output ($sid + '|' + [int64]$r.FileSystemRights + '|' + $r.AccessControlType + '|' + [int]$r.PropagationFlags)",
  '}',
].join('\n')

/** La carpeta y todos sus ancestros hasta la raíz. */
function levelsOf(dir: string): string[] {
  const out: string[] = []
  let cur = resolve(dir)
  for (;;) {
    out.push(cur)
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return out
}

function readWindowsAces(path: string): { me: string; aces: Ace[] } {
  const out = execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', ACL_SCRIPT],
    { env: { ...process.env, TINDIVO_ACL_PATH: path }, encoding: 'utf8' },
  )
  let me = ''
  const aces: Ace[] = []
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split('|')
    if (parts[0] === 'ME' && parts.length === 2 && parts[1]) {
      me = parts[1]
      continue
    }
    const [sid, rights, type, flags] = parts
    const r = Number(rights)
    const f = Number(flags)
    if (
      parts.length !== 4 ||
      !sid ||
      !/^S-1-\d+(-\d+)+$/.test(sid) ||
      !Number.isFinite(r) ||
      !Number.isFinite(f) ||
      (type !== 'Allow' && type !== 'Deny')
    ) {
      throw new Error(`no se pudo interpretar la ACL de ${path}`)
    }
    aces.push({ sid, rights: r, allow: type === 'Allow', inheritOnly: (f & 2) !== 0 })
  }
  if (!me) throw new Error(`no se pudo determinar el usuario actual al leer la ACL de ${path}`)
  return { me, aces }
}

/**
 * Exige una FRONTERA DE ALMACENAMIENTO: que nadie más pueda renombrar, borrar ni reapropiarse de
 * entradas en `dir` ni en ninguno de sus ancestros (si no, podrían intercambiar y restaurar
 * carpetas entre nuestras comprobaciones por ruta). Falla cerrado ante cualquier duda.
 */
export function assertStorageBoundary(dir: string): void {
  const levels = levelsOf(dir)
  if (process.platform === 'win32') {
    const read = levels.map((path) => ({ path, ...readWindowsAces(path) }))
    const me = read[0]?.me ?? ''
    const bad = boundaryViolations(read, [me, 'S-1-5-18', 'S-1-5-32-544'])
    if (bad.length > 0) {
      throw new Error(
        `--out-dir no es una frontera privada; otras cuentas pueden renombrar o borrar en:\n  ${bad.join('\n  ')}\n` +
          'Usa una carpeta dentro de tu perfil (p. ej. C:\\Users\\<usuario>\\tindivo-secretos).',
      )
    }
    return
  }
  const uid = process.getuid?.()
  const bad: string[] = []
  for (const path of levels) {
    const st = lstatSync(path)
    const mine = st.uid === uid || st.uid === 0
    const open = (st.mode & 0o022) !== 0 && (st.mode & 0o1000) === 0
    if (!mine || open) bad.push(`${path}: uid ${st.uid}, modo ${(st.mode & 0o7777).toString(8)}`)
  }
  if (bad.length > 0) {
    throw new Error(
      `--out-dir no es una frontera privada; otras cuentas pueden renombrar o borrar en:\n  ${bad.join('\n  ')}`,
    )
  }
}

/** Exige que `path` sea, por ino/dev, el archivo vacío abierto en `fd` (ni enlace ni reemplazo). */
function assertSameFile(fd: number, path: string): void {
  const opened = fstatSync(fd, { bigint: true })
  const now = lstatSync(path, { bigint: true })
  if (
    now.isSymbolicLink() ||
    !now.isFile() ||
    now.ino !== opened.ino ||
    now.dev !== opened.dev ||
    opened.size !== 0n
  ) {
    throw new Error('la ruta del archivo de contraseñas cambió entre la comprobación y la apertura')
  }
}

function dirIdentity(path: string): { ino: bigint; dev: bigint } {
  const st = lstatSync(path, { bigint: true })
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw new Error('la carpeta de contraseñas no es una carpeta (o es un enlace)')
  }
  return { ino: st.ino, dev: st.dev }
}

function assertSameDir(path: string, id: { ino: bigint; dev: bigint }): void {
  const now = dirIdentity(path)
  if (now.ino !== id.ino || now.dev !== id.dev) {
    throw new Error('la carpeta de contraseñas cambió mientras se restringía su acceso')
  }
}

/**
 * Crea `<dir>/staging-credenciales-<fecha>/cuentas.md` privado y vacío. Ante CUALQUIER fallo cierra
 * el descriptor y NO borra nada; el error indica la ruta que quedó (vacía, sin secretos).
 *
 * `hooks` es solo para pruebas: `beforeMkdir`/`beforeOpen` simulan una carrera justo antes de crear
 * la carpeta o el archivo, y `boundary` sustituye a `assertStorageBoundary` (que exige una carpeta
 * temporal privada desde la raíz).
 */
export function openPrivateAccountsFile(
  dir: string,
  nowIso: string,
  secureDir: (path: string) => void,
  hooks?: {
    beforeMkdir?: (sub: string) => void
    beforeOpen?: (file: string) => void
    boundary?: (dir: string) => void
  },
): { path: string; dir: string; fd: number } {
  const sub = join(dir, `staging-credenciales-${nowIso.replace(/[:.]/g, '-')}`)
  const file = join(sub, 'cuentas.md')
  let fd: number | undefined
  try {
    // Primer paso: sin frontera de almacenamiento no se crea nada.
    ;(hooks?.boundary ?? assertStorageBoundary)(dir)
    // `mkdir` no recursivo falla si existe (también un enlace); en Windows se comprueba antes con
    // `lstat` porque un enlace colgado no siempre hace fallar la creación.
    try {
      lstatSync(sub)
      throw new Error(`ya existe ${sub}; no se sobrescribe ni se sigue`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    hooks?.beforeMkdir?.(sub)
    mkdirSync(sub)
    const id = dirIdentity(sub)
    secureDir(sub)
    assertSameDir(sub, id)

    hooks?.beforeOpen?.(file)
    fd = openSync(file, 'wx', 0o600)
    assertSameFile(fd, file)
    assertSameDir(sub, id)
    assertPrivateAcl(file, 'file')
    assertSameFile(fd, file)

    writeAll(
      fd,
      [
        '# Cuentas de staging (tindivo-dev)',
        '',
        `Generadas: ${nowIso}. Cambian en cada corrida. No versionar.`,
        '',
        'Una fila "por activar" sin su "activada" puede estar activa o no; vuelve a correr el seed si dudas.',
        '',
        '| Email | Rol | Contraseña | Estado |',
        '|---|---|---|---|',
        '',
      ].join('\n'),
    )
    fsyncSync(fd)
    return { path: file, dir: sub, fd }
  } catch (err) {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // ya cerrado
      }
    }
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`ABORTADO: ${msg}. No se borró nada; revisa ${sub} (sin secretos).`)
  }
}

export async function recordThenActivate(
  fd: number,
  entry: { email: string; role: string; password: string },
  activate: () => Promise<void>,
  write: WriteFn = defaultWrite,
): Promise<void> {
  writeAll(fd, `| ${entry.email} | ${entry.role} | ${entry.password} | por activar |\n`, write)
  fsyncSync(fd)
  await activate()
  writeAll(fd, `| ${entry.email} | ${entry.role} | — | activada |\n`, write)
  fsyncSync(fd)
}

/** Sustituye cada secreto (no vacío) que aparezca en `message` por `[redactado]`. */
export function redactSecrets(message: string, secrets: readonly string[]): string {
  let out = message
  for (const s of secrets) if (s) out = out.split(s).join('[redactado]')
  return out
}
