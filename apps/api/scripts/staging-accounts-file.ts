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
import { join } from 'node:path'

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
 * `hooks` es solo para pruebas: simula una carrera justo antes de crear la carpeta o el archivo.
 */
export function openPrivateAccountsFile(
  dir: string,
  nowIso: string,
  secureDir: (path: string) => void,
  hooks?: { beforeMkdir?: (sub: string) => void; beforeOpen?: (file: string) => void },
): { path: string; dir: string; fd: number } {
  const sub = join(dir, `staging-credenciales-${nowIso.replace(/[:.]/g, '-')}`)
  const file = join(sub, 'cuentas.md')
  let fd: number | undefined
  try {
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
