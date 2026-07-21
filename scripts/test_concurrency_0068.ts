import fs from 'fs'
import path from 'path'

/**
 * scripts/test_concurrency_0068.ts
 * Prueba de concurrencia real entre 2 workers ejecutando `claim_outbox_events`.
 *
 * El script:
 *  1. Siembra N eventos pendientes directamente en outbox_events (REST API).
 *  2. Ejecuta claim_outbox_events con 2 workers simultáneos.
 *  3. Verifica que no haya superposición (FOR UPDATE SKIP LOCKED).
 *  4. Limpia los eventos sembrados al finalizar.
 *
 * Uso:
 *   $env:TEMP_SUPABASE_URL="https://<REF>.supabase.co"
 *   $env:TEMP_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY>"
 *   node scripts/test_concurrency_0068.ts
 */

// Cargar project-ref de supabase/.temp/project-ref si existe
let tempRef = ''
try {
  const refPath = path.resolve(process.cwd(), 'supabase/.temp/project-ref')
  if (fs.existsSync(refPath)) tempRef = fs.readFileSync(refPath, 'utf-8').trim()
} catch {}

// Cargar .env.local de apps/api si existe
try {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (m) {
        const key = m[1]
        let val = (m[2] || '').trim()
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        if (!process.env[key]) process.env[key] = val
      }
    }
  }
} catch {}

const defaultUrl = tempRef
  ? `https://${tempRef}.supabase.co`
  : process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_URL = (process.env.TEMP_SUPABASE_URL || defaultUrl).replace(/\/$/, '')
const SERVICE_KEY = process.env.TEMP_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Debes definir TEMP_SUPABASE_URL y TEMP_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const HEADERS = {
  'Content-Type': 'application/json',
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  Prefer: 'return=representation',
}

const SEED_COUNT = 10 // número de eventos a sembrar

async function seedEvents(): Promise<string[]> {
  const events = Array.from({ length: SEED_COUNT }, (_, i) => ({
    event_id: `test-concurrency-seed-${Date.now()}-${i}`,
    event_type: 'order/proof-rejected-final',
    payload: { orderId: crypto.randomUUID(), seed: true },
    status: 'pending',
  }))

  const res = await fetch(`${SUPABASE_URL}/rest/v1/outbox_events`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(events),
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Error sembrando eventos (${res.status}): ${t}`)
  }

  const inserted: any[] = await res.json()
  return inserted.map((r) => r.id)
}

async function cleanupEvents(ids: string[]) {
  if (ids.length === 0) return
  const res = await fetch(`${SUPABASE_URL}/rest/v1/outbox_events?id=in.(${ids.join(',')})`, {
    method: 'DELETE',
    headers: HEADERS,
  })
  if (!res.ok) {
    const t = await res.text()
    console.warn(`Advertencia al limpiar eventos sembrados (${res.status}): ${t}`)
  }
}

async function claimRPC(workerName: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_outbox_events`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ p_limit: SEED_COUNT }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`[${workerName}] Error claim_outbox_events (${res.status}): ${t}`)
  }
  return (await res.json()) as Array<{ out_id: string; out_event_id: string }>
}

async function runConcurrencyTest() {
  console.log('=== PRUEBA DE CONCURRENCIA REAL: claim_outbox_events (2 WORKERS) ===')
  console.log(`URL de Conexión: ${SUPABASE_URL}`)

  // 1. Sembrar eventos de prueba
  console.log(`\n[SETUP] Sembrando ${SEED_COUNT} eventos pendientes en outbox_events...`)
  let seededIds: string[] = []
  try {
    seededIds = await seedEvents()
    console.log(
      `[SETUP] Sembrados ${seededIds.length} eventos con IDs: ${seededIds.slice(0, 3).join(', ')}...`,
    )
  } catch (e: any) {
    console.error('[SETUP] Falló la siembra:', e.message)
    process.exit(1)
  }

  // 2. Ejecutar claim simultáneo con 2 workers
  console.log('\n[CLAIM] Iniciando reclamo simultáneo con Worker 1 y Worker 2...')
  let claimed1: Array<{ out_id: string; out_event_id: string }> = []
  let claimed2: Array<{ out_id: string; out_event_id: string }> = []

  try {
    ;[claimed1, claimed2] = await Promise.all([claimRPC('Worker 1'), claimRPC('Worker 2')])
  } catch (e: any) {
    console.error('[CLAIM] Falló el claim:', e.message)
    await cleanupEvents(seededIds)
    process.exit(1)
  }

  console.log(`Worker 1 reclamó: ${claimed1.length} eventos`)
  if (claimed1.length > 0)
    console.log(
      '  IDs Worker 1:',
      claimed1.map((r) => r.out_event_id || r.out_id),
    )

  console.log(`Worker 2 reclamó: ${claimed2.length} eventos`)
  if (claimed2.length > 0)
    console.log(
      '  IDs Worker 2:',
      claimed2.map((r) => r.out_event_id || r.out_id),
    )

  const totalClaimed = claimed1.length + claimed2.length
  console.log(`\nTotal reclamados entre ambos workers: ${totalClaimed} / ${SEED_COUNT}`)

  // 3. Verificar no superposición
  const ids1 = new Set(claimed1.map((r) => r.out_id))
  const overlap = claimed2.filter((r) => ids1.has(r.out_id))

  if (overlap.length > 0) {
    console.error('\n❌ FALLO DE CONCURRENCIA: Eventos reclamados por AMBOS workers:')
    console.error(overlap)
    await cleanupEvents(seededIds)
    process.exit(1)
  } else {
    console.log('\n✅ EXITO: Ningún evento fue reclamado por más de 1 worker.')
    console.log('   FOR UPDATE SKIP LOCKED funciona correctamente.')
  }

  // 4. Limpiar eventos sembrados
  console.log('\n[CLEANUP] Eliminando eventos de prueba sembrados...')
  await cleanupEvents(seededIds)
  console.log('[CLEANUP] Limpieza completa.')
}

runConcurrencyTest().catch((err) => {
  console.error('Fallo inesperado:', err.message || err)
  process.exit(1)
})
