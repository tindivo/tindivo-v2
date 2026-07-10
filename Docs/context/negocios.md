# `apps/negocios` — Contexto y estado

> PWA dirigida al restaurante (negocio partner de Tindivo).  
> Stack: Next.js App Router · Supabase · `@tindivo/ui` · `@tindivo/api-client` · `@tindivo/contracts`

---

## Actores y propósito

El único actor es el **operador del restaurante** (dueño o encargado).  
Su trabajo diario: recibir pedidos, gestionarlos hasta la entrega, y mantener el menú actualizado.

---

## Flujo principal del restaurante

```
Cliente hace pedido (web B2C o manual)
        │
        ▼
[NUEVOS] — Pedido llega con countdown de 5 min para aceptar
        │
        ├─ Rechazar → motivo codificado → cancelado
        │
        └─ Aceptar → define tiempo de preparación (10–50 min)
                │
                ▼
        [COCINA] — Timer corre hacia estimated_ready_at
                │  Puede extender +10 min (una sola vez, antes de que llegue el moto)
                │
                └─ Marcar "Listo" → sistema llama al motorizado
                        │
                        ▼
                [REPARTO] — Solo monitoreo. Timer desde recogida.
                        │  Estados internos: heading → waiting (moto en local) → picked_up
                        │
                        ▼
                [ENTREGADOS] — Historial del turno (últimos 40)
```

**Pedido directo (manual):** El restaurante puede crear pedidos por teléfono desde `/nuevo` sin que el cliente use la app. El flujo es idéntico a partir de COCINA (ya llega aceptado con prep time definido).

---

## Módulos — estado completo auditado

### 🟢 Dashboard de pedidos (`/` → `page.tsx` + `pedidos-view.tsx` + `pedido-detail.tsx`)

**Estado: completo y funcional.**

- Kanban de 4 columnas en desktop (Nuevos / Cocina / Reparto / Entregados)
- Vista mobile con tabs — responsive real, no adaptado
- Ciclo de vida completo implementado vía API transitions
- Realtime via Supabase — suscripción única en `chrome.tsx`, persiste en toda la navegación
- Alertas de sonido toggle (corre en el chrome, suena en cualquier sección)
- Pausa de pedidos con timer configurable (15min / 30min / 1h / 2h / indefinido)
- Banner de estado cuando el motorizado está en el local (`state === 'waiting'`)
- Countdown visual para pedidos pendientes de aceptación (5 min, se cancela automáticamente)

**4 modalidades de pago implementadas en el detalle:**

| Pago             | Comportamiento                            |
| ---------------- | ----------------------------------------- |
| `pending_cash`   | Muestra total + cálculo de vuelto         |
| `pending_wallet` | Muestra QR del restaurante (Yape/Plin)    |
| `prepaid`        | Verificación manual de comprobante (foto) |
| `pending_mixed`  | Billetera + efectivo, con vuelto parcial  |

**Estados internos del pedido (view-model):**

```
pending_acceptance → validando → cooking
  → buffer_p1 / buffer_p2 / buffer_p3 (esperando moto sin driver asignado)
  → heading (moto en camino al local)
  → waiting (moto en el local)
  → picked_up
  → delivered | cancelled
```

**Bugs confirmados:**

1. **`itemMaxPrice` en `menu/page.tsx` siempre retorna `base_price`** — la función existe pero no suma modificadores. El rango mostrado en la lista del menú siempre es `S/X – S/X` aunque haya modificadores con precio adicional. _(En `menu/item/[id]/page.tsx` la implementación es correcta.)_

2. **`onCallDriver` no se pasa en `page.tsx`** — `DetailScreen` tiene lógica para mostrar "Llamar motorizado manualmente" cuando `order.state === 'buffer_p3'`, pero el objeto `actions` en `page.tsx` nunca incluye `onCallDriver`. El botón nunca aparece.

---

### 🟢 Pedido directo (`/nuevo` → `nuevo/page.tsx`)

**Estado: completo y funcional.**

- Formulario de creación manual de pedido (por teléfono)
- Campos: tiempo de preparación, nombre cliente, teléfono, dirección/referencia, método de pago, monto
- Las 4 modalidades de pago con validación en tiempo real (suma mixto, vuelto, formato de teléfono)
- Envía a `POST /business/orders` y redirige al dashboard
- Sin items detallados — solo monto total (correcto para pedidos por teléfono)

---

### 🟢 Menú — Lista (`/menu` → `menu/page.tsx`)

**Estado: completo y funcional.**

