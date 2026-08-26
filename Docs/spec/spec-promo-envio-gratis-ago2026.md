# Spec · Promoción de lanzamiento «envío gratis» (25–28 ago 2026)

Estado: **plan técnico, sin implementar**. Decisiones del §7 **confirmadas** (revisión del 25-ago).
Revisión 2 incorpora el tope global de exposición, el `reason` de la UX y los cupos restantes (§8).

---

## 1. Cinco hallazgos que cambian el enunciado

Antes del plan, lo que el código ya dice y que corrige o abarata partes del requerimiento.

### 1.1 La exclusión de los pedidos B2B es gratis

`create_business_manual_order` y `create_customer_order` son RPCs **distintas**, cada una con su
propio cálculo de `delivery_fee`. Si la promo vive dentro de `create_customer_order`, los manuales
quedan fuera **por construcción**: no hay que escribir ni un guard ni un test de exclusión, solo
un test de regresión que confirme que el manual sigue cobrando.

### 1.2 «No generar deuda» ya funciona solo

`generate_delivery_charges` (0124:128-148) hace exactamente esto al pasar a `delivered`:

```sql
v_delivery_fee := COALESCE(new.delivery_fee_charged, new.delivery_fee, 0);
IF v_delivery_fee > 0 THEN INSERT INTO business_charges (... 'delivery_fee' ...) END IF;
IF v_commission  > 0 THEN INSERT INTO business_charges (... 'commission'   ...) END IF;
```

Y `advance_order` en `pickup` (0146:448-451) hace `delivery_fee_charged := COALESCE(v_order.delivery_fee, ...)`,
que con `0` devuelve `0` (no es NULL, no cae al fallback).

Con `orders.delivery_fee = 0`: **no se inserta cargo de delivery, y el cargo de comisión de S/1.50
se inserta igual**. `balance_due` lo deriva `recalc_business_balance` de la suma de cargos pendientes,
así que tampoco hay saldo que corregir. El requisito «cero deuda + comisión intacta» se cumple
sin tocar el módulo financiero.

### 1.3 El «S/0 explícito en `business_charges`» choca con un CHECK, y creo que no debe hacerse

`business_charges.amount` es `numeric NOT NULL CHECK (amount > 0)` (0073:23). Meter la fila de S/0
exige relajar ese CHECK a `>= 0`.

**Recomiendo no hacerlo**, por una razón que no es de esquema sino de contabilidad:
`business_charges` es el ledger de **lo que el negocio le debe a Tindivo**. El coste de la promo no
lo asume el negocio —él nunca cobró ese envío—, lo asume Tindivo, que igual tiene que pagarle al
motorizado. Una fila de S/0 en el ledger del negocio no es un asiento: es un comentario disfrazado
de asiento, y ensucia justo la tabla donde el invariante «cargo = deuda» todavía se sostiene.

Lo que el requisito **quiere de verdad** —«que quede auditable qué pedidos usaron la promo y cuánto
costó»— lo da mejor una tabla propia (`promo_redemptions`, §3.2) que además resuelve el flag de
redención y el contador. Una tabla, tres requisitos.

Si aun así se prefiere la fila de S/0, lo que hay que revisar antes está en el §7, decisión 2.

### 1.4 `prepay_threshold` sí se mueve, aunque no lo toquemos

Esto es lo único del requerimiento que no se cumple gratis. Las tres reglas de pago comparan contra
`v_order_amount + v_delivery_fee` (0185:360, :367, :391):

| Regla | Hoy (pedido de S/79 + S/2) | Con envío gratis |
|---|---|---|
| `prepay_threshold` (S/80) | 81 > 80 → **exige prepago** | 79 → no exige |
| R1 monto declarado cubre total | cubre S/81 | cubre S/79 |
| R3 vuelto ≤ `max_change` | vuelto = declarado − 81 | vuelto = declarado − 79 (**S/2 más**) |

No estamos «modificando la regla de pago»: estamos cambiando su entrada. Es inevitable —el total
del pedido cambia— pero hay que decidirlo a propósito, no descubrirlo el jueves. Ver §7, decisión 3.

R3 es la que tiene mordida operativa real: cada pedido con promo saca S/2 más de la caja de la
cajera. Con `change_available` declarable por jornada (0185) eso ya es gestionable, pero conviene
avisarle.

### 1.5 Reservar en creación, redimir en entrega

El requisito dice «al completarse el pedido … marcar como redimido». Correcto para el flag final
—`delivered` es terminal (invariante 8), así que la marca no se deshace nunca—, pero **insuficiente
por sí solo**: entre crear y entregar hay 20-40 minutos en los que el cliente podría crear un
segundo pedido y llevarse dos envíos gratis.

Hoy eso lo tapa por accidente el guard de «un solo pedido activo por cliente + negocio»
(0185:179-196): con un restaurante en el piloto, es un guard global. **Deja de serlo el día que
entre un segundo negocio**, y no quiero que la promo dependa de eso.

Diseño: **reserva** en creación (misma transacción), **redención** en `delivered`, **liberación**
en `cancelled`. El candado es un índice único parcial, no una consulta previa: sin carrera posible.

---

## 2. Dónde vive la lógica

| Capa | Qué hace | Por qué ahí |
|---|---|---|
| `app_settings.promo_free_delivery` | ventana, código, `active` y **`max_redemptions`** | ajustable sin migración; el kill switch del §6 es un UPDATE, y el tope se puede subir o bajar en caliente |
| `create_customer_order` (RPC) | **decide y aplica** la elegibilidad, comprueba el **tope global bajo lock**, pone `delivery_fee = 0`, reserva | es la única transacción que ya tiene el pedido, el fee y las reglas de pago; y es donde 0162 ya dejó escrito que el precio **no** lo decide el navegador |
| trigger sobre `orders.status` | redime en `delivered`, libera en `cancelled` (y **devuelve el cupo al tope global**) | un solo sitio en vez de parchear las 5 funciones que cancelan |
| `current_customer_promo_free_delivery()` (RPC) | responde «¿te toca?» **y por qué no** (`reason`) para **pintar** | espejo exacto de `current_customer_trusted_for_contraentrega` (0171): el navegador muestra, la base decide |
| `apps/customer` checkout | pinta «GRATIS», el tachado, y el aviso de agotada / ya usada | display |
| `admin_promo_free_delivery_stats()` (RPC) | contador nuevo/recurrente + **cupos restantes** + coste | medición y monitoreo del número publicitado |

