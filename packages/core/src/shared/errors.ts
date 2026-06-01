import type { ApiErrorCode } from '@tindivo/contracts'

/** Error base del dominio. `code` mapea al catálogo de errores de la API (RFC 9457). */
export class DomainError extends Error {
  readonly code: ApiErrorCode
  constructor(message: string, code: ApiErrorCode) {
    super(message)
    this.name = this.constructor.name
    this.code = code
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`Transición de estado inválida: ${from} → ${to}`, 'invalid_state_transition')
  }
}

export class OrderNotCancellableError extends DomainError {
  constructor(detail = 'El pedido no se puede cancelar en este estado') {
    super(detail, 'order_not_cancellable')
  }
}

export class InvalidShortIdError extends DomainError {
  constructor(value: string) {
    super(`short_id inválido: ${value}`, 'validation_error')
  }
}

export class CommissionConfigError extends DomainError {
  constructor(detail: string) {
    super(detail, 'internal_error')
  }
}
