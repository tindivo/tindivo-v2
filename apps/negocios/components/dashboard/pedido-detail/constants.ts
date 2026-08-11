export const PREP_PRESETS = [10, 15, 20, 25, 30, 35, 40, 45, 50]

export const REJECT_REASONS_BASE = [
  { code: 'out_of_stock', label: 'Producto agotado' },
  { code: 'closed', label: 'Restaurante cerrado / fuera de horario' },
  { code: 'out_of_zone', label: 'Dirección fuera de zona de cobertura' },
]

export const REJECT_REASONS_TAIL = [
  { code: 'no_answer', label: 'Cliente no responde llamada' },
  { code: 'other', label: 'Otro' },
]

export const CANCEL_REASONS = [
  { code: 'out_of_stock', label: 'Producto agotado' },
  { code: 'no_change', label: 'No hay vuelto' },
  { code: 'other', label: 'Cliente canceló por teléfono' },
  { code: 'out_of_zone', label: 'Dirección incorrecta o imposible' },
  { code: 'closed', label: 'Restaurante no puede continuar' },
  { code: 'other', label: 'Sin motorizado disponible después de mucho tiempo' },
  { code: 'other', label: 'Otro' },
]
