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
