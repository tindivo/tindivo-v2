import { beforeEach, describe, expect, it } from 'vitest'
import { useCart } from '../cart'

/**
 * El método de entrega dentro de la bolsa.
 *
 * POR QUÉ SE PRUEBA ESTO Y NO EL RESTO DEL CARRITO. Aceptar recojo es de cada
 * negocio (`businesses.accepts_web_pickup`), así que un `deliveryMethod` que
 * sobreviva a un cambio de negocio no da un error visible: da un pedido que se
 * llena entero y revienta con un 409 en el último toque. Es el fallo que no se
 * ve venir, y por eso los cinco caminos que vacían la bolsa se comprueban uno
 * por uno.
 */

const LINEA = {
  itemId: 'item-1',
  name: 'Pollo entero',
  unitPrice: 45,
  quantity: 1,
  modifiers: [],
  note: null,
  hue: 12,
  imageUrl: null,
}

function bolsaCon(businessId: string, businessName = 'La Florencia') {
  useCart.getState().addLine(businessId, businessName, LINEA)
}

beforeEach(() => {
  useCart.getState().clear()
})

describe('deliveryMethod · valor inicial', () => {
  it('arranca en delivery', () => {
    expect(useCart.getState().deliveryMethod).toBe('delivery')
  })
})

describe('deliveryMethod · se conserva donde debe', () => {
  it('sobrevive a añadir otra línea DEL MISMO negocio', () => {
    bolsaCon('biz-1')
    useCart.getState().setDeliveryMethod('pickup')
    useCart.getState().addLine('biz-1', 'La Florencia', { ...LINEA, itemId: 'item-2' })
    expect(useCart.getState().deliveryMethod).toBe('pickup')
  })

  it('sobrevive a cambiar cantidades', () => {
    bolsaCon('biz-1')
    useCart.getState().setDeliveryMethod('pickup')
    const key = useCart.getState().lines[0]?.key
    if (!key) throw new Error('la bolsa debería tener una línea')
    useCart.getState().setQty(key, 3)
    expect(useCart.getState().deliveryMethod).toBe('pickup')
  })

  it('sobrevive a `setQty(0)`, que NO vacía la bolsa', () => {
    // Descubierto escribiendo estas pruebas, y va aquí para que no se vuelva a
    // suponer lo contrario: `setQty` hace `Math.max(1, qty)`, así que pedir cero
    // deja la línea en uno y la bolsa entera de pie. Quien vacía es `remove`.
    // (De paso: la rama «me quedé sin líneas» de `setQty` es inalcanzable.)
    bolsaCon('biz-1')
    useCart.getState().setDeliveryMethod('pickup')
    const key = useCart.getState().lines[0]?.key
    if (!key) throw new Error('la bolsa debería tener una línea')
    useCart.getState().setQty(key, 0)
    expect(useCart.getState().lines).toHaveLength(1)
    expect(useCart.getState().lines[0]?.quantity).toBe(1)
    expect(useCart.getState().deliveryMethod).toBe('pickup')
  })
})

describe('deliveryMethod · se reinicia al quedarse sin negocio', () => {
  it('al añadir de OTRO negocio', () => {
    // El caso que importa: el otro negocio puede no aceptar recojo.
    bolsaCon('biz-1')
    useCart.getState().setDeliveryMethod('pickup')
    bolsaCon('biz-2', 'Pizza Priamo')
    expect(useCart.getState().deliveryMethod).toBe('delivery')
  })

  it('al quitar la última línea', () => {
    bolsaCon('biz-1')
    useCart.getState().setDeliveryMethod('pickup')
    const key = useCart.getState().lines[0]?.key
    if (!key) throw new Error('la bolsa debería tener una línea')
    useCart.getState().remove(key)
    expect(useCart.getState().deliveryMethod).toBe('delivery')
  })

  it('al vaciar con clear()', () => {
    bolsaCon('biz-1')
    useCart.getState().setDeliveryMethod('pickup')
    useCart.getState().clear()
    expect(useCart.getState().deliveryMethod).toBe('delivery')
  })

  it('al repetir un pedido con replace()', () => {
    // «Volver a pedir» puede traer otro negocio, y el pedido repetido no
    // arrastra el método del anterior.
    bolsaCon('biz-1')
    useCart.getState().setDeliveryMethod('pickup')
    useCart.getState().replace('biz-2', 'Pizza Priamo', [LINEA])
    expect(useCart.getState().deliveryMethod).toBe('delivery')
  })
})
