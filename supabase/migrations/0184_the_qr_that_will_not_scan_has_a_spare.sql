-- =============================================================================
-- 0184 · El QR que no escanea tiene repuesto, y dice de quién es
-- =============================================================================
--
-- POR QUÉ.
--   Hasta hoy el cobro digital del negocio cabía en una sola columna:
--   `businesses.qr_url`. Una imagen, sin dueño y sin billetera. Eso arrastra
--   dos problemas de campo, y el segundo es el que duele:
--
--   1. UN SOLO QR. El QR impreso se moja, se raya o se subió mal escaneado, y
--      en la puerta del cliente no hay segunda oportunidad: el motorizado se
--      queda cobrando a mano, dictando un número de nueve dígitos. Es lento y
--      se teclea mal. `tindivo-delivery` (`yape-qr-card.tsx`) ya tenía dos QR
--      con pestañas por exactamente este motivo; v2 se portó sin esa red.
--
--   2. EL QR NO DICE DE QUIÉN ES. Ni de qué billetera. El número de respaldo
--      salía de `businesses.yape_number`, un campo suelto que no tiene por qué
--      corresponder al QR que se está enseñando —y si el negocio cobra por
--      Plin, el rótulo "Yape" mentía. Al transferir por número, Yape y Plin
--      enseñan el nombre del titular para que el que paga confirme que le está
--      pagando a quien debe; sin ese nombre a la vista, el cliente no puede
--      hacer esa comprobación.
--
--   Un QR de cobro, entonces, no es una imagen: es billetera + número +
--   titular + imagen. Cuatro campos que viajan juntos. Duplicarlos en
--   `businesses` serían ocho columnas nuevas y la palabra "secondary" repetida
--   por todo el esquema, así que van a su propia tabla.
--
-- CUÁNTOS CABEN.
--   Dos, por ahora: `check (slot in (1, 2))`. El tope vive en un CHECK y no en
--   la forma de la tabla justo para que abrirlo a tres sea una línea, no un
--   rediseño.
--
-- QUIÉN ES EL PRINCIPAL.
--   `businesses.default_payment_qr_slot`. Un puntero en el negocio, no un
--   `is_default` en la fila, y la diferencia importa: un booleano por fila
--   admite estados imposibles (dos principales, ninguno) y pide triggers para
--   defenderlos. El puntero no puede estar en dos sitios a la vez, y si apunta
--   a un slot que no existe el `order by` de lectura cae al que sí existe. Cero
--   triggers, cero invariantes que vigilar.
--
-- QUÉ PASA CON `businesses.qr_url`.
--   Se queda, DEPRECADA, y sin lectores nuevos. Los datos que tenga se copian
--   abajo al slot 1. No se borra en esta migración a propósito: si algo sale
--   mal en producción, la vuelta atrás es repuntar los lectores a la columna
--   vieja, que todavía tiene el dato. Bórrala en una migración posterior,
--   cuando lleve unas semanas sin que nadie la lea.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Billetera
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.payment_wallet as enum ('yape', 'plin');
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- Tabla
-- ----------------------------------------------------------------------------
create table if not exists public.business_payment_qrs (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  -- El hueco que ocupa, no el orden en que se enseña. Quién va primero lo dice
  -- `businesses.default_payment_qr_slot`.
  slot           smallint not null,
  wallet         public.payment_wallet not null default 'yape',
  -- El número al que se transfiere si el QR no escanea, y el nombre que Yape y
  -- Plin enseñan al confirmar. Los dos obligatorios: un QR sin plan B escrito
  -- es justo el caso que esta tabla existe para evitar.
  account_number text not null,
  account_name   text not null,
  -- La imagen puede faltar: un método de cobro solo-número sigue sirviendo.
  qr_url         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bpq_slot_range   check (slot in (1, 2)),
  constraint bpq_number_shape check (account_number ~ '^9[0-9]{8}$'),
  constraint bpq_name_present check (length(btrim(account_name)) between 2 and 80),
  constraint bpq_one_per_slot unique (business_id, slot)
);

comment on table public.business_payment_qrs is
  'Metodos de cobro digital del negocio (Yape/Plin): billetera, numero, titular y QR. Max. 2 por negocio (0184).';

create index if not exists idx_bpq_business on public.business_payment_qrs (business_id);

drop trigger if exists touch_business_payment_qrs on public.business_payment_qrs;
create trigger touch_business_payment_qrs before update on public.business_payment_qrs
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Puntero al principal
-- ----------------------------------------------------------------------------
alter table public.businesses
  add column if not exists default_payment_qr_slot smallint not null default 1;

alter table public.businesses drop constraint if exists businesses_default_qr_slot_range;
alter table public.businesses add constraint businesses_default_qr_slot_range
  check (default_payment_qr_slot in (1, 2));

comment on column public.businesses.default_payment_qr_slot is
  'Slot de business_payment_qrs que se ensena primero. Si el slot no existe, la lectura cae al otro (0184).';

comment on column public.businesses.qr_url is
  'DEPRECADA (0184). El QR vive en business_payment_qrs. Se conserva solo como red de vuelta atras.';

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.business_payment_qrs enable row level security;

drop policy if exists bpq_admin_all on public.business_payment_qrs;
create policy bpq_admin_all on public.business_payment_qrs for all to authenticated
  using ((select public.current_user_has_role('admin')))
  with check ((select public.current_user_has_role('admin')));

drop policy if exists bpq_owner_all on public.business_payment_qrs;
create policy bpq_owner_all on public.business_payment_qrs for all to authenticated
  using (business_id = (select public.current_business_id()))
  with check (business_id = (select public.current_business_id()));

-- El motorizado necesita el QR del local para cobrar en la puerta. Lo lee de
-- los negocios que tiene asignados, no de todos.
drop policy if exists bpq_driver_read on public.business_payment_qrs;
create policy bpq_driver_read on public.business_payment_qrs for select to authenticated
  using (
    (select public.current_user_has_role('driver'))
    and business_id in (
      select business_id from public.driver_restaurants
      where driver_id = (select public.current_driver_id())
    )
  );

-- El cliente NO lee esta tabla: el prepago se sirve por API (service_role), que
-- es donde ya se comprueba que el pedido es suyo. Sin policy para `customer`,
-- un QR de cobro no se puede enumerar desde el navegador.

-- ----------------------------------------------------------------------------
-- Datos: el QR que ya existia pasa a ser el slot 1
-- ----------------------------------------------------------------------------
-- `account_name` cae al nombre del negocio porque es lo unico que hay hoy: el
-- titular real nunca se pidio. Es una aproximacion honesta —en un piloto de un
-- restaurante suele coincidir— y el negocio la corrige desde Configuracion.
insert into public.business_payment_qrs (business_id, slot, wallet, account_number, account_name, qr_url)
select
  b.id,
  1,
  'yape'::public.payment_wallet,
  coalesce(b.yape_number, b.plin_number),
  left(btrim(b.name), 80),
  b.qr_url
from public.businesses b
where coalesce(b.yape_number, b.plin_number) ~ '^9[0-9]{8}$'
  and length(btrim(b.name)) >= 2
  and (b.qr_url is not null or b.yape_number is not null)
on conflict (business_id, slot) do nothing;
