#!/usr/bin/env node
/**
 * Revisa una ronda de Codex en modo provisional (codex-worker.md §13.1 bis): lee el JSONL de
 * eventos de `codex exec --json` y marca todo lo que salga de la copia auditada.
 *
 *   node scripts/codex-audit-scope-check.mjs <eventos.jsonl> <AUDIT_ROOT>
 *
 * Sale con 0 solo si el registro está completo y no hay nada que marcar; con 1 si hay algo (la
 * ronda NO vale y se trata como incidente, §13.1 bis); con 2 ante un uso incorrecto o cualquier
 * error no previsto (nunca 0 por accidente).
 *
 * QUÉ EXIGE
 * - Registro completo: archivo legible, todas las líneas JSON, al menos un evento, `thread.started`,
 *   `turn.completed`, y ningún `turn.failed` ni `error`.
 * - Cada `command_execution` trae `command` (texto no vacío) y, si aparece en `item.started` o
 *   `item.updated`, tiene su `item.completed`. Un `item.completed` sin `started` es válido.
 * - Ningún evento de item después del último `turn.completed`.
 * - Todos los eventos de item (`item.started`, `item.updated`, `item.completed`) son de un tipo
 *   permitido: `agent_message`, `reasoning` o `command_execution`. Cualquier otro (mcp_tool_call,
 *   file_change, web_search, tipos nuevos) se marca.
 *
 * QUÉ DETECTA EN CADA COMANDO
 * - PowerShell sin `-NoProfile`.
 * - Tras sustituir por `<ROOT>` las rutas internas a AUDIT_ROOT (con `\` o `/`, con espacios y
 *   comillas; la raíz solo termina en `\`, `/`, comilla, `;`, `|`, `)` o fin: `audit-root copia`
 *   y una raíz seguida de espacio sin comillas se marcan): cualquier unidad `X:` de una letra
 *   (incluida la relativa `D:x`), UNC (`\\`), segmentos `..` y `~`, variables
 *   de entorno (`$env:`, `%X%`, `$HOME`), proveedores de PowerShell (`HKCU:`, `Env:`, `Cert:`…),
 *   cambios de directorio (`cd`, `Set-Location`…) y nombres sensibles (auth.json, .env, .ssh…).
 *
 * QUÉ NO DETECTA (es DETECCIÓN, no prevención)
 * - Rutas armadas por partes en tiempo de ejecución (concatenaciones, `-join`, `[char]`…).
 * - Rutas leídas del contenido de una variable, de otro archivo o de la salida de otro comando.
 * - Comandos codificados (base64 con `-EncodedCommand`, `Invoke-Expression` sobre texto armado).
 * - Accesos hechos por un programa que el comando lanza (el script no ve lo que éste abre).
 * Por eso este chequeo no convierte el modo provisional en aislamiento.
 */
import { readFileSync } from 'node:fs'
import { win32 } from 'node:path'

const ITEM_EVENTS = new Set(['item.started', 'item.updated', 'item.completed'])
const ALLOWED_ITEMS = new Set(['agent_message', 'reasoning', 'command_execution'])

/** Nombres que un auditor de esta copia no tiene por qué tocar, estén donde estén. */
const SENSITIVE =
  /auth\.json|\.env(?!\.example)\b|\.npmrc|\.git-credentials|\.ssh\b|\.supabase\b|appdata|\.claude\b|\.codex\b|id_rsa|id_ed25519|credentials?\b|cookies|login data|hosts\.yml|\.pgpass/i
