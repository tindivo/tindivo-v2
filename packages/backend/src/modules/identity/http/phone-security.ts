import {
  CustomerSecurityNoticeParamsSchema,
  CustomerSecurityNoticesSchema,
  TransferCustomerPhoneRequestSchema,
  TransferredCustomerPhoneSchema,
} from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { defineHandler, problem } from '../../../http'
import type { Actor } from '../domain/actor'
import {
  listCustomerSecurityNotices,
  type PhoneClaimResult,
  seeCustomerSecurityNotice,
  transferCustomerPhone,
} from '../infra/customer-phone'
import { loadPhoneSettings } from '../infra/phone-settings'

function customerId(actor: Actor | null): string {
  if (!actor) throw new DomainError('No autenticado', 'unauthorized')
  if (!actor.roles.includes('customer')) throw new DomainError('No autorizado', 'forbidden')
  return actor.userId
}

/** Lo reconoce la app por texto (vector `celular-otra-cuenta.json`); si se reabre el traslado, el error lleva un `code`. */
export const PHONE_OTHER_ACCOUNT_DETAIL = 'Este número ya está asociado a otra cuenta.'
export const PHONE_WAIT_DETAIL = 'Ese número tiene un pedido en curso. Intenta cuando termine.'
export const PHONE_INVALID_DETAIL = 'El código ya no sirve. Pide uno nuevo.'

/**
 * Conserva el 409 y el detalle existentes. El desafío de traslado solo se añade si `offerTransfer` (el celular de otra
 * cuenta lo resuelve soporte por WhatsApp en el lanzamiento, CUS-AUT-028).
 */
export function phoneClaimProblem(
  result: PhoneClaimResult,
  requestId: string,
  headers: Record<string, string>,
  options: { offerTransfer?: boolean } = {},
): Response | null {
  if (result.status === 'verified' || result.status === 'transferred') return null
  return problem('conflict', {
    detail:
      result.status === 'profile_missing'
        ? 'Completa tu nombre antes de verificar tu número.'
        : result.status === 'wait_active'
          ? PHONE_WAIT_DETAIL
          : result.status === 'challenge_invalid'
            ? PHONE_INVALID_DETAIL
            : PHONE_OTHER_ACCOUNT_DETAIL,
    ...(options.offerTransfer && result.status === 'transfer_required' && result.challengeId
      ? {
          transfer: { challengeId: result.challengeId, expiresAt: result.expiresAt },
        }
      : {}),
    requestId,
    headers,
  })
}

export const transferPhoneHandler = defineHandler(
  {
    module: 'identity',
    method: 'POST',
    path: '/api/v1/customer/phone/transfer',
    auth: 'user',
    body: TransferCustomerPhoneRequestSchema,
    response: TransferredCustomerPhoneSchema,
  },
  async ({ actor, body, deps }) => {
    if (!(await loadPhoneSettings(deps.supabase())).transferEnabled) {
      throw new DomainError(PHONE_OTHER_ACCOUNT_DETAIL, 'conflict')
    }
    const { result, phone } = await transferCustomerPhone(
      deps.supabase(),
      customerId(actor),
      body.challengeId,
    )
    if (result.status !== 'transferred' || !phone) {
      throw new DomainError(
        result.status === 'wait_active' ? PHONE_WAIT_DETAIL : PHONE_INVALID_DETAIL,
        'conflict',
      )
    }
    return { verified: true as const, phone, transferred: true as const }
  },
)

export const securityNoticesHandler = defineHandler(
  {
    module: 'identity',
    method: 'GET',
    path: '/api/v1/customer/security-notices',
    auth: 'user',
    response: CustomerSecurityNoticesSchema,
  },
  async ({ actor, deps }) =>
    CustomerSecurityNoticesSchema.parse(
      await listCustomerSecurityNotices(deps.supabase(), customerId(actor)),
    ),
)

export const seeSecurityNoticeHandler = defineHandler(
  {
    module: 'identity',
    method: 'POST',
    path: '/api/v1/customer/security-notices/{id}/seen',
    auth: 'user',
    params: CustomerSecurityNoticeParamsSchema,
    response: 'empty',
  },
  async ({ actor, params, deps }) => {
    await seeCustomerSecurityNotice(
      deps.supabase(),
      customerId(actor),
      params.id,
      deps.clock.now().toISOString(),
    )
  },
)
