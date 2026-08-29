import type { ModifierGroup, ModifierOption, RuleMode } from '../types'

export function ruleToMode(g: ModifierGroup): RuleMode {
  if (g.is_required && g.max_selections === 1) return 'required-one'
  if (g.is_required && (g.max_selections ?? 2) > 1) return 'required-many'
  if (!g.is_required && g.max_selections === 1) return 'optional-one'
  return 'optional-many'
}

export function modeToRule(
  mode: RuleMode,
  prevMax: number | null,
): Pick<ModifierGroup, 'is_required' | 'min_selections' | 'max_selections' | 'selection_type'> {
  switch (mode) {
    case 'required-one':
      return { is_required: true, min_selections: 1, max_selections: 1, selection_type: 'single' }
    case 'required-many':
      return {
        is_required: true,
        min_selections: 1,
        max_selections: prevMax && prevMax > 1 ? prevMax : 3,
        selection_type: 'multi',
      }
    case 'optional-one':
      return { is_required: false, min_selections: 0, max_selections: 1, selection_type: 'single' }
    case 'optional-many':
      return {
        is_required: false,
        min_selections: 0,
        max_selections: prevMax && prevMax > 1 ? prevMax : 3,
        selection_type: 'multi',
      }
  }
}

export function groupRuleLabel(g: ModifierGroup): string {
  if (g.is_required) {
    if (g.max_selections === 1) return 'Obligatorio · elegir 1'
    return `Obligatorio · elegir ${g.min_selections}–${g.max_selections ?? '?'}`
  }
  if (g.max_selections === 1) return 'Opcional · elegir 1'
  return `Opcional · hasta ${g.max_selections ?? '?'}`
}

/** Los precios se editan en soles con dos decimales; el resto es basura de coma flotante. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Un grupo solo puede cobrar en modo "precio total" si es obligatorio y de
 * elegir 1. En un grupo opcional, no elegir nada dejaría el plato al precio de
 * la opción más barata sin que el cliente la haya pedido; y con selección
 * múltiple no hay un único precio que mostrar.
 */
export function acceptsTotalPricing(g: ModifierGroup): boolean {
  return g.is_required && g.selection_type === 'single' && g.max_selections === 1
}

/** El grupo (visible, con opciones) que manda sobre el precio base del plato. */
export function findTotalPricingGroup(groups: ModifierGroup[]): ModifierGroup | undefined {
  return groups.find(
    (g) => !g.isDeleted && g.price_display === 'total' && g.options.some((o) => !o.isDeleted),
  )
}

/** Lo que el negocio ve en la fila de la opción: delta o precio final. */
export function optionDisplayPrice(
  basePrice: number,
  group: ModifierGroup,
  opt: ModifierOption,
): number {
  return group.price_display === 'total'
    ? round2(basePrice + opt.additional_price)
    : opt.additional_price
}

/**
 * Traduce los precios finales que escribió el negocio a (precio base, deltas).
 *
 * El base pasa a ser el más barato del grupo, así ningún delta sale negativo
 * —cosa que la DB aceptaría y que dejaría un plato más barato que su propio
 * precio base— y el "Desde S/ x" del catálogo es un precio que de verdad se
 * puede pagar.
 *
 * `fallbackBase` cubre el grupo que se queda sin opciones: sin él, borrar la
 * última opción pondría el plato a S/ 0.
 */
export function applyTotalPrices(
  group: ModifierGroup,
  totals: Map<string, number>,
  fallbackBase: number,
): { basePrice: number; group: ModifierGroup } {
  const values = [...totals.values()]
  const basePrice = values.length > 0 ? round2(Math.min(...values)) : fallbackBase
  return {
    basePrice,
    group: {
      ...group,
      options: group.options.map((o) => {
        const total = totals.get(o.localId)
        if (o.isDeleted || total === undefined) return o
        return { ...o, additional_price: round2(total - basePrice) }
      }),
    },
  }
}

/** Precios finales actuales de un grupo, listos para editar y volver a normalizar. */
export function currentTotals(basePrice: number, group: ModifierGroup): Map<string, number> {
  const totals = new Map<string, number>()
  for (const o of group.options) {
    if (!o.isDeleted) totals.set(o.localId, round2(basePrice + o.additional_price))
  }
  return totals
}