**No hay Edge Function.** No hace falta: no hay trabajo asíncrono, ni llamada externa, ni nada que
sobreviva a la transacción. Meter esto en una Edge Function partiría en dos la única cosa que tiene
que ser atómica (reservar el cupo y fijar el precio del pedido).

**No hay validación en el API route.** `apps/api/app/api/v1/customer/orders/route.ts:242` es un
pasamanos al RPC; su sitio es la defensa en profundidad de capacidades del negocio, no el precio.

---

## 3. Migración `0187`

> Antes de escribirla: `supabase migration list` para confirmar el primer número libre. El último
> archivo es `0186`, pero dos agentes pueden coger el mismo `NNNN_` y el error estalla lejos, en
> `schema_migrations`.

Nombre propuesto: `0187_the_first_delivery_of_the_launch_is_on_us.sql`.
Rollback obligatorio en `supabase/rollbacks/0187_….rollback.sql` (§6).

### 3.1 Configuración — `app_settings`

```sql
insert into public.app_settings (key, value) values
  ('promo_free_delivery', jsonb_build_object(
     'code',            'free-delivery-2026-08',
     'active',          true,
     'from',            '2026-08-25',   -- primera jornada
     'to',              '2026-08-28',   -- última jornada
     'max_redemptions', 100             -- tope global de exposición (§3.4-bis)
  ))
on conflict (key) do nothing;
```

`from`/`to` son **jornadas operativas**, no fechas naturales: la comparación es
`public.current_service_date() between from and to` (0154:31-39, la jornada arranca a las 05:00 de
Lima). Eso responde el «definir hora de corte exacta» sin inventar una hora: la ventana cierra el
**sábado 29 a las 05:00 hora de Lima**, es decir, un pedido tomado a las 00:40 del sábado sigue
siendo la jornada del viernes y entra. Es literalmente «fin de operación del viernes», y usa la
misma definición de día que ya usan la caja y las liquidaciones.

*No* hace falta añadir la key a la whitelist `as_public_read`: quien la lee es el RPC de
elegibilidad, que es `SECURITY DEFINER`. Solo habría que añadirla si marketing quiere pintar un
banner en la página del negocio sin llamar al RPC.

### 3.2 Tabla `promo_redemptions` — flag, ledger de la promo y contador

```sql
create table if not exists public.promo_redemptions (
  id                    uuid primary key default gen_random_uuid(),
  promo_code            text not null,
  customer_user_id      uuid not null references public.users(id) on delete cascade,
  verified_phone        text not null,              -- del perfil, NUNCA de p_customer_phone
  order_id              uuid not null references public.orders(id) on delete cascade,
  status                text not null default 'reserved'
                          check (status in ('reserved','redeemed','released')),
  waived_amount         numeric(10,2) not null,     -- lo que HABRÍA costado el envío
  distance_band         public.distance_band,
  prior_delivered_count int  not null,              -- 0 = primer pedido histórico
  had_delivery_history  boolean not null,           -- snapshot de customer_trusted_for_contraentrega
  reserved_at           timestamptz not null default now(),
  redeemed_at           timestamptz,
  released_at           timestamptz
);
```

Los dos candados, que son el corazón del diseño:

```sql
create unique index if not exists promo_redemptions_one_per_account_idx
  on public.promo_redemptions (promo_code, customer_user_id)
  where status in ('reserved','redeemed');

create unique index if not exists promo_redemptions_one_per_phone_idx
  on public.promo_redemptions (promo_code, verified_phone)
  where status in ('reserved','redeemed');
```

El segundo es lo que pedía el requerimiento al decir «atada a la cuenta verificada … para minimizar
duplicación de cuentas con el mismo número real»: dos cuentas distintas con el mismo WhatsApp
verificado **no pueden** sostener las dos la reserva. El teléfono sale de `customer_profiles`
(que `create_customer_order` ya exige verificado, 0185:206-214), nunca del parámetro
`p_customer_phone`, que el cliente elige libre — la misma disciplina de 0171.

`released` queda fuera del índice a propósito: un pedido cancelado devuelve el cupo, pero la fila
se conserva para auditoría.

**Persistencia tras el viernes**: nadie borra estas filas. La promo se apaga cambiando `active`,
no vaciando la tabla. El rollback tampoco la borra (§6).

**RLS** (invariante 3): `enable row level security` + policy de lectura propia
(`customer_user_id = auth.uid()`), escritura solo `service_role`. Sin esto `get_advisors` lo marca.

### 3.3 `orders.delivery_fee_source` acepta `'promo'`

Hoy: `check (delivery_fee_source is null or delivery_fee_source in ('business','system'))`
(0122:236-237). Se amplía a `('business','system','promo')`. Es el marcador **en el propio pedido**,
y con `delivery_distance_band` intacta la tarifa nominal sigue siendo reconstruible desde
`app_settings.delivery_bands` aunque `promo_redemptions` no existiera.

### 3.4 `create_customer_order` — `create or replace`, sin cambiar la firma

Un solo bloque nuevo, colocado **después del bucle de ítems** (0185:312-356) e **inmediatamente
antes de las validaciones de pago** (0185:358). Esquema:

```
si p_delivery_method = 'delivery' y v_delivery_fee > 0:
    -- mutex del tope global: bloquea la fila de configuración hasta el COMMIT
    select value into v_promo
      from public.app_settings
     where key = 'promo_free_delivery'
       for update;

    si v_promo.active y current_service_date() between from and to:
        select count(*) into v_taken
          from public.promo_redemptions
         where promo_code = v_promo.code
           and status in ('reserved','redeemed');

        si v_taken < v_promo.max_redemptions:
            insert into promo_redemptions (...status 'reserved', waived_amount = v_delivery_fee...)
            on conflict do nothing              -- SIN conflict target (§3.4-ter)
            returning id into v_redemption_id
            si v_redemption_id is not null:
                v_promo_applied := true;  v_delivery_fee := 0;  v_fee_source := 'promo'
```

