import { beforeEach, describe, expect, it } from 'vitest'
import { useCourierStore } from '../store'

/**
 * El subflujo de pin-drop (`beginEditPoint` → `confirmPinDrop` →
 * `confirmPinNote`) es el que reemplaza el `<MapPicker>` embebido que tenía
 * `PointField`. Se prueba aparte del componente porque es la única lógica
 * nueva de verdad: guarda la coordenada al fijar el pin, el texto al escribir
 * la referencia, y vuelve exactamente al paso de origen.
 */
describe('useCourierStore · pin-drop', () => {
  beforeEach(() => {
    useCourierStore.setState(useCourierStore.getInitialState())
  })

  it('beginEditPoint recuerda el paso de origen y abre pin-drop', () => {
    useCourierStore.setState({ step: 'confirm' })
    useCourierStore.getState().beginEditPoint('destination')
    const s = useCourierStore.getState()
    expect(s.step).toBe('pin-drop')
    expect(s.editingPoint).toBe('destination')
    expect(s.returnStep).toBe('confirm')
  })

  it('confirmPinDrop guarda la coordenada en el punto que se está editando y pasa a pin-note', () => {
    useCourierStore.setState({ step: 'confirm' })
    useCourierStore.getState().beginEditPoint('origin')
    useCourierStore.getState().confirmPinDrop({ lat: -9.15, lng: -78.5 }, 12)
    const s = useCourierStore.getState()
    expect(s.step).toBe('pin-note')
    expect(s.draft.origin.coordinates).toEqual({ lat: -9.15, lng: -78.5 })
    expect(s.draft.origin.accuracyM).toBe(12)
    // El otro punto no se toca.
    expect(s.draft.destination.coordinates).toBeNull()
  })

  it('confirmPinNote guarda el texto y vuelve exactamente al paso de origen', () => {
    useCourierStore.setState({ step: 'trip-details' })
    useCourierStore.getState().beginEditPoint('destination')
    useCourierStore.getState().confirmPinDrop({ lat: -9.14, lng: -78.49 }, null)
    useCourierStore.getState().confirmPinNote('Casa celeste, segundo piso')
    const s = useCourierStore.getState()
    expect(s.step).toBe('trip-details')
    expect(s.draft.destination.referenceText).toBe('Casa celeste, segundo piso')
    expect(s.editingPoint).toBeNull()
    expect(s.returnStep).toBeNull()
  })

  it('cancelEditPoint vuelve sin tocar el borrador', () => {
    useCourierStore.setState({ step: 'route' })
    useCourierStore.getState().beginEditPoint('origin')
    useCourierStore.getState().cancelEditPoint()
    const s = useCourierStore.getState()
    expect(s.step).toBe('route')
    expect(s.editingPoint).toBeNull()
    expect(s.draft.origin.coordinates).toBeNull()
  })
})

/**
 * El camino por defecto (sin negocio) es mapa primero: `openSheet` abre directo
 * el pin del punto A, y `confirmPinDrop` con la referencia decide solo si falta
 * el otro punto (→ pin de B) o si ya se puede pasar a `trip-details`.
 */
