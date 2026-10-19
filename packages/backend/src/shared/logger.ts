import { ERROR_CODE_STATUS } from '@tindivo/contracts'
import { type Clock, systemClock } from './clock'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Campos libres de un evento; `requestId` y `durationMs` tienen nombre propio. */
export type LogFields = Record<string, unknown> & { requestId?: string; durationMs?: number }

/** Destino de las líneas ya serializadas. Inyectable para los tests. */
export interface LogSink {
  write(level: LogLevel, line: string): void
}

export interface Logger {
  debug(event: string, fields?: LogFields): void
  info(event: string, fields?: LogFields): void
  warn(event: string, fields?: LogFields): void
  error(event: string, fields?: LogFields): void
  /** Mismo destino y reloj, con otro `module` en cada línea. */
  child(module: string): Logger
}

export const REDACTED = '[redactado]'

/**
 * Claves cuyo valor nunca se imprime (nombre, teléfono, correo, dirección, referencia,
 * coordenadas, GPS, token, autorización, contraseña, secreto, clave; español e inglés).
 * Se compara sin tildes, en minúsculas y sin separadores, así `x-api-key`, `apiKey` y
 * `teléfono` casan igual. Es deliberadamente amplia: un falso positivo oculta un dato
 * inocuo; un falso negativo filtra uno personal.
 */
const SENSITIVE_KEY =
  /nombre|name|telefono|phone|celular|mobile|correo|mail|direccion|address|referencia|reference|coordenada|coordinate|coords|gps|latitud|longitud|latitude|longitude|token|autorizacion|authorization|contrasena|password|passwd|secreto|secret|clave|key|cookie/
const SENSITIVE_EXACT = new Set(['lat', 'lng', 'lon', 'long'])

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return SENSITIVE_EXACT.has(normalized) || SENSITIVE_KEY.test(normalized)
}

const MAX_DEPTH = 8
const MAX_FRAMES = 10

/**
 * Lo único que se registra de un fallo es lo que no puede llevar datos de nadie. Un fallo
 * (lo que llega a un `catch`) puede ser un `Error`, un objeto plano o una cadena, y su
 * mensaje, su nombre o su `code` los puede haber escrito un tercero (la base, un SDK) con
 * un teléfono, un correo o una credencial dentro. Por eso nada se copia tal cual:
 * - `name`: solo si es uno de los nombres conocidos; si no, `Error`.
 * - `code`: solo con forma de SQLSTATE (`23505`), de PostgREST (`PGRST116`) o un `code` del
 *   contrato (`forbidden`).
 * - `frames`: de cada línea del stack posterior al mensaje, solo `archivo.ts:línea:columna`
 *   (sin la carpeta ni el nombre de la función), y solo si la línea tiene forma de frame.
 */
const KNOWN_ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'URIError',
  'EvalError',
  'AggregateError',
  'AbortError',
  'TimeoutError',
  'DomainError',
  'ZodError',
  'PostgrestError',
  'AuthError',
  'AuthApiError',
  'AuthRetryableFetchError',
  'StorageError',
  'StorageApiError',
  'FunctionsHttpError',
  'FunctionsFetchError',
  'FunctionsRelayError',
])
const SQLSTATE = /^[0-9A-Z]{5}$/
const POSTGREST_CODE = /^PGRST[0-9]{3}$/
const STACK_FRAME =
  /^\s+at (?:.* \()?(?:[^\s()]*[\\/])?([A-Za-z0-9_.-]{1,100}\.(?:ts|tsx|mts|cts|js|mjs|cjs)):([0-9]{1,7}):([0-9]{1,7})\)?$/

function safeCode(code: unknown): string | undefined {
  if (typeof code !== 'string') return undefined
  if (SQLSTATE.test(code) || POSTGREST_CODE.test(code)) return code
  return Object.hasOwn(ERROR_CODE_STATUS, code) ? code : undefined
}

function safeFrames(error: Error): string[] {
  const stack = error.stack
  if (typeof stack !== 'string') return []
  // El mensaje (con sus saltos de línea) va antes de los frames: se salta entero.
  const at = error.message === '' ? -1 : stack.indexOf(error.message)
  const rest = at >= 0 ? stack.slice(at + error.message.length) : stack
  const frames: string[] = []
  for (const line of rest.split('\n').slice(1)) {
    const match = STACK_FRAME.exec(line)
    if (match) frames.push(`${match[1]}:${match[2]}:${match[3]}`)
    if (frames.length === MAX_FRAMES) break
  }
  return frames
}

/** Describe cualquier valor lanzado sin copiar texto de él. */
export function describeFailure(value: unknown, withCause = true): Record<string, unknown> {
  if (value instanceof Error) {
    const out: Record<string, unknown> = {
      kind: 'error',
      name: KNOWN_ERROR_NAMES.has(value.name) ? value.name : 'Error',
    }
    const code = safeCode((value as { code?: unknown }).code)
    if (code !== undefined) out.code = code
    out.frames = safeFrames(value)
    if (withCause && value.cause !== undefined) out.cause = describeFailure(value.cause, false)
    return out
  }
  if (value !== null && typeof value === 'object') {
    const code = safeCode((value as { code?: unknown }).code)
    return code === undefined ? { kind: 'object' } : { kind: 'object', code }
  }
  return { kind: value === null ? 'null' : typeof value }
}

/** Claves que, por convención, llevan un fallo: su valor se describe, nunca se copia. */
const FAILURE_KEY = /^(err|error|errors|cause|exception|reason|failure)$/i

/** Copia el valor reemplazando por `[redactado]` lo que cuelga de una clave sensible. */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH || seen.has(value)) return '[truncado]'
  seen.add(value)
  if (value instanceof Error) return describeFailure(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    if (isSensitiveKey(key)) out[key] = REDACTED
    else if (FAILURE_KEY.test(key)) out[key] = describeFailure(inner)
    else out[key] = redact(inner, depth + 1, seen)
  }
  return out
}

/** Sink por defecto: warn y error a stderr, el resto a stdout. */
export const processSink: LogSink = {
  write(level, line) {
    const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout
    stream.write(`${line}\n`)
  },
}

export interface LoggerOptions {
  module: string
  sink?: LogSink
  clock?: Clock
}

/** Logger JSON de una línea por evento (TS-7). Nunca usa `console.*`. */
export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? processSink
  const clock = options.clock ?? systemClock

  function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
    const { requestId, durationMs, ...rest } = fields
    const entry: Record<string, unknown> = {
      time: clock.now().toISOString(),
      level,
      module: options.module,
      event,
    }
    if (requestId !== undefined) entry.requestId = requestId
    if (durationMs !== undefined) entry.durationMs = durationMs
    Object.assign(entry, redact(rest))
    sink.write(level, JSON.stringify(entry))
  }

  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    child: (module) => createLogger({ ...options, module }),
  }
}