`returning ... into` es cómo se sabe si la fila entró: con `do nothing` y conflicto, la variable
queda `NULL` (no es `INTO STRICT`, no levanta excepción).

Cuatro consecuencias de colocarlo justo ahí:

1. **Pickup no consume el cupo.** El guard `v_delivery_fee > 0` lo excluye: en pickup el envío ya es
   0 (0185:280-284) y regalar lo que es gratis quemaría la promo del cliente. Y quien no es
   elegible **nunca toma el lock**: el `for update` está dentro del `if`.
2. **Las validaciones de pago ven el importe efectivo**, porque todas leen `v_delivery_fee`. Es lo
   descrito en §1.4. Es también lo que obliga a que la reserva vaya antes de 0185:358 y no después.
3. **El `update` final ya existe** (0185:540-553): solo hay que añadirle
   `delivery_fee = v_delivery_fee, delivery_fee_source = v_fee_source`. No hace falta un UPDATE nuevo.
4. **Si algo revienta después, la reserva se va con la transacción** y el cupo no se consume. Mismo
   espíritu que el outbox del invariante 4.

Y una razón para no ponerlo antes, en el sitio que decía la revisión 1 (justo tras el `insert into
orders`): el lock del tope se sostiene **hasta el COMMIT**, así que todo lo que quede después entra
en la sección crítica. Bajarlo por debajo del bucle de ítems saca de ahí las N consultas de
`menu_items`, los N `insert` de líneas y los de modificadores — que es la parte más cara y la que
más varía con el tamaño del carrito.

### 3.4-bis · El tope global, y por qué el lock va sobre la fila de configuración

El requerimiento pedía «lock (`FOR UPDATE`) sobre el conteo». El instinto es correcto —`FOR UPDATE`
es la herramienta— pero **no se puede aplicar a un `count()`**: Postgres rechaza
`select count(*) … for update` con `FOR UPDATE is not allowed with aggregate functions`. Un lock
necesita filas que bloquear, y una agregación no las tiene. Peor: aunque se pudiera, bloquear filas
existentes no impide que otra transacción **inserte una nueva** — que es exactamente la carrera que
hay que cerrar. El candado tiene que estar sobre algo que todos los competidores toquen.

La fila `app_settings.promo_free_delivery` **es** ese algo: existe siempre, es única, y es
literalmente la definición de la promo. `select … for update` sobre ella serializa las reservas
entre sí y nada más. Es SQL llano, se ve en `pg_locks` como un lock de fila normal, y no introduce
ninguna primitiva nueva — **en todo el repo no hay un solo `pg_advisory_lock`**, y no quiero que la
promo de lanzamiento sea el sitio donde se estrena una.

Efecto secundario deseable: mientras hay reservas en vuelo, el UPDATE que cambia `max_redemptions`
o apaga la promo espera unos milisegundos. Es lo correcto — no se quiere mover el techo justo en
mitad de una cuenta.

**El conteo se deriva, no se acumula.** `v_taken` sale de `count(*) … where status in
('reserved','redeemed')` sobre `promo_redemptions`, no de un contador que suba y baje. Es la misma
lección que 0124 aplicó a `balance_due` («recálculo COMPLETO, no incremental… auto-reparable»):
un contador dedicado se desincroniza el día que una fila entre o salga por un camino que nadie
previó, y entonces el tope publicitado miente en la dirección cara. Derivado no puede desviarse.

Corolario que hay que decidir a propósito: **`released` no cuenta, así que cancelar devuelve el
cupo al tope global**, igual que se lo devuelve al cliente. Es coherente con §3.5 y evita que un
restaurante rechazando pedidos consuma la promo publicitada sin entregar nada.

**Sobre el número.** Con ~10 pedidos/noche × 4 noches, el piloto entrega del orden de 40 pedidos;
un tope de 100 probablemente **no llega a morder nunca**, y el techo que sí muerde es físico: un
motorizado. Conviene tenerlo claro: `max_redemptions` es una barrera de exposición financiera para
el escenario del video/influencer, no un instrumento de racionamiento. Como es un camino que casi
seguro no se ejecuta en producción, el **único** sitio donde se va a probar de verdad es el test de
concurrencia del §5 — razón de más para que ese test sea serio.

### 3.4-ter · Por qué el `on conflict do nothing` va **sin** conflict target

Es el punto de validación que pedía la revisión, y la respuesta es que la ventana de carrera entre
los dos índices **no existe**, siempre que no se especifique el target:

- `insert … on conflict do nothing` **sin** target arbitra contra **todas** las restricciones únicas
  de la tabla. Los dos índices parciales (`…_one_per_account_idx` y `…_one_per_phone_idx`) quedan
  cubiertos por la misma inserción especulativa: o entran los dos índices o no entra ninguno.
- `insert … on conflict (promo_code, customer_user_id) where … do nothing` —con target— cubre **solo
  ese** índice. Una colisión contra el de teléfono levantaría `unique_violation` (23505) y abortaría
  la transacción entera, tumbando el pedido en vez de cobrarle el envío. Es el bug que este párrafo
  existe para prevenir; **queda prohibido escribir el target aquí**.
- Contra inserciones simultáneas de la misma clave, la segunda transacción **espera** a que la
  primera confirme o aborte antes de resolver el `do nothing`. No hay lectura sucia ni ventana.

Contrapartida aceptada: con `do nothing` sin target no se sabe *cuál* de los dos índices chocó, solo
que no entró. A `create_customer_order` le da igual —no aplica la promo y sigue—, y quien sí
necesita distinguir el motivo es el RPC de lectura del §3.6, que consulta sin insertar y puede
mirar lo que quiera.

### 3.4-quater · Config ausente: fallar cerrado, y hacerlo a propósito

