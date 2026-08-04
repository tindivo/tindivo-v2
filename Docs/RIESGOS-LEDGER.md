# RIESGOS DEL LEDGER — módulo financiero v2

**Fecha:** 2026-08-04 · **Base:** `zpnipajgwfthxhdtzhly` (tindivo-prod)
**Método:** levantamiento de solo lectura sobre la definición viva
(`pg_get_functiondef`) y el árbol del repo. Todo lo que dice "medido" se
ejecutó y se vio; nada aquí es estimación.

Este documento **no arregla nada**. Registra cuatro riesgos estructurales y
cuatro hallazgos menores para que la decisión sea explícita y con fecha, en vez
de que alguien los redescubra dentro de seis meses leyendo un `UPDATE` suelto.

Rige `.agents/AGENTS.md §2.2`: *"Gate humano obligatorio: cualquier cambio que
toque lógica de dinero (ledger, appeals, refunds, comisiones, fees) requiere
revisión humana explícita ANTES de aplicarse. En el módulo financiero NO operas
en modo autónomo."*

## Estado de los datos al escribir esto

```
settlements: 0 · restaurant_payments: 0 · business_charges: 0
contingency_advances: 0 · businesses: 0 · orders: 0
```

**La base está vacía.** Ninguno de estos riesgos ha producido todavía un solo
sol mal contado, y todos son corregibles sin migrar datos. Esa ventana se cierra
con el primer pedido del piloto.

---

## R-L1 · `balance_due`: la regla y el código se contradicen

### Qué es

`.agents/AGENTS.md:76-78` es inequívoco:

> - `business_charges` es el ledger y la ÚNICA fuente de verdad de la deuda de restaurantes.
> - `balance_due` está DEPRECADO. No escribas en él ni lo uses para calcular saldos.

**Once funciones escriben en `balance_due`.** Ocho están vivas, tres muertas.
Entre las vivas están los dos triggers que sostienen la operación diaria.

> Corrección: un levantamiento previo dijo "nueve funciones". El conteo exacto,
> verificado función por función, es **once escritoras** (más
> `settle_business_charges`, que solo lo lee en un `WHERE`).

### Evidencia

| # | Función | Última definición | Efecto sobre `balance_due` | ¿viva? |
|---|---|---|---|---|
| 1 | `generate_delivery_charges` | `0074_separate_commission_and_delivery_fee.sql` | `+= (delivery_fee + commission)` al entrar en `delivered`; `-=` en la rama de reversión | ✅ trigger `trg_orders_balance_due` |
| 2 | `decrement_balance_on_payment` | `0009_function_grants.sql` | `= greatest(0, balance_due - new.amount)` | ✅ trigger `trg_restaurant_payments_decrement_balance` |
| 3 | `handle_prepaid_refund_on_cancel` | `0089_fix_prepaid_refund_charge_ledger.sql` | `+= order_amount + delivery_fee` | ✅ trigger `trg_orders_prepaid_refund` |
| 4 | `create_contingency_advance` | `0077_decouple_contingency_advances.sql` | `+= p_amount` si `actor_charged = 'restaurante'` | ✅ |
| 5 | `dispute_contingency_advance` | `0077_decouple_contingency_advances.sql` | `= greatest(0, balance_due - v_a.amount)` | ✅ |
| 6 | `resolve_contingency_advance` | `0077_decouple_contingency_advances.sql` | `+= p_resolved_amount` | ✅ |
| 7 | `resolve_fraud_claim` | `0102_fix_fraud_claim_actor_charged.sql` | `+= v_row.amount` | ✅ |
| 8 | `pay_settlement` | `0026_contingency_fund_key_fix.sql` | `= greatest(0, balance_due - v_repl)` | ✅ (ver R-L2) |
| 9 | `update_business_balance` | `0009_function_grants.sql` | `+= tindivo_commission` / `-=` | ❌ huérfana (ver M-1) |
| 10 | `handle_prepaid_cancel_auto_debt` | `0077_decouple_contingency_advances.sql` | `+= order_amount + delivery_fee` | ❌ huérfana |
| 11 | `register_appeal_refund(uuid,numeric,text,uuid)` | `0073_business_charges_table_and_triggers.sql` | `+= p_amount` | ❌ sobrecarga muerta (ver R-L3) |

