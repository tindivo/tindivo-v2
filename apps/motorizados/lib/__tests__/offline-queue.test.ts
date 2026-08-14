import { beforeEach, describe, expect, it, vi } from 'vitest'

// `offline-queue` habla con localStorage al importarse en el navegador; en el
// runner no existe, así que se le pone uno de mentira antes de importarlo.
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
})

const { enqueue, getOptimistic, reconcileOptimistic, remove, setOptimistic } = await import(
  '../offline-queue'
)

const queued = (orderId: string, key: string) => ({
  key,
  orderId,
  action: 'take',
  params: {},
  ts: Date.now(),
})

describe('reconcileOptimistic', () => {
  beforeEach(() => store.clear())

  it('borra el optimista que se quedó sin transición encolada', () => {
    // El caso real: la API estaba caída, se encoló el "take", el item se
    // descartó después y el optimista quedó pegado. Con él, el pedido no es
    // `waiting_driver` (sale de disponibles) ni tiene driver_id (no es mío):
    // desaparece del board y nadie lo puede tomar.
    setOptimistic('ord-1', 'heading_to_restaurant')
    expect(reconcileOptimistic()).toBe(1)
    expect(getOptimistic()).toEqual({})
  })

  it('respeta el optimista que sí tiene su transición pendiente', () => {
    enqueue(queued('ord-1', 'k1'))
    setOptimistic('ord-1', 'heading_to_restaurant')
    expect(reconcileOptimistic()).toBe(0)
    expect(getOptimistic()).toEqual({ 'ord-1': 'heading_to_restaurant' })
  })

  it('limpia solo los huérfanos y deja el resto', () => {
    enqueue(queued('ord-vivo', 'k1'))
    setOptimistic('ord-vivo', 'picked_up')
    setOptimistic('ord-fantasma', 'heading_to_restaurant')
    expect(reconcileOptimistic()).toBe(1)
    expect(getOptimistic()).toEqual({ 'ord-vivo': 'picked_up' })
  })

  it('al quitar la transición, su optimista deja de estar protegido', () => {
    enqueue(queued('ord-1', 'k1'))
    setOptimistic('ord-1', 'heading_to_restaurant')
    remove('k1')
    expect(reconcileOptimistic()).toBe(1)
    expect(getOptimistic()).toEqual({})
  })

  it('sin nada guardado no rompe ni inventa trabajo', () => {
    expect(reconcileOptimistic()).toBe(0)
    expect(getOptimistic()).toEqual({})
  })
})
