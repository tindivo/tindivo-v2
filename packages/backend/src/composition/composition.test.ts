import { describe, expect, it } from 'vitest'
import { configureBackend, getDeps } from '.'

describe('composition', () => {
  it('getDeps lanza un error claro si nadie configuró el backend', () => {
    expect(() => getDeps()).toThrow(/configureBackend/)
  })

  it('tras configurar, getDeps devuelve siempre las mismas dependencias y no crea el cliente hasta usarlo', () => {
    configureBackend({
      supabaseUrl: 'http://127.0.0.1:54321',
      supabaseAnonKey: 'anon',
      supabaseServiceRoleKey: 'service',
    })
    const deps = getDeps()
    expect(getDeps()).toBe(deps)
    expect(deps.supabase()).toBe(deps.supabase())
  })
})
