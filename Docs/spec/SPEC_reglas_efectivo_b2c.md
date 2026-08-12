# SPEC — Reglas de pago en efectivo (canal B2C)

**Estado:** cerrado para implementación
**Alcance:** `apps/customer` (checkout), `apps/negocios` (motivos de rechazo), `packages/contracts`, `supabase/migrations`
**Fecha:** 2026-08-11
**Migraciones previstas:** 0132, 0133
**Precondición:** este spec entra **después** de cerrar el rediseño de cards de motorizados/negocios. Ambos tocan el bloque de cobro del motorizado.

---

## 0. Advertencia de contexto para quien implemente

En producción (`tindivo-prod`, `zpnipajgwfthxhdtzhly`) hay **0 pedidos B2C** (`source = 'customer_pwa'`). Los 13 pedidos existentes son `business_manual`.

Los umbrales de este spec están calibrados con datos del **sistema legacy** (`delivery.tindivo.com`), que es B2B puro y con coordinación telefónica previa de la cajera. Esa muestra tiene **sesgo de supervivencia**: solo contiene pedidos que llegaron a `delivered`, es decir, aquellos donde el vuelto sí se pudo resolver. Los casos donde la cajera dijo "no tengo cambio" nunca entraron a la tabla.

**Consecuencia práctica:** los tres umbrales viven en `app_settings` precisamente porque se espera ajustarlos con datos B2C reales. No son constantes de diseño.

---

## 1. Decisiones cerradas

| # | Decisión | Valor | Quién decidió |
|---|---|---|---|
| 1 | Umbral de prepago obligatorio | S/80 sobre el total | Ya existía. No se toca. |
| 2 | Billete máximo declarable | S/100 | Jesús |
| 3 | Vuelto máximo | S/50 | Jesús (valor de prueba) |
| 4 | Los tres viven en `app_settings` | — | Jesús |
| 5 | B2B manual queda **libre**, sin techos | — | Jesús |
| 6 | Chips fuera de rango: **deshabilitados**, no ocultos | — | Jesús |
| 7 | Aviso de límite: estático + dinámico | — | Jesús |
| 8 | Input libre fuera de rango: **bloquea** submit + mensaje | — | Jesús |
| 9 | Redondeo del input libre | múltiplos de S/0.50 | Claude, aprobado |
| 10 | Pago mixto en B2C | fuera de alcance | Claude, aprobado |

---

## 2. Reglas de negocio

Un monto declarado `client_pays_with` es válido si y solo si cumple **las tres**:

```
R1  client_pays_with >= total                      (ya existe)
R2  client_pays_with <= max_cash_bill              (nueva, = 100)
R3  client_pays_with - total <= max_change         (nueva, = 50)
```

donde `total = order_amount + delivery_fee`.

De R2 y R3 se deriva el máximo declarable:

```
max_declarable = MIN(max_cash_bill, total + max_change)
```

### Espacio resultante

| Total del pedido | Máx. declarable | Regla dominante | ¿Sirve S/100? |
|---|---|---|---|
| S/12 | S/62 | R3 (vuelto) | No |
| S/20 | S/70 | R3 (vuelto) | No |
| S/30 | S/80 | R3 (vuelto) | No |
| S/50 | S/100 | R2 y R3 coinciden | Sí (vuelto exacto 50) |
| S/65 | S/100 | R2 (billete) | Sí |
| S/80 | S/100 | R2 (billete) | Sí |

Por encima de S/80 de total, `prepay_threshold` ya fuerza `prepaid` y estas reglas no aplican.

### Impacto estimado

Contra los 569 pedidos con vuelto del legacy: **58 pedidos (10.2%)** habrían sido bloqueados por R3. De esos, solo 5 corresponden al caso extremo (pedido < S/20 con vuelto > S/50); los otros 53 son pedidos de S/20–50 pagados con S/100.

Este costo es conocido y aceptado como valor de prueba. Si la tasa de rechazo por `no_change` resulta alta, `max_change` sube a 70 con un `UPDATE` en `app_settings`, sin deploy.

### Orden de precedencia de mensajes

