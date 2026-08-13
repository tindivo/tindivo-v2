import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID

/** Qué falta exactamente, para no adivinarlo desde un 500 opaco. */
const missing = [
  !accountSid && 'TWILIO_ACCOUNT_SID',
  !authToken && 'TWILIO_AUTH_TOKEN',
  !verifySid && 'TWILIO_VERIFY_SERVICE_SID',
].filter(Boolean)

if (missing.length > 0) {
  console.warn(`[twilio] faltan variables (${missing.join(', ')}) — verificación de teléfono OFF`)
}

/**
 * Cliente Twilio tipado, o `null` si NO se puede verificar un teléfono.
 *
 * `verifySid` CUENTA PARA EL NULL, y antes no contaba. La condición miraba solo
 * `accountSid && authToken`, así que sin el Verify SID el cliente se construía
 * igual y la llamada salía como `.services('')`: Twilio devolvía un 404 que
 * subía como excepción, y el cliente veía "Ocurrió un error interno" —el
 * catch-all de `handleError`— en vez del mensaje que esta capa ya tenía
 * preparado. Con las tres variables en la misma condición, falta la que falte,
 * el endpoint responde lo mismo y el log dice cuál es.
 *
 * Visto en producción el 2026-08-12: `/customer/phone/send-code` devolvía 500 y
 * el vecino se quedaba sin poder verificar su número.
 */
export const twilioClient: twilio.Twilio | null =
  accountSid && authToken && verifySid ? twilio(accountSid, authToken) : null

/** Twilio Verify Service SID (VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx). */
export const VERIFY_SERVICE_SID = verifySid ?? ''
