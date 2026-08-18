# PENDIENTES — inventario completo

**Fecha:** 2026-08-04
**Alcance:** todo lo que quedó abierto en la sesión de saneamiento + ETL, con su
estado y quién lo cierra.

Este documento existe porque en el camino aparecieron cosas que no estaban en el
plan y que se irían olvidando. **Nada de aquí está resuelto salvo lo marcado
como tal.**

---

## ✅ CERRADO EN PRODUCCIÓN

| | migración | qué |
|---|---|---|
| Directorio de direcciones | `0122` | 658 filas · 591 teléfonos · 351 con GPS · 199 con `accuracy_m` |
| Contingencia eliminada | `0123` | Tabla, 2 enums y 3 funciones borradas |
| Appeals al ledger | `0123` | `register_appeal_refund` de 4 args con guardia de rol y de monto |
| `anon` cerrado | `0123` | Función de dinero ya no ejecutable por `anon` |
| Riesgos R-L3, R-L4 | `0123` | Cerrados |
| Menores M-1, M-2, M-4, M-5, M-6 | `0123` | Cerrados |
| Key del legacy rotada | — | Hecho por Jesús |

---

## 🔴 BLOQUEA EL LAUNCH

Detalle completo en `Docs/spec/spec-fase-2-ledger-y-sprint.md`.

| # | qué | parte | depende de |
|---|---|---|---|
| 1 | Tests de la cadena del pedido | A | — |
| 2 | `balance_due` derivado + cerrar R-L2 | B / `0124` | A |
| 3 | Reestructurar `commissions` + borrar `packages/core` | C / `0125` | A, B |
| 4 | Firma del RPC con `p_delivery_distance_band` | D / `0126` | C |
| 5 | UI de la cajera | E | D |

---

## 🟡 PENDIENTE DEL ETL DE DIRECCIONES

Todo lo que quedó fuera de `0122` a propósito.

### 1. Índice único anti-duplicados — NO creado

```sql
CREATE UNIQUE INDEX address_directory_phone_reference_unique
  ON public.address_directory
  (phone, lower(btrim(regexp_replace(reference, '\s+', ' ', 'g'))));
```

**No se crea hasta que el lookup por referencia esté implementado.** Al revés se
rompe en producción: el motorizado intenta crear una dirección que normaliza
igual a una existente, el INSERT viola la unicidad, y como la captura va en un
`try/catch` no bloqueante, **la dirección se pierde en silencio**.

### 2. Lookup por referencia antes de INSERT — obligatorio

El legacy ya lo resuelve (`mark-delivered.use-case.ts:213-233`): busca
coincidencia por referencia case-insensitive y **actualiza en vez de insertar**.

```
1. Normalizar la referencia igual que el índice
2. SELECT … WHERE phone = ? AND normalizada = ?
3. Si existe → UPDATE (coordenadas, accuracy, source, updated_by)
4. Si no     → INSERT
```

### 3. RPC `search_address_directory` — definido, no implementado

Está escrito en `spec_manual.md §1.5`. `SECURITY INVOKER`, exige teléfono exacto
de 9 dígitos, devuelve `has_gps` en vez de `accuracy_m`.

**Necesita grant declarado** en el manifiesto: `0009_function_grants.sql` revoca
execute a `anon` y `authenticated`, así que sin declararlo queda inaccesible
desde el cliente.

### 4. Constantes del mapa — CREAR, no existen en v2

| constante | valor |
|---|---|
| `SAN_JACINTO_CENTER` | `-9.148104, -78.280353` |
| `SAN_JACINTO_DEFAULT_ZOOM` | `15` |

Mediana medida de las 351 direcciones con GPS. La caja mide 1,97 × 1,29 km.

**Son para centrar el mapa cuando NO hay coordenada previa. NO usarlas como
fallback cuando el GPS falla** — ese es el defecto que produjo las 18
direcciones falsas del legacy.

### 5. 🐛 Bug latente en `point_in_coverage_polygon`

