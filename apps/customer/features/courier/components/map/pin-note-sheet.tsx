'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { useCourierStore } from '../../lib/store'

const QUICK_REFS = ['Frente a…', 'Al costado de…', 'Cerca de…']

/**
 * Pedir-2b · Escribir la referencia: el mapa ya está fijo (ver
 * `CourierMapHost`, franja comprimida arriba); aquí solo se escribe cómo
 * llegar. Una sola vez — después solo se ve y se edita (nota `s2b` del canvas
 * de diseño).
 */
export function PinNoteSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'pin-note')
  const editingPoint = useCourierStore((s) => s.editingPoint)
  const draft = useCourierStore((s) => s.draft)
  const goTo = useCourierStore((s) => s.goTo)
  const confirmPinNote = useCourierStore((s) => s.confirmPinNote)

  const [text, setText] = useState('')

  useEffect(() => {
    if (!open) return
    setText(editingPoint ? draft[editingPoint].referenceText : '')
    // Solo al abrir: si se sigue tecleando, `draft` cambiaría en cada letra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const ready = text.trim().length > 0

  return (
    <BottomSheet open={open} onClose={() => goTo('pin-drop')} label="¿Cómo llegamos?" scrim={false}>
      <div className="flex flex-col px-4 pb-6">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => goTo('pin-drop')}
            aria-label="Volver a mover el pin"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F4F4F2]"
          >
            <Icon name="arrow_back" size={20} className="text-[#2E3236]" />
          </button>
          <div className="text-[22px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
            ¿Cómo llegamos?
          </div>
        </div>

        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej.: Casa de dos pisos, puerta azul"
          className="w-full resize-none rounded-2xl border border-transparent bg-[#F4F4F2] px-3.5 py-3 font-sans text-[15px] text-[#2E3236] outline-none focus:border-brand/40"
        />

        <div className="mt-2.5 flex flex-wrap gap-2">
          {QUICK_REFS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setText((t) => (t ? `${t} ${chip} ` : `${chip} `))}
              className="rounded-full bg-[#F4F4F2] px-3 py-1.5 text-[13px] font-semibold text-[#5C6368]"
            >
              {chip}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => confirmPinNote(text.trim())}
          className={`mt-4 flex h-14 w-full items-center justify-center rounded-full font-extrabold text-[16px] ${
            ready
              ? 'bg-[linear-gradient(135deg,#F97316,#FB923C)] text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,.55)]'
              : 'bg-[#E8E9EB] text-[#5C6368]'
          }`}
        >
          Listo
        </button>
      </div>
    </BottomSheet>
  )
}
