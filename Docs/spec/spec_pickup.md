# Spec: Habilitar pickup (recojo) en Tindivo — QR/póster en Priamo

**Estado:** Listo para implementación. Decisiones cerradas con evidencia de código real (no supuestos). Sujeto a corrección tras feedback de campo, según lo acordado.
**Origen:** Discusión iterativa entre Abraham (founder), Claude, y una segunda revisión por otro agente. Todas las decisiones fueron contrastadas contra el código de producción (`tindivo-prod`) antes de cerrarse.
**Objetivo de negocio:** habilitar autoservicio de pedidos de recojo en el local de Priamo (vía QR/póster), sin abrir una vía de fraude, y usando esos pedidos como puerta de entrada a clientes de delivery recurrentes.

---

## 1. Contexto y por qué esto no es trivial

`PICKUP_ENABLED = false` hoy (`features/checkout/types.ts:59`) — el canal de pickup existe en el código pero está completamente apagado y, más importante, **está fuera del pipeline antifraude**: `collectGpsValidation` retorna `{}` inmediatamente cuando `deliveryMethod !== 'delivery'` (`use-checkout-actions.ts:88-92`), así que ningún pedido de pickup captura GPS, no pasa por `current_customer_contraentrega_outcome()`, y no tiene ancla para `customer_strikes`. Activar el flag tal como está hoy expondría el negocio a exactamente el escenario que motivó esta discusión: alguien sin relación con San Jacinto pidiendo recojo solo para generar pérdida de comida preparada, sin ningún mecanismo que lo frene.

Este spec resuelve eso reconectando pickup a la infraestructura antifraude ya existente y probada en producción para delivery — no inventa un sistema paralelo.

---

## 2. Decisión central: dos perfiles de pickup, no uno

El checkout de pickup debe preguntar explícitamente al cliente, sin inferir por el canal de entrada (QR vs. buscar en Google estando ahí mismo — ambos casos son indistinguibles por origen y deben tratarse igual):

> **"¿Cuándo recoges tu pedido?"** → **Ahora, estoy cerca** / **Más tarde**

Este es el campo nuevo `pickup_timing: 'now' | 'later'` en el payload de `create_customer_order`. No se infiere de `source=qr_priamo` — ese parámetro de URL queda solo como dato de atribución de marketing (para medir cuánta gente entra por el póster), nunca como control de seguridad, porque un link se puede fotografiar y compartir.

### 2.1 Pickup "ahora" — verificación por presencia física, no por dato

- **No se activa `validando`. No se pide GPS. No hay llamada de la cajera.**
- El pedido entra directo a la cola con estado `confirmed` (estado ya declarado en el enum y en `ORDER_TRANSITIONS`, actualmente sin ningún escritor vivo — confirmado por auditoría de `pg_proc`: la única función que lo asigna hoy es `confirm_order_cash`, y sobre otra tabla/enum, así que reutilizarlo aquí no colisiona con nada).
- En el tablero, este pedido aparece con una acción de un botón: **"Cliente presente → confirmar"**. Solo entonces pasa a `preparing`.
- Si nadie lo confirma dentro de una ventana corta (propuesta: 10–15 min, mismo orden de magnitud que el timer de 5 min ya usado en `validando`), el pedido se auto-cancela. Cero comida preparada para un pedido fantasma.
- **Por qué esto es más robusto que OTP o geolocalización para este caso específico:** la verificación la hace un humano mirando a otro humano. Un troll puede fotografiar el QR o encontrar el link, pero no puede fingir estar parado frente al mostrador. Y no tiene incentivo para intentarlo: si dice "ahora" y no aparece, el pedido muere solo, sin costo para el negocio.

### 2.2 Pickup "más tarde" — mismo mecanismo que delivery, ya construido

