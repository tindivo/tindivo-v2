import { z } from 'zod'

/** UUID (Postgres `uuid`). */
export const UuidSchema = z.uuid()
export type Uuid = z.infer<typeof UuidSchema>

/**
 * Código público del pedido. 8 caracteres de un alfabeto de 32 símbolos estilo
 * Crockford que EXCLUYE los visualmente ambiguos I, O, 0 y 1. Se usa en las URLs
 * de tracking y en la referencia humana `#TND-XXXXXXXX`.
 *
 * INVARIANTE v2 (fix del bug ShortId del v1): este formato SOLO se valida al
 * CREAR un short id. Al rehidratar un agregado desde la persistencia NO se
 * valida — un registro legítimo con formato legacy no debe romper la lectura.
 * Por eso el dominio expone `ShortId.fromTrusted()` aparte de `ShortId.create()`.
 */
export const SHORT_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 símbolos, sin I/O/0/1
export const SHORT_ID_LENGTH = 8
export const SHORT_ID_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/

export const ShortIdSchema = z
  .string()
  .regex(SHORT_ID_RE, { message: 'short_id inválido (8 chars, alfabeto sin I/O/0/1)' })
  .brand<'ShortId'>()
export type ShortId = z.infer<typeof ShortIdSchema>

/**
 * Celular peruano: 9 dígitos que empiezan con 9. Normaliza prefijos +51 / 51 y
 * separadores; la salida son los 9 dígitos limpios.
 */
export const PHONE_PE_RE = /^9\d{8}$/
export const PhonePeSchema = z
  .string()
  .transform((v) => v.replace(/[\s\-()]/g, '').replace(/^\+?51/, ''))
  .pipe(
    z.string().regex(PHONE_PE_RE, {
      message: 'Celular peruano inválido (9 dígitos, empieza con 9)',
    }),
  )
export type PhonePe = z.infer<typeof PhonePeSchema>

/**
 * Dinero en Soles (PEN). Mapea a `numeric(10,2)` en Postgres. No negativo,
 * máximo 2 decimales, tope 99,999,999.99.
 * Nota: en la frontera con la DB el dinero viaja como string (numeric de PG);
 * la conversión a/desde number vive en el adaptador de persistencia.
 */
export const MoneyPenSchema = z
  .number()
  .nonnegative({ message: 'El monto no puede ser negativo' })
  .max(99_999_999.99, { message: 'Monto fuera de rango' })
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, {
    message: 'El monto admite máximo 2 decimales',
  })
export type MoneyPen = z.infer<typeof MoneyPenSchema>

/** Coordenadas geográficas. Mapea a `numeric(10,7)` en Postgres. */
export const CoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
export type Coordinates = z.infer<typeof CoordinatesSchema>

/**
 * Límites de la referencia de dirección (fuente única; consumida por UI y backend).
 * Mínimo 5 chars.
 */
export const ADDRESS_REFERENCE_MIN = 5
export const ADDRESS_REFERENCE_MAX = 140
export const ADDRESS_LINE_MIN = 5
export const ADDRESS_LINE_MAX = 200

/**
 * Detecta texto basura o inválido en campos de texto de dirección:
 * 1. Solo dígitos (ej. "12345").
 * 2. 4 o más caracteres consecutivos repetidos (ej. "aaaaa").
 * 3. Repetición de patrón completo ignorando espacios (ej. "asdfasdf" o "lala lala").
 */
export function isGarbageText(val: string): boolean {
  const cleaned = val.trim().toLowerCase()
  if (/^\d+$/.test(cleaned)) return true
  if (/(.)\1{3,}/i.test(cleaned)) return true

  const noSpaces = cleaned.replace(/\s+/g, '')
  if (noSpaces.length >= 4 && /^(.{2,})\1+$/.test(noSpaces)) return true

  return false
}

export const AddressReferenceSchema = z
  .string()
  .trim()
  .min(ADDRESS_REFERENCE_MIN, {
    message: `La referencia debe tener al menos ${ADDRESS_REFERENCE_MIN} caracteres`,
  })
  .max(ADDRESS_REFERENCE_MAX, {
    message: `La referencia no puede superar ${ADDRESS_REFERENCE_MAX} caracteres`,
  })
  .refine((v) => !isGarbageText(v), {
    message:
      'Ingresa una referencia válida y descriptiva (evita números solos o patrones repetitivos)',
  })
export type AddressReference = z.infer<typeof AddressReferenceSchema>

export const AddressLineSchema = z
  .string()
  .trim()
  .min(ADDRESS_LINE_MIN, {
    message: `La dirección debe tener al menos ${ADDRESS_LINE_MIN} caracteres`,
  })
  .max(ADDRESS_LINE_MAX, {
    message: `La dirección no puede superar ${ADDRESS_LINE_MAX} caracteres`,
  })
  .refine((v) => !isGarbageText(v), {
    message: 'Ingresa una dirección válida (evita números solos o patrones repetitivos)',
  })
export type AddressLine = z.infer<typeof AddressLineSchema>
