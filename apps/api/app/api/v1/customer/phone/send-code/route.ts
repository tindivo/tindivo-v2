import { claimCustomerPhone, phoneClaimProblem } from '@tindivo/backend/identity/http'
import { SendPhoneCodeRequestSchema } from '@tindivo/contracts'
import { after } from 'next/server'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok, problem } from '@/lib/http/problem'
import { loadLimits } from '@/lib/http/rate-limit'
import { getRequestId } from '@/lib/http/request-id'
import { alertOps } from '@/lib/ops/alert-ops'
import { getPhoneLogStore, otpPhoneSecret, reserveOtpPhone } from '@/lib/otp/phone-limit'
import { missingPhoneLimitConfig } from '@/lib/otp/sms-guard.mjs'
import { createServiceClient } from '@/lib/supabase/service'
import {
  DEV_OTP_CODE,
  OTP_DEV_SIMULATION,
  twilioClient,
  VERIFY_SERVICE_SID,
} from '@/lib/twilio/client'

export const dynamic = 'force-dynamic'

/** Máximo de intentos de verificación por usuario en una ventana de 24 horas. */
const MAX_ATTEMPTS_PER_24H = 3

/**
 * ¿Twilio rechazó el envío sin ambigüedad? Solo el error de su API (el
 * `RestException` del SDK: `status` HTTP 4xx y `code` numérico de Twilio).
 * Timeout, red caída o 5xx NO lo son: la petición pudo haberse aceptado.
 */
