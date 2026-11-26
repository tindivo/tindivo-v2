/**
 * Guardia de puertos de la suite e2e (3000 a 3004).
 *
 * `webServer.reuseExistingServer` acepta CUALQUIER proceso que conteste en la URL,
 * sea de este árbol o del de otra sesión (hay decenas de worktrees en esta
 * máquina y todas las apps escuchan en los mismos cinco puertos). Un servidor
 * ajeno sirve OTRO código: rutas que aquí existen devuelven 404, o una versión
 * vieja de la pantalla, y el rojo señala al test en vez de al servidor.
 *
 * Esta guardia mira quién escucha cada puerto y se niega a seguir si no es un
 * proceso lanzado desde ESTE árbol (su línea de comandos lleva la ruta del
 * `node_modules` del worktree). Un puerto libre, o uno de este mismo árbol, pasa.
 * No mata nada: nombra al dueño y deja la decisión a quien la lanzó.
 *
 * Falla CERRADA: si no puede inspeccionar (PowerShell, `lsof` o `ps` ausentes o
 * con error), aborta con el motivo. Solo cuenta como «puerto libre» el resultado
 * que la herramienta da para ese caso (`lsof`: código 1 sin salida ni error).
 *
 * Solo se usa en modo `dev` (el único que reutiliza servidores). En modo `start`
 * Playwright no reutiliza nada y falla solo si el puerto está ocupado.
 */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

export const PUERTOS_E2E = [3000, 3001, 3002, 3003, 3004]

const norm = (s) => s.replaceAll('\\', '/').toLowerCase()

function falla(que, r) {
  const detalle = r.error
    ? r.error.message
    : `código ${r.status}${r.stderr ? `: ${String(r.stderr).trim().slice(0, 200)}` : ''}`
  return new Error(`No se pudo comprobar quién escucha en los puertos e2e (${que}): ${detalle}`)
}

/**
 * Dueños de los puertos: [{ puerto, pid, linea }]. Vacío si todos están libres.
 * `run` y `plataforma` se inyectan solo en las pruebas (`e2e-puertos.test.mjs`).
 */
export function escuchadores(puertos, { run = spawnSync, plataforma = process.platform } = {}) {
  if (plataforma === 'win32') {
    const ps = [
      "$ProgressPreference = 'SilentlyContinue'",
      `$ps = @(${puertos.join(',')})`,
      'foreach ($p in $ps) {',
      '  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |',
      '    ForEach-Object {',
      '      $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"',
      '      "$p`t$($_.OwningProcess)`t$($proc.CommandLine)"',
      '    }',
      '}',
      'exit 0', // sin esto el código de salida es el del último cmdlet, que sale 1 con el puerto libre
    ].join('\n')
    // `-EncodedCommand` (UTF-16LE en base64): sin él, las comillas del guion se pierden al pasar por la línea de comandos.
    const codificado = Buffer.from(ps, 'utf16le').toString('base64')
    const r = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', codificado], {
      encoding: 'utf8',
    })
    if (r.error || r.status !== 0) throw falla('PowerShell', r)
    return String(r.stdout)
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        const [puerto, pid, ...resto] = l.split('\t')
        return { puerto: Number(puerto), pid: Number(pid), linea: resto.join('\t') }
      })
  }
  // Linux y macOS: `lsof` da el pid; la línea de comandos sale de `ps`.
  const res = []
  for (const puerto of puertos) {
    const l = run('lsof', ['-t', `-iTCP:${puerto}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
    if (l.error) throw falla('lsof', l)
    // `lsof` sale con 1 cuando no encuentra a nadie: es el único caso que vale como «libre».
    if (l.status === 1 && !String(l.stdout).trim() && !String(l.stderr).trim()) continue
    if (l.status !== 0) throw falla('lsof', l)
    for (const pid of String(l.stdout).split('\n').filter(Boolean)) {
      const p = run('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' })
      if (p.error || p.status !== 0) throw falla('ps', p)
      res.push({ puerto, pid: Number(pid), linea: String(p.stdout).trim() })
    }
  }
  return res
}

/**
 * Lanza un Error si algún puerto lo tiene un proceso que no es de `raiz`, o si no puede comprobarlo.
 * @param {string} raiz Raíz del worktree (donde vive este `playwright.config.ts`).
 */
export function verificarPuertos(raiz, puertos = PUERTOS_E2E, opciones = {}) {
  const mia = `${norm(resolve(raiz))}/` // con la barra: «tindivo-v2» no debe casar con «tindivo-v2-otro»
  const ajenos = escuchadores(puertos, opciones).filter((e) => !norm(e.linea).includes(mia))
  if (ajenos.length === 0) return
  const detalle = ajenos
    .map((e) => `  :${e.puerto}  pid ${e.pid}  ${e.linea.slice(0, 160) || '(sin línea de comandos)'}`)
    .join('\n')
  throw new Error(
    `Puertos de la suite e2e ocupados por procesos que NO son de este árbol (${raiz}):\n${detalle}\n` +
      '  Con `reuseExistingServer` la suite hablaría con el código de OTRO worktree (404 en rutas que aquí existen,\n' +
      '  pantallas viejas). Páralos por puerto (docs: Docs/operacion/trampas.md, «Un dev server viejo finge bugs de código»)\n' +
      '  y vuelve a correr.',
  )
}
