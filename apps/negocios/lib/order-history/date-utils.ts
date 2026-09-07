/**
 * Utilidades para manejo de fechas en zona horaria America/Lima (UTC-5).
 * Cumple estrictamente con la regla §2.8 de AGENTS.md.
 */

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_7_days'
  | 'last_15_days'
  | 'this_month'
  | 'last_month'
  | 'custom'

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  this_week: 'Esta semana',
  last_7_days: '7 días',
  last_15_days: '15 días',
  this_month: 'Este mes',
  last_month: 'Mes anterior',
  custom: 'Personalizado',
}

/** Obtiene la fecha actual en formato YYYY-MM-DD en hora de Lima (UTC-5). */
export function getLimaDate(d: Date = new Date()): string {
  const limaOffset = -5 * 60 // UTC-5 en minutos
  const limaMs = d.getTime() + (d.getTimezoneOffset() + limaOffset) * 60 * 1000
  const lima = new Date(limaMs)
  const y = lima.getFullYear()
  const m = String(lima.getMonth() + 1).padStart(2, '0')
  const day = String(lima.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Rangos móviles que terminan AYER en vez de hoy.
 *
 * Lo pide «Rendimiento» y NO lo quieren ni Historial ni Reseñas, por eso es una
 * opción y no el comportamiento por defecto: en una lista de pedidos o de
 * reseñas, esconder las de hoy es una pérdida sin ninguna contrapartida.
 *
 * En Rendimiento sí la hay. Los locales de San Jacinto abren de noche, así que
 * a media tarde la jornada en curso está vacía por definición: si «7 días»
 * llega hasta hoy, el rango son seis noches vividas y una vacía, comparadas
 * contra siete completas. Ese −1/7 no dice nada del negocio. En prod
 * (2026-09-07) el local más grande había SUBIDO un 11% por noche y el panel le
 * pintaba una flecha roja de −3.3% exactamente por esto.
 *
 * La jornada en curso no se pierde: viaja aparte (`tonight`) y el panel la
 * enseña en su propia tarjeta, donde no contamina ninguna media.
 *
 * Solo afecta a los rangos MÓVILES. `today`, `this_week` y `this_month`
 * significan literalmente «lo que va de», y recortarles el día en curso sería
 * contradecir su nombre.
 */
export interface PresetRangeOptions {
  excludeToday?: boolean
}

/** Devuelve el rango de fechas { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } para un preset. */
export function getPresetRange(
  preset: Exclude<DatePreset, 'custom'>,
  options: PresetRangeOptions = {},
): {
  start: string
  end: string
} {
  const todayStr = getLimaDate()
  const todayDate = new Date(`${todayStr}T12:00:00-05:00`)
  const shift = options.excludeToday ? 1 : 0

  function rolling(days: number): { start: string; end: string } {
    const end = new Date(todayDate)
    end.setDate(end.getDate() - shift)
    const start = new Date(end)
    start.setDate(start.getDate() - (days - 1))
    return { start: getLimaDate(start), end: getLimaDate(end) }
  }

  switch (preset) {
    case 'today':
      return { start: todayStr, end: todayStr }

    case 'yesterday': {
      const yesterday = new Date(todayDate)
      yesterday.setDate(yesterday.getDate() - 1)
      const yStr = getLimaDate(yesterday)
      return { start: yStr, end: yStr }
    }

    case 'this_week': {
      // Semana en curso de Lunes a Domingo
      const d = new Date(todayDate)
      const day = d.getDay() // 0 = Domingo, 1 = Lunes, ...
      const diff = day === 0 ? 6 : day - 1 // Días desde el lunes
      const monday = new Date(d)
      monday.setDate(monday.getDate() - diff)
      return { start: getLimaDate(monday), end: todayStr }
    }

    case 'last_7_days':
      return rolling(7)

    case 'last_15_days':
      return rolling(15)

    case 'this_month': {
      const startMonth = `${todayStr.slice(0, 7)}-01`
      return { start: startMonth, end: todayStr }
    }

    case 'last_month': {
      const parts = todayStr.split('-')
      const y = Number(parts[0]) || 2026
      const m = Number(parts[1]) || 1
      const prevYear = m === 1 ? y - 1 : y
      const prevMonth = m === 1 ? 12 : m - 1
      const start = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`
      const lastDay = new Date(prevYear, prevMonth, 0).getDate()
      const end = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      return { start, end }
    }
  }
}

/** Formato legible en español para el rango de fechas actual. */
export function formatRangeLabel(startDate: string, endDate: string): string {
  const todayStr = getLimaDate()
  if (startDate === endDate) {
    if (startDate === todayStr) return 'Hoy'
    const [y, m, d] = startDate.split('-')
    return `${d}/${m}/${y}`
  }

  const [sY, sM, sD] = startDate.split('-')
  const [eY, eM, eD] = endDate.split('-')

  if (sY === eY) {
    return `${sD}/${sM} al ${eD}/${eM}/${eY}`
  }
  return `${sD}/${sM}/${sY} al ${eD}/${eM}/${eY}`
}
