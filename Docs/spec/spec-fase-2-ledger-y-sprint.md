# SPEC — Fase 2 · Ledger derivado y sprint de la cajera

**Versión:** 1 · **Fecha:** 2026-08-04
**Proyecto:** `zpnipajgwfthxhdtzhly` (tindivo-prod / v2)
**Estado de prod al escribir:** migración `0123` aplicada. Próximo número libre: **`0124`**
**Referencias:** `Docs/RIESGOS-LEDGER.md` · `Docs/spec/spec_manual.md` · `Docs/spec/spec_ui_cajera.md`

> **GATE HUMANO — `.agents/AGENTS.md §2.2`.** Todo lo que toca dinero (Partes A,
> B, C y D) requiere aprobación explícita de Jesús antes de aplicarse, pieza por
> pieza. No se opera en autónomo en el módulo financiero.

---

## ORDEN DE EJECUCIÓN — y por qué este y no otro

| # | Parte | Qué | Migración |
|---|---|---|---|
| 1 | **A** | Tests de la cadena del pedido | — |
| 2 | **B** | `balance_due` derivado + cerrar R-L2 | `0124` |
| 3 | **C** | Reestructurar `commissions` + borrar `packages/core` | `0125` |
| 4 | **D** | Parte 0 del RPC — firma con banda | `0126` |
| 5 | **E** | UI de la cajera | — |

**Los tests van PRIMEROS y no es negociable.** Si se escriben después de
cambiar `commissions`, solo prueban que el resultado es consistente consigo
mismo — no que sigue siendo correcto. Escritos antes, capturan la economía
actual y después verifican que no se movió donde no debía.

Y hay una razón más fuerte: la Parte C **borra
`packages/core/src/order/commission.ts`**. Después de eso, estos tests son la
única red sobre el modelo de dinero. Sin ellos, C y D se aplican a ciegas.

---

## ESTADO HEREDADO — lo que ya está resuelto

Para que nadie lo reabra por error:

| | |
|---|---|
| Contingencia | **Eliminada** (`0123`). Tabla, tipos y tres funciones borradas |
| Appeals | **En el ledger**. `register_appeal_refund` de 4 args, con guardia de rol y de monto |
| `anon` en funciones de dinero | **Cerrado**. ACL: `anon=f`, `authenticated=t`, `service_role=f` |
| `pay_settlement` | **Acotada** — sin reposición del fondo. Le falta marcar cargos (Parte B) |
| R-L4, R-L3, M-1, M-2, M-4, M-5, M-6 | **Cerrados** |
| R-L1 (`balance_due`) | **Abierto, pero habilitado** — nada mueve el saldo fuera del ledger |

### Decisiones cerradas por Jesús

1. `business_charges` es la fuente de verdad. `balance_due` = cache reconstruible.
2. El saldo **puede quedar negativo** (saldo a favor del negocio, se compensa
   contra la quincena siguiente).
3. `commissions` se separa de `delivery_bands`:
   `{"delivery": 1.50, "pickup": 1.00}`.
4. La cajera elige la banda con dos botones que escriben **tarifa y banda a la vez**.
5. Cobro **quincenal**, total o parcial, **FIFO**.

### ⚠️ Corrección a una decisión previa

Se acordaron **dos** `charge_type` nuevos: `contingency` y `adjustment`.
**`contingency` ya no aplica** — `0123` eliminó ese concepto. Solo queda
`adjustment`.

Y el escenario que motivó permitir el saldo negativo (adelanto de contingencia
pagado y luego disputado) **tampoco existe ya**. El escenario vigente es la
**auditoría de banda**: corregir un `far` a `near` en un pedido ya liquidado.
La decisión se mantiene; cambia el motivo.

---

# PARTE A · Tests de la cadena del pedido

**Sin migración.** Solo tests de integración.

## A.0 · Qué existe hoy

| test | cubre | NO cubre |
|---|---|---|
| `settle-charges.integration.test.ts` | marca `settled`, crea `restaurant_payments` | `balance_due`; inserta el cargo a mano, no pasa por el trigger |
| `resolve-fraud-claim.integration.test.ts` | `refund_charge`, `balance_due`, deuda del ledger | interacción con `pay_settlement` |
| `release-and-transfer.integration.test.ts` (T3) | `delivery_fee_charged`, `commission_amount`, `tindivo_commission` | **atraviesa `generate_delivery_charges` y no mira ni un `business_charge`** |

