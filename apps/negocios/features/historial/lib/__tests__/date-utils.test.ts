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
  })

  it('has readable labels for presets including 15 días', () => {
    expect(PRESET_LABELS.today).toBe('Hoy')
    expect(PRESET_LABELS.last_15_days).toBe('15 días')
    expect(PRESET_LABELS.last_7_days).toBe('7 días')
  })

  it('formats range labels nicely', () => {
    const today = getLimaDate()
    expect(formatRangeLabel(today, today)).toBe('Hoy')
    expect(formatRangeLabel('2026-08-01', '2026-08-15')).toBe('01/08 al 15/08/2026')
    expect(formatRangeLabel('2026-07-25', '2026-08-05')).toBe('25/07 al 05/08/2026')
  })
})
