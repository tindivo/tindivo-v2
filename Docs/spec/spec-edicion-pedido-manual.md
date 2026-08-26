# Spec · Edición de pedidos manuales por la cajera

Estado: **implementado** en la migración `0190` + ruta PATCH + UI de negocios. Ver §11 para lo
que la implementación reveló y lo que queda pendiente.

---

## 1. Lo que ya está resuelto y NO hay que construir

El caso que motivó la petición —*«hay algunos que les pagan mientras el motorizado va en el
transcurso»*— **ya funciona hoy**, y conviene decirlo antes de diseñar nada.

`deliver-sheet.tsx` le ofrece al motorizado **efectivo / Yape / mixto** en la puerta, y
`advance_order` (0140/0146) recalcula todo desde ahí: si el cliente pagó por Yape, no se le cobra
efectivo, pero el **adelanto de sencillo** que la cajera le dio al motorizado se le sigue rindiendo.
La liquidación de caja sale correcta sin que nadie edite nada.

Lo único que falta ahí es **avisar al motorizado antes de que llegue** para que no vaya contando con
cobrar efectivo. Eso es una notificación, no una edición, y queda **fuera** de esta feature.

## 2. La evidencia de lo que sí falta

Huella del apaño actual: pedidos manuales cancelados y vueltos a tipear para el mismo teléfono en
menos de 30 minutos.

| teléfono | monto cancelado | monto nuevo | minutos |
|---|---|---|---|
| 974703325 | 25.90 | **45.90** | 0.6 |
| 949577793 | 19.50 | **19.50** | 1.6 |
| 923642122 | 12.00 | **12.00** | 3.1 |
| 923642122 | 10.00 | 12.00 | 3.1 / 7.9 / 2.4 |

**7 de las 21 cancelaciones manuales (33%) son la cajera corrigiéndose.** Dos de ellas con el monto
**idéntico**: ahí lo que estaba mal no era el total, sino la dirección, el teléfono, el método de
pago o la banda.

Coste actual del apaño: se pierde el `short_id` que el cliente ya tiene apuntado, se pierde el
`numero_pedido`, y la cancelación queda en las métricas como si el negocio hubiera rechazado un
pedido real.

## 3. Alcance decidido

### 3.1 Dos ventanas, no una: el dinero cierra antes

La primera versión de este plan cerraba TODO en `picked_up`, y estaba mal. Lo destapó una revisión,
y la prueba está en el propio código del motorizado.

`ChangeHeadsUp` (`components/order/change-heads-up.tsx`) se renderiza en `mode === 'waiting'`, o sea
en **`waiting_at_restaurant`**, y dice:

> **Lleva S/30 de vuelto.** Paga con S/50. **Consíguelo aquí, antes de salir.**

El comentario de cabecera del componente lo remata: *«el restaurante es el único punto del recorrido
donde se puede cambiar un billete»*.

**El sencillo cambia de manos físicamente en `waiting_at_restaurant`, no en `picked_up`.** El
sistema solo lee `change_to_give` mucho después, al entregar. Así que con la ventana cerrando en
`picked_up` cabía esto:

```
1. motorizado llega              → waiting_at_restaurant
2. la cajera le da S/30 de vuelto EN MANO     ← el sistema no se entera
3. la cajera edita el billete: S/50 → S/20    ← permitido por el plan viejo
4. change_to_give se recalcula a S/0
5. al entregar se le rinde un adelanto de S/0 y él tiene S/30 encima
   → descuadre que nadie ve hasta el corte de caja
```

Por eso el dinero cierra un estado antes:

```
                        DINERO   CONTACTO
preparing                 sí        sí
waiting_driver            sí        sí
heading_to_restaurant     sí        sí
── waiting_at_restaurant   NO       sí     ← aquí se entrega el sencillo
── picked_up               NO       NO     ← aquí se congela la comisión
delivered / cancelled      NO       NO
```

**Dinero** = total, `payment_intent`, `client_pays_with`, `yape_amount`, `cash_amount`. Todos
mueven `change_to_give`, así que todos caen del mismo lado. Se congelan **en cuanto el motorizado
marca que llegó al local**.