**Tres tramos con cero cobertura:** `generate_delivery_charges`,
`pay_settlement`, y la cadena completa hasta liquidación.

**Pieza base:** `apps/api/lib/__tests__/helpers/local-db.ts:295-305`
(`sumPendingLedgerDebt`) replica el criterio exacto de la RPC de liquidación.
Todo lo que sigue se construye sobre ese helper.

## A.1 · Test — `generate_delivery_charges`

Archivo nuevo: `apps/api/lib/__tests__/delivery-charges.integration.test.ts`

El trigger que alimenta el ledger. Hoy sin ninguna cobertura.

| # | caso | verifica |
|---|---|---|
| A1.1 | Pedido `near` entregado | 2 filas: `delivery_fee=2.00` y `commission=1.50`, ambas `pending` |
| A1.2 | Pedido `far` entregado | `delivery_fee` y `commission` según el modelo vigente |
| A1.3 | Pedido `pickup` entregado | **1 sola fila**: `commission=1.00`. No hay fila de `delivery_fee` |
| A1.4 | Cualquiera | `SUM(business_charges del pedido) = orders.tindivo_commission` |
| A1.5 | Cualquiera | `balance_due` subió exactamente ese monto |
| A1.6 | Con `commission_override_*` | El override gana sobre `app_settings` |

**A1.4 es el invariante más importante de toda la suite.** Es la reconciliación
acotada al pedido: cuadra siempre, independiente de liquidaciones y ajustes.

## A.2 · Test — cadena completa hasta liquidación

Archivo nuevo: `apps/api/lib/__tests__/ledger-chain.integration.test.ts`

| # | caso | verifica |
|---|---|---|
| A2.1 | 3 pedidos entregados → liquidar todos | `balance_due` vuelve a 0; los 3 cargos en `settled` |
| A2.2 | 3 pedidos, liquidar solo 2 (FIFO) | `balance_due` = el cargo restante; 2 en `settled`, 1 en `pending` |
| A2.3 | Liquidación con monto que no cuadra | **REBOTA** con `P0001` |
| A2.4 | Tras liquidar todo | El negocio queda desbloqueado por mora |
| A2.5 | Un `refund_charge` mezclado con cargos de pedido | Entra en la liquidación como cualquier otro |

**A2.5 importa** porque es el flujo que Jesús describió: cliente hace Yape, no
recibe la comida, Tindivo le devuelve y se lo carga al restaurante. Ese cargo
tiene que liquidarse junto con las comisiones, no aparte.

## A.3 · Test — `pay_settlement` (rojos a propósito)

Archivo nuevo: `apps/api/lib/__tests__/pay-settlement.integration.test.ts`

**Estos van a salir en rojo hasta la Parte B.** Es el punto: documentan el resto
de R-L2 con evidencia ejecutable.

| # | caso | esperado (correcto) | actual |
|---|---|---|---|
| A3.1 | Liquidar por este camino | cargos en `settled` | **quedan `pending`** ❌ |
| A3.2 | Tras liquidar | `settlement_id` poblado | **queda NULL** ❌ |
| A3.3 | Tras liquidar | `balance_due` baja una vez | verificar |

**Marcarlos con `it.fails()`**, y el comentario debe decir **qué migración los
pone en verde (`0124`)**, no solo que fallan.

> Precedente M-4: hay un test cuya cabecera dice "DEBE SALIR ROJO" y el bug
> lleva meses arreglado. Un test rojo sin fecha de vencimiento se vuelve ruido.

## A.4 · Lo que NO se testea todavía

- **Reconciliación global** `SUM(business_charges)` vs `balance_due`. Se activa
  con la Parte B, donde pasa a ser una identidad verificable.
- **Saldo negativo.** No hay camino que lo produzca hasta la auditoría de banda.

## A.5 · Criterio de cierre

- A.1 y A.2 en verde
- A.3 en rojo documentado, apuntando a `0124`
- `pnpm test` completo sin regresiones (168 tests + los nuevos)

---

# PARTE B · `balance_due` derivado — migración `0124`

Cierra **R-L1** y la mitad restante de **R-L2**.

## B.1 · El problema

