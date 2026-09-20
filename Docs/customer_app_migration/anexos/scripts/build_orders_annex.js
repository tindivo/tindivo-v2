// Genera anexos/B-orders-98-columnas.md
const fs = require('fs')
const OUT = 'D:/Tinkuy Creativo/Proyectos/Tindivo/Code/tindivo-v2/Docs/customer_app_migration/anexos/B-orders-98-columnas.md'

const RAW = `id, order_number, short_id, business_id, driver_id, customer_user_id, source, is_manual, customer_name, customer_phone, delivery_address, delivery_reference, delivery_coordinates_lat, delivery_coordinates_lng, delivery_maps_url, delivery_method, delivery_distance_band, order_amount, delivery_fee, payment_intent, payment_real, yape_amount, cash_amount, client_pays_with, change_to_give, yape_confirmed, cash_owed_at_delivery, tindivo_commission, comprobante_prepago_url, prep_time_minutes, estimated_ready_at, appears_in_queue_at, prep_extended_at, prep_extension_count, ready_early_used, occupancy_slots, status, urgent_since, assigned_at, validating_at, pending_acceptance_at, confirmed_at, preparing_at, waiting_driver_at, heading_at, waiting_at_restaurant_at, picked_up_at, delivered_at, cancelled_at, cancelled_by, cancel_reason, cancel_note, tracking_link_sent_at, tracking_link_sent_by, customer_notes, business_notes, driver_notes, created_at, updated_at, payment_verified_at, payment_verified_by, payment_proof_status, rejection_reason_code, rejection_reason_text, rejected_at, rejected_by, requires_validation, validated_at, validated_by, validation_result, customer_gps_lat, customer_gps_lng, customer_gps_accuracy_m, customer_gps_distance_to_center_km, customer_gps_validated_at, customer_gps_method, risk_flags, validation_reason_code, proof_attempt, commission_amount, delivery_fee_charged, cancel_reason_detail, validation_context, awaiting_payment_at, ready_early_at, cash_settlement_id, arrived_at_customer_at, arrived_at_customer_lat, arrived_at_customer_lng, arrived_at_customer_accuracy_m, address_directory_id, delivery_fee_source, queue_notified_at, change_advanced, delivery_coordinates_accuracy_m, delivery_location_confirmed_at, pickup_timing, ready_for_pickup_at`
const cols = RAW.split(',').map((s) => s.trim())

// Columnas que hoy devuelve get_tracking (lectura pública por short_id), con el nombre con que sale.
const TRACKING = {
  short_id: 'shortId', order_number: 'orderNumber', status: 'status', delivery_method: 'deliveryMethod',
  payment_intent: 'paymentIntent', cancel_reason: 'cancelReason', client_pays_with: 'paysWith',
  change_to_give: 'changeToGive', estimated_ready_at: 'estimatedReadyAt', delivered_at: 'deliveredAt',
  arrived_at_customer_at: 'arrivedAtCustomerAt', ready_early_used: 'readyEarlyUsed', ready_early_at: 'readyEarlyAt',
  order_amount: 'amount', delivery_fee: 'deliveryFee', created_at: 'createdAt', pending_acceptance_at: 'pendingAcceptanceAt',
  awaiting_payment_at: 'awaitingPaymentAt', validating_at: 'validatingAt', proof_attempt: 'proofAttempt',
  comprobante_prepago_url: 'proofUrl', payment_verified_at: 'paymentVerifiedAt',
}
// Además, el dueño lee directamente (RLS): customer_notes.
const OWNER_ONLY = new Set(['customer_notes'])

