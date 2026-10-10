-- ════════════════════════════════════════════════════════════════════════════
-- Tindivo Entregas · consultas del MVP (Docs/Entregas/mvp-entregas-v1.md §5-§6)
--
-- Solo lectura. Se corren en el panel de Supabase (SQL editor) de tindivo-prod.
-- Con la CLI (`supabase db query --linked "…"`), de una en una: no acepta
-- varias sentencias en la misma llamada.
-- Cambia la fecha de la primera línea de cada consulta.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · CUADRE DE LA NOCHE ─────────────────────────────────────────────────
-- Lo que cobró cada motorizado, separado en Yape y efectivo. Cuenta por
-- `transport_collected_at` (el momento del cobro), así que incluye también
-- las entregas canceladas después de cobrar. Regla: lo cobrado se descuenta
-- del pago del turno (S/ 30 − cobrado).
with noche as (select date '2026-10-05' as d)
select
  coalesce(u.full_name, d.id::text)                                   as motorizado,
  count(*)                                                            as cobradas,
  sum(co.fee_amount) filter (where co.payment_method = 'yape')        as yape,
  sum(co.fee_amount) filter (where co.payment_method = 'cash')        as efectivo,
  sum(co.fee_amount)                                                  as total_cobrado,
  30 - sum(co.fee_amount)                                             as pagar_del_turno,
  count(*) filter (where co.status = 'cancelled')                     as cobradas_y_canceladas
from public.courier_orders co
join public.drivers d on d.id = co.driver_id
left join public.users u on u.id = d.user_id
cross join noche
where co.transport_collected_at is not null
  and (co.transport_collected_at at time zone 'America/Lima')::date = noche.d
group by 1
order by 1;

-- ── 2 · MEDICIÓN DEL PILOTO ────────────────────────────────────────────────
-- Canal: es WhatsApp si lo creó la cuenta de Jesús. Pon su UUID abajo (el
-- mismo que va en `app_settings.courier.unlimitedRequesterUserIds`).
with params as (
  select date '2026-10-05' as desde,
         '00000000-0000-0000-0000-000000000000'::uuid as cuenta_whatsapp
)
select
  (co.created_at at time zone 'America/Lima')::date                    as dia,
  case when co.customer_user_id = p.cuenta_whatsapp then 'whatsapp' else 'web' end as canal,
  count(*)                                                             as solicitudes,
  count(*) filter (where co.status = 'delivered')                      as entregadas,
  count(*) filter (where co.cancel_reason = 'no_driver')               as sin_motorizado,
  count(*) filter (where co.cancel_reason = 'not_ready')               as no_estaba_listo,
  count(*) filter (where co.cancel_reason = 'unreachable')             as no_contestan,
  count(*) filter (where co.cancel_reason = 'customer_cancelled')      as cancelo_cliente,
  count(*) filter (where co.cancel_reason = 'other')                   as otro,
  count(distinct co.requester_phone)                                   as solicitantes_distintos,
  round(percentile_cont(0.5) within group (
    order by extract(epoch from co.accepted_at - co.created_at) / 60)::numeric, 1) as min_hasta_aceptar,
  round(percentile_cont(0.5) within group (
    order by extract(epoch from co.picked_up_at - co.accepted_at) / 60)::numeric, 1) as min_hasta_recoger,
  round(percentile_cont(0.5) within group (
    order by extract(epoch from co.delivered_at - co.picked_up_at) / 60)::numeric, 1) as min_hasta_entregar
from public.courier_orders co
cross join params p
where (co.created_at at time zone 'America/Lima')::date >= p.desde
group by 1, 2
order by 1, 2;