`balance_due` está documentado como deprecado en `AGENTS.md §2.2` y lo escriben
varias funciones. Peor: **dos reglas de negocio dependen de él**:

- `settle_business_charges` — desbloqueo por mora (`AND balance_due <= 0`)
- `decrement_balance_on_payment` — mismo criterio (`AND balance_due = 0`)

Los dos caminos que devuelven a un negocio a la operación se deciden con el
campo que la regla manda no usar.

## B.2 · La solución — opción A del levantamiento

`balance_due` se mantiene como columna y pasa a **recalcularse por trigger**
sobre `business_charges`:

```sql
CREATE OR REPLACE FUNCTION public.recalc_business_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid := COALESCE(NEW.business_id, OLD.business_id);
BEGIN
  UPDATE public.businesses b
     SET balance_due = COALESCE((
           SELECT SUM(bc.amount)
             FROM public.business_charges bc
            WHERE bc.business_id = v_business_id
              AND bc.status = 'pending'
         ), 0)
   WHERE b.id = v_business_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_business_charges_recalc_balance
AFTER INSERT OR UPDATE OR DELETE ON public.business_charges
FOR EACH ROW EXECUTE FUNCTION public.recalc_business_balance();
```

**Recálculo completo, no incremental.** Es lo que lo hace reconstruible de
verdad y auto-reparable: cualquier desajuste se corrige en la siguiente
escritura. A ~10 pedidos/noche el costo es irrelevante.

**Sin `greatest(0, ...)`.** El saldo puede quedar negativo — es la decisión
tomada, y el tope pertenece a la capa de cobro, no al asiento.

### Por qué esto arregla dos cosas sin tocarlas

- `settle_business_charges` (desbloqueo por mora): **cero cambios**. Pasa a
  evaluar el ledger sin tocar una línea.
- `apps/admin/app/negocios/page.tsx:19,167`: **cero cambios**. Sigue leyendo la
  columna, que ahora dice la verdad.

## B.3 · Retirar `decrement_balance_on_payment`

```sql
DROP TRIGGER IF EXISTS trg_restaurant_payments_decrement_balance
  ON public.restaurant_payments;
DROP FUNCTION IF EXISTS public.decrement_balance_on_payment();
```

**No se adapta, se borra.** Con el cache derivado, marcar los cargos como
`settled` ya dispara el recálculo. Si además el trigger resta el pago, se
descuenta dos veces.

**Cuidado:** ese trigger también hacía el desbloqueo por mora al llegar a 0.
Hay que verificar dónde queda esa lógica y, si hace falta, moverla a
`recalc_business_balance` o al camino de liquidación. **No perderla en el
borrado.**

## B.4 · Completar `pay_settlement`

`0123` le quitó la reposición del fondo. Le falta cerrar el ledger:

```sql
UPDATE public.business_charges
   SET status = 'settled',
       settlement_id = v_s.id,
       settled_at = now()
 WHERE business_id = v_s.business_id
   AND status = 'pending'
   -- Acotar al periodo de la liquidación (settlements tiene period_start/end)
   AND created_at::date BETWEEN v_s.period_start AND v_s.period_end;
```

**La infraestructura ya existe y no se usaba:** `business_charges.settlement_id`
con su FK y su índice parcial.

> **Nota de coherencia:** `settle_business_charges` usa `payment_id`;
> `pay_settlement` usaría `settlement_id`. Son dos vínculos para el mismo
> hecho. Unificar o el historial queda partido en dos. **Decidir antes de
> escribir la migración.**

## B.5 · ⚠️ Hallazgo pendiente de resolver — `generate_settlements`

`generate_settlements` **no suma del ledger**: suma
`orders.tindivo_commission` directo de los pedidos.

```sql
select o.business_id, …, sum(o.tindivo_commission), …
  from public.orders o
 where o.status = 'delivered' and … between p_period_start and p_period_end
   and o.tindivo_commission is not null
```

**Consecuencia: los `refund_charge` de disputa NO entran en ese cálculo.** Es
una tercera base de cálculo, además de `balance_due` y `SUM(business_charges)`.
Coinciden hoy por casualidad aritmética, no por diseño.

**Verificar y corregir en esta migración**: `generate_settlements` debe sumar
del ledger, no de los pedidos. Si no, una liquidación por ese camino omite los
reembolsos.

