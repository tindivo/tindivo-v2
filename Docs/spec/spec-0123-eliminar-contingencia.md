# SPEC — 0123 · Eliminar contingencia por completo

**Fecha:** 2026-08-04 · **Destino:** `zpnipajgwfthxhdtzhly` (tindivo-prod)
**Decisión:** Jesús, 2026-08-04. El fondo de contingencia se eliminó como
concepto de negocio y se maneja internamente. El ledger `business_charges` es la
fuente de verdad.
**Riesgos que cierra:** ver `Docs/RIESGOS-LEDGER.md` — R-L4 completo, la mitad
de R-L2, y R-L3 por obligación.

> **GATE HUMANO — `.agents/AGENTS.md §2.2`.** Este spec no se aplica sin
> aprobación explícita, pieza por pieza. Nada de lo que sigue se ha ejecutado.

## Por qué cabe ahora y no después

Medido el 2026-08-04 contra prod:

```
contingency_advances: 0 · business_charges: 0 · settlements: 0
restaurant_payments: 0 · businesses: 0 · orders: 0
```

**Cero filas en todo.** No hay datos que migrar, ni saldos que reconciliar, ni
histórico que preservar. Después del primer pedido del piloto, cada uno de estos
`DROP` pasa a necesitar un plan de datos.

---

## 0 · Verificación previa exigida — ¿el monto se duplicaba?

La decisión pedía verificar, antes de quitarle el `INSERT` a
`resolve_fraud_claim`, si el monto se duplicaba o se compensaba entre las dos
tablas. **Verificado sobre la definición viva
(`0102_fix_fraud_claim_actor_charged.sql`): no se duplica.**

Al aprobar un claim, la función hace tres cosas:

```sql
INSERT INTO public.contingency_advances
  (order_id, customer_phone, amount, reason, actor_charged, status, operator)
VALUES (v_row.order_id, …, v_row.amount, …, 'restaurante', 'activo', p_resolver);

INSERT INTO public.business_charges
  (business_id, order_id, charge_type, amount, description, status)
VALUES (v_order.business_id, v_row.order_id, 'refund_charge', v_row.amount, …, 'pending');

UPDATE public.businesses
  SET balance_due = balance_due + v_row.amount WHERE id = v_order.business_id;
```

El `INSERT` a `contingency_advances` es **directo**, no pasa por
`create_contingency_advance`. Por eso **no toca el fondo ni suma a `balance_due`
por segunda vez**: el monto entra al saldo exactamente una vez, en el `UPDATE`
explícito. La fila del adelanto es un registro huérfano que por sí solo no mueve
dinero.

**Pero sí crea un defecto latente, y es el argumento más fuerte para quitarlo.**
Esa fila queda con `actor_charged='restaurante'`, `status='activo'` y
`replenished_at IS NULL` — el predicado exacto que usa la reposición de
`pay_settlement`:

```sql
update public.contingency_advances ca
   set replenished_at = now(), …
 where … ca.actor_charged = 'restaurante' and ca.status = 'activo'
   and ca.replenished_at is null
returning ca.amount
-- … y luego:
update public.businesses set balance_due = greatest(0, balance_due - v_repl) …;
```

Es decir: **una liquidación posterior descontaría del saldo el monto de un claim
de fraude cuyo cargo sigue `pending` en el ledger.** No es duplicación al
crearlo; es una resta indebida más tarde. Quitar el `INSERT` lo corrige, y el
`DROP` de `pay_settlement` lo corrige por segunda vía.

**Conclusión: quitar el `INSERT` es seguro y además arregla un defecto.**

---

## 1 · 🔴 HALLAZGO DE SEGURIDAD — leer antes de repuntar el endpoint

La sobrecarga de 4 argumentos, que es a la que hay que repuntar, **es ejecutable
por `PUBLIC` y por `anon`**. ACL medida:

```
register_appeal_refund(uuid,numeric,text,uuid)
  {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
   service_role=X/postgres,supabase_auth_admin=X/postgres}
   ↑ el "=X" inicial es PUBLIC
```

