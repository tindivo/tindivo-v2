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

**Estado reverificado el 2026-08-19** contra el código vivo y contra prod.
**Cinco de los siete ya estaban resueltos** y esta sección seguía pidiéndolos.
No es un detalle de higiene: leyendo esta lista se mandó a corregir un bug que
ya no existía (§5) y se recomendó crear un índice que hoy sería dañino (§1).

| # | qué | estado |
|---|---|---|
| 1 | Índice único anti-duplicados | ⛔ **no hacerlo** — ver abajo |
| 2 | Lookup por referencia antes de INSERT | ✅ hecho (`0145`, vivo en `0163`) |
| 3 | RPC `search_address_directory` | ✅ hecho (`0144`), con su grant |
| 4 | Constantes del mapa | ✅ hechas (`apps/motorizados/lib/geo.ts`) |
| 5 | Bug de `point_in_coverage_polygon` | ✅ corregido |
| 6 | Validación geográfica del directorio | ✅ **corrida** — 1 de 388 |
| 7 | Casi-duplicados | 🟡 abierto (es de UI, no de datos) |

### 1. Índice único anti-duplicados — NO crearlo

```sql
CREATE UNIQUE INDEX address_directory_phone_reference_unique
  ON public.address_directory
  (phone, lower(btrim(regexp_replace(reference, '\s+', ' ', 'g'))));
```

Estaba bloqueado por §2, §2 ya está hecho, y aun así **no debe crearse**. Las
precondiciones se comprobaron y salen bien —0 duplicados en 705 filas, 0
referencias vacías, una sola ruta de inserción viva, y su normalización es
idéntica a la del índice—, pero falta lo importante:

**`create_manual_order` no tiene ningún `EXCEPTION WHEN`.** Una violación de
unicidad no perdería la dirección: **abortaría la creación del pedido entero**,
con la cajera al teléfono con el cliente.

Y la duplicación que el índice previene **no ocurre**: 705 filas, 4 meses, 97
pedidos manuales en la última semana, cero duplicados, porque desde `0145` el
lookup por referencia va antes del INSERT. La única forma de duplicar hoy es una
carrera entre el lookup y el insert — que es exactamente el único escenario donde
el índice dispararía.

O sea que el índice convierte un fallo benigno y recuperable (dos direcciones
casi iguales en el popup) en uno que se come el pedido. Solo valdría la pena
junto con un `ON CONFLICT DO NOTHING` + re-select en `create_manual_order`, y eso
es redefinir una función grande para blindar una carrera que nunca ha ocurrido.

### 4. Constantes del mapa — hechas, pero duplicadas

`SAN_JACINTO_CENTER` y `SAN_JACINTO_DEFAULT_ZOOM` existen en
`apps/motorizados/lib/geo.ts` con los valores del spec (`-9.148104, -78.280353`,
zoom 15).

**Ojo:** `apps/admin/components/agenda/agenda-map-inner.tsx:13` define su PROPIO
`SAN_JACINTO_CENTER` con otras coordenadas (`-9.1465, -78.2805`). Dos constantes
con el mismo nombre y distinto valor. Hoy solo centra un mapa, así que no rompe
nada; pero es la clase de duplicado que diverge y luego nadie sabe cuál manda.

### 6. Validación geográfica — CORRIDA el 2026-08-19

```sql
SELECT ... FROM address_directory
WHERE lat IS NOT NULL
  AND NOT public.point_in_coverage_polygon(lat::numeric, lng::numeric);
```

**Resultado: 1 de 388 direcciones con GPS cae fuera del polígono** (51 vértices).
La calidad del directorio es buena. Pero esa una merece decisión humana:

| | |
|---|---|
| referencia | «Vista alegre» |
| distancia al centro | **1,04 km** (el respaldo circular son 3 km) |
| `accuracy_m` | 48 — lectura real del sensor, no un centinela |
| `source` | **`driver_verified`** — un motorizado estuvo en esa puerta |
| origen | del ETL del v1: hubo entrega real |
| vecinos en 300 m | 0 · pedidos en v2 cerca: 0 |

