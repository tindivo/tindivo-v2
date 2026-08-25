# PROPUESTAS_UX_PEDIDOS.md

> Rediseño completo de la vista "Pedidos" — Dashboard del Restaurante Tindivo  
> Restaurante de referencia: **Priamo** · San Jacinto, Áncash

---

## 1 · Cambios estructurales vs el diseño anterior

| Antes | Ahora |
|---|---|
| Lista plana cronológica mezclando todos los estados | 4 columnas operativas (Nuevos / En cocina / Listos / En reparto) |
| Sin distinción visual WEB vs MANUAL | Badges azul "WEB" y naranja "MANUAL" en cada card |
| Sin alarmas escalonadas por falta de moto | Sistema de buffer gradual con 4 fases de escalación |
| Sin busy mode | Botón "Pausar pedidos" + modal de duración + banner prominente |
| Header genérico con logo | Header con contadores en vivo, controles de pausa y alertas |
| Columnas siempre visibles vacías | Tab "Nuevos" se oculta en mobile si no hay pedidos nuevos |
| Sin estado vacío total | "Sin pedidos activos · ¡Buen momento para tomarte un respiro!" |
| Cards genéricas | 12 variantes de card por estado, cada una con acción específica |

---

## 2 · Decisiones de UX clave

### 2.1 4 columnas por significado operativo, no por estado técnico

Los estados de BD (`pending_acceptance`, `waiting_driver`, `accepted`, `heading`, `waiting`, `picked_up`) no se mapean 1:1 a UI. El cajero piensa en términos operativos:

- "¿Tengo que hacer algo ahora?" → **Nuevos** (aceptar/rechazar)
- "¿Qué está en mi cocina?" → **En cocina** (preparar, marcar listo)
- "¿Hay moto viniendo?" → **Listos** (monitorear el buffer)
- "¿Cuántos pedidos están en la calle?" → **En reparto** (solo monitoreo)

`waiting_driver` aparece en dos columnas dependiendo de si `estimated_ready_at` ya pasó o no. Esta lógica es transparente para el cajero pero crítica para la implementación.

### 2.2 WEB vs MANUAL: distinción siempre visible

En pedidos MANUAL, los items no existen en el sistema (solo hay un monto total). Mostrar un bloque de "items" vacío o confuso sería peor que no mostrarlo. Por eso:

- Pedidos MANUAL: badge naranja `[📞 MANUAL]`, bloque de items reemplazado por "Pedido por teléfono — platos comunicados verbalmente a cocina"
- Pedidos WEB: badge azul `[🌐 WEB]`, items detallados con modificadores

El cajero necesita saber de inmediato si tiene que decirle algo al cocinero o si el cocinero ya lo sabe por el ticket.

### 2.3 Sistema de buffer gradual: no alarmar innecesariamente

En San Jacinto, a veces hay 1-2 motorizados activos. Un pedido listo sin moto 1 minuto después de `estimated_ready_at` es **completamente normal** — el sistema no debe alarmar. Solo escala cuando el retraso se vuelve genuinamente problemático.

Las 4 fases:
1. **0-3 min sin moto:** badge amarillo, sin sonido → "todo bien, el moto está de camino"
2. **3-5 min sin moto:** badge naranja → "puede haber un problema, vigila"
3. **5+ min sin moto:** badge rojo + sonido tipo 3 + botón de llamar → "actúa ahora"
4. **Driver llegó (`waiting`):** banner verde intenso + sonido tipo 2 → "acción urgente, entregar"

El sonido tipo 2 (driver llegó) es DISTINTO al tipo 1 (pedido nuevo) para que el cajero sepa sin mirar qué tipo de atención necesita.

### 2.4 Busy mode: control manual explícito, sin sugerencias automáticas

El sistema NO sugiere pausar pedidos aunque haya 10 pedidos en cola. Es una decisión del restaurante basada en su conocimiento de su propia capacidad — el sistema no puede saber si el cocinero está enfermo o si acaba de llegar el turno doble.

La UI refleja esto: el botón existe pero no tiene badge de urgencia ni prompt "¿Quieres pausar?".

### 2.5 Driver llegado = segunda prioridad después de pedido nuevo

Cuando `state = 'waiting'`, el cajero tiene un motorizado físicamente en el local esperando. Esto requiere:
- Banner verde en el header (global, siempre visible)
- Card con borde verde intenso subida al tope de columna 3
- Sonido tipo 2 (diferente al de pedido nuevo)
- Si hay vuelto: monto muy visible para que el cajero prepare el cambio físicamente

