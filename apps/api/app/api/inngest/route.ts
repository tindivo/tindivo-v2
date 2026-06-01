import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { functions } from '@/lib/inngest/functions'

export const dynamic = 'force-dynamic'

// Endpoint que Inngest (Dev Server local o Cloud) invoca para ejecutar funciones.
export const { GET, POST, PUT } = serve({ client: inngest, functions })
