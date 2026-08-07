# SPEC — Formulario de pedido manual (cajera / app negocios)

**Versión:** 3 · **Fecha:** 2026-08-03
**App destino:** `apps/negocios` (v2)
**Referencia legacy:** `tindivo-delivery` @ `ff1e65c`
**Depende de:** `Docs/spec/spec_manual.md` — la tabla `address_directory` y el RPC
`search_address_directory` deben existir antes de implementar la Parte B

## Historial de versiones

**v1 → v2.** Siete hallazgos de revisión de UX y robustez:

| #   | Hallazgo                                                                              | Sección |
| --- | ------------------------------------------------------------------------------------- | ------- |
| 1   | **Degradación elegante si falla el lookup** — la cajera nunca debe quedar bloqueada   | B6      |
| 2   | **`Idempotency-Key` y el cambio de montos** — riesgo nuevo introducido por la Parte C | E1      |
| 3   | Campos de vuelto irrelevantes según método de pago                                    | D2      |
| 4   | Teclado numérico y autofoco — dos taps menos por pedido                               | F3      |
| 5   | Vuelto negativo: validar, no mostrar número negativo                                  | C6      |
| 6   | `Yape + Efectivo`: cómo se captura el reparto — **PENDIENTE**                         | D3      |
| 7   | Estado de "ver deuda" e "historial" respecto al pedido original de Jesús              | Alcance |

**v2 → v3.** La v2 se escribió contra el vocabulario del **legacy**. Verificado
contra el remoto `zpnipajgwfthxhdtzhly`, varias cosas que proponía crear ya
existen en v2:

| #   | Ajuste                                                                                     | Sección |
| --- | ------------------------------------------------------------------------------------------ | ------- |
| 1   | `food_amount` / `customer_delivery_fee` **eliminados** — duplicaban `order_amount` / `delivery_fee` | C5      |
| 2   | `delivery_fee_default` / `delivery_fee_options` **eliminados** — ya existe `delivery_bands` | C4      |
| 3   | **Quién decide la tarifa: la cajera.** Sus botones fijan tarifa **y** banda                 | C4      |
| 4   | Diagnóstico de C1 reescrito: describía el legacy, no v2                                    | C1      |
| 5   | Idempotencia: **regenerar la clave** al editar tras un fallo, no maquillar el error         | E1      |
| 6   | Tipos de coordenadas: `double precision`, con los casts documentados                        | G       |
| 7   | Medido: **58 teléfonos (9,7%)** con >1 dirección. El modal es camino regular, no raro       | B3      |

---

## Regla 0

Antes de construir cualquier parte, **leer cómo lo resolvió `tindivo-delivery` y
adaptar**. No inventar.

| propósito           | archivo legacy                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| Formulario          | `apps/web/src/features/restaurante/new-order/components/new-order-form.tsx` |
| Hook de direcciones | `.../new-order/hooks/use-customer-addresses.ts`                             |
| Modal de selección  | `.../new-order/components/address-suggestion-popup.tsx`                     |
| Endpoint            | `apps/api/app/api/v1/restaurant/orders/route.ts`                            |
| Caso de uso         | `packages/core/.../create-order.use-case.ts`                                |
| Idempotencia        | `packages/.../idempotency.ts`, `use-idempotency-key.ts`                     |

Este spec documenta **qué se porta**, **qué se arregla** y **qué es nuevo**.
Todo lo no mencionado se porta como está.

---

## RESUMEN DE CAMBIOS RESPECTO AL LEGACY

| #   | Cambio                                                               | Tipo           |
| --- | -------------------------------------------------------------------- | -------------- |
| 1   | `Monto del pedido` pasa a ser **solo comida** → `orders.order_amount` | Fix UI        |
| 2   | Selector de delivery (lee `app_settings.delivery_bands`) + total visible | Nuevo UI   |
| 2b  | `orders.delivery_fee_source` — **única columna nueva** del sprint     | Nuevo esquema  |
| 2c  | El botón de delivery fija también `orders.delivery_distance_band`    | Fix ledger     |
| 3   | El nombre del pedido **ya no pisa** `customer_name` del directorio   | Fix            |
| 4   | Cliente nuevo deja de mostrarse como error (borde rojo)              | Fix UI         |
| 5   | Paleta consistente en el modal (hoy hay azul en UI naranja)          | Fix UI         |
| 6   | Marcadores de obligatorio consistentes                               | Fix UI         |
| 7   | Placeholder de dirección con ejemplo local, no de Lima               | Fix UI         |
| 8   | Lectura por RPC, no SELECT directo desde el navegador                | Fix seguridad  |
| 9   | Degradación elegante si el lookup falla                              | Fix robustez   |
| 10  | `restaurant` → `business` en roles y nombres                         | Vocabulario v2 |

