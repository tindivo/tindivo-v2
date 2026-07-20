import { createClient } from '@supabase/supabase-js'

/**
 * scripts/test_concurrency_0068.ts
 * Prueba de concurrencia real entre 2 sesiones/workers ejecutando `claim_outbox_events`
 * 
 * Uso:
 *   $env:TEMP_SUPABASE_URL="https://<REF_TEMPORAL>.supabase.co"
 *   $env:TEMP_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY_TEMPORAL>"
 *   npx tsx scripts/test_concurrency_0068.ts
 */

const SUPABASE_URL = process.env.TEMP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.TEMP_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Debes definir TEMP_SUPABASE_URL y TEMP_SERVICE_ROLE_KEY antes de ejecutar este script.')
  process.exit(1)
}

async function runConcurrencyTest() {
  console.log('=== PRUEBA DE CONCURRENCIA REAL: claim_outbox_events (2 WORKERS) ===')
  console.log(`URL de Conexión: ${SUPABASE_URL}`)

  const worker1 = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const worker2 = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  console.log('Iniciando reclamo simultáneo con Worker 1 y Worker 2...')

  const [res1, res2] = await Promise.all([
    worker1.rpc('claim_outbox_events', { p_limit: 10 }),
    worker2.rpc('claim_outbox_events', { p_limit: 10 }),
  ])

  if (res1.error) console.error('Error Worker 1:', res1.error.message)
  if (res2.error) console.error('Error Worker 2:', res2.error.message)

  const claimed1 = (res1.data as any[]) || []
  const claimed2 = (res2.data as any[]) || []

  console.log(`Worker 1 reclamó: ${claimed1.length} eventos`)
  console.log(`Worker 2 reclamó: ${claimed2.length} eventos`)

  // Verificar que NO haya superposición (intersección) de IDs entre los 2 workers (FOR UPDATE SKIP LOCKED)
  const ids1 = new Set(claimed1.map((r: any) => r.out_id))
  const overlap = claimed2.filter((r: any) => ids1.has(r.out_id))

  if (overlap.length > 0) {
    console.error('❌ FALLO DE CONCURRENCIA: Se reclamaron los mismos eventos en ambos workers!', overlap)
    process.exit(1)
  } else {
    console.log('✅ EXITO: Ningún evento fue reclamado por más de 1 worker. FOR UPDATE SKIP LOCKED funciona correctamente.')
  }
}

runConcurrencyTest().catch((err) => {
  console.error('Fallo en la prueba de concurrencia:', err)
  process.exit(1)
})
