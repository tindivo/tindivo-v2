# 08 · Flujo del admin · admin.tindivo.com

> Sala de control operativa en vivo. No es un panel administrativo tradicional. Es donde una persona observa toda la operación, previene problemas y resuelve emergencias mientras los negocios crean pedidos y los motorizados los ejecutan.

---

## Tabla de contenidos

- [1. Tres principios del diseño](#1-tres-principios-del-diseño)
- [2. Contexto de uso real](#2-contexto-de-uso-real)
- [3. Mapa de navegación](#3-mapa-de-navegación)
- [4. Sección · Dashboard](#4-sección--dashboard)
- [5. Sección · Métricas](#5-sección--métricas)
- [6. Sección · Pedidos](#6-sección--pedidos)
- [7. Sección · Envío de tracking](#7-sección--envío-de-tracking)
- [8. Sección · Negocios (restaurants)](#8-sección--negocios-restaurants)
- [9. Sección · Catálogos públicos](#9-sección--catálogos-públicos)
- [10. Sección · Motorizados](#10-sección--motorizados)
- [11. Sección · Cobros](#11-sección--cobros)
- [12. Sección · Disputas de efectivo](#12-sección--disputas-de-efectivo)
- [13. Sección · Auditoría](#13-sección--auditoría)
- [14. Sección · Configuración](#14-sección--configuración)

---

## 1. Tres principios del diseño

1. **Visibilidad radical.** El admin no debe "buscar" lo que está mal. Lo que está mal **grita solo** (alertas grandes, color rojo, ubicación destacada).

2. **Intervención con fricción controlada.** Las acciones del admin son poderosas pero irreversibles. Cada una requiere confirmación con razón obligatoria y deja rastro inmutable.

3. **Inmutabilidad del historial.** Nada que ya ocurrió se edita. Solo se cancela lo que está en curso. Pedidos entregados, liquidaciones pagadas, timestamps — son piedra. Si hay error, se documenta con nota, no se reescribe.

---

## 2. Contexto de uso real

- El admin tiene el panel **abierto durante todo el horario operativo**.
- Lo consulta periódicamente — no mira la pantalla los 5 minutos siguientes a cada cambio. Está haciendo otras cosas (cenando, viendo TV, atendiendo otro asunto).
- Funciona en PC para vigilancia detallada Y en celular para emergencias fuera de casa.
- Cuando aparece una emergencia (driver no responde, diferencia de efectivo), el admin debe **resolver rápido**.
- En MVP es **una sola persona** (el fundador).

---

## 3. Mapa de navegación

Sidebar lateral en desktop, drawer hamburguesa en mobile.

| # | Sección | Icono | Ruta | Propósito |
|---|---|---|---|---|
| 1 | Dashboard | `dashboard` | `/admin` | Vista de comando con KPIs + monitor en vivo + pedidos activos |
| 2 | Métricas | `analytics` | `/admin/metricas` | Análisis temporal multi-tab |
| 3 | Pedidos | `receipt_long` | `/admin/pedidos` | Buscar/filtrar/ver detalle de todos los pedidos |
| 4 | Envío tracking | `chat` | `/admin/tracking` | Pedidos `picked_up` sin link enviado al cliente |
| 5 | Negocios | `storefront` | `/admin/negocios` | CRUD de negocios + bloquear/desbloquear |
| 6 | Catálogos | `restaurant_menu` | `/admin/catalogos` | Gestión de menús públicos (admin puede editar como dueño) |
| 7 | Motorizados | `two_wheeler` | `/admin/drivers` | CRUD de drivers + activar/desactivar + autorización |
| 8 | Cobros | `payments` | `/admin/cobros` | Liquidaciones semanales |
| 9 | Disputas | `gavel` | `/admin/disputas` | Resolución de diferencias de efectivo |
| 10 | Auditoría | `fact_check` | `/admin/auditoria` | Log inmutable de eventos del sistema |
| 11 | Configuración | `settings` | `/admin/configuracion` | Horario, reglas asignación, soporte |

**Header global**: Logo "TINDIVO Admin" izquierda · estado del servicio (verde/rojo) · campana de alertas con badge contador · botón "Cerrar sesión" derecha.

---

## 4. Sección · Dashboard

### Vista comando

```
┌────────────────────────────────────────────────────────┐
│ TINDIVO Admin · 🟢 Servicio activo  🔔 2  Cerrar ses. │
├────────────────────────────────────────────────────────┤
│ [📊 Dashboard] [📈 Métricas] [🛍 Pedidos] [💬 Tracking]│
│ [🏪 Negocios] [📋 Catálogos] [🛵 Motorizados] [💰 Co..│
├────────────────────────────────────────────────────────┤
│                                                        │
│  KPIs del día                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │ 32   │ │ 2    │ │ S/960│ │ S/96 │                  │
│  │Pedid │ │Cancel│ │ GMV  │ │Comis │                  │
│  └──────┘ └──────┘ └──────┘ └──────┘                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │S/30  │ │28 min│ │ 100% │ │S/180 │                  │
│  │Tcket │ │Tprom │ │A time│ │Cash  │                  │
│  └──────┘ └──────┘ └──────┘ └──────┘                  │
│                                                        │
│  Monitor en vivo                                       │
│  ┌──────────────────┐ ┌──────────────────┐            │
│  │ 3                │ │ 5                │            │
│  │ Esperando driver │ │ En camino local  │            │
│  └──────────────────┘ └──────────────────┘            │
│  ┌──────────────────┐ ┌──────────────────┐            │
│  │ 4                │ │ 2 →             │            │
│  │ En entrega       │ │ Por enviar trk  │            │
│  └──────────────────┘ └──────────────────┘            │
│                                                        │
│  Pedidos activos (14)                                  │
│  🔴 #ABC123 URGENTE · Priamo · sin asignar 6:00 →     │
│  🟡 #DEF456 · La Nonna · listo en 3 min · Carlos R.  →│
│  🟢 #GHI789 · La Florencia · listo en 22 min →       │
│  ...                                                   │
│                                                        │
│  Por restaurante hoy                                   │
│  Priamo: 18 (15 entreg · 3 cancel) · S/540 · S/54     │
│  La Nonna: 10 (10 entreg) · S/350 · S/30              │
│  ...                                                   │
│                                                        │
│  Por motorizado hoy                                    │
│  Carlos R.: 12 entregas · 1 en curso · S/360 GMV      │
│  Juan M.: 8 entregas · 2 en curso · S/240 GMV         │
└────────────────────────────────────────────────────────┘
```

### KPIs del día (8 cards)

1. **Pedidos del día** (total + breakdown "X entregados · Y en curso")
2. **Cancelados** (total + % del total)
3. **GMV** (suma `order_amount` de delivered, en PEN)
4. **Comisión Tindivo** (suma `tindivo_commission` de delivered)
5. **Ticket promedio** (GMV / pedidos entregados)
6. **Tiempo promedio** (created_at → delivered_at, en minutos)
7. **A tiempo** (% de pedidos no overdue, ej. "100% — 0 overdue de 32")
8. **Efectivo en circulación** (suma de cash entregados no liquidados)

### Monitor en vivo (4 cards)

- **Esperando motorizado** (`waiting_driver`)
- **En camino al local** (`heading_to_restaurant`)
- **En entrega** (`picked_up`)
- **Por enviar tracking** (link clickeable a `/tracking`)

Actualizados en realtime (Supabase Realtime + invalidación TanStack Query).

### Alertas

Campana en header con badge. Lista de alertas no resueltas:
- Disputa de efectivo
- Driver con pedidos activos que se desconectó
- Pedido urgente sin asignar > 8 min (caso extremo)
- Suscripción push masivamente fallida

Cada alerta tiene CTA "Ir a..." que lleva al lugar correspondiente.

### Lista pedidos activos

Ordenada por urgencia (urgentes primero, luego por tiempo restante ascendente). Cada card es clickeable → detalle.

---

## 5. Sección · Métricas

Selector de rango temporal (hoy / ayer / 7 días / 30 días / rango personalizado).

### 6 sub-tabs

1. **Ventas** — Serie temporal GMV + comisión. Line chart.
2. **Demanda** — Heatmap por zona × hora (qué barrios piden cuándo). Solo si hay coordenadas (post-MVP completo).
3. **Motorizados** — Tabla por driver: entregas, tiempo prom, rejection rate, ocupación.
4. **Negocios** — Tabla por negocio: pedidos, ticket prom, tasa cancelación, uso de prórroga.
5. **Funnel operativo** — Conversión creados → aceptados → entregados, drop-off por etapa.
6. **Razones de cancelación** — Desglose por motivo + autor (negocio / admin / sistema).

### Export CSV

Cada tab tiene botón "Exportar CSV" con todos los campos relevantes en español.

---

## 6. Sección · Pedidos

### Lista con filtros

- Estado
- Negocio
- Driver
- Rango de fechas
- Método de pago
- Texto libre (shortId o teléfono del cliente)

Tabla paginada 50/pág, columnas: shortId · negocio · driver · estado · creado · entregado · monto · método.

### Detalle de pedido (inmutable)

```
┌────────────────────────────────────────────────────────┐
│ ← #ABC123                                              │
│                                                        │
│  Datos                                                 │
│  shortId: ABC12345                                     │
│  Negocio: Priamo                                       │
│  Driver: Carlos R.                                     │
│  Cliente: María P. · +51 987654321                    │
│  Dirección: Av. Industrial 23 · Ref: Casa azul        │
│  Monto: S/ 45.00 · Delivery S/ 2.00                   │
│  Método pago: Yape al recibir (real: Efectivo)        │
│  Banda distancia: Cerca · 1 slot                       │
│                                                        │
│  Línea de tiempo                                       │
│  ✓ Creado (Priamo) · 19:00:12                          │
│  ✓ Aceptado · 19:00:45                                 │
│  ✓ Driver asignado: Carlos R. · 19:05:23 (R1)          │
│  ✓ Heading · 19:05:30                                  │
│  ✓ Llegó al local · 19:18:11                           │
│  ✓ Recogido (1 slot · Cerca) · 19:22:08                │
│  ✓ Entregado · 19:35:42                                │
│  ✓ Tracking enviado al cliente · 19:23 (Admin)         │
│                                                        │
│  Pago                                                  │
│  Snapshot creación: pending_yape                       │
│  Real al entregar: pending_cash                        │
│  Vuelto a dar: S/ 5.00                                 │
│                                                        │
│  Tracking público: https://tindivo.com/pedidos/ABC...  │
│  [📋 Copiar link]                                      │
│                                                        │
│  Acciones                                              │
│  [Cancelar pedido]                                     │
│  [Reasignar a otro driver]                             │
│  [Corregir teléfono cliente]  (waiting/heading)        │
└────────────────────────────────────────────────────────┘
```

### Acciones del admin

Cada acción requiere **razón obligatoria** y queda en line de tiempo + audit log.

- **Cancelar**: en cualquier estado activo. Modal con advertencia extra si `picked_up`.
- **Reasignar**: solo si hay otro driver disponible y autorizado.
- **Corregir teléfono cliente**: solo en `waiting_driver` o `heading_to_restaurant`.
- **Marcar tracking enviado**: tap explícito en `/tracking`.

---

## 7. Sección · Envío de tracking

### Lista

Pedidos en `picked_up` sin `tracking_link_sent_at`, ordenados por más recientes.

```
┌────────────────────────────────────────────────────────┐
│ Envío de tracking pendiente                            │
│                                                        │
│ ┌────────────────────────────────────────────────┐    │
│ │ #ABC123 · Priamo                               │    │
│ │ Driver: Carlos R. · Recogido hace 3 min        │    │
│ │ Cliente: María P. · +51 987654321              │    │
│ │                                                 │    │
│ │ [📋 Copiar link]  [✓ Marcar como enviado]      │    │
│ └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

### Flujo

1. Admin tap **Copiar link** → portapapeles con `https://tindivo.com/pedidos/ABC12345`.
2. Pega el link en WhatsApp del cliente (manual fuera del sistema).
3. Admin tap **Marcar como enviado** → registra timestamp + admin que lo marcó.
4. El pedido sale de la lista.

### Tab "Enviados"

Filtro de pedidos con tracking ya enviado. Para auditoría.

---

## 8. Sección · Negocios (restaurants)

### Lista

Tabla: nombre · estado · color (dot) · deuda actual · pedidos del día · capacidad primaria.

Filtros: estado · texto.

### Detalle del negocio

```
┌────────────────────────────────────────────────────────┐
│ ← Priamo                                               │
│                                                        │
│  ● Activo · #F97316 (Naranja)                          │
│                                                        │
│  Datos                                                 │
│  Nombre: Priamo                                        │
│  Tel: +51 999 888 777                                  │
│  Dirección: Jr. Bolognesi 245                          │
│  Email login: priamo@gmail.com                         │
│  Yape: +51 987 654 321                                 │
│  QR: [ver imagen]                                       │
│                                                        │
│  Capacidades (override del owner)                      │
│  ☑ Publica catálogo                                    │
│  ☑ Acepta pedidos online                               │
│  ☑ Usa motorizados Tindivo                             │
│  Modo: full_delivery                                   │
│                                                        │
│  Operativo                                             │
│  ETA: 25-35 min · Delivery fee al cliente: S/ 2.00     │
│  Comisión override: ninguno (usa default)              │
│                                                        │
│  Cobros                                                │
│  Deuda actual: S/ 23.00                                │
│  Último pago: 18 may · S/ 47                           │
│  [Ver historial completo →]                            │
│                                                        │
│  Hoy                                                   │
│  18 pedidos · 15 entregados · 3 cancelados             │
│                                                        │
│  Acciones                                              │
│  [Editar] [Bloquear] [Reset password]                  │
└────────────────────────────────────────────────────────┘
```

### Crear negocio

Modal/page con todos los campos:
- Nombre, teléfono, dirección
- Email (login) + password temporal
- Color de acento (paleta con validación de unicidad)
- Yape (número + QR upload opcional)
- Capacidades iniciales (checkboxes)
- ETA min-max
- Delivery fee al cliente
- Comisión override (opcional)

Al crear:
1. Supabase Auth crea user.
2. Trigger sync crea `users` con `primary_role='business'`.
3. INSERT en `businesses`.
4. Toast con credenciales para entregar al cajero.

### Bloquear / desbloquear

```
┌────────────────────────────────────┐
│ Bloquear Priamo                    │
│                                    │
│  ⚠ Bloquear suspende:              │
│  • No puede crear pedidos          │
│  • Su catálogo se oculta de        │
│    tindivo.com                     │
│  • Conserva su data y deuda        │
│                                    │
│  Razón obligatoria                 │
│  ┌──────────────────────────┐     │
│  │ Deuda vencida S/ 100      │     │
│  └──────────────────────────┘     │
│                                    │
│  [Cancelar] [Bloquear]             │
└────────────────────────────────────┘
```

POST `/api/v1/admin/businesses/{id}/block` con razón.

---

## 9. Sección · Catálogos públicos

El admin puede gestionar el menú de cualquier negocio como si fuera el dueño. Útil para soporte: el negocio llama "no entiendo cómo subir mi pizza", el admin lo hace por ellos.

UI idéntica al editor del negocio (ver `09-flujo-negocios.md` §9), pero con selector de negocio en el header.

---

## 10. Sección · Motorizados

### Lista

Tabla: nombre · estado · disponibilidad live · vehículo · entregados hoy · push configurado.

### Crear driver

Modal con:
- Nombre completo, teléfono
- Tipo de vehículo (moto/bici/pie/auto)
- Placa (opcional)
- Días asignados (multi-select lun-dom)
- Horario turno (start + end)
- Email + password
- Negocios autorizados (multi-select de negocios activos)

### Detalle del driver

```
┌────────────────────────────────────────────────────────┐
│ ← Carlos Ramírez                                       │
│                                                        │
│  Perfil                                                │
│  +51 999 111 222 · 🛵 Moto · ABC-123                  │
│  Turno: Mar-Sáb · 6 PM – 11 PM                         │
│  Email login: carlos@gmail.com                         │
│                                                        │
│  Estado                                                │
│  ✓ Activo                                              │
│  ✓ Disponible ahora                                    │
│  ✓ Push notifications configuradas                     │
│  Mochila: 1/3                                          │
│                                                        │
│  Negocios autorizados                                  │
│  ☑ Priamo  ☑ La Nonna  ☑ La Florencia                 │
│  [Editar autorizaciones]                               │
│                                                        │
│  Hoy                                                   │
│  12 entregados · 1 en curso · 0 rechazados             │
│  Tiempo prom. entrega: 28 min                          │
│                                                        │
│  Acciones                                              │
│  [Editar] [Desactivar] [Reset password]                │
└────────────────────────────────────────────────────────┘
```

### Desactivar driver

Si tiene pedidos activos → modal: *"Carlos R. tiene 2 pedidos activos. Debes reasignarlos o cancelarlos primero."* con CTAs.

### Push no configurado

Si `hasPushSubscription = false` y está disponible → alerta en dashboard: *"⚠ Carlos R. está disponible pero no tiene push notifications. No recibirá pedidos al instante."*

---

## 11. Sección · Cobros

### Vista principal

```
┌────────────────────────────────────────────────────────┐
│ Cobros · Liquidaciones semanales                       │
│                                                        │
│ ┌──────────────────────────────────────────┐          │
│ │ Deuda total acumulada: S/ 287.00        │          │
│ │ Negocios con deuda: 3                    │          │
│ └──────────────────────────────────────────┘          │
│                                                        │
│ [+ Generar liquidaciones de la semana]                 │
│                                                        │
│ Filtros: [Con deuda] [Vencidos] [Pagados] [Todos]     │
│                                                        │
│ Negocio          Deuda  Última liq.    Próx. vence    │
│ Priamo           S/97   12-18 may pag  -              │
│ La Nonna         S/35   12-18 may pag  -              │
│ La Florencia     S/155  5-11 may VENC  Hoy             │
│ ...                                                    │
└────────────────────────────────────────────────────────┘
```

### Generar liquidaciones (lunes 10am)

1. Admin tap "Generar liquidaciones de la semana".
2. Sistema calcula período (lun-dom anterior).
3. Preview por negocio:

```
┌────────────────────────────────────┐
│ Preview · 13-19 mayo               │
│                                    │
│ ☑ Priamo · 32 pedidos · S/96       │
│   Vence: vie 24 may                │
│ ☑ La Nonna · 18 pedidos · S/54     │
│   Vence: vie 24 may                │
│ ☐ La Florencia · 2 pedidos · S/6   │
│   (excluir por pocos pedidos)      │
│                                    │
│ Total: S/ 150.00                   │
│                                    │
│ [Cancelar] [Confirmar y crear]     │
└────────────────────────────────────┘
```

Admin puede:
- Excluir negocios (toggle).
- Editar fecha de vencimiento individual.
- Confirmar → crea `settlements` con `status='pending'`.

### Marcar como pagado

Card de liquidación pendiente → botón "Marcar como pagado":

```
┌────────────────────────────────────┐
│ Marcar pagado · Priamo S/96        │
│                                    │
│  Método                            │
│  ○ Yape  ● Transferencia  ○ Cash  │
│                                    │
│  Nota (opcional)                   │
│  ┌──────────────────────────┐     │
│  │ Yape recibido 22 may      │     │
│  └──────────────────────────┘     │
│                                    │
│  [Cancelar] [Marcar pagado]        │
└────────────────────────────────────┘
```

POST `/api/v1/admin/settlements/{id}/mark-paid`. Si el negocio estaba bloqueado por mora, trigger BD desbloquea automático. Push al negocio.

### Historial de pagos

Tab `/admin/cobros/pagos`: lista de `restaurant_payments` con filtros y CSV export.

---

## 12. Sección · Disputas de efectivo

### Lista

Cash settlements con `status='disputed'`. Ordenadas por antigüedad (más viejas primero).

```
┌────────────────────────────────────────────────────────┐
│ Disputas pendientes (1)                                │
│                                                        │
│ ┌──────────────────────────────────────────┐          │
│ │ ⚠ Priamo vs Carlos R. · 22 may           │          │
│ │                                          │          │
│ │ Driver dice: S/ 87                       │          │
│ │ Negocio dice: S/ 82 ("contó varias       │          │
│ │   veces, solo había 82 soles")           │          │
│ │                                          │          │
│ │ Diferencia: S/ 5                         │          │
│ │                                          │          │
│ │ [Ver pedidos del día]                    │          │
│ │ [Resolver]                                │          │
│ └──────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────┘
```

### Resolver

Modal con:

```
┌────────────────────────────────────┐
│ Resolver disputa                   │
│                                    │
│  Pedidos del día (Carlos → Priamo):│
│  • #ABC123 · Cash S/30 · vuelto 5 │
│  • #DEF456 · Cash S/27 · vuelto 3 │
│  • #GHI789 · Mixto S/30 cash      │
│  Total esperado: S/ 87             │
│                                    │
│  Decisión                          │
│  ○ Aceptar driver (S/ 87)          │
│  ● Aceptar negocio (S/ 82)         │
│  ○ Monto custom: S/ ___            │
│                                    │
│  Nota obligatoria                  │
│  ┌──────────────────────────┐     │
│  │ Driver acepta error en    │     │
│  │ vuelto del pedido #GHI789 │     │
│  └──────────────────────────┘     │
│                                    │
│  [Cancelar] [Resolver]             │
└────────────────────────────────────┘
```

POST `/api/v1/admin/cash-settlements/{id}/resolve`. Push a driver y negocio con la decisión.

---

## 13. Sección · Auditoría

Log de `domain_events` filtrable. Sirve para investigar issues post-mortem.

### Filtros

- Tipo de evento
- Tipo de agregado (order, business, driver, ...)
- ID del agregado
- Rango de fechas
- Búsqueda en payload

### Vista

```
┌────────────────────────────────────────────────────────┐
│ Auditoría · 4,381 eventos en últimos 90 días           │
│                                                        │
│ 22 may 19:35 · OrderDelivered · #ABC123                │
│   driver_id: ... · cash_owed: 0                        │
│                                                        │
│ 22 may 19:22 · OrderPickedUp · #ABC123                 │
│   driver_id: ... · slots: 1 · band: near               │
│                                                        │
│ 22 may 19:05 · OrderAssigned · #ABC123                 │
│   driver_id: ... · reason: R1_grouping                 │
│                                                        │
│ ...                                                    │
└────────────────────────────────────────────────────────┘
```

Tap evento → detalle JSON.

---

## 14. Sección · Configuración

### Horario operativo

```
┌────────────────────────────────────┐
│ Horario operativo                  │
│                                    │
│  Días activos                      │
│  [Lun] [●Mar] [●Mié] [●Jue]        │
│  [●Vie] [●Sáb] [Dom]               │
│                                    │
│  Hora de inicio                    │
│  18:00                             │
│                                    │
│  Hora de fin                       │
│  23:00                             │
│  (Si end ≤ start, cruza medianoche)│
│                                    │
│  Timezone: America/Lima (UTC-5)    │
│                                    │
│  [Guardar]                         │
└────────────────────────────────────┘
```

Efecto: negocios fuera de horario no pueden crear pedidos. Drivers fuera de horario no pueden activar disponibilidad.

### Reglas de asignación R1-R5

```
┌────────────────────────────────────┐
│ Reglas R1-R5                       │
│                                    │
│  Max pedidos / driver: [3]         │
│  Max restaurantes / driver: [2]    │
│  Max slots / pedido: [3]           │
│  Ventana grouping: [5] min         │
│                                    │
│  [Guardar]                         │
└────────────────────────────────────┘
```

### Teléfono soporte

```
+51 [987654321]
```

Aparece en todas las apps como link `wa.me/<phone>?text=Hola Tindivo...`.

### Comisiones (override del default)

```
┌────────────────────────────────────┐
│ Comisiones por pedido entregado    │
│                                    │
│  Pickup:        S/ [0.50]          │
│  Delivery cerca: S/ [3.00]          │
│  Delivery medio: S/ [3.25]          │
│  Delivery lejos: S/ [3.50]          │
│                                    │
│  [Guardar]                         │
└────────────────────────────────────┘
```

---

**Resumen**: `admin.tindivo.com` es una sala de control con 11 secciones. KPIs en vivo en dashboard, monitor de pedidos activos, intervención en cualquier pedido (cancelar / reasignar / corregir teléfono), CRUD de negocios y drivers, gestión de cobros y disputas. Cada acción del admin requiere razón obligatoria y queda en auditoría inmutable.

**Próximo doc**: `01-requerimientos-funcionales.md` — épicas + HUs.
