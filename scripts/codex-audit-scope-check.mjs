#!/usr/bin/env node
/**
 * Revisa una ronda de Codex en modo provisional (Docs/operacion/codex-auditor.md §13.1 bis): lee el JSONL de
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
 *   `turn.completed`, y ningún `turn.failed` ni `error`. Única tolerancia: la reconexión del transporte
 *   ANTES del primer `command_execution` (eventos `error` con `^Reconnecting... N/N` e item `error` con
 *   `^Falling back from WebSockets`); después de un comando, o con otro texto, se marca.
 * - Cada `command_execution` trae `command` (texto no vacío) y, si aparece en `item.started` o
 *   `item.updated`, tiene su `item.completed`. Un `item.completed` sin `started` es válido.
 * - Ningún evento de item después del último `turn.completed`.
 * - Todos los eventos de item (`item.started`, `item.updated`, `item.completed`) son de un tipo
 *   permitido: `agent_message`, `reasoning` o `command_execution`. Cualquier otro (mcp_tool_call,
 *   file_change, web_search, tipos nuevos) se marca.
 *
 * QUÉ DETECTA EN CADA COMANDO
 * - Codex escribe el comando como argv con comillas POSIX (dentro de "…" cada `\` sale como `\\`). Antes de
 *   escanear se decodifica UN nivel de comillas: '…' es literal; dentro de "…", `\` solo escapa `\`, `"`, `$`
 *   y el acento grave. Una comilla sin cerrar o una `\` fuera de comillas marca «comando no decodificable».
 *   UNC y unidad (`X:`) corren sobre el texto decodificado (el que recibe el intérprete); las demás reglas,
 *   sobre el texto crudo Y sobre el decodificado; UNC, unidad y las demás se repiten además sobre el decodificado
 *   sin los acentos graves de escape de PowerShell (`\`\server` llega al cmdlet como `\\server`).
 * - PowerShell sin `-NoProfile`.
 * - Tras sustituir por `<ROOT>` las rutas internas a AUDIT_ROOT (con `\` o `/`, con espacios y
 *   comillas; la raíz solo cuenta si la sigue `\` (o `/`) o el fin del texto. Windows admite `'`, `;`,
 *   `|`… en nombres, así que `audit-root copia`, `audit-root;x`, `audit-root'x` y la raíz sola entre
 *   comillas se marcan; esto último es un falso positivo a propósito: se usa la ruta relativa): cualquier unidad `X:` de una letra
 *   (incluida la relativa `D:x`), UNC (`\\`), segmentos `..` y `~`, variables
 *   de entorno (`$env:`, `%X%`, `$HOME`), proveedores de PowerShell (`HKCU:`, `Env:`, `Cert:`…),
 *   cambios de directorio (`cd`, `Set-Location`…) y nombres sensibles (auth.json, .env, .ssh…).
 *
 * QUÉ NO DETECTA (es DETECCIÓN, no prevención)
 * - Rutas enraizadas sin unidad (`\Users\…`) y comodines: pendiente, fuera de este control. Antes de decodificar,
 *   el `\\` del texto crudo los marcaba de rebote cuando el script llevaba comillas internas; ya no.
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
/** Reconexión del transporte que Codex reintenta solo; solo se tolera antes del primer comando. */
const RECONNECT = /^Reconnecting\.\.\. \d+\/\d+(?: \([^)]*\))?$/
const FALLBACK = /^Falling back from WebSockets to HTTPS transport\.(?: .*)?$/
const PARENT = /(?<![A-Za-z0-9_.-])\.\.(?![A-Za-z0-9_.-])/
const HOME_TILDE = /(?<![A-Za-z0-9_.-])~(?![A-Za-z0-9_.-])/
const ENV_VARS = /\$env:|\$\{env:|%[A-Za-z_][A-Za-z0-9_]*%|\$home\b/i
const PS_PROVIDERS =
  /(?<![A-Za-z0-9])(?:HKCU|HKLM|HKCR|HKU|Env|Cert|Variable|Function):|Registry::/i
const CHDIR = /(?<![\w.\\-])(?:cd|chdir|set-location|sl|push-location|pushd)(?![\w.\\-])/i

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Decodifica un nivel de comillas POSIX (lo que hace un shell con el argv). Devuelve `null` si no se puede
 * hacer sin ambigüedad: comilla sin cerrar o `\` fuera de comillas.
 */
function decodePosix(text) {
  let out = ''
  let quote = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote === "'") {
      if (c === "'") quote = null
      else out += c
    } else if (quote === '"') {
      if (c === '"') quote = null
      else if (c === '\\' && '\\"$`'.includes(text[i + 1] ?? '')) out += text[++i]
      else out += c
    } else if (c === "'" || c === '"') quote = c
    else if (c === '\\') return null
    else out += c
  }
  return quote === null ? out : null
}

/**
 * Quita los tramos entre comillas pegados a texto suelto, como hace PowerShell al armar un argumento:
 * `C'':/W` llega como `C:/W` y `HK''CU:` como `HKCU:`. Un tramo que empieza tras un espacio, un
 * delimitador o el inicio conserva sus comillas (es un argumento propio o una cadena).
 */
