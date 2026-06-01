# FLUJO TINDIVO — Documentación Exhaustiva (v2)

> Actualizado el 2026-05-23 · Refleja los 15 fixes aplicados al prototipo.
> Proyecto: Tindivo-Demo PWA · Next.js 16 · React 19 · San Jacinto, Áncash

---

## NOTA SOBRE BACKEND Y MODO DEMO

Varias funcionalidades de este prototipo operan en modo simulado para poder probar el flujo completo sin infraestructura de servidor. En producción, cada uno de estos puntos deberá conectarse al backend real:

| # | Funcionalidad | Estado actual (demo) | Requiere backend |
|---|---------------|----------------------|-----------------|
| A | Autenticación Google | Datos hardcodeados ("Jesús Castillo") | OAuth 2.0 real |
| B | Autenticación por email | Sin persistencia real | Auth service (Firebase / Supabase) |
| C | Número de pedido único | `Date.now().slice(-6)` — único por ms | Secuencia atómica en BD |
| D | Estado del pedido (tracking) | El usuario lo avanza manualmente | WebSocket / push notifications del restaurante |
| E | Comprobante de Yape | Cualquier archivo simula pago exitoso | Validación real de transferencia o Yape API |
| F | Zona de cobertura | Mapa SVG con píxeles → lat/lng aproximado | GPS real del dispositivo + polígono de cobertura en BD |
| G | Historial de pedidos | Datos estáticos `PAST_ORDERS` | Consulta a BD con pedidos reales del usuario |
| H | "Repetir pedido" | Reconstruye items desde datos estáticos | Consulta a BD + validación de disponibilidad actual |
| I | WhatsApp de soporte | Número placeholder `SUPPORT_PHONE` | Número real de Tindivo |
| J | Carrito en localStorage | Persiste entre sesiones sin usuario | Carrito sincronizado en cuenta del usuario autenticado |

---

## 1. MAPA COMPLETO DE PANTALLAS Y NAVEGACIÓN

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLUJO PRINCIPAL                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  [LandingScreen]
       │
       │  onPickRestaurant(restaurant)
       │  [Requiere: isRestaurantOpen() === true]
       ▼
  [MenuScreen] ◄─────────────────────────────────────────────────────────────┐
       │  │                                                                   │
       │  │ onOpenProduct(product, category)                                  │
       │  ▼                                                                   │
       │ [ProductModal]                                                        │
       │       │ onAdd(cartItem)                                               │
       │       └──────────────────► (añade al carrito, cierra modal)          │
       │                                                                       │
       │  onOpenCart()                                                         │
       │  [Valida: isRestaurantOpen() && user.signedIn]                        │
       │  Si cerrado → toast de error (no navega)                             │
       │  Si !signedIn → [AuthOnboarding]                                     │
       ▼
  [CartScreen]
       │  [Valida: isRestaurantOpen() antes de avanzar]
       │  Si cerrado → toast de error (deshabilita botón checkout)
       │
       │  onCheckout()
       ▼
  [CheckoutScreen] (method: 'delivery' | 'pickup')
       │
       │  onProceedToPayment(orderData)
       ▼
  [DeliveryPaymentScreen]
       │
       ├──── método: 'yape-on-delivery'  ──────────────────────► [OrderConfirmedScreen]
       │                                                                  │
       ├──── método: 'cash-on-delivery'  ──────────────────────► [OrderConfirmedScreen]
       │                                                                  │
       └──── método: 'prepay-yape'  ──────────► [PickupPaymentScreen]   │
                                                        │                 │
                                              timer ok  │ timer expires  │
                                                        ▼                │
                                               [OrderConfirmedScreen] ◄──┘
                                                        │
                         [OrderCancelledScreen] ◄───────┘ (si timer expira sin comprobante)
                                │
                                └── onRetry() ─────────────► [DeliveryPaymentScreen]
                                └── onHome()  ─────────────► [LandingScreen]

  [OrderConfirmedScreen]
       │  [Botón atrás del navegador: DESHABILITADO]
       ├──── onTrack()   ──────────────────────────► [TrackingScreen]
       └──── onHome()    ──────────────────────────► [LandingScreen]

  [TrackingScreen]
       │  [Botón atrás del navegador: DESHABILITADO]
       └──── onHome() (solo en estado 'delivered') ──► [LandingScreen]


┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO DE AUTENTICACIÓN                               │
└─────────────────────────────────────────────────────────────────────────────┘

  [MenuScreen / CartScreen]
       │  (usuario no autenticado intenta abrir carrito)
       ▼
  [AuthOnboarding] — Step 0: MethodStep
       │
       ├── Google ──► Step 1: NameStep ──► Step 2: PhoneStep ──► Step 3: AddressStep
       │                 (pre-llenado)
       └── Email  ──► Step 1: EmailStep ──► Step 2: PhoneStep ──► Step 3: AddressStep
                                                                          │
                                                               onComplete({ phone, address })
                                                                          │
                                                          ◄───────────────┘ (retorna a contexto)


┌─────────────────────────────────────────────────────────────────────────────┐
│                      FLUJO DE CUENTA Y DIRECCIONES                          │
└─────────────────────────────────────────────────────────────────────────────┘

  [LandingScreen] ──onOpenAccount()──► [AccountScreen]
  [MenuScreen]    ──onOpenAccount()──► [AccountScreen]
                                              │
                            ┌─────────────────┼──────────────────┐
                            │                 │                  │
                    onAddAddress()    onEditAddress(a)       onLogout()
                            │                 │       [limpia localStorage + cart]
                            ▼                 ▼                  ▼
                    [AddressEditScreen]  [AddressEditScreen]  [LandingScreen]
                     (isNew: true)       (isNew: false)
                            │                 │
                            └────── onSave(a) ─┘
                                       │
                            [AccountScreen]


┌─────────────────────────────────────────────────────────────────────────────┐
│           HISTORIAL DE PEDIDOS ("Repetir pedido")                           │
└─────────────────────────────────────────────────────────────────────────────┘

  [AccountScreen — sección "Mis pedidos anteriores"]
       │
       │  onRepeatOrder(items)
       ▼
  [App.handleRepeatOrder(repeatItems)]
       │  → Añade items al carrito
       │  → navega a 'cart'
       ▼
  [CartScreen]


┌─────────────────────────────────────────────────────────────────────────────┐
│           HISTORIAL DE NAVEGACIÓN Y BOTÓN ATRÁS                             │
└─────────────────────────────────────────────────────────────────────────────┘

  Cada cambio de pantalla llama navigateTo(screen) → window.history.pushState()
  El listener popstate mapea:

  menu → landing | cart → menu | checkout → cart | payment → checkout
  prepay → payment | account → landing | addressEdit → account
  confirmed → (bloqueado) | tracking → (bloqueado)
