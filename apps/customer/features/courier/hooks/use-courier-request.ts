'use client'

import { ApiError } from '@tindivo/api-client'
import { useEffect, useState } from 'react'
import { useActiveCourierOrdersStore } from '@/lib/active-courier-orders'
import { useOnboarding } from '@/lib/onboarding-store'
import { createCourierOrder, type Requester } from '../lib/api'
import { type CustomerIdentity, loadFlowContext, loadIdentity } from '../lib/flow-context'
import { useCourierStore } from '../lib/store'
import type { CourierOrderResult } from '../types'

/**
 * Orquestador del flujo de "pedir entrega" — patrón `use-checkout.ts`: junta
 * la identidad del cliente, precarga el destino por defecto, y expone
 * `submit()` para el paso final (`confirm`/`person-details`).
 */
export function useCourierRequest() {
  const draft = useCourierStore((s) => s.draft)
  const updateDraft = useCourierStore((s) => s.updateDraft)
  const updatePoint = useCourierStore((s) => s.updatePoint)
  const fromBusiness = useCourierStore((s) => s.fromBusiness)
  const submitted = useCourierStore((s) => s.submitted)

  const [identity, setIdentity] = useState<CustomerIdentity | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Se recarga cada vez que se abre Entregas: quien inició sesión con la app
  // ya cargada (login al entrar, `open-flow.ts`) tiene que ver su «Soy yo».
  // El seguimiento también abre la hoja, pero no necesita nada de esto.
  const sheetOpen = useCourierStore((s) => s.open && s.step !== 'tracking')
  useEffect(() => {
    if (!sheetOpen) return
    let on = true
    void loadFlowContext()
      .then(({ identity: id }) => {
        if (on) setIdentity(id)
      })
      // Sin red, «Soy yo» no aparece; el formulario sigue.
      .catch(() => {})
    return () => {
      on = false
    }
  }, [sheetOpen])

  // Precarga el destino con la dirección por defecto del cliente SOLO cuando
  // el flujo entró desde un negocio (Main.dc.html: "Llevamos a" ya viene
  // relleno). En "otro lugar o persona" el destino lo escribe la persona.
  useEffect(() => {
    if (!fromBusiness || draft.destination.coordinates) return
    let on = true
    // La dirección viene de la misma carga de la apertura (`loadFlowContext`),
    // no de una consulta aparte.
    loadFlowContext()
      // La identidad de la MISMA carga, no la del render: si no, la dirección
      // llegaba antes que el nombre y el celular, quedaba guardada sin contacto
      // y la guarda de coordenadas ya no dejaba completarlo.
      .then(({ home: addr, identity: who }) => {
        if (!on || !addr) return
        updatePoint('destination', {
          contactName: who.name,
          contactPhone: who.phone,
          coordinates: addr.coordinates,
          referenceText: addr.referenceText,
        })
      })
      .catch(() => {})
    return () => {
      on = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromBusiness, identity])

  async function submit(utmSource?: string | null): Promise<CourierOrderResult | null> {
    // La sesión pudo iniciarse después de cargar la identidad: se pregunta de
    // nuevo antes de rendirse. Si de verdad no hay, se ABRE el login (antes
    // solo se decía con un texto, al final del pedido).
    let who: CustomerIdentity
    try {
      who = identity?.userId ? identity : await loadIdentity()
    } catch {
      // Sin red al leer el perfil: se dice, no se rompe el botón.
      setError('No pudimos conectarnos. Revisa tu señal y vuelve a tocar «Pedir entrega».')
      return null
    }
    if (!who.userId) {
      setIdentity(who)
      setError('Inicia sesión y vuelve a tocar «Pedir entrega».')
      useOnboarding.getState().openSheet({ next: null, inPlace: true })
      return null
    }
    if (who !== identity) setIdentity(who)
    const requester: Requester = { name: who.name || 'Cliente', phone: who.phone }
    setSubmitting(true)
    setError(null)
    try {
      const result = await createCourierOrder(draft, requester, utmSource)
      submitted(result)
      // El banner «Entrega en curso» y el badge de «Pedidos» no esperan al
      // evento de Realtime: quien acaba de pedir tiene que verla al volver.
      void useActiveCourierOrdersStore.getState().recargar()
      return result
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.problem.detail ?? err.message)
      } else {
        setError('No pudimos crear tu solicitud. Intenta de nuevo.')
      }
      return null
    } finally {
      setSubmitting(false)
    }
  }

  return { draft, updateDraft, updatePoint, identity, submitting, error, submit }
}