El cajero no puede hacer al motorizado esperar mientras busca el pedido o recuerda el vuelto.

---

## 3 · Sistema de buffer gradual — implementación para Mauricio

### Lógica de fase

```typescript
type BufferPhase = 'none' | 'p1' | 'p2' | 'p3';

function getBufferPhase(order: Order): BufferPhase {
  if (!order.estimated_ready_at) return 'none';
  if (order.driver_id) return 'none'; // ya tiene moto asignada
  if (order.state !== 'waiting_driver') return 'none';
  
  const now = new Date();
  const readyAt = new Date(order.estimated_ready_at);
  
  if (now < readyAt) return 'none'; // aún en preparación
  
  const minutesSinceReady = (now.getTime() - readyAt.getTime()) / 60000;
  
  if (minutesSinceReady < 3) return 'p1';  // 0-3 min: amarillo
  if (minutesSinceReady < 5) return 'p2';  // 3-5 min: naranja
  return 'p3';                              // 5+ min: rojo + alarma
}
```

### Transición de columna 2 a columna 3

```typescript
function isInCooking(order: Order): boolean {
  if (order.state !== 'waiting_driver') return false;
  if (!order.estimated_ready_at) return true; // default: en cocina
  return new Date() < new Date(order.estimated_ready_at);
}

function isInReady(order: Order): boolean {
  return ['waiting_driver', 'accepted', 'heading', 'waiting'].includes(order.state)
    && !isInCooking(order);
}
```

### Sonidos (Web Audio API)

```typescript
// Tipo 1: Pedido nuevo (frecuencia alta, doble bip fuerte)
// 880Hz + 1175Hz, 0.45s, repetido cada 3s mientras haya pendientes

// Tipo 2: Driver llegó al restaurante (tono medio, triple bip suave)
// 660Hz + 880Hz + 660Hz, 0.3s por tono, una sola vez

// Tipo 3: Buffer fase 3 (tono bajo, bip largo persistente)
// 440Hz, 0.8s, repetido cada 8s mientras el pedido esté en p3
```

### Columna 3: orden de prioridad

Los pedidos en columna 3 se ordenan visualmente:
1. `waiting` (driver en local) — siempre primero
2. `buffer_p3` (5+ min sin moto)
3. `buffer_p2` (3-5 min sin moto)
4. `heading` (driver en camino)
5. `buffer_p1` (0-3 min sin moto)
6. `accepted` (driver asignado, no en camino)

---

## 4 · Modo ocupado — requerimientos técnicos

### Tabla: `restaurants`
```sql
-- Campo existente a agregar:
accepting_orders_until  TIMESTAMPTZ  -- null = abierto, future = pausado hasta esa hora
```

### Lógica de bloqueo

```typescript
// Backend: en el endpoint POST /orders (pedidos web)
const restaurant = await db.restaurant.findById(restaurantId);
if (
  restaurant.accepting_orders_until &&
  new Date() < new Date(restaurant.accepting_orders_until)
) {
  throw new ApiError(403, 'RESTAURANT_PAUSED', 'El restaurante está temporalmente pausado');
}
```

### Reactivación automática (cron o trigger)

Opción A: cron job cada minuto revisa `accepting_orders_until < now()` y lo setea a null.

Opción B: el check se hace en el endpoint en cada petición (más simple, recomendado para empezar).

### UI pública del cliente

Cuando el restaurante está pausado, la card del restaurante en la web pública muestra:
- Badge naranja "Ocupado por ahora"
- Texto: "Vuelve a aceptar pedidos en aproximadamente X min"
- Los botones de "Pedir" están desactivados

El tiempo se calcula como `floor((accepting_orders_until - now) / 60000)` minutos.

---

## 5 · Flujos críticos paso a paso

### 5.1 Recibir y aceptar un pedido WEB

1. **Pedido entra a `pending_acceptance`** → notificación push + sonido tipo 1 + halo naranja en botón Alertas.
2. **Columna 1 "Nuevos"** muestra card roja pulsante con countdown de 5 min.
3. **Cajero toca "Aceptar pedido"** → modal de confirmación no necesario (acción positiva). Pasa a `waiting_driver`.
4. **El sistema calcula** `estimated_ready_at = now + prep_time` y `appears_in_queue_at = estimated_ready_at - 10min` (para que el moto llegue 10 min después de ponerse en ruta).
5. **Pedido aparece en columna 2 "En cocina"** con barra de progreso.
6. **Cajero comunica al cocinero** (verbalmente o via comanda impresa — fuera del scope del dashboard).

