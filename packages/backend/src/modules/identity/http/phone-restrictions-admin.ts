import {
  AdminPhoneRestrictionsQuerySchema,
  AdminPhoneRestrictionsSchema,
  LiftPhoneRestrictionParamsSchema,
  LiftPhoneRestrictionRequestSchema,
} from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { defineHandler } from '../../../http'
import type { Actor } from '../domain/actor'
import { liftPhoneRestriction, listOpenPhoneRestrictions } from '../infra/phone-restrictions'

function adminId(actor: Actor | null): string {
  if (!actor) throw new DomainError('No autenticado', 'unauthorized')
  return actor.userId
}

export const adminPhoneRestrictionsHandler = defineHandler(
  {
    module: 'identity',
    method: 'GET',
    path: '/api/v1/admin/phone-restrictions',
    auth: 'admin',
    query: AdminPhoneRestrictionsQuerySchema,
    response: AdminPhoneRestrictionsSchema,
  },
  async ({ query, deps }) =>
    AdminPhoneRestrictionsSchema.parse(
      await listOpenPhoneRestrictions(deps.supabase(), deps.clock.now().toISOString(), query.phone),
    ),
)

/** D-63: la excepción se pide por WhatsApp y la levanta un admin con un motivo escrito. */
export const liftPhoneRestrictionHandler = defineHandler(
  {
    module: 'identity',
    method: 'POST',
    path: '/api/v1/admin/phone-restrictions/{id}/lift',
    auth: 'admin',
    params: LiftPhoneRestrictionParamsSchema,
    body: LiftPhoneRestrictionRequestSchema,
    response: 'empty',
  },
  async ({ actor, params, body, deps }) => {
    const result = await liftPhoneRestriction(
      deps.supabase(),
      params.id,
      adminId(actor),
      body.reason,
    )
    if (result === 'not_found') throw new DomainError('Esa restricción no existe', 'not_found')
    if (result === 'already_lifted') {
      throw new DomainError('Esa restricción ya estaba levantada', 'conflict')
    }
  },
)