**Contacto** = nombre, teléfono, referencia. Nada de eso mueve dinero, y la corrección «me equivoqué
de calle» con el motorizado ya en el local es un caso real. Sigue hasta `picked_up`.

#### Por qué esto no deja a nadie tirado

El caso legítimo que la restricción parece bloquear es *«el cliente llama para añadir una gaseosa
mientras el motorizado espera»*. No queda huérfano: la cajera se lo dice al motorizado, que está
delante, y **la hoja de entrega ya le deja registrar lo que cobró de verdad** (§1). El dinero acaba
correcto por la misma vía que ya usa cuando el cliente cambia de método en la puerta.

Si algún día hace falta editar el dinero con el motorizado en el local, la solución **no** es
ampliar la ventana: es que el motorizado confirme «recibí el sencillo» y que el guard mire ese
hecho en vez del estado. Eso es otra feature.

#### La limitación, dicha con todas las letras

Con esta regla, **si el motorizado ya está en el local y el cliente llama para cambiar de Yape a
efectivo (o al revés), la cajera no puede tocarlo en el sistema.** Se resuelve de palabra con el
motorizado, que lo registra al entregar. Es una **limitación consciente y aceptada**, no un pendiente:
el propio §3.1 explica por qué ampliar la ventana sería la solución equivocada.

Que la salida funciona está verificado en el código, no supuesto: `deliver-sheet.tsx` tiene una rama
`kind === 'changed'` donde el motorizado elige `paid_cash | paid_yape | paid_mixed` y teclea el
billete, sea cual sea el `payment_intent` planeado.

Y el coste real de la limitación, para no venderla como gratis: en un pedido planeado como Yape,
`change_to_give` es NULL, así que **el motorizado no lleva sencillo encima**. Si en la puerta el
cliente cambia a efectivo con un billete grande, puede no tener vuelto. La hoja de entrega registra
el cobro correctamente, pero el problema físico existe y se resuelve como se resuelve hoy: pidiendo
importe exacto, o volviendo al local. Es exactamente el escenario que `ChangeHeadsUp` intenta evitar
—«el restaurante es el único punto del recorrido donde se puede cambiar un billete»— y por eso no
conviene fingir que el camino alternativo es indoloro.

#### El límite superior sigue siendo `picked_up`

Para el contacto, y por el mismo motivo de siempre: es donde `advance_order` congela
`commission_amount` y `delivery_fee_charged`.

Encaja con lo observado: **ninguno de los 21 pedidos cancelados llegó a recogerse** (`picked_up_at`
nulo en los 21), y las correcciones ocurren entre 0.3 y 8 minutos tras crear.

> Salvedad honesta: puede que no se corrija después de recoger porque hoy **es imposible**, no
> porque no haga falta. Si aparece esa necesidad, el sitio para atenderla es un ajuste de admin, no
> una ampliación de la ventana de la cajera.

Que la app del motorizado se refresque sola (realtime + sondeo de 20s, `pedido/[id]/page.tsx:116`)
es lo que hace segura la parte alta de la ventana: una edición con el motorizado ya en camino al
local le llega en segundos.

### 3.2 La banda no la toca la cajera

`delivery_distance_band` decide el envío (near S/2.00 / far S/2.50) y **es lo único que el negocio
le debe a Tindivo que una edición puede mover**. Queda fuera: si el envío está mal cobrado, lo
corrige un admin.

Contexto que hace esto barato: **la comisión es plana** (`{"pickup": 1.00, "delivery": 1.50}`), no
un porcentaje. Editar el total **no cambia** lo que el negocio debe. Sin la banda, la superficie de
abuso de esta feature es cero.

## 4. Qué se puede editar

