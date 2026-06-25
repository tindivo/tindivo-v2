import { z } from 'zod'

/**
 * Enums canónicos del dominio. Esta es la FUENTE ÚNICA de la verdad: los enums
 * de Postgres (migración Fase 1B) deben coincidir EXACTAMENTE con estos arrays,
 * y un test de drift lo verifica contra `database.types.ts` generado.
 *
 * Cada enum exporta: el array `as const` (para iterar / generar SQL), el schema
 * Zod (para validar en boundaries) y el tipo TS.
 */

// --- Roles ---
// 'support' queda FUERA del piloto (Documento Maestro §0); se añade post-piloto.
export const USER_ROLES = ['customer', 'business', 'driver', 'admin'] as const
export const UserRoleSchema = z.enum(USER_ROLES)
export type UserRole = z.infer<typeof UserRoleSchema>

// --- Pedido: estados internos del backend (granular) ---
export const ORDER_STATUSES = [
  'validando', // contraentrega cliente nuevo / con strike: la cajera llama (5 min)
  'pending_acceptance', // negocio debe aceptar (5 min); en prepago valida comprobante (10 min)
  'confirmed', // negocio aceptó
  'preparing', // cocinando; prep_time fijado; +10 min máx 2 veces
  'waiting_driver', // listo para que un motorizado lo tome (panel plano en Fase 1)
  'heading_to_restaurant', // motorizado tomó el pedido, va al local
  'waiting_at_restaurant', // motorizado llegó al local ("He llegado")
  'picked_up', // motorizado recogió; declara banda (cerca/lejos)
  'delivered', // entregado; snapshot de comisión + suma a balance_due
  'cancelled', // terminal alternativo
] as const
export const OrderStatusSchema = z.enum(ORDER_STATUSES)
export type OrderStatus = z.infer<typeof OrderStatusSchema>

// --- Pedido: pasos del tracking que ve el CLIENTE (proyección a 4 pasos + cancelado) ---
export const TRACKING_STEPS = [
  'received',
  'preparing',
  'ontheway',
  'delivered',
  'cancelled',
] as const
export const TrackingStepSchema = z.enum(TRACKING_STEPS)
export type TrackingStep = z.infer<typeof TrackingStepSchema>

// --- Método de entrega ---
export const DELIVERY_METHODS = ['delivery', 'pickup'] as const
export const DeliveryMethodSchema = z.enum(DELIVERY_METHODS)
export type DeliveryMethod = z.infer<typeof DeliveryMethodSchema>

// --- Origen del pedido ---
export const ORDER_SOURCES = ['customer_pwa', 'business_manual'] as const
export const OrderSourceSchema = z.enum(ORDER_SOURCES)
export type OrderSource = z.infer<typeof OrderSourceSchema>

// --- Pago: intención al momento del pedido ---
export const PAYMENT_INTENTS = ['prepaid', 'pending_yape', 'pending_cash', 'pending_mixed'] as const
export const PaymentIntentSchema = z.enum(PAYMENT_INTENTS)
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>

// --- Pago: estado real al entregar ---
export const PAYMENT_REALS = [
  'paid_prepaid',
  'paid_yape',
  'paid_cash',
  'paid_mixed',
  'unpaid',
  'refunded',
] as const
export const PaymentRealSchema = z.enum(PAYMENT_REALS)
export type PaymentReal = z.infer<typeof PaymentRealSchema>

// --- Banda de distancia (Documento Maestro: 2 bandas, NO las 3 del spec) ---
export const DISTANCE_BANDS = ['near', 'far'] as const
export const DistanceBandSchema = z.enum(DISTANCE_BANDS)
export type DistanceBand = z.infer<typeof DistanceBandSchema>

// --- Capacidad primaria del negocio (derivada de 4 capacidades ortogonales) ---
export const BUSINESS_PRIMARY_CAPABILITIES = [
  'drivers_only',
  'catalog_pickup',
  'catalog_delivery',
  'catalog_full',
  'pickup_local',
] as const
export const BusinessPrimaryCapabilitySchema = z.enum(BUSINESS_PRIMARY_CAPABILITIES)
export type BusinessPrimaryCapability = z.infer<typeof BusinessPrimaryCapabilitySchema>

