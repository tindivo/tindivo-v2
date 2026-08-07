import twilio from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID

if (!accountSid || !authToken || !verifySid) {
  console.warn('[twilio] Missing credentials — phone verification disabled')
}

/**
 * Cliente Twilio tipado. `null` si las credenciales no están configuradas
 * (modo graceful degradation: el endpoint responde 503 en vez de crashear).
 */
export const twilioClient: twilio.Twilio | null =
  accountSid && authToken ? twilio(accountSid, authToken) : null

/** Twilio Verify Service SID (VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx). */
export const VERIFY_SERVICE_SID = verifySid ?? ''
