# 10 · Flujo del motorizado · motorizados.tindivo.com

> PWA mobile-first del driver. Asignación automática R1-R5, transferencias, urgencia FCFS, occupancy slots, banda distancia, liquidación de efectivo. Reusa lógica del módulo `orders` del core v1.

---

## Tabla de contenidos

- [1. Premisa de diseño](#1-premisa-de-diseño)
- [2. Mapa de la PWA](#2-mapa-de-la-pwa)
- [3. Estado de disponibilidad](#3-estado-de-disponibilidad)
- [4. Tab Home · Disponibles](#4-tab-home--disponibles)
- [5. Tab Home · Activos](#5-tab-home--activos)
- [6. Tab Home · Equipo](#6-tab-home--equipo)
- [7. Flujo de un pedido end-to-end](#7-flujo-de-un-pedido-end-to-end)
- [8. Asignación R1-R5](#8-asignación-r1-r5)
- [9. Cola urgente FCFS](#9-cola-urgente-fcfs)
- [10. Transferencias con timeout-as-accept](#10-transferencias-con-timeout-as-accept)
- [11. Occupancy slots y banda distancia](#11-occupancy-slots-y-banda-distancia)
- [12. Liquidación diaria de efectivo](#12-liquidación-diaria-de-efectivo)
- [13. Historial](#13-historial)
- [14. Perfil y configuración](#14-perfil-y-configuración)

---

## 1. Premisa de diseño

El motorizado **usa la PWA con una mano mientras conduce o lleva la mochila**. Cada interacción debe ser:

- **Mínima fricción**: máximo 2 taps para acciones críticas.
- **Visible en sol**: contraste alto, textos grandes.
- **Robusta offline**: TanStack Query con persistencia, IndexedDB para outbox de acciones.
- **Vibrante**: feedback haptic + sonido en push críticos.
- **Una mano**: CTAs principales en la parte inferior (alcance del pulgar).
- **Cargar nada por demás**: la app solo descarga lo que ese driver necesita.

El driver **debe instalar la PWA en Home Screen** para que los push funcionen confiable (especialmente iOS 16.4+).

---

## 2. Mapa de la PWA

```
┌────────────────────────────────────┐
│  Carlos R. · 🛵 Disponible    ⚙   │  ← GlassTopBar
│  Mochila: 1/3                      │  ← Capacity indicator
├────────────────────────────────────┤
│  [Disponibles] [Activos] [Equipo] │  ← Tabs principales
│                                    │
│  [contenido del tab activo]        │
│                                    │
└────────────────────────────────────┘
                                       (más tabs ocultos en menú ⚙)
                                       - Efectivo
                                       - Historial
                                       - Perfil
                                       - Cerrar sesión
```

---

## 3. Estado de disponibilidad

El driver tiene un toggle "Disponible / No disponible" en el header. Solo cuando está disponible:
- Aparece en candidatos para R1-R5.
- Recibe pushes de pedidos nuevos.
- Puede aceptar / claim / transfer.

### Reglas

- Solo se puede activar dentro del horario operativo (`platform_schedule`).
- Solo se puede activar dentro del turno (`shift_start ≤ now ≤ shift_end`).
- Si intenta activar fuera de horario, mensaje: "El servicio opera {días} de {hora} a {hora}".
- Si tiene pedidos activos y desactiva, banner: "⚠ Tienes 2 pedidos activos. Sigues con ellos pero no recibirás nuevos".

### Cierre automático

Cron / Inngest `closeDriversAtShiftEnd` desactiva al final del turno. Si tenía pedidos activos, los mantiene pero no recibe nuevos.

---

## 4. Tab Home · Disponibles

Pedidos `waiting_driver` con `appears_in_queue_at <= now()` que el driver puede aceptar (R1-R5 ya lo seleccionó como candidato, o son urgentes para todos).

### Layout

```
┌────────────────────────────────────┐
│  Disponibles (3)                   │
│                                    │
│  ┌──────────────────────────┐     │
│  │ 🔴 URGENTE                │     │
│  │ ● #ABC123                 │     │
│  │ Priamo                    │     │
│  │ ~3 min · Yape · S/45      │     │
│  │ Sin asignar hace 5:30      │     │
│  │ [Reclamar]                │     │
│  └──────────────────────────┘     │
│  ┌──────────────────────────┐     │
│  │ ● #DEF456                 │     │
│  │ La Nonna                  │     │
│  │ Listo en 2 min            │     │
│  │ Yape al recibir · S/30   │     │
│  │ [Rechazar] [Aceptar]      │     │
│  └──────────────────────────┘     │
│                                    │
│  Próximos                          │
│  ┌──────────────────────────┐     │
│  │ #GHI789 · Priamo          │     │
│  │ Listo en 18 min           │     │
│  └──────────────────────────┘     │
│                                    │
│  ¿Sin pedidos? Verifica tu push... │  ← empty state guidance
└────────────────────────────────────┘
```

### Cards de estado visual

- **Verde**: `estimated_ready_at - now > 10 min` (próximo, no aceptable aún en el tab activo).
- **Amarillo**: `estimated_ready_at - now ≤ 10 min` (en ventana).
- **Rojo**: `urgent_since IS NOT NULL` (urgente).

### Acciones

- **Aceptar**: POST `/api/v1/driver/orders/{id}/accept`. Pasa a Activos. Optimistic NO (race condition con otros drivers).
- **Rechazar**: modal con razón opcional. POST `/api/v1/driver/orders/{id}/reject` (con Idempotency-Key). El pedido entra a cola urgente.
- **Reclamar (urgente)**: POST `/api/v1/driver/orders/{id}/claim`. FCFS, primer driver gana. Optimistic NO.

### Empty state

Si el driver está disponible pero no hay pedidos:

```
┌──────────────────────────┐
│ No hay pedidos por ahora │
│                          │
│ Cuando llegue uno, lo    │
│ verás aquí y recibirás   │
│ una notificación.        │
│                          │
│ ¿No recibes pushes?      │
│ [Revisar config]         │
└──────────────────────────┘
```

---

## 5. Tab Home · Activos

Pedidos del driver en estados `heading_to_restaurant`, `waiting_at_restaurant`, `picked_up`.

### Layout

```
┌────────────────────────────────────┐
│  Activos (2)                       │
│                                    │
│  ┌──────────────────────────┐     │
│  │ ● Priamo · #ABC123        │     │
│  │ heading_to_restaurant     │     │
│  │ Listo en 3 min            │     │
│  │ Cliente: María P.         │     │
│  │ Av. Industrial 23         │     │
│  │ S/45 · Yape al recibir    │     │
│  └──────────────────────────┘     │
│  ┌──────────────────────────┐     │
│  │ ● La Nonna · #DEF456      │     │
│  │ picked_up                 │     │
│  │ Yendo al cliente          │     │
│  └──────────────────────────┘     │
│                                    │
│  Mochila: 2/3                      │
└────────────────────────────────────┘
```

Tap en una card → detalle del pedido con acciones específicas por estado.

---

## 6. Tab Home · Equipo

Pedidos activos de compañeros (drivers autorizados para los mismos negocios). Útil cuando el driver termina una entrega cerca del local donde A todavía está esperando.

### Layout

```
┌────────────────────────────────────┐
│  Equipo                            │
│                                    │
│  Tu equipo en turno (2)            │
│  • Juan M. · 2/3 mochila           │
│  • Ana L. · 1/3 mochila            │
│                                    │
│  Pedidos activos del equipo (3)    │
│  ┌──────────────────────────┐     │
│  │ Juan M. tiene             │     │
│  │ Priamo · #ABC123          │     │
│  │ waiting_at_restaurant      │     │
│  │ Llegó hace 2 min          │     │
│  │ [Pedir pedido]            │     │
│  └──────────────────────────┘     │
│  ...                               │
│                                    │
│  Solicitudes recibidas (1)         │
│  ┌──────────────────────────┐     │
│  │ Ana L. quiere tu         │     │
│  │ #DEF456                   │     │
│  │ ⏱ 0:22 para responder    │     │
│  │ [Rechazar] [Aceptar]      │     │
│  └──────────────────────────┘     │
└────────────────────────────────────┘
```

---

## 7. Flujo de un pedido end-to-end

### Estado: `waiting_driver` → `heading_to_restaurant`

Driver acepta (manual o auto-asignación). Recibe push: *"Te asignaron un pedido"*.

**Pantalla detalle**:

```
┌────────────────────────────────────┐
│ ← #ABC123 · Priamo                 │
│                                    │
│  Yendo al restaurante              │
│                                    │
│  ┌──────────────────────────┐     │
│  │ Restaurante               │     │
│  │ Priamo                    │     │
│  │ Jr. Bolognesi 245         │     │
│  │ [📍 Cómo llegar]          │     │
│  └──────────────────────────┘     │
│                                    │
│  Listo en 5 min                    │
│                                    │
│  Cliente                           │
│  María P. · +51 987654321          │
│  Av. Industrial 23                 │
│  Ref: Casa azul, portón rojo       │
│                                    │
│  Pago · Yape al recibir            │
│  Total · S/ 45.00                  │
│                                    │
│  ┌──────────────────────────┐     │
│  │ He llegado al restaurante │     │
│  └──────────────────────────┘     │
└────────────────────────────────────┘
```

Tap "He llegado" → POST `/api/v1/driver/orders/{id}/arrived`. Estado → `waiting_at_restaurant`. Push al negocio.

### Estado: `waiting_at_restaurant` → `picked_up`

Driver llegó al local. Espera el pedido. Cuando lo recibe, marca recogida con datos.

**Pantalla**:

```
┌────────────────────────────────────┐
│ ← #ABC123                          │
│                                    │
│  Esperando el pedido en Priamo     │
│  Llegaste hace 2 min               │
│                                    │
│  ┌──────────────────────────┐     │
│  │ ¿Ya tienes el pedido?     │     │
│  │ [Recoger pedido]          │     │
│  └──────────────────────────┘     │
│                                    │
│  Datos del cliente                 │
│  María P. · +51 987654321          │
│  Av. Industrial 23                 │
└────────────────────────────────────┘
```

Tap "Recoger pedido" → modal/sheet de captura:

```
┌────────────────────────────────────┐
│ Recoger pedido                [X]  │
│                                    │
│  Mochila — ¿cuántos slots ocupa?   │
│  [1] [●2] [3]                      │  ← OccupancySelector
│                                    │
│  Distancia al cliente              │
│  [● Cerca] [○ Media] [○ Lejos]    │  ← DistanceBandSelector
│                                    │
│  Datos del cliente (verifica)      │
│  ┌──────────────────────────┐     │
│  │ +51 987654321             │     │
│  └──────────────────────────┘     │
│  ┌──────────────────────────┐     │
│  │ Av. Industrial 23         │     │
│  │ Casa azul, portón rojo    │     │
│  └──────────────────────────┘     │
│                                    │
│  [Confirmar recogida]              │
└────────────────────────────────────┘
```

POST `/api/v1/driver/orders/{id}/picked-up` con `{ occupancy_slots, delivery_distance_band, customer_phone, delivery_address }`.

Estado → `picked_up`. Tindivo genera tracking_link automático. Push al cliente "Tu pedido salió".

### Estado: `picked_up` → `delivered`

Pantalla con info del cliente + QR de Yape del negocio (si aplica). Mapa con ruta a destino.

```
┌────────────────────────────────────┐
│ ← #ABC123                          │
│                                    │
│  Camino al cliente                 │
│                                    │
│  María P. · +51 987654321          │
│  Av. Industrial 23                 │
│  Ref: Casa azul, portón rojo       │
│  [📞 Llamar]  [🗺️ Cómo llegar]   │
│                                    │
│  Pago · Yape al recibir            │
│  Total · S/ 45.00                  │
│                                    │
│  ┌──────────────────────────┐     │
│  │ [QR Yape de Priamo]      │     │  ← YapeQrCard
│  │ Número: 987 654 321       │     │
│  │ Monto exacto: S/ 45.00    │     │
│  └──────────────────────────┘     │
│                                    │
│  [Cambiar método de pago]          │
│                                    │
│  ┌──────────────────────────┐     │
│  │ Marcar como entregado     │     │
│  └──────────────────────────┘     │
└────────────────────────────────────┘
```

Si el método cambia (cliente decide pagar efectivo en lugar de Yape):

```
┌────────────────────────────────────┐
│ Cambiar método de pago        [X]  │
│                                    │
│  Método real al entregar           │
│  [○ Yape al recibir]               │
│  [● Efectivo]                      │
│  [○ Yape + Efectivo (mixto)]       │
│                                    │
│  Cliente paga con                  │
│  S/ [50.00]                        │
│                                    │
│  Vuelto a preparar                 │
│  S/ 5.00                           │
│  🛍 Mételo en la bolsa antes de    │
│    que llegue al cliente.          │
│                                    │
│  [Guardar]                         │
└────────────────────────────────────┘
```

PATCH `/api/v1/driver/orders/{id}/payment-method`.

Cuando entrega, tap "Marcar como entregado" → modal final:

```
┌────────────────────────────────────┐
│ Confirmar entrega             [X]  │
│                                    │
│  #ABC123 · S/ 45.00                │
│                                    │
│  Pago final · Yape al recibir      │
│  ☐ Cliente pagó                    │
│                                    │
│  Notas (opcional)                  │
│  [_____________________]            │
│                                    │
│  [Confirmar]                       │
└────────────────────────────────────┘
```

POST `/api/v1/driver/orders/{id}/delivered`. Estado → `delivered`. Push al cliente "Pedido entregado". Push al negocio.

---

## 8. Asignación R1-R5

Sistema de reglas para auto-asignación. Implementado en `packages/core/src/modules/orders/domain/policies/driver-assignment.policy.ts` (reusable del v1).

### Orden estricto

| Regla | Lo que evalúa |
|---|---|
| **R1** Grouping | ¿Hay driver con pedido activo del MISMO negocio en últimos 5 min? Si sí, dárselo a él (ahorra trayecto) |
| **R2** Capacidad restaurante | Excluir drivers que ya tienen 2 negocios distintos en mochila |
| **R3** Capacidad mochila | Excluir drivers con `activeSlots + reservedSlots + incomingSlots > maxOrdersPerDriver` (default 3) |
| **R4** Rotación least-loaded | Entre candidatos que pasaron R2+R3, gana el menos cargado: `delivered + active + reserved + cancelled + rejected` del día |
| **R5** Cola FCFS | Si ningún driver califica, pedido queda sin asignar en `waiting_driver`. Tras 5 min en cola → urgente |

### Autorización por negocio

Adicional a R1-R5, cada driver tiene `driver_restaurants` (M:N) que define qué negocios puede atender. No autorizado → no candidato.

### Tiebreaks en R4

1. Menor `shift_started_at` (driver más fresco en su turno gana).
2. Driver ID ascendente (determinístico).

### Trigger reactivo

Cuando un pedido entra a `waiting_driver` con `appears_in_queue_at <= now()`:
- Trigger Postgres `trg_orders_reactive_assign_aiu` invoca endpoint `/internal/orders/assign-one` vía pg_net.
- Endpoint llama a `AutoAssignOrderUseCase` → asigna y publica `OrderAssigned`.
- Si no hay candidatos, queda esperando. Failsafe cron retoma cada 5 min.

---

## 9. Cola urgente FCFS

### Cuándo

- Un pedido lleva > 5 min en `waiting_driver` sin asignación.
- Un driver rechaza una asignación → ese pedido pasa a urgente.

### Mecanismo

1. `urgent_since = now()` en `orders`.
2. R1-R5 dejan de aplicar a ese pedido.
3. Aparece en bandeja "Disponibles" de TODOS los drivers autorizados con styling rojo + glow + "URGENTE".
4. Push crítico (`OrderOverdue` o `OrderMarkedUrgent`) a todos.
5. Primer driver que tap "Reclamar" gana → RPC `claim_urgent_order` (UPDATE atómico con WHERE driver_id IS NULL para garantizar uno solo).

### UI del driver perdedor

Si dos drivers tap "Reclamar" casi simultáneo, el segundo recibe 409 → toast: *"Este pedido ya fue tomado por otro motorizado"*. La card desaparece de su bandeja.

---

## 10. Transferencias con timeout-as-accept

### Caso de uso

Driver B termina entrega cerca del local de Priamo. Driver A todavía está esperando ahí. B pide a A: "pásame el pedido de Priamo".

### Flujo

1. **B abre tab Equipo** y ve pedidos activos de A (filtrados a aquellos para los que B está autorizado).
2. **B tap "Pedir pedido"** en una card. Validación inmediata:
   - B no es el dueño actual.
   - B tiene capacidad (slots disponibles).
   - B está autorizado para ese negocio.
3. Se crea `order_transfer_requests` con `status='pending'`, TTL 30s.
4. **A recibe push**: *"{B} quiere tu #ABC123 · 30s para responder"*.
5. A tiene 3 opciones:
   - **Aceptar** → POST `/transfer-requests/{id}/accept`. Pedido pasa a B.
   - **Rechazar** → POST `/transfer-requests/{id}/reject`.
   - **No responder en 30s** → **timeout-as-accept**: Inngest `processTransferTimeout` despierta, revalida que B sigue siendo elegible (R3 capacidad), y si sí, transfiere automático. Si no, marca `expired` (no transfiere).
6. Si A aceptó manual otra solicitud (de un C) entre el momento que B pidió y los 30s vencieron, la solicitud de B se invalida.

### Reglas

- Una solicitud pendiente bloquea duplicadas del mismo B para el mismo pedido (UNIQUE constraint).
- B puede cancelar su propia solicitud antes de los 30s.
- Push diferenciado por kind=from / to para `OrderTransferAutoAccepted` (ver `11-notificaciones-push.md` §7.1).

---

## 11. Occupancy slots y banda distancia

### Slots de mochila

Cada pedido ocupa 1-3 slots. Declarado por el driver al `picked_up`.

- 1 slot: bolsa pequeña, una comida.
- 2 slots: bolsa mediana, dos personas.
- 3 slots: pedido grande, familiar.

**Capacidad total**: 3 slots (`maxOrdersPerDriver` configurable). Un driver con un pedido de 3 slots ya está al límite — no recibirá más asignaciones.

**Indicador en UI**: chip "Mochila X/3" en top bar siempre visible.

### Banda de distancia

Declarado en `picked_up` por el driver:

- **Cerca**: < ~5 cuadras / mismo barrio.
- **Media**: 5-15 cuadras / barrio adyacente.
- **Lejos**: > 15 cuadras / barrios remotos.

**Importante**: es declarativo, no calculado por coordenadas. Aunque el sistema tenga lat/lng del cliente, NO se computa. La banda es lo que el driver dice — basado en su conocimiento del pueblo, calles cortadas, tráfico.

**Efecto**: afecta la comisión que se cobra al negocio (S/3 / S/3.25 / S/3.50). Ver `12-billing-y-liquidaciones.md`.

---

## 12. Liquidación diaria de efectivo

Ruta `/efectivo`.

### Resumen del día

```
┌────────────────────────────────────┐
│ ←  Efectivo del día                │
│                                    │
│  Total a entregar                  │
│  S/ 287.00                         │
│                                    │
│  Por restaurante                   │
│  ┌──────────────────────────┐     │
│  │ Priamo                    │     │
│  │ S/ 87.00 · 3 pedidos      │     │
│  │ [Entregar efectivo]       │     │
│  └──────────────────────────┘     │
│  ┌──────────────────────────┐     │
│  │ La Nonna                  │     │
│  │ S/ 200.00 · 5 pedidos     │     │
│  │ [Entregar efectivo]       │     │
│  └──────────────────────────┘     │
│                                    │
│  Pendientes de confirmación        │
│  ┌──────────────────────────┐     │
│  │ Priamo · S/ 87.00         │     │
│  │ Entregado hace 5 min      │     │
│  │ Esperando confirmación    │     │
│  └──────────────────────────┘     │
└────────────────────────────────────┘
```

### Entregar efectivo

Tap en "Entregar efectivo" → modal:

```
┌────────────────────────────────────┐
│ Entregar a Priamo            [X]   │
│                                    │
│  3 pedidos cash entregados         │
│  Total calculado: S/ 87.00         │
│                                    │
│  Monto a entregar                  │
│  S/ [87.00]                        │  ← editable (puede ajustar)
│                                    │
│  ⚠ El cajero contará el efectivo  │
│    y confirmará. Si hay            │
│    diferencia, NO discutas en el   │
│    local. Tindivo resolverá.       │
│                                    │
│  [Confirmar entrega]               │
└────────────────────────────────────┘
```

POST `/api/v1/driver/cash-settlements/{businessId}/deliver` con monto.

### Push de confirmación / disputa

Cuando el negocio confirma, push al driver: *"Priamo confirmó S/ 87.00"*. ✓

Si reporta diferencia, push: *"Disputa: Priamo reportó S/ 82.00"*. ⚠ Pasa a admin.

---

## 13. Historial

Ruta `/historial`. Lista de pedidos entregados con filtros:

- Hoy / Esta semana / Este mes / Rango personalizado.
- Estado (entregados / cancelados).
- Negocio.

Tap → detalle solo lectura.

---

## 14. Perfil y configuración

Ruta `/perfil`.

```
┌────────────────────────────────────┐
│ ←  Mi perfil                       │
│                                    │
│  Carlos R.                         │
│  +51 999111222                     │
│  🛵 Moto · ABC-123                 │
│                                    │
│  Turno                             │
│  Mar-Sáb · 6 PM – 11 PM            │
│                                    │
│  Negocios autorizados (3)          │
│  • Priamo                          │
│  • La Nonna                        │
│  • La Florencia                    │
│                                    │
│  Notificaciones                    │
│  ✓ Push habilitadas                │
│  ⚠ Optimización batería: activa    │  ← warning si detecta
│    [Cómo desactivar]               │
│                                    │
│  ¿Algún problema?                  │
│  Tindivo · +51 987654321           │
│                                    │
│  [Cerrar sesión]                   │
└────────────────────────────────────┘
```

### Onboarding de push

En primer login (o si detecta push no habilitados):

```
┌────────────────────────────────────┐
│  Activa las notificaciones         │
│                                    │
│  Cuando llegue un pedido, te       │
│  alertaremos al instante.          │
│                                    │
│  Sin notificaciones es muy fácil   │
│  perder pedidos.                   │
│                                    │
│  [Activar ahora]                   │
└────────────────────────────────────┘
```

Si denegado, banner persistente con tutorial.

### Detección de battery optimization (Android)

```js
// En el SW o app
if (/Android/.test(navigator.userAgent) && Notification.permission === 'granted') {
  // Mostrar banner instructivo
  // "Para que Tindivo te avise sin retraso, desactiva la optimización
  //  de batería en Configuración → Apps → Tindivo Motorizados → Batería"
}
```

---

**Resumen**: `motorizados.tindivo.com` es mobile-first 1:1. Tabs Disponibles / Activos / Equipo. R1-R5 con autorización por negocio. Cola urgente FCFS post-5min. Transferencias con timeout-as-accept 30s. Occupancy slots + banda distancia declarativos. Liquidación diaria de efectivo por negocio con confirmación o disputa. Push críticos con `requireInteraction + vibrate`. Instalación PWA obligatoria. Detección de battery optimization.

**Próximo doc**: `08-flujo-admin.md` — sala de control operativa.