- Reutiliza `current_customer_contraentrega_outcome()` tal como existe hoy para delivery: GPS dentro del polígono de San Jacinto (`customer_gps_in_coverage`) decide entre `validando` (la cajera llama, 5 min de timer) o exigir prepago si no hay cobertura y no hay `compra_previa`.
- **Cambio de código necesario:** en `create_customer_order` (rama `p_delivery_method = 'pickup'`), la evaluación de `current_customer_contraentrega_outcome()` debe correr también para pago contraentrega en efectivo, no solo saltarse directo por ser pickup. Hoy la rama de pickup solo fija `v_delivery_fee := 0` y `v_band := null` (correcto, no se toca) pero no está claro que también invoque la evaluación de riesgo — **verificar y corregir si falta**.
- En el cliente, `collectGpsValidation` debe dejar de retornar `{}` temprano para pickup — captura GPS igual que delivery. Los campos exclusivos de logística de entrega (`deliveryReference`, `deliveryPointQuality`, `coordinates`, guardado best-effort de dirección) siguen gateados por `deliveryMethod === 'delivery'` — ese corte sí está bien y no se toca.

---

## 3. `customer_strikes`: agregar no-show de recojo, sin tocar el esquema

`customer_strikes` no distingue canal (no hay columna de método; `order_id` es nullable). Hoy el único escritor de `reason='no_show'` es `advance_order` acción `no_show`, disparado exclusivamente desde `apps/motorizados` — es decir, **no existe hoy ningún mecanismo para marcar que un cliente no llegó a recoger su pedido de pickup.**

**Nueva pieza:** acción equivalente en `apps/negocios` (panel de la cajera), que inserte en `customer_strikes` con la misma forma que usa `advance_order`, con `delivery_reference`/`delivery_coordinates_*` en `null` (no hay dirección de cliente que anclar en pickup) y ancla solo por `phone` — campos ya nullable en el esquema, cero migración.

Esto conecta automáticamente con la política ya vigente en DECISIONS.md §8: 2 strikes → prepago forzado sin excepción; 3 strikes → bloqueo total 30 días. Aplica igual sin importar si el strike vino de no-show de delivery o de pickup.

---

## 4. Estado nuevo en el enum: `ready_for_pickup`

`picked_up`/`heading_to_restaurant`/`delivered` están construidos sobre la semántica de motorizado — no hay hoy ningún estado que signifique "el pedido está listo, esperando que el cliente lo recoja en el mostrador, sin repartidor de por medio". Forzar pickup dentro de esos estados mezclaría dos conceptos distintos y contaminaría cualquier reporte futuro que asuma que esos estados siempre implican un motorizado asignado.

**Decisión: agregar `ready_for_pickup` al enum `order_status`**, entre `preparing` y `delivered`. Requiere:

- Migración de esquema (nuevo valor de enum).
- Actualizar `ORDER_TRANSITIONS` en `packages/contracts/src/order-status.ts`: `preparing → [..., 'ready_for_pickup']`, `ready_for_pickup → ['delivered', 'cancelled']`.
- Verificar antes de escribir la migración que ningún transición existente hacia `delivered` dependa implícitamente de pasar por `picked_up` primero (revisar el `ORDER_TRANSITIONS` completo, que quedó truncado en la auditoría — pedir el archivo completo antes de escribir la migración).

`delivered` sigue siendo el único estado terminal, compartido entre pickup y delivery. Esto es importante porque la cláusula (a) de `compra_previa` en DECISIONS.md §8 ("un pedido `delivered` de esta cuenta") se cumple automáticamente para pickup sin tocar esa función SQL — **siempre que se confirme que la cláusula compara contra el string `'delivered'` como estado terminal genérico y no contra un flujo específico de motorizado.** Este es un punto de verificación pendiente, no un supuesto cerrado — pedir el texto literal de esa función antes de dar esto por hecho.

---

## 5. Tablero (`apps/negocios`) — sin columna nueva, con tags y filtro

Verificado contra el código real del kanban (`pedidos-view.tsx:466-516`): desktop tiene 3 columnas fijas en grid (`1fr_1.4fr_0.9fr`) — Nuevos / En cocina / En reparto. Tablet (768–1024px) cae a vista de pestañas móvil, no al kanban (corte en `lg`, 1024px). **Una cuarta columna aprieta el desktop a ~1280px y no existe en absoluto en tablet — se descarta.**

**Decisión: `ready_for_pickup` vive dentro de la columna "En reparto" existente**, con un tag distinto por tarjeta:

- 🚴 "En camino" — pedidos de motorizado (`waiting_driver`/`heading_to_restaurant`/`picked_up`).
- 🏠 "Listo para recoger" — pedidos `ready_for_pickup`.

Esto es correcto porque ambos son, posicionalmente, "post-cocina, pre-entrega" — lo que cambia es qué acción le toca a la cajera (ninguna para el courier; entregar en mostrador para pickup), y eso lo resuelve el tag, no una columna aparte.

**Filtro de canal (Pickup/Delivery):** ya existe el patrón exacto a reutilizar — `FilterChips` (`features/historial/components/filter-chips.tsx`), hoy con opciones Todos/Entregados/Cancelados/Web/Manual y contador por chip. Con este cambio llega a su tercer uso (historial, pestañas móviles del tablero, tablero activo) — umbral que el propio equipo ya usa para decidir extraer un componente. Subir `FilterChips` a `components/` (o `@tindivo/ui`) por la regla de CLAUDE.md que prohíbe que una feature importe de otra; dejar `HistFilter` específico en su feature, parametrizando el componente compartido.

**Dos reglas no negociables, ya aprendidas por el equipo a costa de bugs reales:**

1. Los contadores de los chips deben derivarse del conjunto ya filtrado, no del array completo (el bug `JMAXL98Z` en producción fue exactamente este descuadre "chip dice una cosa, lista dice otra", ya corregido dos veces para Web/Manual — no repetirlo aquí).
2. **La alarma sonora nunca debe depender del filtro activo.** `attention.ts` (`demandsCashier`/`attentionState`) es la única fuente de verdad para qué suena y qué se ve resaltado — es una regla explícita del módulo. Si la cajera filtra "solo delivery" para concentrarse, un pickup en `confirmed` con ventana de auto-cancelación corriendo debe seguir sonando igual. El filtro es puramente visual; el riesgo de negocio (comida preparada de más, o un cliente presente sin atender) no puede depender de qué pestaña esté abierta.

**Alerta sonora nueva para "cliente presente, confirmar":** reutilizar el molde ya existente en `use-audio-alert.ts` (osciladores WebAudio + `speak` en es-PE, ~10 líneas para una tríada de frecuencias nueva, mismo patrón que "motorizado llegó"). La condición debe salir de `attentionState`, no de un `useEffect` aparte — regla explícita del módulo.

**`order_source` no cambia.** Es una dimensión distinta (quién creó el pedido: `customer_pwa` vs. `business_manual`), no el método de entrega. "Cliente presente" no es un tercer valor de este enum — se distingue por `delivery_method = 'pickup'` + `pickup_timing = 'now'`. Cero migración en esta pieza, cero riesgo de confundir el badge "Online" existente (que ya cumple otra función) con el tag de canal nuevo.

---

## 6. Conversión a cliente de delivery (la pieza de crecimiento)

Si se confirma en el punto 4 que `compra_previa` cláusula (a) acepta cualquier pedido `delivered` sin importar el canal, entonces **cada persona que completa un pickup con cuenta queda automáticamente elegible para delivery contraentrega sin llamada, desde su próximo pedido** — sin tocar la función SQL.

**Pieza de producto a construir (nueva, no existe):** mensaje push tras completar un pickup (reutilizando `push_subscriptions`, ya existente en el proyecto — verificar primero si ya dispara en algún cambio de estado o si hay que conectar el trigger desde cero) del tipo _"la próxima vez, te lo llevamos sin espera"_, apuntando directo a iniciar un pedido de delivery. Sin este empujón explícito, la elegibilidad técnica no se traduce en comportamiento — es la pieza que convierte la inversión en adopción en clientes de delivery reales.

**Login para pickup:** permitir armar carrito y navegar sin cuenta; pedir autenticación (Google, más liviano que email/password) solo al confirmar el pedido — no antes. Esto no rompe nada de la lógica antifraude porque `customer_user_id` se sigue necesitando en el mismo punto donde ya se necesita hoy (creación del pedido), solo se corre el registro más tarde en el flujo de UI, no antes de dejar ver la carta.

---

## 7. Fuera de alcance / explícitamente descartado (y por qué)

