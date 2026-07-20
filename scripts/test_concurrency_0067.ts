import { createClient } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'

async function runConcurrencyTest() {
  const url = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'anon-key'
  const jwtSecret = process.env.SUPABASE_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long'
  
  if (!url || !key) {
    console.log('Skipping standalone concurrency TS run: SUPABASE_URL / KEY not provided')
    return
  }

  // Client to query fixture order using service role
  const adminClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || key)

  console.log('=== PRUEBA DE CONCURRENCIA DE APELACIONES (2 SESIONES AUTENTICADAS SIMULTÁNEAS) ===')

  // Obtener un pedido cancelado por proof_rejected_final sin apelaciones previas
  const { data: orders, error: orderErr } = await adminClient
    .from('orders')
    .select('id, customer_user_id')
    .eq('status', 'cancelled')
    .eq('cancel_reason', 'proof_rejected_final')
    .limit(1)

  if (orderErr || !orders || orders.length === 0) {
    console.error('No se encontró pedido fixture en proof_rejected_final para la prueba de concurrencia.')
    return
  }

  const orderId = orders[0].id
  const customerId = orders[0].customer_user_id

  console.log(`Pedido seleccionado: ${orderId}, Cliente Propietario: ${customerId}`)

  // Generar JWT válido para el cliente propietario (auth.uid() = customerId)
  const token = jwt.sign(
    {
      sub: customerId,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    jwtSecret
  )

  // Crear 2 clientes independientes con el token del cliente autenticado
  const client1 = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const client2 = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })

  console.log(`Ejecutando create_appeal_report simultáneamente en 2 sesiones autenticadas del cliente...`)

  // Peticiones paralelas simultáneas con Promise.all
  const [res1, res2] = await Promise.all([
    client1.rpc('create_appeal_report', { p_order_id: orderId, p_description: 'Apelación Cliente Sesión Concurrente 1' }),
    client2.rpc('create_appeal_report', { p_order_id: orderId, p_description: 'Apelación Cliente Sesión Concurrente 2' })
  ])

  console.log('Resultado Sesión 1:', res1.data || res1.error)
  console.log('Resultado Sesión 2:', res2.data || res2.error)

  // Verificar en la BD que existe exactamente 1 reporte 'rejected_proof_disputed'
  const { count, error: countErr } = await adminClient
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('type', 'rejected_proof_disputed')

  console.log(`Conteo final de reportes 'rejected_proof_disputed' para el pedido ${orderId}: ${count}`)

  if (count === 1) {
    console.log('✅ PRUEBA DE CONCURRENCIA EXITOSA: Se garantizó exactamente un solo reporte por pedido.')
  } else {
    console.error(`❌ PRUEBA DE CONCURRENCIA FALLIDA: Se encontraron ${count} reportes (esperado 1).`)
  }
}

runConcurrencyTest().catch(console.error)