Si la key `promo_free_delivery` no existe, el `select … into v_promo … for update` **no lanza nada**:
`INTO` sin `STRICT` deja la variable en `NULL`, `FOUND` en false, y el `for update` no bloquea nada
porque no hay fila. Como `v_promo` es **jsonb** (no un `record`), `v_promo ->> 'active'` sobre NULL
da NULL, y un `if NULL then` no entra. O sea: hoy el caso ya degrada a «no aplica la promo» y el
pedido se crea normal.

Pero eso funciona **por propagación implícita de NULL**, que es justo lo que se rompe la próxima vez
que alguien reordene el bloque. Se hace explícito:

```
if not found then
   -- no hay promo configurada: pedido normal, sin cargo emocional
else
   v_active := coalesce((v_promo ->> 'active')::boolean, false);
   v_max    := (v_promo ->> 'max_redemptions')::int;
   ...
end if;
```

**La polaridad de las comparaciones es la parte que de verdad importa.** Todas las condiciones se
escriben en positivo —«aplicar solo si consta que X»— y nunca en negativo —«saltar si consta que
no X»—. Con NULL las dos formas no son equivalentes:

| Forma | Con `max_redemptions` = NULL |
|---|---|
| `if v_taken < v_max then aplicar` | NULL → no entra → **no aplica** ✅ |
| `if v_taken >= v_max then saltar` | NULL → no entra → **aplica, sin techo** ❌ |

La segunda regala envíos sin límite ante una config a medio editar. Lo mismo vale para
`current_service_date() between from and to`: en positivo, un `from` ausente cierra la promo; en
negativo, la abriría para siempre. **Cualquier campo que falte tiene que degradar a "no hay promo",
nunca a "promo sin límite".**

Cuándo pasa esto de verdad, que es estrecho pero no hipotético: durante la ventana del rollback
(paso 5 del §6, por eso va detrás del paso 1), en una base local reseteada sin la migración, en los
tests, y el día que alguien edite el JSON desde el panel de admin y se deje un campo.

`prior_delivered_count` y `had_delivery_history` se capturan **en la reserva**, no en la entrega:
es el único momento en que «¿era nuevo cuando pidió?» tiene respuesta correcta.

El payload de retorno (0185:572-576) ya devuelve `deliveryFee` y `total` desde `v_delivery_fee`, así
que la pantalla de confirmación muestra S/0 sola. Se añade `'promoApplied', v_promo_applied` para
que el frontend pueda celebrarlo.

### 3.5 Trigger de liquidación de la reserva

```sql
create or replace function public.promo_settle_redemption() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'delivered' and old.status <> 'delivered' then
    update public.promo_redemptions
       set status = 'redeemed', redeemed_at = now()
     where order_id = new.id and status = 'reserved';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.promo_redemptions
       set status = 'released', released_at = now()
     where order_id = new.id and status = 'reserved';
  end if;
  return null;
end $$;
```

`AFTER UPDATE OF status ON public.orders FOR EACH ROW`. Independiente de
`trg_generate_delivery_charges`; el orden entre ambos da igual.

Por qué un trigger y no tocar las funciones que cancelan: son **cinco** (`expire_order`,
`cancel_customer_order`, `cancel_expired_prepay_orders`, el cancel de admin y el barrido de prepago
vencido) y `cancelled` es el estado terminal de todas — no existe un enum `expired`. Un trigger las
cubre todas y cubre la sexta que se escriba mañana.

**Liberar en cancelación es una decisión de negocio**, no un detalle: si el restaurante rechaza el
pedido, el cliente no debe perder su envío gratis. El coste de abuso es nulo — puede cancelar mil
veces y seguirá teniendo un solo envío gratis.

### 3.6 RPC de elegibilidad (para pintar)

```sql
create or replace function public.current_customer_promo_free_delivery() returns jsonb
  language plpgsql stable security definer set search_path = ''
```

Devuelve `{ eligible, code, reason }` para `auth.uid()`. No acepta a quién preguntar —igual que
`current_customer_trusted_for_contraentrega`—, `grant execute to authenticated`.

Es **informativo**: quien decide sigue siendo `create_customer_order`. Con reserva atómica en la
creación, un `eligible: true` obsoleto no regala nada. Por eso el RPC es `stable` y **no toma el
lock del §3.4-bis**: es una lectura para pintar, y serializar el pintado sería pagar el coste del
candado sin ninguna de sus garantías.

`reason` se evalúa en este orden, y el orden importa:

| # | Condición | `reason` | `eligible` |
|---|---|---|---|
| 1 | no hay config, o `active = false` | `inactive` | false |
| 2 | `current_service_date()` fuera de `[from, to]` | `outside_window` | false |
| 3 | esta cuenta **o su teléfono verificado** ya tiene fila `reserved`/`redeemed` | `already_redeemed` | false |
| 4 | `count(reserved+redeemed) >= max_redemptions` | `exhausted` | false |
| 5 | resto | `active` | true |

**3 antes de 4** a propósito: a quien ya usó su envío gratis hay que decirle eso, no «se agotó» —
que además sería una acusación falsa al resto de la operación.

`already_redeemed` cubre también el caso «tengo una reserva en curso» (`reserved`). En la práctica
casi no se ve, porque el guard de un pedido activo por cliente+negocio (0185:179-196) ya lo corta
antes, pero el copy del §4 conviene que sirva para los dos.

**Nomenclatura**: los valores van en inglés, como el resto del código y la DB. La revisión los
propuso como `active | agotado | fuera_de_ventana | ya_redimido`, que además mezcla los dos idiomas
en un mismo enum (`active` ya venía en inglés). El mapa a español vive en el §4, que es donde vive
el idioma del producto. Si se prefieren los literales en español, es un `find/replace` de cuatro
valores en dos archivos — decidir antes de escribir, no después.

El RPC **no** devuelve cuántos cupos quedan. Podría, y es una línea; se deja fuera porque enseñarle
al cliente un contador de escasez en vivo es una decisión de producto, no un detalle técnico, y una
mal calibrada se lee como presión artificial. El número vive en el panel admin (§3.7).