Fallback hardcodeado en `-9.1547, -78.5042` con radio 15 km. **Esa longitud está
~24 km al oeste de San Jacinto** (real: `-78.28`): con radio de 15 km, **el
pueblo entero queda fuera de cobertura y todo pedido se rechaza**.

Hoy no se dispara porque las claves de `app_settings` existen. Si alguien limpia
esa tabla, el sistema se cae en silencio.

Corregir a `-9.148104, -78.280353` con radio 3 km. **Una línea.**

### 6. Validación geográfica del directorio — sin correr

```sql
SELECT id, phone, reference, lat, lng, source
FROM address_directory
WHERE lat IS NOT NULL
  AND NOT public.point_in_coverage_polygon(lat::numeric, lng::numeric)
ORDER BY reference;
```

El polígono es **no convexo**: puede haber direcciones dentro del bounding box
pero fuera del polígono. **No borrar las que salgan** — son direcciones reales
a las que se entregó. Listarlas y revisarlas con Jesús.

### 7. Casi-duplicados — problema de UI, no de datos

Medido: `RENOVACION CASA DE LALI` y `RENOVACION CASA DE LALI O LILI` son la
misma casa con texto distinto. El dedup no las agrupa y el índice único tampoco
las atajaría.

**NO se resuelve con fuzzy automático.** `pg_trgm` decidiendo solo si dos
referencias son la misma casa se equivoca en ambos sentidos, y fusionar
direcciones distintas es peor que tener dos casi-iguales.

**La solución es de UI:** mostrarle al motorizado las direcciones que YA existen
para ese teléfono **antes** de que escriba una nueva. Decisión humana.
Documentado en `Docs/10-flujo-motorizados.md §7`.

---

## 🟡 ANTIFRAUDE — el teléfono del pedido no está atado a la cuenta

**Encontrado al escribir la `0171`.** No lo introduce esa migración; es de antes
y sigue abierto.

`create_customer_order` recibe `p_customer_phone` del navegador y **nunca** lo
compara contra `customer_profiles.phone`. Su guard de OTP (`0056`) solo
comprueba que la cuenta tenga **algún** teléfono verificado, no que sea ése. Y
los strikes se anclan al teléfono que llega por parámetro
(`0162:465`, `customer_strikes.phone`).

**La consecuencia:** un cliente con strikes puede esquivarlos escribiendo otro
número al pedir. El ancla antifraude es un campo que el sancionado controla.

**Lo que NO está afectado.** La `0171` no monta nada sobre `p_customer_phone`:
resuelve el teléfono desde el perfil verificado, precisamente por esto. Así que
el historial de entregas no se hereda tecleando el número del vecino — hay test
que lo amarra (`contraentrega-delivery-history.integration.test.ts`).

**Por qué no se cerró ahí.** Forzar `p_customer_phone = perfil.phone` toca las
tres anclas del antifraude (cuenta, teléfono, dirección), el alta manual de la
cajera —que legítimamente teclea el número de un tercero, sin cuenta— y los
pedidos con `customer_user_id NULL`. Es un cambio de diseño del antifraude, no
un guard más.

**Decisión pendiente:** ¿el teléfono del pedido B2C se fuerza al del perfil, o
los strikes se re-anclan a la cuenta cuando la hay?

---

## 🟡 SPEC DEL MOTORIZADO — no escrito

Decidido pero sin spec. **Requiere levantamiento previo de `apps/motorizados`**
antes de escribir nada: en tres rondas anteriores se propusieron cosas que v2 ya
tenía implementadas.

### Lo ya decidido

- Corrección solo en pedidos `business_manual`
- Corrige la fila existente, **nunca crea una nueva**
- Durante pedido activo actualiza **también el snapshot del pedido**; después de
  entregado, solo el directorio
- Botón de capturar posición actual **+ mapa arrastrable** para ajustar
- Sin coordenada previa: centra en `SAN_JACINTO_CENTER`, zoom 15
- `accuracy_m = NULL` cuando el pin se arrastra a mano
- `updated_by` en cada escritura

### Los tres arreglos obligatorios del legacy

