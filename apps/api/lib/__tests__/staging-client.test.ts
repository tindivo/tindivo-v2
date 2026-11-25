import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { seedStagingCatalog } from '../../scripts/seed-staging-catalog.ts'
import { createStagingClient } from '../../scripts/staging-client.ts'
import { PROD_REF, STAGING_ORIGIN } from '../../scripts/staging-target.ts'

const KEY = 'clave-de-prueba-que-no-es-real'
const SHA = createHash('sha256').update(KEY, 'utf8').digest('hex')

/** Un cliente "a mano" que registra cualquier acceso: la guardia debe cortar antes de tocarlo. */
function spyClient() {
  const touched = vi.fn()
  const db = new Proxy(
    {},
    {
      get(_t, prop) {
        touched(String(prop))
        return () => {
          throw new Error('no debía llamarse')
        }
      },
    },
  )
  return { db, touched }
}

describe('createStagingClient', () => {
  it('rechaza una URL de producción', () => {
    expect(() => createStagingClient(`https://${PROD_REF}.supabase.co`, KEY, SHA)).toThrow(
      /PRODUCCIÓN/,
    )
  })
  it('rechaza una clave sin la huella registrada', () => {
    expect(() => createStagingClient(STAGING_ORIGIN, 'otra-clave', SHA)).toThrow(/huella/)
  })
  it('acepta staging con la huella registrada', () => {
    expect(createStagingClient(STAGING_ORIGIN, KEY, SHA)).toBeTruthy()
  })
})

describe('seedStagingCatalog: guardia propia', () => {
  it('rechaza un cliente sin huella verificada, sin tocarlo ni activar cuentas', async () => {
    const { db, touched } = spyClient()
    const ensure = vi.fn()
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: se prueba justo el cliente que no es de staging
      seedStagingCatalog(db as any, ensure),
    ).rejects.toThrow(/staging verificado/)
    expect(ensure).not.toHaveBeenCalled()
    expect(touched).not.toHaveBeenCalled()
  })

  it('rechaza un cliente creado a mano contra producción', async () => {
    const prod = createClient(`https://${PROD_REF}.supabase.co`, KEY)
    const ensure = vi.fn()
    await expect(seedStagingCatalog(prod, ensure)).rejects.toThrow(/staging verificado/)
    expect(ensure).not.toHaveBeenCalled()
  })

  it('rechaza un cliente a mano contra staging pero sin huella verificada', async () => {
    const hand = createClient(STAGING_ORIGIN, KEY)
    const ensure = vi.fn()
    await expect(seedStagingCatalog(hand, ensure)).rejects.toThrow(/staging verificado/)
    expect(ensure).not.toHaveBeenCalled()
  })

  it('con un cliente de staging verificado llega a la primera operación permitida', async () => {
    const db = createStagingClient(STAGING_ORIGIN, KEY, SHA)
    const sentinel = new Error('llegó a ensureAuthUser')
    const ensure = vi.fn().mockRejectedValue(sentinel)
    await expect(seedStagingCatalog(db, ensure)).rejects.toBe(sentinel)
    expect(ensure).toHaveBeenCalledTimes(1)
  })
})
