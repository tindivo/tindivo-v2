# RIESGOS DEL LEDGER — módulo financiero v2

**Fecha:** 2026-08-04 · **Base:** `zpnipajgwfthxhdtzhly` (tindivo-prod)
**Método:** levantamiento de solo lectura sobre la definición viva
(`pg_get_functiondef`) y el árbol del repo. Todo lo que dice "medido" se
ejecutó y se vio; nada aquí es estimación.

Este documento registra cuatro riesgos estructurales y seis hallazgos menores
para que la decisión sea explícita y con fecha, en vez de que alguien los
redescubra dentro de seis meses leyendo un `UPDATE` suelto.

> **📌 Los diez están CERRADOS** — verificado contra la base viva el
> **2026-09-01**. La migración `0123` cerró siete el 2026-08-05; los tres que
> quedaban los cerraron la `0124`, la `0125` y la `0200` sin que este documento
> se enterara. El estado real de cada uno, con la consulta que lo mide, está en
> la sección [ESTADO REAL](#estado-real--0123-aplicada-en-prod-el-2026-08-05);
> las secciones que siguen describen los riesgos **tal como se encontraron**, y
> se conservan sin reescribir porque el diagnóstico original es lo que explica
> por qué la corrección quedó como quedó.

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
| 11 | `register_appeal_refund(uuid,numeric,text,uuid)` | `0077_decouple_contingency_advances.sql` (creada en `0073`) | `+= p_amount` | ❌ sobrecarga muerta (ver R-L3) |

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
| `(uuid, text, numeric)`<br>`p_report_id, p_refund_proof_path, p_amount` | `PERFORM public.create_contingency_advance(… 'restaurante' …)` → intenta descontar el fondo y sube `balance_due`. **No escribe `business_charges`** | creada en `0067_appeal_resolution_flow.sql:401` y **nunca modificada desde entonces** | ✅ `apps/api/app/api/v1/admin/appeals/[id]/refund/route.ts:30-34` |
| `(uuid, numeric, text, uuid)`<br>`p_report_id, p_amount, p_refund_proof_path, p_admin_user_id` | `INSERT INTO business_charges (… report_id …, 'refund_charge' …)` + `balance_due +=` | `0073_business_charges_table_and_triggers.sql:140` | ❌ nadie |

> **CORRECCIÓN (2026-08-04).** La primera versión de este documento decía que
> "`0073` puso los appeals en el ledger y `0077` sacó de ahí a la sobrecarga
> viva". **Es falso y está al revés.** La secuencia real, verificada firma por
> firma, es la siguiente.

| migración | qué definió | efecto real |
| --- | --- | --- |
| `0067_appeal_resolution_flow.sql:401` | la de **3 argumentos**, que llama a `create_contingency_advance` | quedó viva desde el día uno y **nunca se modificó** |
| `0073_business_charges_table_and_triggers.sql:140` | una de **4 argumentos** que escribe en `business_charges` | intento 1 de moverlo al ledger |
| `0077_decouple_contingency_advances.sql:12` | **la misma de 4 argumentos**, bajo el título *"register_appeal_refund (Desacoplado de contingency_advances)"* | intento 2 |

**Los dos intentos fallaron por la misma razón: `CREATE OR REPLACE FUNCTION` con
una firma distinta no reemplaza nada — crea una función nueva.** La de 3
argumentos sobrevivió intacta a las dos migraciones, y
`apps/api/app/api/v1/admin/appeals/[id]/refund/route.ts:30-34` nunca se repuntó.
`grep` de `DROP FUNCTION … register_appeal_refund` sobre todas las migraciones
devuelve **cero resultados**.

Es decir: **el desacoplamiento que la cabecera de `0077` declara como hecho
nunca surtió efecto.** No hubo una decisión de volver a contingencia; hubo dos
refactors dados por terminados sin verificar que el camino vivo hubiera
cambiado. Eso agrava el riesgo en vez de atenuarlo: el mismo error puede
repetirse en cualquier RPC que se "reemplace" cambiándole la firma.

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

> ✅ **CERRADO por la `0125`.** Aquella quitó la banda del cálculo de la comisión
> —ya no hay `near`/`far`, solo `pickup`/`delivery`— y de paso corrigió los
> defaults, dejándolos en 1.00 / 1.50. Medido en la base viva el 2026-09-01:
> el `COALESCE` de `advance_order` cae en `1.00` y `1.50`, y
> `app_settings.commissions` vale `{"pickup": 1.00, "delivery": 1.50}`. Los dos
> números coinciden, que es justo lo que este hallazgo pedía.

### M-4 · Comentario obsoleto en un test financiero

`apps/api/lib/__tests__/resolve-fraud-claim.integration.test.ts:4-5`:

> DEBE SALIR ROJO con el código actual: la RPC inserta contingency_advances
> con actor_charged='tindivo', pero el invariante correcto es 'restaurante'.

El `FIX #5` ya está aplicado en la función viva
(`0102_fix_fraud_claim_actor_charged.sql`), que inserta `'restaurante'`. El test
debería estar verde y su cabecera afirma lo contrario. Quien lo lea va a
concluir que el bug sigue abierto.

### M-5 · 🔴 `register_appeal_refund` de 4 argumentos es ejecutable por `anon`

Descubierto el 2026-08-04 al preparar `0123`. ACL medida:

```
register_appeal_refund(uuid,numeric,text,uuid)
  {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,…}
   ↑ el "=X" inicial es PUBLIC
```

| firma | service_role | authenticated | anon |
| --- | --- | --- | --- |
| `(uuid,numeric,text,uuid)` | ✅ | ✅ | **✅** |
| `(uuid,text,numeric)` | ✅ | ✅ | ❌ |
| `resolve_fraud_claim` (referencia sana) | ✅ | ❌ | ❌ |

Ni `0073` ni `0077` emitieron `REVOKE`/`GRANT` para esa firma, así que heredó el
default de PostgreSQL, que concede `EXECUTE` a `PUBLIC`. **Y a diferencia de la
de 3 argumentos, no comprueba el rol admin por dentro**: la de 3 tiene
`IF NOT public.current_user_has_role('admin') THEN RAISE`, la de 4 no.

Es una función `SECURITY DEFINER` que inserta en el ledger y sube `balance_due`,
invocable desde el PostgREST con la anon key. La explotación exige conocer un
`report_id` válido —un uuid no adivinable—, así que el riesgo práctico es bajo.
Pero es una función de dinero abierta a `anon` y hay que cerrarla.

### La misma causa raíz, por tercera vez

`CREATE OR REPLACE FUNCTION` con una firma distinta **no reemplaza: crea una
función nueva**, con ACL por defecto y sin heredar nada de la anterior. En este
repo ya mordió tres veces:

1. **`0073`** creó la sobrecarga de 4 argumentos de `register_appeal_refund`
   creyendo reemplazar la de 3. No la reemplazó, y no emitió grants.
2. **`0077`** repitió el intento sobre la misma firma, con el mismo resultado, y
   tampoco emitió grants. El desacoplamiento que declara nunca ocurrió (R-L3).
3. **Hoy** se descubre que la función así creada quedó ejecutable por `anon`
   (M-5), porque nadie revocó el default de PostgreSQL.

Las migraciones `0031`, `0032` y `0033` sí lo hacen bien, y por eso
`create_business_manual_order` está sana: las tres repiten el bloque
`revoke … from public, anon, authenticated; grant … to service_role` cada vez
que cambian la firma.

### La regla ya existía: `.agents/AGENTS.md §2.9`

**Esto no es un hallazgo.** La norma está escrita desde antes, y dice
exactamente lo que hacía falta:

> ### 2.9 Redefinir una función: comprobar que reemplaza, no que duplica
>
> Toda migración que redefina una función debe verificar, ANTES de aplicarla al remoto:
>
> - **a) Una sola fila.** `select oid, pg_get_function_arguments(oid) from pg_proc where proname = '<nombre>';`
>   Debe devolver **UNA** sola fila. Si devuelve más, se creó una sobrecarga en vez
>   de un reemplazo […]
> - **b) Al menos una llamada real POR HTTP**, no por RPC directa […] Un type-check
>   verde y los tests unitarios en verde **no detectan esto**.
>
> **Precedente:** 0114 duplicó `advance_order` en local y en producción. PostgREST
> dejó de resolver toda transición de pedido. Se descubrió al verificar el
> comportamiento, no al aplicar la migración.