| campo | ¿editable? | por qué |
|---|---|---|
| **total** (`p_total_amount`) | **sí** | el error más frecuente. No cambia la comisión (plana) |
| **método de pago** (`payment_intent`) | **sí** | «dijo efectivo, ahora dice Yape» antes de que salga |
| **billete** (`client_pays_with`) | **sí** | de él sale el `change_to_give` que la cajera le adelanta |
| **partes del mixto** (`yape_amount`, `cash_amount`) | **sí** | sin ellas un mixto editado no cuadra |
| **nombre**, **teléfono** | **sí** | teléfono mal tecleado = el motorizado no puede llamar |
| **referencia** (`delivery_reference`) | **sí** | la corrección «me equivoqué de calle» |
| **tiempo de cocina** (`prep_time_minutes`) | **no** | ya existe `extend_order_prep`, con su propia lógica de cola y avisos. Meterlo aquí sería un segundo camino para lo mismo |
| **banda** (`delivery_distance_band`) | **no** | §3.2 — solo admin |
| **método de entrega** (`delivery_method`) | **no** | delivery↔recojo cambia comisión, envío y a quién se asigna. Es otro pedido, no una edición |

### 4.1 El total no es lo que se guarda

Detalle que condiciona todo el diseño: la cajera teclea el **total que paga el cliente**, y la RPC
lo parte:

```sql
v_order_amount := round(p_total_amount - v_delivery_fee, 2);
```

Así que editar el total NO es un `update orders set order_amount`. Hay que:

1. re-partir contra el `delivery_fee` **actual** de la fila (que la cajera no puede cambiar),
2. re-validar que `order_amount > 0` (un total por debajo del envío es inválido),
3. re-validar la cadena de efectivo entera (§5).

## 5. El problema de verdad: la validación hay que re-ejecutarla, no repetirla

`create_business_manual_order` valida, en este orden: monto > 0 → partición del total → las dos
partes del mixto suman el total → `client_pays_with >= v_cash_part` → `change = pays_with − cash_part`.

**Una edición tiene que pasar por exactamente esas mismas reglas.** Si no, la vía de edición acepta
lo que la de creación rechaza, y el agujero es silencioso.

Tres formas de conseguirlo:

| opción | qué pasa |
|---|---|
| A · Duplicar el bloque en `update_business_manual_order` | rápido, y **exactamente** la clase de deriva que produjo el fallo de 0189: dos copias de una regla de dinero que alguien actualiza a medias |
| B · Extraer un helper `manual_order_money(...)` que devuelva la partición validada, y llamarlo desde creación y edición | **recomendada** |
| C · Implementar la edición como cancelar+recrear por dentro | descartada: cambiaría `short_id` y `numero_pedido` —que el cliente ya tiene apuntados— y soltaría al motorizado ya asignado |

La regla del repo dice «no DRY prematuro, extraer con 3+ usos», y aquí son 2. **Se salta a
propósito**: la regla existe para no abstraer de más, no para tolerar dos copias de una validación
de dinero. La 0189 costó una noche por exactamente esto.

## 6. Dónde vive

| capa | qué hace |
|---|---|
| `manual_order_money(...)` (SQL) | parte el total y valida la cadena de efectivo. Único sitio donde vive esa regla |
| `update_business_manual_order(...)` (RPC) | guard de estado + guard de dueño + llama al helper + UPDATE + log |
| `PATCH /api/v1/business/orders/[id]` | pasamanos con `requireRole('business')`, como el resto |
| `apps/negocios` · detalle del pedido | botón «Editar» visible solo antes de `picked_up`, reusando el formulario de `features/nuevo` |

El guard de estado va **dentro de la RPC**, no solo en la UI: es lo que impide que una pestaña
abierta desde hace diez minutos edite un pedido que el motorizado ya recogió.

### 6.1 Dos ediciones a la vez

Respuesta corta a «¿el UPDATE trae todos los campos o solo los que cambian?»: **todos, siempre.**
Pero eso por sí solo no basta, y conviene ver por qué.

**Payload completo** (no un patch parcial). La RPC recibe el conjunto entero de campos editables y
escribe los cinco/ocho de una vez. Eso elimina la mezcla: nunca queda una fila con el total de una
edición y el método de pago de otra.

