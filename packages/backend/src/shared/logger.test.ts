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

  it('serializa errores con nombre y mensaje, y tolera referencias circulares', () => {
    const { lines, logger } = capture()
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    logger.error('x', { err: new Error('boom'), circular })
    const parsed = JSON.parse(lines[0]?.line ?? '')
    expect(parsed.err.message).toBe('boom')
    expect(parsed.circular.self).toBe('[truncado]')
  })
})