```

**Tabla de Screen IDs:**

| ID | Pantalla |
|----|----------|
| `landing` | LandingScreen |
| `menu` | MenuScreen |
| `cart` | CartScreen |
| `checkout` | CheckoutScreen |
| `payment` | DeliveryPaymentScreen |
| `prepay` | PickupPaymentScreen |
| `confirmed` | OrderConfirmedScreen |
| `cancelled` | OrderCancelledScreen |
| `tracking` | TrackingScreen |
| `account` | AccountScreen |
| `addressEdit` | AddressEditScreen |
| `auth` | AuthOnboarding (overlay) |

---

## 2. PANTALLAS — DETALLE COMPLETO

### 2.1 LandingScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/LandingScreen.jsx` |
| **Screen ID** | `landing` |
| **Descripción** | Pantalla de inicio. Muestra saludo personalizado, banner promocional y lista de restaurantes con validación de horario en tiempo real. La barra de búsqueda está deshabilitada y muestra un toast "Búsqueda disponible próximamente" al intentar usarla. |

**Props recibidas:**
```
user:             { signedIn: boolean, name: string }
onPickRestaurant: (restaurant) => void
onOpenAuth:       () => void
onOpenAccount:    () => void
```

**Estados posibles:**
- Usuario no autenticado → botón "Ingresar" en header
- Usuario autenticado → avatar con nombre y saludo personalizado
- Restaurante dentro de horario → card clickeable, estado "ABIERTO"
- Restaurante fuera de horario → card deshabilitada, banner naranja con mensaje de cierre
- Restaurante próximamente → card siempre deshabilitada, badge "PRÓXIMAMENTE"

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click en restaurante abierto en horario | → `onPickRestaurant(r)` → navega a `menu` |
| Click en restaurante fuera de horario | Deshabilitado (sin acción) |
| Click en restaurante "próximamente" | Deshabilitado (sin acción) |
| Click en barra de búsqueda | Toast: "Búsqueda disponible próximamente" |
| Click en "Ingresar" | → `onOpenAuth()` → abre `AuthOnboarding` |
| Click en avatar | → `onOpenAccount()` → navega a `account` |

**Lógica de horario (FIX 1):**
```
isRestaurantOpen(priamo) →
  hora < 18:00          → { isOpen: false, message: "Priamo abre hoy a las 6:00 PM" }
  hora >= 22:45         → { isOpen: false, message: "Ya no aceptamos pedidos por hoy. Volvemos mañana a las 6:00 PM" }
  18:00 ≤ hora < 22:45  → { isOpen: true, message: "" }
```

Banner naranja visible solo cuando `!isOpen`. Horario mostrado en la card: **6:00 PM – 10:45 PM**.

**Componentes usados:** `IOSStatusBar`, `Icon.Search`, `Icon.Pin`, datos de `RESTAURANTS`, función `isRestaurantOpen` (data/index.js)

---

### 2.2 MenuScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/MenuCartScreen.jsx` — export `MenuScreen` |
| **Screen ID** | `menu` |
| **Descripción** | Catálogo de productos del restaurante. Tabs por categoría con scroll sincronizado. FAB del carrito con validación de horario antes de navegar. |

**Props recibidas:**
```
cart:           Array<CartItem>
user:           { signedIn: boolean }
onOpenProduct:  (product, category) => void
onOpenCart:     () => void
onBack:         () => void
onOpenAccount:  () => void
```

**Estados internos:**
```
activeSection: string     // tab activo de categoría
closedToast:   boolean    // toast visible si restaurante cerrado
```

**Validación al abrir carrito (FIX 1):**
- Llama `isRestaurantOpen(PRIAMO)` al click del FAB
- Si cerrado → `closedToast = true`, muestra mensaje con horario
- Si abierto y `!user.signedIn` → `onOpenCart()` que dispara `AuthOnboarding`
- Si abierto y autenticado → `onOpenCart()` navega a `cart`

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click en tab de categoría | Scroll suave a esa sección, `activeSection` actualizado |
| Scroll manual | Actualiza `activeSection` según intersección |
| Click en producto | → `onOpenProduct(product, category)` → abre `ProductModal` |
| Click en FAB del carrito | Valida horario → valida auth → navega a `cart` |
| Click "←" back | → `onBack()` → `landing` |
| Click en avatar | → `onOpenAccount()` → `account` |

**Componentes usados:** `IOSStatusBar`, `IOSNavBar`, `ProductImage`, `Icon.*`, `MENU`, `PRIAMO`, `isRestaurantOpen`

---

### 2.3 ProductModal

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/ProductModal.jsx` |
| **Descripción** | Modal de personalización de producto. Permite seleccionar modifiers (obligatorios y opcionales), cantidad y nota. El botón de agregar está bloqueado hasta completar todos los grupos requeridos. |

**Props recibidas:**
```
product:  { id, name, desc, price, hue }
category: string
onClose:  () => void
onAdd:    (cartItem) => void
```

**Estados internos:**
```
selections: { [groupLabel]: string | string[] }
qty:        number (min: 1)
note:       string
```

**Lógica de precio:**
```
precioItem = (product.price + Σ extras.price) × qty
```

**Tipos de modifier:**
- `single` + `required: true` → obligatorio, radio visual, bloquea botón si vacío
- `multi` + `max: N` → opcional, checkboxes, máximo N selecciones

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Seleccionar opción `single` | Reemplaza selección en el grupo |
| Seleccionar/deseleccionar `multi` | Añade/quita (respeta `max`) |
| +/− cantidad | Ajusta `qty` (mínimo 1) |
| Escribir nota | Actualiza `note` |
| "Agregar al carrito" (habilitado) | → `onAdd(cartItem)` → `onClose()` |
| "Agregar al carrito" (deshabilitado) | Sin acción mientras falten requeridos |
| Click "×" / fuera del modal | → `onClose()` |

**Componentes usados:** `ProductImage`, `Icon.Plus`, `Icon.Minus`, `Icon.Close`, `MODIFIERS`

---

### 2.4 CartScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/MenuCartScreen.jsx` — export `CartScreen` |
| **Screen ID** | `cart` |
| **Descripción** | Resumen del carrito con items, precios y botón de checkout. Valida horario antes de permitir avanzar. |

**Props recibidas:**
```
cart:        Array<CartItem>
onBack:      () => void
onUpdateQty: (key, qty) => void
onRemove:    (key) => void
onCheckout:  () => void
```

**Validación de horario en checkout (FIX 1):**
- Botón "Continuar" deshabilita si `!isRestaurantOpen(PRIAMO).isOpen`
- Toast visible con mensaje de cierre si intenta avanzar fuera de horario

**Cálculo de precios:**
```
Subtotal = Σ(item.unitPrice × item.qty + extras)
Delivery = PRIAMO.fee = S/ 2.00 (solo en method 'delivery')
Total    = Subtotal + Delivery
```

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click "+" en item | → `onUpdateQty(key, qty + 1)` |
| Click "−" en item | → `onUpdateQty(key, qty - 1)` (si llega a 0 → `onRemove(key)`) |
| Click "×" en item | → `onRemove(key)` |
| Click "Continuar" (abierto) | → `onCheckout()` → navega a `checkout` |
| Click "Continuar" (cerrado) | Toast de error, no navega |
| Click "←" back | → `onBack()` → `menu` |

**Componentes usados:** `ProductImage`, `Icon.Close`, `Icon.Minus`, `Icon.Plus`, `IOSStatusBar`, `isRestaurantOpen`

