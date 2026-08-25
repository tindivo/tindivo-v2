# 06 · UI design system

> Sistema de diseño completo. Tokens, tipografías, componentes, patrones, animaciones. Replica fiel al demo en `C:\Users\mauri\Downloads\jesus`. Compartido entre las 5 apps via `packages/ui`.

---

## Tabla de contenidos

- [1. Filosofía de diseño](#1-filosofía-de-diseño)
- [2. Paleta de color](#2-paleta-de-color)
- [3. Tipografía](#3-tipografía)
- [4. Iconografía](#4-iconografía)
- [5. Espaciado y border-radius](#5-espaciado-y-border-radius)
- [6. Elevación y sombras](#6-elevación-y-sombras)
- [7. Glassmorphism](#7-glassmorphism)
- [8. Animaciones](#8-animaciones)
- [9. Primitives (shadcn-based)](#9-primitives-shadcn-based)
- [10. Patterns Tindivo](#10-patterns-tindivo)
- [11. Layouts mobile-first](#11-layouts-mobile-first)
- [12. Estados de UI](#12-estados-de-ui)
- [13. Accesibilidad visual](#13-accesibilidad-visual)
- [14. Implementación en Tailwind v4](#14-implementación-en-tailwind-v4)

---

## 1. Filosofía de diseño

### Principios

1. **Cercano, no corporativo**. Tonos cálidos, redondeados, español peruano informal. No vendemos una app "enterprise", vendemos un servicio de barrio.
2. **Mobile-first 1:1**. Diseñado para 402×874 (iPhone 14 Pro). Si funciona ahí, funciona en cualquier mobile más grande. Las apps de staff escalan a desktop.
3. **Sin dark mode**. Fondo claro absoluto. Decisión consciente — en pueblos peruanos los usuarios prefieren claro por contraste con luz natural.
4. **Glassmorphism en topbars**, no en todo. Es un acento, no la base.
5. **Bordes muy redondeados** (1rem, 2rem, 3rem). El sistema es amable, no anguloso.
6. **Material Symbols como único icon set**. Sin emojis en código (excepción: títulos textuales como saludo "Buenas noches 🍕").
7. **Tipografía con personalidad**. Bricolage Grotesque para displays grandes (transmite carácter), Geist para body (legibilidad), JetBrains Mono para microlabels (estructura).
8. **Color naranja como protagonista**. Marca = `#F97316`. NO dilluir con secundarios. El naranja sostiene la identidad.
9. **Espacio en blanco generoso**. No saturar. Es preferible más vertical que más denso.
10. **Animaciones útiles**. Cada animación tiene propósito (jerarquía, feedback, transición). No animar por decoración.

### Anti-patrones a evitar

- ❌ Usar dark mode "por moda" — viola la regla del proyecto.
- ❌ Usar emojis como iconos UI — usamos Material Symbols.
- ❌ Bordes rectos (radius < 0.5rem) — rompen la consistencia cálida.
- ❌ Sombras pronunciadas dispersas — son elevación, no decoración.
- ❌ Animar elementos críticos al cargar (el usuario necesita actuar rápido).
- ❌ Multi-color secundarios genéricos. Si no es naranja, ink o surface, justificar.

---

## 2. Paleta de color

### Colores fundacionales

| Token | Hex | Uso |
|---|---|---|
| **Brand** | `#F97316` | Color de marca. CTA primary, énfasis, hero cards |
| **Brand Dark** | `#C2410C` | Hover de CTA, estados activos |
| **Brand Light** | `#FED7AA` | Backgrounds suaves, badges sutiles |
| **Ink** | `#1A1614` | Texto principal sobre superficies claras |
| **Ink Muted** | `#57534E` | Texto secundario, descriptions |
| **Ink Subtle** | `#A8A29E` | Placeholders, texto deshabilitado |
| **Surface** | `#FAF6F1` | Fondo principal de páginas (cálido off-white) |
| **Card** | `#FFFFFF` | Cards elevadas sobre Surface |
| **Border** | `#EAE7E2` | Bordes sutiles, separadores |

### Colores semánticos

| Token | Hex | Uso |
|---|---|---|
| **Success** | `#16A34A` | Toasts de éxito, badges "Entregado", estados confirmados |
| **Warning** | `#F59E0B` | Pedido demorado, alertas precaución |
| **Danger** | `#DC2626` | CTAs destructivas, errores, "URGENTE", "Cancelado" |
| **Info** | `#0EA5E9` | Notificaciones informativas, links |

### Colores de acento de negocios (papelito)

Cada negocio activo tiene UN color único asignado al crearse. La paleta predefinida:

| Nombre | Hex |
|---|---|
| Rosado | `#F472B6` |
| Azul cielo | `#38BDF8` |
| Verde menta | `#4ADE80` |
| Amarillo limón | `#FACC15` |
| Lavanda | `#A78BFA` |
| Naranja | `#F97316` (mismo que brand — solo se asigna si Tindivo no opera ese pueblo) |
| Lila | `#C084FC` |
| Turquesa | `#2DD4BF` |
| Rojo coral | `#FB7185` |
| Verde oliva | `#84CC16` |
| Azul cobalto | `#3B82F6` |
| Salmón | `#FB923C` |

**Aplicación**: aparece como franja vertical o dot a la izquierda del nombre del negocio en TODAS las tarjetas de pedido (admin, driver, business). Coincide con el color físico del papelito que usa el cajero.

### Contraste

- Texto sobre Surface (`#FAF6F1`): usar Ink (`#1A1614`) — contraste 14.5:1 ✓
- Texto sobre Brand (`#F97316`): usar `#FFFFFF` — contraste 4.5:1 ✓ (cumple WCAG AA para texto normal)
- Texto sobre Card (`#FFFFFF`): usar Ink — contraste 16.4:1 ✓

---

## 3. Tipografía

### Familias

| Familia | Uso | Fallback |
|---|---|---|
| **Bricolage Grotesque** | Displays grandes (hero titles, greeting "Buenas noches, María", landing CTAs) | system-ui, -apple-system, sans-serif |
| **Geist** | Body, párrafos, labels normales, números | system-ui, sans-serif |
| **JetBrains Mono** | Microlabels en mayúsculas (ej. "SAN JACINTO, ÁNCASH"), IDs (#TND-12345), times en cards | ui-monospace, monospace |

### Cargar fuentes (Next.js)

```ts
// apps/customer/app/layout.tsx
import { Bricolage_Grotesque, Geist, JetBrains_Mono } from 'next/font/google'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
})

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

// En <html className={`${bricolage.variable} ${geist.variable} ${jetbrains.variable}`}>
```

### Escala tipográfica

| Token | Tamaño | Line height | Peso | Familia | Uso |
|---|---|---|---|---|---|
| `display-2xl` | 56px | 1.05 | 600 | Bricolage | Hero titles muy grandes (post-MVP) |
| `display-xl` | 44px | 1.1 | 600 | Bricolage | Hero del marketplace, mensajes principales |
| `display-lg` | 36px | 1.15 | 600 | Bricolage | Saludo personalizado ("Buenas noches, María 🍕") |
| `display-md` | 28px | 1.2 | 600 | Bricolage | Títulos de sección importantes |
| `display-sm` | 24px | 1.25 | 600 | Bricolage | Títulos de modal, headers de página |
| `heading-lg` | 20px | 1.3 | 600 | Geist | Títulos de card grande |
| `heading-md` | 18px | 1.35 | 600 | Geist | Títulos de card normal |
| `heading-sm` | 16px | 1.4 | 600 | Geist | Subtítulos |
| `body-lg` | 17px | 1.5 | 400 | Geist | Body destacado |
| `body` | 15px | 1.5 | 400 | Geist | Body default |
| `body-sm` | 13px | 1.5 | 400 | Geist | Body secundario |
| `caption` | 12px | 1.4 | 400 | Geist | Microcopy |
| `label` | 11px | 1.3 | 600 | JetBrains | UPPERCASE labels ("SAN JACINTO, ÁNCASH", "MÁS PEDIDO") |
| `mono-md` | 14px | 1.4 | 400 | JetBrains | IDs (#TND-12345), times, prices |
| `mono-sm` | 12px | 1.4 | 400 | JetBrains | Microcopy mono |

### Reglas de uso

- **Bricolage solo para displays**. NO en body.
- **Geist es el caballito de batalla**. Default para todo lo demás.
- **JetBrains Mono en mayúsculas con letter-spacing pequeño** (`tracking-wider`).
- **No usar más de 3 tamaños en una misma vista**. Mantén jerarquía clara.

---

## 4. Iconografía

### Material Symbols

Único icon set. Versión: **Material Symbols Rounded**.

### Cargar la fuente

```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" rel="stylesheet">
```

### Componente helper

```tsx
// packages/ui/src/primitives/icon.tsx
type IconProps = {
  name: string                              // e.g. 'shopping_bag', 'two_wheeler'
  size?: 16 | 20 | 24 | 32 | 40 | 48
  filled?: boolean
  className?: string
}

export function Icon({ name, size = 24, filled = false, className }: IconProps) {
  return (
    <span
      className={cn('material-symbols-rounded', className)}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400`,
      }}
    >
      {name}
    </span>
  )
}
```

### Iconos clave por dominio

| Contexto | Icon |
|---|---|
| Restaurante / negocio | `restaurant`, `storefront`, `local_dining` |
| Motorizado | `two_wheeler`, `motorcycle`, `delivery_dining` |
| Pedido | `receipt_long`, `shopping_bag`, `inventory_2` |
| Cliente | `person`, `account_circle` |
| Admin | `admin_panel_settings`, `dashboard` |
| Cobros | `payments`, `account_balance_wallet` |
| Efectivo | `payments`, `paid` |
| Disputas | `gavel`, `report_problem` |
| Auditoría | `fact_check`, `history` |
| Configuración | `settings`, `tune` |
| Tracking | `location_on`, `route` |
| WhatsApp | (Material Symbols `chat` — no logo oficial) |
| Yape | (logo oficial via SVG inline) |
| Cerca/Media/Lejos | `near_me`, `directions_walk`, `directions_run` |
| Estados pedido | `schedule` (waiting), `local_shipping` (in_delivery), `check_circle` (delivered), `cancel` (cancelled) |
| Urgente | `priority_high`, `warning` |

### NO usar emojis como iconos UI

❌ `<button>🛒 Carrito</button>`
✅ `<button><Icon name="shopping_cart" /> Carrito</button>`

**Excepción**: emojis en texto literal de saludo, copy, micro-mensajes. Ejemplo aceptable:
> Buenas noches, María 🍕

(Aquí 🍕 es parte del mensaje, no un icono de UI.)

---

## 5. Espaciado y border-radius

### Sistema de espaciado (4px base)

| Token | Valor | Uso |
|---|---|---|
| `space-1` | 4px | Spacing mínimo (gap entre icono y texto pequeño) |
| `space-2` | 8px | Gap entre elementos relacionados |
| `space-3` | 12px | Padding interno de tags, badges |
| `space-4` | 16px | Padding default de cards, gap entre cards |
| `space-5` | 20px | |
| `space-6` | 24px | Padding interno de cards grandes, gap entre secciones |
| `space-8` | 32px | Margin vertical entre bloques mayores |
| `space-10` | 40px | |
| `space-12` | 48px | Margin entre secciones grandes |
| `space-16` | 64px | Padding top/bottom de pantallas |

### Border-radius

| Token | Valor | Uso |
|---|---|---|
| `radius-sm` | 8px | Inputs pequeños, tags, badges chiquitos |
| `radius-md` | 12px | Buttons, inputs normales |
| `radius-lg` | **16px** (1rem) | Cards normales, modales pequeños |
| `radius-xl` | **24px** (1.5rem) | Cards destacadas |
| `radius-2xl` | **32px** (2rem) | Bottom sheets, hero cards |
| `radius-3xl` | **48px** (3rem) | Heroes muy grandes, contenedores principales |
| `radius-full` | 9999px | Avatares, pills, CTAs redondas |

**Regla**: en duda, **prefiere radius mayor**. Tindivo es amable.

---

## 6. Elevación y sombras

### Sistema de sombras

| Token | CSS | Uso |
|---|---|---|
| `elev-0` | `none` | Flat, sin elevación |
| `elev-1` | `0 1px 2px rgba(0,0,0,0.04)` | Cards sutiles |
| `elev-2` | `0 4px 12px rgba(0,0,0,0.06)` | Cards normales, dropdowns |
| `elev-3` | `0 8px 24px rgba(0,0,0,0.08)` | Modales, sheets |
| `elev-4` | `0 16px 48px rgba(0,0,0,0.12)` | Modales prominentes |
| `elev-glow-brand` | `0 0 24px rgba(249,115,22,0.4)` | Acento en CTA brand muy destacada |
| `elev-glow-danger` | `0 0 24px rgba(220,38,38,0.4)` | Pedido URGENTE |

### Reglas

- Cards normales: `elev-1` o `elev-2`.
- Cards interactivas en hover: aumentar un nivel (1 → 2, 2 → 3).
- Modales: `elev-3` o `elev-4`.
- Glow se reserva para énfasis (URGENTE en tarjetas de driver).

---

## 7. Glassmorphism

Solo en **topbars** flotantes con scroll behind.

### CSS

```css
.glass-topbar {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
}
```

### Reglas

- NO usar glass en cards, modales, sheets — diluye legibilidad.
- Glass es solo para top bars y sticky headers que tienen contenido scrolleando detrás.
- Fallback: si `backdrop-filter` no soportado (browsers antiguos), color sólido `#FAF6F1`.

---

## 8. Animaciones

### Library: Motion (ex Framer Motion)

Versión 12+. Usamos `motion.div`, `AnimatePresence`, `useAnimation`.

### Tokens de timing

| Token | Duración | Easing | Uso |
|---|---|---|---|
| `motion-fast` | 150ms | `easeOut` | Hover, focus, ripples |
| `motion-base` | 250ms | `easeInOut` | Toggles, tabs, dropdowns |
| `motion-slow` | 400ms | `easeInOut` | Modales, sheets, page transitions |
| `motion-very-slow` | 600ms | `easeInOut` | Hero entrances, lottie loops |

### Patrones de animación

#### Bottom sheet (auth, carrito, payment selection)

```tsx
<motion.div
  initial={{ y: '100%' }}
  animate={{ y: 0 }}
  exit={{ y: '100%' }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
  className="..."
>
```

#### Modal (product modal, confirm delivery)

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.2 }}
>
```

#### Tab content swap

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.2 }}
  >
```

#### Stagger en listas

```tsx
<motion.ul variants={{ animate: { transition: { staggerChildren: 0.05 } } }}>
  {items.map(item => (
    <motion.li
      key={item.id}
      variants={{
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 }
      }}
    >
```

#### Pulse en URGENTE

```tsx
<motion.div
  animate={{
    boxShadow: [
      '0 0 0px rgba(220,38,38,0.0)',
      '0 0 24px rgba(220,38,38,0.6)',
      '0 0 0px rgba(220,38,38,0.0)',
    ],
  }}
  transition={{ duration: 1.5, repeat: Infinity }}
>
```

### Respect `prefers-reduced-motion`

```tsx
const shouldReduceMotion = useReducedMotion()
const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.25 }
```

---

## 9. Primitives (shadcn-based)

En `packages/ui/src/primitives/`. Cada primitive es una versión Tindivo-customizada de shadcn.

### Lista de primitives

| Primitive | shadcn base | Diferencias Tindivo |
|---|---|---|
| `Button` | Button | radius-md, colores brand, sombras suaves, soporte para iconos |
| `Input` | Input | radius-md, focus ring brand, height 48px (touch-friendly) |
| `Textarea` | Textarea | Idem Input |
| `Label` | Label | font-medium |
| `Card` | Card | radius-lg, elev-1 default |
| `Badge` | Badge | radius-full, mayor padding horizontal |
| `Sheet` | Sheet | radius-2xl en mobile (bottom sheet), motion custom |
| `Dialog` | Dialog | radius-xl, motion custom |
| `Tabs` | Tabs | Underline brand, no background fill |
| `Switch` | Switch | brand fill cuando on |
| `Checkbox` | Checkbox | radius-sm, brand fill |
| `Radio` | RadioGroup | radius-full, brand fill |
| `Select` | Select | radius-md |
| `Skeleton` | Skeleton | Pulse animation custom |
| `Toast` | Toast (Sonner) | radius-lg, posiciones predefinidas |
| `Avatar` | Avatar | radius-full, fallback con inicial sobre brand background |
| `Tooltip` | Tooltip | radius-md, fondo ink |
| `Popover` | Popover | radius-lg |
| `Dropdown` | DropdownMenu | radius-lg |
| `Accordion` | Accordion | radius-md |
| `Slider` | Slider | thumb brand |
| `Progress` | Progress | brand fill, radius-full |
| `Separator` | Separator | color border |
| `ScrollArea` | ScrollArea | thumb sutil |

### Reglas para nuevos primitives

- Antes de crear uno nuevo, verificar si shadcn tiene equivalente.
- Si shadcn no lo tiene, evaluar si se puede componer de primitives existentes.
- Solo crear primitive nuevo si hay 3+ usos en apps distintas.

---

## 10. Patterns Tindivo

En `packages/ui/src/patterns/`. Composiciones específicas del dominio Tindivo.

### Lista de patterns

| Pattern | Propósito |
|---|---|
| `GlassTopBar` | Header sticky con glassmorphism, soporta back button, logo, avatar |
| `BottomNav` | Navegación inferior con tabs (driver, customer) |
| `BottomActionBar` | Barra inferior con CTA principal (cart "Ver mi pedido", checkout) |
| `OrderCard` | Card de pedido con dot color del negocio, shortId, estado, monto, ETA, driver si asignado |
| `StatusChip` | Chip de estado con color según OrderStatus |
| `UrgencyBadge` | Badge "URGENTE" con glow danger animado |
| `BusinessDot` | Dot circular del color de acento del negocio |
| `SolarCTA` | Hero card gradient brand con CTA grande (estilo "Solo en Tindivo · Pide en minutos") |
| `InteractiveMap` | Mapa Leaflet con pin draggable, controles centrar/zoom |
| `PhoneInputPE` | Input con prefijo +51 fijo, validación regex |
| `MoneyInput` | Input con prefijo S/, validación dos decimales |
| `Timeline` | Línea de tiempo vertical con estados (usado en tracking y order detail) |
| `ElapsedTimer` | Cronómetro en vivo (mm:ss) que cuenta desde un timestamp |
| `Countdown` | Timer en cuenta regresiva (prepay 10min) |
| `PrepTimeSelector` | Selector horizontal de chips para tiempo de preparación (10-50min) |
| `OccupancySelector` | Selector visual de slots de mochila (1, 2, 3) |
| `DistanceBandSelector` | Selector cerca/media/lejos con iconos descriptivos |
| `PaymentMethodCard` | Card grande de método de pago (Yape al recibir, Efectivo, Prepago) con descripción inline |
| `PapelitoReminder` | Recordatorio visual "¿Ya anotaste en tu papelito [COLOR]?" |
| `EmptyState` | Empty state cálido con icono, mensaje, CTA |
| `LoadingSkeleton` | Skeleton compuesto por tipo de contenido (order list, menu, profile) |
| `ErrorBoundaryFallback` | Fallback amigable con "Recargar" |
| `WhatsAppSupportLink` | Link con deep link wa.me + mensaje pre-llenado contextual |

### Ejemplo de pattern: `OrderCard`

```tsx
type OrderCardProps = {
  order: OrderSummary
  variant?: 'admin' | 'business' | 'driver' | 'customer'
  onClick?: () => void
}

export function OrderCard({ order, variant = 'admin', onClick }: OrderCardProps) {
  return (
    <button
      onClick={onClick}
      className="
        w-full text-left
        bg-card rounded-2xl shadow-elev-1
        p-4 flex gap-3
        hover:shadow-elev-2 transition-shadow
        relative overflow-hidden
      "
    >
      {/* Dot de color del negocio */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5"
        style={{ background: order.business.accent_color }}
      />

      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="heading-md">{order.business.name}</h3>
          <span className="mono-sm text-ink-muted">#{order.short_id}</span>
        </div>
        <StatusChip status={order.status} />
        {order.urgent_since && <UrgencyBadge />}
        {variant !== 'customer' && (
          <p className="body-sm text-ink-muted">
            {order.delivery_address}
          </p>
        )}
      </div>

      <div className="text-right">
        <p className="mono-md font-semibold">S/ {order.amount}</p>
        {order.driver && variant !== 'driver' && (
          <p className="caption">{order.driver.full_name}</p>
        )}
      </div>
    </button>
  )
}
```

### Anti-patterns

- ❌ Crear pattern nuevo si solo lo usa una app.
- ❌ Cargar lógica de negocio dentro del pattern (e.g., fetch al servidor). Los patterns son visuales.
- ❌ Estado interno extenso. Los patterns reciben props, no manejan estado complejo.

---

## 11. Layouts mobile-first

### Breakpoints

```ts
// tailwind.config.ts via packages/config/tailwind/preset.ts
screens: {
  sm: '640px',      // Tablets pequeñas
  md: '768px',      // Tablets
  lg: '1024px',     // Desktop pequeño
  xl: '1280px',     // Desktop
  '2xl': '1536px',  // Desktop grande
}
```

### Container

- **Mobile**: full-width con padding 16-24px horizontal.
- **Tablet**: max-width 768px centered.
- **Desktop**: max-width 1280px centered (apps de staff). `tindivo.com` cliente queda en 768px máximo (es PWA).

### Safe areas

```css
:root {
  --safe-top: env(safe-area-inset-top);
  --safe-bottom: env(safe-area-inset-bottom);
  --safe-left: env(safe-area-inset-left);
  --safe-right: env(safe-area-inset-right);
}
```

Padding-top de la app + altura de status bar iOS (`var(--safe-top)`).

### Pattern de página standard

```tsx
<div className="min-h-screen bg-surface">
  <GlassTopBar />                            {/* sticky top */}
  <main className="px-4 pt-20 pb-24">         {/* pt-20 = altura topbar + safe-top */}
    {/* contenido */}
  </main>
  <BottomNav />                              {/* sticky bottom para driver/customer */}
</div>
```

---

## 12. Estados de UI

### Loading

- Skeleton compuesto por tipo (no spinner genérico).
- Aparece tras 200ms (evita flash en queries rápidas).
- Tras 3s sin terminar, mostrar mensaje "Estamos cargando, un segundo...".

### Empty

```tsx
<EmptyState
  icon="receipt_long"
  title="Aún no hay pedidos hoy"
  description="Cuando llegue uno, aparecerá aquí."
  cta={{ label: 'Crear pedido manual', onClick: ... }}  // opcional
/>
```

### Error

- Toast 5s para errores menores (network blip).
- ErrorBoundary fallback para errores fatales con botón "Recargar".
- Errores de validación inline en el form, no toast.

### Success

- Toast 3s verde con icono check.
- Para acciones críticas (pedido creado, pago registrado), modal de éxito con next step CTA.

### Disabled

- Opacity 50%, cursor not-allowed.
- Tooltip explicando por qué está disabled (en hover desktop, tap mobile).

### Hover

- Aumentar elevación un nivel.
- Color un tono más oscuro en CTAs.
- NO usar hover como el único feedback en mobile (no existe).

### Focus

- Ring brand de 2px, offset 2px sobre el elemento.
- Visible siempre con keyboard (`outline-none focus-visible:ring-2`).

---

## 13. Accesibilidad visual

- Contraste mínimo 4.5:1 para texto normal, 3:1 para texto >=18px.
- Foco visible siempre con teclado.
- Tamaño mínimo de touch target 44×44px.
- No basar info solo en color (ej. "el rojo es error" + icono `error`).
- Animaciones respetan `prefers-reduced-motion`.
- Texto con buen line-height (1.4-1.6).
- Espacio entre líneas de texto para legibilidad mobile.

---

## 14. Implementación en Tailwind v4

### Configuración base

```css
/* packages/ui/src/globals.css */
@import "tailwindcss";

@theme {
  /* Colores */
  --color-brand: #F97316;
  --color-brand-dark: #C2410C;
  --color-brand-light: #FED7AA;
  --color-ink: #1A1614;
  --color-ink-muted: #57534E;
  --color-ink-subtle: #A8A29E;
  --color-surface: #FAF6F1;
  --color-card: #FFFFFF;
  --color-border: #EAE7E2;
  --color-success: #16A34A;
  --color-warning: #F59E0B;
  --color-danger: #DC2626;
  --color-info: #0EA5E9;

  /* Fonts */
  --font-bricolage: var(--font-bricolage), system-ui, sans-serif;
  --font-geist: var(--font-geist), system-ui, sans-serif;
  --font-jetbrains: var(--font-jetbrains), ui-monospace, monospace;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-2xl: 32px;
  --radius-3xl: 48px;

  /* Shadows */
  --shadow-elev-1: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-elev-2: 0 4px 12px rgba(0,0,0,0.06);
  --shadow-elev-3: 0 8px 24px rgba(0,0,0,0.08);
  --shadow-elev-4: 0 16px 48px rgba(0,0,0,0.12);
  --shadow-glow-brand: 0 0 24px rgba(249,115,22,0.4);
  --shadow-glow-danger: 0 0 24px rgba(220,38,38,0.4);
}

body {
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-geist);
  font-size: 15px;
  line-height: 1.5;
}

.material-symbols-rounded {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
```

### Uso en componentes

```tsx
<button className="bg-brand text-white rounded-md px-6 py-3 shadow-elev-1 hover:shadow-elev-2 transition-shadow">
  Pedir moto
</button>

<h1 className="font-bricolage text-display-lg">
  Buenas noches, María 🍕
</h1>

<span className="font-jetbrains text-label uppercase tracking-wider text-ink-muted">
  SAN JACINTO, ÁNCASH
</span>
```

### Preset compartido

```ts
// packages/config/tailwind/preset.ts
import type { Config } from 'tailwindcss'

export default {
  theme: {
    extend: {
      fontSize: {
        'display-2xl': ['56px', { lineHeight: '1.05', fontWeight: 600 }],
        'display-xl': ['44px', { lineHeight: '1.1', fontWeight: 600 }],
        'display-lg': ['36px', { lineHeight: '1.15', fontWeight: 600 }],
        'display-md': ['28px', { lineHeight: '1.2', fontWeight: 600 }],
        'display-sm': ['24px', { lineHeight: '1.25', fontWeight: 600 }],
        'heading-lg': ['20px', { lineHeight: '1.3', fontWeight: 600 }],
        'heading-md': ['18px', { lineHeight: '1.35', fontWeight: 600 }],
        'heading-sm': ['16px', { lineHeight: '1.4', fontWeight: 600 }],
        'body-lg': ['17px', { lineHeight: '1.5', fontWeight: 400 }],
        'body': ['15px', { lineHeight: '1.5', fontWeight: 400 }],
        'body-sm': ['13px', { lineHeight: '1.5', fontWeight: 400 }],
        'caption': ['12px', { lineHeight: '1.4', fontWeight: 400 }],
        'label': ['11px', { lineHeight: '1.3', fontWeight: 600, letterSpacing: '0.04em' }],
        'mono-md': ['14px', { lineHeight: '1.4', fontWeight: 400 }],
        'mono-sm': ['12px', { lineHeight: '1.4', fontWeight: 400 }],
      },
    },
  },
} satisfies Config
```

Cada app importa el preset:

```ts
// apps/customer/tailwind.config.ts
import preset from '@tindivo/config/tailwind/preset'
export default { presets: [preset], content: [...] }
```

---

**Resumen ejecutivo**: paleta brand naranja + ink + surface cálido; tipografías Bricolage (display) / Geist (body) / JetBrains Mono (microlabels); Material Symbols como único icon set; bordes muy redondeados (1rem-3rem); glassmorphism solo en topbars; animaciones Motion con timing tokens definidos; primitives shadcn-based + patterns Tindivo en `packages/ui`. Implementado via Tailwind v4 con `@theme` y preset compartido.
