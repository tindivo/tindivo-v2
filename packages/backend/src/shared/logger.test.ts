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
  it('de un Error registra solo kind, un name conocido, un code seguro y archivo:línea:columna', () => {
    const { lines, logger } = capture()
    logger.error('x', { err: leakyError('23505') })
    const line = lines[0]?.line ?? ''
    expectNoLeak(line)
    expect(JSON.parse(line).err).toEqual({
      kind: 'error',
      name: 'PostgrestError',
      code: '23505',
      frames: ['repo.ts:10:5', 'run.ts:3:1'],
    })
  })

  it('acepta como code un SQLSTATE, un PGRST o un code del contrato, y nada más', () => {
    for (const [code, kept] of [
      ['23505', true],
      ['PGRST116', true],
      ['forbidden', true],
      [SECRET, false],
      [`${PHONE} ${EMAIL}`, false],
      ['juanaquispe', false],
    ] as const) {
      const { lines, logger } = capture()
      logger.error('x', { err: leakyError(code) })
      const line = lines[0]?.line ?? ''
      expectNoLeak(line)
      if (kept) expect(JSON.parse(line).err.code).toBe(code)
      else expect(JSON.parse(line).err).not.toHaveProperty('code')
    }
  })

  it('un name desconocido (que puede llevar datos) se registra como Error', () => {
    const { lines, logger } = capture()
    const err = leakyError()
    err.name = `Error de ${EMAIL} ${PHONE}`
    logger.error('x', { err })
    const line = lines[0]?.line ?? ''
    expectNoLeak(line)
    expect(JSON.parse(line).err.name).toBe('Error')
  })

  it('de un frame posterior al mensaje solo queda el archivo, sin carpeta ni función', () => {
    const { lines, logger } = capture()
    const err = new Error('m')
    err.stack = [
      'Error: m',
      `    at ${EMAIL} (/home/${EMAIL}/${SECRET}/app.ts:4:2)`,
      `    at ${PHONE}`,
      `    at Object.<anonymous> (file:///C:/Users/juana/${SECRET}/b.mjs:1:9)`,
    ].join('\n')
    logger.error('x', { err })
    const line = lines[0]?.line ?? ''
    expectNoLeak(line)
    expect(JSON.parse(line).err.frames).toEqual(['app.ts:4:2', 'b.mjs:1:9'])
  })

  it('un objeto plano o una cadena lanzados no dejan su contenido', () => {
    const { lines, logger } = capture()
    logger.error('a', { err: { message: `${EMAIL} ${SECRET}`, details: PHONE, code: '23505' } })
    logger.error('b', { err: `falló ${PHONE} ${EMAIL} ${SECRET}` })
    logger.error('c', { error: { hint: SECRET } })
    const text = lines.map((l) => l.line).join('\n')
    expectNoLeak(text)
    expect(JSON.parse(lines[0]?.line ?? '').err).toEqual({ kind: 'object', code: '23505' })
    expect(JSON.parse(lines[1]?.line ?? '').err).toEqual({ kind: 'string' })
    expect(JSON.parse(lines[2]?.line ?? '').error).toEqual({ kind: 'object' })
  })

  it('describe la cause un nivel, sea o no un Error, y sin su contenido', () => {
    const { lines, logger } = capture()
    const err = new Error('externo', { cause: leakyError('forbidden') })
    err.stack = ['Error: externo', '    at a (/a.ts:1:1)'].join('\n')
    logger.error('x', { err })
    logger.error('y', { err: new Error('externo', { cause: { message: SECRET } }) })
    const text = lines.map((l) => l.line).join('\n')
    expectNoLeak(text)
    const parsed = JSON.parse(lines[0]?.line ?? '')
    expect(parsed.err.frames).toEqual(['a.ts:1:1'])
    expect(parsed.err.cause).toMatchObject({
      kind: 'error',
      name: 'PostgrestError',
      code: 'forbidden',
    })
    expect(parsed.err.cause.frames).toHaveLength(2)
    expect(parsed.err.cause).not.toHaveProperty('cause')
    expect(JSON.parse(lines[1]?.line ?? '').err.cause).toEqual({ kind: 'object' })
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