**`SELECT ... FOR UPDATE`** sobre la fila al entrar, igual que hacen `advance_order` y
`validate_order`. Dos PATCH simultáneos se serializan: el segundo espera al COMMIT del primero y
vuelve a leer. Sin esto, los dos leerían la misma pre-imagen y el guard de estado de uno podría
decidir sobre datos que el otro ya cambió.

**Testigo de versión.** Payload completo + lock todavía deja pasar la pérdida de actualización
clásica, que es el caso que la revisión describe:

```
pestaña A carga el pedido        (total 25.90)
pestaña B carga el pedido        (total 25.90)
pestaña B guarda: total 45.90    → fila queda en 45.90
pestaña A guarda: cambia SOLO el teléfono, pero manda su total 25.90
   → el total vuelve a 25.90 sin que nadie lo haya pedido
```

Con payload completo esto no es un bug menor: es *más* probable, porque la pestaña vieja pisa
campos que ni siquiera tocó. La cura es optimista y barata:

- el cliente manda el `updated_at` que vio al cargar (`p_expected_updated_at`),
- la RPC compara contra la fila bloqueada y, si no coincide, aborta con
  `'El pedido cambió mientras lo editabas. Vuelve a abrirlo.'` (P0001).

`orders.updated_at` sirve como testigo sin inventar nada: el trigger `touch_orders` →
`touch_updated_at` ya lo refresca en **cada** UPDATE de la tabla, verificado en `pg_trigger`. Eso
cubre también los cambios que no vienen de la cajera —una transición del motorizado, por ejemplo—,
que es justo lo que se quiere: si el pedido se movió por cualquier motivo, la edición a ciegas se
rechaza.

Es un reintento manual, no un merge automático: mezclar dos ediciones de dinero sin que nadie mire
es peor que pedir que se repita.

### 6.2 Qué ve la cajera cuando pierde la carrera

«La UI recarga y muestra lo que hay ahora» —como decía la primera versión de este plan— es la
respuesta cómoda y la equivocada. Si acaba de cambiar cuatro campos y escribir un motivo, perder eso
en mitad de una noche ocupada es fricción real, y la reacción previsible es dejar de escribir
motivos.

**El formulario no se limpia nunca.** Lo que ella tecleó se queda donde está, motivo incluido.

Para que eso sea posible sin un segundo round-trip, el conflicto viaja con los datos frescos: la RPC
levanta P0001 con un `DETAIL` marcado —mismo patrón que el `active_order_block:` de
`create_customer_order`— y **la ruta lo traduce a un 409 que lleva el pedido actual en el cuerpo**.
La UI ya tiene todo para pintar el conflicto sin volver a preguntar.

Encima del formulario aparece un aviso que dice **qué cambió y quién lo movió**:

```
El pedido cambió mientras lo editabas.
  · Total:   S/25.90 → S/45.90        ← también lo cambiaste tú: decide
  · Estado:  waiting_driver → heading_to_restaurant
Tus cambios siguen abajo. Revísalos y vuelve a guardar.
```

La distinción de la primera línea es la que hace útil el aviso:

- **campos que solo cambió ella** → se mantienen tal cual; no hay nada que decidir;
- **campos que cambiaron en los dos lados** → se marcan en rojo, con los dos valores a la vista.
  Es el único sitio donde de verdad hace falta que un humano elija.

El botón de guardar reenvía sus valores con el `updated_at` nuevo, y **solo aparece después de que
el aviso se ha pintado**. No es un «forzar»: es que vio el conflicto y decidió. Si mientras tanto el
pedido se mueve otra vez, vuelve a chocar, que es lo correcto.

Un caso que el aviso tiene que cubrir bien: si lo que cambió fue el **estado** y la nueva ventana ya
no permite lo que ella editó —el motorizado llegó al local y ella estaba tocando el total—, el
mensaje lo dice con esas palabras y el campo de dinero se deshabilita. Recargar sin más la dejaría
adivinando por qué su total ya no se puede guardar.

