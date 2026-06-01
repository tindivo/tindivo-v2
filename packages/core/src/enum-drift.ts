import type { DOMAIN_ENUMS } from '@tindivo/contracts'
import type { Enums } from '@tindivo/supabase'

/**
 * RED DE SEGURIDAD DE TIPOS (compile-time). Si un enum de Postgres (generado en
 * @tindivo/supabase) y su equivalente en @tindivo/contracts divergen, `tsc`
 * FALLA aquí. Imposible que se desincronicen en silencio (lección del v1).
 * Este archivo no exporta nada en runtime; existe solo para el type-check.
 */

// Igualdad exacta de dos tipos (incl. uniones, orden-independiente).
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
type Dom = typeof DOMAIN_ENUMS

type _user_role = Assert<Equal<Dom['user_role'][number], Enums<'user_role'>>>
type _order_status = Assert<Equal<Dom['order_status'][number], Enums<'order_status'>>>
type _delivery_method = Assert<Equal<Dom['delivery_method'][number], Enums<'delivery_method'>>>
type _order_source = Assert<Equal<Dom['order_source'][number], Enums<'order_source'>>>
type _payment_intent = Assert<Equal<Dom['payment_intent'][number], Enums<'payment_intent'>>>
type _payment_real = Assert<Equal<Dom['payment_real'][number], Enums<'payment_real'>>>
type _distance_band = Assert<Equal<Dom['distance_band'][number], Enums<'distance_band'>>>
type _business_primary_capability = Assert<
  Equal<Dom['business_primary_capability'][number], Enums<'business_primary_capability'>>
>
type _settlement_status = Assert<
  Equal<Dom['settlement_status'][number], Enums<'settlement_status'>>
>
type _cash_settlement_status = Assert<
  Equal<Dom['cash_settlement_status'][number], Enums<'cash_settlement_status'>>
>
type _report_type = Assert<Equal<Dom['report_type'][number], Enums<'report_type'>>>
type _report_status = Assert<Equal<Dom['report_status'][number], Enums<'report_status'>>>
type _cancel_reason = Assert<Equal<Dom['cancel_reason'][number], Enums<'cancel_reason'>>>
type _vehicle_type = Assert<Equal<Dom['vehicle_type'][number], Enums<'vehicle_type'>>>
type _contingency_advance_status = Assert<
  Equal<Dom['contingency_advance_status'][number], Enums<'contingency_advance_status'>>
>
type _contingency_actor_charged = Assert<
  Equal<Dom['contingency_actor_charged'][number], Enums<'contingency_actor_charged'>>
>
type _transfer_request_status = Assert<
  Equal<Dom['transfer_request_status'][number], Enums<'transfer_request_status'>>
>