| firma | service_role | authenticated | anon |
| --- | --- | --- | --- |
| `(uuid,numeric,text,uuid)` — la de 4 | ✅ | ✅ | **✅** |
| `(uuid,text,numeric)` — la viva de 3 | ✅ | ✅ | ❌ |
| `resolve_fraud_claim` (referencia sana) | ✅ | ❌ | ❌ |

**Causa:** ni `0073` ni `0077` emitieron `REVOKE`/`GRANT` para esa firma (grep
sobre ambas migraciones: cero coincidencias). Al crearla con `CREATE OR REPLACE`
heredó el default de PostgreSQL, que incluye `EXECUTE` para `PUBLIC`.

**Agravante:** a diferencia de la de 3 argumentos, **la de 4 no comprueba el rol
por dentro**. La de 3 hace:

```sql
IF NOT public.current_user_has_role('admin') THEN
  RAISE EXCEPTION 'Acceso denegado: requiere rol admin' USING errcode = '42501';
END IF;
```

La de 4 no tiene ese bloque. Es `SECURITY DEFINER`, inserta en el ledger y sube
`balance_due`, y hoy la puede invocar cualquiera que llegue al PostgREST con la
anon key. La explotación real exige conocer un `report_id` (uuid no adivinable)
en estado válido, así que el riesgo práctico es bajo — pero **es una función de
dinero abierta a `anon`, y eso no se deja pasar.**

**Consecuencia para este spec: el repunte NO es solo cambiar el nombre de los
parámetros.** La migración debe, en el mismo cambio:

1. `REVOKE ALL … FROM PUBLIC, anon, service_role`
2. `GRANT EXECUTE … TO authenticated`
3. Portarle el bloque de comprobación de rol admin de la sobrecarga de 3
   argumentos (§2-bis).

### Por qué `authenticated` y no `service_role`

Verificado sobre la definición viva:

```sql
CREATE OR REPLACE FUNCTION public.current_user_has_role(p_role user_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$ select exists (select 1 from public.user_roles
                              where user_id = (select auth.uid()) and role = p_role); $function$
```

Resuelve el rol por `auth.uid()`, o sea por el JWT de la petición. **Con
`createServiceClient()` no hay JWT: `auth.uid()` devuelve NULL, la función
devuelve `false`, y la comprobación de rol rechazaría TODAS las llamadas.**

Por lo tanto **el endpoint conserva `createUserClient(token)`** y el grant va a
`authenticated`, exactamente como `0067:480-481` lo hizo para la de 3
argumentos:

```sql
REVOKE ALL ON FUNCTION public.register_appeal_refund(uuid, text, numeric) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_appeal_refund(uuid, text, numeric) TO authenticated;
```

Es además el patrón de toda la familia de apelaciones: `admin/appeals/route.ts`,
`[id]/resolve` y `[id]/review` usan `createUserClient`. La protección real es la
comprobación de rol **dentro** de la función, no el grant.

> Una versión anterior de este spec recomendaba `GRANT … TO service_role` y
> cambiar el endpoint a `createServiceClient()`. **Era incorrecto** y habría
> dejado el flujo de reembolsos inoperativo. Queda anotado porque el error es
> instructivo: en este repo, "endurecer" un RPC moviéndolo a `service_role`
> rompe toda función que dependa de `current_user_has_role`.

---

## 2 · El repunte del endpoint

`apps/api/app/api/v1/admin/appeals/[id]/refund/route.ts:30-34`, hoy:

```ts
const client = createUserClient(token)
const { data, error } = await client.rpc('register_appeal_refund', {
  p_report_id: reportId,
  p_refund_proof_path: body.refundProofPath,
  p_amount: body.amount,
})
```

Destino — **cuatro parámetros, y el orden cambia**:

```ts
// (p_report_id uuid, p_amount numeric, p_refund_proof_path text, p_admin_user_id uuid)
const client = createUserClient(token)   // SIN CAMBIO — lo exige current_user_has_role
const { data, error } = await client.rpc('register_appeal_refund', {
  p_report_id: reportId,
  p_amount: body.amount,
  p_refund_proof_path: body.refundProofPath,
  p_admin_user_id: user.id,
})
```