### 3.7 El contador — RPC, no vista (corrección de la revisión 1)

La revisión 1 proponía una vista `promo_free_delivery_stats with (security_invoker = true)`.
**Se descarta**, por tres razones que se ven al mirar el repo:

1. **No hay una sola vista en las 186 migraciones.** El patrón establecido para métricas de admin es
   una función `STABLE SECURITY DEFINER` llamada con el cliente `service` desde el route — es
   exactamente lo que hace `admin_metrics` (0116) desde `apps/api/.../admin/metrics/route.ts:35`.
2. **`security_invoker = true` habría devuelto una vista vacía.** Con la RLS del §3.2 (lectura solo
   de las filas propias), un admin leyendo la vista como usuario no vería ninguna redención ajena.
   El bug no habría dado error: habría dado ceros, que es peor.
3. **`cupos_restantes` obliga a leer `app_settings`**, cuya única policy de lectura pública es la
   whitelist `as_public_read`, donde `promo_free_delivery` **no** está (§3.1). Con `security_invoker`
   el `max_redemptions` habría llegado `NULL` y `cupos_restantes` con él.

Las tres desaparecen con una RPC `SECURITY DEFINER`, que además evita tener que meter la key en la
whitelist pública solo para que funcione una métrica interna:

```sql
create or replace function public.admin_promo_free_delivery_stats()
  returns jsonb
  language plpgsql stable security definer set search_path = ''
```

Devuelve, para el código de promo vigente en `app_settings`:

| campo | cómo |
|---|---|
| `code`, `maxRedemptions`, `activa`, `from`, `to` | de `app_settings.promo_free_delivery` |
| `redimidos` | `count(*) filter (where status = 'redeemed')` |
| `clientesNuevos` | `… and prior_delivered_count = 0` |
| `clientesRecurrentes` | `… and prior_delivered_count > 0` |
| `enCurso` | `count(*) filter (where status = 'reserved')` |
| `liberados` | `count(*) filter (where status = 'released')` |
| **`cuposRestantes`** | `max_redemptions - count(*) filter (where status in ('reserved','redeemed'))` |
| `costoPromo` | `sum(waived_amount) filter (where status = 'redeemed')` |

Dos detalles que no son cosméticos:

- **Parte de la configuración, no de las redenciones.** Se lee `app_settings` primero y se agregan
  las redenciones encima con un `left join` conceptual. Si se agrupara por `promo_redemptions`, con
  cero pedidos la consulta devolvería **cero filas** y el panel no podría enseñar «quedan 100» — que
  es justo el estado en el que hay que mirarlo: antes de que empiece.
- **`cuposRestantes` usa `reserved + redeemed`**, la misma expresión exacta que el tope del §3.4-bis.
  Si las dos se escriben por separado y una cambia, el panel dice una cosa y el candado hace otra.
  Van juntas en la misma migración y el test 14 del §5 las amarra.

`grant execute` solo a `service_role`; el route de admin la llama con el cliente de servicio, igual
que `admin_metrics`, y la autorización la hace el route.

«Nuevo» = `prior_delivered_count = 0`. Se guarda también `had_delivery_history` (la definición
ancha de 0171/0182: entregas del teléfono verificado y del directorio del v1) porque las dos
respuestas a «¿era nuevo?» son distintas y en el piloto la diferencia es grande. Guardar el dato
crudo evita atarse hoy a una definición.

---

## 4. Frontend (`apps/customer`)

| Archivo | Cambio |
|---|---|
| `features/checkout/hooks/use-checkout-auth.ts:126-129` | añadir la llamada al RPC de elegibilidad junto a la de `current_customer_trusted_for_contraentrega` (mismo `await`, sin round-trip extra); guardar `{ eligible, reason }` |
| `features/checkout/hooks/use-checkout-state.ts:169-171` | `deliveryFee = promo.eligible && deliveryMethod === 'delivery' ? 0 : (band === 'far' ? bands.far : bands.near)`; exponer `promoReason` en el estado |
| `features/checkout/components/unified-checkout.tsx:318` | pintar `GRATIS` con el nominal tachado, y el aviso que corresponda al `reason` |

Mapa de `reason` a lo que ve el cliente:

| `reason` | envío | aviso en el checkout |
|---|---|---|
| `active` | **GRATIS**, con el nominal tachado | «Promo de lanzamiento: tu envío va por nuestra cuenta.» |
| `exhausted` | tarifa normal | «La promo de envío gratis se agotó.» |
| `already_redeemed` | tarifa normal | «Ya usaste tu envío gratis de lanzamiento.» |
| `outside_window` | tarifa normal | **ninguno** |
| `inactive` | tarifa normal | **ninguno** |

Los dos «ninguno» son deliberados y se apartan un poco de lo que pedía la revisión («cada `reason`
a un mensaje visible»). El motivo: en septiembre, un cartel que diga «promoción agotada» habla de
algo que ya no existe — no informa, confunde, y hace parecer que el cliente llegó tarde a algo que
sigue en pie. Cuando la promo no está viva, el checkout debe verse exactamente como antes de que
existiera. `exhausted` sí se pinta, porque ahí el cliente **sí** llegó tarde a algo real, el número
se publicó, y la ausencia de explicación es justo el fallo silencioso que la revisión quería cerrar.

**Ante fallo del RPC, `eligible` se queda en `false` y `reason` en `inactive`** — es decir, tarifa
normal y ningún cartel. Ojo: aquí el lado seguro es el **contrario** al del caso contraentrega.
Mostrar S/2 y que el servidor cobre S/0 es una sorpresa agradable; mostrar S/0 y que cobre S/2 es
una queja al WhatsApp de soporte. Y anunciar «agotada» por un timeout de red sería peor que callar.

**Sin cambios** en tracking, negocios ni motorizados: todos leen `order_amount + delivery_fee` de la
fila del pedido, así que el S/0 se propaga solo a la tarjeta del motorizado, al total de la cajera y
al detalle del cliente.