describe('useCourierStore · mapa primero (sin negocio)', () => {
  const A = { lat: -9.15, lng: -78.5 }
  const B = { lat: -9.14, lng: -78.49 }

  beforeEach(() => {
    useCourierStore.setState(useCourierStore.getInitialState())
  })

  it('openSheet arranca directo en el pin del punto A', () => {
    useCourierStore.getState().openSheet()
    const s = useCourierStore.getState()
    expect(s.open).toBe(true)
    expect(s.step).toBe('pin-drop')
    expect(s.editingPoint).toBe('origin')
    expect(s.returnStep).toBe('trip-details')
  })

  it('confirmar A con su referencia pasa al pin de B, sin salir de pin-drop', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().confirmPinDrop(A, 12, 'Frente al mercado')
    const s = useCourierStore.getState()
    expect(s.step).toBe('pin-drop')
    expect(s.editingPoint).toBe('destination')
    expect(s.draft.origin.coordinates).toEqual(A)
    expect(s.draft.origin.referenceText).toBe('Frente al mercado')
  })

  it('confirmar B con su referencia pasa a trip-details', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().confirmPinDrop(A, 12, 'Frente al mercado')
    useCourierStore.getState().confirmPinDrop(B, null, 'Casa celeste, segundo piso')
    const s = useCourierStore.getState()
    expect(s.step).toBe('trip-details')
    expect(s.editingPoint).toBeNull()
    expect(s.returnStep).toBeNull()
    expect(s.draft.destination.referenceText).toBe('Casa celeste, segundo piso')
  })

  it('atrás desde B vuelve al pin de A sin perder lo ya escrito', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().confirmPinDrop(A, 12, 'Frente al mercado')
    useCourierStore.getState().cancelEditPoint()
    const s = useCourierStore.getState()
    expect(s.step).toBe('pin-drop')
    expect(s.editingPoint).toBe('origin')
    expect(s.draft.origin.coordinates).toEqual(A)
  })

  it('atrás desde A, todavía sin nada, cierra el flujo', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().cancelEditPoint()
    const s = useCourierStore.getState()
    expect(s.open).toBe(false)
    expect(s.editingPoint).toBeNull()
  })

  it('corregir un punto desde trip-details vuelve ahí, con el otro punto intacto', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().confirmPinDrop(A, 12, 'Frente al mercado')
    useCourierStore.getState().confirmPinDrop(B, null, 'Casa celeste, segundo piso')

    useCourierStore.getState().beginEditPoint('origin')
    let s = useCourierStore.getState()
    expect(s.step).toBe('pin-drop')
    expect(s.returnStep).toBe('trip-details')

    const A2 = { lat: -9.151, lng: -78.501 }
    useCourierStore.getState().confirmPinDrop(A2, null, 'Puerta azul, frente al mercado')
    s = useCourierStore.getState()
    expect(s.step).toBe('trip-details')
    expect(s.draft.origin.coordinates).toEqual(A2)
    expect(s.draft.origin.referenceText).toBe('Puerta azul, frente al mercado')
    expect(s.draft.destination.coordinates).toEqual(B)
  })

  it('cancelar la corrección desde trip-details no toca nada', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().confirmPinDrop(A, 12, 'Frente al mercado')
    useCourierStore.getState().confirmPinDrop(B, null, 'Casa celeste, segundo piso')
    useCourierStore.getState().beginEditPoint('destination')
    useCourierStore.getState().cancelEditPoint()
    const s = useCourierStore.getState()
    expect(s.step).toBe('trip-details')
    expect(s.draft.destination.coordinates).toEqual(B)
  })

  it('de B se puede volver a A sin perder lo que ya se había escrito en B', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().confirmPinDrop(A, 12, 'Frente al mercado')
    useCourierStore.getState().switchEditingPoint('origin', { referenceText: 'Casa celeste' })
    let s = useCourierStore.getState()
    expect(s.step).toBe('pin-drop')
    expect(s.editingPoint).toBe('origin')
    expect(s.draft.destination.referenceText).toBe('Casa celeste')
    expect(s.draft.destination.coordinates).toBeNull()

    // Corregir A y confirmar lleva otra vez a B (que sigue incompleto).
    useCourierStore.getState().confirmPinDrop(A, null, 'Puerta azul, frente al mercado')
    s = useCourierStore.getState()
    expect(s.editingPoint).toBe('destination')
    expect(s.draft.origin.referenceText).toBe('Puerta azul, frente al mercado')
  })

  it('si B ya estaba completo al saltar a A, confirmar A pasa directo a trip-details', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().confirmPinDrop(A, 12, 'Frente al mercado')
    useCourierStore.getState().switchEditingPoint('origin', {
      coordinates: B,
      referenceText: 'Casa celeste, segundo piso',
    })
    useCourierStore.getState().confirmPinDrop(A, null, 'Frente al mercado')
    expect(useCourierStore.getState().step).toBe('trip-details')
  })
})