> ⚠️ **`p_amount` y `p_refund_proof_path` están intercambiados entre las dos
> firmas.** Con llamada por nombre —como aquí— el orden es irrelevante y el
> riesgo es nulo. Pero **mientras las dos sobrecargas coexistan, una llamada
> posicional resuelve a la equivocada sin error**. Por eso el `DROP` de la de 3
> argumentos va en la misma migración que el repunte, no después.

`requireRole(req, 'admin')` ya está en la línea 25 y se mantiene. **El cliente no
cambia.** Lo único que cambia en el endpoint son los parámetros del `rpc()`.

## 2-bis · Las dos protecciones que se portan

Decisión de Jesús, 2026-08-04: la sobrecarga de 4 argumentos queda con **las dos
protecciones de la de 3**, en este orden. **Texto copiado literal de la de 3, no
reescrito.**

### a) Comprobación de rol

```sql
IF NOT public.current_user_has_role('admin') THEN
  RAISE EXCEPTION 'Acceso denegado: requiere rol admin' USING errcode = '42501';
END IF;
```

La de 3 la precede de una comprobación de autenticación que también se porta,
porque `current_user_has_role` devuelve `false` con `auth.uid()` NULL y el
mensaje resultante sería engañoso:

```sql
v_admin_user_id := auth.uid();
IF v_admin_user_id IS NULL THEN
  RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
END IF;
```

> Matiz: la de 4 recibe `p_admin_user_id` como parámetro y hace
> `COALESCE(p_admin_user_id, auth.uid())`. La comprobación de autenticación se
> hace sobre **`auth.uid()`**, no sobre el parámetro — si no, un llamador podría
> saltársela pasando cualquier uuid.

### b) Validación de monto exacto

**Razón (Jesús):** estos reembolsos son el precio completo del pedido —decenas
de soles, no S/ 3,50—. Sin validación, un tecleo le carga al negocio lo que sea
que se escribió. Portar el rol y no el monto sería quedarse a medias.

Requiere cargar el pedido, que la de 4 hoy no carga:

```sql
SELECT * INTO v_order FROM public.orders WHERE id = v_report.order_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Pedido asociado no existe' USING errcode = 'P0002'; END IF;

v_expected_amount := COALESCE(v_order.order_amount, 0) + COALESCE(v_order.delivery_fee, 0);
IF v_expected_amount <= 0 THEN
  RAISE EXCEPTION 'El pedido no cuenta con un monto reembolsable válido' USING errcode = 'P0001';
END IF;

IF p_amount <> v_expected_amount THEN
  RAISE EXCEPTION 'El monto expresado (S/ %) no coincide con el total del pedido (S/ %)', p_amount, v_expected_amount
    USING errcode = 'P0001';
END IF;
```

**Mensajes de error verificados carácter a carácter contra la definición viva de
la sobrecarga de 3 argumentos.** Los cuatro se conservan idénticos, incluidos los
`errcode`:

| mensaje | errcode |
| --- | --- |
| `Usuario no autenticado` | `P0001` |
| `Acceso denegado: requiere rol admin` | `42501` |
| `Pedido asociado no existe` | `P0002` |
| `El pedido no cuenta con un monto reembolsable válido` | `P0001` |
| `El monto expresado (S/ %) no coincide con el total del pedido (S/ %)` | `P0001` |

Importa porque `refund/route.ts:60-63` mapea `P0002 → not_found` y
`P0001 → forbidden`. Cambiar un `errcode` cambiaría el status HTTP.

### c) El predicado de elegibilidad — CORREGIDO tras la prueba local

Una versión anterior de este spec decía que se conservaba la condición de la de
4 argumentos *"a propósito, porque cubre los reportes `prepay_refund_review`"*.
**Estaba deducido leyendo el código, sin ejecutarlo, y era falso por partida
doble.**

**1 · El literal `'appeal'` no existe.** El enum `report_type` es
`no_show, rejected_proof_disputed, cash_difference, restaurant_fake,
strike_reactivation, advance_dispute, prepay_refund_review`. Postgres castea el
literal para comparar y lanza `22P02` — medido en local:

```
NOTICE:  [sqlstate 22P02] invalid input value for enum public.report_type: "appeal"
```

La función fallaba en **toda** llamada. Ver M-6 en `RIESGOS-LEDGER.md`.

**2 · `prepay_refund_review` no es un camino de reembolso.** Verificado: solo
existe como etiqueta (`apps/admin/lib/labels.ts:54`) y en el enum. Aparece en la
pantalla de reportes (`reportes/page.tsx:29` lista todo salvo
`rejected_proof_disputed`), pero la única acción de esa pantalla es
`/admin/reports/{id}/resolve` con `{status, resolutionAction}` — resuelve el
reporte, no devuelve dinero. **Queda fuera: no se abre un camino de dinero que
nadie pidió.**

Las apelaciones son reportes `rejected_proof_disputed`, que es como las filtra
`admin/appeals/route.ts:40`. Predicado aprobado, tres guardas independientes:

```sql
IF v_report.type <> 'rejected_proof_disputed' THEN
  RAISE EXCEPTION 'El reporte no es una apelación' USING errcode = 'P0001';
END IF;

IF v_report.status = 'resolved' OR v_report.refund_status = 'completed' THEN
  RAISE EXCEPTION 'La devolución de este reporte ya fue completada' USING errcode = 'P0001';
END IF;

IF v_report.appeal_status IS DISTINCT FROM 'approved' THEN
  RAISE EXCEPTION 'Este reporte no está aprobado o ya fue reembolsado' USING errcode = 'P0001';
END IF;
```

**Cada guarda necesita su prueba.** Una guarda sin una prueba que la vea rebotar
no está verificada. Ver §7-bis.

---

## 3 · Inventario de `DROP`

### Funciones

| función | firma | motivo |
| --- | --- | --- |
| `create_contingency_advance` | `(uuid,numeric,text,contingency_actor_charged,uuid,text)` | contingencia |
| `dispute_contingency_advance` | `(uuid,uuid,text)` | contingencia |
| `resolve_contingency_advance` | `(uuid,uuid,numeric,text)` | contingencia |
| `register_appeal_refund` | `(uuid,text,numeric)` | la vieja; depende de la primera |
| `handle_prepaid_cancel_auto_debt` | `()` | huérfana (M-2) |
| `update_business_balance` | `()` | huérfana y peligrosa (M-1) |

**Siempre con firma explícita.** `DROP FUNCTION public.x(tipos…)`, nunca sin
argumentos: es justo la imprecisión que dejó vivas las dos sobrecargas.

### Tabla y tipos

- `DROP TABLE public.contingency_advances` — **sin FKs entrantes** (verificado:
  `pg_constraint` con `confrelid` de la tabla devuelve vacío). Se lleva consigo
  sus 2 policies RLS (`ca_admin_all`, `ca_business_read`) y el trigger
  `touch_contingency_advances`.
- `DROP TYPE public.contingency_advance_status` (`activo`/`disputado`/`cancelado`)
- `DROP TYPE public.contingency_actor_charged`

### Modificación

- `resolve_fraud_claim`: `CREATE OR REPLACE` **sin cambiar firma**, quitándole el
  `INSERT` a `contingency_advances`. Se queda con el asiento en `business_charges`
  y el `UPDATE` a `balance_due`. Al no cambiar la firma, conserva su ACL sana
  (solo `service_role`).

---

## 4 · Lo que tiene que viajar en el MISMO cambio

**El build rompe si no.** `packages/core/src/enum-drift.ts:37-41` tiene
aserciones de tipo en tiempo de compilación contra los enums de la base:

```ts
type _contingency_advance_status = Assert<
  Equal<Dom['contingency_advance_status'][number], Enums<'contingency_advance_status'>>
>
type _contingency_actor_charged = Assert<
  Equal<Dom['contingency_actor_charged'][number], Enums<'contingency_actor_charged'>>
>
```

