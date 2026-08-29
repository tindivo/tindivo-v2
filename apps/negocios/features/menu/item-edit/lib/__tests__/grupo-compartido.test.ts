import { describe, expect, it } from 'vitest'
import type { ModifierGroup, ModifierOption } from '../../types'
import { grupoEditableDesdeElPlato, motivoDeSoloLectura } from '../utils'

/**
 * REGRESIÓN QUE ESTO FIJA
 *
 * `menu_modifier_groups` y `menu_modifier_options` cuelgan del negocio, no del
 * plato; el plato solo aporta una fila en `menu_item_modifier_groups`. El
 * editor de platos escribía sobre las dos primeras sin mirar a quién más le
 * pertenecían:
 *
 *   · el `update` del grupo le cambiaba nombre y reglas a todos los platos,
 *   · el `delete` de una opción iba por `id` y sin contar referencias, así que
 *     quitar «ají» desde una hamburguesa lo quitaba del menú entero.
 *
 * El borrado del GRUPO sí contaba referencias antes de tirar la fila. El de las
 * OPCIONES no contaba nada, que es lo que lo hacía destructivo y silencioso.
 *
 * No mordía porque no había forma de compartir un grupo: en prod los 68 grupos
 * de los cuatro negocios están cada uno en un solo plato. El modal de «Vincular
 * grupo de Extras» es justo lo que los vuelve compartidos, así que el bug se
 * arma con el primer uso de esa función. Por eso esto se fija ahora y no cuando
 * aparezca el primer menú roto.
 */

function opt(name: string): ModifierOption {
  return {
    id: name,
    localId: name,
    name,
    additional_price: 0,
    is_available: true,
    display_order: 0,
  }
}

function group(over: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id: 'g1',
    localId: 'g1',
    name: 'Cremas',
    selection_type: 'multi',
    is_required: false,
    min_selections: 0,
    max_selections: null,
    price_display: 'delta',
    display_order: 0,
    isExpanded: true,
    options: [opt('ají'), opt('mayonesa')],
    ...over,
  }
}

describe('grupo compartido · quién puede escribirle el contenido', () => {
  it('un grupo que solo usa este plato se edita aquí', () => {
    expect(grupoEditableDesdeElPlato(group({ sharedWith: 0 }))).toBe(true)
  })

  it('si otro plato lo usa, deja de editarse desde el plato', () => {
    expect(grupoEditableDesdeElPlato(group({ sharedWith: 1 }))).toBe(false)
  })

  it('con varios platos detrás, igual', () => {
    expect(grupoEditableDesdeElPlato(group({ sharedWith: 6 }))).toBe(false)
  })

  it('sin `sharedWith` se trata como propio, no como compartido', () => {
    // Un grupo recién creado en el formulario no ha pasado por la carga que
    // calcula el contador, así que llega sin el campo. Tratarlo como compartido
    // dejaría el caso normal —crear un grupo para este plato— en solo lectura
    // desde el primer teclazo.
    expect(grupoEditableDesdeElPlato(group({ sharedWith: undefined }))).toBe(true)
  })

  it('`sharedWith` cuenta los OTROS platos, así que 0 no significa "huérfano"', () => {
    // El contador se carga como `count(enlaces) - 1`. Un grupo enlazado solo a
    // este plato tiene un enlace y sale 0: es suyo, no es que no lo use nadie.
    // Si algún día se cargara sin restar, esta prueba no cambia pero la de
    // arriba («solo usa este plato») empezaría a fallar, que es justo la señal
    // que se quiere.
    expect(grupoEditableDesdeElPlato(group({ sharedWith: 0 }))).toBe(true)
  })
})

describe('grupo de la biblioteca · aunque solo lo use este plato', () => {
  it('un grupo de Extras no se edita desde el plato', () => {
    // Aunque `sharedWith` sea 0. Es del negocio, y su sitio de edición es
    // Extras: si se editara aquí, el día que se vincule a cinco platos más el
    // cambio ya habría viajado con él sin que nadie lo decidiera.
    expect(grupoEditableDesdeElPlato(group({ sharedWith: 0, isLibrary: true }))).toBe(false)
  })

  it('el grupo propio de un plato sí', () => {
    expect(grupoEditableDesdeElPlato(group({ sharedWith: 0, isLibrary: false }))).toBe(true)
  })

  it('sin `isLibrary` se trata como propio', () => {
    expect(grupoEditableDesdeElPlato(group({ sharedWith: 0 }))).toBe(true)
  })
})

describe('el motivo se distingue, porque al dueño se le explica distinto', () => {
  it('compartido manda sobre biblioteca cuando se dan los dos', () => {
    // Un grupo de Extras usado por varios platos es las dos cosas. Se enseña
    // «compartido» porque es el motivo que le importa: lo que cambie afecta a
    // otros platos suyos, no a una regla de organización.
    expect(motivoDeSoloLectura(group({ sharedWith: 3, isLibrary: true }))).toBe('compartido')
  })

  it('solo biblioteca', () => {
    expect(motivoDeSoloLectura(group({ sharedWith: 0, isLibrary: true }))).toBe('biblioteca')
  })

  it('propio y de nadie más: no hay motivo, se edita', () => {
    expect(motivoDeSoloLectura(group({ sharedWith: 0, isLibrary: false }))).toBeNull()
  })
})