---

### 2.5 AuthOnboarding — Flujo de 5 pasos

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/AuthOnboarding.jsx` |
| **Screen ID** | `auth` (overlay) |
| **Descripción** | Registro/autenticación en pager horizontal de 5 slides (500% de ancho, cada step = 20%). Dos flujos: Google (3 pasos reales) y Email (4 pasos). |

**Props recibidas:**
```
user:         null | { name, email, phone }
onClose:      () => void
onComplete:   ({ phone, address }) => void
onAuthMethod: (newUser) => void
```

**Estados internos:**
```
step:            'method' | 'email' | 'name' | 'phone' | 'address'
flowType:        'google' | 'email'
emailForm:       { name, email, password }
nameStepName:    string          // nombre editable en NameStep
provisionalUser: object | null
phone:           string
phoneError:      string
address:         { pinPos, line, reference }
refError:        string
```

**Pasos del pager:**

| Índice | Step | Flujo | Descripción | Chip de progreso |
|--------|------|-------|-------------|-----------------|
| 0 | `method` | Ambos | Elegir Google o Email | — |
| 1 | `email` | Solo Email | Nombre, email, contraseña | "Paso 1 de 2" |
| 1 | `name` | Solo Google | Editar nombre pre-llenado | "Paso 1 de 3" |
| 2 | `phone` | Ambos | Número WhatsApp | "Paso 2 de 2" / "Paso 2 de 3" |
| 3 | `address` | Ambos | Mapa + referencia | "Paso 2 de 2" / "Paso 3 de 3" |

**Flujo Google (3 pasos efectivos):**
```
MethodStep → NameStep (pre-llenado "Jesús Castillo") → PhoneStep → AddressStep
```

**Flujo Email (4 pasos efectivos):**
```
MethodStep → EmailStep → PhoneStep → AddressStep
```

**Validaciones por paso:**

| Paso | Campo | Regla |
|------|-------|-------|
| EmailStep | email | formato válido |
| EmailStep | password | ≥ 6 caracteres |
| EmailStep | name | ≥ 2 caracteres |
| NameStep | nameStepName | ≥ 2 caracteres, solo letras/espacios/tildes/ñ, sin números |
| PhoneStep | phone | exactamente 9 dígitos, primer dígito = '9' |
| AddressStep | reference | ≥ 6 caracteres |
| AddressStep | pinPos | dentro de zona de cobertura (3 km de San Jacinto) |

> **Nota de backend:** El NameStep pre-llena "Jesús Castillo / jesus.castillo@gmail.com" de forma hardcodeada. En producción, Google OAuth enviará el nombre y email reales.

**Validación de zona de cobertura (FIX 9):**
- Al soltar el pin → `isWithinCoverage(pinPos)` → distancia Haversine desde `COVERAGE_CENTER`
- Si `distanceKm > 3` → error en rojo bajo el mapa: "Esta dirección está fuera de nuestra zona de cobertura en San Jacinto"
- Botón "Guardar y continuar" deshabilitado mientras `!within`

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click "Continuar con Google" | `flowType = 'google'` → navega a `name` |
| Click "Continuar con email" | `flowType = 'email'` → navega a `email` |
| Editar nombre (NameStep) | Valida en tiempo real, habilita/deshabilita Continuar |
| Click "←" en NameStep | Regresa a `method` |
| Submit EmailStep | Valida → navega a `phone` |
| Submit PhoneStep | Valida → navega a `address` |
| Arrastrar pin en mapa | Actualiza `pinPos`, valida cobertura |
| Submit AddressStep | Valida cobertura + ref → `onComplete({ phone, address })` |
| Click "×" | → `onClose()` |

**Componentes usados:** `MapView`, `MapTiles`, `Icon.Back`, `Icon.Close`, `Icon.Check`, `isWithinCoverage`, `COVERAGE_CENTER`, `COVERAGE_RADIUS_KM`

---

### 2.6 CheckoutScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/CheckoutScreen.jsx` |
| **Screen ID** | `checkout` |
| **Descripción** | Datos de entrega: método (Delivery/Pickup), dirección, teléfono, nota. Incluye sección de resumen colapsable del pedido y validación de referencia de dirección. |

**Props recibidas:**
```
cart:          Array<CartItem>
user:          { addresses, phone }
order:         { method, addressId, phone, note }
setOrder:      (newOrder) => void
onBack:        () => void
onConfirm:     (orderData) => void
onAddAddress:  () => void
onEditAddress: (address) => void
frozen:        boolean
```

**Estados internos:**
```
showConfirm:   boolean    // modal de confirmación final
```

**Validaciones (el botón "Ir a pago" queda deshabilitado si falla alguna):**
```
1. user.addresses.length === 0 && method === 'delivery'
   → banner: "Necesitas agregar una dirección de entrega" + botón a AccountScreen

2. !selectedAddress && method === 'delivery'
   → botón deshabilitado

3. !isValidPhone(order.phone)
   → mensaje de error bajo el campo de teléfono

4. selectedAddress && selectedAddress.reference.trim().length < 20
   → advertencia: "La referencia de esta dirección es muy corta. Edítala antes de continuar"
```

**Sección de resumen colapsable (FIX 10):**
- Lista de productos con cantidades y precios
- Dirección de entrega (si delivery)
- Tiempo estimado: "~25–35 min"
- Total con delivery fee
- Botón de confirmar muestra: **"Confirmar pedido — S/ [total]"**

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click Delivery / Pick-up | Cambia `order.method` |
| Seleccionar dirección | Cambia `order.addressId` |
| Click "Añadir nueva dirección" | → `onAddAddress()` → `addressEdit` |
| Click "Editar" en dirección | → `onEditAddress(a)` → `addressEdit` |
| Editar teléfono | Actualiza `order.phone` |
| Editar nota | Actualiza `order.note` |
| Click "Ir a pago" (válido) | `showConfirm = true` |
| Click "Confirmar" en modal | → `onConfirm(orderData)` → `payment` |
| Click "Cancelar" en modal | `showConfirm = false` |
| Click "←" back | → `onBack()` → `cart` |

**Componentes usados:** `Segmented`, `AddressCard`, `Row`, `Icon.*`

---

### 2.7 DeliveryPaymentScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/CheckoutScreen.jsx` — componente `DeliveryPaymentScreen` |
| **Screen ID** | `payment` |
| **Descripción** | Selección de método de pago para delivery. Tres opciones. Validación de vuelto con límite máximo de S/ 50. |

**Props recibidas:**
```
total:     number
order:     { method, addressId, phone, note }
onBack:    () => void
onConfirm: ({ paymentMethod, change }) => void
```

**Estados internos:**
```
selected:     'yape' | 'cash' | 'prepay'
changeAmount: string
```

**Métodos de pago:**

| ID | Nombre | Badge | Comportamiento |
|----|--------|-------|----------------|
| `yape` | Yape al recibir | "Más usado" | Sin campos extra |
| `cash` | Efectivo al recibir | — | Campo de vuelto opcional |
| `prepay` | Prepagar por Yape | — | Avanza a PickupPaymentScreen |