---

## PARTE 0 — Prerrequisito de backend: el RPC de creación

**BLOQUEANTE. Nada de la Parte C se puede implementar sin esto.**

`create_business_manual_order` **no acepta tarifa, ni banda, ni origen**. Firma
viva, verificada en el remoto:

```
create_business_manual_order(uuid, delivery_method, payment_intent, numeric,
  text, text, integer, text, text, numeric, numeric, numeric)
```

Hoy la tarifa se fija dentro del RPC, siempre `near` (línea 55):

```sql
v_delivery_fee := COALESCE((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
```

Y `delivery_distance_band` **no está en el INSERT** (líneas 79-87), por lo que en
el pickup el `COALESCE` de `advance_order:97-101` cae a `'near'`. **Todo pedido
manual de v2 es hoy `near` a S/2,00**, sin que nadie pueda elegir.

### Cambios requeridos

Añadir `p_delivery_fee numeric DEFAULT NULL` y
`p_delivery_distance_band public.distance_band DEFAULT NULL`, con:

1. **Validar la tarifa contra `app_settings.delivery_bands`.** No aceptar valor
   libre. Si `p_delivery_fee` no coincide con `bands->>'near'` ni con
   `bands->>'far'`, `RAISE EXCEPTION`. Esta validación es la que habría evitado
   los S/6,00 y los S/0,00 del legacy (ver 2.5 de la auditoría).
2. **Validar coherencia banda↔tarifa.** `near` exige `bands->>'near'`, `far`
   exige `bands->>'far'`. Vienen del mismo botón: divergir es imposible en la UI
   y debe ser imposible en la DB.
3. **Escribir `delivery_distance_band` en el INSERT.**
4. **Registrar en `order_event_log`** quién eligió y qué eligió: `actor_user_id`,
   la tarifa y la banda en `data`.
5. **Retrocompatibilidad.** Si ambos parámetros llegan NULL, comportamiento
   actual: `near` con `bands->>'near'` y `delivery_fee_source = 'system'`. Ese es
   el camino B2C.

### Qué rompe cambiar la firma — verificado

| dependencia | impacto |
|---|---|
| `apps/api/app/api/v1/business/orders/route.ts:46` | Único llamador en código. Pasa args con nombre, así que **no rompe** si los nuevos van con DEFAULT |
| `packages/supabase/src/database.types.ts:2468` | Tipos generados. Requiere `pnpm db:types` **después** del push |
| Grants | `0019:180-184`, `0031:345-348`, `0032:103-106` hacen `revoke`/`grant` **por firma completa**. La firma nueva nace sin permisos: hay que reemitir `grant execute … to service_role` |
| Sobrecarga | Hoy existe **una sola** versión (`pg_proc`). Añadir params con DEFAULT sin borrar la vieja crearía ambigüedad en PostgREST: usar `DROP FUNCTION` + `CREATE`, el patrón ya establecido en `0031`, `0032` y `0033` |
| `apps/motorizados/components/order/destination-card.tsx:33` | Solo un comentario que menciona el RPC. No rompe |

**Precedente:** la firma ya se cambió tres veces (`0031`, `0032`, `0033`), siempre
con `drop function` + `create` + `revoke`/`grant`. Seguir ese patrón.

### Verificación de la Parte 0 — los GRANTS son el paso frágil

**Una firma nueva nace sin permisos, y eso no falla en la migración: falla en
runtime**, cuando la cajera pulsa "Crear pedido" y recibe un error de permiso
sobre una función que existe y es correcta. Es el modo de fallo más caro de
diagnosticar de todo este cambio.

```sql
SELECT p.oid::regprocedure AS firma,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS ok
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='create_business_manual_order';
```

**Debe devolver UNA fila con `ok = true`.**

- Si devuelve una fila con `ok = false` → faltó el `grant execute … to service_role`.
- **Si devuelve dos filas → quedó la firma vieja sin borrar**, y PostgREST va a
  tener ambigüedad al resolver la llamada. Hay que hacer el `DROP FUNCTION` de la
  antigua con su firma completa.

**No avanzar a la UI hasta que esta query devuelva exactamente una fila con
`ok = true`.**