### 5.2 Crear un pedido MANUAL y verlo en cocina

1. **Cajero presiona "+ Pedido manual"** en el header.
2. **Formulario de solicitar motorizado** (pantalla ya diseñada): nombre, teléfono, dirección/referencia, método de pago, monto total, tiempo de preparación.
3. **Al confirmar** → pedido nace en `waiting_driver` con `source = 'manual'`. NO pasa por `pending_acceptance`.
4. **Aparece inmediatamente en columna 2** con badge naranja `[📞 MANUAL]` y barra de prep time.
5. **El cocinero ya sabe el pedido** porque el cajero se lo comunicó al tomar la llamada. La UI no necesita hacerlo.

### 5.3 Marcar listo y ver el buffer gradual

1. **Cajero presiona "Listo — llamar moto"** en columna 2. Pedido pasa a `waiting_driver` con `estimated_ready_at` en el pasado.
2. **Pedido aparece en columna 3** con badge verde "Empaquetado".
3. **Si en 0-3 min no hay moto:** badge cambia a amarillo "Esperando motorizado · 2 min". Sin sonido.
4. **Si en 3-5 min no hay moto:** badge naranja "Sin moto hace 4 min". El cajero nota la demora.
5. **Si 5+ min sin moto:** badge rojo + animación + sonido tipo 3. Botón "Llamar a motorizado" aparece.
6. **Cuando un moto toma el pedido:** card cambia a "Driver en camino · llega en ~X min" (estado `heading`).

### 5.4 Entregar al motorizado cuando llega

1. **Driver llega al restaurante** (`state = 'waiting'`) → sonido tipo 2 (triple bip suave) + banner verde en header.
2. **Card sube al tope de columna 3** con borde verde intenso y texto "[Nombre] llegó · Entregar pedido".
3. **Si hay vuelto:** monto mostrado en grande para que el cajero prepare el cambio físicamente.
4. **Cajero entrega el pedido** al motorizado (acción fuera del sistema).
5. **Driver marca como recogido** desde su app → `state = 'picked_up'`. Pedido pasa a columna 4.

### 5.5 Pausar pedidos en hora punta

1. **Cajero siente que está saturado** → presiona "Pausar pedidos" en el header.
2. **Modal pregunta duración:** 15 min, 30 min, 1 hora, 2 horas, "Hasta que reactive".
3. **Cajero selecciona 30 min** (default preseleccionado) → presiona confirmar.
4. **Sistema setea** `accepting_orders_until = now + 30min` en la tabla `restaurants`.
5. **Header muestra** banner naranja "PAUSADO · Reactiva en 28m".
6. **Web pública del cliente** muestra el restaurante como "Ocupado por ahora".
7. **Pedidos activos continúan** normalmente — solo se bloquean los nuevos.
8. **A los 30 min:** `accepting_orders_until` queda en el pasado → se reactiva automáticamente.
9. *(opcional)* Notificación push al cajero: "Tus pedidos se han reactivado automáticamente".

---

## 6 · Adaptaciones mobile vs desktop

### Mobile
- **Tabs horizontales scrolleables** para las 4 columnas. Si hay pedidos nuevos, el tab "Nuevos" tiene un badge rojo.
- **Header en 2 filas:** fila 1 (identidad + alertas + pausa), fila 2 (botones de acción: Historial, + Pedido).
- **Cards más espaciadas** (hit target ≥ 48px para botones de acción).
- **Tab "Nuevos" oculto** si `ORDERS_NEW.length === 0` — el cajero no necesita ver una pestaña vacía.
- **Barras de progreso** de prep time con altura 6px (más visible con la mano).
- **Banner de driver llegado** ocupa toda la parte superior, rojo/verde, texto grande.

### Desktop
- **4 columnas simultáneas** en grid `1.1fr 1fr 1fr 0.9fr`. Columna 1 ligeramente más ancha (contiene la card con más info).
- **Cards más densas** — información compacta para que el cajero pueda ver 5-6 pedidos por columna sin scroll.
- **Modal de detalle lateral** (380px, slide from right) — el kanban permanece visible detrás.
- **Header en 1 fila** con todos los elementos horizontales.
- **Columnas muestran estado vacío** en lugar de ocultarse (el kanban mantiene su estructura).

### Coincidencias deliberadas mobile/desktop
- Los mismos 12 estados de card. No hay estados distintos por dispositivo.
- Misma jerarquía de color: rojo > naranja > amarillo > verde > gris.
- Mismo orden de prioridad en columna 3.