**Validaciones del vuelto (FIX 11):**
```
Si changeAmount ingresado:
  changeAmount < total          → error: "El monto debe ser mayor o igual al total"
  changeAmount > total + 150    → error: "El máximo de vuelto que podemos dar es S/ 150"
  total ≤ changeAmount ≤ total + 150 → válido, muestra vuelto calculado = changeAmount - total
```

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click en tarjeta de método | Cambia `selected` |
| Ingresar vuelto (cash) | Valida rango [total, total + 50] |
| "Confirmar pedido" válido | → `onConfirm(...)` → `prepay` o `confirmed` |
| Click "←" back | → `onBack()` → `checkout` |

**Componentes usados:** `PaymentMethodCard`, `Icon.Check`

---

### 2.8 PickupPaymentScreen (Prepay)

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/CheckoutScreen.jsx` — componente `PickupPaymentScreen` |
| **Screen ID** | `prepay` |
| **Descripción** | Pantalla de prepago con Yape. Timer de 10 minutos, número Yape del restaurante, instrucciones numeradas, carga de comprobante. Aplica a delivery-prepay y pickup. |

**Props recibidas:**
```
total:     number
order:     { method }
onBack:    () => void
onPaid:    () => void
onTimeout: () => void
onCancel:  () => void
```

**Estados internos:**
```
timeLeft:   number (600 → 0, en segundos)
receipt:    null | string
uploading:  boolean
```

**Urgencia visual del timer:**
- `timeLeft > 60` → color normal
- `timeLeft ≤ 60` → color rojo con pulso

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Timer llega a 0 | → `onTimeout()` → `cancelled` (reason: 'timeout') |
| Click "Subir comprobante" | Simula upload → `onPaid()` → `confirmed` |
| Click "Cancelar pedido" | → `onCancel()` → `cancelled` (reason: 'user') |

> **Nota de backend:** En producción, la validación del comprobante debe hacerse server-side consultando la API de Yape o un sistema de verificación manual antes de confirmar el pedido.

**Datos del restaurante:**
```
Número Yape: PRIAMO.yape  →  987 654 321
Monto a pagar: total (S/)
```

---

### 2.9 OrderConfirmedScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/CheckoutScreen.jsx` |
| **Screen ID** | `confirmed` |
| **Descripción** | Confirmación con animaciones, número de pedido, método de pago y total. Botón atrás del navegador bloqueado. |

**Generación del ID de pedido (FIX 8):**
```javascript
id = 'TND-' + Date.now().toString().slice(-6)
// Ejemplo: TND-389412 — único hasta nivel de milisegundo
```

> **Nota de backend:** En producción usar un contador atómico o UUID en la BD para garantizar unicidad real.

**Animaciones:**
- `okPop` — check bounce al aparecer
- `drawCheck` — trazo del check dibujado (stroke-dashoffset)
- `ring` — anillo que expande alrededor del ícono

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click "Ver seguimiento" | → `onTrack()` → `tracking` |
| Click "Volver al inicio" | → `onHome()` → `landing` |
| Botón atrás navegador | Deshabilitado (no puede regresar al pago) |

---

### 2.10 TrackingScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/CheckoutScreen.jsx` |
| **Screen ID** | `tracking` |
| **Descripción** | Seguimiento del estado del pedido. Timeline de 5 estados con barra de progreso. Botón atrás bloqueado. |

**Estados del tracking:**

| Estado | Descripción |
|--------|-------------|
| `sent` | Pedido enviado al restaurante |
| `confirmed` | Restaurante confirmó |
| `preparing` | Preparando tu pedido |
| `ontheway` | Repartidor en camino |
| `delivered` | Pedido entregado |

> **Nota de backend:** En el prototipo el usuario avanza el estado manualmente con un botón de demo. En producción, el estado debe actualizarse por push notifications o WebSocket desde el sistema del restaurante.

**Link de soporte WhatsApp (FIX 4):**
```
Número:  SUPPORT_PHONE (src/data/index.js → '51999999999', placeholder)
Mensaje: "Hola Tindivo, tengo un problema con mi pedido [id del pedido]"
```

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click "Avanzar estado" (demo) | → `onAdvance()` → incrementa `trackingState` |
| Click "Volver al inicio" (solo en `delivered`) | → `onHome()` → `landing` |
| Click "Soporte WhatsApp" | Abre WhatsApp con mensaje pre-llenado |
| Botón atrás navegador | Deshabilitado |

---

### 2.11 OrderCancelledScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/CheckoutScreen.jsx` |
| **Screen ID** | `cancelled` |
| **Descripción** | Pedido cancelado. Dos variantes según la causa de cancelación. |

| Reason | Título | Mensaje |
|--------|--------|---------|
| `timeout` | "Se acabó el tiempo" | "No recibimos tu comprobante de Yape a tiempo." |
| `user` | "Pedido cancelado" | "Has cancelado tu pedido." |

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click "Intentar de nuevo" | → `onRetry()` → `payment` |
| Click "Volver al inicio" | → `onHome()` → `landing` |

---

### 2.12 AccountScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/AccountScreen.jsx` |
| **Screen ID** | `account` |
| **Descripción** | Perfil del usuario. Secciones: datos personales, direcciones guardadas, historial de pedidos y opciones de cuenta. |

**Props recibidas:**
```
user:           { name, email, phone, addresses }
setUser:        (newUser) => void
onBack:         () => void
onEditAddress:  (address) => void
onAddAddress:   () => void
onLogout:       () => void
onRepeatOrder:  (items) => void
orderInProgress: boolean   [FIX 3]
```

**Secciones:**

| Sección | Descripción |
|---------|-------------|
| **Perfil** | Avatar, nombre, email, teléfono con fondo gradient de marca |
| **Mis direcciones** | Lista de `AddressCard`. Botones Editar/Eliminar deshabilitados si `orderInProgress` |
| **Mis pedidos anteriores** | Listado de `PAST_ORDERS` con botón "Repetir pedido" |
| **Cuenta** | Editar perfil, Notificaciones, Ayuda, Términos, Cerrar sesión |

**Direcciones bloqueadas durante entrega en camino (FIX 3):**
```
orderInProgress = submittedOrder !== null &&
                  ['ontheway', 'delivered'].includes(trackingState)

Si orderInProgress === true:
  - Botones "Editar" y "Eliminar" deshabilitados
  - Texto informativo: "No puedes modificar tu dirección mientras tu pedido está en camino"
```

> **Nota:** `orderInProgress` lo calcula App.jsx y lo pasa como prop. En producción este dato debe venir del estado real del pedido en el backend.

**Historial de pedidos (FIX 13):**
- Datos de `PAST_ORDERS` (estático en demo)
- Cada pedido muestra: número, fecha, total, estado
- Botón "Repetir pedido" → `onRepeatOrder(items)` → añade al carrito → navega a `cart`
- Si sin pedidos: "Aún no tienes pedidos. ¡Haz tu primer pedido!"

> **Nota de backend:** En producción el historial debe consultarse por el ID del usuario autenticado. "Repetir pedido" debe validar disponibilidad actual de los productos en el menú.