const PS_SINGLE = /['‘’‚‛]/
const PS_DOUBLE = /["“”„]/
const PS_QUOTE = /['"‘’‚‛“”„]/
function stripGluedQuotes(text) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]
    // PowerShell también trata como comillas las tipográficas (U+2018–U+201F en lo que importa aquí).
    const kind = PS_SINGLE.test(c) ? PS_SINGLE : PS_DOUBLE.test(c) ? PS_DOUBLE : null
    if (kind === null) {
      out += c
      i++
      continue
    }
    let close = -1
    for (let k = i + 1; k < text.length; k++)
      if (kind.test(text[k])) {
        close = k
        break
      }
    if (close < 0) {
      out += text.slice(i)
      break
    }
    const prev = out.at(-1)
    const glued = prev !== undefined && !/[\s(){};,|&]/.test(prev) && !PS_QUOTE.test(prev)
    out += glued ? text.slice(i + 1, close) : text.slice(i, close + 1)
    i = close + 1
  }
  return out
}

function main() {
  const [eventsPath, auditRootArg] = process.argv.slice(2)
  if (!eventsPath || !auditRootArg) {
    console.error('uso: node scripts/codex-audit-scope-check.mjs <eventos.jsonl> <AUDIT_ROOT>')
    return 2
  }

  const auditRoot = win32.normalize(auditRootArg.replaceAll('/', '\\')).replace(/\\+$/, '')
  const rootRe = new RegExp(`${escapeRegExp(auditRoot)}(?=\\\\|$)`, 'gi')
  // En el texto crudo la barra puede venir duplicada (`\\`): solo sirve para no marcar nombres internos.
  const rootRawRe = new RegExp(
    `${auditRoot.split('\\').map(escapeRegExp).join('\\\\+')}(?=\\\\|$)`,
    'gi',
  )

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
  }

  // La reconexión del transporte solo se tolera antes del primer comando.
  const firstCommand = events.findIndex(
    (e) => ITEM_EVENTS.has(e.type) && e.item?.type === 'command_execution',
  )
  const firstClose = events.findIndex((e) => e.type === 'turn.completed')
  const limit = Math.min(
    firstCommand < 0 ? Number.POSITIVE_INFINITY : firstCommand,
    firstClose < 0 ? Number.POSITIVE_INFINITY : firstClose,
  )
  const beforeCommands = (i) => i < limit
  for (const [i, event] of events.entries()) {
    if (event.type !== 'error') continue
    if (beforeCommands(i) && typeof event.message === 'string' && RECONNECT.test(event.message))
      continue
    add('registro incompleto: hay un evento error')
  }

  const opened = new Set()
  const closed = new Set()
  for (const [i, event] of events.entries()) {
    if (!ITEM_EVENTS.has(event.type)) continue
    const item = event.item
    if (item === null || typeof item !== 'object') {
      add(`${event.type}: evento de item sin item`)
      continue
    }
    const id = item.id ?? '(sin id)'
    if (
      item.type === 'error' &&
      event.type === 'item.completed' &&
      beforeCommands(i) &&
      typeof item.message === 'string' &&
      FALLBACK.test(item.message)
    )
      continue
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

    // Solo se ignora el primer token si es el intérprete (su propia ruta no cuenta).
    const body = command.replace(
      /^\s*(?:"[^"]*(?:powershell|pwsh|cmd)(?:\.exe)?"|\S*(?:powershell|pwsh|cmd)(?:\.exe)?)(?=\s|$)/i,
      '',
    )
    // Texto crudo (tal como lo escribe Codex) y texto decodificado (lo que recibe el intérprete).
    // Las rutas internas a la copia pasan a <ROOT>; lo que quede fuera de ella se busca después.
    const rawScan = body.replace(rootRawRe, '<ROOT>').replaceAll('/', '\\')
    const decoded = decodePosix(body)
    if (decoded === null)
      add(
        `${id}: comando no decodificable (comilla sin cerrar o \\ fuera de comillas) → ${command}`,
      )
    const normalize = (t) => t.replaceAll('/', '\\').replace(rootRe, '<ROOT>')
    const decodedScan = decoded === null ? undefined : normalize(decoded)
    // PowerShell quita el acento grave de escape: \`\server llega al cmdlet como \\server.
    const noBackticks = decoded?.replace(/`(.)/gs, '$1')
    const psScan = noBackticks === undefined ? undefined : normalize(noBackticks)
    // Un argumento que empieza con texto suelto absorbe los tramos entre comillas pegados a él
    // (`C'':/W` llega como `C:/W`); uno que empieza con comilla termina en ella (`'C':\\W` son dos).
    // Se SUMA a las variantes anteriores: el conjunto de hallazgos nunca es menor que el de antes.
    const psScanNoQuotes =
      noBackticks === undefined ? undefined : normalize(stripGluedQuotes(noBackticks))
    const decodedScans = [decodedScan, psScan, psScanNoQuotes].filter((t) => t !== undefined)

    const both = [
      [SENSITIVE, 'nombre sensible'],
      [PARENT, 'segmento ..'],
      [HOME_TILDE, 'segmento ~'],
      [ENV_VARS, 'variable de entorno'],
      [PS_PROVIDERS, 'proveedor de PowerShell'],
      [CHDIR, 'cambio de directorio'],
    ]
    for (const [re, why] of both)
      if (re.test(rawScan) || decodedScans.some((t) => re.test(t)))
        add(`${id}: ${why} → ${command}`)
    // Unidad y UNC solo tienen sentido sobre lo decodificado: en el crudo cada `\` viene duplicada.
    if (decodedScans.some((t) => DRIVE.test(t)))
      add(`${id}: ruta con unidad fuera de AUDIT_ROOT → ${command}`)
    if (decodedScans.some((t) => UNC.test(t))) add(`${id}: ruta UNC → ${command}`)
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