## B.6 · Verificación de `0124`

```sql
-- 1. El trigger existe y apunta a la función correcta
SELECT tgname, tgrelid::regclass, tgfoid::regproc
FROM pg_trigger WHERE NOT tgisinternal
  AND tgrelid = 'public.business_charges'::regclass;

-- 2. decrement_balance_on_payment ya no existe
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='decrement_balance_on_payment';
-- Esperado: 0

-- 3. RECONCILIACIÓN GLOBAL — ahora sí debe dar cero filas
SELECT b.id, b.name, b.balance_due AS agregado,
       COALESCE(SUM(bc.amount) FILTER (WHERE bc.status='pending'), 0) AS detalle
FROM public.businesses b
LEFT JOIN public.business_charges bc ON bc.business_id = b.id
GROUP BY b.id, b.name, b.balance_due
HAVING b.balance_due IS DISTINCT FROM
       COALESCE(SUM(bc.amount) FILTER (WHERE bc.status='pending'), 0);
-- Esperado: 0 filas
```

**La query 3 pasa a ser test permanente.** Debe correr al final de cada test
financiero y fallar si no da cero. Es lo que convierte "balance_due = SUM del
ledger" de aspiración documental a aserción verificable.

## B.7 · Prueba de predicados obligatoria

> **Regla del proyecto (M-6):** ninguna función de dinero se da por buena sin
> una prueba que la ejecute. Leerla no cuenta. Va la quinta vez en este
> repositorio que algo "se lee bien" y no funciona.

Antes de aplicar en prod, con `DO $$ … RAISE EXCEPTION 'rollback intencional' $$;`:

| # | caso | esperado |
|---|---|---|
| 1 | INSERT de un cargo | `balance_due` sube exactamente ese monto |
| 2 | UPDATE a `settled` | `balance_due` baja exactamente ese monto |
| 3 | Dos cargos, liquidar uno | `balance_due` = el otro |
| 4 | Cargo negativo (`adjustment`) | `balance_due` **puede quedar negativo** |
| 5 | DELETE de un cargo | `balance_due` se recalcula |

**Ojo con el alfabeto de `short_id`:** `^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$`
— sin `I`, `O`, `0` ni `1`. Ya mordió tres veces. Usar `ZZTESTAB` y siguientes.

---

# PARTE C · Reestructurar `commissions` — migración `0125`

## C.1 · El problema

`commissions` guarda **dos cosas en un solo número**. Hoy:

```
commissions = {"pickup": 1.00, "near": 3.50, "far": 3.50}
```

`commissions.near = 3.50` no es una comisión: es comisión **+** delivery. Por
eso `advance_order` tiene que restar:

```sql
v_commission_amount := COALESCE(…, (v_commissions ->> 'near')::numeric, 3.00)
                       - v_delivery_fee_charged;
```

De ahí salen todos los problemas: al subir el delivery hay que ajustar
`commissions` para que la resta siga dando; nadie puede leer el config y decir
cuánto se cobra de comisión; y si alguien cambia una sin la otra, sale mal en
silencio.

## C.2 · La forma nueva

```sql
UPDATE public.app_settings
   SET value = '{"delivery": 1.50, "pickup": 1.00}'::jsonb
 WHERE key = 'commissions';
```

> 🔴 **LA TRAMPA.** `{"delivery": 3.50}` sería el error. Hoy `3.50` es el
> **total** que se cobra al negocio, y `advance_order` le resta el envío. Con
> la forma nueva, `commissions.delivery` es la comisión **sola**. Copiar 3.50
> tal cual duplicaría el cobro.

Economía resultante — **idéntica a hoy en `near`**:

| | cliente paga | comisión | negocio debe |
|---|---|---|---|
| Cerca | S/2,00 | S/1,50 | **S/3,50** (igual que hoy) |
| Lejos | S/2,50 | S/1,50 | **S/4,00** |
| Pickup | S/0 | S/1,00 | **S/1,00** |

**Y esto cierra la deuda de `0110` por construcción.** Esa migración bajó
`commissions.far` de 4.00 a 3.50 dejando escrito: *"cuando el cliente pague
2.50 por las lejanas, `far` vuelve a 4.00"*. Con este modelo el total sale
`1.50 + 2.50 = 4.00` **solo**, sin número mágico que alguien deba recordar.

