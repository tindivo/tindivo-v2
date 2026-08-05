'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export function useSupportPhone() {
  const [supportWhatsapp, setSupportWhatsapp] = useState<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'support_whatsapp')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          setSupportWhatsapp(String(data.value).replace(/"/g, ''))
        }
      })
  }, [])

  return supportWhatsapp
}