---

## PARTE A — Estructura del formulario

1. **Teléfono del cliente** — obligatorio, prefijo fijo `+51`, 9 dígitos
2. **Nombre del cliente** — obligatorio
3. **Dirección de entrega** — obligatorio, textarea, máx. 500 caracteres
4. **Tiempo de preparación** — carrusel horizontal, default 20 min
5. **Método de pago** — 4 opciones (Parte D)
6. **Monto del pedido** — obligatorio · **CAMBIA, ver Parte C**
7. **Delivery** — **NUEVO**
8. **Total a cobrar** — **NUEVO, calculado**
9. **Cliente paga con** — condicional (ver D2)
10. **Vuelto** — calculado, condicional

Botón `Crear pedido` fijo al pie, ancho completo.

### Estados iniciales

Nombre y dirección arrancan **deshabilitados** con placeholder
`Primero ingresa el teléfono`. Se habilitan al completar 9 dígitos. Se porta.

---

## PARTE B — Autocompletado por teléfono

### B1. Disparo

Al completar **9 dígitos exactos**. Llama a
`search_address_directory(p_phone)` — **no** SELECT directo a la tabla.

### B2. Los cuatro estados

**a) Cargando** — indicador discreto junto al campo de dirección. **No bloquear
el formulario:** la cajera debe poder seguir tipeando el nombre mientras carga.

**b) Una sola dirección** — se autocompleta directo, sin modal. Debajo del campo,
en verde:

```
◎ Usando dirección registrada · GPS incluido
```

Si `has_gps` es false, el texto debe omitir "GPS incluido". **No mentir sobre lo
que lleva el pedido** — el motorizado depende de eso.

**c) Varias direcciones** — abre modal (B3).

**d) Sin resultados (cliente nuevo)** — nombre y dirección vacíos y editables.

> **FIX #4.** El legacy pinta el borde del teléfono en rojo cuando no hay
> resultados. Un cliente nuevo **no es un error**; con la cajera apurada, el rojo
> lee como "algo está mal".
>
> En v2: borde neutro y etiqueta informativa junto al campo de dirección:
> `Cliente nuevo — escribe la dirección`. Sin color de error.

### B3. Modal de múltiples direcciones

**Se porta el patrón completo del legacy.** Es la parte mejor resuelta.

Por dirección:

| elemento         | ejemplo                       |
| ---------------- | ----------------------------- |
| Referencia       | `RENOVACION CASA DE LALI`     |
| Nombre asociado  | `JESUS`                       |
| Última vez usada | `ayer`, `hace 3 semanas`      |
| Veces usada      | `22 pedidos` (= `times_used`) |
| Badge de GPS     | `◎ GPS` (solo si `has_gps`)   |

Encabezado con el cliente (avatar de inicial, nombre, celular). Radio buttons,
primera preseleccionada. Última opción siempre `+ Escribir dirección nueva`.
Botones `Cancelar` / `Confirmar`.

**Orden:** `is_default DESC, last_used_at DESC` (lo devuelve el RPC).

> **FIX #5.** El radio seleccionado del legacy es azul y rompe la paleta
> naranja/coral. Usar el color primario.

**Dimensionamiento: MEDIDO** (legacy, 2026-08-04). La v2 decía "~8 clientes",
que era inferencia cruzando conteos. El dato real:

| direcciones por teléfono | teléfonos |
| ------------------------ | --------- |
| 1                        | 537       |
| 2                        | 50        |
| 3                        | 6         |
| 4                        | 1         |
| 5                        | 1         |

595 teléfonos, 664 filas. Contando **referencias distintas** el reparto es casi
idéntico (1→537, 2→50, 3→7, 4→1 = 662 refs), así que solo **2 filas** colapsan en
el dedup del ETL: las direcciones extra son lugares **genuinamente distintos**,
no duplicados.

**58 teléfonos (9,7%) tienen más de una dirección. Esto no es un caso raro: es un
camino regular.** Y su peso sobre los pedidos es probablemente mayor que 9,7%,
porque el cliente con varias direcciones es el cliente frecuente — el mismo que
concentra el volumen.

Consecuencia de diseño: **el modal no es un rincón que se porta por completitud.
Se diseña con el mismo cuidado que el camino principal.**

### B3-bis. Elegir mal manda el pedido a la casa equivocada

Con casi uno de cada diez teléfonos, y más peso aún en pedidos, la probabilidad
de que la cajera seleccione la dirección equivocada deja de ser despreciable. Dos
mitigaciones **obligatorias**:

- **Referencia completa, sin truncar, en el modal.** Las referencias reales son
  largas y lo que las distingue está al final: `SANTA ROSA - 5 ESQUINAS - DEL
  INICIAL AL FONDO` (47 caracteres), o `Santa Rosa - 5 Esquinas - antes de entrar
  a las palmeras la primera casa verde agua de 2 piso el 2 piso es de ladrillos`
  (118). Truncar con elipsis borra justo la parte que permite elegir bien.
  Envolver en varias líneas, nunca cortar.
- **La referencia elegida queda visible en el formulario** tras confirmar, antes
  de crear el pedido. La cajera debe poder releerla mientras sigue al teléfono
  con el cliente y corregir sin rehacer nada.

### B4. Edición de una dirección autocompletada

Campo editable con contador (`23/500`).

Comportamiento portado (`new-order-form.tsx:1266-1282`): si la cajera edita el
texto y ya no coincide con la dirección vinculada, se **desvincula**
(`address_directory_id = null`) y aparece un aviso ámbar. El GPS de la dirección
original ya no viaja al motorizado.

Es correcto: el texto editado describe otro lugar, así que las coordenadas
viejas serían engañosas.

> **REGLA DURA.** La edición afecta **solo al pedido**, nunca al directorio. La
> cajera no tiene permiso de UPDATE sobre `address_directory` (spec ETL, Parte
> 7). El directorio lo corrige el motorizado.

### B5. Conflicto de nombre — FIX #3

Directorio con `customer_name = 'DIANA'`, la cajera tipea `'DIANA MENDOZA'`.

**Legacy:** el nombre del pedido termina pisando el directorio en
`mark-delivered.use-case.ts:85, 154, 181`, propagándose a los otros 3 negocios
sin que la cajera lo sepa.

**v2:** el nombre del pedido se queda en el pedido.

### B6. Degradación si el lookup falla (hallazgo 1)

**El autocompletado es una conveniencia, no una dependencia.** Si el RPC falla
por red, timeout o error, la cajera **debe poder crear el pedido igual**:

- Nombre y dirección se habilitan en modo manual (como cliente nuevo)
- Aviso discreto: `No se pudo consultar direcciones guardadas — escríbelas`
- **Nunca** bloquear el botón `Crear pedido` por un fallo de lookup
- **Nunca** dejar el formulario en estado de carga indefinido: timeout de 5 s y
  caída a modo manual

Justificación: el cliente está al teléfono. Un formulario bloqueado por una
consulta opcional es peor que no tener autocompletado.

---

## PARTE C — Monto, delivery y total (NUEVO)

Es el cambio funcional más importante del sprint.

### C1. Qué cambia

**El diagnóstico de la v2 describía el legacy, no v2.** Verificado contra el
remoto, en v2 ya está resuelto casi todo:

- El esquema ya separa comida y delivery: `orders.order_amount` y
  `orders.delivery_fee`, ambos `numeric NOT NULL`.
- La migración `0120` ya quitó la banda del flujo del motorizado. `advance_order`
  la toma del pedido, no de lo que declare el driver
  (`advance_order:94-101`), y el cliente ya no la pregunta
  (`apps/motorizados/components/order/pickup-sheet.tsx:17`).
- La tarifa del pedido ya gana sobre cualquier cálculo por banda
  (`advance_order:219-222`):
  ```sql
  v_delivery_fee_charged := CASE
    WHEN v_order.delivery_method = 'pickup' THEN 0
    ELSE COALESCE(v_order.delivery_fee, (v_bands ->> 'near')::numeric, 2.00)
  END;
  ```

**El problema real que queda:**

> Lo que la cajera le dice al cliente por teléfono y lo que el ledger registra
> pueden discrepar, porque hoy ella tipea un total combinado y nadie declara
> cuánto de eso fue delivery. Hoy no se nota porque `commissions` vale lo mismo
> en ambas bandas (`{"near": 3.5, "far": 3.5}`); cuando `far` suba a S/4, cada
> discrepancia es plata perdida en silencio.

Lo que falta es **UI**, no esquema: que la cajera declare explícitamente cuánto
es comida y cuánto delivery.

**En v2:** tres elementos separados.