### La lección, con la cronología medida

Fechas verificadas contra `git log`:

| | fecha |
| --- | --- |
| `0073` duplica `register_appeal_refund` | 2026-07-21 |
| `0077` lo repite | 2026-07-22 |
| `0114` duplica `advance_order` y rompe PostgREST | 2026-07-31 |
| **§2.9 se escribe** | **2026-07-31** |

**§2.9 nació nueve días después de `0077`.** Así que `0073` y `0077` no
incumplieron una norma vigente: son las **dos primeras ocurrencias** del fallo
que, al repetirse en `0114` y romper algo visible, hizo que se escribiera la
regla.

Y ahí está el problema real, que es peor que el incumplimiento:

**§2.9 solo mira hacia adelante. Nadie barrió hacia atrás.** Cuando `0114` dolió,
se escribió la norma para que no volviera a pasar — pero no se auditó si
migraciones anteriores ya habían dejado sobrecargas conviviendo en la base. Las
de `0073` y `0077` llevaban diez días ahí, calladas, y siguieron otras dos
semanas. Sus tres consecuencias —las sobrecargas invertidas de R-L3, la función
abierta a `anon` (M-5), y `register_appeal_refund` que nunca funcionó (M-6)— son
daño anterior a la regla que la regla no podía descubrir.

