import { ADDRESS_LINE_MIN, ADDRESS_REFERENCE_MIN } from '@tindivo/contracts'
import type { LatLng } from '@/components/map-picker'

/** Etiquetas de dirección (fuente única para onboarding, perfil y checkout). */
export const ADDRESS_LABELS = ['Casa', 'Trabajo', 'Otro'] as const
export const labelEmoji = (l: string) => (l === 'Casa' ? '🏠' : l === 'Trabajo' ? '💼' : '📍')

export interface AddressValue {
  label: string
  line: string
  reference: string
  coords: LatLng | null
  /** Precisión (m) de la última lectura GPS, si se usó "Usar mi ubicación". */
  accuracyM: number | null
}

export const EMPTY_ADDRESS: AddressValue = {
  label: 'Casa',
  line: '',
  reference: '',
  coords: null,
  accuracyM: null,
}

export function getReferenceError(reference: string): string | null {
  const cleaned = reference.trim()
  if (cleaned.length < ADDRESS_REFERENCE_MIN) {
    return `Mínimo ${ADDRESS_REFERENCE_MIN} caracteres`
  }
  if (/^\d+$/.test(cleaned)) {
    return 'Agrega una descripción, no solo números'
  }
  if (/(.)\1{3,}/i.test(cleaned)) {
    return 'Evita repetir letras'
  }
  const noSpaces = cleaned.toLowerCase().replace(/\s+/g, '')
  if (noSpaces.length >= 4 && /^(.{2,})\1+$/.test(noSpaces)) {
    return 'Evita repetir patrones o palabras'
  }
  return null
}

export function isReferenceOk(reference: string): boolean {
  return getReferenceError(reference) === null
}

export function getLineError(line: string | null): string | null {
  if (!line) return 'La dirección es obligatoria'
  const cleaned = line.trim()
  if (cleaned.length < ADDRESS_LINE_MIN) {
    return `Mínimo ${ADDRESS_LINE_MIN} caracteres`
  }
  if (/^\d+$/.test(cleaned)) {
    return 'Ingresa una dirección real, no solo números'
  }
  if (/(.)\1{3,}/i.test(cleaned)) {
    return 'Evita repetir letras'
  }
  const noSpaces = cleaned.toLowerCase().replace(/\s+/g, '')
  if (noSpaces.length >= 4 && /^(.{2,})\1+$/.test(noSpaces)) {
    return 'Evita repetir patrones o palabras'
  }
  return null
}

export function isLineOk(line: string | null): boolean {
  return getLineError(line) === null
}

/**
 * Qué falta para poder guardar, dicho con las palabras que va a leer la persona
 * en el botón deshabilitado.
 *
 * Vive aquí y no en cada pantalla porque estaba escrito tres veces —perfil,
 * onboarding y checkout— y las tres se habían olvidado de lo mismo: las
 * coordenadas. Alguien llenaba calle y referencia, el botón se ponía naranja y
 * se guardaba el centro del pueblo como si fuera su casa.
 *
 * El orden es el de la reparación, no el del formulario: primero la ubicación,
 * que es lo que nadie sabía que tenía que hacer.
 */
export function getMissingLabel(value: AddressValue, insideZone: boolean): string | null {
  if (value.coords == null) return 'Falta marcar tu ubicación'
  if (!insideZone) return 'Fuera de la zona de reparto'
  if (!isLineOk(value.line)) return 'Falta tu dirección'
  if (!isReferenceOk(value.reference)) return 'Falta la referencia'
  return null
}

export function canSaveAddress(value: AddressValue, insideZone: boolean): boolean {
  return getMissingLabel(value, insideZone) === null
}
