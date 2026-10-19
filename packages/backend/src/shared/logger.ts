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

/** Copia el valor reemplazando por `[redactado]` lo que cuelga de una clave sensible. */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH || seen.has(value)) return '[truncado]'
  seen.add(value)
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redact(inner, depth + 1, seen)
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
  }
}
