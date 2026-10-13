export const TWILIO_VARS: readonly string[]
export const PHONE_LIMIT_VARS: readonly string[]
export function canSendRealSms(env: Record<string, string | undefined>): boolean
export function missingPhoneLimitConfig(env: Record<string, string | undefined>): string[]