Lecturas de `balance_due` en la UI, que por tanto muestran el campo deprecado y
no el ledger:

- `apps/admin/app/negocios/page.tsx:19` y `:167` — columna de deuda por negocio.
Y el que más pesa:

> ⚠️ **`settle_business_charges` condiciona el desbloqueo del negocio a
> `balance_due <= 0`. Una REGLA DE NEGOCIO depende hoy del campo que la
> documentación manda no usar. No es solo inconsistencia documental.**

```sql
-- settle_business_charges, 0076_fix_double_balance_decrement.sql
UPDATE public.businesses
  SET is_blocked = false, blocked_for_debt = false, block_reason = NULL
  WHERE id = p_business_id
    AND blocked_for_debt = true
    AND balance_due <= 0;
```

El mismo criterio aparece en `decrement_balance_on_payment`
(`AND balance_due = 0`). Los dos caminos que devuelven a un negocio a la
operación —dejarlo cobrar, dejarlo recibir pedidos— se deciden con el campo
deprecado, no con el ledger. Si `balance_due` y `SUM(business_charges)` divergen
(y por R-L4 divergen por diseño), un negocio puede quedar desbloqueado debiendo,
o bloqueado sin deber.

En contraste, `apps/api/app/api/v1/admin/charges/summary/route.ts:49-75` y
`apps/api/app/api/v1/business/account/summary/route.ts:71-81` **sí** recalculan
desde el ledger. Y el helper de tests
`apps/api/lib/__tests__/helpers/local-db.ts:295-305` (`sumPendingLedgerDebt`)
replica el criterio exacto de la RPC de liquidación.

### Qué puede pasar

Dos pantallas del mismo panel muestran deudas distintas para el mismo negocio y
las dos "tienen razón" según qué documento se lea. El bloqueo por mora se
dispara o no según el campo deprecado. Y cualquiera que escriba un test contra
`balance_due` consagra el campo que la regla quiere retirar — el test se vuelve
el argumento para no retirarlo.

### Qué haría falta para resolverlo

**Una decisión de Jesús, planteada así:**

> Si `SUM(business_charges)` y `balance_due` no coinciden, ¿cuál se usa para
> cobrar? Si es el ledger, `balance_due` es un cache reconstruible. Si es el
> campo, el ledger es historial. Hoy **NO es reconstruible**, porque
> contingencia mueve `balance_due` sin dejar rastro en el ledger.

Esa última frase es el nudo: la opción "cache reconstruible" no está disponible
hoy. Para habilitarla habría que resolver antes R-L4. Mientras tanto las
opciones reales son dos: o el ledger pasa a ser la verdad **y** contingencia
empieza a escribir en él, o `balance_due` deja de estar deprecado y `AGENTS.md`
se corrige para decir lo que el código hace.

---

## R-L2 · `pay_settlement` no toca el ledger y baja el saldo dos veces

> ⚠️ **Este bug ya fue diagnosticado y corregido en este repositorio, pero solo
> en uno de los dos caminos.** `0076_fix_double_balance_decrement.sql` eliminó el
> doble decremento de `settle_business_charges` y su cabecera describe
> exactamente el mismo problema que `pay_settlement` sigue teniendo. **No es un
> riesgo hipotético: es una corrección aplicada a medias.**

### Qué es

Hay **dos caminos de liquidación paralelos** que no hacen lo mismo.
`settle_business_charges` liquida el ledger; `pay_settlement` liquida el saldo y
deja el ledger intacto — y además lo decrementa dos veces en la misma llamada.

### Evidencia

Definición viva de `pay_settlement(uuid, uuid, text, text)`
(`0026_contingency_fund_key_fix.sql`):