const GROUPS = [
  ['Identidad y ciclo de vida', 'id order_number short_id source is_manual created_at updated_at'],
  ['Partes involucradas', 'business_id driver_id customer_user_id address_directory_id'],
  ['Cliente (instantánea)', 'customer_name customer_phone'],
  ['Destino de entrega', 'delivery_method delivery_address delivery_reference delivery_coordinates_lat delivery_coordinates_lng delivery_coordinates_accuracy_m delivery_location_confirmed_at delivery_maps_url delivery_distance_band delivery_fee_source pickup_timing'],
  ['Importes y comisión', 'order_amount delivery_fee delivery_fee_charged tindivo_commission commission_amount cash_owed_at_delivery'],
  ['Pago y comprobante', 'payment_intent payment_real yape_amount cash_amount client_pays_with change_to_give change_advanced yape_confirmed comprobante_prepago_url payment_proof_status payment_verified_at payment_verified_by proof_attempt rejection_reason_code rejection_reason_text rejected_at rejected_by cash_settlement_id'],
  ['Preparación y reloj de cocina', 'prep_time_minutes estimated_ready_at appears_in_queue_at queue_notified_at prep_extended_at prep_extension_count ready_early_used ready_early_at ready_for_pickup_at occupancy_slots urgent_since'],
  ['Estado y sellos de tiempo', 'status pending_acceptance_at validating_at awaiting_payment_at confirmed_at preparing_at waiting_driver_at heading_at waiting_at_restaurant_at picked_up_at assigned_at arrived_at_customer_at arrived_at_customer_lat arrived_at_customer_lng arrived_at_customer_accuracy_m delivered_at'],
  ['Cancelación', 'cancelled_at cancelled_by cancel_reason cancel_reason_detail cancel_note'],
  ['Notas y avisos', 'customer_notes business_notes driver_notes tracking_link_sent_at tracking_link_sent_by'],
  ['Antifraude y validación', 'requires_validation validated_at validated_by validation_result validation_reason_code validation_context risk_flags customer_gps_lat customer_gps_lng customer_gps_accuracy_m customer_gps_distance_to_center_km customer_gps_validated_at customer_gps_method'],
]

const assigned = new Set()
const L = []
L.push('# Anexo B · `orders`: las 98 columnas por preocupación')
L.push('')
L.push('> **Generado por script** con la lista de columnas leída de `information_schema` en `tindivo-prod` (2026-09-20).')
L.push('> Sirve para **diseñar el modelo de lectura móvil** (`ARQ-05`, `ARQ-01`): la app de cliente **no** debe ver la tabla, sino un')
L.push('> `customer_order_view` con lo marcado ✔. La columna «Hoy al cliente» indica qué devuelve ya `get_tracking` (público por `short_id`) y con qué nombre.')
L.push('')
let total = 0
for (const [name, list] of GROUPS) {
  const names = list.split(/\s+/).filter(Boolean)
  L.push(`## ${name} (${names.length})`)
  L.push('')
  L.push('| Columna | Hoy al cliente |')
  L.push('|---|---|')
  for (const c of names) {
    if (!cols.includes(c)) console.log('AVISO: columna no existe en la lista:', c)
    assigned.add(c)
    const mark = TRACKING[c] ? `✔ \`${TRACKING[c]}\`` : OWNER_ONLY.has(c) ? '✔ solo el dueño (RLS)' : '—'
    L.push(`| \`${c}\` | ${mark} |`)
  }
  total += names.length
  L.push('')
}
const missing = cols.filter((c) => !assigned.has(c))
if (missing.length) {
  L.push(`## Sin clasificar (${missing.length})`)
  L.push('')
  for (const c of missing) L.push(`- \`${c}\``)
  L.push('')
}
L.push(`**Total: ${cols.length} columnas** (${assigned.size} clasificadas${missing.length ? `, ${missing.length} sin clasificar` : ''}).`)
L.push('')
L.push('## Lo que **no** debe ver el cliente en un modelo de lectura')
L.push('')
L.push('`business_notes`, `driver_notes`, `customer_phone` de otros, `risk_flags`, `validation_*`, `customer_gps_*` (evidencia antifraude),')
L.push('`tindivo_commission`, `commission_amount`, `delivery_fee_charged`, `cash_owed_at_delivery`, `*_by` (quién actuó), `rejection_reason_*`')
L.push('(la cajera), `tracking_link_sent_*`, `urgent_since`, `occupancy_slots`, `cash_settlement_id`.')
fs.writeFileSync(OUT, L.join('\n'), 'utf8')
console.log('Escrito', OUT, '| columnas:', cols.length, '| clasificadas:', assigned.size, '| sin clasificar:', missing.length, '| duplicadas en grupos:', total - assigned.size)
