'use client'

import { BottomSheet } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { AddressStep } from '../auth-onboarding/steps/address-step'

type Props = {
  onComplete: () => void
  onClose: () => void
}

export function AddressGateModal({ onComplete, onClose }: Props) {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        setUserId(data.user?.id ?? null)
      })
  }, [])

  return (
    <BottomSheet open label="Añade tu dirección de entrega" onClose={onClose}>
      {/*
       * SIN RÓTULO PROPIO, y aquí importaba más que en la hoja del celular.
       *
       * `AddressStep` ya abre con «Tu dirección de entrega», así que el
       * «¿Dónde te lo llevamos?» que había aquí solo repetía. Pero sumado al
       * tirador de la hoja pedía 78dvh + 61 px dentro de un `max-h-[85dvh]`:
       * eso no cabe en ninguna pantalla por debajo de 871 px de alto, o sea en
       * NINGÚN móvil. La hoja se encogía siempre, y lo que se encogía era la
       * zona con el mapa y los campos. Ver `steps/phone-step.tsx`.
       */}
      <div className="h-[min(560px,78dvh)]">
        <AddressStep active mode="gate" userId={userId} onBack={onClose} onDone={onComplete} />
      </div>
    </BottomSheet>
  )
}