```
Monto del pedido        OBLIGATORIO
Solo la comida, sin delivery
[ S/.  25.00 ]

Delivery
[  S/ 2,00  ] [  S/ 2,50  ]      ← dos botones, S/2,00 preseleccionado

─────────────────────────────────
TOTAL A COBRAR          S/ 27.00  ← el elemento más prominente del bloque

Cliente paga con        para calcular vuelto
[ S/.  50.00 ]

Vuelto                  S/ 23.00
```

### C2. Reglas

```
comida   = input de la cajera   → orders.order_amount           (ya existe)
delivery = botón seleccionado   → orders.delivery_fee           (ya existe)
banda    = el MISMO botón       → orders.delivery_distance_band (ya existe)
origen   = 'business'           → orders.delivery_fee_source    (NUEVA)
total    = comida + delivery    → derivado, no se persiste
vuelto   = paga_con − total     ← sobre el TOTAL, no sobre comida
```

**No se crean `food_amount` ni `customer_delivery_fee`.** Duplicarían columnas
que ya existen, que es el patrón de deuda documentado en el legacy con
`client_phone`/`customer_phone` y `delivery_address`/`customer_address`: quedó
una viva, otra muerta, y nadie sabía cuál leer.

### C3. El total debe ser prominente

Es el número que la cajera le dice al cliente por teléfono. Si no está visible,
el cambio **empeora** la situación: seguiría sumando de cabeza y encima sin
tenerlo escrito en pantalla.

**Se actualiza en vivo** mientras teclea, sin esperar a que salga del campo.

### C4. Botones, no campo libre — y el botón fija también la banda

Ese valor alimenta `business_charges`: un error de tipeo se convierte en dinero
mal cobrado. Dos botones eliminan esa clase de error por completo.

**Valores desde `app_settings.delivery_bands`**, que ya existe y ya lo consume
`advance_order`. Medido en el remoto:

```json
delivery_bands → {"near": 2, "far": 2.5}
commissions    → {"near": 3.5, "far": 3.5, "pickup": 1}
```

**No crear `delivery_fee_default` ni `delivery_fee_options`**: serían una segunda
fuente de verdad sobre el mismo número.

> **Cada botón escribe DOS columnas.** El de S/2,00 fija `delivery_fee = 2.00` y
> `delivery_distance_band = 'near'`; el de S/2,50 fija `delivery_fee = 2.50` y
> `delivery_distance_band = 'far'`.
>
> **Por qué.** La banda ya no decide la tarifa (0120), pero **sigue decidiendo la
> comisión** en `advance_order:230-241`:
> ```sql
> ELSIF v_band = 'near' THEN
>   v_commission_amount := COALESCE(..., (v_commissions->>'near')::numeric) - v_delivery_fee_charged;
> ELSE -- far
>   v_commission_amount := COALESCE(..., (v_commissions->>'far')::numeric) - v_delivery_fee_charged;
> ```
> Si nadie fija la banda en un pedido manual, el `COALESCE` cae a `'near'` y
> **toda entrega lejana cobra comisión de cercana**. Hoy es invisible porque
> ambas valen 3.5. El día que `far` suba a S/4, son S/0,50 perdidos por pedido,
> sin nadie que lo marque.

Los botones se renderizan desde `delivery_bands`: al cambiar los valores en
`app_settings`, la cajera ve los importes nuevos y el ledger registra lo que ella
marcó. **Cero cambios de código.**

`generate_delivery_charges` **no se toca**: ya consume lo que `advance_order`
escribió.

> **Comentario obsoleto en la DB, para que nadie lo lea como verdad.**
> `0002_tables.sql:230` declara la columna con el comentario
> `-- declarado en picked_up`. Era cierto hasta `0120`, que se lo quitó al
> motorizado. **No se puede corregir sin una migración nueva**, así que queda la
> nota aquí: la banda la fija quien crea el pedido, no el pickup.

### C5. Persistencia

| campo         | columna                                               | estado       |
| ------------- | ----------------------------------------------------- | ------------ |
| comida        | `orders.order_amount`                                 | ya existe    |
| delivery      | `orders.delivery_fee`                                 | ya existe    |
| banda         | `orders.delivery_distance_band`                       | ya existe    |
| quién decidió | `orders.delivery_fee_source` = `business` \| `system` | **NUEVA**    |

`delivery_fee_source` es **la única columna nueva del sprint**, y permite auditar
después por qué un pedido cobró distinto.