Si un monto viola R2 y R3 simultáneamente (ej. pedido S/12, declara S/200), se muestra **primero el mensaje de R2** ("máximo S/100"). Es la regla más simple de entender y no obliga al cliente a hacer una resta.

---

## 3. Parte A — `app_settings`

### A.1 Keys nuevas

| Key | Valor inicial | Tipo | Fallback en código |
|---|---|---|---|
| `max_cash_bill` | `'100'::jsonb` | numeric | `coalesce(..., 100)` |
| `max_change` | `'50'::jsonb` | numeric | `coalesce(..., 50)` |

Siguen el patrón exacto de `prepay_threshold`, verificado en `0087_rescue_production_app_settings.sql:39` y leído con `(value #>> '{}')::numeric` en `0105_block_same_business_active_order.sql:278`.

### A.2 Requisito de fallback

**Obligatorio** en toda lectura, SQL y TypeScript. Sin `coalesce`, un fallo de lectura deja el techo en `NULL` y la comparación `x <= NULL` evalúa a `NULL` — que en un `IF` de plpgsql **no entra al branch**, dejando pasar cualquier monto. Es un fallo abierto, no cerrado.

El agente debe verificar que la política RLS de `app_settings` permite lectura anónima de estas keys, igual que `prepay_threshold` (que se lee desde el navegador en `use-checkout-state.ts:156-164`). Si `prepay_threshold` es legible por una policy que enumera keys explícitamente, hay que agregar las dos nuevas.

---

## 4. Parte B — `create_customer_order`

Función vigente en `0105_block_same_business_active_order.sql`. **Tres cambios en una sola migración**, porque tocan la misma función.

### B.1 Rechazar `pending_mixed` explícitamente

**Defecto actual** (`0105:440-444`):

```sql
client_pays_with = (case when p_payment_intent = 'pending_cash' then p_client_pays_with end),
change_to_give = (case
  when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
  then greatest(0, round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2))
end)
```

Si llega `pending_mixed`, el `CASE` cae al `ELSE` implícito y persiste **ambas columnas en NULL sin error**. Es el mismo patrón de fallo silencioso que la migración 0092.

**Decisión:** como B2C no soporta mixto en v1, la función debe **fallar ruidosamente** en vez de calcular algo para un camino no soportado:

```sql
if p_payment_intent = 'pending_mixed' then
  raise exception 'El pago mixto no está disponible en pedidos desde la app'
    using errcode = 'P0001';
end if;
```

Ubicar junto a las demás validaciones de entrada, antes del `INSERT`.

**Verificación previa obligatoria:** el agente debe confirmar por grep que ningún camino de `apps/customer` ni de `apps/api/app/api/v1/customer/orders/route.ts` envía `pending_mixed`. Si alguno lo hace, esta decisión se revisa antes de implementar.

### B.2 Eliminar `greatest(0, ...)`

La validación de `0105:285-291` ya levanta excepción cuando `client_pays_with < total`. El `greatest(0, ...)` de la línea 443 nunca puede activarse por esa vía, y si se activara sería porque la validación falló — en cuyo caso queremos ver el número negativo, no un cero que esconde el problema.

Queda:

```sql
change_to_give = (case
  when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
  then round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2)
end)
```

### B.3 Validar R2 y R3

Agregar junto a la validación existente de R1:

```sql
if p_payment_intent = 'pending_cash' and p_client_pays_with is not null then

  select (value #>> '{}')::numeric into v_max_bill
    from public.app_settings where key = 'max_cash_bill';
  v_max_bill := coalesce(v_max_bill, 100);

  select (value #>> '{}')::numeric into v_max_change
    from public.app_settings where key = 'max_change';
  v_max_change := coalesce(v_max_change, 50);

  -- R2 primero (precedencia de mensaje)
  if p_client_pays_with > v_max_bill then
    raise exception 'El monto máximo con el que puedes pagar es S/ %',
      to_char(v_max_bill, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  -- R3
  if p_client_pays_with - (v_order_amount + v_delivery_fee) > v_max_change then
    raise exception 'El vuelto sería S/ % y el máximo es S/ %',
      to_char(p_client_pays_with - (v_order_amount + v_delivery_fee), 'FM999990.00'),
      to_char(v_max_change, 'FM999990.00')
      using errcode = 'P0001';
  end if;

end if;
```

