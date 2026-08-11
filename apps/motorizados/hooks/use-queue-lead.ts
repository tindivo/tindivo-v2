'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export function useQueueLeadMinutes(): number {
  const [leadMinutes, setLeadMinutes] = useState<number>(10)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'timers')
      .maybeSingle()
      .then(({ data }) => {
        const val = (data?.value as { queueLeadMinutes?: number } | null)?.queueLeadMinutes
        if (typeof val === 'number' && val > 0) {
          console.log('[queue_lead_minutes] Leído de app_settings.timers:', val)
          setLeadMinutes(val)
        }
      })
  }, [])

  return leadMinutes
}