Para que el agente de código no reintroduzca ideas ya evaluadas y rechazadas en esta discusión:

- **OTP obligatorio antes de pasar a cocina, para todo pickup sin historial.** Descartado: redundante con el mecanismo GPS + `validando` ya existente y probado; añadiría fricción y costo de Twilio sin necesidad.
- **Contador de inasistencias completamente aparte del sistema de strikes.** Descartado: DECISIONS.md §8 ya dice explícitamente que el bloqueo por strikes aplica también al canal manual — la pieza que faltaba era solo el escritor para pickup, no un sistema paralelo.
- **Rate limiting por IP/dispositivo.** Confirmado que no existe en ningún punto del proyecto (ni middleware, ni Upstash/Redis, ni lectura de IP). No se construye para este caso porque el canal cliente ya exige sesión autenticada para completar un pedido — el vector de troll anónimo puro ya está cerrado por ese lado.
- **Usar `source=qr_priamo` como control de seguridad.** Descartado: un link se puede fotografiar y compartir; queda solo como dato de atribución de marketing.
- **Tablero separado para pickup vs. delivery.** Descartado: fragmenta la atención de la cajera y arriesga que un `confirmed` con ventana de tiempo se pierda por estar en la pestaña equivocada. Un solo tablero con filtro + tags resuelve lo mismo sin ese riesgo.
- **Cuarta columna en el kanban de escritorio.** Descartado por espacio real en pantalla (aprieta a 1280px) y porque no existiría en absoluto en tablet (768-1024px cae a vista móvil).
- **Reusar `picked_up` para "cliente recogió".** Descartado sin verificar a fondo su acoplamiento con `apps/motorizados`, pero la razón suficiente ya es semántica: mezclar dos conceptos de negocio distintos bajo el mismo estado generará reportes y lógica futura confusos.

---

## 8. Verificaciones pendientes antes de escribir código (bloqueantes)

1. **Texto literal de la función SQL de `compra_previa`** (probablemente dentro o cerca de `current_customer_contraentrega_outcome`) — confirmar si la cláusula (a) compara contra `'delivered'` como string de estado terminal genérico, o si de alguna forma asume un flujo de motorizado.
2. **`ORDER_TRANSITIONS` completo** (el fragmento visto está truncado con `...`) — necesario para escribir la migración de `ready_for_pickup` sin romper ninguna transición existente.
3. **Confirmar si `create_customer_order`, rama `pickup`, ya invoca `current_customer_contraentrega_outcome()` para pago contraentrega, o si hoy se salta la evaluación de riesgo por completo** (la auditoría mostró la fijación de `v_delivery_fee`/`v_band` pero no confirmó si la llamada de riesgo ocurre).
4. **Acoplamiento de `picked_up` con lógica del lado de `apps/motorizados`** — para descartar del todo, con evidencia, la opción de reutilizarlo en vez de crear `ready_for_pickup`.
5. **Estado actual de `push_subscriptions`** — si ya dispara en algún cambio de estado de pedido, o si hay que construir el trigger desde cero para el mensaje de conversión a delivery.

---

## 9. Orden de implementación sugerido

1. Migración: agregar `ready_for_pickup` al enum + actualizar `ORDER_TRANSITIONS` (bloqueado por verificación #2).
2. Backend: extender `create_customer_order` para invocar evaluación de riesgo también en pickup contraentrega (bloqueado por verificación #3); agregar campo `pickup_timing`.
3. Frontend checkout: quitar early-return de `collectGpsValidation` para pickup (manteniendo el gating de campos exclusivos de dirección/tarifa); agregar el toggle "Ahora / Más tarde".
4. Backend + UI negocio: nueva acción de no-show de recojo, insertando en `customer_strikes`.
5. UI tablero: tags de canal en tarjetas, extracción de `FilterChips` a componente compartido, filtro Pickup/Delivery, alerta sonora nueva para `confirmed`, botón "Cliente presente → confirmar".
6. Push de conversión a delivery tras `delivered` de un pickup (bloqueado por verificación #5).
7. Activar `businesses.accepts_web_pickup` para Priamo y `PICKUP_ENABLED = true`, solo después de que 1–5 estén verificados en staging con datos reales.
