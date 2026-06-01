-- =============================================================================
-- 0001 · Extensiones y enums
-- Esquema consolidado v2. Idempotente (re-ejecutable). Los enums deben coincidir
-- EXACTAMENTE con `@tindivo/contracts` DOMAIN_ENUMS (test de drift en Fase 1C).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
-- pg_cron se habilita en 0007 (aislado): un problema de extensión no debe
-- bloquear la creación del esquema. Los crons son failsafe, no críticos.

-- --- Roles del sistema ('support' fuera del piloto) ---
do $$ begin
  create type public.user_role as enum ('customer', 'business', 'driver', 'admin');
exception when duplicate_object then null; end $$;

-- --- Estados de pedido (granular, backend). Incluye validando/confirmed/preparing ---
do $$ begin
  create type public.order_status as enum (
    'validando',
    'pending_acceptance',
    'confirmed',
    'preparing',
    'waiting_driver',
    'heading_to_restaurant',
    'waiting_at_restaurant',
    'picked_up',
    'delivered',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

-- --- Método de entrega ---
do $$ begin
  create type public.delivery_method as enum ('delivery', 'pickup');
exception when duplicate_object then null; end $$;

-- --- Origen del pedido ---
do $$ begin
  create type public.order_source as enum ('customer_pwa', 'business_manual');
exception when duplicate_object then null; end $$;

-- --- Pago: intención al crear ---
do $$ begin
  create type public.payment_intent as enum ('prepaid', 'pending_yape', 'pending_cash', 'pending_mixed');
exception when duplicate_object then null; end $$;

-- --- Pago: estado real al entregar ---
do $$ begin
  create type public.payment_real as enum (
    'paid_prepaid', 'paid_yape', 'paid_cash', 'paid_mixed', 'unpaid', 'refunded'
  );
exception when duplicate_object then null; end $$;

-- --- Banda de distancia (2 bandas — Documento Maestro corrige las 3 del spec) ---
do $$ begin
  create type public.distance_band as enum ('near', 'far');
exception when duplicate_object then null; end $$;

-- --- Capacidad primaria de negocio (derivada de 4 flags ortogonales) ---
do $$ begin
  create type public.business_primary_capability as enum (
    'drivers_only', 'catalog_pickup', 'catalog_delivery', 'catalog_full', 'pickup_local'
  );
exception when duplicate_object then null; end $$;

-- --- Liquidación semanal de comisiones ---
do $$ begin
  create type public.settlement_status as enum ('pending', 'paid', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;

-- --- Liquidación diaria de efectivo ---
do $$ begin
  create type public.cash_settlement_status as enum (
    'pending', 'pending_confirmation', 'confirmed', 'disputed', 'resolved', 'auto_assumed_confirmed'
  );
exception when duplicate_object then null; end $$;

-- --- Bandeja del admin: 6 tipos de reporte ---
do $$ begin
  create type public.report_type as enum (
    'no_show', 'rejected_proof_disputed', 'cash_difference',
    'restaurant_fake', 'strike_reactivation', 'advance_dispute'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- --- Razones de cancelación ---
do $$ begin
  create type public.cancel_reason as enum (
    'pending_acceptance_timeout', 'validation_timeout', 'prepay_timeout',
    'business_cancelled', 'admin_cancelled', 'customer_cancelled'
  );
exception when duplicate_object then null; end $$;

-- --- Vehículo del motorizado ---
do $$ begin
  create type public.vehicle_type as enum ('moto', 'bici', 'pie', 'auto');
exception when duplicate_object then null; end $$;

-- --- Adelanto del fondo de contingencia ---
do $$ begin
  create type public.contingency_advance_status as enum ('activo', 'disputado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.contingency_actor_charged as enum ('restaurante', 'tindivo');
exception when duplicate_object then null; end $$;

-- --- Transferencia entre motorizados (modelado; UI fuera de Fase 1) ---
do $$ begin
  create type public.transfer_request_status as enum (
    'pending', 'accepted', 'rejected', 'expired', 'invalidated'
  );
exception when duplicate_object then null; end $$;
