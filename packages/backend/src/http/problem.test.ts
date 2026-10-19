import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleError } from './problem'

describe('handleError', () => {
  afterEach(() => vi.restoreAllMocks())

  it('responde un 500 genérico y no deja el message ni el stack del error en el log', async () => {
    const written: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })
    const err = new Error('falló +51 987 654 321 juana@example.pe sk_live_abc123', {
      cause: new Error('causa +51 987 654 321'),
    })
    err.name = 'PostgrestError'
    err.stack = `PostgrestError: ${err.message}\n    at insertar (/app/repo.ts:10:5)`
    const res = handleError(err, 'req-1')
    expect(res.status).toBe(500)
    const body = await res.text()
    const log = written.join('')
    for (const text of [body, log]) {
      expect(text).not.toContain('987 654 321')
      expect(text).not.toContain('juana@example.pe')
      expect(text).not.toContain('sk_live_abc123')
    }
    expect(log).toContain('unhandled_error')
    expect(log).toContain('PostgrestError')
    expect(log).toContain('repo.ts:10:5')
  })

  it('con un objeto plano o una cadena lanzados tampoco deja su contenido', async () => {
    const written: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })
    for (const thrown of [
      { message: 'juana@example.pe sk_live_abc123', details: '+51 987 654 321', code: '23505' },
      'falló +51 987 654 321 juana@example.pe sk_live_abc123',
    ]) {
      const res = handleError(thrown, 'req-2')
      expect(res.status).toBe(500)
      const body = await res.text()
      for (const text of [body, written.join('')]) {
        expect(text).not.toContain('987 654 321')
        expect(text).not.toContain('juana@example.pe')
        expect(text).not.toContain('sk_live_abc123')
      }
    }
    expect(written.join('')).toContain('"code":"23505"')
  })
})