## C.3 · `advance_order`

`CREATE OR REPLACE`, partiendo de la versión de `0121`. El `IF/ELSIF/ELSE` de
tres ramas pasa a dos:

```sql
-- ANTES (tres ramas, con resta)
IF v_order.delivery_method = 'pickup' THEN
  v_commission_amount := COALESCE(…, (v_commissions ->> 'pickup')::numeric, 0.50);
ELSIF v_band = 'near' THEN
  v_commission_amount := COALESCE(…, (v_commissions ->> 'near')::numeric, 3.00)
                         - v_delivery_fee_charged;
ELSE
  v_commission_amount := COALESCE(…, (v_commissions ->> 'far')::numeric, 3.50)
                         - v_delivery_fee_charged;
END IF;

-- DESPUÉS (dos ramas, sin resta)
IF v_order.delivery_method = 'pickup' THEN
  v_commission_amount := COALESCE(v_business.commission_override_pickup,
                                  (v_commissions ->> 'pickup')::numeric, 1.00);
ELSE
  v_commission_amount := COALESCE(v_business.commission_override_delivery,
                                  (v_commissions ->> 'delivery')::numeric, 1.50);
END IF;
```

**`v_band` se sigue calculando** — lo necesita `delivery_distance_band` en el
`UPDATE` de la línea 248.

**Los defaults se corrigen** (M-3): hoy son `0.50 / 3.00 / 3.50`, desfasados
desde `0110`. Pasan a `1.00` y `1.50`.

## C.4 · Rename de overrides

```sql
ALTER TABLE public.businesses
  RENAME COLUMN commission_override_near TO commission_override_delivery;
ALTER TABLE public.businesses
  DROP COLUMN commission_override_far;
```

Con **0 negocios** en v2 es un rename limpio, sin backfill ni riesgo. Después
del piloto ya no lo sería.

## C.5 · Borrar `packages/core/src/order/commission.ts`

**Código muerto.** Nadie lo llama fuera de sus propios tests. El cálculo real
vive íntegro en `advance_order`. Y ya diverge: el core nunca modeló el desglose
de `0074` — solo conoce el total, no `commission_amount` ni
`delivery_fee_charged`.

Se borran:

| archivo | qué |
|---|---|
| `packages/core/src/order/commission.ts` | entero |
| `packages/core/src/order/__tests__/commission.test.ts` | entero |
| `packages/core/src/order/transitions.ts:2,23,26` | `applyDelivered` que consume ambos tipos |
| `packages/core/src/order/__tests__/state-machine.test.ts:76-77` | aserciones |

> **Esto NO es abandonar TDD.** `CLAUDE.md` pide "backend con TDD en
> `packages/core`", y esa regla tiene sentido para lógica que corre en
> TypeScript. Este cálculo **corre en Postgres**. La cobertura equivalente son
> los tests de la Parte A, que prueban el código que realmente se ejecuta. Lo
> que no cumple la regla es lo que hay hoy: tests verdes sobre código muerto.

**No se borra hasta que la Parte A esté en verde.**

## C.6 · Código de acompañamiento

| archivo:línea | cambio |
|---|---|
| `apps/api/app/api/v1/admin/settings/route.ts:21` | zod → `z.object({ delivery: money, pickup: money })` |
| `apps/admin/app/configuracion/page.tsx:35-58` | `CommissionsCard`: 3 campos → 2, `grid-cols-3` → `grid-cols-2` |
| `apps/admin/app/configuracion/page.tsx:41` | **El label miente.** Dice "Comisiones por pedido entregado". Con la forma nueva el número ya no incluye el envío → *"Comisión de Tindivo (sin incluir el envío que paga el cliente)"* |
| `apps/admin/app/configuracion/page.tsx:51` | `save('commissions', { delivery, pickup })` |

**El label es el punto más peligroso de esta parte.** Si nadie lo cambia, el
admin teclea 3.50 pensando que es el total y le cobra el doble al negocio.

## C.7 · Verificación

- Los tests de la Parte A **siguen en verde** con los valores nuevos
- A1.1 sigue dando `commission=1.50` y `delivery_fee=2.00`
- A1.3 sigue dando `commission=1.00`
- `grep -rn "commission_override_near\|commission_override_far"` → 0 resultados
- `grep -rn "computeCommission"` → 0 resultados

