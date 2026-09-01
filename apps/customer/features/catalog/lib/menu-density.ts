import type { ProductLine } from '@/features/catalog/hooks/use-product-options'
import type { Category, MenuItem, ProductItem } from '@/features/catalog/types'

/**
 * Cómo se dibuja una sección de la carta: con tarjeta o como lista.
 *
 * LA REGLA: lista compacta solo si la sección no tiene NINGUNA foto Y NINGUNA
 * descripción. En cualquier otro caso, tarjeta.
 *
 * Las dos condiciones, no una. Con «sin foto» a secas, «Pan al ajo» de Pizza
 * Priamo —tres platos sin foto pero con descripción— perdería el texto que es
 * justamente lo que los vende. Si no hay ni imagen ni texto, el nombre ES el
 * producto entero («Inca Kola - 1.5 L») y una fila de 50 px lo dice todo,
 * mientras que la tarjeta gasta 134 px para enseñar un recuadro rayado con el
 * mismo nombre repetido dentro.
 *
 * Se calcula en cada render a partir del propio contenido: no hay casilla que
 * marcar en el panel de negocios, y en cuanto suban una foto la sección vuelve
 * a tarjetas sola. En producción hoy se dispara en cinco secciones y 31 platos
 * (Adicionales, Infusiones y Bebidas de La Florencia; Pasta y Bebidas de Pizza
 * Priamo).
 *
 * El riesgo conocido: un negocio que suba su carta entera sin fotos ni
 * descripciones la vería toda como lista. Hoy no pasa en ninguno de los
 * cuatro, y si pasara la respuesta no es tocar este umbral, es pedirle las
 * fotos al darlo de alta.
 */
export function isCompactSection(category: Category): boolean {
  if (category.items.length === 0) return false
  return category.items.every((i) => !i.image_url && !i.description?.trim())
}

/** Un plato sin grupos de opciones no tiene nada que preguntar. */
export function hasOptions(item: Pick<ProductItem, 'modifier_groups'>): boolean {
  return (item.modifier_groups ?? []).some((g) => g.options.length > 0)
}

/**
 * La línea de carrito de un plato que no hay que configurar.
 *
 * Existe para que el «+» de un agua mineral añada de verdad en vez de abrir un
 * modal vacío en el que lo único que se puede hacer es volver a pulsar
 * «Agregar». Devuelve exactamente la misma forma que `buildLine()` del modal,
 * con las opciones vacías y sin nota.
 */
export function plainLine(item: MenuItem): ProductLine {
  return {
    itemId: item.id,
    name: item.name,
    unitPrice: item.base_price,
    quantity: 1,
    modifiers: [],
    note: null,
    hue: item.image_hue ?? 14,
    imageUrl: item.image_url,
  }
}