**Lo que sí funcionó.** §2.9 no se cumplió leyéndolo: se cumplió **ejecutando el
PASO 2 del runbook**, que corre su misma consulta y exige una sola fila. La
verificación lo hizo cumplir; la regla escrita, por sí sola, no — ni para lo que
vino después de ella, ni mucho menos para lo que ya estaba dentro.

> ## PROPUESTA — verificación automatizada post-migración
>
> Un script que, tras cada `db push`, cuente sobrecargas de toda función
> redefinida y falle si hay más de una. Haría cumplir §2.9 sin depender de la
> memoria de nadie.
>
> **Alcance por definir.** La pregunta que decide su valor: ¿mira solo las
> funciones que la migración toca, o barre las de todo el esquema? Lo segundo es
> lo que habría encontrado el daño de `0073`/`0077` sin esperar dos semanas a
> que alguien fuera a mirar.
>
> No implementado.

### M-6 · 🔴 La sobrecarga de 4 argumentos nunca funcionó

`register_appeal_refund(uuid,numeric,text,uuid)` comparaba `v_report.type`
contra el literal `'appeal'`, que **no existe** en el enum `report_type`. Postgres
lanza `22P02` al castear, así que la función **fallaba en TODA llamada desde que
se creó en `0073`**. No estaba desconectada por un refactor incompleto: **nunca
funcionó.**

Medido en local el 2026-08-04, con monto correcto y con monto incorrecto:

```
NOTICE:  [sqlstate 22P02] invalid input value for enum public.report_type: "appeal"
```

Valores reales del enum: `no_show`, `rejected_proof_disputed`,
`cash_difference`, `restaurant_fake`, `strike_reactivation`, `advance_dispute`,
`prepay_refund_review`. Las apelaciones son `rejected_proof_disputed`, que es
como las filtra `apps/api/app/api/v1/admin/appeals/route.ts:40`.

**Detectado por prueba de predicados, no por lectura.** Tres levantamientos
seguidos leyeron esa función —incluido el que la propuso como destino del
repunte— y ninguno lo vio.

### Es el cuarto caso del mismo patrón

Código de dinero escrito, dado por bueno, nunca ejecutado:

| # | caso | cómo se supo |
| --- | --- | --- |
| 1 | Las dos sobrecargas de `register_appeal_refund` conviviendo (R-L3) | comparar firmas contra el `grep` de `DROP FUNCTION` |
| 2 | `pay_settlement` con cero ejecuciones históricas (R-L2) | contar filas en `settlements` y `restaurant_payments` |
| 3 | La ventana de disputa inoperante por leer una clave borrada | seguir `contingency_fund` hasta `0077:169-174` |
| 4 | **M-6**, esta | **ejecutarla** |

Los tres primeros se descubrieron leyendo con cuidado. El cuarto solo salió al
ejecutarlo — y era el más grave, porque el plan consistía en volverlo el camino
canónico del dinero.

> ## REGLA
>
> **Ninguna función de dinero se da por buena sin una prueba que la ejecute.
> Leerla no cuenta.**
>
> Y cada guarda necesita su propia prueba: si una guarda no tiene una prueba que
> la vea **rebotar**, no está verificada. Un `CHECK` o un `RAISE` que "se lee
> bien" no prueba nada — ya pasó con el centinela 999 del ETL de direcciones y
> volvió a pasar aquí.

---

## ESTADO REAL — `0123` APLICADA EN PROD EL 2026-08-05