---

## 7 · Eventos de sonido documentados

| Evento | Tipo | Frecuencia | Duración | Patrón | Condición de repetición |
|---|---|---|---|---|---|
| Pedido nuevo entra | Tipo 1 | 880Hz + 1175Hz | 0.45s | Doble bip fuerte | Cada 3s mientras haya pedidos en `pending_acceptance` y `soundOn = true` |
| Driver llega al restaurante | Tipo 2 | 660Hz + 880Hz + 660Hz | 0.3s × 3 | Triple bip suave | Una sola vez al cambiar a `waiting` |
| Buffer fase 3 (5+ min sin moto) | Tipo 3 | 440Hz | 0.8s | Bip largo | Cada 8s mientras el pedido esté en fase 3 y `soundOn = true` |

El tipo 2 (driver llegó) se dispara incluso si `soundOn = false`. Es el único sonido que no respeta el toggle de alertas, porque requiere acción física inmediata del cajero.

---

## 8 · Manejo de tiempos para el cliente final

(Para Mauricio — sin UI del restaurante pero necesario para el modelo)

### Retraso pequeño (< 5 min sobre el estimado)
- El sistema silenciosamente actualiza el `estimated_delivery_at` en la orden del cliente.
- El cliente ve el nuevo tiempo sin notificación activa.
- No hay UI para el restaurante — ocurre automáticamente.

### Retraso mayor (≥ 5 min)
- Push al cliente: "Tu pedido se está demorando un poco más, te avisaremos cuando salga."
- El restaurante no necesita hacer nada — el trigger es automático cuando el `estimated_ready_at` pasa sin que el pedido cambie a `picked_up`.

---

## 9 · Sugerencias futuras (NO implementar ahora)

- **Auto-asignación inteligente de drivers.** Actualmente los drivers eligen de una cola pública. Podrían asignarse automáticamente según ubicación GPS del driver más cercano. Requiere reescribir `AutoAssignOrderUseCase`.
- **Sugerencia automática de busy mode.** Si en los últimos 10 min el restaurante recibió N pedidos y el tiempo promedio de preparación excede X, el sistema sugiere pausar. Pendiente validar con restaurantes reales qué N y X son sensatos.
- **Analytics de tiempos por restaurante.** Dashboard de "tiempo promedio de preparación", "pedidos por hora", "tasa de cancelaciones" para que el restaurante tome mejores decisiones operativas.
- **Sistema de calificación de drivers post-entrega.** Después de cada entrega, el restaurante puede dar 1-5 estrellas al driver. Impacta el orden en que aparecen en la cola.
- **Historial extendido con filtros.** El historial actual muestra solo el día. Un historial semanal/mensual con filtros por tipo, pago y driver sería útil para contabilidad.
- **Notificación de reactivación automática.** Cuando `accepting_orders_until` expira, push al cajero: "Ya estás recibiendo pedidos nuevamente." Actualmente no está implementado.

---

## 10 · Archivos entregados

```
pedidos-data.jsx      ← Mock data v3: 3 ORDERS_NEW (efectivo/billetera/prepago), 8 ORDERS_COOKING (sub-estados), 3 ORDERS_ROUTE (timer)
pedidos-cards.jsx     ← Cards limpias: NuevoCard (countdown inline), CocinaCard (sin barra), RepartoCard (puntos unificados)
pedidos-detail.jsx    ← Detalle completo: secciones de pago, RejectModal, CancelModal, "Otras acciones"
pedidos-mobile.jsx    ← 3 tabs: Nuevos / En cocina / Reparto / Entregados
pedidos-desktop.jsx   ← 3 columnas kanban + header completo + busy mode
PROPUESTAS_UX_PEDIDOS.md ← Este doc
```

---

## Iteración 2 — Ajustes estructurales

### Cambios clave

| Antes (v2) | Ahora (v3) |
|---|---|
| 4 columnas: Nuevos / En cocina / Listos / Reparto | 3 columnas: Nuevos / En cocina / Reparto |
| Columna "Listos" separada | Sub-estados dentro de "En cocina" |
| Badges "WEB" / "MANUAL" | Badges "Online" / "Directo" |
| Items detallados en card lista | Solo resumen: "Pizza Hawaiana +1 más" |
| Botones Aceptar/Rechazar en card | Card clickeable → detalle → acciones |

### Por qué 3 columnas en lugar de 4

