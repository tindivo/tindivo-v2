import { UuidSchema } from '@tindivo/contracts'
import { CustomerReorderSchema } from '@tindivo/contracts/openapi'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { defineHandler } from '../../../http'
import { planReorder } from '../domain/reorder'
import { loadReorderSource } from '../infra/reorder-source'

const text = (cents: number): string => (cents / 100).toFixed(2)
const textOrNull = (cents: number | null): string | null => (cents === null ? null : text(cents))

/** D-51: la bolsa de un pedido propio con el menú de hoy. Solo lectura. */
export const reorderHandler = defineHandler(
  {
    module: 'ordering',
    method: 'GET',
    path: '/api/v1/customer/orders/{id}/reorder',
    auth: 'user',
    params: z.object({ id: UuidSchema }),
    response: CustomerReorderSchema,
  },
  async ({ actor, params, deps }) => {
    if (!actor) throw new DomainError('No autenticado', 'unauthorized')
    if (!actor.roles.includes('customer')) throw new DomainError('No autorizado', 'forbidden')
    const source = await loadReorderSource(deps.supabase(), params.id.toLowerCase(), actor.userId)
    if (!source) throw new DomainError('Ese pedido no existe', 'not_found')
    const plan = planReorder(source.businessId, source.lines, source.dishes)
    return {
      orderId: source.orderId,
      businessId: source.businessId,
      businessName: source.businessName,
      items: plan.items.map((i) => ({
        menuItemId: i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        note: i.note,
        basePrice: text(i.basePriceCents),
        modifiers: i.modifiers.map((m) => ({
          id: m.id,
          groupName: m.groupName,
          optionName: m.optionName,
          price: text(m.priceCents),
        })),
        unitPrice: text(i.unitPriceCents),
        imageUrl: i.imageUrl,
        thumbnailUrl: i.thumbnailUrl,
      })),
      changes: plan.changes.map((c) => ({
        kind: c.kind,
        itemName: c.itemName,
        menuItemId: c.menuItemId,
        before: textOrNull(c.beforeCents),
        after: textOrNull(c.afterCents),
      })),
    }
  },
)
