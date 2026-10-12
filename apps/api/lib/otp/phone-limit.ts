import { createHmac } from 'node:crypto'
import { DEFAULT_LIMITS, type LimitRule, type RateLimitStore } from '../http/rate-limit'

/**
 * Límite de envíos de OTP por NÚMERO DE DESTINO (SEC-03). El tope por usuario
 * (`customer_otp_attempts`) no frena a quien crea cuentas gratis para disparar
 * SMS al mismo número ajeno: el contador de aquí cuenta por teléfono, sea quien
 * sea el usuario o la IP.
 *
 * - Almacén: el mismo del límite por IP (Upstash). Se prefiere a un contador en
 *   `customer_otp_attempts` porque esa tabla se vacía por `user_id` al borrar la
 *   cuenta (migración 0259): crear cuenta, pedir SMS, borrarla y repetir
 *   reiniciaría el contador. Aquí el contador sobrevive a la cuenta.
 * - FALLA ABIERTO: sin Upstash (dev, CI) o con Redis caído, el envío pasa. Hoy
 *   está INACTIVO hasta que Jesús defina `UPSTASH_REDIS_REST_URL/TOKEN`; el tope
 *   por usuario sigue vigente mientras tanto.
 * - Umbral: `app_settings.rate_limits.otp_phone` (por defecto 3 en 24 h).
 * - El teléfono no se guarda en claro: la clave es un HMAC-SHA256 con un secreto
 *   del servidor (un hash simple de 9 dígitos se revierte probando todos).
 */

export const OTP_PHONE_DEFAULT: LimitRule = DEFAULT_LIMITS.otp_phone

export function phoneLimitKey(e164: string, secret: string): string {
  return `otp_phone:${createHmac('sha256', secret).update(e164).digest('hex')}`
}

export interface PhoneLimitDeps {
  store: RateLimitStore | null
  rule: LimitRule
  secret: string
}

export type PhoneLimitResult = { allowed: true } | { allowed: false; retryAfterSec: number }

export async function checkOtpPhoneLimit(
  e164: string,
  deps: PhoneLimitDeps,
): Promise<PhoneLimitResult> {
  if (!deps.store) return { allowed: true }
  try {
    const res = await deps.store.hit(phoneLimitKey(e164, deps.secret), deps.rule)
    if (res.allowed) return { allowed: true }
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(res.resetInMs / 1000)) }
  } catch (err) {
    console.error('[otp-phone-limit] almacén no disponible, se deja pasar:', err)
    return { allowed: true }
  }
}