function isTwilioRejection(e: { code?: unknown; status?: unknown }): boolean {
  return (
    typeof e.status === 'number' && e.status >= 400 && e.status < 500 && typeof e.code === 'number'
  )
}

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * POST /customer/phone/send-code
 * Envía un código OTP vía Twilio Verify por SMS.
 * Rate limit: 3 intentos por usuario en las últimas 24 horas.
 *
 * SMS Y SOLO SMS, aunque el canal caro sea ese. Aquí ponía "WhatsApp primario,
 * SMS fallback" y la llamada siempre ha dicho `channel: 'sms'`: el comentario
 * describía una intención, no el código. El canal de WhatsApp de Twilio Verify
 * exige un remitente de WhatsApp aprobado —trámite aparte, no basta con tener
 * cuenta—, así que hoy no está disponible.
 *
 * Importa dejarlo escrito porque en San Jacinto no es un detalle: con mala
 * cobertura WhatsApp llega donde el SMS no, y además sale más barato. Si algún
 * día se aprueba el remitente, esto pasa a `channel: 'whatsapp'` con SMS de
 * reserva — y entonces el comentario de antes será verdad.
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'customer')
    const { phone } = SendPhoneCodeRequestSchema.parse(await req.json())
    const fullPhone = `+51${phone}`

    const service = createServiceClient()

    if (!twilioClient) {
      /*
       * SIMULACRO LOCAL. No se manda nada y el teléfono queda verificado AQUÍ
       * MISMO: la respuesta lleva `verified: true` y el front salta la
       * pantalla del código. Antes había que teclear `DEV_OTP_CODE` en una
       * pantalla que no decía cuál era, y registrar un vecino de prueba
       * acababa editando `customer_profiles` a mano. `verify` sigue aceptando
       * el código maestro para quien quiera recorrer esa pantalla a propósito.
       *
       * Comparte con `verify` la RPC transaccional: también ofrece el traslado
       * si el número está verificado en otra cuenta.
       *
       * SALE ANTES DEL RATE LIMIT A PROPÓSITO. El tope de 3 en 24 horas
       * protege una factura que en local no existe, y aplicarlo aquí deja la
       * pantalla intocable al cuarto intento con la única salida de borrar
       * `customer_otp_attempts` a mano. Tampoco se apunta el intento: sin
       * envío no hay nada que contar. Quien quiera probar el tope, que siembre
       * las tres filas.
       *
       * `channel: 'dev'` y no `'sms'`: el front no lo mira, pero lo mira quien
       * lea una respuesta y tenga que saber si aquí hubo un SMS de verdad.
       */
      if (OTP_DEV_SIMULATION) {
        console.warn(
          `[twilio] simulacro · ${fullPhone} verificado sin código (el maestro sigue siendo ${DEV_OTP_CODE})`,
        )

        const result = await claimCustomerPhone(service, user.id, fullPhone)
        const conflict = phoneClaimProblem(result, requestId, corsHeaders(req))
        if (conflict) return conflict

        return ok(
          { sent: true, verified: true, channel: 'dev' },
          { status: 200, headers: corsHeaders(req) },
        )
      }
      return problem('internal_error', {
        detail: 'Verificación de teléfono no disponible temporalmente.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    /*
     * SEGUNDA DEFENSA (la primera es la puerta del build, scripts/check-sms-config.mjs).
     * Si ESTE proceso manda SMS reales (aquí `twilioClient` no es null, que es
     * exactamente `canSendRealSms`) y falta la configuración del límite por
     * número, no se envía nada: el límite se apagaría en silencio y se podría
     * abusar del envío. 503 y alerta al admin (deduplicada, sin datos
     * personales). El resto de la API no se toca. La caída de Redis EN CALIENTE
     * no pasa por aquí: sigue abriendo con log (lib/otp/phone-limit.ts).
     *
     * Código del cuerpo: `internal_error` (el más cercano que existe) con
     * status 503 puesto a mano. PENDIENTE de Jesús: `service_unavailable` en
     * packages/contracts/src/errors.ts.
     */
    const missingConfig = missingPhoneLimitConfig(process.env)
    if (missingConfig.length > 0) {
      after(() =>
        alertOps(
          'otp_phone_limit_misconfigured',
          `send-code bloqueado: faltan ${missingConfig.join(', ')}`,
        ),
      )
      return Response.json(
        {
          type: 'about:blank',
          title: 'Servicio no disponible',
          status: 503,
          code: 'internal_error',
          detail: 'Verificación de teléfono no disponible temporalmente.',
          requestId,
        },
        {
          status: 503,
          headers: { 'content-type': 'application/problem+json', ...corsHeaders(req) },
        },
      )
    }

    // Rate limiting: ventana de 24h (no día calendario) para evitar
    // desfase UTC vs Perú (UTC-5). Un intento a las 7:30pm hora local
    // no debe reiniciar el contador a las 7:00pm (medianoche UTC).
    const { count } = await service
      .from('customer_otp_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

    if ((count ?? 0) >= MAX_ATTEMPTS_PER_24H) {
      return problem('rate_limited', {
        detail: `Máximo ${MAX_ATTEMPTS_PER_24H} intentos de verificación en 24 horas. Intenta de nuevo más tarde.`,
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Tope por NÚMERO de destino (SEC-03), además del de arriba por usuario:
    // quien crea cuentas gratis no puede disparar SMS a un número ajeno.
    // Ventana móvil de 24 h y solo cuentan los envíos que Twilio acepta: se
    // aparta la plaza aquí y se devuelve si Twilio rechaza. Falla abierto sin
    // Upstash, con Redis caído o sin secreto (ver lib/otp/phone-limit.ts).
    const phoneLimit = await reserveOtpPhone(fullPhone, {
      store: await getPhoneLogStore(),
      rule: (await loadLimits()).otp_phone,
      secret: otpPhoneSecret(),
    })
    if (!phoneLimit.allowed) {
      return problem('rate_limited', {
        detail: `Ya se pidieron demasiados códigos para este número. Intenta de nuevo en ${phoneLimit.retryAfterSec} s o escríbenos por WhatsApp.`,
        requestId,
        headers: { ...corsHeaders(req), 'retry-after': String(phoneLimit.retryAfterSec) },
      })
    }

    // Enviar OTP via Twilio Verify (WhatsApp primario, SMS fallback automático).
    //
    // EL FALLO DE TWILIO NO PUEDE SALIR COMO "error interno" A SECAS. Sin este
    // catch, cualquier rechazo suyo subía al `handleError` de abajo y el vecino
    // leía "Ocurrió un error interno", que no dice nada ni a él ni a quien mira
    // el log. Y los motivos son mundanos y accionables: cuenta de prueba que
    // solo escribe a números verificados, permisos geográficos de Perú sin
    // habilitar, o el servicio Verify mal apuntado. El código de Twilio queda
    // en el log; el vecino recibe algo que puede entender.
    let verification: { channel: string }
    try {
      verification = await twilioClient.verify.v2
        .services(VERIFY_SERVICE_SID)
        .verifications.create({
          to: fullPhone,
          channel: 'sms',
          locale: 'es',
        })
    } catch (twilioErr) {
      const e = twilioErr as { code?: number; status?: number; message?: string }
      // El 60200 de Twilio dice "Invalid parameter" y NO dice cuál, así que el
      // log tiene que enseñar los tres candidatos. El teléfono va entero (es del
      // propio usuario y ya está en la petición); del SID solo el prefijo y el
      // largo, que basta para reconocer un valor equivocado sin filtrarlo.
      console.error(
        `[twilio] verificación rechazada · code=${e.code} status=${e.status} · ${e.message}` +
          ` · to=${fullPhone} channel=sms locale=es` +
          ` · serviceSid=${VERIFY_SERVICE_SID.slice(0, 2)}…(${VERIFY_SERVICE_SID.length})`,
      )
      if (isTwilioRejection(e)) {
        // Rechazo inequívoco (4xx con código de la API de Twilio): el SMS no
        // salió y no gasta el cupo del número. La devolución va tras la
        // respuesta (no espera a Redis); la lápida cubre un EVAL aún en vuelo.
        after(phoneLimit.release)
        return problem('internal_error', {
          detail:
            'No pudimos enviarte el SMS. Escríbenos por WhatsApp y te verificamos el número a mano.',
          requestId,
          headers: corsHeaders(req),
        })
      }
      // RESULTADO INCIERTO (timeout, red caída, 5xx): Twilio pudo aceptar el
      // envío y el SMS llegar. Se conserva la plaza del número y se apunta el
      // intento personal como si hubiera salido: ante la duda se manda MENOS.
      await service.from('customer_otp_attempts').insert({
        user_id: user.id,
        phone: fullPhone,
      })
      return problem('internal_error', {
        detail:
          'No pudimos confirmar el envío del SMS. Si el código te llega, úsalo; si no, escríbenos por WhatsApp y te verificamos el número a mano.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    // Registrar intento para rate limiting.
    //
    // Aquí se vuelve a comprobar la cuenta: mientras Twilio respondía, la persona
    // pudo borrarla (0259). La tabla no tiene FK, y el disparador
    // `reject_deleted_account` es lo que impide sellar un intento con teléfono
    // sobre una cuenta ya borrada.
    const { error: attemptErr } = await service.from('customer_otp_attempts').insert({
      user_id: user.id,
      phone: fullPhone,
    })
    if (attemptErr?.message.includes('account was deleted')) {
      return problem('unauthorized', {
        detail: 'Esta cuenta ya fue borrada.',
        requestId,
        headers: corsHeaders(req),
      })
    }

    return ok(
      { sent: true, channel: verification.channel },
      { status: 200, headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