/** Unidad de una letra (no parte de una palabra), siga lo que siga: también `D:x` (relativa). */
const DRIVE = /(?<![A-Za-z0-9_])[A-Za-z]:/
const UNC = /\\\\/
const PARENT = /(?<![A-Za-z0-9_.-])\.\.(?=[\\\s'";|&)]|$)/
const HOME_TILDE = /(?<![A-Za-z0-9_.-])~(?=[\\\s'";|&)]|$)/
const ENV_VARS = /\$env:|\$\{env:|%[A-Za-z_][A-Za-z0-9_]*%|\$home\b/i
const PS_PROVIDERS =
  /(?<![A-Za-z0-9])(?:HKCU|HKLM|HKCR|HKU|Env|Cert|Variable|Function):|Registry::/i
const CHDIR = /(?<![\w.\\-])(?:cd|chdir|set-location|sl|push-location|pushd)(?![\w.\\-])/i

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function main() {
  const [eventsPath, auditRootArg] = process.argv.slice(2)
  if (!eventsPath || !auditRootArg) {
    console.error('uso: node scripts/codex-audit-scope-check.mjs <eventos.jsonl> <AUDIT_ROOT>')
    return 2
  }

  const auditRoot = win32.normalize(auditRootArg.replaceAll('/', '\\')).replace(/\\+$/, '')
  const rootRe = new RegExp(`${escapeRegExp(auditRoot)}(?=[\\\\"';|)]|$)`, 'gi')

  const findings = new Set()
  const add = (msg) => findings.add(msg)

  let text
  try {
    text = readFileSync(eventsPath, 'utf8')
  } catch (error) {
    add(`registro incompleto: no se puede leer ${eventsPath} (${error.code ?? error.message})`)
  }

  const events = []
  if (text !== undefined) {
    for (const [n, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (event === null || typeof event !== 'object' || Array.isArray(event))
          throw new Error('no es un objeto')
        events.push(event)
      } catch {
        add(`registro incompleto: línea ${n + 1} no es JSON`)
      }
    }
    if (events.length === 0) add('registro incompleto: no hay eventos')
    const types = events.map((e) => e.type)
    const lastTurn = types.lastIndexOf('turn.completed')
    if (lastTurn >= 0 && types.slice(lastTurn + 1).some((t) => ITEM_EVENTS.has(t)))
      add('registro incompleto: actividad después del cierre del turno')
    if (!types.includes('thread.started')) add('registro incompleto: falta thread.started')
    if (!types.includes('turn.completed')) add('registro incompleto: falta turn.completed')
    if (types.includes('turn.failed')) add('registro incompleto: hay turn.failed')
    if (types.includes('error')) add('registro incompleto: hay un evento error')
  }

  const opened = new Set()
  const closed = new Set()
  for (const event of events) {
    if (!ITEM_EVENTS.has(event.type)) continue
    const item = event.item
    if (item === null || typeof item !== 'object') {
      add(`${event.type}: evento de item sin item`)
      continue
    }
    const id = item.id ?? '(sin id)'
    if (!ALLOWED_ITEMS.has(item.type)) {
      add(
        `${id}: herramienta no permitida en el modo provisional (${item.type} ${item.server ?? ''} ${item.tool ?? ''})`.trim(),
      )
      continue
    }
    if (item.type !== 'command_execution') continue

    if (event.type === 'item.completed') closed.add(id)
    else opened.add(id)
    if (typeof item.command !== 'string' || !item.command.trim()) {
      add(`${id}: registro incompleto: comando sin texto`)
      continue
    }
    const command = item.command
    // Sin -NoProfile, PowerShell carga el perfil del usuario, fuera de la copia.
    if (/(?:powershell|pwsh)(?:\.exe)?"?\s/i.test(command) && !/\s-NoProfile\b/i.test(command))
      add(`${id}: PowerShell sin -NoProfile (carga el perfil del usuario)`)

    // Las rutas internas a la copia pasan a <ROOT>; lo que quede fuera de ella se busca después.
    let scan = command.replaceAll('/', '\\').replace(rootRe, '<ROOT>')
    // Solo se ignora el primer token si es el intérprete (su propia ruta no cuenta).
    scan = scan.replace(
      /^\s*(?:"[^"]*(?:powershell|pwsh|cmd)(?:\.exe)?"|\S*(?:powershell|pwsh|cmd)(?:\.exe)?)(?=\s|$)/i,
      '',
    )

    const checks = [
      [SENSITIVE.test(scan), 'nombre sensible'],
      [DRIVE.test(scan), 'ruta con unidad fuera de AUDIT_ROOT'],
      [UNC.test(scan), 'ruta UNC'],
      [PARENT.test(scan), 'segmento ..'],
      [HOME_TILDE.test(scan), 'segmento ~'],
      [ENV_VARS.test(scan), 'variable de entorno'],
      [PS_PROVIDERS.test(scan), 'proveedor de PowerShell'],
      [CHDIR.test(scan), 'cambio de directorio'],
    ]
    for (const [hit, why] of checks) if (hit) add(`${id}: ${why} → ${command}`)
  }

  for (const id of opened)
    if (!closed.has(id)) add(`${id}: registro incompleto: ejecución sin cerrar`)

  if (findings.size === 0) {
    console.log(`OK · ${events.length} eventos · ningún acceso fuera de ${auditRoot} detectado`)
    return 0
  }
  console.log(`MARCADO · ${findings.size} hallazgos · la ronda no vale (§13.1 bis)`)
  for (const f of findings) console.log(`- ${f}`)
  return 1
}

try {
  process.exitCode = main()
} catch (error) {
  console.error(`error no previsto: ${error?.stack ?? error}`)
  process.exitCode = 2
}