**Cerrar sesión (FIX 12):**
```
handleLogout():
  1. Limpia localStorage key 'tindivo_cart'
  2. Resetea cart a []
  3. Resetea user a estado inicial
  4. navega a 'landing'
```

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click "←" back | → `onBack()` → pantalla anterior |
| Click "Editar" en dirección (libre) | → `onEditAddress(a)` → `addressEdit` |
| Click "Editar" en dirección (bloqueado) | Deshabilitado, texto informativo |
| Click "Predeterminada" | Actualiza `isDefault` en `user.addresses` |
| Click "+ Añadir dirección" | → `onAddAddress()` → `addressEdit` (isNew) |
| Click "Repetir pedido" | → `onRepeatOrder(items)` → `cart` |
| Click "Cerrar sesión" | Limpia localStorage + cart → `landing` |

---

### 2.13 AddressEditScreen

| Campo | Valor |
|-------|-------|
| **Archivo** | `src/components/screens/AccountScreen.jsx` — componente `AddressEditScreen` |
| **Screen ID** | `addressEdit` |
| **Descripción** | Creación o edición de dirección. Mapa interactivo, chips de label, validación de zona de cobertura y mínimo 20 caracteres en referencia. |

**Props recibidas:**
```
address:  { id, label, line, reference, pinPos, isDefault }
isNew:    boolean
onBack:   () => void
onSave:   (address) => void
onDelete: () => void
```

**Estados internos:**
```
label:      'Casa' | 'Trabajo' | 'Otro'
line:       string
reference:  string   (máx 140 caracteres)
pinPos:     { x, y }
isDefault:  boolean
coverage:   { within: boolean, distanceKm: number }
```

**Validaciones (FIX 7 y FIX 9):**
```
validLine      = line.trim().length >= 3
validRef       = reference.trim().length >= 20     [era 6, ahora 20]
outOfZone      = !coverage.within                  [zona de cobertura Haversine]
canSave        = validLine && validRef && !outOfZone
```

**Contador de referencia (FIX 7):**
- Color **rojo** si `reference.length < 20`
- Color **verde** si `reference.length >= 20`
- Placeholder: "Ej: Frente a la bodega de don Carlos, puerta azul, 2do piso"

**Validación de zona de cobertura (FIX 9):**
- Al soltar pin → `isWithinCoverage(pinPos)` (Haversine, radio 3 km)
- Si fuera: error en rojo bajo el mapa
- Botón "Guardar" deshabilitado mientras `!within`

> **Nota de backend:** La conversión pixel→lat/lng es una aproximación del mapa SVG. En producción usar Google Maps API o MapLibre con coordenadas reales.

**Acciones disponibles:**
| Acción | Resultado |
|--------|-----------|
| Click chip Casa/Trabajo/Otro | Cambia `label` |
| Arrastrar pin | Actualiza `pinPos`, recalcula `coverage` |
| Editar calle | Actualiza `line` |
| Editar referencia | Actualiza `reference` (con contador coloreado) |
| Toggle "Predeterminada" | Cambia `isDefault` |
| Click "Guardar" (válido) | → `onSave(address)` |
| Click "Eliminar" (si !isNew) | Confirma → `onDelete()` |
| Click "←" back | → `onBack()` |

---

## 3. FLUJOS CRÍTICOS COMPLETOS

### 3.1 Flujo: Delivery con pago al recibir (Yape o Efectivo)

```
ACTOR: Usuario autenticado, dentro de horario, con dirección guardada

1. [LandingScreen]
   → isRestaurantOpen(priamo).isOpen === true
   → Click en "Priamo" → navigateTo('menu')

2. [MenuScreen]
   → Click en "Margarita"
   → onOpenProduct(product, 'Pizzas') → modal = { product, category }

3. [ProductModal]
   → Selecciona Tamaño: "Familiar" (+S/ 8) — requerido ✓
   → Selecciona Masa: "Tradicional" — requerido ✓
   → Extra: "Jalapeños" (+S/ 1) — opcional
   → qty: 2
   → Precio total: (28 + 8 + 1) × 2 = S/ 74.00
   → Click "Agregar al carrito" → onAdd(item) → modal = null
   → cart persiste en localStorage ('tindivo_cart')

4. [MenuScreen]
   → FAB: "2 items · S/ 74.00"
   → Click FAB → isRestaurantOpen().isOpen === true → user.signedIn === true
   → navigateTo('cart')

5. [CartScreen]
   → Muestra: Margarita Familiar ×2 = S/ 74.00
   → Delivery: S/ 2.00 | Total: S/ 76.00
   → Click "Continuar" (validó horario) → navigateTo('checkout')

6. [CheckoutScreen]
   → method: 'delivery'
   → selectedAddress: "Casa - Jr. Sucre 412" (referencia ≥ 20 chars ✓)
   → Teléfono: 987654321 ✓
   → Resumen colapsable visible con total "S/ 76.00"
   → Botón: "Confirmar pedido — S/ 76.00"
   → Click → showConfirm = true

7. [Modal de confirmación]
   → Muestra: dirección, teléfono, método, total
   → Click "Confirmar" → onConfirm(orderData) → navigateTo('payment')

8. [DeliveryPaymentScreen]
   → Selecciona "Yape al recibir" (default, badge "Más usado")
   → Click "Confirmar pedido"
   → id = 'TND-' + Date.now().slice(-6)
   → navigateTo('confirmed')

9. [OrderConfirmedScreen]
   → Animaciones okPop + drawCheck + ring
   → Pedido #TND-389412 · Yape al recibir · S/ 76.00
   → Click "Ver seguimiento" → navigateTo('tracking')

10. [TrackingScreen]
    → trackingState: 'sent'
    → [Demo] Click "Avanzar" ×4
    → trackingState: 'delivered'
    → Botón "Volver al inicio" aparece
    → navigateTo('landing')
```

---

### 3.2 Flujo: Delivery con Prepago por Yape

```
(Pasos 1–7 idénticos al flujo 3.1)

8. [DeliveryPaymentScreen]
   → Selecciona "Prepagar por Yape"
   → Click "Confirmar pedido" → navigateTo('prepay')

9. [PickupPaymentScreen] (mode: 'delivery-prepay')
   → Timer: 10:00 descendiendo
   → Muestra: Yape a 987 654 321 · S/ 76.00
   → Instrucciones de 4 pasos
   → Usuario hace la transferencia y hace screenshot

   [RAMA EXITOSA]
   → Click "Subir comprobante" → simula upload
   → onPaid() → navigateTo('confirmed')
   → (continúa igual que flujo 3.1 paso 9–10)

   [RAMA ERROR: Timer llega a 0]
   → onTimeout() → navigateTo('cancelled') reason='timeout'
   → [OrderCancelledScreen]: "Se acabó el tiempo para pagar"
   → Click "Intentar de nuevo" → navigateTo('payment')
   → Click "Volver al inicio" → navigateTo('landing')
```

> **Nota de backend:** En producción, `onPaid()` solo debe ejecutarse después de verificar la transferencia en el sistema bancario o API de Yape, no al subir cualquier imagen.

---

### 3.3 Flujo: Pick-up (retiro en local)