**Fuera de alcance por construcción**: los negocios en modo catálogo (WhatsApp) no pasan por
`create_customer_order` — su pedido se arma en `apps/customer/lib/whatsapp.ts` y se cierra por chat.
La promo **no** les aplica. Ver §7, decisión 5.

---

## 5. Pruebas

Nuevo `apps/api/lib/__tests__/promo-free-delivery.integration.test.ts` (integración contra la base
local, como el resto):

1. Cuenta elegible, delivery, dentro de ventana → `delivery_fee = 0`, `delivery_fee_source = 'promo'`, fila `reserved`.
2. Segundo pedido de la misma cuenta → cobra tarifa normal.
3. Dos cuentas distintas con el **mismo teléfono verificado** → la segunda paga.
4. Pickup → no cobra envío (ya era 0) y **no** consume el cupo.
5. Fuera de ventana (`current_service_date` fuera de rango) → cobra normal.
6. `create_business_manual_order` en plena ventana → cobra normal (regresión de §1.1).
7. Cancelación → `released`, y el cliente vuelve a ser elegible.
8. Entrega → `redeemed`, **cero** filas `delivery_fee` en `business_charges` para ese pedido, y **una** fila `commission` de S/1.50.
9. Pedido de S/79 con promo y `prepay_threshold` = 80 → **no exige prepago** (decisión §7.3 confirmada: monto efectivo).

**Tope global** (§3.4-bis):

10. **Secuencial.** `max_redemptions = 3`, tres cuentas distintas redimen, la cuarta paga tarifa y su RPC de elegibilidad devuelve `exhausted`.
11. **Concurrente — el que importa.** Con `max_redemptions` dejando **2 cupos**, lanzar 8 `create_customer_order` simultáneos con `Promise.all`, cada uno con cuenta y teléfono verificado **distintos** (si no, saltan los índices por cuenta/teléfono y el test mide otra cosa). Asertos: exactamente **2** pedidos con `delivery_fee = 0`, **6** con tarifa, y `count(reserved+redeemed) = max_redemptions` **exacto**, nunca mayor. Repetir la ronda ≥5 veces con estado limpio: una carrera que se corre una sola vez no prueba nada. Registrar además el **tiempo de pared** de la ronda — es la medición de cuánto serializa el lock del §3.4-bis, y quiero ese número **antes** del push, no después.
12. **Colisión simultánea contra los dos índices parciales** (el punto de validación pedido). Dos parejas lanzadas a la vez con `Promise.all`: (a) dos pedidos de la **misma cuenta** → dispara `one_per_account_idx`; (b) dos pedidos de **cuentas distintas con el mismo teléfono verificado** → dispara `one_per_phone_idx`. Asertos: **ninguna** llamada devuelve `unique_violation` (SQLSTATE 23505) hacia arriba, ninguna tumba el pedido, y exactamente **uno** de cada pareja sale con envío gratis. Esto es lo que amarra que el `on conflict do nothing` **sin conflict target** cubre los dos índices (§3.4-ter); si alguien añade el target más adelante, este test se pone rojo.
13. **La cancelación devuelve el cupo al tope global.** Con el tope agotado, cancelar un pedido con reserva → `cuposRestantes` vuelve a 1 y un cliente distinto lo toma.

**Medición** (§3.7):

14. `admin_promo_free_delivery_stats()` con reservas en curso: `cuposRestantes` = `max_redemptions − (reserved + redeemed)`, y la suma cuadra con el conteo directo sobre la tabla. Con **cero** redenciones debe devolver una fila con `cuposRestantes = max_redemptions`, no vacío.
15. El contador nuevo/recurrente: `clientesNuevos + clientesRecurrentes = redimidos`, con al menos un caso de cada lado.

**Config ausente o incompleta** (§3.4-quater):

16. Tres variantes, mismo aserto en las tres: (a) la key `promo_free_delivery` **no existe**;
    (b) existe pero sin `active`; (c) existe pero sin `max_redemptions`. En los tres casos el pedido
    **se crea normal**, con tarifa cobrada, sin fila en `promo_redemptions` y **sin excepción**.
    Es el caso que la revisión 2 detectó ausente, y el que separa «la promo no aplica» de «el pedido
    se cae».

Los tests 11 y 12 necesitan varias cuentas verificadas nuevas. Las suites de integración ya dejan
negocios huérfanos por seis vías distintas: **todo fixture nuevo se da de alta en el `globalSetup`
de vitest**, o esto se convierte en la séptima.

Antes de correr nada: los fixtures e2e acumulan historial permanente y `db reset` no repone el
mundo. Secuencia obligatoria si se resetea: `supabase db reset` → `pnpm db:seed:e2e`. Y ojo con
sembrar demo para mirar la UI y luego correr `pnpm test`.

Chequeos: `pnpm lint` y `check:ds` están rojos de base en `main`; comparar contra HEAD limpio antes
de atribuirse un fallo.

Tras el `supabase db push`: `pnpm db:types` y `get_advisors` (la tabla nueva sin RLS sale ahí).

### 5-bis · El número de migración se verifica **dos veces**, y la segunda es la que cuenta

`0187` es el número libre **en el momento de escribir este plan**. No es un dato, es una foto. El
working tree se mueve solo —otro agente escribe en él— y entre la escritura y el push pueden
aparecer migraciones nuevas. Si dos cogen el mismo `NNNN_`, el error estalla en `schema_migrations`
y apunta a un sitio que no tiene nada que ver.

Protocolo, no recordatorio:

1. `supabase migration list` **al crear el archivo**.
2. `git status supabase/migrations && git log --oneline -5 -- supabase/migrations` y
   `supabase migration list` otra vez **como último paso antes del `db push`**, ya con el archivo
   escrito y revisado. Si el número cambió, renumerar **ahí**, no discutirlo.
3. Renumerar toca exactamente tres sitios: el nombre del archivo de migración, el nombre del archivo
   de rollback, y las dos cabeceras que se citan mutuamente. **Nada más**, y eso es a propósito:
   ningún identificador de esta migración lleva el número dentro (`promo_redemptions`,
   `promo_settle_redemption`, `promo_redemptions_one_per_phone_idx`…). Renumerar es un `git mv` y
   dos líneas, no una relectura.