---

# PARTE D · Firma del RPC — migración `0126`

**Bloquea la UI de la cajera.** Sin esto, los dos botones no tienen por dónde
enviar la banda.

## D.1 · El problema

`create_business_manual_order` **no acepta tarifa ni banda**. Firma actual
(`0117`):

```
(p_business_user_id uuid, p_delivery_method, p_payment_intent, p_order_amount numeric,
 p_customer_name text, p_customer_phone text, p_prep_time_minutes int,
 p_delivery_reference text, p_notes text,
 p_client_pays_with numeric, p_yape_amount numeric, p_cash_amount numeric)
```

Hoy todo pedido manual sale con `near` fijo a S/2,00 y `delivery_distance_band`
en **NULL**. En el pickup el `COALESCE` de `advance_order` cae a `'near'`.

## D.2 · El parámetro nuevo — uno solo

```
p_delivery_distance_band public.distance_band DEFAULT NULL
```

**Solo la banda, no la tarifa.** El RPC resuelve el monto leyendo
`delivery_bands`.

Razón: si solo existe un valor, **es imposible que tarifa y banda se
desincronicen** — no hay dos valores que puedan discrepar. Y cuando se suba
`far` a S/4, se cambia `app_settings` y ya: cero código, cero riesgo de que el
frontend quede con el valor viejo.

## D.3 · Lógica dentro del RPC

```sql
-- Manual EXIGE banda explícita. B2C cae a near.
IF p_delivery_distance_band IS NULL THEN
  v_band := 'near'::public.distance_band;
  v_fee_source := 'system';
ELSE
  v_band := p_delivery_distance_band;
  v_fee_source := 'business';
END IF;

-- Pickup no existe en pedido manual
IF p_delivery_method = 'pickup' THEN
  RAISE EXCEPTION 'El pedido manual no admite recojo en tienda'
    USING errcode = 'P0001';
END IF;

-- La tarifa SIEMPRE sale de delivery_bands, nunca del cliente
SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';
v_delivery_fee := COALESCE((v_bands ->> v_band::text)::numeric, 2.00);
```

**El INSERT escribe además:** `delivery_distance_band = v_band` y
`delivery_fee_source = v_fee_source`.

## D.4 · `order_event_log`

Hoy (`0117:535-537`) escribe `{deliveryMethod, paymentIntent, amount}`.
Pasa a incluir banda y tarifa:

```sql
jsonb_build_object(
  'deliveryMethod', p_delivery_method,
  'paymentIntent',  p_payment_intent,
  'amount',         p_order_amount,
  'band',           v_band,
  'deliveryFee',    v_delivery_fee,
  'feeSource',      v_fee_source
)
```

Es lo que permite auditar después quién eligió qué, sin depender de que las
columnas de `orders` no se hayan tocado.

## D.5 · 🔴 GRANTS — el paso más frágil

Cambiar la firma obliga a `DROP FUNCTION` + `CREATE`. **Postgres le da
`EXECUTE` a `PUBLIC` por defecto en funciones nuevas.**

Sin el bloque de revoke, un RPC `SECURITY DEFINER` que **crea pedidos** queda
ejecutable por cualquier usuario autenticado.

**Patrón exacto de `0032:103-108` y `0033:104-109`** — repetirlo con los tipos
nuevos:

```sql
DROP FUNCTION IF EXISTS public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, int,
  text, text, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.create_business_manual_order(
  … , p_delivery_distance_band public.distance_band DEFAULT NULL)
…

REVOKE EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, int,
  text, text, numeric, numeric, numeric, public.distance_band)
  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, int,
  text, text, numeric, numeric, numeric, public.distance_band)
  TO service_role;
```

> **Falla en runtime, no en la migración.** Si se olvida el grant, el SQL es
> correcto y la cajera recibe un error de permiso sobre una función que existe
> y funciona. Es el fallo más caro de diagnosticar del cambio.

**Verificación obligatoria:**

```sql
SELECT p.oid::regprocedure AS firma,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS ok,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='create_business_manual_order';
-- Esperado: UNA fila · ok=true · anon=false
-- Dos filas = quedó la firma vieja y PostgREST tendrá ambigüedad
```

## D.6 · `p_notes` se queda