```
(Pasos 1–4 idénticos al flujo 3.1)

5. [CartScreen]
   → Total: S/ 74.00 (sin delivery fee)
   → navigateTo('checkout')

6. [CheckoutScreen]
   → Selecciona "Pick-up" en Segmented
   → Selector de dirección oculto
   → Solo teléfono y nota disponibles
   → Botón: "Confirmar pedido — S/ 74.00"

7. [DeliveryPaymentScreen]
   → Solo opción disponible: "Prepagar por Yape"
   → navigateTo('prepay') mode='pickup'

8. [PickupPaymentScreen] (mode: 'pickup')
   → Mismo flujo que prepago
   → onPaid() → navigateTo('confirmed')

9–10. (Igual al flujo 3.1)
```

---

### 3.4 Flujo: Registro/Onboarding — vía Google

```
ACTOR: Usuario nuevo, sin cuenta

1. [LandingScreen] → Click "Ingresar" → authOpen = true

2. [AuthOnboarding — MethodStep]
   → Click "Continuar con Google"
   → flowType = 'google'
   → provisionalUser = { name: 'Jesús Castillo', email: 'jesus.castillo@gmail.com' }
   → navega a NameStep

3. [NameStep] — "Paso 1 de 3"
   → Input pre-llenado con "Jesús Castillo" (editable)
   → Valida: ≥2 chars, solo letras/espacios/tildes/ñ
   → Click "Continuar" → navega a PhoneStep

4. [PhoneStep] — "Paso 2 de 3"
   → Ingresa: "987 654 321"
   → Valida: 9 dígitos, primer dígito '9' ✓
   → Click "Continuar" → navega a AddressStep

5. [AddressStep] — "Paso 3 de 3"
   → Arrastra pin al centro de San Jacinto
   → isWithinCoverage(pinPos) → within: true, distanceKm: 0.3 ✓
   → Ingresa calle: "Jr. Bolognesi 245"
   → Ingresa referencia: "Frente a la bodega de la esquina, portón celeste" (≥6 chars ✓)
   → Click "Guardar y continuar"
   → onComplete({ phone, address })

6. [App.handleAuthComplete]
   → user.signedIn = true
   → user.addresses.push({ ...address, isDefault: true })
   → authOpen = false
   → Retorna a la pantalla de origen
```

---

### 3.5 Flujo: Registro/Onboarding — vía Email

```
2. [MethodStep] → Click "Continuar con correo" → navega a EmailStep

3. [EmailStep] — "Paso 1 de 2"
   → Nombre: "María García"
   → Email: "maria@gmail.com" ✓
   → Contraseña: "pass123" (≥6 chars ✓)
   → Click "Crear cuenta" → navega a PhoneStep

4. [PhoneStep] — "Paso 2 de 2"
   → (igual que flujo Google desde paso 4)
```

> **Nota de backend:** El paso EmailStep no crea una cuenta real. En producción debe llamar a un servicio de autenticación (Firebase Auth, Supabase, custom JWT) y verificar el email antes de completar el registro.

---

### 3.6 Flujo: Gestión de Carrito Persistente (FIX 2)

```
ESCENARIO A: Usuario cierra y reabre la app con carrito guardado

1. App.jsx onMount → loadCart() → recupera 'tindivo_cart' de localStorage
2. Valida que cada item.productId exista en MENU actual
3. Items válidos → cart restaurado
4. Si isRestaurantOpen().isOpen === false → muestra banner:
   "Tenías productos guardados. Podrás completar tu pedido cuando abramos a las 6:00 PM"

ESCENARIO B: Logout limpia el carrito

1. handleLogout() →
   a. localStorage.removeItem('tindivo_cart')
   b. setCart([])
   c. navigateTo('landing')

ESCENARIO C: Carrito se modifica

1. handleAddToCart / handleUpdateQty / handleRemove
2. useEffect [cart] → saveCart(cart) → localStorage.setItem('tindivo_cart', JSON.stringify(cart))
```

---

### 3.7 Flujo: Manejo de Errores

#### Error A: Restaurante cerrado al intentar abrir carrito
```
[MenuScreen] → Click FAB → isRestaurantOpen().isOpen === false
→ closedToast = true
→ Toast: "Lo sentimos, Priamo ya no acepta pedidos por hoy. Volvemos mañana a las 6:00 PM"
→ No navega
```

#### Error B: No hay direcciones guardadas en checkout (Delivery)
```
[CheckoutScreen] → method='delivery', user.addresses.length === 0
→ Banner: "Necesitas agregar una dirección de entrega"
→ Botón → navega a AccountScreen
→ Botón "Ir a pago" deshabilitado
```

#### Error C: Referencia de dirección muy corta en checkout
```
[CheckoutScreen] → selectedAddress.reference.trim().length < 20
→ Advertencia: "La referencia de esta dirección es muy corta. Edítala antes de continuar"
→ Botón "Ir a pago" deshabilitado
```

#### Error D: Vuelto inválido (pago efectivo)
```
[DeliveryPaymentScreen] → selected='cash'
→ changeAmount < total        → error: "El monto debe ser mayor o igual al total"
→ changeAmount > total + 150  → error: "El máximo de vuelto que podemos dar es S/ 150"
→ Botón deshabilitado en ambos casos
```

#### Error E: Timer de prepago agotado
```
[PickupPaymentScreen] → timeLeft === 0
→ onTimeout() → navigateTo('cancelled') reason='timeout'
→ [OrderCancelledScreen] → opciones: Reintentar o Volver
```

#### Error F: Carrito sin auth al abrir
```
[MenuScreen] → Click FAB → user.signedIn === false
→ authOpen = true → [AuthOnboarding]
→ Al completar → continúa hacia 'cart'
```

#### Error G: Dirección fuera de zona de cobertura
```
[AddressStep / AddressEditScreen] → soltar pin fuera de 3 km
→ isWithinCoverage().within === false
→ Error: "Esta dirección está fuera de nuestra zona de cobertura en San Jacinto"
→ Botón "Guardar" deshabilitado
```

#### Error H: Nombre inválido en NameStep
```
[NameStep] → nameStepName contiene números o caracteres especiales, o < 2 chars
→ Borde rojo en input + mensaje de error
→ Botón "Continuar" deshabilitado
```

#### Error I: Referencia de dirección < 20 chars
```
[AddressEditScreen] → reference.trim().length < 20
→ Contador en rojo: "X / 140"
→ Botón "Guardar" deshabilitado
```

#### Error J: Teléfono inválido
```
[AuthOnboarding PhoneStep / CheckoutScreen] → phone ≠ 9 dígitos o no empieza en '9'
→ Error: "Ingresa un número válido de 9 dígitos comenzando con 9"
→ Botón deshabilitado
```

---

## 4. COMPONENTES REUTILIZABLES

### 4.1 De `src/components/ui.jsx`

| Componente | Props | Propósito |
|-----------|-------|-----------|
| `ProductImage` | `hue, size` | Placeholder de imagen con color HSL dinámico basado en `hue`. |
| `Segmented` | `options, value, onChange` | Control de tabs pill. Usado en CheckoutScreen (Delivery/Pickup). |
| `ScreenHeader` | `title, onBack, action` | Encabezado con título centrado y botón back. |
| `Icon.*` | — | SVGs inline: Search, Bag, Back, Close, Star, Clock, Pin, Plus, Minus, Check, Upload, Phone, Truck, Store. |

