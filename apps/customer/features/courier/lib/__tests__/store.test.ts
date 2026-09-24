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
 * El camino por defecto (sin negocio): `trip` arma los puntos A/B uno a la
 * vez. `confirmPinDrop` con `returnStep: 'trip'` NO pasa por `pin-note` (la
 * referencia se escribe inline en la fila), y `advanceTripPoint` es lo que
 * decide si falta el otro punto o si ya se puede pasar a `trip-details`.
 */
describe('useCourierStore · trip (sin negocio)', () => {
  beforeEach(() => {
    useCourierStore.setState(useCourierStore.getInitialState())
  })

  it('openSheet arranca en trip con el punto A activo', () => {
    useCourierStore.getState().openSheet()
    const s = useCourierStore.getState()
    expect(s.step).toBe('trip')
    expect(s.activeTripPoint).toBe('origin')
  })

  it('confirmPinDrop desde trip vuelve directo a trip, sin pasar por pin-note', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().beginEditPoint('origin')
    useCourierStore.getState().confirmPinDrop({ lat: -9.15, lng: -78.5 }, 12)
    const s = useCourierStore.getState()
    expect(s.step).toBe('trip')
    expect(s.editingPoint).toBeNull()
    expect(s.draft.origin.coordinates).toEqual({ lat: -9.15, lng: -78.5 })
  })

  it('advanceTripPoint pasa de origen a destino cuando falta el punto B', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().updatePoint('origin', {
      coordinates: { lat: -9.15, lng: -78.5 },
      referenceText: 'Frente al mercado',
    })
    useCourierStore.getState().advanceTripPoint()
    const s = useCourierStore.getState()
    expect(s.step).toBe('trip')
    expect(s.activeTripPoint).toBe('destination')
  })

  it('advanceTripPoint pasa a trip-details cuando A y B ya están completos', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().updatePoint('origin', {
      coordinates: { lat: -9.15, lng: -78.5 },
      referenceText: 'Frente al mercado',
    })
    useCourierStore.getState().updatePoint('destination', {
      coordinates: { lat: -9.14, lng: -78.49 },
      referenceText: 'Casa celeste, segundo piso',
    })
    useCourierStore.getState().advanceTripPoint()
    useCourierStore.getState().advanceTripPoint()
    expect(useCourierStore.getState().step).toBe('trip-details')
  })

  it('beginChangePoint limpia el punto y vuelve a trip sin tocar el otro punto', () => {
    useCourierStore.getState().openSheet()
    useCourierStore.getState().updatePoint('origin', {
      coordinates: { lat: -9.15, lng: -78.5 },
      referenceText: 'Frente al mercado',
    })
    useCourierStore.getState().updatePoint('destination', {
      coordinates: { lat: -9.14, lng: -78.49 },
      referenceText: 'Casa celeste, segundo piso',
    })
    useCourierStore.setState({ step: 'trip-details' })

    useCourierStore.getState().beginChangePoint('origin')
    const s = useCourierStore.getState()
    expect(s.step).toBe('trip')
    expect(s.activeTripPoint).toBe('origin')
    expect(s.draft.origin.coordinates).toBeNull()
    expect(s.draft.origin.referenceText).toBe('')
    // El punto B, que ya estaba listo, no se toca.
    expect(s.draft.destination.coordinates).toEqual({ lat: -9.14, lng: -78.49 })
  })
})