## 7. Todo cambio queda registrado

Una fila en `order_event_log` por edición, con `event_type = 'order.manual_edited'`, el actor, y
**solo los campos que cambiaron**, con su antes y su después:

```json
{ "cambios": { "total": { "de": 25.90, "a": 45.90 },
               "paymentIntent": { "de": "pending_cash", "a": "pending_yape" } },
  "motivo": "el cliente agregó dos gaseosas" }
```

No es burocracia: el antifraude de este piloto es humano, y el día que un total baje después de que
el motorizado salió, la pregunta va a ser *quién y por qué*. Sin el antes/después no hay respuesta.

**El motivo se quitó** tras probar la pantalla. Lo llevaba como obligatorio para los cambios de
dinero, y en la revisión visual quedó claro que sobra: la cajera corrige con el cliente al
teléfono, y un campo de texto libre entre ella y el botón de guardar es fricción en el peor
momento. Lo previsible no es que escriba mejores motivos, sino que deje de corregir y vuelva a
cancelar y retipear — el hábito que esta feature viene a sustituir.

Lo que la auditoría necesitaba de verdad **no se pierde**: el log sigue guardando QUÉ cambió, con
su antes y su después campo por campo, más el estado y si había motorizado. Eso reconstruye un
total que bajó; el texto libre solo lo adornaba. `p_reason` se conserva en la firma de la RPC por
si algún día un admin quiere anotar desde su panel.

## 8. Tres efectos colaterales que hay que evitar a propósito

1. **La edición CORRIGE `address_directory`, pero nunca inserta.** Esto cambió durante la
   implementación, y la primera versión estaba mal razonada.

   Decía: «si editar también creara filas, sería un segundo camino para acuñarse confianza de
   contraentrega (0182), y repetible». El argumento está **invertido**: la fila mala ya se acuñó
   al CREAR el pedido. No tocarla no impide que exista — solo impide arreglarla, y deja el
   autocompletado mintiendo, el teléfono mal tecleado en la agenda para siempre (y suele ser el
   de otro vecino real), y ese número con confianza de contraentrega que no ganó.

   Así que se **actualiza** la fila, nunca se inserta: cero filas nuevas = cero caminos nuevos de
   confianza. Con cuatro condiciones, cada una por un motivo distinto:

   | condición | por qué |
   |---|---|
   | hay `address_directory_id` | hay fila que corregir |
   | ningún OTRO pedido la referencia | si la comparte es curada: el equivocado fue este pedido, no la agenda |
   | el teléfono nuevo existe y no es de otra fila | `phone` es NOT NULL con CHECK de 9 dígitos, y esquiva `address_directory_default_unique` (UNIQUE (phone) WHERE is_default), que si no abortaría la edición entera |
   | la referencia nueva no es nula | también NOT NULL, y en recojo la edición la deja en null |
2. **La edición NO toca los relojes.** `estimated_ready_at`, `appears_in_queue_at` y
   `prep_time_minutes` se quedan como están: cambiar el total no cambia cuánto tarda la cocina, y
   quien sí debe moverlos es `extend_order_prep`.
3. **La edición NO cambia el estado.** Ni adelanta ni retrocede la máquina. Un pedido editado sigue
   exactamente donde estaba.

## 9. Pruebas

Nuevo `apps/api/lib/__tests__/manual-order-edit.integration.test.ts`:

1. Editar el total en `preparing` → `order_amount` re-partido contra el `delivery_fee` de la fila, `short_id` y `numero_pedido` **intactos**.
2. Editar con el motorizado asignado (`heading_to_restaurant`) → permitido, dinero incluido.
3. Editar en `picked_up` → **rechazado** (P0001), y en `delivered` y `cancelled` también.

**La frontera del sencillo** (§3.1) — el grupo que la revisión destapó:

3-bis. En `waiting_at_restaurant`, editar el **total** → rechazado. Ídem `payment_intent`, `client_pays_with`, `yape_amount` y `cash_amount`: los cinco, uno por uno.
3-ter. En `waiting_at_restaurant`, editar **teléfono, nombre o referencia** → permitido. Es lo que distingue «el dinero está congelado» de «el pedido está congelado».
3-quater. Un pedido SIN vuelto (Yape, o efectivo exacto) en `waiting_at_restaurant` → el dinero sigue rechazado igual. La regla mira el estado, no si hay adelanto: cambiar de Yape a efectivo con billete **crearía** un adelanto que el motorizado no lleva encima, y ese es el mismo agujero por el otro lado.

**Concurrencia** (§6.1):

3-quinquies. Dos ediciones con el mismo `p_expected_updated_at`: la primera pasa, la segunda → rechazada con el mensaje de «el pedido cambió». Lanzadas con `Promise.all`, ≥5 rondas.
3-sexies. Editar mandando un `p_expected_updated_at` viejo tras una transición del motorizado → rechazado. Amarra que el testigo cubre cambios que no vienen de la cajera.
3-septies. Tras un rechazo por versión, la fila queda **exactamente** como la dejó la edición que sí pasó: ni un campo mezclado.
3-octies. El rechazo por versión llega como **409 con el pedido actual en el cuerpo** (§6.2), no como un 500 ni como un error pelado. Es lo que le permite a la UI pintar el conflicto sin volver a preguntar.

**UX del conflicto** (§6.2), en `apps/negocios` con Playwright:

3-nonies. Provocar el conflicto con dos pestañas: la que pierde **conserva sus cuatro campos y el motivo** tecleados, muestra el aviso con el antes/después, y el botón de guardar reaparece. Es el caso que la revisión pidió: perder lo escrito era la fricción real.
3-decies. Conflicto donde lo que cambió fue el **estado** a `waiting_at_restaurant` y ella estaba editando el total: el aviso lo dice con esas palabras y el campo de dinero queda deshabilitado.
4. Total por debajo del envío → rechazado, con el mismo mensaje que en creación.
5. Mixto editado cuyas partes no suman el total → rechazado.
6. `client_pays_with` menor que la parte en efectivo → rechazado.
7. Cambiar de `pending_cash` a `pending_yape` → `client_pays_with` y `change_to_give` quedan en NULL (ya no hay efectivo que devolver).
8. Cambiar a `pending_cash` con billete → `change_to_give` recalculado.
9. **La banda no se puede tocar** aunque se mande en el payload.
10. Editar un pedido de OTRO negocio → rechazado.
11. Editar un pedido **online** (`source = 'customer_pwa'`) → rechazado: esto es solo para manuales.
12. Cada edición deja **una** fila en `order_event_log` con solo los campos cambiados.
13. La edición **no** crea filas en `address_directory` (§8.1).
14. Regresión: `create_business_manual_order` y `update_business_manual_order` rechazan lo mismo — se recorren los casos 4, 5 y 6 contra las dos vías y se comparan los errores. Es el test que amarra que el helper del §5 se usa de verdad en los dos sitios.

## 10. Decisiones — cerradas

1. **Push al motorizado si cambia el dinero y ya está asignado.** Sin eso llega con un número en la
   cabeza que ya no es el real. Solo por cambio de dinero, y solo con motorizado asignado: un
   push por cada corrección de teléfono sería ruido, y el ruido se aprende a ignorar.
   Tag del push, por el invariante 5: `${event_type}-${shortId}`, nunca solo el `shortId`.
2. **Sin límite de ediciones**, con el log del §7 como registro. El panel admin marca los pedidos
   con **3 o más** ediciones. Un tope rígido bloquearía una noche caótica real; la señal informa
   sin impedir.
3. **Cualquiera del negocio edita cualquier pedido del negocio.** El guard es «el pedido es de tu
   negocio», no «lo creaste tú».

   **Deuda técnica anotada**: hoy en el piloto un negocio = una persona en caja, así que la
   distinción no existe. El día que Priamo —o cualquier partner— tenga dos personas en el
   mostrador, el log del §7 va a decir «lo editó el negocio» y no *quién*, que es exactamente lo
   que hará falta saber cuando haya que preguntar por un total que bajó.

   Lo que abarata ese día: `order_event_log` ya guarda `actor_user_id`, así que el dato queda
   registrado desde el primer día aunque hoy no se use. Lo que faltará entonces es que cada
   cajera tenga su propia cuenta —hoy comparten la del negocio—, y eso es un cambio de cuentas y
   roles, no de esta feature.