Hoy se recibe y se descarta. **No se toca.** Sin evidencia de que nadie lo use,
quitarlo es riesgo sin ganancia. Se limpia otro día.

## D.7 · Código de acompañamiento

`apps/api/app/api/v1/business/orders/route.ts`:

- Zod: `deliveryDistanceBand: z.enum(['near','far']).optional()`
- La llamada al RPC pasa `p_delivery_distance_band: body.deliveryDistanceBand ?? undefined`
- **Llamada por nombre**, nunca posicional
- `pnpm db:types` después del push

## D.8 · Prueba de predicados

| # | caso | esperado |
|---|---|---|
| 1 | Sin banda | `near`, S/2,00, `fee_source='system'` |
| 2 | `near` | S/2,00, `fee_source='business'`, `delivery_distance_band='near'` |
| 3 | `far` | S/2,50, `fee_source='business'`, `delivery_distance_band='far'` |
| 4 | `pickup` + banda | **REBOTA** `P0001` |
| 5 | Cambiar `delivery_bands.far` a 4.00 y crear `far` | S/4,00 **sin tocar código** |
| 6 | Tras entregar un `far` | ledger: `delivery_fee=2.50` + `commission=1.50` = S/4,00 |

**El caso 5 es el que prueba la propiedad que motivó todo el rediseño.**

---

# PARTE E · UI de la cajera

**Sin migración.** Detalle completo en `Docs/spec/spec_ui_cajera.md`; aquí solo
lo que cambia respecto a ese documento y el orden de trabajo.

## E.1 · El bloque de montos

```
Monto del pedido        OBLIGATORIO
Solo la comida, sin delivery
[ S/.  25.00 ]

Delivery
[  S/ 2,00  ] [  S/ 2,50  ]      ← S/2,00 preseleccionado

─────────────────────────────────
TOTAL A COBRAR          S/ 27.00  ← el elemento más prominente
```

- Los valores salen de `app_settings.delivery_bands`, **nunca hardcodeados**
- Cada botón envía **`deliveryDistanceBand`**, no el monto
- El total se actualiza **en vivo** mientras teclea
- `vuelto = paga_con − total`; si `paga_con < total`, advertencia, **no número
  negativo**

## E.2 · Las cuatro correcciones de UI

| # | problema | corrección |
|---|---|---|
| 1 | Borde rojo cuando el cliente es nuevo | Borde neutro + etiqueta `Cliente nuevo` |
| 2 | Radio azul en el modal (rompe la paleta) | Color primario |
| 3 | `OBLIGATORIO` en texto vs `*` | Un solo marcador |
| 4 | Placeholder `Av. Paseo de la República 3500` (Lima) | `SOLIDEX ALTO - POR KINDER, A UNA CUADRA` |

## E.3 · Robustez

- **Degradación si falla el lookup:** timeout de 5 s, caída a modo manual, y
  **nunca** bloquear `Crear pedido` por un fallo de consulta opcional
- **Regenerar `Idempotency-Key`** cuando la cajera edita tras un intento
  fallido. Con el selector de delivery esto pasa de improbable a probable:
  cambia de S/2 a S/2,50, reintenta, y hoy recibe `idempotency_conflict` opaco
  (`apps/api/lib/http/idempotency.ts:77-81`)
- **Campos de vuelto condicionales:** ocultos en `Ya pagó` y `Cobrar con Yape`
- `inputMode="numeric"` en teléfono y montos; autofoco en teléfono

## E.4 · El modal de direcciones — NO es un caso raro

**58 de 595 teléfonos (9,7%) tienen direcciones genuinamente distintas**, medido.
Y probablemente supera ese 9,7% sobre pedidos, porque el cliente
multi-dirección es el frecuente.

**Referencias completas, sin truncar.** Lo que distingue una dirección de otra
está al final de la cadena — `SANTA ROSA - 5 ESQUINAS - DEL INICIAL AL FONDO` —
que es justo lo que se come una elipsis. Elegir mal manda el pedido a la casa
equivocada.

## E.5 · Pendientes de la UI

| # | qué | cómo se cierra |
|---|---|---|
| 1 | Dispositivo real de la cajera | Preguntar a Yolvi. Manda sobre el layout |
| 2 | Reparto en `Yape + Efectivo` | Levantamiento del legacy |
| 3 | Aviso a Priamo del cambio de campo | **Responsabilidad de Jesús** |

