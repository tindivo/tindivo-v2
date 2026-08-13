import twilio from 'twilio'

/**
 * `.trim()` EN LAS TRES, Y NO ES PARANOIA.
 *
 * Estos valores se pegan a mano en el panel de Vercel, y un salto de línea o un
 * espacio de más viaja dentro de la variable sin que nadie lo vea: el panel los
 * enseña enmascarados. Con basura al final, el SID entra en la URL de Twilio
 * como `/Services/VAxxx%0A/Verifications` y la respuesta es un 60200 «Invalid
 * parameter» que no dice qué parámetro. Recortar es gratis y quita de en medio
 * la causa más tonta y más difícil de ver.
 */
const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim()
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim()
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim()

/** Forma canónica de un Verify Service SID: `VA` + 32 hex. */
const VERIFY_SID_SHAPE = /^VA[0-9a-f]{32}$/i
/** Forma canónica de un Account SID: `AC` + 32 hex. */
const ACCOUNT_SID_SHAPE = /^AC[0-9a-f]{32}$/i

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
 * LA VARIABLE PUEDE ESTAR Y AUN ASÍ SER LA EQUIVOCADA.
 *
 * Los identificadores de Twilio se parecen todos —34 caracteres— y solo los
 * distinguen las dos primeras letras: `AC` cuenta, `SK` clave de API, `MG`
 * servicio de mensajería, `VA` servicio Verify. Pegar el que no es en
 * `TWILIO_VERIFY_SERVICE_SID` da exactamente el 60200 que se vio en producción,
 * y desde el panel es invisible porque el valor va enmascarado.
 *
 * El log NUNCA imprime el valor: solo el prefijo y el largo, que es lo que hace
 * falta para reconocer el error sin filtrar un secreto.
 */
if (verifySid && !VERIFY_SID_SHAPE.test(verifySid)) {
  const pista = ACCOUNT_SID_SHAPE.test(verifySid)
    ? ' — parece el Account SID (AC…), no el del servicio Verify'
    : ''
  console.error(
    `[twilio] TWILIO_VERIFY_SERVICE_SID con forma inválida: empieza por "${verifySid.slice(0, 2)}" ` +
      `y mide ${verifySid.length} (se espera "VA" y 34)${pista}`,
  )
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
 *
 * La FORMA del SID no entra en esta condición a propósito: si el valor está
 * pero mal, el endpoint debe seguir intentándolo y dejar que Twilio dé su
 * veredicto —el aviso de arriba ya salió en el log—. Apagar la verificación por
 * una regex propia sería peor que el fallo que intenta prevenir.
 */
export const twilioClient: twilio.Twilio | null =
  accountSid && authToken && verifySid ? twilio(accountSid, authToken) : null

/** Twilio Verify Service SID (VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx). */
export const VERIFY_SERVICE_SID = verifySid ?? ''