// --- Liquidación semanal de comisiones ---
export const SETTLEMENT_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'] as const
export const SettlementStatusSchema = z.enum(SETTLEMENT_STATUSES)
export type SettlementStatus = z.infer<typeof SettlementStatusSchema>

// --- Liquidación diaria de efectivo ---
export const CASH_SETTLEMENT_STATUSES = [
  'pending',
  'pending_confirmation',
  'confirmed',
  'disputed',
  'resolved',
  'auto_assumed_confirmed',
] as const
export const CashSettlementStatusSchema = z.enum(CASH_SETTLEMENT_STATUSES)
export type CashSettlementStatus = z.infer<typeof CashSettlementStatusSchema>

// --- Bandeja del admin: 6 tipos de reporte ---
export const REPORT_TYPES = [
  'no_show', // 1
  'rejected_proof_disputed', // 2
  'cash_difference', // 3
  'restaurant_fake', // 4
  'strike_reactivation', // 5
  'advance_dispute', // 6
] as const
export const ReportTypeSchema = z.enum(REPORT_TYPES)
export type ReportType = z.infer<typeof ReportTypeSchema>

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const
export const ReportStatusSchema = z.enum(REPORT_STATUSES)
export type ReportStatus = z.infer<typeof ReportStatusSchema>

// --- Razones de cancelación ---
export const CANCEL_REASONS = [
  'pending_acceptance_timeout', // negocio no aceptó en 5 min
  'validation_timeout', // cajera no validó al cliente nuevo/strike en 5 min
  'prepay_timeout', // cliente no subió comprobante en 10 min
  'business_cancelled',
  'admin_cancelled',
  'customer_cancelled', // solo antes de la aceptación o dentro de 2 min
  'no_show', // motorizado reportó que el cliente no se presentó (genera strike)
] as const
export const CancelReasonSchema = z.enum(CANCEL_REASONS)
export type CancelReason = z.infer<typeof CancelReasonSchema>

// --- Vehículo del motorizado ---
export const VEHICLE_TYPES = ['moto', 'bici', 'pie', 'auto'] as const
export const VehicleTypeSchema = z.enum(VEHICLE_TYPES)
export type VehicleType = z.infer<typeof VehicleTypeSchema>

// --- Adelanto del fondo de contingencia ---
export const CONTINGENCY_ADVANCE_STATUSES = ['activo', 'disputado', 'cancelado'] as const
export const ContingencyAdvanceStatusSchema = z.enum(CONTINGENCY_ADVANCE_STATUSES)
export type ContingencyAdvanceStatus = z.infer<typeof ContingencyAdvanceStatusSchema>

export const CONTINGENCY_ACTORS_CHARGED = ['restaurante', 'tindivo'] as const
export const ContingencyActorChargedSchema = z.enum(CONTINGENCY_ACTORS_CHARGED)
export type ContingencyActorCharged = z.infer<typeof ContingencyActorChargedSchema>

// --- Transferencia entre motorizados (modelado; UI fuera de Fase 1) ---
export const TRANSFER_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'expired',
  'invalidated',
] as const
export const TransferRequestStatusSchema = z.enum(TRANSFER_REQUEST_STATUSES)
export type TransferRequestStatus = z.infer<typeof TransferRequestStatusSchema>

/** Registro central de enums (para el test de drift contra el esquema de DB). */
export const DOMAIN_ENUMS = {
  user_role: USER_ROLES,
  order_status: ORDER_STATUSES,
  delivery_method: DELIVERY_METHODS,
  order_source: ORDER_SOURCES,
  payment_intent: PAYMENT_INTENTS,
  payment_real: PAYMENT_REALS,
  distance_band: DISTANCE_BANDS,
  business_primary_capability: BUSINESS_PRIMARY_CAPABILITIES,
  settlement_status: SETTLEMENT_STATUSES,
  cash_settlement_status: CASH_SETTLEMENT_STATUSES,
  report_type: REPORT_TYPES,
  report_status: REPORT_STATUSES,
  cancel_reason: CANCEL_REASONS,
  vehicle_type: VEHICLE_TYPES,
  contingency_advance_status: CONTINGENCY_ADVANCE_STATUSES,
  contingency_actor_charged: CONTINGENCY_ACTORS_CHARGED,
  transfer_request_status: TRANSFER_REQUEST_STATUSES,
} as const
