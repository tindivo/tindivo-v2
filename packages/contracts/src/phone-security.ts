import { z } from 'zod'

export const PhoneTransferSchema = z.object({
  challengeId: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }),
})

export const TransferCustomerPhoneRequestSchema = z.object({ challengeId: z.uuid() })
export const TransferredCustomerPhoneSchema = z.object({
  verified: z.literal(true),
  phone: z.string().regex(/^[+]519[0-9]{8}$/),
  transferred: z.literal(true),
})

export const CustomerSecurityNoticeSchema = z.object({
  id: z.uuid(),
  kind: z.literal('phone_moved'),
  phoneLast3: z.string().regex(/^[0-9]{3}$/),
  createdAt: z.iso.datetime({ offset: true }),
})
export const CustomerSecurityNoticesSchema = z.array(CustomerSecurityNoticeSchema)
export const CustomerSecurityNoticeParamsSchema = z.object({ id: z.uuid() })
export type CustomerSecurityNotice = z.infer<typeof CustomerSecurityNoticeSchema>

/** Admin: restricción vigente que un número arrastra de otra cuenta (0277, 0278). */
export const AdminPhoneRestrictionSchema = z.object({
  id: z.uuid(),
  phone: z.string().regex(/^9[0-9]{8}$/),
  kind: z.enum(['blocked', 'contraentrega_blocked']),
  until: z.iso.datetime({ offset: true }).nullable(),
  source: z.enum(['transfer', 'replaced', 'account_deleted']),
  createdAt: z.iso.datetime({ offset: true }),
})
export const AdminPhoneRestrictionsSchema = z.array(AdminPhoneRestrictionSchema)
export const AdminPhoneRestrictionsQuerySchema = z.object({
  phone: z
    .string()
    .regex(/^9[0-9]{8}$/)
    .optional(),
})
export const LiftPhoneRestrictionParamsSchema = z.object({ id: z.uuid() })
export const LiftPhoneRestrictionRequestSchema = z.object({
  reason: z.string().trim().min(3).max(300),
})
export type AdminPhoneRestriction = z.infer<typeof AdminPhoneRestrictionSchema>