Al desaparecer los enums de la DB, `pnpm type-check` **falla** hasta que se
borren estas dos aserciones y sus contrapartes en
`packages/contracts/src/enums.ts:202-207` y `:237-238`. Van en el mismo commit
que la migración, junto con `pnpm db:types` (19 referencias a `contingency` en
`database.types.ts`).

### Secuencia obligada

1. Migración `0123` aplicada con `supabase db push`
2. `pnpm db:types`
3. Borrado de `enums.ts` + `enum-drift.ts`
4. Repunte del endpoint
5. `pnpm type-check` + `pnpm test`

Entre el paso 1 y el 3 el repo no compila. **No dejar ese estado a medias.**

---

## 5 · Limpieza de código

| archivo:línea | qué |
| --- | --- |
| `apps/api/.../admin/appeals/[id]/refund/route.ts:30-34` | repunte (§2) |
| `apps/api/.../business/account/refunds/[id]/route.ts:74-79` | quitar el fallback a `contingency_advances` |
| `apps/admin/lib/labels.ts:53` | `advance_dispute: 'Disputa de adelanto'` |
| `apps/admin/lib/labels.ts:97,99` | `order.contingency_advance`, `order.advance_resolved` |
| `apps/negocios/app/deuda/page.tsx:131` | `'order.contingency_advance': 'Devolución registrada'` |
| `apps/negocios/app/deuda/devoluciones/[id]/page.tsx:80` | ídem |
| `packages/contracts/src/enums.ts:202-207, 237-238` | schemas y mapa de enums |
| `packages/core/src/enum-drift.ts:37-41` | aserciones (§4) |
| `apps/api/lib/__tests__/helpers/local-db.ts:314` | `cleanup` borra de la tabla |
| `apps/api/scripts/seed-e2e-clean.ts:43` | comentario |

**Sobre las etiquetas:** `order.contingency_advance` y `order.refund_registered`
son eventos ya escritos en `order_event_log`. Con la base vacía no hay ninguno,
así que las etiquetas se borran sin dejar huecos en ningún timeline. Si algún
día hubiera filas históricas, habría que dejar la etiqueta aunque el flujo muera.

---

## 6 · ⚠️ Decisión abierta — `pay_settlement` deja huérfano el flujo de settlements

La decisión incluye `DROP` de `pay_settlement`. **Eso tiene una consecuencia que
conviene confirmar antes de ejecutarla.**

Medido:

- `pay_settlement` la invoca **un endpoint vivo**:
  `apps/api/app/api/v1/admin/settlements/[id]/pay/route.ts:31`
- La tabla `settlements` **se queda**, y `generate_settlements` también, con su
  endpoint en `apps/api/.../admin/settlements/route.ts:53`
- `apps/admin/components/admin/alerts-bell.tsx:38` lee `/admin/settlements` para
  contar alertas
- **No existe ninguna pantalla de liquidaciones en `apps/admin`.** El listado de
  carpetas no tiene una, y el único modal de liquidación
  (`components/cobros/settlement-modal.tsx:176`) llama a `/admin/charges/settle`,
  o sea `settle_business_charges`, el otro camino

Es decir: al borrar `pay_settlement` quedan **una tabla que se puede generar y
nunca cobrar**, un endpoint de pago que responde 500, y una campana de alertas
que cuenta liquidaciones que nadie puede cerrar.

### RESUELTO — `pay_settlement` se ACOTA, no se borra

Decisión de Jesús, 2026-08-04. **0123 le quita el bloque de reposición del fondo
y nada más.** La función sigue viva, su endpoint sigue respondiendo, y el flujo
de `settlements` no se toca en esta migración.

Concretamente, desaparece esto y solo esto:

```sql
-- Reposición del fondo (clave `current`): recupera adelantos activos del restaurante…
with repl as (
  update public.contingency_advances ca
    set replenished_at = now(), updated_at = now()
    from public.orders o
    where ca.order_id = o.id and o.business_id = v_s.business_id
      and ca.actor_charged = 'restaurante' and ca.status = 'activo' and ca.replenished_at is null
    returning ca.amount
)
select coalesce(sum(amount), 0) into v_repl from repl;

if v_repl > 0 then
  update public.app_settings
    set value = jsonb_set(value, '{current}', to_jsonb(((value ->> 'current')::numeric) + v_repl)),
        updated_at = now(), updated_by = p_paid_by
    where key = 'contingency_fund';
  update public.businesses set balance_due = greatest(0, balance_due - v_repl) where id = v_s.business_id;
end if;
```