**El punto 3 no es opcional.** Yolvi lleva meses tecleando el total combinado.
El primer día va a teclear S/27 en un campo que ahora espera S/25.

---

# APÉNDICE · `charge_type adjustment` — diferible

**No bloquea nada de esta fase.** Se necesita para la auditoría de banda
(post-launch): corregir un `far` a `near` en un pedido ya liquidado requiere un
asiento negativo, y hoy el CHECK es `amount > 0`.

```sql
ALTER TABLE public.business_charges DROP CONSTRAINT business_charges_amount_check;
ALTER TABLE public.business_charges
  ADD CONSTRAINT business_charges_amount_check CHECK (amount <> 0);

ALTER TABLE public.business_charges DROP CONSTRAINT business_charges_charge_type_check;
ALTER TABLE public.business_charges
  ADD CONSTRAINT business_charges_charge_type_check CHECK (
    charge_type = ANY (ARRAY['commission','delivery_fee','refund_charge','adjustment'])
  );
```

> 🔴 **NO aplicar sin el cambio de código.**
> `apps/api/.../admin/charges/summary/route.ts:49-75` y
> `.../business/account/summary/route.ts:71-81` suman con `if/else if` sobre
> los tres tipos conocidos y **no tienen rama `else`**. Un tipo nuevo
> **desaparece del panel** pero **sí entra** en `settle_business_charges` y en
> `sumPendingLedgerDebt`.
>
> Resultado: se le cobraría a Priamo un monto que la pantalla nunca mostró.

Reemplazar por un mapa con caída explícita:

```ts
const MAPA: Record<string, keyof Totales> = {
  commission: 'comisiones', delivery_fee: 'envios',
  refund_charge: 'reembolsos', adjustment: 'ajustes',
}
totales[MAPA[c.charge_type] ?? 'otros'] += amt
```

El `?? 'otros'` es lo que importa: cualquier tipo futuro suma en una categoría
**visible** en vez de evaporarse.

**Bonus del mismo archivo:** `charges/summary/route.ts:24` filtra los negocios
con `.gt('balance_due', 0)`. Con `balance_due` derivado (Parte B) se corrige
solo, pero verificarlo.

---

# REGLAS QUE RIGEN TODA ESTA FASE

1. **Gate humano** (`AGENTS.md §2.2`) en Partes A–D. Aprobación pieza por pieza.
2. **Solo `npx supabase db push`.** Prohibido SQL directo, `docker cp` + `psql`,
   y aplicar migraciones vía MCP.
3. **Migraciones inmutables.** Aplicada a prod, no se modifica.
4. **Validar en local antes de prod.** `supabase db reset` + verificaciones +
   prueba de predicados. Siempre.
5. **`rollback-NNNN.sql` escrito ANTES del push**, en `Docs/spec/`.
6. **Toda migración que cambie firma emite `REVOKE` + `GRANT` en el mismo
   archivo.** Sin excepción — ese patrón mordió tres veces en este repo.
7. **Ninguna función de dinero se da por buena sin una prueba que la ejecute.**
   Leerla no cuenta. Cinco casos en esta sesión: el CHECK del 999, el literal
   `'appeal'` inexistente en el enum, un comentario que decía lo contrario del
   código, un regex que se cortaba en `DISTINCT`, y el alfabeto del `short_id`.
8. **`short_id`:** `^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$`. Sin `I`, `O`,
   `0` ni `1`. Usar `ZZTESTAB` y siguientes en pruebas.
9. **`prokind = 'f'`** al introspeccionar `pg_proc`: hay un agregado propio en
   `public` y `pg_get_functiondef` no acepta agregados.
10. **Evidencia, no inferencia.** `NO ENCONTRADO` antes que suponer.

---

# CRITERIO DE CIERRE DE LA FASE

- [ ] Parte A en verde (A.3 en rojo documentado apuntando a `0124`)
- [ ] `0124` aplicada · reconciliación global en 0 filas · A.3 pasa a verde
- [ ] `0125` aplicada · Parte A sigue verde · `packages/core/order/commission.ts` borrado
- [ ] `0126` aplicada · grants verificados · prueba de predicados en verde
- [ ] UI de la cajera con los dos botones y el total visible
- [ ] Priamo avisado del cambio en el campo de monto