- Carga categorías + items + grupos de modificadores + opciones en 4 queries paralelas
- Vista mobile (scroll lineal) y desktop (rail lateral + scroll)
- Gestión de categorías en modal: crear, renombrar, reordenar (↑↓), activar/desactivar, eliminar
- Cada item muestra: foto, nombre, precio, badge "con opciones" vs "directo al carrito", opciones agotadas
- Botón "Editar" lleva a `/menu/item/[id]`

**Bug confirmado:** `itemMaxPrice()` retorna `base_price` siempre (ver bugs en Dashboard).

---

### 🟢 Menú — Editor de item (`/menu/item/[id]` → `menu/item/[id]/page.tsx`)

**Estado: completo y funcional. Es el módulo más complejo del repo.**

- Crea y edita items con: nombre, descripción, foto, categoría, precio base, badges, disponibilidad, destacado
- Grupos de modificadores completos: tipo (single/multi), obligatorio/opcional, min/max selecciones
- Opciones dentro de cada grupo: nombre, precio adicional, disponibilidad, orden (↑↓)
- Preview en tiempo real del lado del cliente (panel derecho en desktop, bottom sheet en mobile)
- Cálculo correcto de precio mínimo y máximo con modificadores
- Warning automático si el precio base es menor que la opción más barata del grupo principal
- Guardado con manejo de imagen (upload a bucket `menu-items`)
- Confirmación antes de salir con cambios no guardados (modal)
- Zona de peligro con confirmación para eliminar el item
- Elimina en cascada: opciones → junctions → grupos → item

---

### 🟢 Configuración (`/configuracion` → `configuracion/page.tsx`)

**Estado: completo y funcional.**

Secciones:

- **Datos:** nombre, teléfono, WhatsApp para pedidos (validado con `PhonePeSchema`), eslogan, color de acento (readonly — lo gestiona Tindivo), logo, banner
- **Pago Yape:** número de Yape + upload de QR (bucket `business-qrs`)
- **Tiempos y precio:** ETA mínimo/máximo, tarifa de delivery
- **Capacidades:** 4 toggles (publicar catálogo, recojo, delivery web, motorizados Tindivo) — todos `disabled`, solo lectura. El modo lo gestiona Tindivo.
- **Horario semanal:** componente `ScheduleEditor`

Navegación desktop: rail lateral con scroll-to-section. Mobile: secciones lineales.

---

### 🟢 Historial (`/historial` → `historial/page.tsx`)

**Estado: completo y funcional.**

- Historial del día actual — filtra por rango Lima UTC-5 (`00:00:00` a `23:59:59`)
- Límite: 200 pedidos
- Summary strip: ventas totales, ratio web/manual, cancelados con % del total
- Filtros: Todos / Entregados / Cancelados / Web / Manual — con contadores en cada chip
- Búsqueda por nombre de cliente o #ID
- Vista mobile (cards) y desktop (tabla con columnas: estado, cliente, origen, pago, hora, total)
- **Feature de reclamo por fraude:** modal que aparece cuando hay pedidos cancelados. Envía `POST /business/fraud-claims` con orderId, monto y motivo. Ventana de reclamo no especificada en el frontend.

---

### 🟢 Deuda (`/deuda` → `deuda/page.tsx`)

**Estado: completo y funcional.**

- Balance actual (`balance_due`) con barra de progreso hacia límite de suspensión
- Banner de cuenta suspendida si `is_blocked === true`
- Adelantos del fondo de contingencia (`contingency_advances`): monto, motivo, estado, pedido asociado
- **Disputa de adelantos:** ventana de 48h para disputar. Valida `actor_charged === 'restaurante'` y `status === 'activo'`. Envía `POST /business/contingency/:id/dispute`
- Liquidaciones semanales (`settlements`): período, cantidad de pedidos, monto, estado
- CTA de WhatsApp — número se lee de `app_settings` con key `support_whatsapp`
- Layout diferente mobile (stack vertical) vs desktop (grid 2 columnas)

**Deuda técnica:** `BLOCK_THRESHOLD = 300` hardcodeado en el frontend. Si se cambia el límite en la DB, el frontend no lo refleja automáticamente.

---

### 🟢 Efectivo (`/efectivo` → `efectivo/page.tsx`)

**Estado: completo y funcional.**

Gestiona la liquidación de efectivo entre el motorizado y el restaurante.

**Flujo:**