La verificación va contra local **y** remoto: `supabase migration list` muestra las dos columnas, y
lo que importa antes de un `db push` es la del remoto.

---

## 6. Rollback

Archivo: `supabase/rollbacks/0187_the_first_delivery_of_the_launch_is_on_us.rollback.sql`.

**El rollback rápido no es este archivo.** Es una sentencia, sin deploy y sin migración:

```sql
update public.app_settings
   set value = jsonb_set(value, '{active}', 'false'::jsonb)
 where key = 'promo_free_delivery';
```

A partir de ese instante `create_customer_order` cobra envío otra vez. Los pedidos ya creados con
S/0 se respetan (su precio ya está en la fila), y las reservas en curso liquidan normal por trigger.
Esa es la vía por defecto ante cualquier susto un jueves a las 21:00.

El archivo de rollback, para deshacer el esquema:

1. `create or replace function public.create_customer_order(...)` con el **cuerpo literal de 0185**,
   pegado carácter por carácter. Es lo que exige `create or replace` y es la parte que hay que
   preparar **antes** del push, no improvisar durante la caída.
2. `drop trigger if exists` + `drop function if exists public.promo_settle_redemption()`.
3. `drop function if exists public.admin_promo_free_delivery_stats();`
4. `drop function if exists public.current_customer_promo_free_delivery();`
5. `delete from public.app_settings where key = 'promo_free_delivery';`

Ojo con el orden del paso 5: borrar la fila de configuración **después** de restaurar
`create_customer_order` (paso 1). Al revés, entre las dos sentencias queda una ventana en la que la
función vieja-con-promo hace `select … from app_settings … for update` sobre una fila que ya no
existe; con el `if` de `active` sobre un `NULL` no aplicaría la promo —no regala nada—, pero es una
ventana innecesaria en el peor momento posible.

Un tercer freno, entre el kill switch y el rollback completo: **bajar `max_redemptions` a 0**. Deja
de aplicarse la promo a pedidos nuevos, `reason` pasa a `exhausted` (con su cartel, que es cierto),
las reservas en vuelo liquidan normal, y no se toca ni una función. Es la palanca correcta si el
problema es el coste y no un fallo técnico.

Y dos cosas que el rollback **no** hace, a propósito:

- **No borra `promo_redemptions`.** El requisito pide que la auditoría sobreviva al viernes; con más
  razón sobrevive a un rollback. Si algún día hay que purgarla, que sea un script aparte y a mano.
- **No restaura el CHECK de `delivery_fee_source` a `('business','system')`.** Si ya existe un pedido
  con `'promo'`, ese `ALTER` **falla** y deja el rollback a medias — el peor momento posible para
  descubrirlo. El CHECK ancho se queda; un valor permitido que nadie escribe no hace daño, y borrar
  el marcador de los pedidos que sí usaron la promo sería destruir la evidencia para poder revertir.

---

## 7. Decisiones — **confirmadas** en la revisión del 25-ago

Todas quedaron como estaban recomendadas. Se conservan aquí como registro de por qué.

| # | Decisión | Resuelto |
|---|---|---|
| 1 | **Hora de corte** | `current_service_date()` entre `2026-08-25` y `2026-08-28` → cierre **sábado 29, 05:00 Lima**. Es «fin de operación del viernes» con la definición de jornada que ya usa la caja, y no inventa una hora nueva. |
| 2 | **¿Fila de S/0 en `business_charges`?** | **No.** `promo_redemptions` como ledger de la promo (§1.3). Si se insiste: relajar el CHECK a `>= 0` obliga a auditar antes `settle_business_charges`, la pantalla admin de cargos, `recalc_business_balance` y el historial de cargos, y a decidir qué muestra la UI del negocio ante un cargo de S/0. |
| 3 | **`prepay_threshold`: ¿total nominal o efectivo?** | **Efectivo** (no hacer nada). El riesgo que mide el umbral es el dinero expuesto, y con promo el cliente debe S/2 menos. Elegir «nominal» es código extra: guardar el fee pre-promo en una variable aparte y usarla solo en la línea 360. |
| 4 | **¿Pickup consume el cupo?** | **No.** Quemaría la promo regalando algo que ya era gratis. |
| 5 | **¿Aplica a negocios en modo catálogo (WhatsApp)?** | **No.** Su pedido no pasa por la plataforma, no hay dónde aplicar ni cómo medirlo. Si se quiere, es otra conversación (y otro mecanismo: se lo tendría que descontar la cajera a mano). |
| 6 | **Nombre del código** | `free-delivery-2026-08` en la DB (código en inglés, por convención) y «promo de lanzamiento» en la UI. |

---

## 8. Revisión 2 — qué entró, y lo que queda por confirmar

### Lo que se incorporó

| Hueco | Dónde vive ahora |
|---|---|
| 1 · Tope global de exposición | `max_redemptions: 100` en §3.1; chequeo atómico en §3.4 y §3.4-bis, dentro de la **misma** RPC `create_customer_order` y en el **mismo** bloque que la reserva; tests 10-13 del §5 |
| 2 · `reason` diferenciado + copy | §3.6 (orden de precedencia) y §4 (mapa a mensaje) |
| 3 · Cupos restantes | §3.7, en `admin_promo_free_delivery_stats()`; test 14 |
| Validación de los dos índices | §3.4-ter (por qué no hay ventana) + test 12 (que lo amarra) |

### Tres cosas de la revisión que hay que aprobar porque cambian lo pedido

1. **El lock no puede ir sobre el conteo.** `select count(*) … for update` no es SQL válido en
   Postgres. Va sobre la fila `app_settings.promo_free_delivery`, que es el recurso que todos los
   competidores tocan. Detalle y alternativas en §3.4-bis.