Ya no es un plan. `supabase db push` aplicó `0123` a `zpnipajgwfthxhdtzhly` el
2026-08-05, y el runbook completo cerró en verde: §8 contra prod (`t / t / 0`,
una sola fila de `register_appeal_refund` con `anon=false`), la prueba de
predicados contra prod con las seis guardas rebotando y los cinco conteos de
limpieza en 0, `db:types` regenerado (`f7f5497`) y las tres compuertas
—`type-check` 10/10, `lint` 0 errores, 168 tests—.

| riesgo | estado | cerrado por |
| --- | --- | --- |
| **R-L1** · `balance_due` deprecado | ✅ **CERRADO** | `0124` |
| **R-L2** · `pay_settlement` | ✅ **CERRADO** | `0124` + `0200` |
| **R-L3** · sobrecargas invertidas | ✅ **CERRADO** | `0123` (2026-08-05) |
| **R-L4** · ledger paralelo | ✅ **CERRADO** | `0123` (2026-08-05) |
| **M-1** · `update_business_balance` huérfana | ✅ **CERRADO** | `0123` (2026-08-05) |
| **M-2** · funciones muertas | ✅ **CERRADO** | `0123` (2026-08-05) |
| **M-3** · defaults desfasados en `advance_order` | ✅ **CERRADO** | `0125` |
| **M-4** · comentario obsoleto en el test | ✅ **CERRADO** | `0123` (2026-08-05) |
| **M-5** · ejecutable por `anon` | ✅ **CERRADO** | `0123` (2026-08-05) |
| **M-6** · la de 4 nunca funcionó | ✅ **CERRADO** | `0123` (2026-08-05) |

### R-L2 — CERRADO, y la mitad que quedaba se cerró sola

**La primera mitad** la cerró la `0123`: el bloque de reposición del fondo de
contingencia desapareció de `pay_settlement`, y con él **el segundo decremento
de `balance_due`** —el mismo defecto que `0076_fix_double_balance_decrement`
corrigió en `settle_business_charges` y que aquí nunca se había revisado.

**La segunda mitad** era que `pay_settlement` no marcaba los cargos como
`settled`. Ya no aplica: **la `0124` borró el flujo entero**. Se fueron la
función, su hermana `generate_settlements`, la tabla `settlements` y las
columnas `settlement_id` de `business_charges` y `restaurant_payments`. Es la
respuesta al «levantamiento pendiente» que esta sección pedía: no se usaba, y el
arreglo fue un borrado.

Medido en la base viva el 2026-09-01:

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('pay_settlement','generate_settlements','settle_business_charges');
-- settle_business_charges        (las otras dos ya no existen)

select coalesce(to_regclass('public.settlements')::text, 'NO EXISTE');
-- NO EXISTE
```

**Con una cola, encontrada al verificar esto.** `generate_settlements` seguía
viva y ROTA: la `0176` la había vuelto a crear dos meses después del borrado, sin
querer, porque `create or replace` sobre una función que no existe la CREA en
vez de fallar. Llamarla daba `relation "public.settlements" does not exist`. La
borra la **`0200`**, cuya cabecera cuenta el caso entero — la lección de fondo es
que un barrido masivo tiene que sacar su lista de `pg_proc`, no del repo.

### R-L1 — CERRADO por la `0124`: `balance_due` ya es un cache derivado

Este riesgo era que once funciones escribían `balance_due` mientras `AGENTS.md
§2.2` lo declaraba deprecado, y que **no era reconstruible** porque contingencia
lo movía sin dejar rastro en el ledger.

Se aplicó la opción A que este documento recomendaba: **trigger de recálculo
completo sobre `business_charges`**. Hoy `balance_due` es exactamente
`SUM(business_charges WHERE status='pending')`, lo mantiene un único sitio, y las
19 lecturas de UI siguieron intactas.

Medido en la base viva el 2026-09-01:

```sql
select p.proname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ~* 'balance_due[[:space:]]*=';
-- recalc_business_balance        (UNA, no once)

