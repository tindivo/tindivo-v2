import { describe, expect, it } from 'vitest'
import {
  isOpsCaller,
  OPS_ALERT_SECRET_HEADER,
  opsAlertText,
} from '../../../../supabase/functions/send-push/ops-alert.ts'

describe('send-push · opsAlertText (lista cerrada de alertas)', () => {
  it('un kind conocido devuelve su texto fijo', () => {
    expect(opsAlertText('otp_phone_limit_misconfigured')?.title).toContain('SMS')
  })

  it.each([
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
    'valueOf',
    'no_existe',
    '',
  ])('«%s» NO es un kind (no se hereda del prototipo)', (kind) => {
    expect(opsAlertText(kind)).toBeUndefined()
  })

  it('un valor que no es texto tampoco', () => {
    expect(opsAlertText(undefined)).toBeUndefined()
    expect(opsAlertText({})).toBeUndefined()
  })
})

describe('send-push · isOpsCaller (emisor interno autenticado)', () => {
  const SECRET = 'secreto-compartido-de-servidor-0123456789'

  it('acepta solo el secreto exacto', () => {
    expect(isOpsCaller(SECRET, SECRET)).toBe(true)
  })

  it('rechaza ausente, vacío, distinto, prefijo y con espacios', () => {
    expect(isOpsCaller(null, SECRET)).toBe(false)
    expect(isOpsCaller('', SECRET)).toBe(false)
    expect(isOpsCaller('otro', SECRET)).toBe(false)
    expect(isOpsCaller(SECRET.slice(0, -1), SECRET)).toBe(false)
    expect(isOpsCaller(`${SECRET} `, SECRET)).toBe(false)
  })

  it('si la función no tiene secreto configurado, rechaza TODO (falla cerrado), incluso un vacío', () => {
    expect(isOpsCaller('', '')).toBe(false)
    expect(isOpsCaller('x', '')).toBe(false)
    expect(isOpsCaller(null, undefined)).toBe(false)
  })

  it('la cabecera tiene un nombre fijo en minúsculas', () => {
    expect(OPS_ALERT_SECRET_HEADER).toBe('x-ops-alert-secret')
  })
})
