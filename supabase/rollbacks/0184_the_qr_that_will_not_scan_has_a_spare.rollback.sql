-- =============================================================================
-- ROLLBACK 0184 · El QR que no escanea tiene repuesto, y dice de quien es
-- =============================================================================
--
-- SE PUEDE VOLVER ATRAS SIN PERDER EL QR PRINCIPAL, y esa fue la razon de dejar
-- `businesses.qr_url` en pie: la 0184 no la borro ni la vacio, asi que el QR de
-- toda la vida sigue ahi. Antes de tirar la tabla, este script devuelve a esa
-- columna lo que el negocio haya subido despues —el slot que estuviera marcado
-- como principal— para no perder el trabajo hecho durante la ventana.
--
-- LO QUE SI SE PIERDE: el segundo QR, y el trio billetera/numero/titular de
-- ambos. La columna vieja es una URL suelta y no tiene donde guardarlos.
-- =============================================================================

-- Devolver el QR principal a la columna deprecada.
update public.businesses b
set qr_url = q.qr_url
from lateral (
  select q1.qr_url
  from public.business_payment_qrs q1
  where q1.business_id = b.id
  order by (q1.slot = b.default_payment_qr_slot) desc, q1.slot
  limit 1
) q
where q.qr_url is not null;

-- El numero del principal vuelve a `yape_number` solo si esa columna quedo
-- vacia; si tiene algo, era el dato original y no se pisa.
update public.businesses b
set yape_number = q.account_number
from lateral (
  select q1.account_number
  from public.business_payment_qrs q1
  where q1.business_id = b.id
  order by (q1.slot = b.default_payment_qr_slot) desc, q1.slot
  limit 1
) q
where b.yape_number is null;

drop table if exists public.business_payment_qrs;

drop type if exists public.payment_wallet;

alter table public.businesses drop constraint if exists businesses_default_qr_slot_range;
alter table public.businesses drop column if exists default_payment_qr_slot;

comment on column public.businesses.qr_url is null;
