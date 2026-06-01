# 09 · Flujo del negocio · negocios.tindivo.com

> PWA del negocio con UI condicional según capacidades. Onboarding, dashboard adaptativo, editor de menú, gestión de efectivo y deuda. Es la app más compleja porque cambia visualmente según qué hace el negocio.

---

## Tabla de contenidos

- [1. Premisa de diseño](#1-premisa-de-diseño)
- [2. Capacidades y modo primario](#2-capacidades-y-modo-primario)
- [3. Onboarding obligatorio](#3-onboarding-obligatorio)
- [4. Dashboard adaptativo](#4-dashboard-adaptativo)
- [5. Flujo `drivers_only` (solo pedir motorizado)](#5-flujo-drivers_only-solo-pedir-motorizado)
- [6. Flujo `catalog_pickup` (solo pickup web)](#6-flujo-catalog_pickup-solo-pickup-web)
- [7. Flujo `catalog_delivery` y `catalog_full`](#7-flujo-catalog_delivery-y-catalog_full)
- [8. Flujo `pickup_local`](#8-flujo-pickup_local)
- [9. Editor de menú](#9-editor-de-menú)
- [10. Pedidos pendientes de aceptación (web)](#10-pedidos-pendientes-de-aceptación-web)
- [11. Pedidos activos](#11-pedidos-activos)
- [12. Detalle de pedido](#12-detalle-de-pedido)
- [13. Crear pedido manual](#13-crear-pedido-manual)
- [14. Cash recibido](#14-cash-recibido)
- [15. Deuda y settlements](#15-deuda-y-settlements)
- [16. Perfil y configuración](#16-perfil-y-configuración)
- [17. Cambio de capacidades en vivo](#17-cambio-de-capacidades-en-vivo)

---

## 1. Premisa de diseño

`negocios.tindivo.com` debe **sentirse específico al negocio que lo usa**. Si Juan solo pide motorizados (porque vende por teléfono), no debe ver editores de menú. Si Lucía solo publica catálogo (porque tiene su propio repartidor), no debe ver el botón "Pedir moto".

**Solución técnica**: una sola PWA con renderizado condicional basado en `business.primary_capability` + boolean flags. Sin redirects entre rutas distintas — la app **se adapta**.

**Trade-off**: un único bundle con todas las features (mayor JS), pero con code-splitting agresivo por feature (dynamic imports de secciones no usadas).

---

## 2. Capacidades y modo primario

### Modelo (4 dimensiones ortogonales)

| Capacidad | Tipo | Significado |
|---|---|---|
| `publishes_catalog` | boolean | Su menú aparece en `tindivo.com` (visible en marketplace) |
| `accepts_web_pickup` | boolean | Clientes pueden ordenar **pickup** desde la web. Requiere `publishes_catalog`. |
| `accepts_web_delivery` | boolean | Clientes pueden ordenar **delivery** desde la web. Requiere `publishes_catalog` + `uses_tindivo_drivers`. |
| `uses_tindivo_drivers` | boolean | Recibe motorizados Tindivo (delivery web y/o pedidos manuales con entrega) |
| `primary_capability` | enum | `drivers_only` / `catalog_pickup` / `catalog_delivery` / `catalog_full` / `pickup_local` |

### Derivación automática (trigger en BD)

`primary_capability` se recalcula AUTOMÁTICAMENTE ante cualquier cambio en los 4 flags. Función SQL `derive_business_primary_capability` ejecutada en `BEFORE INSERT OR UPDATE` (ver `04-base-de-datos.md`):

```ts
// Lógica equivalente en TS para el cliente
function derivePrimaryCapability(c: Capabilities): PrimaryCapability {
  if (!c.publishes_catalog) {
    return c.uses_tindivo_drivers ? 'drivers_only' : 'pickup_local'
  }
  // publica catálogo: depende de qué modalidades web acepta
  if (c.accepts_web_pickup && c.accepts_web_delivery) return 'catalog_full'
  if (c.accepts_web_delivery) return 'catalog_delivery'
  return 'catalog_pickup'  // solo pickup web (no delivery web)
}
```

El admin puede **override** en `admin.tindivo.com` para casos edge.

### Reglas de consistencia (validadas en BD por CHECK constraint)

1. `accepts_web_pickup = true` requiere `publishes_catalog = true`.
2. `accepts_web_delivery = true` requiere `publishes_catalog = true` Y `uses_tindivo_drivers = true`.
3. Si `publishes_catalog = true`, debe estar activo al menos uno de `accepts_web_pickup` o `accepts_web_delivery`.

Cualquier `UPDATE` que viole estas reglas falla con error en BD (defensa en profundidad además de validación en el endpoint).

### Persistencia

```sql
SELECT publishes_catalog, accepts_web_pickup, accepts_web_delivery,
       uses_tindivo_drivers, primary_capability
FROM businesses WHERE user_id = auth.uid();
```

Cargado al login en Zustand store `businessStore.capabilities`. Disponible globalmente para render condicional.

---

## 3. Onboarding obligatorio

Al primer login, si `primary_capability IS NULL`, redirigir a `/onboarding`.

### Pantalla 1 — Qué necesitas (wizard con dependencias)

```
┌────────────────────────────────────┐
│              Bienvenido            │
│                                    │
│  ¿Qué quieres hacer con Tindivo?   │
│                                    │
│  ☐ Publicar mi menú online         │
│    Los clientes pueden ver mis     │
│    platos en tindivo.com.          │
│                                    │
│  Si publicas menú, ¿cómo entregas? │
│  (al menos una opción)             │
│                                    │
│  ☐ Cliente recoge en mi local      │
│    Sin envío. Cobro S/0.50/pedido. │
│                                    │
│  ☐ Tindivo entrega a domicilio     │
│    Con motorizado.                 │
│    S/3-3.50 por entrega.           │
│    (Activa automático "Usar        │
│     motorizados Tindivo")          │
│                                    │
│  ☐ Usar motorizados Tindivo        │
│    También para pedidos que        │
│    recibes por teléfono.           │
│                                    │
│  [Continuar]                       │
└────────────────────────────────────┘
```

**Lógica del wizard**:
- Al marcar **"Tindivo entrega a domicilio"** → marca automático **"Usar motorizados Tindivo"** (no se puede desmarcar mientras la primera esté activa).
- Al marcar **"Cliente recoge en mi local"** o **"Tindivo entrega a domicilio"** → requiere **"Publicar mi menú online"** activo (si no, mostrar tooltip "Activa esto primero").
- Si el usuario marca solo **"Usar motorizados Tindivo"** sin catálogo, queda en modo `drivers_only` (pedidos manuales del cajero).
- Si no marca nada, queda en modo `pickup_local`.

### Pantalla 2 — Resumen y confirmación

Muestra `primary_capability` derivada con explicación:

```
┌────────────────────────────────────┐
│  Tu modo de Tindivo                │
│                                    │
│  ★ Delivery completo               │
│                                    │
│  Recibes pedidos online, gestionas │
│  tu menú, y nuestros motorizados   │
│  entregan a tus clientes.          │
│                                    │
│  Lo que verás en tu panel:         │
│  ✓ Pedidos pendientes de aceptar  │
│  ✓ Editor de menú                  │
│  ✓ Pedidos en preparación          │
│  ✓ Crear pedido manual             │
│  ✓ Efectivo recibido               │
│  ✓ Deuda con Tindivo               │
│                                    │
│  Podrás cambiar esto en cualquier  │
│  momento desde Configuración.      │
│                                    │
│  [Empezar]                         │
└────────────────────────────────────┘
```

### Pantalla 3 — Datos básicos

Si no completaron al registrarse (admin los creó solo con email + password), se completan aquí:

- Nombre del negocio (pre-rellenado).
- Teléfono del local.
- Dirección física.
- Color de acento (paleta, con validación de unicidad).
- Logo (opcional).

### Pantalla 4 (condicional) — Yape

Si `uses_tindivo_drivers = true`:

```
┌────────────────────────────────────┐
│  Cobros Yape al cliente            │
│                                    │
│  Cuando el cliente pague con Yape  │
│  al recibir, el motorizado le      │
│  mostrará tu QR.                   │
│                                    │
│  Número de Yape *                  │
│  +51 ___ ___ ___                   │
│                                    │
│  Sube tu QR (opcional)             │
│  [Subir imagen]                    │
│                                    │
│  [Guardar]                         │
└────────────────────────────────────┘
```

### Pantalla 5 (condicional) — Primer menú

Si `publishes_catalog = true`, abrir el editor de menú con onboarding mini:

```
┌────────────────────────────────────┐
│  Crea tu primera categoría         │
│  Ej. "Pizzas", "Hamburguesas",     │
│  "Bebidas".                        │
│                                    │
│  Nombre de la categoría            │
│  [_____________________]            │
│                                    │
│  Descripción (opcional)            │
│  Ej. "Masa madre, 24h de           │
│  fermentación"                     │
│  [_____________________]            │
│                                    │
│  [Crear categoría]                 │
│  [Saltar por ahora]                │
└────────────────────────────────────┘
```

Al terminar onboarding, redirigir a `/` (dashboard) y mostrar tour overlay con tooltips contextuales.

---

## 4. Dashboard adaptativo

El home `/` renderiza distinto por `primary_capability`. Estructura común:

```
┌────────────────────────────────────┐
│ Tindivo · Priamo            ⓜ      │  ← GlassTopBar con avatar/menu
│                                    │
│  [contenido específico]            │
│                                    │
├────────────────────────────────────┤
│ 🏠 Inicio 🛍 Pedidos 📋 Menú 💰 Eft│  ← BottomNav adaptativa
└────────────────────────────────────┘
```

### BottomNav condicional

```ts
const navItems = useMemo(() => {
  const items: NavItem[] = [{ key: 'home', icon: 'home', label: 'Inicio' }]

  if (uses_tindivo_drivers || publishes_catalog) {
    items.push({ key: 'orders', icon: 'receipt_long', label: 'Pedidos' })
  }
  if (publishes_catalog) {
    items.push({ key: 'menu', icon: 'restaurant_menu', label: 'Menú' })
  }
  if (uses_tindivo_drivers) {
    items.push({ key: 'cash', icon: 'payments', label: 'Efectivo' })
    items.push({ key: 'debt', icon: 'account_balance', label: 'Deuda' })
  }

  return items
}, [capabilities])
```

---

## 5. Flujo `drivers_only` (solo pedir motorizado)

**Caso**: El cajero recibe pedidos por teléfono / WhatsApp / presencial. Solo usa Tindivo para que un motorizado vaya a entregar.

### Home `drivers_only`

```
┌────────────────────────────────────┐
│ Tindivo · Priamo            ⓜ      │
│                                    │
│   Buenas noches                    │
│   Hoy:  4 pedidos · S/ 12 deuda    │  ← micro KPIs
│                                    │
│   ┌──────────────────────────┐    │
│   │                          │    │
│   │       🛵                 │    │
│   │                          │    │
│   │    Pedir moto            │    │  ← CTA enorme
│   │                          │    │
│   └──────────────────────────┘    │
│                                    │
│   Pedidos en curso (2)             │
│   ┌──────────────────────────┐    │
│   │ ● #ABC123  Heading...    │    │
│   │   Carlos R.              │    │
│   └──────────────────────────┘    │
│   ┌──────────────────────────┐    │
│   │ ● #DEF456  Picked up...  │    │
│   └──────────────────────────┘    │
│                                    │
│  ¿Ya anotaste en tu papelito ⚪?  │  ← Papelito reminder
│                                    │
├────────────────────────────────────┤
│ 🏠 Inicio  🛍 Pedidos  💰 Efectivo│
└────────────────────────────────────┘
```

### "Pedir moto" — form rápido

Tap en CTA → modal/sheet con form:

```
┌────────────────────────────────────┐
│ Nuevo pedido                  [X]  │
│                                    │
│  Nombre del cliente *              │
│  ┌──────────────────────────┐     │
│  │ Juan Pérez                │     │
│  └──────────────────────────┘     │
│                                    │
│  Teléfono *                        │
│  +51 ┌────────────────────────┐   │
│       │ 987654321               │   │
│       └────────────────────────┘   │
│                                    │
│  Dirección *                       │
│  ┌──────────────────────────┐     │
│  │ Jr. Sucre 412             │     │
│  └──────────────────────────┘     │
│                                    │
│  Referencia                        │
│  ┌──────────────────────────┐     │
│  │ Frente al grifo azul      │     │
│  └──────────────────────────┘     │
│                                    │
│  Monto del pedido *                │
│  S/ [______________]               │
│                                    │
│  Método de pago                    │
│  [● Yape al recibir]               │
│  [○ Efectivo]                      │
│  [○ Yape + Efectivo (mixto)]       │
│  [○ Ya pagó]                       │
│                                    │
│  Tiempo de preparación             │
│  [10] [15] [20] [25] [30] [35]...  │  ← PrepTimeSelector
│                                    │
│  ┌──────────────────────────┐     │
│  │ Crear pedido              │     │
│  └──────────────────────────┘     │
└────────────────────────────────────┘
```

**Idempotency-Key requerido** (`useIdempotencyKey('business:new-order-drivers-only')`).

POST a `/api/v1/business/orders` → backend crea con `delivery_method='delivery'`, `source='business_manual'`.

### Animación

Después de crear, modal cierra con éxito + toast "Pedido #ABC123 creado · buscando motorizado..." + tarjeta nueva aparece animada en lista "Pedidos en curso".

---

## 6. Flujo `catalog_pickup` (solo pickup web)

**Caso**: El negocio publica su menú en `tindivo.com`. Los clientes piden online con modalidad **pickup únicamente** y vienen a recoger al local. NO usa drivers Tindivo. Comisión Tindivo: S/0.50 por pedido entregado.

**Capacidades**: `publishes_catalog=true`, `accepts_web_pickup=true`, `accepts_web_delivery=false`, `uses_tindivo_drivers=false`.

**En el checkout del cliente** (`tindivo.com`): el toggle Delivery/Pickup queda **fijado en Pickup**, con texto "Este negocio solo ofrece recojo en el local".

### Home `catalog_pickup`

```
┌────────────────────────────────────┐
│ Tindivo · La Nonna          ⓜ      │
│                                    │
│  Pedidos pendientes (3)            │
│  ┌──────────────────────────┐     │
│  │ 🆕 NUEVO · #XYZ789        │     │
│  │ Cliente: Roberto S.       │     │
│  │ 2 items · S/ 45.00        │     │
│  │ Esperando tu confirmación │     │
│  │ [Ver detalle] [Aceptar]   │     │
│  └──────────────────────────┘     │
│  ...                               │
│                                    │
│  Pedidos en preparación (1)        │
│  ┌──────────────────────────┐     │
│  │ #ABC123  Listo en 10 min  │     │
│  │ Pasarán a recoger          │     │
│  └──────────────────────────┘     │
│                                    │
│  Hoy: 8 entregados · S/ 4 deuda    │
│                                    │
├────────────────────────────────────┤
│ 🏠 Inicio  🛍 Pedidos  📋 Menú    │
└────────────────────────────────────┘
```

NO hay sección Efectivo ni Deuda con drivers (porque no usa drivers). Pero SÍ Deuda con Tindivo por las comisiones de pickup S/0.50.

---

## 7. Flujo `catalog_delivery` y `catalog_full`

Estos dos modos comparten gran parte de la UI, solo difieren en qué modalidades web acepta el negocio.

### `catalog_delivery` (solo delivery web)

**Caso**: Negocio con menú online que solo entrega a domicilio (no acepta que el cliente recoja). Usa drivers Tindivo. Útil para dark kitchens o locales sin atención al público.

**Capacidades**: `publishes_catalog=true`, `accepts_web_pickup=false`, `accepts_web_delivery=true`, `uses_tindivo_drivers=true`.

**En checkout del cliente**: toggle fijo en Delivery, texto "Este negocio solo ofrece envío a domicilio".

### `catalog_full` (pickup + delivery web)

**Caso**: Negocio con menú online que acepta AMBAS modalidades. El cliente elige en checkout. El caso más completo y escalable.

**Capacidades**: `publishes_catalog=true`, `accepts_web_pickup=true`, `accepts_web_delivery=true`, `uses_tindivo_drivers=true`.

**En checkout del cliente**: toggle Delivery/Pickup completamente funcional. Default Delivery.

### Home `catalog_delivery` y `catalog_full`

Combina ambos: pedidos pendientes (web) + pedidos en curso (con drivers) + métricas. En `catalog_full`, cada card de pedido pendiente muestra **badge "pickup" o "delivery"** para que el cajero sepa qué prep aplica.

```
┌────────────────────────────────────┐
│ Tindivo · Priamo            ⓜ      │
│                                    │
│  ⚡ 1 pedido pendiente               │
│  ┌──────────────────────────┐     │
│  │ 🆕 #XYZ789 hace 30s      │     │
│  │ ...                       │     │
│  │ [Ver] [Aceptar]           │     │
│  └──────────────────────────┘     │
│                                    │
│  En curso (3)                      │
│  ┌──────────────────────────┐     │
│  │ #ABC123 Carlos R.         │     │
│  │ ...                       │     │
│  └──────────────────────────┘     │
│  ...                               │
│                                    │
│  [+ Pedido manual]                 │  ← FAB para pedido por teléfono
│                                    │
│  Hoy: 12 · S/ 360 GMV · S/ 36 deuda│
│                                    │
├────────────────────────────────────┤
│ 🏠 🛍 📋 💰 🏦                    │
└────────────────────────────────────┘
```

---

## 8. Flujo `pickup_local`

**Caso**: Negocio registra pedidos manuales del cajero (sin catálogo web) + usa drivers Tindivo. Muy similar a `drivers_only` pero más completo (drivers ven QR del negocio).

UI similar a `drivers_only` pero con más datos del negocio gestionables.

---

## 9. Editor de menú

Activo solo si `publishes_catalog = true`. Ruta `/menu`.

### Estructura

3 niveles anidados:

1. **Categorías** ("Pizzas", "Bebidas")
2. **Items** dentro de cada categoría ("Margarita")
3. **Grupos de modificadores** asociables a items ("Tamaño", "Extras")
4. **Opciones de modificadores** dentro de cada grupo ("Personal", "Familiar")

### Vista principal

```
┌────────────────────────────────────┐
│ ←  Mi menú                         │
│                                    │
│  [+ Categoría]   [+ Modif. grupo]  │
│                                    │
│  ┌──────────────────────────┐     │
│  │ Pizzas                ✏️  │     │
│  │ Masa madre, 24h ferm.    │     │
│  │ ─────────────────────────│     │
│  │ • Margarita    S/ 28  ✏️ │     │
│  │ • Pepperoni    S/ 34  ✏️ │     │
│  │ • Especial     S/ 36  ✏️ │     │
│  │ + Item                    │     │
│  └──────────────────────────┘     │
│                                    │
│  ┌──────────────────────────┐     │
│  │ Hamburguesas          ✏️  │     │
│  │ ...                       │     │
│  └──────────────────────────┘     │
│                                    │
│  Grupos de modificadores           │
│  ┌──────────────────────────┐     │
│  │ Tamaño · single · req  ✏️ │     │
│  │ • Personal · Incluido    │     │
│  │ • Familiar · +S/ 8        │     │
│  │ • Jumbo · +S/ 16          │     │
│  └──────────────────────────┘     │
│  ┌──────────────────────────┐     │
│  │ Extras · multi · max 3 ✏️ │     │
│  │ • Doble queso · +S/ 4     │     │
│  │ ...                       │     │
│  └──────────────────────────┘     │
└────────────────────────────────────┘
```

### Editor de categoría (sheet)

- Nombre *
- Descripción (blurb)
- Reordenar items (drag-and-drop)
- Eliminar (con confirmación si tiene items)

### Editor de item (sheet)

- Nombre *
- Descripción
- Precio base * (MoneyInput)
- Imagen (upload via Supabase Storage)
- Categoría (select)
- Disponibilidad (toggle)
- Layout compacto (toggle, para bebidas)
- Badges (multi-select: más-pedido, nuevo, edición-perú)
- Modifier groups asociados (multi-select de grupos existentes)

### Editor de grupo de modificadores

- Nombre * ("Tamaño", "Extras")
- Selection type: Single (radio) / Multi (checkbox)
- Required (toggle)
- Min selections (si multi)
- Max selections (si multi)
- Opciones (lista editable inline)

### Editor de opción de modificador

- Nombre *
- Descripción
- Precio adicional (puede ser 0 = "Incluido")
- Disponibilidad

### Reglas

- Cambios visibles **inmediatamente** en `tindivo.com` (Supabase Realtime + revalidación de TanStack Query).
- Si se desactiva un item con pedidos activos: pedidos siguen, pero el item desaparece del menú público.
- Eliminar item → CASCADE elimina sus `customer_order_item_modifiers`. ¿Es lo correcto? **No** — snapshot-protección: los pedidos antiguos guardan nombre + precio del item en columnas `*_snapshot`, así que el item puede eliminarse sin destruir histórico.

---

## 10. Pedidos pendientes de aceptación (web)

Aparece si `accepts_web_pickup = true` OR `accepts_web_delivery = true`. Ruta `/pedidos/pendientes`. En `catalog_full`, cada pedido pendiente muestra badge **pickup** o **delivery** según lo que eligió el cliente.

### Vista

```
┌────────────────────────────────────┐
│ ←  Pedidos pendientes              │
│                                    │
│  3 esperando tu aceptación         │
│  Cada uno se cancela auto en 5min  │
│                                    │
│  ┌──────────────────────────┐     │
│  │ ⏱ 4:30 · #XYZ789          │     │  ← timer countdown
│  │ Cliente: Roberto S.       │     │
│  │ +51 987654321             │     │
│  │ Av. Industrial 23         │     │
│  │ ─────────────────────────│     │
│  │ 2× Pepperoni Familiar     │     │
│  │ "sin cebolla"             │     │
│  │ 1× Inca Kola               │     │
│  │ ─────────────────────────│     │
│  │ Total · S/ 92.00          │     │
│  │ Pago · Yape al recibir    │     │
│  │ ─────────────────────────│     │
│  │ Prep estimado:           │     │
│  │ [10][15][20][●25][30]...  │     │  ← elegir prep_time real
│  │                          │     │
│  │ [Rechazar] [Aceptar]      │     │
│  └──────────────────────────┘     │
└────────────────────────────────────┘
```

### Acciones

- **Aceptar**: POST `/api/v1/business/orders/{id}/accept` con `prep_time_minutes`. Estado → `waiting_driver` (si `uses_tindivo_drivers`) o `waiting_for_pickup` (si solo catálogo). Push al cliente "Pedido confirmado".
- **Rechazar**: POST `/api/v1/business/orders/{id}/cancel` con razón. Push al cliente "Lo sentimos, no podemos prepararlo".

### Auto-cancel

Si pasan 5 min sin aceptar, Inngest `auto-cancel-pending` cancela automático. El cliente ve cancelado timeout. Push al negocio "1 pedido fue auto-cancelado".

---

## 11. Pedidos activos

Pedidos en estado `waiting_driver`, `heading_to_restaurant`, `waiting_at_restaurant`, `picked_up`. Ruta `/pedidos`.

```
┌────────────────────────────────────┐
│ ←  Mis pedidos                     │
│                                    │
│  [En curso (3)] [Hoy] [Historial] │  ← tabs
│                                    │
│  ┌──────────────────────────┐     │
│  │ 🟢 #ABC123                │     │
│  │ Listo en 8 min            │     │
│  │ Cliente: María P.         │     │
│  │ Driver: Carlos R.         │     │
│  │ Yape al recibir · S/45   │     │
│  └──────────────────────────┘     │
│  ┌──────────────────────────┐     │
│  │ 🟡 #DEF456 picked_up     │     │
│  │ Camino al cliente         │     │
│  │ Driver: Juan M.           │     │
│  └──────────────────────────┘     │
│  ┌──────────────────────────┐     │
│  │ 🔴 #GHI789 OVERDUE        │     │
│  │ Llegó hace 3 min          │     │
│  │ Driver: Ana L.            │     │
│  └──────────────────────────┘     │
└────────────────────────────────────┘
```

Cada tarjeta es clickeable → detalle.

---

## 12. Detalle de pedido

```
┌────────────────────────────────────┐
│ ←  #ABC123                         │
│                                    │
│  Estado · waiting_driver           │
│  ┌──────────────────────────┐     │
│  │ ✓ Confirmado · 19:00     │     │
│  │ ⏱ Estimado listo · 19:25 │     │
│  │ ○ Driver llegó            │     │
│  │ ○ Recogido                │     │
│  │ ○ Entregado               │     │
│  └──────────────────────────┘     │
│                                    │
│  Cliente                           │
│  María Pérez · +51 987654321       │
│  Av. Industrial 23                 │
│                                    │
│  Items                             │
│  2× Pepperoni Familiar             │
│  1× Inca Kola                      │
│                                    │
│  Total · S/ 92.00                  │
│  Pago · Yape al recibir            │
│                                    │
│  Driver asignado                   │
│  Carlos R. · +51 999111222         │
│                                    │
│  Acciones                          │
│  [Listo antes de tiempo]           │
│  [Pedir +5 min] [Pedir +10 min]    │
│  [Cancelar pedido]                 │
│                                    │
│  Línea de tiempo (auditoría)       │
│  ✓ Creado · 18:55                  │
│  ✓ Aceptado · 19:00                │
│  ✓ Driver asignado · 19:05         │
│  ✓ ...                              │
└────────────────────────────────────┘
```

### Acciones disponibles por estado

- `waiting_driver` / `heading_to_restaurant`:
  - Listo antes (si quedan >10 min al estimated_ready_at)
  - Pedir extensión +5/+10
  - Cancelar
- `waiting_at_restaurant`: Cancelar
- `picked_up`: NO se puede cancelar desde el negocio (solo admin)
- `delivered`: solo ver, no acciones

---

## 13. Crear pedido manual

Ya descrito en §5 para `drivers_only`. Para `catalog_full`, `catalog_delivery` y `pickup_local` es similar pero con más opciones (el cajero elige delivery o pickup, método de pago, etc.).

```
┌────────────────────────────────────┐
│ Nuevo pedido (manual)         [X]  │
│                                    │
│  Tipo de entrega                   │
│  [● Delivery (con motorizado)]     │
│  [○ Pickup (cliente recoge)]       │
│                                    │
│  ... (datos del cliente)           │
│                                    │
│  ... (método pago)                 │
│                                    │
│  Tiempo de preparación             │
│  [10][15][20][25][30][35][40][45][50]│
│                                    │
│  ¿Ya anotaste en tu papelito 🟠?   │  ← PapelitoReminder
│                                    │
│  [Crear pedido]                    │
└────────────────────────────────────┘
```

---

## 14. Cash recibido

Activo si `uses_tindivo_drivers = true`. Ruta `/efectivo`.

```
┌────────────────────────────────────┐
│ ←  Efectivo recibido               │
│                                    │
│  Hoy                               │
│  S/ 287.00 confirmado              │
│                                    │
│  Pendiente de confirmar            │
│  ┌──────────────────────────┐     │
│  │ Carlos R. dice            │     │
│  │ S/ 87.00 (3 pedidos)      │     │
│  │ Entregado hace 5 min      │     │
│  │ [Reportar diferencia]     │     │
│  │ [Confirmar]               │     │
│  └──────────────────────────┘     │
│                                    │
│  Historial                         │
│  ✓ Ayer · Juan M. · S/ 120         │
│  ✓ Ayer · Carlos R. · S/ 87        │
│  ⚠ Lun · Ana L. · DISPUTA          │
└────────────────────────────────────┘
```

### Confirmar

Modal con monto pre-relleno (lo que dice el driver). Si coincide, tap Confirmar → `POST /business/cash-settlements/{id}/confirm` con `received_amount`.

### Reportar diferencia

```
┌────────────────────────────────────┐
│ Reportar diferencia          [X]   │
│                                    │
│  Carlos R. dice S/ 87.00.          │
│                                    │
│  ¿Cuánto realmente recibiste?      │
│  S/ [____________]                 │
│                                    │
│  ¿Por qué la diferencia? *         │
│  ┌──────────────────────────┐     │
│  │ Se contaron varias veces, │     │
│  │ solo había 82 soles.      │     │
│  └──────────────────────────┘     │
│                                    │
│  Tindivo resolverá la disputa.     │
│  No discutas con el motorizado.    │
│                                    │
│  [Cancelar] [Reportar]             │
└────────────────────────────────────┘
```

POST `/business/cash-settlements/{id}/dispute` → status `disputed`, push al admin.

---

## 15. Deuda y settlements

Activo siempre que el negocio acumule deuda con Tindivo. Ruta `/deuda`.

```
┌────────────────────────────────────┐
│ ←  Mi deuda con Tindivo            │
│                                    │
│  ┌──────────────────────────┐     │
│  │ Total actual              │     │
│  │ S/ 23.00                  │     │
│  │ 7 pedidos esta semana     │     │
│  └──────────────────────────┘     │
│                                    │
│  ¿Cómo pagar?                      │
│  • Yape a +51 987 654 321         │
│  • O transferencia BCP 123-456...  │
│  • Marcamos cuando lo recibimos   │
│                                    │
│  Próximo vencimiento               │
│  Viernes 30 de mayo · S/ 23.00     │
│                                    │
│  Historial                         │
│  ✓ Sem 20-26 mayo · S/ 47 · pagado │
│  ✓ Sem 13-19 mayo · S/ 35 · pagado │
│  ⚠ Sem 6-12 mayo · S/ 28 · vencido │
│                                    │
│  ¿Alguna duda? Escríbenos          │
└────────────────────────────────────┘
```

### Si está bloqueado por mora

```
│  ⛔ Tu cuenta está suspendida      │
│                                    │
│  Tienes deuda vencida de S/ 50.00. │
│  Una vez registremos tu pago,     │
│  podrás operar de nuevo            │
│  inmediatamente.                   │
│                                    │
│  Contacta a Tindivo:               │
│  +51 987654321                     │
```

Y endpoints de creación devuelven 403.

---

## 16. Perfil y configuración

Ruta `/configuracion`:

- Datos del negocio (editable según `business.profile`)
- Color de acento (con validación unicidad)
- Yape (número + QR)
- ETA (min/max minutos)
- Delivery fee al cliente
- **Capacidades** (toggles para cambiar primary_capability)
- Notificaciones (gestión de push subscription)
- Cerrar sesión

---

## 17. Cambio de capacidades en vivo

En `/configuracion/capacidades`:

```
┌────────────────────────────────────┐
│ ←  Capacidades                     │
│                                    │
│  Modo actual: Catálogo full        │
│  (pickup + delivery)               │
│                                    │
│  ☑ Publicar mi menú online         │
│     └─ Modalidades web aceptadas:  │
│        ☑ Cliente recoge (pickup)   │
│        ☑ Tindivo entrega (delivery)│
│                                    │
│  ☑ Usar motorizados Tindivo        │
│                                    │
│  Si desmarcas "publicar menú":     │
│  ⚠ Tu menú dejará de aparecer en   │
│    tindivo.com inmediatamente.     │
│    Tus items NO se borran.         │
│                                    │
│  Si desmarcas "Tindivo entrega":   │
│  ⚠ El cliente ya no podrá pedir    │
│    delivery web. Los pedidos       │
│    activos siguen normalmente.     │
│                                    │
│  [Guardar cambios]                 │
└────────────────────────────────────┘
```

### Reglas de consistencia (validadas en cliente + endpoint + BD)

1. `accepts_web_pickup` requiere `publishes_catalog = true`. Si intentas activar el primero sin el segundo, error inline "Primero activa Publicar mi menú online".
2. `accepts_web_delivery` requiere `publishes_catalog = true` Y `uses_tindivo_drivers = true`. Si intentas activar sin drivers, error inline.
3. Si `publishes_catalog = true`, al menos uno de `accepts_web_pickup` o `accepts_web_delivery` debe estar activo. Si intentas desactivar ambos, error: "Si publicas menú, tu cliente debe poder pedirlo (pickup o delivery)".
4. Al desactivar `publishes_catalog`, el menú NO se borra. Vuelve a aparecer al reactivar (con las modalidades que estuvieran activas).
5. Al desactivar `uses_tindivo_drivers`, también se desactiva automático `accepts_web_delivery` (cascade lógico). Los pedidos activos siguen su curso.
6. `primary_capability` se recalcula automáticamente vía trigger BD al guardar.

### Casos de uso del cambio

**Caso A: Negocio en vacaciones temporales**
- Desactiva `publishes_catalog` → menú deja de aparecer en tindivo.com.
- Vuelve a activarlo al regresar. Su menú estaba intacto.

**Caso B: Negocio que quiere probar el servicio de drivers Tindivo**
- Empezó como `catalog_pickup` (solo pickup, sin drivers).
- Activa `uses_tindivo_drivers` y `accepts_web_delivery`.
- Sus clientes ahora ven el toggle delivery en checkout.
- Si no le gusta, desactiva `accepts_web_delivery`. Vuelve a `catalog_pickup`.

**Caso C: Negocio que quiere dejar de aceptar pickup web**
- Estaba en `catalog_full`. Decide que solo quiere delivery (su local no tiene espacio para recogida).
- Desactiva `accepts_web_pickup`. Pasa a `catalog_delivery`.
- El toggle en checkout del cliente solo muestra Delivery.

### Acciones a la UI tras cambio

- BottomNav se actualiza inmediatamente (Zustand reactivo).
- Si el modo cambió drásticamente, banner de bienvenida "Tu panel ahora muestra Delivery completo. ¿Necesitas un tour rápido?"

---

**Resumen**: `negocios.tindivo.com` es una sola PWA que se adapta visualmente a las capacidades del negocio. Onboarding obligatorio define el modo primario. Dashboard, navigation y features se renderizan condicionalmente. El editor de menú, los pedidos web, la gestión de cash y la deuda solo aparecen si aplican. El negocio puede cambiar capacidades en cualquier momento sin migración de datos.

**Próximo doc**: `10-flujo-motorizados.md` — PWA del driver.