La casa es buena; **el polígono es el que la excluye**. Si ese cliente abre la
app y marca su casa, `create_customer_order` lo rechaza con «Dirección fuera de
la zona de reparto».

**Decisión de negocio, no técnica:** ¿Vista alegre entra en la zona de reparto?
Si sí, el polígono se amplía desde /admin. Si no, la entrega del v1 fue una
excepción y el rechazo es correcto. Nadie más que Jesús puede responderlo.

Y el modo de fallo a tener presente: **quien es rechazado no se queja, no pide.**
Un polígono demasiado ajustado no genera incidencias, genera silencio.

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

## ✅ ANTIFRAUDE — los strikes YA se anclan a la cuenta

**Esta sección decía que un cliente podía esquivar sus strikes cambiando el
número que escribe. ES FALSO, y se comprobó midiendo.** Se conserva corregida
porque el error mandaba a construir algo que ya existe.

**Lo que de verdad hay.** `customer_strikes` guarda `customer_user_id` además
del teléfono (`advance_order`, rama `no_show`). Y sobre esa tabla hay un trigger
**habilitado**, `trg_customer_strikes_refresh_risk`, que en cada alta llama a
`refresh_customer_profile_risk(customer_user_id, phone)`. Esa función cuenta:

```sql
where s.customer_user_id = v_profile.user_id
   or (v_profile.phone is not null and s.phone = v_profile.phone)
```

O sea **cuenta OR teléfono**, y con ese total fija `strikes`,
`contraentrega_blocked` y `blocked_until` en el perfil.

**Medido el 2026-08-19** contra la base local, con un usuario cuyos dos strikes
se registraron en DOS teléfonos distintos, ninguno el de su perfil:

```
1 strike (telefono B, misma cuenta)    strikes=1 bloqueado=false
2 strikes (telefono C, misma cuenta)   strikes=2 bloqueado=true
```

Se bloqueó solo. El ancla de cuenta funciona.

**Lo que sigue siendo cierto, y es inherente:**

1. **Los pedidos manuales no tienen cuenta a la que anclar.** La cajera teclea el
   número, `customer_user_id` va NULL y el teléfono es la única ancla posible.
   Quien pida por teléfono dando un número distinto cada vez no acumula strikes.
   No tiene arreglo técnico: lo cubre que la cajera sea humana y reconozca a sus
   clientes.

2. **Un detalle cosmético en `advance_order`.** Tras insertar el strike —y por
   tanto después de que el trigger ya calculó bien— la rama `no_show` hace su
   propio `UPDATE ... SET strikes = (count where phone = X)`, que puede escribir
   un número MENOR que el real si los strikes están repartidos entre teléfonos.
   Solo toca el contador, nunca desbloquea: ese `UPDATE` está dentro de un
   `IF v_blocked`, así que jamás pone `contraentrega_blocked` en false. Es una
   imprecisión de lo que ve el admin, no un agujero. Corregirlo obliga a
   redefinir `advance_order` entera por un contador.

**Lo que NO se cerró y sigue abierto de verdad:** `create_customer_order` nunca
compara `p_customer_phone` contra `customer_profiles.phone`, así que el pedido
puede salir con un número que no es el del cliente y el motorizado llamar a otro
sitio. Es un problema de DATOS DE CONTACTO, no de antifraude — el bloqueo ya no
depende de ese campo. La `0171` tampoco depende de él: resuelve el teléfono desde
el perfil verificado, y hay test que lo amarra
(`contraentrega-delivery-history.integration.test.ts`).

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
| 6 | Soporte para 2do QR de Yape (QR alternativo/secundario) | ✅ HECHO — migración 0184: tabla `business_payment_qrs` (máx. 2, con billetera/número/titular) + puntero `businesses.default_payment_qr_slot`. Pestañas ya portadas en motorizado y cliente |

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
