'use client'

import { sessionVerdict, shouldClearStaleSession, signOutLocal } from '@tindivo/supabase'
import { useEffect, useRef } from 'react'
import type { CheckoutState } from '@/features/checkout/hooks/use-checkout-state'
import type { CustomerProfile } from '@/features/checkout/types'
import { useOnboarding } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export function useCheckoutAuth(state: CheckoutState) {
  const {
    cart,
    cartHydrated,
    confirmed,
    router,
    setBlocked,
    setAuthReady,
    setPrepayOnlyByRisk,
    setHasDeliveryHistory,
    setUserId,
    setName,
    setPhone,
    setVerifiedPhone,
    setAddresses,
    setAddressId,
  } = state

  const sheetOpen = useOnboarding((s) => s.open)
  const openedSheetRef = useRef(false)
  const profilePromptedRef = useRef(false)

  useEffect(() => {
    // Espera a que la bolsa se rehidrate desde localStorage antes de decidir: en una
    // carga directa/refresh de /checkout el store arranca vacío (skipHydration) y sin
    // este guard redirigiría al home aunque la bolsa exista.
    if (!cartHydrated) return
    if (cart.count() === 0 && !confirmed) {
      router.replace('/')
      return
    }
    const supabase = getSupabaseBrowser()
    // Validamos contra el servidor con getUser() (no solo getSession() cacheado):
    // una sesión obsoleta de un usuario borrado pasaría getSession() pero fallaría
    // aquí, evitando que el onboarding escriba con un user_id inexistente
    // (FK violation en terms_acceptance/customer_profiles).
    supabase.auth.getUser().then(async ({ data: userData, error }) => {
      let sessionUser = userData.user

      // Sin confirmación del servidor de auth, la sesión guardada NO se da por
      // muerta: `getUser()` devuelve `user: null` tanto si la sesión no vale
      // como si no hubo forma de preguntar, y en un móvil con datos flojos lo
      // segundo pasa a menudo. Se sigue con la sesión que hay en el
      // dispositivo; si de verdad ya no sirve, la primera consulta que haga
      // fallará y eso sí es un 401 del servidor, no una suposición nuestra.
      if (!sessionUser && sessionVerdict({ data: userData, error }) === 'unreachable') {
        const { data: enCache } = await supabase.auth.getSession()
        sessionUser = enCache.session?.user ?? null
      }

      if (!sessionUser) {
        const ob = useOnboarding.getState()
        if (openedSheetRef.current && !ob.open) {
          // Cerró el sheet sin iniciar sesión: volver al carrito/carta.
          router.back()
          return
        }
        if (!ob.open) {
          // Limpia la sesión obsoleta de ESTE dispositivo antes de pedir login
          // otra vez — SOLO si el servidor la desmintió. Tiene que ser local:
          // esto no es un logout que haya pedido nadie, y con scope global una
          // sesión rancia en el móvil echaría al cliente de los demás
          // dispositivos sin que tocara nada.
          if (shouldClearStaleSession({ data: userData, error })) {
            await signOutLocal(supabase).catch(() => {})
          }
          openedSheetRef.current = true
          ob.openSheet({ next: '/checkout', inPlace: true })
        }
        return
      }
      if (useOnboarding.getState().open) return // esperar a que termine el onboarding
      const meta = sessionUser.user_metadata as { full_name?: string } | undefined
      const { data: prof } = await supabase
        .from('customer_profiles')
        .select('full_name,phone,phone_verified_at,contraentrega_blocked,blocked_until')
        .maybeSingle()
      // Red de seguridad: sesión (p.ej. Google en otro dispositivo) sin perfil → completar datos.
      if (!prof && !profilePromptedRef.current) {
        profilePromptedRef.current = true
        useOnboarding.getState().openSheet({
          step: 'google-name',
          path: 'google',
          variant: 'profile-incomplete',
          next: '/checkout',
          inPlace: true,
          fullName: meta?.full_name ?? null,
          email: sessionUser.email ?? null,
        })
        return
      }
      const profile = prof as CustomerProfile | null

      // Guard de celular verificado: si no está verificado, redirige al inicio
      if (profile && !profile.phone_verified_at) {
        router.replace('/')
        return
      }

      if (profile?.blocked_until && new Date(profile.blocked_until) > new Date()) {
        setBlocked(true)
        setAuthReady(true)
        return
      }
      setPrepayOnlyByRisk(Boolean(profile?.contraentrega_blocked))

      // ¿Contraentrega sin prepago? Lo decide la DB (0171). Antes se contaban
      // aquí los pedidos `delivered` DE ESTA CUENTA, y así el piloto entero
      // pasaba por prepago: sus entregas están atadas al TELÉFONO, no a la
      // cuenta —las tomó la cajera— o vienen del directorio del v1. Nada de eso
      // es visible desde el navegador, y no debe serlo: el RPC no acepta a quién
      // preguntar, solo responde por `auth.uid()`.
      //
      // Ante un fallo se queda en `false`, que es el lado seguro: pide prepago.
      // El guard de la RPC de creación manda igual, así que un false de más
      // cuesta fricción, nunca un pedido cobrado de menos.
      const { data: trusted, error: trustedError } = await supabase.rpc(
        'current_customer_trusted_for_contraentrega',
      )
      if (trustedError) console.error('[checkout] historial de entregas:', trustedError.message)
      setHasDeliveryHistory(trusted === true)
      setUserId(sessionUser.id)
      setName(profile?.full_name ?? meta?.full_name ?? '')
      if (profile?.phone) {
        const clean = profile.phone.replace(/\D/g, '').slice(-9)
        setPhone(clean)
        setVerifiedPhone(clean)
      }
      const { data: addrs } = await supabase
        .from('customer_addresses')
        .select('id,label,line,reference,is_default,coordinates_lat,coordinates_lng')
        .order('is_default', { ascending: false })
      setAddresses((addrs ?? []) as CheckoutState['addresses'])
      setAddressId((addrs ?? []).find((a) => a.is_default)?.id ?? addrs?.[0]?.id ?? null)
      setAuthReady(true)
    })
  }, [cart, cartHydrated, confirmed, router, sheetOpen])
}
