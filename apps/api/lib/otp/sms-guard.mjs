/**
 * ¿Este entorno puede mandar SMS REALES? y ¿le falta configuración al límite por
 * número? — una sola definición para el build y para el runtime.
 *
 * Es `.mjs` a propósito: lo importa el script de build (`scripts/check-sms-config.mjs`,
 * Node plano, sin transpilar) y lo importa el código de la API (TypeScript, con
 * su `.d.mts`). Sin dependencias y puro: recibe el entorno, no lee `process.env`.
 *
 * QUÉ ES «PUEDE MANDAR SMS REALES». No lo decide el nombre del entorno
 * (production/preview/development) sino su configuración: `lib/twilio/client.ts`
 * construye el cliente de Twilio —y por tanto envía de verdad— cuando están las
 * tres variables, sea cual sea el entorno; sin ellas el cliente es `null` y el
 * endpoint simula (fuera de producción) o responde 500. Una preview con las
 * credenciales reales es, a efectos de coste y de abuso, producción. Si
 * `client.ts` cambia su condición, esta función cambia con él.
 *
 * Mismo criterio de «presente» que `client.ts`: `.trim()` y no vacío.
 */

/** Las tres que `lib/twilio/client.ts` exige para construir el cliente. */
export const TWILIO_VARS = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID']

/** Las tres que necesita el límite por número (`lib/otp/phone-limit.ts`). */
export const PHONE_LIMIT_VARS = [
  'OTP_PHONE_HMAC_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]

function present(env, name) {
  const v = env[name]
  return typeof v === 'string' && v.trim() !== ''
}

/** @param {Record<string, string | undefined>} env */
export function canSendRealSms(env) {
  return TWILIO_VARS.every((name) => present(env, name))
}

/**
 * Nombres (nunca valores) de las variables del límite por número que faltan.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function missingPhoneLimitConfig(env) {
  return PHONE_LIMIT_VARS.filter((name) => !present(env, name))
}
