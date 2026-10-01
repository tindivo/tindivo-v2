'use client'

import { useRouter } from 'next/navigation'
import { use, useEffect, useRef } from 'react'
import { useCourierStore } from '@/features/courier/lib/store'

/** Enlace público de seguimiento (`tindivo.com/entregas/<shortId>`) — sin sesión. */
export default function CourierTrackingPage({ params }: { params: Promise<{ shortId: string }> }) {
  const { shortId } = use(params)
  const openTracking = useCourierStore((s) => s.openTracking)
  const closeSheet = useCourierStore((s) => s.closeSheet)
  const router = useRouter()
  const sheetOpen = useCourierStore((s) => s.open)

  useEffect(() => {
    openTracking(shortId)
    // La hoja vive montada en `CourierHost` (layout), no en esta página: sin
    // este cierre al desmontar, navegar a otro sitio con el router de Next
    // (sin recarga completa) dejaría el seguimiento flotando encima de
    // cualquier pantalla siguiente.
    return () => closeSheet()
  }, [shortId, openTracking, closeSheet])

  // Esta ruta no tiene contenido propio: al salir del seguimiento (flecha o
  // «Cerrar») se iba a una página que solo decía «Abriendo el seguimiento…».
  // Solo tras haberla visto abierta: en el primer render `open` todavía es
  // false y redirigiría antes de mostrar nada.
  const seenOpen = useRef(false)
  useEffect(() => {
    if (sheetOpen) {
      seenOpen.current = true
      return
    }
    if (seenOpen.current) router.replace('/')
  }, [sheetOpen, router])

  return (
    <div className="flex min-h-[60dvh] items-center justify-center bg-[#F6F6F5] px-6 text-center">
      <p className="text-[14px] font-medium text-[#5C6368]">Abriendo el seguimiento…</p>
    </div>
  )
}
