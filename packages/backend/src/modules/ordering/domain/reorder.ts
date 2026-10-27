import {
  checkModifierSelection,
  type ModifierSelectionGroup,
  type ReorderChangeKind,
} from '@tindivo/contracts'

/**
 * D-51: rearmar la bolsa de un pedido anterior con el menú de HOY.
 *
 * El pedido guarda las opciones elegidas solo por nombre (`group_name_snapshot`,
 * `option_name_snapshot`), no por id: se buscan por nombre en el menú actual. Lo
 * que no se puede rearmar sin adivinar —una opción retirada, un nombre que hoy
 * coincide con dos grupos u opciones, un grupo obligatorio nuevo— no entra en la
 * bolsa: va a `choose_again` para que el cliente lo elija de nuevo.
 *
 * Todo el dinero en céntimos enteros. Solo sirve para pintar: la creación del
 * pedido vuelve a decidir precios y disponibilidad.
 */

/** Tope de la nota de una línea al crear el pedido (`CreateOrderItemSchema`). */
const NOTE_MAX = 140

export interface ReorderOriginalLine {
  menuItemId: string | null
  itemName: string
  quantity: number
  note: string | null
  unitPriceCents: number
  modifiers: { groupName: string; optionName: string }[]
}

export interface ReorderMenuOption {
  id: string
  name: string
  priceCents: number
  isAvailable: boolean
}

export interface ReorderMenuGroup extends ModifierSelectionGroup {
  /** En el orden en que el menú las muestra. */
  options: ReorderMenuOption[]
}

export interface ReorderMenuDish {
  id: string
  businessId: string
  name: string
  basePriceCents: number
  isAvailable: boolean
  deleted: boolean
  /** `menu_item_orderable_now`: la misma franja que aplica la creación del pedido. */
  orderableNow: boolean
  imageUrl: string | null
  thumbnailUrl: string | null
  /** Solo los grupos vinculados al plato, en el orden del menú. */
  groups: ReorderMenuGroup[]
}

export interface ReorderLine {
  menuItemId: string
  name: string
  quantity: number
  note: string | null
  basePriceCents: number
  modifiers: { id: string; groupName: string; optionName: string; priceCents: number }[]
  unitPriceCents: number
  imageUrl: string | null
  thumbnailUrl: string | null
}

export interface ReorderChange {
  kind: ReorderChangeKind
  itemName: string
  menuItemId: string | null
  beforeCents: number | null
  afterCents: number | null
}

export interface ReorderPlan {
  items: ReorderLine[]
  changes: ReorderChange[]
}

function change(
  kind: ReorderChangeKind,
  line: ReorderOriginalLine,
  menuItemId: string | null,
  beforeCents: number | null = null,
  afterCents: number | null = null,
): ReorderChange {
  return { kind, itemName: line.itemName, menuItemId, beforeCents, afterCents }
}

/** Las opciones actuales de una línea, o `null` si no se pueden rearmar sin adivinar. */
function matchModifiers(
  dish: ReorderMenuDish,
  chosen: ReorderOriginalLine['modifiers'],
): ReorderLine['modifiers'] | null {
  const picked: { group: number; option: number; value: ReorderLine['modifiers'][number] }[] = []
  for (const { groupName, optionName } of chosen) {
    const groups = dish.groups.filter((g) => g.name === groupName)
    if (groups.length !== 1) return null
    const group = groups[0] as ReorderMenuGroup
    const options = group.options.filter((o) => o.name === optionName)
    if (options.length !== 1) return null
    const option = options[0] as ReorderMenuOption
    if (!option.isAvailable) return null
    picked.push({
      group: dish.groups.indexOf(group),
      option: group.options.indexOf(option),
      value: {
        id: option.id,
        groupName: group.name,
        optionName: option.name,
        priceCents: option.priceCents,
      },
    })
  }
  const optionGroupOf = new Map<string, string>()
  for (const group of dish.groups) {
    for (const option of group.options) optionGroupOf.set(option.id, group.id)
  }
  const ids = picked.map((p) => p.value.id)
  if (checkModifierSelection(dish.groups, ids, optionGroupOf).length > 0) return null
  // En el orden del menú, no en el de inserción: este último no se guarda.
  return picked.sort((a, b) => a.group - b.group || a.option - b.option).map((p) => p.value)
}

export function planReorder(
  businessId: string,
  lines: readonly ReorderOriginalLine[],
  dishes: ReadonlyMap<string, ReorderMenuDish>,
): ReorderPlan {
  const plan: ReorderPlan = { items: [], changes: [] }
  for (const line of lines) {
    const dish = line.menuItemId ? dishes.get(line.menuItemId.toLowerCase()) : undefined
    if (!dish || dish.deleted || dish.businessId !== businessId) {
      plan.changes.push(change('item_removed', line, null))
      continue
    }
    if (!dish.isAvailable || !dish.orderableNow) {
      plan.changes.push(change('item_unavailable', line, dish.id))
      continue
    }
    const note = line.note?.trim() || null
    const modifiers = matchModifiers(dish, line.modifiers)
    if (!modifiers || (note !== null && note.length > NOTE_MAX)) {
      plan.changes.push(change('choose_again', line, dish.id))
      continue
    }
    const unitPriceCents = modifiers.reduce((sum, m) => sum + m.priceCents, dish.basePriceCents)
    plan.items.push({
      menuItemId: dish.id,
      name: dish.name,
      quantity: line.quantity,
      note,
      basePriceCents: dish.basePriceCents,
      modifiers,
      unitPriceCents,
      imageUrl: dish.imageUrl,
      thumbnailUrl: dish.thumbnailUrl,
    })
    if (unitPriceCents !== line.unitPriceCents) {
      plan.changes.push(change('price_changed', line, dish.id, line.unitPriceCents, unitPriceCents))
    }
  }
  return plan
}