```
Motorizado entrega efectivo al restaurante
        │
        ▼
[pending_confirmation] — restaurante cuenta físicamente
        │
        ├─ "Confirmo" → POST /business/cash-settlements/:id/confirm → confirmed
        │
        └─ "Reportar diferencia" → ingresa monto contado + motivo
                │
                ▼
        [disputed] → Soporte Tindivo resuelve
```

- Carga `cash_settlements` ordenado por `created_at` desc, límite 50
- Realtime: suscripción a `cash_settlements` via canal `biz-cash`
- Muestra monto que el sistema espera vs. lo que el motorizado reportó
- Alerta visual si hay diferencia entre ambos montos
- Auto-confirmación después de 24h (lógica en backend, indicado en UI)
- Mobile: hero negro con total del día + cards por cierre
- Desktop: KPI strip (4 cards) + grid 2 columnas para pendientes

---

## Componentes de soporte — auditados

| Archivo                    | Estado          | Propósito                                                                                                                                          |
| -------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chrome.tsx`               | 🟢 Completo     | Contexto global: auth, realtime (canal único `biz-orders`), tick 1s, sidebar desktop, bottom nav mobile, toast de pedido nuevo, gate modo catálogo |
| `shell.tsx`                | 🟢 Completo     | `DashboardShell` (topbar mobile/desktop) + `DashboardSidebar` (stub — nav real en chrome.tsx)                                                      |
| `cards.tsx`                | 🟢 Referenciado | `NuevoCard`, `CocinaCard`, `RepartoCard` — cards del kanban                                                                                        |
| `primitives.tsx`           | 🟢 Referenciado | `MS` (Material Symbols), `soles()`, `mmss()`, badges de fuente/pago                                                                                |
| `toast.tsx`                | 🟢 Referenciado | `notifySuccess()` — toast global                                                                                                                   |
| `push-manager.tsx`         | 🟢 Completo     | Registra `/sw.js`, gestiona suscripción push. Auto-suscribe si permiso concedido; muestra botón flotante si permiso "default"                      |
| `schedule-editor.tsx`      | 🟢 Completo     | Horario semanal, hasta 2 turnos/día, detecta cruce de medianoche, upsert en `business_schedule`                                                    |
| `lib/orders/view-model.ts` | 🟢 Completo     | Mapeo `OrderRow → OrderVM`. Estados, countdown, buffer phases, sort de cocina por prioridad                                                        |
| `lib/use-audio-alert.ts`   | 🟢 Referenciado | Hook de alertas de sonido                                                                                                                          |
| `lib/api.ts`               | 🟢 Referenciado | Cliente HTTP hacia la API de Tindivo                                                                                                               |
| `lib/supabase/client.ts`   | 🟢 Referenciado | Cliente Supabase browser                                                                                                                           |

---

## Deuda técnica confirmada — tabla final

| #   | Tipo          | Archivo          | Descripción                                                           | Impacto                                                                                  |
| --- | ------------- | ---------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Bug           | `menu/page.tsx`  | `itemMaxPrice()` retorna siempre `base_price` — no suma modificadores | Precio máximo en lista del menú incorrecto cuando hay modificadores con precio adicional |
| 2   | Bug           | `app/page.tsx`   | `onCallDriver` no se incluye en el objeto `actions`                   | Botón "Llamar moto manualmente" en estado `buffer_p3` nunca aparece                      |
| 3   | Deuda técnica | `deuda/page.tsx` | `BLOCK_THRESHOLD = 300` hardcodeado                                   | Si el límite cambia en DB, el frontend no lo refleja                                     |

---

## Estado general — auditoría completa

| Módulo                         | Estado                                      |
| ------------------------------ | ------------------------------------------- |
| chrome.tsx (realtime/auth/nav) | 🟢 Completo                                 |
| Dashboard de pedidos           | 🟢 Completo — 2 bugs menores                |
| Pedido directo `/nuevo`        | 🟢 Completo                                 |
| Menú — lista                   | 🟢 Completo — bug `itemMaxPrice`            |
| Menú — editor de item          | 🟢 Completo                                 |
| Configuración                  | 🟢 Completo                                 |
| Historial                      | 🟢 Completo                                 |
| Deuda                          | 🟢 Completo — `BLOCK_THRESHOLD` hardcodeado |
| Efectivo                       | 🟢 Completo                                 |
| schedule-editor                | 🟢 Completo                                 |
| push-manager                   | 🟢 Completo                                 |

**Veredicto:** `apps/negocios` está completamente auditado. No hay módulos rotos ni flujos incompletos. Los 3 items de deuda técnica son puntuales y corregibles. El repo está listo para recibir mejoras de DB y flujo sin riesgo de sorpresas ocultas.
