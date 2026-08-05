import { ApiError } from '@tindivo/api-client'

export function num(v: string): number {
  const n = Number.parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function isReferenceValid(reference: string, deliveryMethod: string): boolean {
  if (deliveryMethod !== 'delivery') return true
  return reference.trim().length >= 5
}

export function getOrCreateIdempotencyKey(): string {
  if (typeof window === 'undefined') return ''
  let key = sessionStorage.getItem('tindivo:new-order-key')
  if (!key) {
    key =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `key-${Date.now()}-${Math.random()}`
    sessionStorage.setItem('tindivo:new-order-key', key)
  }
  return key
}

export function clearIdempotencyKey(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('tindivo:new-order-key')
  }
}

export function regenerateIdempotencyKey(): string {
  clearIdempotencyKey()
  return getOrCreateIdempotencyKey()
}

export function mapFormError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    if (
      err instanceof Error &&
      (err.message.includes('fetch') || err.message.includes('network'))
    ) {
      return 'Error de conexión con el servidor. Tu borrador se mantiene intacto. Vuelve a intentar.'
    }
    return 'No se pudo crear el pedido. Intenta nuevamente.'
  }

  const detail = (err.problem?.detail ?? err.message ?? '').toLowerCase()

  if (detail.includes('suspendida') || detail.includes('is_blocked')) {
    return 'Cuenta de negocio suspendida. Contacta a soporte de Tindivo.'
  }
  if (detail.includes('inactivo') || detail.includes('is_active')) {
    return 'Tu negocio no está activo en este momento.'
  }
  if (detail.includes('prueba') || detail.includes('blacklisted')) {
    return 'Número de teléfono de prueba no permitido.'
  }
  if (detail.includes('bloqueado') || detail.includes('customer_is_blocked')) {
    return 'El cliente se encuentra bloqueado por políticas de seguridad.'
  }
  if (detail.includes('anticipado') || detail.includes('prepayment')) {
    return 'Este cliente requiere pago por adelantado (prepago).'
  }
  if (
    detail.includes('cerrado') ||
    detail.includes('horario') ||
    detail.includes('plataforma') ||
    detail.includes('22:30') ||
    detail.includes('reciben pedidos')
  ) {
    return err.problem?.detail ?? 'Ya no se reciben pedidos. El horario de atención ha finalizado.'
  }

  return err.problem?.detail ?? 'No se pudo procesar la solicitud.'
}