| # | defecto | daño medido |
|---|---|---|
| 1 | GPS falla → planta el pin en el centro con "Confirmar" habilitado | **18 direcciones falsas** |
| 2 | `accuracy: 0` hardcodeado (`active-order-detail.tsx:681-698`) | **49 filas** con la precisión destruida |
| 3 | Sin CHECK de rango en lat/lng | corregido en `0122` |

**El discriminante de una coordenada mala es la PRECISIÓN, no la distancia.**
Verificado: dos pedidos a 11,5 km tenían `accuracy = 12 m` y eran GPS legítimo.
Un filtro por radio los habría descartado sin motivo.

### Componentes a portar (existen en el legacy)

- `packages/ui/src/patterns/interactive-map.tsx` (201 líneas)
- `packages/ui/src/patterns/address-capture-modal.tsx` (345 líneas)
- `packages/core/.../mark-delivered.use-case.ts` — el write-back

---

## 🟡 LEDGER — lo que queda abierto

### R-L2 · `pay_settlement` — mitad cerrada

`0123` le quitó la reposición del fondo. **Falta:** marcar cargos como `settled`
y poblar `settlement_id`. Va en la Parte B / `0124`.

### ⚠️ `generate_settlements` — tercera base de cálculo

**No suma del ledger:** suma `orders.tindivo_commission` directo de los pedidos.

**Consecuencia: los `refund_charge` de disputa NO entran en ese cálculo.** Si se
liquida por ese camino, los reembolsos se omiten.

Hay tres bases de cálculo para la misma deuda —`balance_due`,
`SUM(business_charges)` y `SUM(orders.tindivo_commission)`— que coinciden hoy
por casualidad aritmética, no por diseño.

**Se resuelve en la Parte B.**

### ❓ ¿`settlements` sigue en uso? — levantamiento pendiente

Medido: `settle_business_charges` es el camino canónico (lo usa
`settlement-modal.tsx:176`), y **no existe ninguna pantalla de liquidaciones en
`apps/admin`**. `pay_settlement` tiene **cero ejecuciones**.

Si `settlements` está entero sin uso, se borra y R-L2 desaparece completo. **Es
un levantamiento propio**, no parte de la fase 2.

### `payment_id` vs `settlement_id` — decidir

`settle_business_charges` usa `payment_id`; `pay_settlement` usaría
`settlement_id`. Dos vínculos para el mismo hecho. **Unificar o el historial
queda partido en dos.**

### `charge_type adjustment` + `amount <> 0` — diferible

Necesario para la auditoría de banda. **No aplicar sin el mapa de totales** en
los dos endpoints de summary, o se cobran montos invisibles en el panel.
Detalle en el apéndice del spec de fase 2.

---

## 🔵 FUERA DEL SPRINT — responsabilidad de Jesús

### 1. 💰 La comisión de julio — plata corriendo

Medido en el legacy:

| semana | `base_commission` |
|---|---|
| 15/06 – 27/07 | **S/3,00** |
| 03/08 | S/3,00 (14 pedidos) **y** S/3,50 (5 pedidos) |

El aumento debía entrar el **13 de julio** y entró alrededor del **1-2 de
agosto**. **Tres semanas de retraso**, y aplicación **parcial** — no todos los
negocios se actualizaron el mismo día.

**≈367 pedidos × S/0,50 ≈ S/180 no cobrados.**

**Acción inmediata:** verificar qué negocios siguen en S/3,00 — si alguno no se
actualizó, sigue perdiendo margen hoy.

```sql
SELECT id, name, base_commission, far_surcharge, updated_at
FROM restaurants ORDER BY base_commission, name;
```

**Y una regla para adelante:** cuando cambies una tarifa, verifica con una query
que se aplicó a todos los negocios el día que toca. Esta vez pasaron tres
semanas sin que nadie lo notara.

### 2. Avisar a Priamo del cambio en el campo de monto

Yolvi lleva meses tecleando el **total combinado**. El primer día va a teclear
S/27 en un campo que ahora espera S/25, y el sistema cobrará S/29.

