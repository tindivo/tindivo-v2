# 07 · Flujo del cliente final · tindivo.com

> Flujo end-to-end de la PWA del cliente final. Replica fiel del demo en `C:\Users\mauri\Downloads\jesus`. 13 pantallas con reglas de negocio detalladas. Fuente canónica: `REQUIREMENTS.md` del demo.

---

## Tabla de contenidos

- [1. Visión del flujo](#1-visión-del-flujo)
- [2. Mapa de pantallas](#2-mapa-de-pantallas)
- [3. Reglas de negocio centrales](#3-reglas-de-negocio-centrales)
- [4. Pantalla · Landing](#4-pantalla--landing)
- [5. Pantalla · Menú del negocio](#5-pantalla--menú-del-negocio)
- [6. Modal · Producto con modifiers](#6-modal--producto-con-modifiers)
- [7. Pantalla · Carrito](#7-pantalla--carrito)
- [8. Sheet · Auth y onboarding](#8-sheet--auth-y-onboarding)
- [9. Pantalla · Checkout](#9-pantalla--checkout)
- [10. Modal · Confirmación de entrega](#10-modal--confirmación-de-entrega)
- [11. Pantalla · Pago](#11-pantalla--pago)
- [12. Pantalla · Prepago Yape](#12-pantalla--prepago-yape)
- [13. Pantalla · Confirmación de pedido](#13-pantalla--confirmación-de-pedido)
- [14. Pantalla · Tracking](#14-pantalla--tracking)
- [15. Pantalla · Cancelado](#15-pantalla--cancelado)
- [16. Pantalla · Mi cuenta](#16-pantalla--mi-cuenta)
- [17. Pantalla · Editor de direcciones](#17-pantalla--editor-de-direcciones)
- [18. Fix del bug `onPrepayUpload`](#18-fix-del-bug-onprepayupload)

---

## 1. Visión del flujo

`tindivo.com` es una PWA pública mobile-first. **Premisa**: onboarding diferido — el cliente explora el menú y arma su carrito sin necesidad de cuenta. Solo cuando intenta avanzar a checkout, se le pide registro.

**Audiencia**: cliente final del pueblo (5,000-50,000 habitantes), no tech-savvy promedio. La app está pensada para que **una abuela pueda pedir desde su nieto/a celular** sin fricción.

**Diseño base**: extraído pixel a pixel del demo `Tindivo.html`. Paleta `#F97316` brand, fondo cálido `#FAF6F1`. Tipografías Bricolage Grotesque (display) / Geist (body) / JetBrains Mono (microlabels). Ver `06-ui-design-system.md`.

**Estado actual del demo**: prototipo client-side sin backend. En v2 se conecta a `api.tindivo.com`. Se mantiene 1:1 la UI/UX, animaciones, efectos.

---

## 2. Mapa de pantallas

13 pantallas conmutables via state machine. Estructura:

```
┌──────────────┐
│   LANDING    │◄────┐
│ (negocios)   │     │
└──────┬───────┘     │
       │ pick        │
       ▼             │
┌──────────────┐     │
│     MENU     │     │
└──────┬───────┘     │
   tap producto      │
       ▼             │
┌──────────────┐     │
│PRODUCT MODAL │     │
│  + modifiers │     │
└──────┬───────┘     │
   agregar           │
       ▼             │
┌──────────────┐     │
│    CART      │     │
└──────┬───────┘     │
  continuar          │
       │             │
   ┌───┴───┐         │
   │       │         │
   │       ▼         │
   │  ┌────────┐     │
   │  │  AUTH  │     │
   │  │ SHEET  │     │
   │  └───┬────┘     │
   ▼      ▼          │
┌────────────────┐   │
│   CHECKOUT     │   │
└──────┬─────────┘   │
revisar              │
       ▼             │
┌────────────────┐   │
│ CONFIRM-DELIV  │   │
│ (modal)        │   │
└──────┬─────────┘   │
       ▼             │
┌────────────────┐   │
│   PAYMENT      │   │
│ (3 métodos)    │   │
└─┬─────┬──────┬─┘   │
Yape │ Prepay  │     │
     │   │     │     │
     │   ▼     │     │
     │ ┌────┐  │     │
     │ │PREPAY  │     │
     │ │timer│  │     │
     │ └─┬──┘  │     │
     │   │     │     │
     ▼   ▼     │     │
┌─────────────┐│     │
│  CANCELLED  ││     │
└─────────────┘│     │
               ▼     │
        ┌─────────┐  │
        │CONFIRMED│  │
        └────┬────┘  │
             ▼       │
        ┌─────────┐  │
        │TRACKING │──┘
        └─────────┘

Paralelo (accesible desde landing/menu):
┌──────────┐    editar     ┌──────────────┐
│ ACCOUNT  ├──────────────►│ ADDRESS EDIT │
└──────────┘               └──────────────┘
```

Implementación: estado global `currentScreen` en Zustand store + Next.js App Router para SEO de landing y tracking público.

---

## 3. Reglas de negocio centrales

15 reglas inviolables del flujo cliente:

1. **Onboarding diferido**. El usuario arma carrito sin login. Login se exige al avanzar a checkout.
2. **Auth gate dual**:
   - **Gate suave** (`handleOpenCart`): al abrir el carrito sin sesión, se abre el sheet pero **se puede dismissar** y ver el carrito igual.
   - **Gate duro** (`handleProceedToCheckout`): al pulsar Continuar sin perfil completo, el sheet **reabre y bloquea** el avance.
3. **`isOnboardingComplete(u)`**: requiere `u.signedIn && u.phone && u.addresses.length > 0`. Google auth devuelve user con `phone=''` y `addresses=[]`, por lo que la condición falla y dispara onboarding paso 2.
4. **Cálculo de precio del producto**: `(base + Σ modifiers.price) × qty`. Modificadores con `price: 0` se etiquetan "Incluido".
5. **Subtotal del carrito**: suma de `item.total` por línea (donde `unitPrice` ya incluye modifiers).
6. **Delivery fee**: viene de `business.delivery_fee` (en MVP S/2.00 para Priamo). En pick-up → **S/ 0.00**. Lo que cobra el negocio al cliente (no es la comisión Tindivo).
6.1. **Modalidad del pedido**: el cliente elige `pickup` o `delivery` en checkout SOLO si el negocio acepta ambas (`catalog_full`). Si el negocio solo acepta una, el toggle queda fijado. La modalidad determina la comisión Tindivo al negocio: pickup S/0.50, delivery S/3.00-3.50 según banda del driver.
7. **ETA**:
   - Delivery: `business.estimated_eta_min - business.estimated_eta_max` minutos "una vez confirmado el pago" (default 25-35).
   - Pick-up: `20-25 min` "después de confirmar pago".
8. **Validación de teléfono PE**: regex `^9\d{8}$`. Prefijo +51 fijo en UI.
9. **Límites de texto**: nota de producto **140 chars**, referencia de dirección **140**, nota del pedido **200**.
10. **Confirmación humana**: el negocio llama al cliente por teléfono para confirmar antes de preparar. **No hay auto-confirmación** en MVP.
11. **Cancelación por timer**: solo aplica al método **Prepago Yape** (timer 10:00). Yape al recibir / Efectivo no tienen timer.
12. **Orden ID**: generado en backend. `short_id` de 8 chars alfanuméricos. Ejemplo display: `#TND-ABC12345` (prefix TND solo en UI).
13. **Default address**: al eliminar la default, la primera restante se promueve automáticamente (trigger BD o lógica de endpoint).
14. **WhatsApp como canal único de soporte**: `+51 987654321`. Cada deep link incluye `#shortId` para contexto.
15. **Polígono de cobertura**: solo entregamos en San Jacinto (en MVP). Validación al confirmar checkout. Si la coord está fuera del bbox del pueblo, mensaje "Esta dirección está fuera de nuestra zona de cobertura. ¿Quieres pickup en el local?".

---

## 4. Pantalla · Landing

### Estado: `currentScreen = 'landing'`

### Layout

```
┌────────────────────────────────────┐
│ [9:41]  San Jacinto, Áncash    ⓜ  │  ← GlassTopBar
│                                    │
│       Tindivo                      │  ← Bricolage display-lg
│                                    │
│  Buenas noches, María 🍕            │  ← saludo personalizado
│                                    │
│  ┌────────────────────────────┐   │
│  │ 🔍 Buscar pizza, hambur...  │   │  ← Search bar (no funcional v1)
│  └────────────────────────────┘   │
│                                    │
│  ┌────────────────────────────┐   │
│  │  SOLO EN TINDIVO           │   │  ← SolarCTA pattern
│  │                            │   │
│  │  Pide en minutos,          │   │
│  │  paga al recibir o por     │   │
│  │  Yape.                     │   │
│  └────────────────────────────┘   │
│                                    │
│  Restaurantes                      │  ← heading-md
│  ┌────────────────────────────┐   │
│  │ MÁS PEDIDO                 │   │  ← label JetBrains
│  │ ┌──┐ Priamo                │   │
│  │ │📷│ Pizzas & hamburguesas │   │
│  │ └──┘ ~23 min · S/2.00     │   │  ← mono-sm
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ ┌──┐ La Nonna             │   │
│  │ │📷│ Próximamente...       │   │  ← grayscale (disabled)
│  │ └──┘ (deshabilitado)       │   │
│  └────────────────────────────┘   │
│                                    │
│  tindivo · v1.0 · piloto           │
│  Pedidos directos desde San        │  ← Footer caption
│  Jacinto. Hecho en Áncash.         │
└────────────────────────────────────┘
```

### RFs vinculadas (del demo)

- **RF-CAT-01** · Saludo contextual: "Buenas noches, {nombre}" con sesión, "¿Qué pedimos hoy en la noche?" sin sesión.
- **RF-CAT-02** · Etiqueta de ciudad "San Jacinto, Áncash" en monospace sobre wordmark.
- **RF-CAT-03** · Search bar visible (placeholder "Buscar pizza, hamburguesa, bebida…") pero **no funcional v1.0**.
- **RF-CAT-04** · Hero card promocional "SOLO EN TINDIVO · Pide en minutos, paga al recibir o por Yape."
- **RF-CAT-05** · Listar negocios con: nombre, tagline, badge ("Más pedido"), ETA, fee de delivery, foto, status.
- **RF-CAT-06** · Negocios con `status: 'soon'` deshabilitados con "Próximamente en Tindivo".
- **RF-CAT-07** · Footer informativo.
- **RF-CAT-08** · Avatar usuario en esquina superior derecha: abre `account` si logueado, sheet de auth si no.

### Datos cargados

- `GET /api/v1/platform-status` → mostrar banner si está cerrado.
- `GET /api/v1/public/businesses` → listado completo.
- `GET /api/v1/customer/profile` (si logueado) → para el saludo personalizado.

### Interacciones

- Tap en negocio activo → navega a Menu (`currentScreen = 'menu'`, `currentBusinessId = id`).
- Tap en negocio "soon" → toast "Próximamente en Tindivo".
- Tap en avatar:
  - Logueado: → `account`.
  - No logueado: → abre auth sheet.

### Estados

- **Loading**: skeleton de cards.
- **Empty**: si no hay negocios activos → "Aún no hay restaurantes disponibles. ¡Pronto sumamos!"
- **Plataforma cerrada**: banner amarillo arriba "El servicio opera {días} de {hora} a {hora}".

---

## 5. Pantalla · Menú del negocio

### Estado: `currentScreen = 'menu'`

### Layout

```
┌────────────────────────────────────┐
│ ←  Tindivo                    ⓜ   │  ← GlassTopBar con back
│                                    │
│  ┌─────────────────────────────┐  │
│  │ Priamo                       │  │  ← display-md
│  │ Pizzería · Hamburguesería    │  │  ← body
│  │ ~23 min · S/2.00 delivery   │  │  ← mono-sm
│  └─────────────────────────────┘  │
│                                    │
│  [Pizzas] [Hamburguesas] [Bebidas]│  ← tabs scroll-spy
│  ────────                          │
│                                    │
│  Pizzas                            │  ← heading-md
│  Masa madre, 24h de fermentación   │  ← body-sm muted
│                                    │
│  ┌────────────────────────────┐   │
│  │ MÁS PEDIDA                  │   │
│  │ Margarita                   │   │
│  │ Tomate San Marzano, mozza...│   │
│  │ S/ 28.00            [+]    │   │
│  └────────────────────────────┘   │
│  ... (más items)                  │
│                                    │
│  Hamburguesas                      │
│  ...                               │
│                                    │
│  Bebidas                           │
│  ◷ Inca Kola 500ml · S/ 5         │  ← layout compacto
│  ◷ Agua sin gas · S/ 3            │
│                                    │
│  ┌────────────────────────────┐   │
│  │  Ver mi pedido · 2 · S/46.00│   │  ← FAB BottomActionBar
│  └────────────────────────────┘   │
└────────────────────────────────────┘
```

### RFs vinculadas

- **RF-MENU-01** · Header del negocio con nombre, tagline, ETA, fee.
- **RF-MENU-02** · Tabs por categoría con scroll-spy.
- **RF-MENU-03** · Cada categoría con `name + blurb`.
- **RF-MENU-04** · Productos con nombre, descripción, precio base, placeholder con hue HSL único, badges.
- **RF-MENU-05** · Platos destacados (`is_compact: true` — nombre histórico de columna): primero en su categoría + badge "★ Destacado". Se gestiona con el toggle "Destacado" del editor de menú de negocios.
- **RF-MENU-06** · FAB "Ver mi pedido" persistente: muestra # items + subtotal cuando el carrito tiene contenido. Oculto si vacío.
- **RF-MENU-07** · Botón atrás (vuelve a landing) y avatar (abre cuenta).

### Datos cargados

- `GET /api/v1/public/businesses/{businessId}/menu`

### Interacciones

- Tap en categoría tab → scroll suave a la sección.
- Tap en item → abre product modal.
- Tap en FAB → navega a Cart.
- Scroll → updates active tab (scroll-spy).

---

## 6. Modal · Producto con modifiers

### Estado: `currentScreen = 'menu'` + `productModalItemId = X`

### Layout

```
┌────────────────────────────────────┐
│                              [X]   │  ← cierre
│                                    │
│  ┌────────────────────────────┐   │
│  │                            │   │
│  │   [ PEPPERONI HERO ]       │   │  ← imagen placeholder con hue
│  │                            │   │
│  └────────────────────────────┘   │
│                                    │
│  Pepperoni                         │  ← display-sm
│  Pepperoni picante, mozzarella...  │  ← body
│  Desde S/ 34.00                    │  ← mono-md
│                                    │
│  ─────────────────────────────     │
│                                    │
│  Tamaño              OBLIGATORIO   │  ← group header con badge
│  Elige una opción                  │
│  ○ Personal · 8 porciones · 25cm  │  ← Incluido
│  ● Familiar · 8 porciones · 33cm  │  ← +S/ 8.00 (seleccionada)
│  ○ Jumbo · 12 porciones · 40cm    │  ← +S/ 16.00
│                                    │
│  Tipo de masa        OBLIGATORIO   │
│  ● Tradicional                     │
│  ○ Delgada                         │
│  ○ Integral · +S/ 3                │
│                                    │
│  Extras                  0/3       │  ← counter live
│  ☐ Doble queso · +S/ 4             │
│  ☐ Champiñones · +S/ 3             │
│  ☐ Aceitunas negras · +S/ 2       │
│  ...                               │
│                                    │
│  Nota especial (opcional)          │
│  ┌────────────────────────────┐   │
│  │ Ej. sin cebolla, tocar     │   │
│  │ timbre 2 veces...           │   │
│  └────────────────────────────┘   │
│                          0/140     │
│                                    │
│  ─────────────────────────────     │
│  [-]  1  [+]      [Agregar · S/42]│  ← stepper + CTA
└────────────────────────────────────┘
```

### RFs vinculadas

- **RF-PROD-01** · Hero del producto + nombre + descripción + "Desde S/ XX.XX".
- **RF-PROD-02** · Grupos single (radio) o multi (checkbox).
- **RF-PROD-03** · Grupos `required: true` con etiqueta "**Obligatorio**".
- **RF-PROD-04** · Grupos multi con counter `n/max` y enforce de `max`.
- **RF-PROD-05** · Opciones con nombre, descripción opcional, precio incremental o "Incluido".
- **RF-PROD-06** · Nota especial 140 chars con contador.
- **RF-PROD-07** · Stepper (-, qty, +), default 1, mínimo 1.
- **RF-PROD-08** · CTA muestra precio total en vivo `(base + Σ modifiers) × qty`.
- **RF-PROD-09** · Si faltan grupos requeridos, CTA disabled con "Completa N opciones".
- **RF-PROD-10** · CTA habilitado "Agregar · S/ XX.XX". Al tap agrega al carrito y cierra modal.
- **RF-PROD-11** · Modal cerrable con X (Escape no funciona).

### Cálculo de precio en vivo

```ts
const unitPrice = item.basePrice + selectedModifiers.reduce((sum, m) => sum + m.additionalPrice, 0)
const total = unitPrice * qty
```

### Validaciones

- Cada grupo `required` debe tener al menos `minSelections` opciones marcadas.
- Cada grupo no puede tener más de `maxSelections`.
- Si requirements no cumplidos → CTA disabled.

### Animaciones

- Entrada: bottom sheet con spring (Motion).
- Selecciones single: animación de checkmark fade-in.
- Selecciones multi: checkbox toggle con haptic feedback (post-MVP).

---

## 7. Pantalla · Carrito

### Estado: `currentScreen = 'cart'`

### Layout

```
┌────────────────────────────────────┐
│ ←  Mi pedido                       │  ← GlassTopBar
│                                    │
│  ┌────────────────────────────┐   │
│  │ ┌──┐ Pepperoni      [X]   │   │  ← item row
│  │ │📷│ Familiar · Tradicional│   │  ← resumen modifiers
│  │ └──┘ "sin cebolla"          │   │  ← note entre comillas
│  │       [-] 2 [+]    S/ 92.00 │   │  ← stepper + total línea
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ ┌──┐ Burger Clásica  [X]   │   │
│  │ │📷│ Tres cuartos · Papas..│   │
│  │ └──┘ [-] 1 [+]    S/ 25.00 │   │
│  └────────────────────────────┘   │
│                                    │
│  ─────────────────────────────     │
│                                    │
│  Resumen                           │  ← heading-sm
│  Subtotal             S/ 117.00    │
│  Delivery              S/ 2.00     │
│  ─────────────────────────────     │
│  Total                S/ 119.00    │  ← heading-md, bold
│                                    │
│  ┌────────────────────────────┐   │
│  │ ⏱ Tiempo estimado de       │   │  ← info card
│  │   entrega: 25–35 min una   │   │
│  │   vez confirmado el pago    │   │
│  └────────────────────────────┘   │
│                                    │
│  ┌────────────────────────────┐   │
│  │  Continuar · S/ 119.00      │   │  ← CTA full
│  └────────────────────────────┘   │
└────────────────────────────────────┘
```

### RFs vinculadas

- **RF-CART-01** · Líneas con placeholder imagen, nombre, resumen de modifiers concatenado con `·`, nota entre comillas, stepper, precio línea.
- **RF-CART-02** · Cada línea con botón eliminar (X).
- **RF-CART-03** · Bloque "Resumen" con Subtotal · Delivery · Total.
- **RF-CART-04** · Card "Tiempo estimado de entrega".
- **RF-CART-05** · CTA "Continuar · S/ XX.XX".
- **RF-CART-06** · Si user no tiene sesión o perfil incompleto, abrir sheet de auth automáticamente al entrar al carrito (gate suave).
- **RF-CART-07** · Si user intenta continuar a checkout con onboarding incompleto, **forzar reapertura** del sheet (gate duro).
- **RF-CART-08** · Header con back (→ menu) + título "Mi pedido".

### Persistencia del carrito

En localStorage por business (para resiliencia ante refresh). Al cambiar de negocio (en post-MVP cuando haya varios), preguntar "Tu carrito tiene items de Priamo. ¿Vaciar y empezar nuevo?".

---

## 8. Sheet · Auth y onboarding

### Estado: `authSheetOpen = true`, `authStep = 1 | 2`

### Layout · Paso 1 (auth method)

```
┌────────────────────────────────────┐
│  ═══════                           │  ← drag handle
│                                    │
│  Inicia sesión para pedir          │  ← display-sm
│  Puedes completar esto después.    │  ← body-sm muted
│                                    │
│  ┌────────────────────────────┐   │
│  │  [G] Continuar con Google   │   │  ← Recomendado · 1 toque
│  │  Recomendado · 1 toque      │   │
│  └────────────────────────────┘   │
│                                    │
│  ───── o ─────                     │
│                                    │
│  Ingresar con correo               │
│  Sin verificación de correo        │  ← caption muted
│                                    │
│  ┌────────────────────────────┐   │
│  │ Nombre completo *           │   │
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ Correo *                    │   │
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ Contraseña *                │   │
│  │ Mínimo 6 caracteres         │   │
│  └────────────────────────────┘   │
│                                    │
│  ¿Ya tienes cuenta? Iniciar sesión │
│                                    │
│  ┌────────────────────────────┐   │
│  │  Crear cuenta               │   │
│  └────────────────────────────┘   │
│                                    │
│  Al continuar aceptas los Términos │
│  y la Política de privacidad.      │
└────────────────────────────────────┘
```

### Layout · Paso 2 (onboarding, después de Google o si falta phone/address)

```
┌────────────────────────────────────┐
│  ═══════                           │
│                                    │
│  Casi listo — Paso 2 de 2          │  ← step header
│                                    │
│  Tu dirección                      │
│                                    │
│  ┌────────────────────────────┐   │
│  │                            │   │
│  │   [Map SVG con pin]        │   │  ← InteractiveMap (Leaflet)
│  │                            │   │
│  │            [📍 Centrar]    │   │
│  └────────────────────────────┘   │
│                                    │
│  Etiqueta                          │
│  [🏠 Casa] [💼 Trabajo] [📍 Otro] │
│                                    │
│  Calle / Jirón (opcional)          │
│  ┌────────────────────────────┐   │
│  │ Jr. Sucre 412               │   │
│  └────────────────────────────┘   │
│                                    │
│  Referencia *                      │
│  ┌────────────────────────────┐   │
│  │ Frente al grifo azul        │   │
│  └────────────────────────────┘   │
│                          21/140    │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Guardar dirección           │   │
│  └────────────────────────────┘   │
└────────────────────────────────────┘
```

Si en este paso falta `phone`:

```
│  Tu teléfono                       │
│  +51 │ 987654321                   │
│  Debe empezar con 9 y tener 9      │
│  dígitos.                          │
│                                    │
│  ⚠ Nunca compartimos tu número.    │
│    Solo lo usa el motorizado del   │
│    pedido en curso.                │
```

### RFs vinculadas

- **RF-AUTH-01** · Permitir uso anónimo del menú y carrito sin login.
- **RF-AUTH-02** · Sheet ofrece 2 métodos: Continuar con Google + Ingresar con correo.
- **RF-AUTH-03** · Email signup: Nombre, Correo, Contraseña (mín 6).
- **RF-AUTH-04** · Google completa nombre + correo automático, deja pendiente teléfono + dirección.
- **RF-AUTH-05** · Onboarding multi-paso: Paso 1 = datos básicos + teléfono, Paso 2 = dirección.
- **RF-AUTH-06** · Teléfono prefijo +51 fijo, empezar con 9, 9 dígitos exactos.
- **RF-AUTH-07** · Disclaimer "Nunca compartimos tu número...".
- **RF-AUTH-08** · Dirección con pin draggable sobre mapa (Leaflet en v2, no SVG mock como en demo).
- **RF-AUTH-09** · Referencia obligatoria 140 chars con contador.
- **RF-AUTH-10** · Sheet permite "completar después" — cerrar sin completar y seguir explorando.
- **RF-AUTH-11** · Footer "Al continuar aceptas Términos y Política".
- **RF-AUTH-12** · Acceso explícito a "¿Ya tienes cuenta? Iniciar sesión".

### Auth gates

```ts
// Gate suave (handleOpenCart en demo)
function openCart() {
  setScreen('cart')
  if (!user.signedIn || !isOnboardingComplete(user)) {
    setAuthSheetOpen(true)  // se puede dismissar
  }
}

// Gate duro (handleProceedToCheckout en demo)
function proceedToCheckout() {
  if (!user.signedIn || !isOnboardingComplete(user)) {
    setAuthSheetOpen(true)  // bloquea, NO permite continuar
    return
  }
  setScreen('checkout')
}

function isOnboardingComplete(u: User) {
  return u.signedIn && u.phone && u.addresses.length > 0
}
```

### Validaciones

- Email único (verificar via `POST /public/customer-auth/register` que devuelve 409 si ya existe).
- Password mín 6 chars.
- Phone regex `^9\d{8}$`.
- Reference no vacío, max 140.

---

## 9. Pantalla · Checkout

### Estado: `currentScreen = 'checkout'`

### Layout

```
┌────────────────────────────────────┐
│ ←  Confirmar pedido                │
│                                    │
│  [● Delivery]  [ Pick-up ]         │  ← toggle binario
│                                    │
│  Entregar en                       │
│  ┌────────────────────────────┐   │
│  │ 🏠 Casa             POR DEF │   │  ← address card seleccionada
│  │ Jr. Sucre 412                │   │
│  │ San Jacinto, Áncash          │   │
│  │ Ref: Frente al grifo azul   │   │
│  └────────────────────────────┘   │
│  + Añadir nueva                    │
│                                    │
│  ℹ Solo entregamos en el polígono │
│    de cobertura de San Jacinto.    │
│                                    │
│  Teléfono de contacto              │
│  +51 │ 987654321        [editar]  │
│                                    │
│  Nota adicional (opcional)         │
│  ┌────────────────────────────┐   │
│  │ Ej. portón rojo, segundo... │   │
│  └────────────────────────────┘   │
│                          0/200     │
│                                    │
│  Resumen                           │
│  Pepperoni × 2          S/ 92.00   │
│  Burger Clásica         S/ 25.00   │
│  Delivery                S/ 2.00   │
│  ─────────────────────────         │
│  Total                S/ 119.00    │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Revisar y pagar · S/ 119.00 │   │
│  └────────────────────────────┘   │
└────────────────────────────────────┘
```

Si toggle = Pick-up:

```
│  Recoger en                        │
│  ┌────────────────────────────┐   │
│  │ Priamo                       │   │
│  │ Jr. Bolognesi 245            │   │
│  │ San Jacinto · 6 PM – 11 PM   │   │
│  │ Listo para recoger en        │   │
│  │ 20-25 min después de pago    │   │
│  └────────────────────────────┘   │
│                                    │
│  (sin sección de dirección)        │
│                                    │
│  Resumen                           │
│  ...                               │
│  Delivery               S/ 0.00    │  ← cambia a 0
│  ─────────────────────────         │
│  Total                 S/ 117.00   │  ← se reduce
```

### RFs vinculadas

- **RF-CHK-01** · Toggle Delivery / Pick-up renderizado según capacidades del negocio (ver RF-CHK-12 a 14). Default = Delivery cuando ambas están disponibles.
- **RF-CHK-02** · Delivery: dirección por defecto como card seleccionada con badge "Por defecto", opción "Añadir nueva".
- **RF-CHK-03** · Disclaimer "Solo entregamos en el polígono de cobertura...".
- **RF-CHK-04** · Pick-up: sección del negocio (nombre, dirección, horario, ETA 20-25 min).
- **RF-CHK-05** · Pick-up: delivery_fee = 0.00, total reducido.
- **RF-CHK-06** · Teléfono editable (pre-relleno) con +51.
- **RF-CHK-07** · Nota adicional 200 chars con contador.
- **RF-CHK-08** · Resumen idéntico al carrito.
- **RF-CHK-09** · CTA "Revisar y pagar · S/ XX.XX".
- **RF-CHK-10** · Al pulsar, mostrar **modal de confirmación de entrega** con preview map, recap, "Volver" / "Sí, ir al pago".
- **RF-CHK-11** · Permitir editar dirección desde el modal de confirmación.
- **RF-CHK-12** · Si el negocio tiene `accepts_web_pickup=true` Y `accepts_web_delivery=true` (modo `catalog_full`): toggle visible con ambas opciones, default Delivery, cliente puede cambiar.
- **RF-CHK-13** · Si el negocio tiene solo `accepts_web_pickup=true` (modo `catalog_pickup`): toggle fijado en Pick-up, deshabilitado para tap, con texto bajo el toggle: "Este negocio solo ofrece recojo en el local". Delivery_fee = 0.
- **RF-CHK-14** · Si el negocio tiene solo `accepts_web_delivery=true` (modo `catalog_delivery`): toggle fijado en Delivery, deshabilitado para tap, con texto: "Este negocio solo ofrece envío a domicilio".
- **RF-CHK-15** · El servidor valida en el endpoint `POST /public/customer-orders` que el `delivery_method` solicitado esté permitido por las capacidades del negocio. Si no, devuelve 422 `BUSINESS_RULE_VIOLATION` con detail explicativo (defensa en profundidad ante manipulación del cliente).

---

## 10. Modal · Confirmación de entrega

```
┌────────────────────────────────────┐
│                              [X]   │
│                                    │
│  Confirma tu entrega               │
│                                    │
│  ┌────────────────────────────┐   │
│  │ [Map preview con pin]       │   │
│  └────────────────────────────┘   │
│                                    │
│  Dirección                         │
│  Jr. Sucre 412                     │
│  Ref: Frente al grifo azul         │
│  [✏️ Editar esta dirección]       │
│                                    │
│  Contacto                          │
│  +51 987654321                     │
│                                    │
│  Productos                         │
│  Pepperoni × 2 · S/ 92.00          │
│  Burger Clásica · S/ 25.00         │
│                                    │
│  Delivery                S/ 2.00   │
│  Total                S/ 119.00    │
│                                    │
│  [Volver]    [Sí, ir al pago]      │
└────────────────────────────────────┘
```

Es un **step de doble-check** antes del pago.

---

## 11. Pantalla · Pago

### Estado: `currentScreen = 'payment'`

### Layout

```
┌────────────────────────────────────┐
│ ←  Método de pago                  │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Total a pagar               │   │
│  │ S/ 119.00                   │   │
│  │ Delivery · 25-35 min        │   │
│  └────────────────────────────┘   │
│                                    │
│  Elige cómo pagar                  │
│                                    │
│  ┌────────────────────────────┐   │
│  │ ● Yape al recibir   MÁS USADO│  ← seleccionado por default
│  │ El motorizado lleva su QR y │   │
│  │ número Yape. Le pagas al    │   │
│  │ recibir tu pedido.          │   │
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ ○ Efectivo al recibir       │   │
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ ○ Prepagar por Yape         │   │
│  └────────────────────────────┘   │
│                                    │
│  ℹ El restaurante te llamará en   │
│    breve al +51 987654321 para     │
│    confirmar tu pedido.            │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Enviar pedido               │   │  ← CTA varía según método
│  └────────────────────────────┘   │
└────────────────────────────────────┘
```

Si selecciona "Prepagar por Yape", se expande inline:

```
│  ┌────────────────────────────┐   │
│  │ ● Prepagar por Yape         │   │
│  │                            │   │
│  │ Yapea a Priamo              │   │
│  │ 987 654 321        [Copiar] │   │
│  │                            │   │
│  │ Monto exacto                │   │
│  │ S/ 119.00          [Copiar] │   │
│  │                            │   │
│  │ Sin subir captura. El      │   │
│  │ restaurante valida tu pago  │   │
│  │ por su lado y te llama.     │   │
│  └────────────────────────────┘   │
```

Y la CTA cambia a "Continuar al pago".

### RFs vinculadas

- **RF-PAY-01** · Card superior con total + entrega.
- **RF-PAY-02** · 3 métodos: Yape al recibir (más usado, default), Efectivo al recibir, Prepagar por Yape.
- **RF-PAY-03** · Yape al recibir muestra descripción al seleccionar.
- **RF-PAY-04** · Prepagar expande con número Yape + monto exacto, ambos copiables.
- **RF-PAY-05** · Prepagar: "**Sin subir captura.** El restaurante valida y te llama".
- **RF-PAY-06** · Card final "El restaurante te llamará en breve al +51..."
- **RF-PAY-07** · CTA varía: "Enviar pedido" (Yape/Efectivo) vs "Continuar al pago" (Prepagar).
- **RF-PAY-08** · Yape/Efectivo → pasa directo a Confirmed con ID generado.
- **RF-PAY-09** · Prepagar → pasa a screen `prepay`.

---

## 12. Pantalla · Prepago Yape

### Estado: `currentScreen = 'prepay'`

### Layout

```
┌────────────────────────────────────┐
│ ←  Prepago Yape                    │
│                                    │
│  ┌────────────────────────────┐   │
│  │ ⏱  Tiempo restante         │   │
│  │ 09:47                       │   │  ← Countdown live
│  │                            │   │
│  │ Si no recibimos tu          │   │
│  │ comprobante en 10 minutos,  │   │
│  │ el pedido se cancela.       │   │
│  └────────────────────────────┘   │
│                                    │
│  Datos del Yape                    │
│  Número 987 654 321        [📋]   │
│  Monto exacto S/ 119.00    [📋]   │
│                                    │
│  Cómo continuar                    │
│  1. Abre tu app Yape o Plin        │
│  2. Yapea el monto exacto al       │
│     número del restaurante         │
│  3. Toca "Ya yapeé" abajo          │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Ya yapeé                    │   │
│  └────────────────────────────┘   │
│                                    │
│  ¿Algún problema? Escríbenos       │  ← WhatsApp link
└────────────────────────────────────┘
```

Al tocar "Ya yapeé" → confirmed (sin subir captura en MVP).

Al expirar timer → cancelled (timeout).

---

## 13. Pantalla · Confirmación de pedido

### Estado: `currentScreen = 'confirmed'`

### Layout

```
┌────────────────────────────────────┐
│                                    │
│              ✓                     │  ← icono check grande
│                                    │
│  Tu pedido fue enviado             │  ← display-md
│                                    │
│  #TND-ABC12345                     │  ← mono-md
│                                    │
│  El restaurante te llamará en      │
│  breve para confirmarlo.           │
│                                    │
│  ┌────────────────────────────┐   │
│  │ 📞 Llamada a +51 987654321 │   │
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ 💳 Yape al recibir          │   │
│  │ Total · S/ 119.00           │   │
│  └────────────────────────────┘   │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Ver seguimiento del pedido  │   │  ← CTA primaria
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ Volver al inicio            │   │  ← CTA secundaria
│  └────────────────────────────┘   │
│                                    │
│  ¿Algún problema? Escríbenos       │
└────────────────────────────────────┘
```

### RFs vinculadas

- **RF-CONF-01** · Pantalla full-screen con icono check, ID `#TND-XXXXX`, mensaje "Tu pedido fue enviado".
- **RF-CONF-02** · Subtítulo: "El restaurante te llamará en breve para confirmarlo."
- **RF-CONF-03** · Card "Llamada a +51 XXXXXXXXX" con icono teléfono.
- **RF-CONF-04** · Card "Pago" con método + total.
- **RF-CONF-05** · CTA primaria "Ver seguimiento del pedido" → tracking.
- **RF-CONF-06** · CTA secundaria "Volver al inicio" → landing.
- **RF-CONF-07** · Link soporte: WhatsApp `wa.me/51987654321?text=Hola Tindivo 👋, tengo un problema con mi pedido #TND-XXXXX.` con ID URL-encoded.

---

## 14. Pantalla · Tracking

### Estado: `currentScreen = 'tracking'`

### Layout

```
┌────────────────────────────────────┐
│ ←  Tu pedido                       │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Pedido #TND-ABC12345        │   │
│  │ Preparando                  │   │  ← estado + descripción
│  │ El restaurante está         │   │
│  │ preparando tu pedido.       │   │
│  │ Paso 3 de 5 · 25-35 min     │   │
│  └────────────────────────────┘   │
│                                    │
│  ● 1. Pedido enviado · 19:00       │
│  │                                 │
│  ● 2. Confirmado · 19:01           │
│  │   Tu pedido fue confirmado      │
│  │   por teléfono                  │
│  │                                 │
│  ● 3. Preparando · 19:05           │  ← active
│  │                                 │
│  ○ 4. En camino                    │
│  │                                 │
│  ○ 5. Entregado                    │
│                                    │
│  Detalle                           │
│  Delivery · 3 productos            │
│  Pepperoni × 2 · S/ 92.00          │
│  Burger Clásica · S/ 25.00         │
│  Delivery · S/ 2.00                │
│  Total · S/ 119.00                 │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Cancelar pedido             │   │  ← solo si currentState !== 'confirmed'
│  └────────────────────────────┘   │
│  Puedes cancelar mientras el       │
│  restaurante aún no confirma.      │
│                                    │
│  ¿Algún problema? Escríbenos       │
└────────────────────────────────────┘
```

### RFs vinculadas

- **RF-TRK-01** · Header con back (→ landing) + título "Tu pedido".
- **RF-TRK-02** · Card de estado con `#TND-XXXXX`, estado, descripción, "Paso N de 5", ETA.
- **RF-TRK-03** · Stepper vertical de 5 estados: Pedido enviado · Confirmado · Preparando · En camino · Entregado.
- **RF-TRK-04** · Cada estado con título + subtítulo. Estado actual y previos marcados visualmente.
- **RF-TRK-05** · Card "Detalle" con modalidad, líneas y total pagado.
- **RF-TRK-06** · ~~Botón demo "avanzar estado"~~ — solo prototipo. **Removido en v2**.
- **RF-TRK-07** · Botón "Cancelar pedido" disponible mientras `currentState !== 'confirmed'`.
- **RF-TRK-08** · Link soporte WhatsApp (igual que RF-CONF-07).

### Realtime

Suscripción a Supabase Realtime canal `tracking:{shortId}`:

```ts
useEffect(() => {
  const channel = supabase
    .channel(`tracking:${shortId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `short_id=eq.${shortId}`,
    }, (payload) => {
      queryClient.invalidateQueries(['tracking', shortId])
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [shortId])
```

### Estado público sin login

`tindivo.com/pedidos/{shortId}` es accesible **sin autenticación** (RPC SECURITY DEFINER). Pero si el cliente está logueado, tiene acceso a más info (botón cancelar, link a su cuenta).

---

## 15. Pantalla · Cancelado

### Layout

```
┌────────────────────────────────────┐
│                                    │
│              ✕                     │  ← icono rojo
│                                    │
│  Pedido cancelado                  │
│                                    │
│  Se acabó el tiempo para pagar     │  ← razón
│                                    │
│  Tu pedido fue cancelado porque    │
│  no recibimos tu comprobante a     │
│  tiempo. Puedes volver a pedir     │
│  cuando quieras.                   │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Volver al menú              │   │
│  └────────────────────────────┘   │
│                                    │
│  ¿Algún problema? Escríbenos       │  ← incluye order ID
└────────────────────────────────────┘
```

### Razones de cancelación

- `timeout`: "Se acabó el tiempo para pagar"
- `business_cancelled`: "El restaurante canceló tu pedido"
- `admin_cancelled`: "Tindivo canceló tu pedido"
- `customer_cancelled`: "Cancelaste este pedido"
- `pending_acceptance_timeout`: "El restaurante no aceptó tu pedido"

### RFs vinculadas

- **RF-CANC-01** · Icono rojo, "Pedido cancelado", subtítulo según razón.
- **RF-CANC-02** · Body explicativo según razón.
- **RF-CANC-03** · CTA "Volver al menú".
- **RF-CANC-04** · Link soporte WhatsApp. **Fix de v1**: en demo el order ID llegaba como `—`. En v2 se pasa correctamente.

---

## 16. Pantalla · Mi cuenta

### Layout

```
┌────────────────────────────────────┐
│ ←  Mi cuenta                       │
│                                    │
│  ┌────────────────────────────┐   │
│  │  M       María Pérez        │   │
│  │          maria@gmail.com    │   │
│  │          +51 987654321      │   │
│  └────────────────────────────┘   │
│                                    │
│  Mis direcciones                   │
│  ┌────────────────────────────┐   │
│  │ 🏠 Casa            POR DEF │   │
│  │ Jr. Sucre 412               │   │
│  │                  [Editar]   │   │
│  └────────────────────────────┘   │
│  ┌────────────────────────────┐   │
│  │ 💼 Trabajo                  │   │
│  │ Av. Industrial 23           │   │
│  │ [Marcar default] [Editar]   │   │
│  └────────────────────────────┘   │
│  + Añadir                          │
│                                    │
│  Pedidos anteriores                │
│  ┌────────────────────────────┐   │
│  │ 🍕 Pepperoni × 2 + Burger   │   │
│  │ #TND-XXX · hace 3 días      │   │
│  │ S/ 119.00                   │   │
│  └────────────────────────────┘   │
│  (más pedidos...)                  │
│                                    │
│  Cuenta                            │
│  📝 Editar perfil                  │
│  🔔 Notificaciones                 │
│  ❓ Centro de ayuda                │
│  📄 Términos y privacidad          │
│  🚪 Cerrar sesión                  │
└────────────────────────────────────┘
```

### RFs vinculadas

- **RF-ACC-01** · Profile card con avatar (inicial), nombre, email, teléfono.
- **RF-ACC-02** · Direcciones con label icon (🏠/💼/📍), badge "Por defecto" en activa, botones Editar + Marcar default en no-default.
- **RF-ACC-03** · "+ Añadir" abre addressEdit con dirección vacía.
- **RF-ACC-04** · Pedidos anteriores con icono, descripción, ID + fecha relativa, monto.
- **RF-ACC-05** · 5 items navegables (Editar perfil, Notificaciones, Ayuda, Términos, Cerrar sesión). 4 primeros son placeholders post-MVP.
- **RF-ACC-06** · Cerrar sesión limpia user, vuelve a landing.

### Logout

```ts
import { signOutLocal } from '@tindivo/supabase'
await signOutLocal()
router.push('/')
```

---

## 17. Pantalla · Editor de direcciones

### Layout

```
┌────────────────────────────────────┐
│ ←  Editar dirección                │
│                                    │
│  Etiqueta                          │
│  [🏠 Casa] [💼 Trabajo] [📍 Otro] │
│                                    │
│  ┌────────────────────────────┐   │
│  │ [Map con pin draggable]    │   │
│  │             [📍 Centrar]   │   │
│  └────────────────────────────┘   │
│                                    │
│  Calle / Jirón (opcional)          │
│  ┌────────────────────────────┐   │
│  │ Jr. Sucre 412               │   │
│  └────────────────────────────┘   │
│                                    │
│  Referencia *                      │
│  ┌────────────────────────────┐   │
│  │ Frente al grifo azul        │   │
│  └────────────────────────────┘   │
│                          21/140    │
│                                    │
│  ☐ Usar como predeterminada        │
│    Aparece primero al hacer un     │
│    pedido nuevo.                   │
│                                    │
│  ┌────────────────────────────┐   │
│  │ Guardar cambios             │   │
│  └────────────────────────────┘   │
│                                    │
│  [Eliminar dirección]              │  ← solo al editar
└────────────────────────────────────┘
```

### RFs vinculadas

- **RF-ADDR-01** · Toggle de etiqueta: 🏠 Casa / 💼 Trabajo / 📍 Otro.
- **RF-ADDR-02** · Mapa con pin draggable y botón centrar (Leaflet en v2).
- **RF-ADDR-03** · "Calle/Jirón" opcional, "Referencia" obligatorio max 140 con contador.
- **RF-ADDR-04** · Toggle "Usar como predeterminada". No permite des-marcar la default actual (el sistema migra al guardar otra como default).
- **RF-ADDR-05** · "Eliminar dirección" disponible al editar (no al crear).
- **RF-ADDR-06** · Al eliminar la default, promueve la primera restante automáticamente.
- **RF-ADDR-07** · CTA "Guardar cambios" / "Guardar dirección".
- **RF-ADDR-08** · Volver vuelve a la pantalla de origen (`_from`: 'account' o 'checkout').

---

## 18. Fix del bug `onPrepayUpload`

**Bug del demo** (documentado en `REQUIREMENTS.md` §10):

> Al seleccionar **Prepagar por Yape** y pulsar **Continuar al pago**, consola lanza:
> ```
> ReferenceError: onPrepayUpload is not defined
>     at onClick (<anonymous>:1066:39)
> ```
> El callback `onPrepayUpload` se pasa como prop a `PaymentScreen` en `app.jsx:360`, pero no está destructurado en el componente de `screens-checkout.jsx`.

**Fix en v2**: en `apps/customer/src/features/checkout/components/payment-screen.tsx`, destructurar correctamente:

```tsx
type PaymentScreenProps = {
  // ...
  onSubmit: (method: PaymentMethod) => void
  onContinueToPrepay: () => void           // ← antes onPrepayUpload, renombrado
}

export function PaymentScreen({
  onSubmit,
  onContinueToPrepay,
  // ...
}: PaymentScreenProps) {
  const ctaLabel = selectedMethod === 'yape-prepay'
    ? 'Continuar al pago'
    : 'Enviar pedido'

  const handleClick = () => {
    if (selectedMethod === 'yape-prepay') {
      onContinueToPrepay()
    } else {
      onSubmit(selectedMethod)
    }
  }

  return (
    // ...
    <button onClick={handleClick}>{ctaLabel}</button>
  )
}
```

**Verificación**: añadir test E2E (post-MVP) que pruebe el flujo prepago end-to-end (selección → continuar → prepay screen → timer → ya yapeé → confirmed).

---

**Resumen**: `tindivo.com` replica el demo Jesus al pixel. 13 pantallas + 2 modales + 1 sheet. 15 reglas de negocio centrales. Bug `onPrepayUpload` corregido. Realtime para tracking. Onboarding diferido con auth gate dual (suave/duro).

**Próximo doc**: `09-flujo-negocios.md` — UI condicional por capacidades.
