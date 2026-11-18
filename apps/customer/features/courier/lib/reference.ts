import { AddressReferenceFormSchema } from '@tindivo/contracts'

/**
 * Cómo llegar a un punto de Entregas: la regla del formulario (`ADDRESS_REFERENCE_MIN`, D-31), igual que Android
 * (`CourierRequestState.kt`). La API acepta desde su piso; el formulario pide más. Devuelve el mensaje del primer
 * problema, o `null` si la referencia vale.
 */
export function courierReferenceError(text: string): string | null {
  const parsed = AddressReferenceFormSchema.safeParse(text)
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Escribe una referencia')
}
