'use client'

import { Button, Card, Icon } from '@tindivo/ui'
import {
  type DatePreset,
  formatRangeLabel,
  getLimaDate,
  getPresetRange,
  PRESET_LABELS,
} from '../lib/date-utils'

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onRangeChange: (start: string, end: string) => void
  activePreset: DatePreset
  onPresetChange: (preset: DatePreset) => void
}

const PRESET_OPTIONS: Exclude<DatePreset, 'custom'>[] = [
  'today',
  'yesterday',
  'this_week',
  'last_7_days',
  'last_15_days',
  'this_month',
]

export function DateRangePicker({
  startDate,
  endDate,
  onRangeChange,
  activePreset,
  onPresetChange,
}: DateRangePickerProps) {
  const todayStr = getLimaDate()

  function handleSelectPreset(preset: Exclude<DatePreset, 'custom'>) {
    const range = getPresetRange(preset)
    onPresetChange(preset)
    onRangeChange(range.start, range.end)
  }

  function handleStartChange(newStart: string) {
    onPresetChange('custom')
    // Si la nueva fecha de inicio es posterior al fin, sincronizamos el fin
    if (newStart > endDate) {
      onRangeChange(newStart, newStart)
    } else {
      onRangeChange(newStart, endDate)
    }
  }

  function handleEndChange(newEnd: string) {
    onPresetChange('custom')
    // Si la nueva fecha de fin es anterior al inicio, sincronizamos el inicio
    if (newEnd < startDate) {
      onRangeChange(newEnd, newEnd)
    } else {
      onRangeChange(startDate, newEnd)
    }
  }

  const rangeLabel = formatRangeLabel(startDate, endDate)

  return (
    <Card className="mb-4 overflow-hidden p-3.5 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Presets rápidos */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESET_OPTIONS.map((preset) => {
            const isSelected = activePreset === preset
            return (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={isSelected ? 'brand' : 'soft'}
                onClick={() => handleSelectPreset(preset)}
                className="px-3 text-caption"
              >
                {PRESET_LABELS[preset]}
              </Button>
            )
          })}
        </div>

        {/* Indicador del rango activo */}
        <div className="flex items-center gap-1.5 self-start text-caption font-medium text-ink-muted sm:self-center">
          <Icon name="calendar_today" size={14} className="text-brand shrink-0" />
          <span className="font-semibold text-ink">{rangeLabel}</span>
        </div>
      </div>

      {/* Selectores de fecha Desde - Hasta */}
      <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-ink/[0.05] pt-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="history-start-date"
            className="text-micro font-bold uppercase tracking-wider text-ink-muted"
          >
            Desde
          </label>
          <input
            id="history-start-date"
            type="date"
            value={startDate}
            max={todayStr}
            onChange={(e) => handleStartChange(e.target.value)}
            className="rounded-xl border border-ink/10 bg-surface px-2.5 py-1.5 text-[13px] font-medium text-ink outline-none transition-colors focus:border-brand"
          />
        </div>

        <span className="text-caption text-ink-subtle">al</span>

        <div className="flex items-center gap-2">
          <label
            htmlFor="history-end-date"
            className="text-micro font-bold uppercase tracking-wider text-ink-muted"
          >
            Hasta
          </label>
          <input
            id="history-end-date"
            type="date"
            value={endDate}
            max={todayStr}
            onChange={(e) => handleEndChange(e.target.value)}
            className="rounded-xl border border-ink/10 bg-surface px-2.5 py-1.5 text-[13px] font-medium text-ink outline-none transition-colors focus:border-brand"
          />
        </div>
      </div>
    </Card>
  )
}
