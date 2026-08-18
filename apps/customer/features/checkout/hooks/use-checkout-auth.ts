'use client'

import { signOutLocal } from '@tindivo/supabase'
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
    setDeliveredCount,
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
    supabase.auth.getUser().then(async ({ data: userData }) => {
      const sessionUser = userData.user
      if (!sessionUser) {
        const ob = useOnboarding.getState()
        if (openedSheetRef.current && !ob.open) {
          // Cerró el sheet sin iniciar sesión: volver al carrito/carta.
          router.back()
          return
        }
        if (!ob.open) {
          // Limpia la sesión obsoleta de ESTE dispositivo antes de pedir login
          // otra vez. Tiene que ser local: esto no es un logout que haya pedido
          // nadie, y con scope global una sesión rancia en el móvil echaría al
          // cliente de los demás dispositivos sin que tocara nada.
          await signOutLocal(supabase).catch(() => {})
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
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_user_id', sessionUser.id)
        .eq('status', 'delivered')
      setDeliveredCount(count ?? 0)
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
