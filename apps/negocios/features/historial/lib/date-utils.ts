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
  | 'custom'

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  this_week: 'Esta semana',
  last_7_days: '7 días',
  last_15_days: '15 días',
  this_month: 'Este mes',
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

/** Devuelve el rango de fechas { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } para un preset. */
export function getPresetRange(preset: Exclude<DatePreset, 'custom'>): {
  start: string
  end: string
} {
  const todayStr = getLimaDate()
  const todayDate = new Date(`${todayStr}T12:00:00-05:00`)

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

    case 'last_7_days': {
      const d = new Date(todayDate)
      d.setDate(d.getDate() - 6)
      return { start: getLimaDate(d), end: todayStr }
    }

    case 'last_15_days': {
      const d = new Date(todayDate)
      d.setDate(d.getDate() - 14)
      return { start: getLimaDate(d), end: todayStr }
    }

    case 'this_month': {
      const startMonth = `${todayStr.slice(0, 7)}-01`
      return { start: startMonth, end: todayStr }
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