Mitigaciones en el código (etiqueta explícita, total visible), **pero el aviso es
tuyo**. No lo descubra en producción.

### 3. Dispositivo real de la cajera

¿Celular, tablet o computadora? Si es celular con una mano mientras sostiene el
teléfono del cliente, eso manda sobre el layout de los botones y del modal.

### 4. Empujar `develop` a `origin`

Seis commits viven solo en el disco local, incluida la migración aplicada a prod
y el rollback. **Si esa máquina se pierde, prod queda con un esquema que el repo
no describe.**

---

## 🔵 DEUDA CONOCIDA — no bloquea, no olvidar

### Advisors de seguridad preexistentes

Ninguno es ERROR, todos anteriores a este trabajo:

- Funciones `SECURITY DEFINER` ejecutables por `anon`
- `search_path` mutable en `point_in_coverage_polygon` y `create_customer_order`
- Tres tablas con RLS activado y **sin policies**

**Spec propio después del launch.** No mezclar con migraciones de datos.

### Los 56 pedidos inconsistentes del legacy

| caso | n | problema |
|---|---|---|
| `far` con S/3,00 | 20 | recargo perdido — **todos en mayo, bug cerrado** |
| fee en S/0,00 | 18 | no generaron deuda |
| NULL con S/6,00 | 11 | el doble |
| sueltos | 7 | sin diagnosticar |

**Bloquean cualquier migración de deuda histórica del legacy.** No afectan a v2.

### Comentario obsoleto en `0002:230`

Dice que la banda se "declara en `picked_up`", cosa que `0120` cambió. Vive en
una migración inmutable: **no se puede corregir sin migración nueva**. Que quede
la nota para que nadie lo lea como verdad.

### Inmutabilidad de montos — riesgo documentado

`order_amount`, `delivery_fee` y `delivery_distance_band` **se pueden modificar
con un UPDATE directo y eso no deja rastro**. `order_status_history` solo captura
cambios de status; `order_event_log` y `domain_events` solo registran lo que los
RPC escriben.

Un cambio hecho fuera de un RPC es invisible. **Riesgo declarado, sin resolver.**

### `domain_events` no es registro de largo plazo

El job `prune-domain-events` borra eventos publicados con más de 90 días. La
tarifa queda congelada en dos sitios **permanentes** (`orders.delivery_fee` y
`delivery_fee_charged`) y uno **temporal** (`domain_events.payload`).

**No contar con el evento pasados tres meses.**

---

## 🟢 POST-LAUNCH — decidido, no construido

### 1. Auditoría de banda

Poder revisar si la cajera marcó bien `near`/`far` y **corregirlo**.

Requiere `charge_type = 'adjustment'` con monto negativo (apéndice del spec de
fase 2). Con `delivery_bands` en `{near: 2.00, far: 2.50}`, una corrección vale
S/0,50 por pedido.

### 2. Moro — en 2 meses

**El activo de San Jacinto es que Jesús conoce el pueblo.** Por eso
`"SOLIDEX ALTO - POR KINDER"` funciona como dirección. En Moro esa referencia no
le dice nada a nadie.

**Se invierte:** en San Jacinto el texto es la dirección y el GPS ayuda. En Moro
el GPS **es** la dirección.

Consecuencia: en Moro **no se puede aceptar un pedido sin coordenada.** No como
preferencia — como regla.

Esquema mínimo a dejar preparado antes:

```
localidades:     { id, nombre, requiere_gps }
                   San Jacinto → false
                   Moro        → true

coverage_zones:  { id, localidad_id, nombre, tarifa_cliente,
                   comision_tindivo, prioridad }

coverage_areas:  { zone_id, polígono }    ← N áreas por zona
```

**Zonas dibujadas a mano requieren conocimiento local. Anillos por distancia
no.** En Moro se puede medir sin conocer una sola calle.

**Caso difícil:** restaurante en Moro que ya tiene llamadas funcionando. La
salida más viable es **llamada + ubicación por WhatsApp** — el cliente comparte
su ubicación, que es un botón que todo el mundo sabe usar, y queda en el
directorio para siempre.

