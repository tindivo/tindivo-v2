import fs from 'fs'
import path from 'path'

// Cargar project-ref de supabase/.temp/project-ref si existe
let tempRef = ''
try {
  const refPath = path.resolve(process.cwd(), 'supabase/.temp/project-ref')
  if (fs.existsSync(refPath)) {
    tempRef = fs.readFileSync(refPath, 'utf-8').trim()
  }
} catch {}

// Cargar .env.local de apps/api si existe
try {
  const envPath = path.resolve(process.cwd(), 'apps/api/.env.local')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let value = (match[2] || '').trim()
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
        if (!process.env[key]) process.env[key] = value
      }
    }
  }
} catch {}

const defaultUrl = tempRef ? `https://${tempRef}.supabase.co` : process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_URL = (process.env.TEMP_SUPABASE_URL || defaultUrl).replace(/\/$/, '')
const SERVICE_KEY = process.env.TEMP_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Debes definir TEMP_SUPABASE_URL y TEMP_SERVICE_ROLE_KEY antes de ejecutar este script.')
  process.exit(1)
}

async function claimRPC(workerName: string): Promise<Array<{ out_id: string; out_event_id: string; out_event_type: string; out_payload: any; out_attempts: number }>> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/claim_outbox_events`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ p_limit: 10 }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`[${workerName}] Error RPC claim_outbox_events (${response.status}): ${text}`)
  }

  return (await response.json()) as any[]
}

async function runConcurrencyTest() {
  console.log('=== PRUEBA DE CONCURRENCIA REAL: claim_outbox_events (2 WORKERS) ===')
  console.log(`URL de Conexión: ${SUPABASE_URL}`)
  console.log('Iniciando reclamo simultáneo con Worker 1 y Worker 2...')

  const [claimed1, claimed2] = await Promise.all([
    claimRPC('Worker 1'),
    claimRPC('Worker 2'),
  ])

  console.log(`Worker 1 reclamó: ${claimed1.length} eventos:`, claimed1.map(r => r.out_event_id || r.out_id))
  console.log(`Worker 2 reclamó: ${claimed2.length} eventos:`, claimed2.map(r => r.out_event_id || r.out_id))

  // Verificar que NO haya superposición (intersección) de IDs entre los 2 workers (FOR UPDATE SKIP LOCKED)
  const ids1 = new Set(claimed1.map((r) => r.out_id))
  const overlap = claimed2.filter((r) => ids1.has(r.out_id))

  if (overlap.length > 0) {
    console.error('❌ FALLO DE CONCURRENCIA: Se reclamaron los mismos eventos en ambos workers!', overlap)
    process.exit(1)
  } else {
    console.log('✅ EXITO: Ningún evento fue reclamado por más de 1 worker. FOR UPDATE SKIP LOCKED funciona correctamente.')
  }
}

runConcurrencyTest().catch((err) => {
  console.error('Fallo en la prueba de concurrencia:', err.message || err)
  process.exit(1)
})