### 4.2 De `src/components/IosFrame.jsx`

| Componente | Props | Propósito |
|-----------|-------|-----------|
| `IOSDevice` | `width, height, dark, title, keyboard` | Marco visual del dispositivo iOS (402×874px) con Dynamic Island. |
| `IOSStatusBar` | `dark` | Barra de estado: hora, señal, WiFi, batería. |
| `IOSNavBar` | `title, onBack, dark` | Barra de navegación con back y título. |
| `IOSGlassPill` | `children, onClick, style` | Botón efecto "frosted glass" estilo iOS 26 Liquid Glass. |
| `IOSListRow` | `label, detail, onPress, disclosure` | Fila de lista estilo iOS. |
| `IOSList` | `children` | Contenedor de filas con separadores iOS. |
| `IOSKeyboard` | — | Teclado numérico iOS simulado (decorativo). |

### 4.3 Componentes inline reutilizados

| Componente | Definido en | Propósito |
|-----------|-------------|-----------|
| `MapView` | AuthOnboarding, AccountScreen | Mapa SVG interactivo con pin arrastrable y validación de cobertura. |
| `MapTiles` | Mismo | SVG base del mapa con grid, caminos y elementos del barrio. |
| `AddressCard` | AccountScreen, CheckoutScreen | Card de dirección con ícono emoji (🏠/💼/📍), datos, acciones y bloqueo si `orderInProgress`. |
| `PaymentMethodCard` | CheckoutScreen | Card seleccionable de método de pago con radio visual. |
| `PrepayDetails` | CheckoutScreen | Número Yape, monto y instrucciones del restaurante. |
| `PickupStep` | CheckoutScreen | Paso numerado (círculo + texto) para la guía de prepago. |
| `Row` | CheckoutScreen | Fila label/valor para resúmenes de precio. |
| `SupportLink` | CheckoutScreen, TrackingScreen | Link a WhatsApp de Tindivo con mensaje pre-llenado que incluye el número de pedido. |

### 4.4 Funciones utilitarias en `src/data/index.js`

| Función | Parámetros | Retorna | Propósito |
|---------|-----------|---------|-----------|
| `isRestaurantOpen(restaurant)` | `restaurant` object | `{ isOpen: boolean, message: string }` | Valida horario según `openTime` (18) y `lastOrderTime` (22.75). |
| `haversineKm(lat1, lng1, lat2, lng2)` | 4 números | `number` (km) | Distancia en línea recta entre dos coordenadas. |
| `pixelToLatLng(pinPos)` | `{ x, y }` | `{ lat, lng }` | Convierte posición en píxeles del mapa SVG a coordenadas aproximadas. |
| `isWithinCoverage(pinPos)` | `{ x, y }` | `{ within: boolean, distanceKm: number }` | Valida si la posición del pin está dentro del radio de 3 km de San Jacinto. |

---

## 5. REGLAS DE NEGOCIO

### 5.1 Horario y Disponibilidad de Restaurantes
- Solo `Priamo` tiene `status: 'open'`; los demás restaurantes muestran "Próximamente".
- Horario activo de pedidos: **18:00 – 22:45** (6:00 PM – 10:45 PM).
- `openTime = 18` | `lastOrderTime = 22.75` | `closeTime = 23`.
- La validación de horario se ejecuta en: LandingScreen (card), MenuScreen (FAB), CartScreen (botón checkout).
- Fuera de horario: el restaurante es visible pero no interactuable. Se muestra el mensaje correspondiente.

### 5.2 Zona de Cobertura
- Centro: `{ lat: -9.1547, lng: -78.5042 }` (San Jacinto, Áncash).
- Radio máximo: **3 km** (Haversine).
- La validación aplica en: AuthOnboarding (AddressStep) y AddressEditScreen.
- Fuera de zona: botón de guardar deshabilitado, error visible bajo el mapa.
- La conversión píxel→lat/lng es una aproximación; se reemplazará con GPS real en producción.

### 5.3 Delivery Fee y Precios
- Fee de delivery fijo: **S/ 2.00** para método `delivery`.
- Pedidos con método `pickup`: sin delivery fee.
- Precio de item = `(precioBase + Σextras.price) × qty`.
- El total final se muestra en el botón de confirmación: "Confirmar pedido — S/ [total]".

### 5.4 Carrito y Persistencia
- Carrito persiste en `localStorage` con key `'tindivo_cart'`.
- Al recuperar el carrito: se valida que cada `productId` exista en `MENU` actual.
- Al cerrar sesión: `localStorage.removeItem('tindivo_cart')` + reset de estado.
- Key único por item: `productId + Date.now()` — permite el mismo producto con distintas configuraciones.
- Al reducir qty a 0: el item se elimina automáticamente.

### 5.5 Modifiers (Personalizaciones)
- Grupos `type: 'single'` son **obligatorios**; el botón "Agregar" queda bloqueado hasta seleccionar.
- Grupos `type: 'multi'` son **opcionales** con un máximo definido por `max`.
- Las bebidas no tienen modifiers.

### 5.6 Autenticación y Onboarding
- El carrito no puede abrirse sin autenticación; el intento redirige a AuthOnboarding.
- Flujo Google: MethodStep → NameStep → PhoneStep → AddressStep (3 pasos efectivos).
- Flujo Email: MethodStep → EmailStep → PhoneStep → AddressStep (4 pasos efectivos).
- El pager tiene 5 slides (500% ancho, 20% por slide).
- El chip de progreso se muestra desde el segundo step; adapta el texto a Google o Email.
- Google demo pre-llena: "Jesús Castillo" / "jesus.castillo@gmail.com".
- La primera dirección creada es `isDefault: true`.

### 5.7 Validación del Nombre
- Solo se aplica en el NameStep (flujo Google).
- Regla: ≥ 2 caracteres, solo letras, espacios, tildes (á é í ó ú ü) y ñ.
- Números y símbolos especiales rechazan la entrada con borde rojo y mensaje de error.

### 5.8 Teléfono
- Formato Perú: exactamente 9 dígitos, primer dígito = '9'.
- Se valida en PhoneStep del onboarding y en el campo de contacto del checkout.
- Se pre-llena con el número registrado durante el onboarding.

### 5.9 Direcciones
- Solo puede haber **una** dirección `isDefault: true`; marcar una desmarca las demás.
- Límite de referencia: **140 caracteres** (contador visible).
- Mínimo de referencia: **20 caracteres** — requerido tanto en el checkout como en AddressEditScreen.
- Mínimo de calle: **3 caracteres**.
- Las direcciones no pueden editarse ni eliminarse cuando `orderInProgress === true` (pedido en camino o entregado).

### 5.10 Checkout y Pago
- Para `pickup`: único método disponible es prepago por Yape.
- Para `delivery`: Yape al recibir, Efectivo al recibir, Prepago por Yape.
- Vuelto en efectivo: debe estar en el rango `[total, total + 150]`.
- Si la dirección seleccionada tiene `reference.length < 20`, el checkout está bloqueado.
- Si no hay ninguna dirección guardada, se muestra un banner de alerta en checkout (delivery).

