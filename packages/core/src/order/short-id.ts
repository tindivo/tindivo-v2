import { SHORT_ID_RE, type ShortId as ShortIdBrand, ShortIdSchema } from '@tindivo/contracts'
import { InvalidShortIdError } from '../shared/errors'

export type ShortId = ShortIdBrand

/**
 * Value Object del short_id. La distinción create/fromTrusted es la corrección
 * central del bug del v1: el formato SOLO se valida al CREAR, NUNCA al rehidratar.
 */
export const ShortId = {
  /** Crea validando el formato (8 chars, alfabeto sin I/O/0/1). Lanza si es inválido. */
  create(value: string): ShortId {
    const parsed = ShortIdSchema.safeParse(value)
    if (!parsed.success) throw new InvalidShortIdError(value)
    return parsed.data
  },

  /**
   * Rehidrata desde persistencia SIN validar el formato. Un short_id legacy
   * fuera del alfabeto no debe romper la lectura del agregado (bug 500 del v1).
   */
  fromTrusted(value: string): ShortId {
    return value as ShortId
  },

  isValid(value: string): boolean {
    return SHORT_ID_RE.test(value)
  },
}