Declarar `v_max_bill` y `v_max_change` como `numeric` en el bloque `DECLARE`.

### B.4 Notas de migración

- La **firma no cambia** (no hay parámetros nuevos). `CREATE OR REPLACE` preserva los grants existentes. Aun así, el agente debe verificar los grants con `\df+` antes y después y reportar ambos resultados en crudo.
- No se requiere `DROP`. Si por alguna razón el agente considera necesario un `DROP`, **detenerse y consultar** — un `DROP` sin firma explícita puede destruir el overload equivocado.
- Rollback obligatorio en `supabase/rollbacks/0133_<slug>.sql`, escrito **antes** de aplicar, restaurando el cuerpo íntegro de la función tal como quedó en 0105.

---

## 5. Parte C — Checkout del cliente

### C.1 `apps/customer/features/checkout/types.ts`

Agregar constantes de fallback junto a `DEFAULT_PREPAY_THRESHOLD` (línea 3):

```ts
export const DEFAULT_MAX_CASH_BILL = 100
export const DEFAULT_MAX_CHANGE = 50
export const CASH_STEP = 0.5   // redondeo del input libre
```

### C.2 `use-checkout-state.ts`

Leer las dos keys nuevas en la misma consulta que ya trae `prepay_threshold` (líneas 156-164). Una sola query con `.in('key', [...])`, no tres round-trips.

Exponer:

```ts
const maxDeclarable = useMemo(
  () => Math.min(maxCashBill, total + maxChange),
  [maxCashBill, maxChange, total]
)
```

### C.3 `cash-selector.tsx` — chips

**Filtro actual** (línea 29):

```tsx
CASH_CHIPS.filter((c) => c.amount === null || c.amount >= total)
```

Solo tiene piso, no techo. **Nuevo comportamiento:** no filtrar por techo — renderizar todos los chips que pasen el piso, y **deshabilitar** los que excedan `maxDeclarable`.

```tsx
const disabled = c.amount !== null && c.amount > maxDeclarable
```

Estado deshabilitado:
- Opacidad reducida, `cursor-not-allowed`, `disabled` en el `<button>`
- Razón visible bajo el chip o como texto auxiliar: `Vuelto pasaría de S/50`
- **No** usar color de urgencia ni rojo — es información, no error

**Justificación de producto:** el cliente que tiene un billete de S/100 y no ve la opción concluye que la app no le sirve. El que la ve deshabilitada con la razón entiende y se cambia a Yape. Recognition over recall.

### C.4 `cash-selector.tsx` — avisos de límite

Dos, ambos:

1. **Estático**, bajo el subtítulo existente ("Así el motorizado lleva tu vuelto exacto"):
   `Máximo S/50 de vuelto.` — el número viene de `maxChange`, no hardcodeado.

2. **Dinámico**, calculado sobre el pedido concreto:
   `Puedes pagar hasta con S/{maxDeclarable}.`

El estático explica la regla; el dinámico da el número accionable.

### C.5 `cash-selector.tsx` — input libre

**Redondeo (S/0.50).** Al perder foco (`onBlur`), no mientras escribe:

```ts
const roundToStep = (n: number) => Math.round(n / CASH_STEP) * CASH_STEP
```

Justificación empírica: en las 25 declaraciones más frecuentes del legacy (Q6, n=569), solo una tenía decimales distintos de `.00` (S/32.50). El paso de 0.50 cubre todo el comportamiento observado y elimina montos no construibles con monedas reales.

**Longitud del input.** Reemplazar `maxLength={7}` (permite `9999999`) por un valor derivado:

```ts
maxLength={String(maxDeclarable.toFixed(2)).length}
```

Con `maxDeclarable = 100` da 6 (`100.00`). **No clampear el valor mientras el usuario escribe** — clampear "100" a "62" a mitad de tecleo es desconcertante. El límite de longitud evita el absurdo; la validación con mensaje hace el resto.

**Mensajes de validación**, en orden de precedencia:

| Condición | Mensaje |
|---|---|
| `< total` | `El monto debe cubrir el total (S/ X)` *(ya existe)* |
| `> maxCashBill` | `El monto máximo con el que puedes pagar es S/ 100.` |
| vuelto `> maxChange` | `El vuelto sería S/ 70 y el máximo es S/ 50. Paga con S/ 80 o menos, o elige Yape.` |

El tercer mensaje **debe incluir la salida**, no solo el bloqueo. Es la diferencia entre perder el pedido y recuperarlo por prepago.

### C.6 `use-checkout-actions.ts`

Agregar R2 y R3 junto a la validación existente de línea 119. El submit queda bloqueado hasta que el monto sea válido (decisión #8).

`cashPayingWith` (línea 172) debe enviar el valor **ya redondeado** al paso de S/0.50.

---

## 6. Parte D — Motivo de rechazo `no_change`

### D.1 Por qué entra

Con `max_change = 50` este motivo debería activarse poco. Pero es el **único instrumento de medición** sobre la decisión del umbral: sin él no hay forma de saber si 50 fue el número correcto o si bloqueó de más.

Precedente directo: en el legacy, 121 de 127 cancelaciones tienen `cancel_reason_code` nulo y texto libre inservible (`"asd"`, `"123"`, `"hdjd"`). Sin taxonomía no se mide nada.

### D.2 Cambios

**`packages/contracts/src/enums.ts:170-178`** — agregar `'no_change'` a `CANCEL_REASON_DETAILS`.

**Migración 0132** — el CHECK constraint `orders_cancel_reason_detail_chk` (creado en `0079_cancel_reason_detail.sql:13-23`) enumera los valores explícitamente. Requiere:

```sql
ALTER TABLE public.orders DROP CONSTRAINT orders_cancel_reason_detail_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_cancel_reason_detail_chk CHECK (
    cancel_reason_detail IS NULL OR cancel_reason_detail IN (
      'out_of_stock', 'closed', 'out_of_zone', 'no_answer',
      'customer_request', 'duplicate', 'no_change', 'other'
    )
  );
```

Rollback: restaurar el CHECK sin `'no_change'`. **Precaución:** el rollback falla si ya existen filas con ese valor. El script de rollback debe verificarlo primero y reportar el conteo en vez de fallar en seco.

**`apps/negocios/components/dashboard/pedido-detail/constants.ts:3-21`** — agregar la etiqueta. Copy propuesto: **"No hay vuelto"**. Ubicarlo después de `out_of_stock` (el motivo más usado) y antes de `other`.

**`modals.tsx`** (`ReasonModal`) — no requiere cambio si itera sobre la constante. El agente debe verificarlo, no asumirlo.

---

## 7. Fuera de alcance

Explícitamente **no** entra en este spec:

| Ítem | Razón |
|---|---|
| Subir `prepay_threshold` a 100 | Sin datos B2C. Se decide después. |
| Límite de billete **por negocio** | Solo Priamo está en B2C. Config global alcanza. |
| Recuperación del pedido rechazado (volver al cliente para cambiar método) | Sin datos de frecuencia. Optimizar a ciegas. |
| Pago mixto en B2C | 1.33% en legacy. Se rechaza explícitamente (B.1). |
| Liquidación de motorizados (`cash_settlements` de v1) | Iniciativa separada y mayor. Aparcada. |
| Techos en `create_business_manual_order` | Decisión de Jesús: B2B queda libre. |
| Escribir `cash_owed_at_delivery` / `payment_real` | Columnas muertas. Deuda técnica conocida, no se toca acá. |

---

## 8. Plan de implementación y verificación

Cada parte se cierra con evidencia cruda antes de empezar la siguiente.

### Parte 1 — Migración 0132 (motivo `no_change`)
Menor riesgo, independiente. Va primero.

- [ ] Rollback escrito en `supabase/rollbacks/` **antes** de aplicar
- [ ] Validación local: `npx supabase db push` contra local
- [ ] Evidencia: `\d+ orders` mostrando el CHECK nuevo, salida cruda
- [ ] Predicado: `INSERT` con `cancel_reason_detail = 'no_change'` debe pasar; con `'inventado'` debe fallar. Reportar ambos resultados crudos.
- [ ] Gate de Jesús antes de producción

### Parte 2 — Contracts + UI de negocios
- [ ] `'no_change'` en `CANCEL_REASON_DETAILS`
- [ ] Etiqueta en `constants.ts`
- [ ] Evidencia: captura o salida de test mostrando el motivo en `ReasonModal`
- [ ] `pnpm test --force` (bypass de turbo cache)

### Parte 3 — Migración 0133 (`app_settings` + `create_customer_order`)
La de mayor riesgo. Reescribe la RPC que crea **todos** los pedidos B2C.

- [ ] Reconocimiento: confirmar que ningún camino envía `pending_mixed` (grep con evidencia)
- [ ] Grants **antes**: `\df+ public.create_customer_order`, salida cruda
- [ ] Rollback escrito antes de aplicar, con el cuerpo íntegro de 0105
- [ ] Seed de `app_settings` en la misma migración, **antes** del `CREATE OR REPLACE`
- [ ] Validación local con predicados (tabla abajo)
- [ ] Grants **después**: `\df+`, salida cruda, comparada contra la de antes
- [ ] Gate de Jesús
- [ ] Verificación post-producción: crear un pedido de prueba real y verificar `change_to_give`

**Predicados obligatorios** (no basta con revisar el código — los bugs se encuentran ejecutando):

| # | Entrada | Resultado esperado |
|---|---|---|
| 1 | total 30, paga con 30 | OK, `change_to_give = 0` |
| 2 | total 30, paga con 80 | OK, `change_to_give = 50` |
| 3 | total 30, paga con 80.01 | Excepción R3 |
| 4 | total 30, paga con 100 | Excepción R3 (vuelto 70 > 50) |
| 5 | total 60, paga con 100 | OK, `change_to_give = 40` |
| 6 | total 60, paga con 101 | Excepción R2 |
| 7 | total 12, paga con 200 | Excepción **R2** (precedencia) |
| 8 | total 30, paga con 25 | Excepción R1 (existente, no debe romperse) |
| 9 | `payment_intent = 'pending_mixed'` | Excepción explícita |
| 10 | total 85, `pending_cash` | Excepción de `prepay_threshold` (existente) |
| 11 | `app_settings` sin las keys | Usa fallback 100/50, no falla |

El predicado 11 se prueba borrando temporalmente las keys **en local**, nunca en producción.

### Parte 4 — Checkout del cliente
- [ ] `types.ts`, `use-checkout-state.ts`, `cash-selector.tsx`, `use-checkout-actions.ts`
- [ ] Tests unitarios de `maxDeclarable` y `roundToStep`
- [ ] Verificación manual a 390px: chips deshabilitados legibles, avisos no cortados
- [ ] E2E: intentar declarar un monto fuera de rango y verificar que el submit queda bloqueado

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| `create_customer_order` rota → no entra ningún pedido B2C | Rollback escrito antes; 0 pedidos B2C hoy hace este el mejor momento posible para tocarla |
| `max_change = 50` bloquea demasiado | `UPDATE` en `app_settings`, sin deploy. Motivo `no_change` mide la frecuencia. |
| Fallo de lectura de `app_settings` deja techo en NULL | `coalesce` obligatorio en las cuatro capas |
| RLS no permite leer las keys nuevas desde el navegador | Verificar policy antes de implementar (A.2) |
| Rollback de 0132 falla si hay filas con `no_change` | El script verifica y reporta en vez de fallar |
| Colisión con el rediseño de cards | Este spec entra **después** de cerrar las cards |

---

## 10. Qué medir después del lanzamiento

Sin estas métricas la decisión de `max_change = 50` no se puede revisar:

1. Pedidos B2C por `payment_intent` — ¿el efectivo es tan relevante en B2C como en B2B (34.6%)?
2. Cancelaciones con `cancel_reason_detail = 'no_change'` — frecuencia absoluta y como % de pedidos en efectivo
3. Distribución de `client_pays_with` en B2C — ¿los clientes eligen los mismos billetes que reporta la cajera en B2B?
4. Abandonos en el paso de pago (si hay telemetría) — cuántos llegan al selector de efectivo y no completan

Con dos semanas de estos datos, `max_change` y `prepay_threshold` se ajustan con evidencia en vez de estimación.