> **Dónde queda congelada la tarifa, y por cuánto tiempo.** El valor cobrado se
> guarda como número literal, nunca como referencia a `app_settings`, así que
> cambiar `delivery_bands` **no reescribe la historia**. Pero no todos los
> registros duran igual:
>
> | sitio | escrito en | permanencia |
> |---|---|---|
> | `orders.delivery_fee` | creación del pedido | **permanente** |
> | `orders.delivery_fee_charged` | pickup (`advance_order:251`) | **permanente** |
> | `domain_events.payload.deliveryFee` | creación (`OrderCreated`) | **90 días** |
>
> El job `prune-domain-events` (`0 6 * * *`) borra los eventos publicados con más
> de 90 días. **El evento no sirve para auditar pasados tres meses.** Las dos
> columnas de `orders` bastan para responder "por qué este pedido cobró S/2,50",
> pero no cuentes con el payload.

**`delivery_distance_band` no se elimina.** Su inventario en v2: la escribe
`advance_order:248`; la lee `advance_order:230-241` para la comisión; la sirve la
API del motorizado (`driver/orders/[id]/route.ts:15,104`,
`apps/motorizados/lib/types.ts:78`); viaja en el payload de eventos
(`advance_order:356`); y la tocan once migraciones (0002, 0012, 0014, 0031, 0043,
0059, 0074, 0078, 0079, 0081, 0120). Es la llave de la comisión.

### C6. Vuelto negativo (hallazgo 5)

Si `paga_con < total`, **no mostrar un número negativo**. Mostrar el campo en
estado de advertencia con `El monto es menor al total` y no calcular vuelto. Un
"-S/ 3.00" en pantalla es ambiguo y se puede leer mal con prisa.

`paga_con` es opcional: si está vacío, no mostrar la línea de vuelto.

### C7. Pedidos B2C

Tarifa `near` de `delivery_bands` (S/2,00 hoy), banda `'near'` y
`delivery_fee_source = 'system'`.

> **El camino B2C escribe la tarifa explícitamente al crear el pedido.** No cae
> a ningún fallback, porque no hay fallback al que caer.
>
> `orders.delivery_fee` es `decimal(10,2) not null` (`0002_tables.sql:234`), así
> que el `COALESCE` de `advance_order:221` —
> `COALESCE(v_order.delivery_fee, (v_bands ->> 'near')::numeric, 2.00)` —
> **nunca evalúa sus dos últimos argumentos**. Son decorativos.
>
> **No los tomes como red de seguridad.** Si el B2C no escribe `delivery_fee`, el
> `INSERT` falla por `NOT NULL`; no se rellena solo con S/2,00.

El cálculo por zona poligonal es post-launch, y **este es el único camino que
cambiará cuando entre**: el manual seguirá saliendo de los botones de la cajera.

### C8. Riesgo del corte — requiere aviso previo

Yolvi lleva meses tipeando el **total combinado**. El primer día va a tipear S/27
en un campo que ahora espera S/25, y el sistema cobrará S/29.

Mitigaciones:

- Etiqueta explícita: `Solo la comida, sin delivery`
- Total calculado visible y prominente
- **Avisar a Priamo antes del corte.** Responsabilidad de Jesús, no del código.

---

## PARTE D — Método de pago

### D1. Las cuatro opciones

Portadas del legacy con sus iconos y colores:

| opción          | subtítulo                                | color        |
| --------------- | ---------------------------------------- | ------------ |
| Ya pagó         | Cliente canceló por adelantado           | verde        |
| Cobrar con Yape | Driver cobra al entregar                 | morado       |
| Cobrar efectivo | Adelanta el vuelto al driver             | naranja      |
| Yape + Efectivo | Cliente paga parte por Yape y parte cash | rosa/magenta |

### D2. Campos condicionales (hallazgo 3)

`Cliente paga con` y `Vuelto` solo tienen sentido cuando hay efectivo:

| método          | ¿mostrar vuelto?                |
| --------------- | ------------------------------- |
| Ya pagó         | **No**                          |
| Cobrar con Yape | **No**                          |
| Cobrar efectivo | Sí                              |
| Yape + Efectivo | Sí (sobre la parte en efectivo) |

Ocultar en vez de deshabilitar: menos ruido visual en el camino más común.

### D3. `Yape + Efectivo` — PENDIENTE

No está documentado cómo se captura el reparto entre Yape y efectivo. Necesario
antes de implementar esta opción:

- ¿Se tipea el monto de Yape y el efectivo se deriva?
- ¿O al revés?
- ¿Qué valida que la suma dé el total?

**Se cierra con las secciones M–P del levantamiento del agente.** Mientras tanto,
las otras tres opciones se pueden implementar.

