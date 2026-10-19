import { describe, expect, it } from 'vitest'
import { createLogger, type LogLevel, REDACTED } from './logger'

function capture() {
  const lines: Array<{ level: LogLevel; line: string }> = []
  const logger = createLogger({
    module: 'test',
    sink: { write: (level, line) => lines.push({ level, line }) },
    clock: { now: () => new Date('2026-10-19T12:00:00.000Z') },
  })
  return { lines, logger }
}

describe('logger', () => {
  it('escribe una línea JSON con level, module, event, requestId y durationMs', () => {
    const { lines, logger } = capture()
    logger.info('algo', { requestId: 'r1', durationMs: 5, status: 200 })
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]?.line ?? '')).toEqual({
      time: '2026-10-19T12:00:00.000Z',
      level: 'info',
      module: 'test',
      event: 'algo',
      requestId: 'r1',
      durationMs: 5,
      status: 200,
    })
  })

  it('redacta claves sensibles anidadas sin imprimir nunca el valor', () => {
    const { lines, logger } = capture()
    logger.info('x', {
      cliente: { nombre: 'Juana Quispe', teléfono: '987654321', ok: 1 },
      headers: { Authorization: 'Bearer abc', 'x-api-key': 'k-123' },
      destino: { address: 'Jr. Lima 123', lat: -9.1, lng: -77.5 },
    })
    const line = lines[0]?.line ?? ''
    for (const secret of ['Juana', '987654321', 'abc', 'k-123', 'Lima 123', '-9.1', '-77.5']) {
      expect(line).not.toContain(secret)
    }
    const parsed = JSON.parse(line)
    expect(parsed.cliente).toEqual({ nombre: REDACTED, teléfono: REDACTED, ok: 1 })
    expect(parsed.headers.Authorization).toBe(REDACTED)
    expect(parsed.destino.lat).toBe(REDACTED)
  })

  it('redacta dentro de arrays de objetos', () => {
    const { lines, logger } = capture()
    logger.warn('x', {
      items: [
        { email: 'a@b.pe', qty: 2 },
        { password: 'p', qty: 1 },
      ],
    })
    const line = lines[0]?.line ?? ''
    expect(line).not.toContain('a@b.pe')
    expect(JSON.parse(line).items).toEqual([
      { email: REDACTED, qty: 2 },
      { password: REDACTED, qty: 1 },
    ])
    expect(lines[0]?.level).toBe('warn')
  })

  it('no redacta campos inocuos como path o status', () => {
    const { lines, logger } = capture()
    logger.info('x', { path: '/api/v1/a', status: 200 })
    expect(JSON.parse(lines[0]?.line ?? '')).toMatchObject({ path: '/api/v1/a', status: 200 })
  })

  it('tolera referencias circulares', () => {
    const { lines, logger } = capture()
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    logger.error('x', { circular })
    expect(JSON.parse(lines[0]?.line ?? '').circular.self).toBe('[truncado]')
  })
})

const PHONE = '+51 987 654 321'
const EMAIL = 'juana.quispe@example.pe'
const SECRET = 'sk_live_abc123'

/** Error cuyo message y cuyo stack (encabezado y una línea que imita un frame) llevan datos sensibles. */
function leakyError(code?: string): Error & { code?: string } {
  const err: Error & { code?: string } = new Error(`falló ${PHONE}
    at ${EMAIL} (${SECRET})`)
  err.name = 'PostgrestError'
  if (code !== undefined) err.code = code
  err.stack = `PostgrestError: ${err.message}
    at insertar (/app/repo.ts:10:5)
    at run (/app/run.ts:3:1)`
  return err
}

function expectNoLeak(text: string): void {
  for (const secret of [PHONE, '987 654 321', EMAIL, SECRET]) expect(text).not.toContain(secret)
}

describe('logger: errores', () => {
  it('registra solo name, code y frames; nunca el message ni la primera línea del stack', () => {
    const { lines, logger } = capture()
    logger.error('x', { err: leakyError('23505') })
    const line = lines[0]?.line ?? ''
    expectNoLeak(line)
    expect(JSON.parse(line).err).toEqual({
      name: 'PostgrestError',
      code: '23505',
      frames: ['    at insertar (/app/repo.ts:10:5)', '    at run (/app/run.ts:3:1)'],
    })
  })

  it('omite un code que no tiene forma de código', () => {
    const { lines, logger } = capture()
    logger.error('x', { err: leakyError(`${PHONE} ${EMAIL}`) })
    const line = lines[0]?.line ?? ''
    expectNoLeak(line)
    expect(JSON.parse(line).err).not.toHaveProperty('code')
  })

  it('describe la cause un nivel y sin su message', () => {
    const { lines, logger } = capture()
    const err = new Error('externo', { cause: leakyError('forbidden') })
    err.stack = ['Error: externo', '    at a (/a.ts:1:1)'].join('\n')
    logger.error('x', { err })
    const line = lines[0]?.line ?? ''
    expectNoLeak(line)
    const parsed = JSON.parse(line)
    expect(parsed.err.frames).toEqual(['    at a (/a.ts:1:1)'])
    expect(parsed.err.cause).toMatchObject({ name: 'PostgrestError', code: 'forbidden' })
    expect(parsed.err.cause.frames).toHaveLength(2)
    expect(parsed.err.cause).not.toHaveProperty('cause')
  })

  it('limita los frames a 10', () => {
    const { lines, logger } = capture()
    const err = new Error('m')
    const frames = Array.from({ length: 30 }, (_, i) => `    at f${i} (/f.ts:${i}:1)`)
    err.stack = ['Error: m', ...frames].join('\n')
    logger.error('x', { err })
    expect(JSON.parse(lines[0]?.line ?? '').err.frames).toHaveLength(10)
  })
})

describe('logger.child', () => {
  it('conserva el destino y cambia el module', () => {
    const { lines, logger } = capture()
    logger.child('orders').info('hecho')
    expect(JSON.parse(lines[0]?.line ?? '')).toMatchObject({ module: 'orders', event: 'hecho' })
  })
})