```sql
insert into public.restaurant_payments (
  business_id, settlement_id, amount, payment_method, paid_at, registered_by, note
) values (
  v_s.business_id, v_s.id, v_s.total_amount, p_method, now(), p_paid_by, p_note
);
--  ↑ dispara trg_restaurant_payments_decrement_balance → balance_due -= total_amount

update public.settlements set status = 'paid', … where id = p_settlement_id;

with repl as (
  update public.contingency_advances ca set replenished_at = now(), …
   where ca.actor_charged = 'restaurante' and ca.status = 'activo'
     and ca.replenished_at is null
  returning ca.amount
)
select coalesce(sum(amount), 0) into v_repl from repl;

if v_repl > 0 then
  update public.app_settings set value = jsonb_set(value,'{current}', … + v_repl) …;
  update public.businesses set balance_due = greatest(0, balance_due - v_repl) …;
  --  ↑ SEGUNDA bajada, en la misma transacción
end if;
```

**En ningún punto aparece `business_charges`.** Ni un `UPDATE … SET status =
'settled'`, ni un `payment_id`, ni un `settled_at`.

Compárese con `settle_business_charges` (`0076_fix_double_balance_decrement.sql`),
que sí cierra el ledger:

```sql
UPDATE public.business_charges
  SET status = 'settled', payment_id = v_payment_id, settled_at = now()
  WHERE id = ANY(p_charge_ids);
```

Y nótese el nombre de esa migración: **`0076_fix_double_balance_decrement`**. Su
cabecera dice:

> Al insertar en restaurant_payments, el trigger decrement_balance_on_payment (0003)
> ya decrementa balance_due por el monto pagado.
> Esta migración elimina el UPDATE explícito a balance_due en settle_business_charges.

El mismo bug de doble decremento se corrigió en `settle_business_charges` en la
0076 **y sigue presente en `pay_settlement`**, que nunca se revisó.

### ¿Está vivo? ¿Quién lo llama? ¿Cuántas veces se ha ejecutado?

- **Está vivo.** Existe en la base y tiene un endpoint que lo invoca.
- **Lo llama** `apps/api/app/api/v1/admin/settlements/[id]/pay/route.ts:31`.
- **Ejecuciones: cero.** Medido el 2026-08-04:
  `settlements = 0`, `settlements con status='paid' = 0`,
  `restaurant_payments = 0`, y `restaurant_payments con settlement_id no nulo = 0`.
  El camino existe, está expuesto por el API y **nunca ha corrido**.

### Qué puede pasar

Un negocio con adelantos de contingencia activos que se liquide por este camino
ve su `balance_due` bajar por el pago **y otra vez** por la reposición del
fondo, mientras sus cargos siguen en `pending`. El ledger dice que debe y el
campo dice que no. Y como los cargos nunca se marcan, la siguiente liquidación
por el otro camino los vuelve a cobrar.

Que hoy tenga cero ejecuciones no lo hace inofensivo: lo hace **barato de
arreglar ahora y caro después del primer uso**, porque a partir de ahí hay que
reconciliar filas reales.

### Qué haría falta para resolverlo

Decidir si los dos caminos deben existir. Si `settlements` es el modelo
canónico, `settle_business_charges` sobra; si el canónico es el ledger,
`pay_settlement` tiene que marcar cargos y perder uno de sus dos decrementos.
Mientras tanto, el endpoint `/admin/settlements/[id]/pay` está publicado y a un
clic de distancia.

---

## R-L3 · `register_appeal_refund`: las sobrecargas están invertidas

### Qué es

Existen **dos funciones con el mismo nombre** y semántica de dinero distinta. La
que corre en producción escribe en `contingency_advances` — exactamente el
patrón que `AGENTS.md` prohíbe por nombre. La que escribe en el ledger está
muerta.

### Evidencia

