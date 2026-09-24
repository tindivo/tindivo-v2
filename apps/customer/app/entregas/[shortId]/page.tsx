'use client'

import { use, useEffect } from 'react'
import { useCourierStore } from '@/features/courier/lib/store'

/** Enlace público de seguimiento (`tindivo.com/entregas/<shortId>`) — sin sesión. */
export default function CourierTrackingPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const openTracking = useCourierStore((s) => s.openTracking)
  const closeSheet = useCourierStore((s) => s.closeSheet)

  useEffect(() => {
    openTracking(shortId)
    // La hoja vive montada en `CourierHost` (layout), no en esta página: sin
    // este cierre al desmontar, navegar a otro sitio con el router de Next
    // (sin recarga completa) dejaría el seguimiento flotando encima de
    // cualquier pantalla siguiente.
    return () => closeSheet()
  }, [shortId, openTracking, closeSheet])

  return (
    <div className="flex min-h-[60dvh] items-center justify-center bg-[#F6F6F5] px-6 text-center">
      <p className="text-[14px] font-medium text-[#5C6368]">Abriendo el seguimiento…</p>
    </div>
  )
}