### D4. Reglas de contraentrega

Ya definidas, se aplican aquí: cliente nuevo debe prepagar; efectivo contra
entrega solo tras al menos un pedido entregado, dentro de zona San Jacinto, y
para pedidos bajo S/80 (configurable en `app_settings`). Enforcement en
frontend, endpoint y RPC.

**Bloqueo completo:** un cliente no puede pedir del mismo negocio mientras tenga
un pedido activo.

---

## PARTE E — Creación del pedido

### E1. Idempotencia — se porta, con un matiz nuevo

El legacy la tiene bien resuelta y probada. Tres capas:

1. **`submittingRef`** (ref síncrono) — el segundo handler ve `true` de
   inmediato, antes del ciclo de React
2. **Botón deshabilitado** vía `isPending`
3. **`Idempotency-Key`** server-side — UUID v4 del cliente en `sessionStorage`,
   reserva atómica `INSERT ON CONFLICT DO NOTHING`, TTL 24 h, limpieza de
   placeholders abandonados a los 5 minutos

Ante clave repetida devuelve **la respuesta cacheada** (no error): la cajera ve
lo mismo que la primera vez. Cubre también el fallo de red **después** de que el
servidor procesó.

**Motivo histórico:** 6 pares de duplicados verificados en producción antes del
fix (`20260513000000_idempotency_keys.sql`).

> **HALLAZGO 2 — confirmado contra el código de v2, con la corrección aplicada.**
>
> v2 ya tiene su propia implementación: `apps/api/lib/http/idempotency.ts` (87
> líneas), en uso en cuatro rutas. No usa la palabra `mismatch`; la condición
> equivalente está en las **líneas 77-81**:
> ```ts
> if (existing.request_hash !== requestHash) {
>   throw new DomainError(..., 'idempotency_conflict')
> }
> ```
> Y si está reservada sin completar: `'Solicitud idéntica en proceso; reintenta
> en un momento'`.
>
> Con el selector de delivery el riesgo pasa de improbable a probable: el POST
> falla, la cajera cambia de S/2,00 a S/2,50, reintenta, y recibe
> `idempotency_conflict` — un error opaco con el cliente al teléfono.
>
> **La corrección no es maquillar el mensaje: es regenerar la `Idempotency-Key`
> cuando la cajera edita el formulario después de un fallo.** Un reintento con
> datos distintos es una solicitud distinta y merece clave nueva. La clave debe
> sobrevivir a un reintento **idéntico**, no a uno editado.
>
> Implementación: invalidar la clave de `sessionStorage` en el `onChange` de
> cualquier campo cuando el último intento falló, y generar una nueva al
> reenviar.

### E2. Creación diferida de la dirección — se porta

**La cajera NO crea direcciones.** El pedido se guarda con la referencia como
texto plano y `address_directory_id = NULL`. La fila del directorio se crea
cuando el motorizado marca "Entregado", ya con coordenadas.

Consecuencia aceptada: si el pedido no llega a `delivered`, la dirección nunca se
crea y el cliente sigue siendo "nuevo" la próxima vez.

### E3. `is_default` de la primera dirección

Al crearla en la entrega: si no existe ninguna `is_default` para ese teléfono, la
primera se marca como principal. Respaldado por el índice único parcial.

---

## PARTE F — UI/UX

### F1. Correcciones sobre las capturas del legacy

| #   | Problema                                                        | Corrección                                |
| --- | --------------------------------------------------------------- | ----------------------------------------- |
| 4   | Borde rojo cuando el cliente es nuevo                           | Borde neutro + etiqueta `Cliente nuevo`   |
| 5   | Radio azul en modal, rompe la paleta                            | Color primario                            |
| 6   | `OBLIGATORIO` en texto para teléfono/nombre, `*` para dirección | Un solo marcador                          |
| 7   | Placeholder `Av. Paseo de la República 3500, dpto 502` (Lima)   | `SOLIDEX ALTO - POR KINDER, A UNA CUADRA` |

Sobre #7: las referencias reales de San Jacinto son de ese estilo — sin
numeración de calle, basadas en hitos. Un ejemplo de Lima induce un formato que
no existe ahí.

### F2. Lo que se porta sin cambios

- Paleta naranja/coral con blanco y grises
- Carrusel horizontal de tiempo de preparación con flechas laterales
- Tarjetas de método de pago con icono en cuadro de color
- Botón `Crear pedido` fijo al pie, ancho completo, con flecha
- Encabezado `NUEVO PEDIDO — NEGOCIO` con `×` para cerrar
- Feedback verde `◎ Usando dirección registrada · GPS incluido`
- Contador de caracteres en el campo de dirección

