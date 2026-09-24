'use client'

import { BottomSheet, Icon, Spinner } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { type DirectoryBusiness, getDirectory } from '../lib/directory'
import { useCourierStore } from '../lib/store'

/** Pedir-1 · Tu ruta: buscar un negocio del directorio o ir a "otro lugar o persona". */
export function RouteSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'route')
  const closeSheet = useCourierStore((s) => s.closeSheet)
  const goTo = useCourierStore((s) => s.goTo)
  const openForBusiness = useCourierStore((s) => s.openForBusiness)

  const [query, setQuery] = useState('')
  const [businesses, setBusinesses] = useState<DirectoryBusiness[] | null>(null)

  useEffect(() => {
    if (!open) return
    let on = true
    getDirectory().then((rows) => {
      if (on) setBusinesses(rows.filter((b) => b.courierEnabled))
    })
    return () => {
      on = false
    }
  }, [open])

  const filtered =
    businesses?.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase())) ?? null

  return (
    <BottomSheet open={open} onClose={closeSheet} label="Tu ruta" scrim={false}>
      <div className="flex max-h-[80dvh] flex-col overflow-y-auto px-4 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
            Tu ruta
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4F4F2]"
          >
            <Icon name="close" size={22} className="text-[#2E3236]" />
          </button>
        </div>

        <label className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-brand bg-white px-3.5 py-2 shadow-[0_0_0_4px_rgba(249,115,22,.18)]">
          <Icon name="search" size={22} className="text-[#5C6368]" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[12px] font-semibold text-[#5C6368]">Recogemos en</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Negocio o plato"
              className="w-full border-0 bg-transparent text-[16px] font-semibold text-[#2E3236] outline-none"
            />
          </span>
        </label>

        {filtered === null ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" variant="brand" />
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-[14px] text-[#5C6368]">
                No encontramos negocios con ese nombre todavía.
              </p>
            )}
            {filtered.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() =>
                  openForBusiness({
                    id: b.id,
                    name: b.name,
                    lat: b.lat,
                    lng: b.lng,
                    referenceText: b.referenceText,
                    phone: b.phone,
                  })
                }
                className="flex w-full items-center gap-3 py-2 text-left"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F4F4F2] text-[20px] font-extrabold text-[#2E3236]">
                  {b.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-bold tracking-[-0.01em] text-[#2E3236]">
                    {b.name}
                  </div>
                  <div className="truncate text-[13px] font-medium text-[#5C6368]">
                    {b.referenceText}
                  </div>
                </div>
                <Icon name="north_west" size={20} className="text-[#9AA0A6]" />
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => goTo('trip')}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-[#FFF7ED] px-2 py-2"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white">
            <Icon name="person_pin_circle" size={26} filled className="text-brand" />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-[16px] font-extrabold tracking-[-0.01em] text-[#2E3236]">
              ¿No está?
            </div>
            <div className="text-[13px] font-medium text-[#5C6368]">Otro lugar o persona</div>
          </div>
          <Icon name="chevron_right" size={24} className="text-brand-dark" />
        </button>
      </div>
    </BottomSheet>
  )
}
