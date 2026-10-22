/**
 * Archivo de credenciales de `seed-staging.ts` (sin red: se prueba con vitest).
 *
 * - Se crea EXCLUSIVO (`lstat` + `wx`, 0600): falla si la ruta existe, también si es un enlace
 *   (aunque esté colgado), así que nunca sigue un enlace ni reutiliza un archivo con permisos amplios.
 * - Se restringe a su dueño ANTES de escribir ningún secreto (`secure`).
 * - Cada contraseña se escribe y se fuerza a disco ANTES de activarla en Auth; así una caída a
 *   mitad nunca deja una contraseña activa que no esté en el archivo.
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'

export function openPrivateCredentialsFile(
  dir: string,
  nowIso: string,
  secure: (path: string) => void,
): { path: string; fd: number } {
  const path = join(dir, `staging-credenciales-${nowIso.replace(/[:.]/g, '-')}.md`)
  // En Windows `wx` NO falla ante un enlace colgado (crea su destino): se comprueba antes con
  // `lstat`, que no sigue enlaces. Cualquier entrada existente (archivo, enlace, colgado) aborta.
  try {
    lstatSync(path)
    throw new Error(`ABORTADO: ya existe ${path}; no se sobrescribe ni se sigue.`)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  const fd = openSync(path, 'wx', 0o600)
  try {
    secure(path)
    writeSync(
      fd,
      [
        '# Credenciales de staging (tindivo-dev)',
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
  } catch (err) {
    try {
      closeSync(fd)
    } catch {
      // ya cerrado
    }
    try {
      unlinkSync(path)
    } catch {
      // ya borrado
    }
    throw err
  }
  return { path, fd }
}

export async function recordThenActivate(
  fd: number,
  entry: { email: string; role: string; password: string },
  activate: () => Promise<void>,
): Promise<void> {
  writeSync(fd, `| ${entry.email} | ${entry.role} | ${entry.password} | por activar |\n`)
  fsyncSync(fd)
  await activate()
  writeSync(fd, `| ${entry.email} | ${entry.role} | — | activada |\n`)
  fsyncSync(fd)
}

/** Deja el archivo accesible solo para el usuario actual y lo verifica; lanza si no se logra. */
export function securePlatform(path: string): void {
  if (process.platform === 'win32') {
    const domain = process.env.USERDOMAIN ?? ''
    const name = process.env.USERNAME ?? ''
    const user = `${domain}\\${name}`
    if (!domain || !name) {
      throw new Error('No se pudo determinar el usuario actual (USERDOMAIN/USERNAME).')
    }
    execFileSync('icacls', [path, '/inheritance:r', '/grant:r', `${user}:F`], { stdio: 'pipe' })
    const out = execFileSync('icacls', [path], { encoding: 'utf8' })
    const entries = out
      .split(/\r?\n/)
      .map((l) => l.replace(path, '').trim())
      .filter((l) => /\(([A-Z,]+)\)/.test(l) && l.includes(':'))
    const only = entries[0]
    if (
      entries.length !== 1 ||
      !only ||
      !only.toLowerCase().startsWith(`${user.toLowerCase()}:`) ||
      !only.includes('(F)')
    ) {
      throw new Error(`No se pudo restringir el acceso al archivo de credenciales (ACL: ${entries.length} entradas).`)
    }
    return
  }
  chmodSync(path, 0o600)
  if ((statSync(path).mode & 0o777) !== 0o600) {
    throw new Error('No se pudo restringir el archivo de credenciales a modo 600.')
  }
}

/** Sustituye cada secreto (no vacío) que aparezca en `message` por `[redactado]`. */
export function redactSecrets(message: string, secrets: readonly string[]): string {
  let out = message
  for (const s of secrets) if (s) out = out.split(s).join('[redactado]')
  return out
}
