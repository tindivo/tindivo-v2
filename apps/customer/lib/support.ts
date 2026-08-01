import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { getSupabaseBrowser } from '@/lib/supabase/client'

let cachedSupportWhatsapp: Promise<string> | null = null

/**
 * Devuelve el número de WhatsApp de soporte configurado en public.app_settings
 * (formato internacional, ej: '51906550166').
 * Memoizado para la sesión de cliente. Fallback a TINDIVO_SUPPORT_WHATSAPP.
 */
export async function getSupportWhatsapp(): Promise<string> {
  if (cachedSupportWhatsapp) return cachedSupportWhatsapp

  cachedSupportWhatsapp = (async () => {
    try {
      const { data } = await getSupabaseBrowser()
        .from('app_settings')
        .select('value')
        .eq('key', 'support_whatsapp')
        .maybeSingle()

      if (data?.value && typeof data.value === 'string') {
        const cleaned = data.value.replace(/\D/g, '')
        if (cleaned.length >= 9) return cleaned
      }
    } catch {
      // Ignorar errores de red/RLS y usar fallback
    }
    return TINDIVO_SUPPORT_WHATSAPP
  })()

  return cachedSupportWhatsapp
}

/**
 * Devuelve la URL directa de WhatsApp con un mensaje pre-llenado contextual.
 */
export function buildSupportWhatsappUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '') || TINDIVO_SUPPORT_WHATSAPP
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