2. **El contador es una RPC, no una vista.** La vista `security_invoker` del plan original habría
   devuelto ceros a un admin (RLS del §3.2) y `NULL` en `cupos_restantes` (whitelist del §3.1). El
   repo no tiene ni una vista; sí tiene el patrón `admin_metrics`. §3.7.
3. **`outside_window` e `inactive` no pintan ningún cartel**, en contra de «cada `reason` a un
   mensaje visible». Un «promoción agotada» en septiembre desinforma. §4.

### Y una decisión nueva que sale de meter el tope

**¿La cancelación devuelve el cupo al tope global?** El plan dice **sí** (`released` no cuenta),
por coherencia con devolvérselo al cliente y para que un restaurante rechazando pedidos no consuma
la promo publicitada sin entregar nada. Es defendible al revés —«se anunciaron 100 y se
comprometieron 100»—; si se prefiere esa lectura, el cambio es incluir `released` en el `count` del
§3.4-bis y en `cuposRestantes`, y el test 13 se invierte. **Decidir antes de escribir la migración**,
porque las dos expresiones tienen que cambiar a la vez.

---

## 9. Resultados de la verificación (25-ago, base local)

`0187` aplicada con `supabase migration up --local`. **Suite completa de `apps/api`: 195/195 en 25
ficheros, verde.** La suite nueva: 17/17.

### El lock del tope no cuesta nada medible

Medido con 8 creaciones simultáneas, 3 repeticiones de cada escenario:

| escenario | tiempos | media |
|---|---|---|
| promo apagada (nadie toma el lock) | 123 / 50 / 50 ms | **74 ms** |
| promo activa (los 8 se serializan) | 76 / 57 / 69 ms | **67 ms** |

La media con lock sale por debajo de la media sin lock: la diferencia está enteramente dentro del
ruido, y el 123 ms del primer escenario es calentamiento. **La serialización no es un coste que
haya que gestionar** a este volumen. Queda medido antes del push, como se pidió.

### Un hallazgo que la suite destapó y que habría explotado en CI

La sección A siembra la promo con `active: true` y la ventana 25-28 ago. **Hoy estamos dentro de esa
ventana**, así que en cuanto se aplica la migración TODO pedido de cliente que cree cualquier suite
sale con `delivery_fee = 0`. Resultado medido: **5 rojos en dos ficheros ajenos**
(`delivery-zones` ×3, `nightly-change-ceiling` ×2), que afirman tarifas de envío y vueltos.

Lo venenoso no es el rojo, es que **se cura solo el 29 de agosto**: fuera de la ventana la suite
vuelve a verde sin que nadie toque nada, y el problema queda latente hasta la siguiente promo.

Arreglado en `vitest.global-setup.ts`: el barrido apaga la promo en la base local —igual que ya
barre negocios y pedidos del mundo compartido— y avisa por consola de cómo volver a encenderla.
Quien quiera la promo encendida la enciende en su propio test, que es lo que hace la suite nueva.

**Consecuencia para el desarrollo local**: correr `pnpm test` deja la promo apagada en tu base. Para
volver a verla en la app, `app_settings.promo_free_delivery → active: true`.

### Lo que la verificación corrigió del propio plan

- El caso 8 (el del ledger) se escribió primero con un `update` directo a `delivered`. **Pasaba en
  verde por el motivo equivocado**: sin recorrer `advance_order`, la columna `commission_amount`
  queda NULL, el trigger sale por `(v_delivery_fee + v_commission) <= 0` y no nace NINGÚN cargo. El
  atajo "demostraba" que no hay cargo de envío sin poder demostrar que sí hay comisión. Ahora
  recorre la cadena real (`accept → ready → take → arrived → pickup → deliver`) y va por
  contraentrega, porque en prepago el `accept` se desvía a `awaiting_payment` (0107).
- El negocio 2 del seed (`E2E.BUSINESS_2_ID`) **no tiene ítems de menú**, así que no sirve como
  segunda sede. La suite se crea la suya.

### Lo único que queda sin ejecutar: el rollback

El archivo de rollback **no se ha ejecutado**. Lo que sí está verificado de él: su cuerpo de
`create_customer_order` no está escrito a mano, sale del propio 0185 y su md5 coincide exactamente
con el `pg_get_functiondef` que estaba vivo en prod antes de 0187
(`323b4269fe92be7c762b4d9d085e434d`, sobrecarga única confirmada). Lo que NO está verificado es que
las cinco sentencias corran limpias en secuencia.

Ensayarlo en local antes del push:

```bash
docker exec -i -e PGCLIENTENCODING=UTF8 supabase_db_zpnipajgwfthxhdtzhly \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/rollbacks/0187_the_first_delivery_of_the_launch_is_on_us.rollback.sql
```

Debe terminar sin error y dejar `md5(pg_get_functiondef(...)) = 323b4269fe92be7c762b4d9d085e434d`,
con `promo_redemptions` intacta. Para volver a 0187: borrar su fila de
`supabase_migrations.schema_migrations` y `supabase migration up --local`.

---

### Sobre el número publicitado — **resuelto: 100**

Se planteó bajarlo a 50. **Decisión del 25-ago: se mantiene 100.**

Queda el razonamiento por si hay que revisarlo a mitad de semana. Con bandas de S/2.00 / S/2.50, 40
redenciones cuestan ~S/84 y 100 cuestan ~S/210: la diferencia de exposición entre los dos números es
de ~S/125, así que **el tope no está protegiendo dinero** en ningún escenario realista — es un
instrumento de marketing. Contra ~10 pedidos/noche × 4 noches, 100 probablemente no llega a morder,
y el techo que muerde primero es físico (un motorizado). Con 100 no habrá un momento de «casi se
agotan» que sea cierto.

Lo que sigue siendo válido operativamente: **el tope se sube en caliente y no se baja con gracia**.
Subirlo es un `UPDATE` a `app_settings`, sin deploy. Bajarlo a mitad de promo es visible. Si el
lanzamiento arranca flojo y se quiere fabricar urgencia real, bajar el tope **no** es la palanca;
la palanca es acortar la ventana (`to`), que se lee como fin de promo y no como recorte.