El cajero no hace nada distinto cuando un pedido está "listo" vs "en cocina con tiempo restante" — en ambos casos espera al motorizado. Separarlo en columna propia generaba confusión. Los sub-estados visuales dentro de "En cocina" (puntos de color) comunican la misma información sin fragmentar el kanban.

### Secciones de pago en el detalle

- **Efectivo:** total + "cliente paga con S/X" + vuelto destacado en verde
- **Billetera:** total + QR + botón WhatsApp
- **Prepago:** comprobante del cliente + "Correcto / Inválido"; Aceptar bloqueado hasta verificar
- **Mixto:** billetera + efectivo + vuelto de la parte cash

### Campos nuevos en BD requeridos

Para prepago con verificación de comprobante:

    orders.payment_proof_url     TEXT         URL del comprobante del cliente
    orders.payment_verified_at   TIMESTAMPTZ  Cuándo lo verificó el cajero
    orders.payment_verified_by   UUID         FK a users
    orders.payment_proof_status  TEXT         pending | verified | rejected

Para motivo de rechazo:

    orders.rejection_reason_code  TEXT         out_of_stock | closed | out_of_zone | invalid_proof | no_answer | other
    orders.rejection_reason_text  TEXT         Solo si reason_code = 'other'
    orders.rejected_at            TIMESTAMPTZ
    orders.rejected_by            UUID         FK a users

### Timer de reparto

El campo `picked_up_at` (ya existe) se usa para calcular minutos transcurridos client-side. No es predicción.

---

## Iteración 3 — Refinamiento final

### Ajustes de jerarquía visual

**Cards de Nuevos — countdown inline**
- Antes: header negro ancho completo con texto + countdown grande
- Ahora: countdown discreto junto al ID con ícono de timer, borde naranja sutil siempre visible
- Razón: el header negro era ruido puro. El borde + timer comunica urgencia sin saturar

**Barra de progreso en cocina — eliminada**
- Antes: barra visual de 4px bajo el texto de estado
- Ahora: solo texto "Cocinando · 10m restantes" con color que cambia según urgencia
- Razón: la barra añadía complejidad sin valor operativo real

**Cards de Reparto — puntos de color unificados con cocina**
- 0–30m: ícono moto morado, texto normal
- 30–45m: punto amarillo + "En camino mucho tiempo · hace 32m"
- 45m+: punto naranja + "Reparto demorado · hace 47m"
- Razón: consistencia — el cajero aprende una sola gramática visual

**Header del detalle — countdown discreto, monto en negro**
- Countdown: pequeño, al lado del ID ("· acepta antes de 3:32")
- Monto: negro bold, no naranja (es información, no acción)

**Detalle Directo — sin texto redundante**
- Antes: "Pedido directo — platos sin registrar en sistema"
- Ahora: desglose de cobro (Total del pedido / Delivery / Total a cobrar)

**"Zona de peligro" → "Otras acciones"**
- Razón: "Zona de peligro" es jerga de developers, alarma sin contexto

**Modal de cancelación (nuevo)**
- Diferenciado del rechazo (cancelación = pedido ya aceptado)
- Motivos: Producto agotado / Cliente canceló / Dirección incorrecta / Restaurante no puede continuar / Sin motorizado / Otro
- Botones: "Cancelar acción" / "Confirmar cancelación"

**Tab "Hoy" → "Entregados"**

### Sistema de colores semánticos — referencia

| Estado | Señal | Colores |
|---|---|---|
| Nuevo (pendiente) | Borde naranja + timer naranja | #FDBA74 border, brand timer |
| Nuevo urgente (<1m) | Borde rojo + timer rojo | #FCA5A5 border, danger timer |
| Cocinando (tiempo OK) | Solo texto gris | #57534E |
| Cocinando (<15% tiempo) | Texto naranja | #C2410C |
| Buffer P1 (0–3m) | Punto amarillo + texto ámbar | #EAB308 dot, #B45309 text |
| Buffer P2 (3–5m) | Borde naranja sutil + punto | #FDBA74 border, #F97316 dot |
| Buffer P3 (5m+) | Borde rojo sutil + punto rojo | #FCA5A5 border, #EF4444 dot |
| Moto en camino | Ícono moto morado | #6D28D9 |
| Moto llegó | Borde verde 2px + bg verdoso | #4ADE80 border |
| Reparto 30–45m | Punto amarillo | #EAB308 dot, #B45309 text |
| Reparto 45m+ | Punto naranja | #F97316 dot, #C2410C text |