Se va con él la declaración `v_repl numeric := 0;` y la clave `fundReplenished`
del jsonb de retorno. **Ese bloque era el segundo decremento de R-L2**, así que
se cierra la mitad del riesgo sin tocar nada más.

Lo que **queda pendiente** y no entra aquí: que `pay_settlement` marque los
cargos como `settled` (la otra mitad de R-L2).

### 📌 Pendiente — levantamiento propio sobre si `settlements` sigue en uso

Antes de invertir en arreglar `pay_settlement`, hay que responder si el flujo
completo tiene razón de existir. La evidencia disponible sugiere que podría estar
**entero sin uso**:

- `settle_business_charges` es el camino canónico y el único con UI
  (`components/cobros/settlement-modal.tsx:176` → `/admin/charges/settle`).
- **No hay pantalla de liquidaciones en `apps/admin`.** El único consumidor de
  `/admin/settlements` es `components/admin/alerts-bell.tsx:38`, que solo cuenta.
- `pay_settlement` tiene **cero ejecuciones históricas** (medido: 0 settlements,
  0 `restaurant_payments` con `settlement_id`).
- `generate_settlements` suma `orders.tindivo_commission`, **una tercera base de
  cálculo** distinta del ledger y de `balance_due`.

Si el levantamiento concluye que no se usa, el arreglo de R-L2 se vuelve un
borrado y no una corrección. **No decidir esto por inercia.**

---

## 7 · Tests

`apps/api/lib/__tests__/resolve-fraud-claim.integration.test.ts`:

- **Assert (A) desaparece** — `contingency_advances registra actor_charged = restaurante`. La tabla ya no existe.
- **(B) sobrevive** — `business_charges` registra `refund_charge` con monto correcto.
- **(C) sobrevive** — `balance_due` sube exactamente el monto.
- **(D) sobrevive** — la deuda agregada del ledger sube exactamente el monto. Es el que importa.

Hay que actualizar también la cabecera del archivo (`:4-5`), que dice *"DEBE
SALIR ROJO con el código actual"* y ya era falsa antes de este cambio (M-4).

`helpers/local-db.ts:314` pierde su línea de `cleanup`; el resto del helper no
cambia. `sumPendingLedgerDebt` (`:295-305`) no se toca y sigue siendo la medida
canónica.

---

## 8 · Verificación posterior

```sql
-- 1. No queda nada de contingencia
SELECT to_regclass('public.contingency_advances') IS NULL          AS tabla_borrada,
       NOT EXISTS (SELECT 1 FROM pg_type
                    WHERE typname IN ('contingency_advance_status',
                                      'contingency_actor_charged')) AS tipos_borrados,
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname LIKE '%contingency%') AS funcs_borradas;

-- 2. Solo queda una register_appeal_refund, y con la ACL correcta
SELECT p.oid::regprocedure::text,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname = 'register_appeal_refund';
-- Esperado: 1 fila · anon=false · authenticated=TRUE · service_role=false
--   (mismo patrón que 0067 para la de 3 argumentos: el guardián es la
--    comprobación de rol DENTRO de la función, no el grant)

-- 3. Ninguna función menciona ya contingencia
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f'
  AND pg_get_functiondef(p.oid) ILIKE '%contingency%';
-- Esperado: 0
```

Y en el repo: `pnpm type-check`, `pnpm lint`, `pnpm test`, más una prueba manual
del flujo de apelaciones extremo a extremo (aprobar → devolución → el cargo
aparece en `apps/negocios/app/deuda` como línea, no solo en el total).

Esa última comprobación es la que demuestra que el cambio sirvió: hoy el
reembolso sube `balance_due` sin dejar línea en el detalle, y el negocio ve su
deuda crecer sin explicación.
