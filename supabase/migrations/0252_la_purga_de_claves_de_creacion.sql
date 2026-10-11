-- ════════════════════════════════════════════════════════════════════════════
-- 0252 · Retención y purga de las claves de creación
--
-- Paso 0(c) de Docs/planes/movil/contrato-rest.md §3 (lote C4d del plan diario):
-- «la corrección define unicidad y retención de las claves».
--
-- RETENCIÓN: 7 días (`creation_idempotency.expires_at`, 0250), no las 24 h de la
-- tabla vieja. Una clave guardada con su pedido ya no puede quedar colgada, así
-- que alargar la retención no cuesta nada, y cierra la ventana en que un
-- reintento tardío (app que vuelve a abrirse, cola offline) podía crear un
-- pedido duplicado tras la purga. Pasados 7 días la clave se borra: un cliente
-- que reenvíe una creación con más de una semana ya no es un reintento.
-- **LOS 7 DÍAS SON UNA PROPUESTA PENDIENTE DE JESÚS.** El plan exige definir la
-- retención pero no fija el plazo; lo eligió el implementador y no está
-- aprobado. Cambiarlo es editar `expires_at` en 0250 (o su default) antes de
-- aplicar, o una migración posterior.
--
-- PURGA: `prune_creation_idempotency()` borra solo lo vencido. El cron existente
-- `prune-idempotency-keys` (0007, reprogramado aquí por nombre) pasa a purgar las
-- dos tablas: la vieja, que sigue sirviendo a fraude, incidentes y traspasos, y
-- la nueva. Misma hora (05:00 UTC), mismo nombre: no hay job nuevo que vigilar.
--
-- Idempotente: `create or replace`; `cron.schedule` reemplaza por nombre.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.prune_creation_idempotency() returns bigint
  language plpgsql security definer set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  -- ORDEN DE BLOQUEO: nueva primero y vieja después, el mismo que sigue
  -- `create_order_idempotently` (0251); y SKIP LOCKED, para que la purga nunca
  -- espere a una creación en curso (lo que esté en uso se purga mañana).
  delete from public.creation_idempotency
    where ctid in (
      select ctid from public.creation_idempotency
      where expires_at < now()
      for update skip locked
    );
  get diagnostics v_deleted = row_count;

  delete from public.idempotency_keys
    where ctid in (
      select ctid from public.idempotency_keys
      where expires_at < now()
      for update skip locked
    );
  return v_deleted;
end;
$$;

comment on function public.prune_creation_idempotency() is
  'Borra las claves de creacion vencidas (7 dias). La llama el cron prune-idempotency-keys. Devuelve cuantas borro. Solo service_role.';

revoke execute on function public.prune_creation_idempotency() from public, anon, authenticated;
grant execute on function public.prune_creation_idempotency() to service_role;

select cron.schedule('prune-idempotency-keys', '0 5 * * *', $cron$
  select public.prune_creation_idempotency();
$cron$);
