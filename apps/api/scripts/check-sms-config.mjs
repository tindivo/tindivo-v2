#!/usr/bin/env node
/**
 * Puerta de BUILD del límite de OTP por número (SEC-03).
 *
 *   node scripts/check-sms-config.mjs      (corre solo en `pnpm build` de apps/api)
 *
 * Si el build puede mandar SMS reales (las tres variables de Twilio presentes,
 * ver `lib/otp/sms-guard.mjs`) y falta `OTP_PHONE_HMAC_SECRET` o
 * `UPSTASH_REDIS_REST_URL/TOKEN`, el límite por número quedaría APAGADO en
 * silencio y cualquiera podría disparar SMS (con coste) a un número ajeno. Aquí
 * el build FALLA en vez de desplegar eso.
 *
 * Imprime NOMBRES de variables, jamás valores. Sin Twilio (dev, CI, simulacro)
 * no exige nada.
 *
 * Lee solo `process.env`: en Vercel el build las recibe de su panel; en local
 * hay que exportarlas en la shell (no lee `.env.local`).
 */
import { canSendRealSms, missingPhoneLimitConfig } from '../lib/otp/sms-guard.mjs'

if (!canSendRealSms(process.env)) {
  console.log('[check-sms-config] este build no puede mandar SMS reales: no se exige el límite por número.')
  process.exit(0)
}

const missing = missingPhoneLimitConfig(process.env)
if (missing.length === 0) {
  console.log('[check-sms-config] OK: límite por número configurado.')
  process.exit(0)
}

console.error(
  [
    '[check-sms-config] BUILD BLOQUEADO (SEC-03).',
    'Este entorno puede mandar SMS reales (Twilio configurado) pero el límite por número',
    'no está configurado; quedaría apagado y se podría abusar del envío de SMS.',
    `Faltan: ${missing.join(', ')}`,
    'Configúralas en Vercel (Settings > Environment Variables, para este entorno) y redespliega.',
  ].join('\n'),
)
process.exit(1)