| firma | qué hace con el dinero | origen | ¿la llaman? |
|---|---|---|---|
| `(uuid, text, numeric)`<br>`p_report_id, p_refund_proof_path, p_amount` | `PERFORM public.create_contingency_advance(… 'restaurante' …)` → descuenta el fondo y sube `balance_due`. **No escribe `business_charges`** | creada en `0067_appeal_resolution_flow.sql:401`, redefinida en `0077_decouple_contingency_advances.sql:12` | ✅ `apps/api/app/api/v1/admin/appeals/[id]/refund/route.ts:30-34` |
| `(uuid, numeric, text, uuid)`<br>`p_report_id, p_amount, p_refund_proof_path, p_admin_user_id` | `INSERT INTO business_charges (… report_id …, 'refund_charge' …)` + `balance_due +=` | `0073_business_charges_table_and_triggers.sql:140` | ❌ nadie |

La secuencia histórica es legible en las migraciones: **`0073` puso los appeals
en el ledger, y `0077` sacó de ahí a la sobrecarga viva** para pasarla por
contingencia. Nunca se borró la anterior.

`.agents/AGENTS.md:78-79`:

> - Appeals, refunds y cualquier ajuste de saldo escriben en `business_charges`, en ninguna otra tabla.
>   (Bug conocido #5: el flujo de appeals escribía en `contingency_advances` — NO repetir ese patrón.)

El bug #5 no es un patrón a no repetir: **es el código que está corriendo.**

Consecuencia colateral: `business_charges.report_id` existe, es nullable, y **el
único código que la escribe es la sobrecarga muerta**. Hoy no hay ningún camino
vivo que produzca un cargo con `report_id`.

### Qué puede pasar

Dos sobrecargas del mismo nombre con semántica de dinero distinta es una trampa
de resolución: **basta cambiar el orden de los argumentos para acertarle a la
otra**. Ambas empiezan por `uuid` y llevan un `numeric` y un `text`; una llamada
posicional mal escrita compila, corre, y asienta el reembolso en la tabla
equivocada sin error. El endpoint pasa hoy los tres parámetros por nombre
(`p_report_id`, `p_refund_proof_path`, `p_amount`), que es lo único que lo
mantiene en el carril correcto.

Además, un reembolso por apelación aprobada hoy **no aparece en el ledger**, así
que la deuda que el panel de cobros recalcula desde `business_charges` no lo
incluye.

### Qué haría falta para resolverlo

Decidir cuál de las dos es la buena y **borrar la otra** — con `DROP FUNCTION`
de firma explícita, no `CREATE OR REPLACE`. Si gana el ledger (que es lo que
dice la regla), hay que rehacer la de tres argumentos y actualizar
`refund/route.ts`. Ojo con los grants: `0067:480-481` le dio `EXECUTE` a
`authenticated`, no a `service_role`, y el endpoint usa `createUserClient(token)`
en vez del cliente de servicio.

---

## R-L4 · `contingency_advances` es un ledger paralelo

### Qué es

`contingency_advances` mueve `balance_due` **sin pasar por `business_charges`**.
Crea deuda real que el ledger no ve. **Es por diseño, no por error**: la
migración que lo estableció se llama, literalmente,
`0077_decouple_contingency_advances`.

### Evidencia

Las tres funciones del bloque, todas de `0077`, tocan el saldo directo:

```sql
-- create_contingency_advance
if p_actor_charged = 'restaurante' then
  update public.businesses set balance_due = balance_due + p_amount where id = v_order.business_id;
end if;

-- dispute_contingency_advance  (congela la deuda mientras dura la disputa)
update public.businesses set balance_due = greatest(0, balance_due - v_a.amount) where id = v_biz.id;

-- resolve_contingency_advance  (la descongela al monto resuelto)
if v_a.actor_charged = 'restaurante' and p_resolved_amount > 0 then
  update public.businesses set balance_due = balance_due + p_resolved_amount where id = v_order.business_id;
end if;
```

Ninguna escribe en `business_charges`. Y `pay_settlement` cierra el círculo
bajando `balance_due` por la reposición del fondo (ver R-L2), también sin tocar
el ledger.

El caso mixto está en `resolve_fraud_claim`
(`0102_fix_fraud_claim_actor_charged.sql`), que escribe en **las dos** tablas:
un `contingency_advances` con `actor_charged='restaurante'` **y** un
`business_charges('refund_charge')` **y** un `balance_due +=`. Ese es el único
punto donde los dos ledgers se cruzan, y lo hace por inserción directa (no vía
`create_contingency_advance`), así que el saldo sube una sola vez — pero la
reposición posterior de `pay_settlement` lo va a descontar mientras el cargo
sigue `pending`.

### Qué puede pasar

**`SUM(business_charges WHERE status='pending') ≠ balance_due` NO es un bug hoy:
es el comportamiento esperado.** Cualquier test de reconciliación global
fallaría por diseño, y quien lo escriba sin saber esto va a "arreglar" un
desajuste que es intencional.

Esto es también lo que hace que la opción "`balance_due` es un cache
reconstruible" de R-L1 no esté disponible: no se puede reconstruir un saldo a
partir de un ledger que no contiene todos los movimientos.

### Qué haría falta para resolverlo

Que contingencia emita su asiento en `business_charges` como cualquier otro
ajuste — con un `charge_type` propio y montos con signo, porque disputar
requiere restar y hoy no existe ningún camino que inserte un `amount` negativo
ni ningún tipo de crédito. Eso es un rediseño del ledger, no un parche, y
arrastra a R-L1 y R-L2 con él.

---

## Hallazgos menores

### M-1 · `update_business_balance` huérfana y peligrosa

`0009_function_grants.sql`. **0 triggers, y ninguna otra función la menciona**
(verificado contra `pg_trigger` y contra el cuerpo de todas las funciones de
`public`). Su cuerpo:

```sql
if old.status <> 'delivered' and new.status = 'delivered' then
  update public.businesses
    set balance_due = balance_due + coalesce(new.tindivo_commission, 0)
```

Suma **`tindivo_commission` COMPLETO**, que incluye el envío. `generate_delivery_charges`
ya suma `delivery_fee + commission`, que es el mismo total. **Si alguien la
vuelve a atar a un trigger sobre `orders`, cada entrega cuenta doble.** Es la
versión pre-`0074` del mismo cálculo, que quedó en la base cuando se la
reemplazó.

### M-2 · Dos funciones muertas más

- `handle_prepaid_cancel_auto_debt` (`0077`): 0 triggers, nadie la menciona. Es
  gemela de `handle_prepaid_refund_on_cancel`, que sí está atada a
  `trg_orders_prepaid_refund`. Dos copias del mismo asiento, una conectada.
- `register_appeal_refund(uuid, numeric, text, uuid)` (`0073:140`): ver R-L3.

Ninguna hace daño mientras siga desconectada. Las tres juntas son código que
parece fuente de verdad al leerlo.

### M-3 · Los defaults de `advance_order` están desfasados

En la definición viva, líneas 228, 234 y 240, el último término de cada
`COALESCE`:

```sql
(v_commissions ->> 'pickup')::numeric,  0.50    -- valor vivo: 1.00
(v_commissions ->> 'near')::numeric,    3.00    -- valor vivo: 3.50
(v_commissions ->> 'far')::numeric,     3.50    -- valor vivo: 3.50
```

Desfasados desde `0110_far_costs_the_same_as_near.sql:47-49`, que dejó
`commissions` en `{"pickup": 1.00, "near": 3.50, "far": 3.50}`. Solo se
activarían si la clave desapareciera de `app_settings`, pero en ese escenario
—el único en que importan— cobrarían de menos y en silencio.

### M-4 · Comentario obsoleto en un test financiero

`apps/api/lib/__tests__/resolve-fraud-claim.integration.test.ts:4-5`:

> DEBE SALIR ROJO con el código actual: la RPC inserta contingency_advances
> con actor_charged='tindivo', pero el invariante correcto es 'restaurante'.

El `FIX #5` ya está aplicado en la función viva
(`0102_fix_fraud_claim_actor_charged.sql`), que inserta `'restaurante'`. El test
debería estar verde y su cabecera afirma lo contrario. Quien lo lea va a
concluir que el bug sigue abierto.

---

## Cierre

Ninguno se resuelve antes del launch. La cadena que sí cuadra y que este sprint
modifica es **crear → pickup → delivered → `business_charges`**. El resto queda
congelado y documentado.
