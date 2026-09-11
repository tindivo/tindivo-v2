import { describe, expect, it } from 'vitest'
import { formatRangeLabel, getLimaDate, getPresetRange, PRESET_LABELS } from '../date-utils'

describe('date-utils (Lima UTC-5)', () => {
  it('calculates Lima today string with format YYYY-MM-DD', () => {
    const today = getLimaDate()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('generates correct ranges for all presets', () => {
    const todayStr = getLimaDate()

    const todayRange = getPresetRange('today')
    expect(todayRange.start).toBe(todayStr)
    expect(todayRange.end).toBe(todayStr)

    const yesterdayRange = getPresetRange('yesterday')
    expect(yesterdayRange.start).toBe(yesterdayRange.end)
    expect(yesterdayRange.end < todayStr).toBe(true)

    const sevenDays = getPresetRange('last_7_days')
    expect(sevenDays.end).toBe(todayStr)
    expect(sevenDays.start <= todayStr).toBe(true)

    const fifteenDays = getPresetRange('last_15_days')
    expect(fifteenDays.end).toBe(todayStr)
    expect(fifteenDays.start < sevenDays.start).toBe(true)

    const thisMonth = getPresetRange('this_month')
    expect(thisMonth.start).toBe(`${todayStr.slice(0, 7)}-01`)
    expect(thisMonth.end).toBe(todayStr)

    const thisWeek = getPresetRange('this_week')
    expect(thisWeek.end).toBe(todayStr)
    expect(thisWeek.start <= todayStr).toBe(true)

    const lastMonth = getPresetRange('last_month')
    expect(lastMonth.start.endsWith('-01')).toBe(true)
    expect(lastMonth.end >= lastMonth.start).toBe(true)
    expect(lastMonth.end < thisMonth.start).toBe(true)
  })

  it('has readable labels for presets including 15 días and mes anterior', () => {
    expect(PRESET_LABELS.today).toBe('Hoy')
    expect(PRESET_LABELS.last_15_days).toBe('15 días')
    expect(PRESET_LABELS.last_7_days).toBe('7 días')
    expect(PRESET_LABELS.last_month).toBe('Mes anterior')
  })

  it('formats range labels nicely', () => {
    const today = getLimaDate()
    expect(formatRangeLabel(today, today)).toBe('Hoy')
    expect(formatRangeLabel('2026-08-01', '2026-08-15')).toBe('01/08 al 15/08/2026')
    expect(formatRangeLabel('2026-07-25', '2026-08-05')).toBe('25/07 al 05/08/2026')
  })
})

/**
 * `excludeToday` lo pide solo «Rendimiento», donde promediar una noche que aún
 * no ha pasado metía un sesgo a la baja en todas las comparaciones. Historial y
 * Reseñas siguen incluyendo hoy, y estos tests son los que avisan si alguien
 * convierte la opción en el comportamiento por defecto y les esconde el día en
 * curso a esas dos listas.
 */
describe('getPresetRange con excludeToday', () => {
  it('deja los rangos móviles terminando ayer, sin acortarlos', () => {
    const todayStr = getLimaDate()

    const siete = getPresetRange('last_7_days', { excludeToday: true })
    expect(siete.end < todayStr).toBe(true)
    expect(dias(siete.start, siete.end)).toBe(7)

    const quince = getPresetRange('last_15_days', { excludeToday: true })
    expect(quince.end).toBe(siete.end)
    expect(dias(quince.start, quince.end)).toBe(15)
  })

  it('no cambia nada cuando no se pide', () => {
    const todayStr = getLimaDate()
    expect(getPresetRange('last_7_days').end).toBe(todayStr)
    expect(getPresetRange('last_7_days', {})).toEqual(getPresetRange('last_7_days'))
    expect(dias(getPresetRange('last_7_days').start, todayStr)).toBe(7)
  })

  it('no toca los rangos que significan «lo que va de»', () => {
    const todayStr = getLimaDate()
    for (const preset of ['today', 'this_week', 'this_month'] as const) {
      expect(getPresetRange(preset, { excludeToday: true }).end).toBe(todayStr)
    }
  })
})

/** Días inclusivos entre dos fechas `YYYY-MM-DD`. */
function dias(start: string, end: string): number {
  const ms = Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)
  return Math.round(ms / 86_400_000) + 1
}