### 3. Zonas poligonales en San Jacinto — sin urgencia

**Medido: la distancia no existe como variable aquí.**

| rango | entregas | % |
|---|---|---|
| hasta 500 m | 476 | **77,1%** |
| 500 m – 1 km | 140 | 22,7% |
| 1 – 1,5 km | 1 | 0,2% |

Mediana de Priamo: **280 metros**. Máximo absoluto de todo el dataset: 1,34 km.
Los cuatro negocios reales tienen medianas entre 0,27 y 0,32 km — **idénticas**.

**El criterio real de `far` es el terreno, no la distancia:** zona sin pista, en
subida, donde la moto va lento. Eso no lo captura ningún radio, y **Yolvi ya
sabe cuáles son**.

**Por eso los dos botones son la solución correcta.** No es que la geometría sea
difícil de implementar — es que **la geometría no contiene la información que
importa**.

El editor de polígonos vale la pena solo si, con semanas de datos de qué marca
Yolvi, aparece un patrón geográfico. Si no aparece, se ahorró el trabajo entero.

### 4. Coexistencia de las dos tablas de direcciones

Cuando entre el B2C, un cliente registrado pedirá con una dirección de SU libreta
(`customer_addresses`), no del directorio. **¿A qué tabla escribe el GPS el
motorizado?**

Dirección propuesta: el pedido guarda **dos punteros nullables y mutuamente
excluyentes** — `address_directory_id` y `customer_address_id`. El write-back
mira cuál está poblado.

`orders` ya nació con las dos columnas para no migrar dos veces.

### 5. Otros

| | estado |
|---|---|
| Historial de pedidos en v2 | Post-launch. El histórico viejo se consulta en el legacy read-only |
| Rate limiting del RPC de direcciones | Opcional. El teléfono exacto de 9 dígitos ya hace 10⁸ el espacio de enumeración |
| TanStack Query | Diferido. `usePolledQuery` ya tiene la forma de su API |
| WhatsApp Business API | Twilio Verify como puente |
| Segundo motorizado | Prematuro hasta que el volumen lo justifique |

---

## ❓ DECISIONES PENDIENTES

| # | qué | quién |
|---|---|---|
| 1 | `payment_id` vs `settlement_id` en `business_charges` | Técnica — se resuelve en la Parte B |
| 2 | ¿`settlements` sigue en uso? | Jesús, con el levantamiento |
| 3 | Reparto en `Yape + Efectivo` | Levantamiento del legacy |
| 4 | Dispositivo de la cajera | Jesús / Yolvi |
| 5 | Cuándo subir `commissions` si hace falta | Jesús, con datos del piloto |
| 6 | Soporte para 2do QR de Yape (QR alternativo/secundario en `businesses`) | Backlog UI/DB — portar tabs de `tindivo-delivery/yape-qr-card.tsx` cuando se agregue la columna `qr_url_secondary` |

---

## LA REGLA QUE SALIÓ DE ESTA SESIÓN

> **Ninguna función de dinero se da por buena sin una prueba que la ejecute.
> Leerla no cuenta.**

Cinco casos en una sola sesión donde algo "se leía bien" y no funcionaba:

1. **El CHECK del 999.** `accuracy_m > 0 AND < 1000` con un comentario al lado
   que decía "nunca el centinela 999". El predicado no lo bloqueaba.
2. **El literal `'appeal'`.** `register_appeal_refund` comparaba contra un valor
   que no existe en el enum `report_type`. **Fallaba en toda llamada desde que
   se escribió.** Y era la función a la que íbamos a repuntar todo el flujo de
   reembolsos.
3. **Un comentario que decía lo contrario del código** en la propia migración
   `0123`.
4. **Un regex que se cortaba en `DISTINCT`** y devolvía una guarda de cuatro,
   simulando una discrepancia que no existía.
5. **El alfabeto del `short_id`.** `ZZTEST01` viola el CHECK — sin `I`, `O`, `0`
   ni `1`. Habría hecho fallar la prueba en prod antes de probar nada.

En los cinco lo encontró la ejecución, no la lectura.