### 5.11 Prepago (Timer)
- Timer: **600 segundos (10 minutos)**.
- En los últimos 60 segundos: color rojo con animación de pulso.
- Timer en 0 → pedido cancelado por `reason: 'timeout'`.
- Número Yape del restaurante: `PRIAMO.yape = '987 654 321'`.

### 5.12 Número de Pedido
- Formato: `'TND-' + Date.now().toString().slice(-6)`.
- Único hasta nivel de milisegundo en el prototipo.
- En producción: reemplazar por secuencia atómica o UUID en la BD.

### 5.13 Seguimiento de Pedido
- Estados secuenciales no reversibles: `sent → confirmed → preparing → ontheway → delivered`.
- `orderInProgress = submittedOrder !== null && ['ontheway', 'delivered'].includes(trackingState)`.
- El botón "Volver al inicio" solo aparece en estado `delivered`.
- Botón atrás del navegador deshabilitado en `confirmed` y `tracking`.

### 5.14 WhatsApp de Soporte
- Constante: `SUPPORT_PHONE = '51999999999'` (placeholder en data/index.js — reemplazar con número real).
- Mensaje pre-llenado: `"Hola Tindivo, tengo un problema con mi pedido [id del pedido]"`.
- El id del pedido se inyecta si está disponible en el contexto (TrackingScreen, OrderConfirmedScreen).

### 5.15 Historial y "Repetir pedido"
- Historial actual: datos estáticos de `PAST_ORDERS` (3 pedidos de ejemplo).
- "Repetir pedido" añade los items del pedido anterior al carrito actual y navega a `cart`.
- Si el carrito ya tiene items, los del pedido repetido se suman (no reemplazan).
- En producción: debe validar que los productos sigan disponibles en el menú actual.

### 5.16 Botón Atrás del Navegador
- Cada `navigateTo(screen)` llama `window.history.pushState(...)`.
- Listener `popstate` mapea el back a la pantalla lógica anterior.
- Pantallas con back deshabilitado: `confirmed`, `tracking`.
- Mapa de back:
  ```
  menu → landing | cart → menu | checkout → cart | payment → checkout
  prepay → payment | account → landing | addressEdit → account
  ```

---

## 6. ESTADO GLOBAL — ESTRUCTURA COMPLETA (App.jsx)

```javascript
screen:          string               // pantalla activa
user: {
  signedIn:      boolean,
  name:          string,
  email:         string,
  phone:         string,
  addresses:     Address[]
}
cart:            CartItem[]           // persiste en localStorage
modal:           null | { product, category }
authOpen:        boolean
editingAddress:  null | Address
order: {
  method:        'delivery' | 'pickup',
  addressId:     string | null,
  phone:         string,
  note:          string
}
confirmedTotal:  number
submittedOrder:  null | { id, phone, payment }
trackingState:   'sent' | 'confirmed' | 'preparing' | 'ontheway' | 'delivered'
cancelReason:    'timeout' | 'user' | null
checkoutFrozen:  boolean

// Derivado (no es estado, se calcula)
orderInProgress = submittedOrder !== null &&
                  ['ontheway', 'delivered'].includes(trackingState)
```

---

## 7. DATOS ESTÁTICOS (`src/data/index.js`)

### Constantes de configuración

| Constante | Valor | Uso |
|-----------|-------|-----|
| `PRIAMO.openTime` | `18` | Hora de apertura (6 PM) |
| `PRIAMO.lastOrderTime` | `22.75` | Último pedido (10:45 PM) |
| `PRIAMO.closeTime` | `23` | Cierre (11 PM) |
| `PRIAMO.yape` | `'987 654 321'` | Número para transferencias |
| `PRIAMO.fee` | `2.0` | Delivery fee en soles |
| `SUPPORT_PHONE` | `'51999999999'` | WhatsApp soporte (placeholder) |
| `COVERAGE_CENTER` | `{ lat: -9.1547, lng: -78.5042 }` | Centro de cobertura |
| `COVERAGE_RADIUS_KM` | `3` | Radio de cobertura en km |

### Menú de Priamo

**Pizzas (4 productos):** Margarita S/ 28, Pepperoni S/ 34, Priamo Especial S/ 39, Cuatro Quesos S/ 36.

**Hamburguesas (3 productos):** Clásica Priamo S/ 24, BBQ Bacon S/ 29, Pollo Crocante S/ 22.

**Bebidas (4 productos):** Inca Kola S/ 5, Chicha Morada S/ 9, Coca-Cola S/ 5, Agua San Mateo S/ 4.

### Modifiers

| Categoría | Grupos | Tipo |
|-----------|--------|------|
| Pizzas | Tamaño (req.), Tipo de masa (req.), Extras (multi, max 3) | single / multi |
| Hamburguesas | Término (req.), Acompañamiento (req.), Extras (multi, max 3), Salsa (multi, max 2) | single / multi |
| Bebidas | Sin modifiers | — |

---

## 8. ARQUITECTURA TÉCNICA

```
src/
├── pages/
│   ├── _app.js          → Entrada Next.js, importa globals.css
│   ├── _document.js     → HTML base, fuentes (Bricolage Grotesque, Geist, JetBrains Mono)
│   └── index.js         → Renderiza <App /> centrado
│
├── components/
│   ├── App.jsx          → Estado global, navigateTo(), popstate listener, carrito localStorage
│   ├── IosFrame.jsx     → Componentes UI sistema iOS
│   ├── ProductModal.jsx → Modal de personalización de producto
│   ├── ui.jsx           → Icon, ProductImage, Segmented, ScreenHeader
│   └── screens/
│       ├── LandingScreen.jsx    → Inicio + validación de horario
│       ├── MenuCartScreen.jsx   → MenuScreen + CartScreen
│       ├── AuthOnboarding.jsx   → 5 steps (method/email/name/phone/address)
│       ├── CheckoutScreen.jsx   → Checkout + Payment + Prepay + Confirmed + Cancelled + Tracking
│       └── AccountScreen.jsx    → AccountScreen + AddressEditScreen
│
└── data/
    └── index.js         → PRIAMO, TINDIVO, RESTAURANTS, MENU, MODIFIERS,
                           SEED_ADDRESSES, PAST_ORDERS, SUPPORT_PHONE,
                           COVERAGE_CENTER, COVERAGE_RADIUS_KM,
                           isRestaurantOpen(), haversineKm(),
                           pixelToLatLng(), isWithinCoverage()
```

**Stack:**
- Framework: Next.js 16.2.6 (Pages Router)
- UI: React 19.2.4
- Estilos: Inline styles (sin Tailwind, sin CSS Modules)
- Estado: useState / useRef / useEffect (sin Redux/Zustand)
- Persistencia: localStorage (carrito) + in-memory (usuario/orden)
- Navegación: `window.history.pushState` + listener `popstate`
- Despliegue: Vercel (vercel.json configurado)

---

*Documento v2 — generado automáticamente a partir del análisis del código fuente de Tindivo-Demo con los 15 fixes aplicados.*