---

## 11. Lo que la implementación reveló

`0190` (helper + creación parcheada + edición), `PATCH /api/v1/business/orders/[id]`, y el modal
«Corregir este pedido» en el detalle de negocios.

**Suite de `apps/api`: 219/219 en 26 ficheros.** La nueva: 24 casos.

### Dos defectos míos que solo aparecieron al ejecutar

1. **El modal llamaba a `fetch` con URL relativa.** La app de negocios corre en `:3002` y el API en
   `:3001`, así que la petición pegaba contra el propio Next y moría en un 404 disfrazado del
   mensaje genérico «No se pudo guardar. Revisa tu conexión». **Solo se vio abriendo el navegador**:
   el type-check y los tests de integración —que llaman a la RPC directamente— pasaban en verde.
   Corregido usando el cliente `api` compartido, que es quien pone la base y el Bearer.

2. **El primer arnés de pruebas del testigo de versión daba un falso verde.** Metía las dos
   ediciones en un mismo bloque `DO`, o sea una sola transacción, y `now()` —que es lo que usa el
   trigger `touch_updated_at`— devuelve el instante de INICIO de la transacción: `updated_at` no
   avanzaba y el testigo parecía funcionar sin hacerlo. La comprobación real necesita dos llamadas
   de verdad, que es como llegan dos PATCH. Está anotado en la cabecera del test para que nadie lo
   vuelva a escribir así.

### Un flake ajeno que salió a la luz

`nightly-change-ceiling` empezó a fallar en tres casos, y **no era por este cambio**: su helper
`declararVuelto` hacía un `UPDATE` sobre `business_service_days` asumiendo que ya existía la fila de
la jornada. Esa fila la crea el negocio al confirmar apertura, no el seed. Sin fila, el UPDATE no
casa nada, PostgREST no lo considera error, y la declaración se pierde en silencio.

Pasa los días en que alguien confirmó apertura y falla los demás: estuvo en verde toda la sesión y
se puso rojo al cruzar las 05:00 de Lima, cuando `current_service_date()` avanzó a una jornada sin
fila. Arreglado con un `upsert`.

### Verificado en el navegador, no solo en tests

Editar un pedido real de S/30 a S/45 desde el tablero: el modal cerró, la cabecera pasó a **S/ 45**,
el desglose a 43 + 2 de envío, y **el vuelto se recalculó solo de S/20 a S/5**. El log quedó con
`{"total": {"de": 30.00, "a": 45}}` y su motivo.

### Rollback: ensayado, no solo escrito

Ejecutado contra la base local. Restaura `create_business_manual_order` al md5 exacto de antes
(`27cacf9d1af1dcd3fd213e06018d1018`), deja cero funciones nuevas, y **se comprobó que después de
correrlo todavía se pueden tomar pedidos manuales** — que es lo que el orden del archivo protege:
si el helper se borrara antes de restaurar la creación, el negocio se quedaría sin poder vender
entre los dos pasos.

### Lo que queda pendiente

- **El push al motorizado** cuando cambia el dinero y ya está asignado (decisión §10.1). No está
  implementado: hoy el número le cambia solo en pantalla, que es lo que ya hacía la app, pero sin
  aviso. Es lo primero que falta.
- **La marca de 3+ ediciones en el panel admin** (§10.2). El dato está en `order_event_log` desde
  el primer día; falta la consulta y la tarjeta.
- **Los dos casos de Playwright del §9** (3-nonies y 3-decies, la UX del conflicto). El camino
  feliz sí está verificado a mano en el navegador; el del conflicto solo por integración.
- **`0190` no está en producción.** Local en 0190, prod en 0189.