### F3. Entrada de datos (hallazgo 4)

Detalles que ahorran taps por pedido, y se hacen decenas de veces al día:

- **Autofoco en el campo de teléfono** al abrir el formulario
- **`inputMode="numeric"`** en teléfono, monto y "paga con" → teclado numérico en
  móvil, sin que la cajera tenga que cambiarlo
- **`inputMode="decimal"`** en los montos si se permiten céntimos
- El campo de teléfono acepta solo dígitos: filtrar espacios y guiones al pegar
- **No autocapitalizar** el campo de dirección: las referencias van en mayúsculas
  por convención, pero forzarlo estorba si la cajera escribe distinto

### F4. Dispositivo — PENDIENTE

No hay registro de user-agent en el legacy. Si Yolvi trabaja en celular, los
targets táctiles y el ancho de los botones de delivery mandan sobre el resto del
layout. **Confirmar con Jesús antes de maquetar.**

---

## PARTE G — Tipos de coordenadas y casts (decisión tomada)

**`address_directory.lat/lng` se queda en `double precision`.** No es un
descuido: el sensor GPS y Leaflet producen floats, y `numeric` en coordenadas es
precisión falsa — guardar al centímetro un dato que trae 20 m de incertidumbre.

La consecuencia es que v2 convive con **dos representaciones**, y los casts hay
que escribirlos a propósito, no descubrirlos en el primer error de tipos:

| origen                                       | tipo               | dónde hace falta el cast                         |
| -------------------------------------------- | ------------------ | ------------------------------------------------ |
| `address_directory.lat/lng`                  | `double precision` | —                                                |
| `public.point_in_coverage_polygon(p_lat, p_lng)` | recibe `numeric` | **en cada llamada**: `point_in_coverage_polygon(lat::numeric, lng::numeric)` |
| `orders.delivery_coordinates_lat/lng`        | `numeric`          | en el write-back del GPS al pedido y al revés    |
| `customer_addresses.coordinates_lat/lng` (libreta B2C) | `numeric` | en cualquier comparación entre ambas tablas      |

Regla práctica: **el directorio guarda floats; todo lo que cruce hacia `orders`,
hacia la libreta B2C o hacia la validación de cobertura lleva `::numeric`
explícito.** No confiar en la conversión implícita: en comparaciones mixtas
Postgres promueve a `double precision`, que es justo lo contrario de lo que
quieres al validar contra un polígono.

---

## ALCANCE — respecto al pedido original (hallazgo 7)

Jesús listó cuatro cosas para el pedido manual. Estado de cada una:

| pedido original                | estado                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| Información básica del cliente | **En este spec** (Partes A y B)                                                                 |
| Confirmar efectivo             | **En este spec** (Parte D)                                                                      |
| Ver historial                  | **Post-launch.** El histórico viejo se consulta en el legacy read-only. El del v2 arranca vacío |
| Ver deuda                      | **Ya resuelto** vía `business_charges` en la app de negocios                                    |

---

## PENDIENTES

| #   | Qué falta                                        | Cómo se cierra                          |
| --- | ------------------------------------------------ | --------------------------------------- |
| 1   | Dispositivo real de la cajera                    | Preguntar a Jesús / Yolvi               |
| 2   | Reparto en `Yape + Efectivo` (D3)                | Secciones M–P del levantamiento         |
| 3   | Comportamiento del modal en móvil                | Depende de #1 — y ahora pesa más, ver B3 |

**Cerrados en la v3:**

- **Idempotencia.** v2 lo resuelve en `apps/api/lib/http/idempotency.ts:77-81`
  como `idempotency_conflict`; la corrección acordada es regenerar la clave al
  editar tras un fallo (ver E1).
- **Cuántos clientes tienen más de una dirección.** Medido: 58 de 595 (9,7%),
  ver B3. Elevó la prioridad del modal de "caso raro" a camino regular.

Ninguno bloquea el arranque: la Parte C y las correcciones de la Parte F se
pueden implementar ya.

---

## FUERA DE ALCANCE

- Corrección de dirección por el motorizado (spec aparte)
- Mapa arrastrable (spec aparte)
- Historial de pedidos del negocio (post-launch)
- Cálculo automático de tarifa por zona poligonal (post-launch)
- Asiento a `business_charges` (spec aparte)