select t.tgname || ' -> ' || p.proname from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and t.tgname ilike '%balance%';
-- trg_business_charges_recalc_balance -> recalc_business_balance
-- trg_orders_balance_due              -> generate_delivery_charges
```

El segundo trigger conserva un nombre que ya miente: `generate_delivery_charges`
**no escribe la columna**. Solo la nombra en dos comentarios que explican
precisamente eso —«`balance_due` lo mantiene ahora
trg_business_charges_recalc_balance»—. Su trabajo es insertar y borrar cargos; el
saldo lo recalcula el otro trigger como consecuencia. Renombrarlo es cosmético y
no se ha hecho.

> **Nota al pie — verificación pendiente en producción.** El PASO 6 del runbook
> (prueba manual del flujo real: aprobar una devolución en `apps/admin` y ver el
> cargo como línea en `apps/negocios/app/deuda`) **no se pudo hacer en prod**:
> medido el 2026-08-05, prod tiene 0 negocios, 0 pedidos y 0 reportes, así que no
> hay con qué probarlo. **Queda pendiente del primer reembolso real de Priamo.**
>
> Sí quedó **verificado en local con capturas**: antes del reembolso, total
> S/ 3.50 con una línea de S/ 3.50; después, total **S/ 45.50 = 42.00 + 3.50**,
> con el `refund_charge` visible como línea propia, su descripción y su botón
> "Ver detalle", y la tarjeta "Devoluciones" pasando de S/ 0 a S/ 42. El total y
> la suma del detalle coinciden en ambos momentos.
>
> Lo que **no** está verificado es el clic en la pantalla de apelaciones: todas
> las sub-rutas de `apps/admin` daban 404 en el servidor de desarrollo —incluidas
> las que nadie tocó—, así que la aprobación entró por
> `POST /admin/appeals/{id}/refund` con login real de admin y respuesta 200, que
> es el mismo endpoint que ese botón llama. Se probó la cadena entera menos el
> botón.

---

## Qué cierra la migración 0123

Spec en `Docs/spec/spec-0123-eliminar-contingencia.md`. Alcance decidido por
Jesús el 2026-08-04: **eliminar contingencia por completo**.

| riesgo | ¿lo cierra? | cómo |
| --- | --- | --- |
| **R-L4** · ledger paralelo | ✅ **completo** | desaparece la tabla `contingency_advances`, sus dos enums y las tres funciones de `0077`. Sin ledger paralelo, `SUM(business_charges)` vuelve a ser una medida completa de la deuda |
| **R-L2** · `pay_settlement` | ⚠️ **la mitad** | se le quita el bloque de reposición del fondo, que era **el segundo decremento**. Queda pendiente que marque los cargos como `settled`, que es la otra mitad |
| **R-L3** · sobrecargas invertidas | ✅ **por obligación** | la de 3 argumentos llama a `create_contingency_advance`: **no puede sobrevivir al borrado**. El endpoint se repunta a la de 4 y la vieja se borra con firma explícita |
| **M-2** · funciones muertas | ✅ | `handle_prepaid_cancel_auto_debt` y la sobrecarga de 4 argumentos dejan de estar duplicadas |
| **M-1** · `update_business_balance` | ✅ | entra en el mismo `DROP` |
| **M-4** · comentario obsoleto | ✅ | el test se toca igual para quitar el assert (A) |
| **M-5** · `anon` puede ejecutar | ✅ | `REVOKE ALL … FROM PUBLIC, anon, service_role` + `GRANT … TO authenticated`, y comprobación de rol interna, en la misma migración |
| **M-6** · la de 4 nunca funcionó | ✅ | el predicado se corrige a `rejected_proof_disputed` y cada guarda queda cubierta por una prueba que la ve rebotar |
| **R-L1** · `balance_due` deprecado | ❌ **no lo toca** | sigue siendo el rediseño mayor. Pero al eliminar contingencia, `balance_due` **pasa a ser reconstruible**: era contingencia lo único que lo movía sin dejar rastro en el ledger. 0123 no lo resuelve, lo **habilita** |

Ese último renglón es el que más importa: la opción "`balance_due` es un cache
reconstruible" no estaba disponible mientras contingencia existiera. Después de
0123, sí.

---

## Cierre

> **Este cierre quedó obsoleto y se conserva por lo que enseña.** Decía «ninguno
> se resuelve antes del launch», y al revisar la base el 2026-09-01 los diez
> estaban cerrados: la `0124`, la `0125` y la `0200` fueron cerrando riesgos sin
> que nadie volviera a este fichero. Un documento de riesgos que no se vuelve a
> medir envejece **hacia el lado peligroso**: apunta a fantasmas —tres, aquí— y
> se pierde lo que sí quedó suelto, que fue la resurrección de
> `generate_settlements` por la `0176`. La regla que sale de esto: cada vez que
> se lea este fichero para decidir algo, se re-mide antes; las consultas están
> escritas arriba, en cada sección.

La cadena que cuadra es **crear → pickup → delivered → `business_charges`**, y
`balance_due` es hoy un cache derivado de ella, mantenido por un solo trigger.