export function itemMinPrice(basePrice: number, groups: ModifierGroup[]): number {
  let extra = 0
  for (const g of groups) {
    if (!g.isDeleted && g.is_required && g.options.length > 0) {
      const prices = g.options.filter((o) => !o.isDeleted).map((o) => o.additional_price)
      if (prices.length > 0) {
        extra += Math.min(...prices)
      }
    }
  }
  return basePrice + extra
}

export function itemMaxPrice(basePrice: number, groups: ModifierGroup[]): number {
  let extra = 0
  for (const g of groups) {
    if (!g.isDeleted) {
      const sorted = g.options
        .filter((o) => !o.isDeleted && o.additional_price > 0)
        .map((o) => o.additional_price)
        .sort((a, b) => b - a)
      const maxSel = g.max_selections ?? sorted.length
      extra += sorted.slice(0, maxSel).reduce((a, b) => a + b, 0)
    }
  }
  return basePrice + extra
}

export function priceWarning(
  basePrice: number,
  groups: ModifierGroup[],
): { current: number; suggested: number; groupName: string; delta: number } | null {
  // Con un grupo en modo "precio total" el base ya no lo escribe el negocio:
  // lo fija la opción más barata. Aconsejarle que lo cambie sería pedirle algo
  // que el formulario no le deja hacer.
  if (findTotalPricingGroup(groups)) return null
  const mainGroup = groups.find((g) => !g.isDeleted && g.is_required && g.min_selections >= 1)
  if (!mainGroup) return null
  const prices = mainGroup.options.filter((o) => !o.isDeleted).map((o) => o.additional_price)
  if (prices.length === 0) return null
  const cheapest = Math.min(...prices)
  if (cheapest === 0) return null
  return {
    current: basePrice,
    suggested: basePrice + cheapest,
    groupName: mainGroup.name,
    delta: cheapest,
  }
}

export function makeLocalId() {
  return Math.random().toString(36).slice(2)
}

/**
 * ¿Este grupo se edita desde el plato, o solo se mira?
 *
 * `menu_modifier_groups` y `menu_modifier_options` cuelgan del NEGOCIO
 * (`business_id`), no del plato. El plato solo tiene una fila en la tabla
 * puente `menu_item_modifier_groups`. O sea que escribir el contenido de un
 * grupo desde el editor de un plato se lo escribe a TODOS los platos que lo
 * usen.
 *
 * Eso no fue un problema mientras no se podían compartir grupos —en prod los 68
 * grupos de los cuatro negocios están cada uno en un solo plato—, pero el modal
 * de «Vincular grupo de Extras» es exactamente lo que los vuelve compartidos.
 * El bug se activa con el primer uso de esa función.
 *
 * `sharedWith` cuenta los OTROS platos (se calcula al cargar restando este), así
 * que cero significa «este grupo es de este plato y de nadie más».
 *
 * Ojo: esto NO decide si se puede desenlazar. Quitar el grupo del plato es una
 * decisión de este plato y siempre se puede; lo que no se puede es cambiarle el
 * nombre, las reglas o las opciones a algo que es de otros.
 */
export function grupoEditableDesdeElPlato(
  group: Pick<ModifierGroup, 'sharedWith' | 'isLibrary'>,
): boolean {
  // Dos motivos distintos para no dejar editar aquí, y conviene no mezclarlos
  // al explicárselo al dueño (ver `motivoDeSoloLectura`):
  //
  //   · lo usan otros platos  -> editarlo aquí se los cambia a ellos. Es el
  //     que evita corromper datos.
  //   · está en la biblioteca -> aunque hoy lo use un solo plato, es un grupo
  //     del negocio y su sitio de edición es Extras. Si se editara aquí, el día
  //     que se vincule a cinco platos más el cambio ya habría viajado con él.
  if ((group.sharedWith ?? 0) > 0) return false
  if (group.isLibrary) return false
  return true
}

/** Por qué este grupo no se edita desde el plato, o `null` si sí se edita. */
export function motivoDeSoloLectura(
  group: Pick<ModifierGroup, 'sharedWith' | 'isLibrary'>,
): 'compartido' | 'biblioteca' | null {
  if ((group.sharedWith ?? 0) > 0) return 'compartido'
  if (group.isLibrary) return 'biblioteca'
  return null
}
