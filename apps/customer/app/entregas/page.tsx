'use client'

import type { DirectoryBusinessCategory } from '@tindivo/contracts'
import { Icon, Spinner } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DirectoryBusinessCard } from '@/features/courier/components/directory-business-card'
import { DirectoryMap } from '@/features/courier/components/directory-map'
import { useCourierStatus } from '@/features/courier/hooks/use-courier-status'
import {
  DIRECTORY_CATEGORY_LABEL,
  type DirectoryBusiness,
  getDirectory,
} from '@/features/courier/lib/directory'
import { formatCourierPrice } from '@/features/courier/lib/format'
import { openCourierFlow } from '@/features/courier/lib/open-flow'

const CATEGORIES: (DirectoryBusinessCategory | 'all')[] = [
  'all',
  'chicken_grill',
  'chifa',
  'pizza_burgers',
  'snacks',
  'desserts',
  'drinks_liquor',
  'pharmacy',
  'bodega',
  'other',
]

export default function EntregasDirectorioPage() {
  const [rows, setRows] = useState<DirectoryBusiness[] | null>(null)
  const [view, setView] = useState<'lista' | 'mapa'>('lista')
  const [category, setCategory] = useState<DirectoryBusinessCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const { status } = useCourierStatus()

  useEffect(() => {
    getDirectory().then(setRows)
  }, [])

  const filtered = useMemo(() => {
    if (!rows) return null
    return rows.filter((b) => {
      if (category !== 'all' && b.category !== category) return false
      if (query.trim() && !b.name.toLowerCase().includes(query.trim().toLowerCase())) return false
      return true
    })
  }, [rows, category, query])

  return (
    <div className="min-h-dvh bg-[#F6F6F5] pb-10">
      <div className="flex flex-col gap-3 bg-white px-4 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[30px] font-extrabold tracking-[-0.035em] text-[#2E3236]">
              Negocios
            </div>
            <div className="mt-0.5 text-[14px] font-medium text-[#5C6368]">San Jacinto</div>
          </div>
          <div className="flex shrink-0 gap-0.5 rounded-full bg-[#2E3236]/[0.06] p-[3px]">
            <button
              type="button"
              onClick={() => setView('lista')}
              className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold ${
                view === 'lista'
                  ? 'bg-white text-[#2E3236] shadow-[0_1px_3px_rgba(46,50,54,.14)]'
                  : 'text-[#5C6368]'
              }`}
            >
              <Icon name="list" size={18} filled={view === 'lista'} className="text-brand" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => setView('mapa')}
              className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-bold ${
                view === 'mapa'
                  ? 'bg-white text-[#2E3236] shadow-[0_1px_3px_rgba(46,50,54,.14)]'
                  : 'text-[#5C6368]'
              }`}
            >
              <Icon name="map" size={18} />
              Mapa
            </button>
          </div>
        </div>

        <label className="flex h-13 items-center gap-2.5 rounded-full bg-white px-4 shadow-[0_1px_2px_rgba(46,50,54,.05),0_6px_20px_rgba(46,50,54,.06)]">
          <Icon name="search" size={22} className="text-[#5C6368]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca un negocio o plato"
            className="h-12 w-full border-0 bg-transparent text-[16px] font-semibold text-[#2E3236] outline-none"
          />
        </label>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`h-11 shrink-0 rounded-full px-4 text-[15px] font-bold ${
                category === c ? 'bg-[#2E3236] text-white' : 'bg-[#F4F4F2] text-[#2E3236]'
              }`}
            >
              {c === 'all' ? 'Todos' : DIRECTORY_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {status.enabled && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-[20px] bg-[#FFF7ED] p-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-brand shadow-[inset_0_1px_0_rgba(255,255,255,.22)]">
            <Icon name="two_wheeler" size={25} filled className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[16px] font-extrabold text-[#2E3236]">Tindivo Entregas</div>
            <div className="text-[13px] font-medium leading-tight text-[#5C6368]">
              Recogemos lo que ya pagaste y lo llevamos. Desde {formatCourierPrice(status.price)}.
            </div>
          </div>
        </div>
      )}

      {view === 'mapa' ? (
        <div className="fixed inset-0 z-30 bg-white">
          {filtered === null ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="md" variant="brand" />
            </div>
          ) : (
            <DirectoryMap businesses={filtered} />
          )}
          {/*
            SIN `md:hidden`, a diferencia del back-al-inicio de la vista Lista.
            Este mapa es `fixed inset-0`: tapa la pantalla COMPLETA, toggle
            Lista/Mapa de la cabecera incluido, a cualquier ancho. En escritorio
            no queda ninguna otra forma de salir de aquí.
          */}
          <button
            type="button"
            onClick={() => setView('lista')}
            aria-label="Volver a la lista"
            className="fixed top-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(46,50,54,.25)]"
          >
            <Icon name="arrow_back" size={22} className="text-[#2E3236]" />
          </button>
        </div>
      ) : filtered === null ? (
        <div className="flex justify-center py-16">
          <Spinner size="md" variant="brand" />
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 pt-4">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[14px] text-[#5C6368]">
              No encontramos negocios con ese filtro.
            </p>
          )}
          {filtered.map((b) => (
            <DirectoryBusinessCard key={b.id} business={b} />
          ))}

          <div className="flex flex-col gap-3.5 rounded-[24px] bg-[#FFF7ED] p-4 pt-5">
            <div>
              <div className="text-[20px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
                ¿No lo encuentras?
              </div>
              <div className="mt-0.5 text-[14px] font-medium text-[#5C6368]">
                Escríbelo y lo recogemos.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void openCourierFlow()}
              className="flex h-16 w-full flex-col items-center justify-center rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,.55)]"
            >
              <span className="flex items-center gap-2 text-[18px] font-extrabold">
                <Icon name="pin_drop" size={22} filled />
                Otro lugar o persona
              </span>
            </button>
          </div>
        </div>
      )}

      {view === 'lista' && (
        <Link
          href="/"
          className="fixed top-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(46,50,54,.25)] md:hidden"
          aria-label="Volver al inicio"
        >
          <Icon name="arrow_back" size={22} className="text-[#2E3236]" />
        </Link>
      )}
    </div>
  )
}
