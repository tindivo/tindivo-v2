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
 * CARGA EL ENTORNO COMO NEXT. `next build` lee `.env`, `.env.production`,
 * `.env.local`… del directorio del proyecto, y esta puerta corre ANTES: si solo
 * mirase `process.env`, unas credenciales de Twilio en `.env.local` pasarían la
 * puerta sin verse y Next las cargaría después. Por eso usa `loadEnvConfig` de
 * `@next/env` (la misma función que usa Next; viene con `next`, sin dependencia
 * nueva), sobre el cwd del build (`apps/api`). Lo ya exportado en el entorno
 * manda sobre los archivos, igual que en Next. Si `@next/env` no se pudiera
 * resolver, avisa y sigue solo con `process.env` (en Vercel el panel inyecta las
 * variables en `process.env`, así que ahí no cambia nada).
 *
 * La normalización (recortar, vacío = ausente) es la de `sms-guard.mjs`, la
 * misma que usa el runtime.
 */
import { createRequire } from 'node:module'
import { canSendRealSms, missingPhoneLimitConfig } from '../lib/otp/sms-guard.mjs'

try {
  const require = createRequire(import.meta.url)
  const nextDir = require.resolve('next/package.json')
  const { loadEnvConfig } = require(require.resolve('@next/env', { paths: [nextDir] }))
  loadEnvConfig(process.cwd(), false, { info() {}, error: console.error })
} catch (err) {
  console.warn(
    `[check-sms-config] no se pudo cargar @next/env (${err instanceof Error ? err.message : err}); se mira solo process.env.`,
  )
}

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
