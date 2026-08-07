# `apps/customer` — Contexto y estado

> PWA para clientes finales (B2C) de Tindivo.  
> Stack: Next.js App Router · Supabase · Zustand · Leaflet · `@tindivo/ui` · `@tindivo/api-client` · `@tindivo/contracts`  
> URL prod: no hay aún (piloto San Jacinto pendiente)

---

## Actores y propósito

El único actor es el **cliente final** (persona que pide delivery en San Jacinto).  
Su viaje: descubrir restaurantes, armar su pedido con modificadores, elegir cómo paga, y seguir su pedido hasta que llega.

---

## Flujo principal del cliente

```
Cliente llega a la web (PWA)
        │
        ▼
[ONBOARDING] — Bottom sheet multi-paso (solo primera vez)
  ├─ Google OAuth o email/contraseña
  ├─ Nombre → Teléfono (WhatsApp) → Dirección con mapa
  └─ Pasos skippeables (phone, address)
        │
        ▼
[HOME] — Lista de restaurantes (cards con logo, ETA, abierto/cerrado)
  ├─ Search global (restaurantes + platos, debounce 300ms)
  └─ Badge de "pedido activo" si hay uno en curso
        │
        ▼
[NEGOCIO /negocio/[id]] — Menú completo del restaurante
  ├─ Hero (banner, tagline, ETA, badge abierto/cerrado)
  ├─ Schedule row colapsable con horarios de la semana
  ├─ Tabs de categorías con scroll a sección
  ├─ Items: foto, nombre, precio, badges, indicador de modificadores
  └─ Modal de producto: modificadores (single/multi), nota, cantidad
        │
        ├─ Modo catálogo (sin web delivery) → "Pedir por WhatsApp"
        │
        └─ Modo delivery → "Agregar al carrito"
                │
                ▼
[CARRITO] — Bottom sheet / sidebar desktop
  ├─ Líneas con cantidad, modificadores, nota, subtotal
  └─ CTA: "Ir a pagar" → /checkout
        │
        ▼
[CHECKOUT] — 2 pasos: Datos de entrega → Método de pago
  ├─ Paso 1: Dirección (guardada o mapa), nombre, celular
  ├─ Paso 2: Efectivo (con cambio) / Yape-Plin al recibir / Prepago
  ├─ GPS antifraude: ubicación en zona → distancia → precisión
  │   ├─ Fuera de zona o GPS malo → fuerza prepago o bloquea
  │   └─ OK → envía payload GPS al backend
  ├─ POST /customer/orders (con idempotency key)
  └─ Si prepago: countdown 10 min, subir comprobante
        │
        ▼
[TRACKING /pedido/[shortId]] — Seguimiento en vivo
  ├─ Progress bar 4 pasos: Recibido → Preparando → En camino → Entregado
  ├─ Polling 8s + Supabase Realtime (instantáneo para dueño del pedido)
  ├─ Cancelar (solo antes de que el negocio confirme, solo no-prepago)
  └─ Pantalla de cancelado con copy específico según motivo
        │
        ▼
[ENTREGADO] — Timeline completado. Puede "Volver a pedir".
```

**Pedido recurrente ("Volver a pedir"):** Desde `/pedidos` o desde la pantalla de tracking, el cliente puede re-ejecutar un pedido anterior con un solo tap. El carrito se reemplaza con los items del pedido original (mismos modificadores, cantidades y notas).

---

## Módulos — estado completo auditado

### 🟢 Onboarding y autenticación (`components/auth-onboarding/` → `host.tsx` + `auth-onboarding-sheet.tsx` + 6 steps + `persistence.ts`)

**Estado: completo y funcional.**

Dos caminos de registro:

**Camino Email:**
```
method-step → email-signup-step → phone-step → address-step
   │                │
   └─ login-step ←──┘ (si email duplicado, pre-fill)
```
- `signUpWithEmail()`: `supabase.auth.signUp()` sin verificación de email + `acceptTerms()` + `upsertProfile()`
- `signInWithEmail()`: `supabase.auth.signInWithPassword()`
- Detección de email duplicado: botón "Iniciar sesión con este correo" que navega al login-step con el email pre-llenado

**Camino Google:**
```
method-step → Google OAuth → redirect a /auth/callback
                                  │
                                  ▼
                          resumeOnboardingIfPending()
                                  │
                          google-name-step → phone-step → address-step
```
- `signInWithGoogle()`: `supabase.auth.signInWithOAuth()` con `prompt: 'select_account'` y PKCE flow
- Resume tras redirect: lee localStorage (`tindivo.onboarding.resume`, TTL 30 min), valida sesión con `getUser()` (server-validated), verifica `getProfileStatus()` para determinar el paso faltante

**Steps skippeables:** `google-name`, `phone`, y `address` muestran "Puedes completar esto después" (botón X en header). Cada paso guarda en `customer_profiles` o `customer_addresses` antes de avanzar.

**Gate de auth en checkout:** Si el usuario llega a `/checkout` sin sesión, abre el sheet de onboarding in-place (sin redirigir). Si cierra el sheet sin loguearse, vuelve atrás. Si tiene sesión pero no tiene perfil (ej. Google en otro dispositivo), completa `google-name` forzado.

**Store de onboarding:** `lib/onboarding-store.ts` — Zustand con pasos (`method` | `email-signup` | `login` | `google-name` | `phone` | `address`), variante (`fresh` | `google-resume` | `profile-incomplete`), e identidad temporal (nombre, email). El resume payload en localStorage incluye `next` URL y `resumeStep` para recuperación post-OAuth.

**Persistencia:** `components/auth-onboarding/persistence.ts`:
- `upsertProfile()`: SELECT → INSERT o UPDATE (evita duplicate key)
- `saveAddress()`: limpia `is_default` previos, inserta nueva dirección, actualiza coordenadas default en `customer_profiles`
- `acceptTerms()`: inserta en `terms_acceptance` con `TERMS_VERSION = '2026-05'`, maneja FK violation (23503) y duplicate (23505)
- `getProfileStatus()`: retorna `{ hasProfile, hasPhone, hasAddress, fullName }` para lógica de resume
- `authErrorMessage()`: mapea errores de Supabase a español peruano

**Páginas de entrada:**
- `/auth/callback` (`app/auth/callback/page.tsx`): escucha `onAuthStateChange` o `getSession()` para el PKCE exchange, luego `resumeOnboardingIfPending()` + navega al destino guardado. Timeout de seguridad de 8s.
- `/entrar` (`app/entrar/page.tsx`): deep-link (`/entrar?next=...`). Si hay sesión, redirige al `next`. Si no, abre onboarding sheet.

**⚠️ Gaps de auth:**
- **No hay verificación de teléfono (OTP/SMS).** `customer_profiles.phone_verified_at` existe en la DB pero nunca se escribe desde el frontend.
- **No hay "olvidé mi contraseña"** ni flujo de reset de password.
- **No hay cambio de email** ni eliminación de cuenta en `/cuenta`.
- **No hay verificación de email** (deshabilitada explícitamente en dashboard de Supabase).

---

### 🟢 Home — Lista de restaurantes + search (`/` → `app/page.tsx`)

**Estado: completo y funcional.**

- Carga `GET /public/businesses` y muestra cards con: logo, nombre, tagline, color de acento, ETA (min-max), badge "Abierto ahora" / "Cerrado ahora"
- Search global con debounce 300ms: `GET /public/search?q=...` (mín 2 caracteres, AbortController). Reemplaza el hero + lista con resultados agrupados en "Restaurantes" y "Platos"
- Badge de "pedido activo": consulta el último pedido no terminal del usuario con suscripción Supabase Realtime. Muestra el tracking step actual como chip cliqueable → navega al tracking
- Saludo personalizado con nombre del perfil (suscrito a `onAuthStateChange`)
- `AddressBar` en el top: muestra dirección default o "San Jacinto" si no hay sesión
- Cards de restaurante: si `primary_capability === 'catalog'`, muestra badge "Catálogo" (lleva a la carta pero con CTA de WhatsApp)

---

### 🟢 Negocio — Menú y carta (`/negocio/[id]` → `app/negocio/[id]/page.tsx`)

**Estado: completo y funcional.**

- `GET /public/businesses/{id}`: carga negocio + categorías + items (con modificadores anidados) + schedule
- Hero: banner, logo, nombre, tagline, ETA, badge "Abierto ahora" / "Cerrado ahora" (con tick cada 30s + al retomar foco en PWA)
- `ScheduleRow`: colapsable, muestra horario de hoy + todos los 7 días al expandir. Sin schedule configurado = sin badge de horario
- Tabs de categorías sticky con scroll horizontal + scroll-to-section al hacer clic
- Items: foto (`ProductImage` con placeholder por hue), nombre, precio base, badges ("Con opciones" / "Directo al carrito" / "Agotado"), indicador de modificadores obligatorios
- `ProductModal`: bottom sheet con:
  - Hero de imagen, nombre, descripción, precio base
  - Grupos de modificadores: `single` (radio buttons) o `multi` (checkboxes), requerido/opcional, badge "Obligatorio" / "Listo"
  - Nota especial (textarea, máx 140 caracteres)
  - Selector de cantidad + botón "Agregar" con precio total calculado (base + modificadores seleccionados)
- `CartButton` flotante con badge de cantidad (hidratado post-SSR)
- **Modo catálogo (WhatsApp):** `CartCtas` detecta `mode === 'whatsapp'` vía `useBusinessOrdering()` y muestra "Pedir por WhatsApp" + "Llamar". El botón de WhatsApp usa `api.whatsapp.com` (no `wa.me`) para evitar corrupción de emojis.
- Desktop: sidebar del carrito (`CartSidebar`) visible en `lg:` con las mismas líneas y CTAs
- Toast "Añadido al carrito" con animación slide-down + fade, auto-oculta

---

### 🟢 Carrito (`lib/cart.ts` + `components/cart-sheet.tsx`)

**Estado: completo y funcional.**

**Store Zustand** (`lib/cart.ts`):
- Persistencia en localStorage (`tindivo-cart-v1`), `skipHydration: true` para evitar mismatch SSR
- `CartHydrator` montado en root layout: rehidrata tras montar
- `useCartHydrated()`: hook que retorna `true` cuando la hidratación terminó
- **Mono-negocio:** `addLine()` limpia el carrito si el `businessId` cambia
- **Fusión por firma:** items con mismo `itemId` + mismos modificadores + misma nota → incrementan `quantity` (no duplican línea). La firma se calcula con `lineSignature()`
- **Claves únicas:** `nextKey()` usa sequence + `crypto.randomUUID()` para evitar colisiones de keys React
- `replace()`: para "Volver a pedir" — reemplaza todo el carrito con líneas nuevas
- `merge` en rehidratación: re-asigna claves para sanear datos previos

**UI** (`components/cart-sheet.tsx`):
- `CartButton({ tone? })`: ícono de bolsa con badge numérico (usa `useCartHydrated` para evitar 0 en SSR)
- `CartSheet({ onClose })`: bottom sheet con lista de líneas editables, subtotal, y CTAs
- `CartSidebar({ businessId, businessName })`: sidebar desktop (hidden en mobile)
- `CartLineList({ lines })`: cada línea muestra nombre, modificadores como pills, nota, cantidad (botones +/-), botón eliminar
- `CartCtas({ layout, onNavigate? })`: adapta CTA según `useBusinessOrdering()`:
  - **whatsapp**: "Pedir por WhatsApp" + "Llamar"
  - **delivery**: "Ir a pagar" (disabled si el negocio está cerrado)
- `CartEmptyState`: estado vacío con mensaje

---

### 🟢 Checkout (`/checkout` → `app/checkout/page.tsx`)

**Estado: completo y funcional. Es el módulo más complejo del customer (1351 líneas).**

**Gate de auth:** Si no hay sesión, abre onboarding in-place. Si el usuario cierra sin loguearse, `router.back()`. Si la sesión no tiene perfil, fuerza `google-name` step. Si `blocked_until > now`, muestra pantalla `Blocked`.

**Paso 1 — Datos de entrega:**
- Dirección: lista de direcciones guardadas (radio buttons) o formulario manual (`AddressFields` con mapa + GPS)
- Si no hay dirección guardada: exige pin en el mapa dentro de la zona de cobertura
- Validación de referencia: mínimo 15 caracteres (`ADDRESS_REFERENCE_MIN` del contrato)
- Nombre y celular (formato peruano: `/^9\d{8}$/`)
- Pickup deshabilitado para el piloto (`PICKUP_ENABLED = false`, Decisones.md)

**Paso 2 — Método de pago:**
- `pending_cash` (efectivo): selector de "¿Con cuánto pagarás?" — chips Exacto / S/20 / S/50 / S/100 / Otro monto. Calcula vuelto en tiempo real.
- `pending_yape` (billetera al recibir): logos de Yape/Plin
- `prepaid` (prepago): forzado si `subtotal >= prepayThreshold` (default S/80, configurable en `app_settings`) o si `contraentrega_blocked === true`

**GPS antifraude** (`collectGpsValidation()`):
- GPS high-accuracy vía `getCurrentPositionHA()` (timeout configurable desde `location_validation` en `app_settings`)
- Distancia al centro de cobertura con `haversineKm()`
- Precisión vs `maxAccuracyM` (default 500m)
- 3 tipos de geo-block:
  - `far`: distancia > warningRadiusKm → fuerza prepago
  - `low_accuracy`: accuracyM > maxAccuracyM → fuerza prepago
  - `unavailable`: GPS falló (permiso denegado, timeout, sin API) → fuerza prepago
- `GeoBlocked` component: según el tipo, muestra mensaje específico y ofrece "Usar prepago" o "Reintentar"

**Creación del pedido** (`placeOrder()`):
- `POST /customer/orders` con:
  - `idempotencyKey`: `crypto.randomUUID()` generado al montar la página
  - Items del carrito con modificadores (IDs de opciones), notas, cantidades
  - Dirección, coordenadas (de address guardada o del mapa)
  - `gpsValidation` payload con lat, lng, accuracyM, distanceToCenterKm, method
  - `cashPayingWith` si es efectivo
- Sin dirección guardada: persiste la dirección del mapa como "Casa" (best-effort, no bloquea)
- Errores: detecta `bloquead` en el mensaje → pantalla `Blocked`
- `Blocked` component: mensaje + link de WhatsApp a soporte

**Flujo prepago** (`Prepay` component):
- Countdown de 10 minutos con timer visual
- `GET /customer/orders/{id}/prepay-info`: obtiene número Yape y QR del negocio
- Upload de comprobante: imagen → Supabase Storage bucket `payment-proofs` → `POST /customer/orders/{id}/prepay-proof`
- Preview de imagen antes de enviar, botón "Cambiar imagen"
- Auto-redirect al tracking tras envío exitoso

**✅ Reglas antifraude YA implementadas en el frontend:**

| Regla | Dónde | Cómo |
|---|---|---|
| `contraentrega_blocked` | `checkout/page.tsx:195` | `setPrepayOnlyByRisk(true)` — fuerza solo prepago |
| `blocked_until` | `checkout/page.tsx:190-193` | Si fecha futura, muestra pantalla `Blocked` |
| Tope de monto para prepago | `checkout/page.tsx:105,128-136` | `prepay_threshold` desde `app_settings` (default S/80) |
| GPS validation | `checkout/page.tsx:258-295` | Distancia, precisión, fallback a prepago |
| Address reference mínimo | `checkout/page.tsx:233-237` | Validación contra `ADDRESS_REFERENCE_MIN` (15 chars) |
| `phone_verified_at` | ❌ No se verifica | La columna existe en DB pero el frontend nunca la lee ni la escribe |
| Subir comprobante de prepago | `checkout/page.tsx:997-1210` | `Prepay` component completo con upload a Storage + POST proof |

---

### 🟢 Tracking de pedido (`/pedido/[shortId]` → `app/pedido/[shortId]/page.tsx`)

**Estado: completo y funcional.**

- Polling cada 8s: `GET /public/orders/{shortId}`
- Supabase Realtime: suscripción `postgres_changes` en `orders` filtrado por `id=eq.{orderId}` — actualización instantánea para dueños autenticados
- Progress bar visual de 4 pasos: Recibido → Preparando → En camino → Entregado
- Timeline con indicadores de paso (done/active/pending), iconos, y descripciones
- Proyección de 10 estados internos a 4 pasos cliente: `STATUS_TO_TRACKING` vía `@tindivo/contracts`
- Info del pedido: items con modificadores (snapshot), subtotal + delivery fee = total
- Si es efectivo: muestra "Pagas con S/ X" y "Tu vuelto: S/ Y"
- Driver info: nombre del motorizado (si asignado)
- Cancelación: solo si `status < confirmed` Y no es prepago. `POST /customer/orders/{id}/cancel`
- Pantalla de cancelado con copy específico por motivo:
  - `customer_cancelled`: "Cancelaste tu pedido"
  - `prepay_timeout`: "Se acabó el tiempo para pagar"
  - `validation_timeout` / `pending_acceptance_timeout`: "No pudimos confirmar tu pedido"
  - `business_cancelled`: "El restaurante canceló tu pedido"
  - default: mensaje genérico
- "Volver a pedir": botón que reemplaza el carrito con los items del pedido (`cart.replace()`)
- `SupportLink` con `orderShortId` contextual

---

### 🟢 Historial de pedidos (`/pedidos` → `app/pedidos/page.tsx`)

**Estado: completo y funcional.**

- Gate de auth: si no hay sesión, redirige a `/entrar?next=/pedidos`
- Consulta `orders` desde Supabase (RLS filtra por `customer_user_id`) ordenado por `created_at` desc
- Fetch paralelo de nombres de negocios vía `GET /public/businesses` para mostrar nombres
- Badges de estado con proyección a 4 pasos cliente (`STATUS_LABEL`)
- Fechas relativas: "hace un momento", "hace X min", "hace X h", "ayer", "hace X días", fecha
- Tags: "Delivery" / "Recojo", método de pago, items (snapshot names)
- Items del pedido mostrados como chips: "2× Pollo a la brasa"
- CTA "Ver pedido" → tracking (si activo) o resumen (si terminal)
- CTA "Volver a pedir" → reemplaza carrito con `cart.replace()` y navega al negocio

---

### 🟢 Cuenta — Perfil y direcciones (`/cuenta` → `app/cuenta/page.tsx`)

**Estado: completo y funcional.**

- Gate de auth: redirige a `/entrar?next=/cuenta` si no hay sesión
- Profile card: nombre, email, teléfono (con badge "Sin verificar")
- Direcciones: lista con label + emoji (🏠 Casa, 💼 Trabajo, 📍 Otro), línea, referencia. Botón "Gestionar direcciones" abre bottom sheet con:
  - Lista de direcciones existentes con toggle `is_default`
  - Formulario para nueva dirección (`AddressFields` con mapa)
  - Editar dirección existente (mismo formulario, pre-llenado)
  - Eliminar dirección
- Resumen de últimos pedidos (primeros 3)
- Links: Términos y condiciones, Política de privacidad, WhatsApp de soporte
- Sign out: `supabase.auth.signOut({ scope: 'local' })` + `clearOnboardingResume()`

---

### 🟢 Páginas legales (`/privacidad`, `/terminos`)

**Estado: completo.**

- `/privacidad` (`app/privacidad/page.tsx`): 7 secciones con referencia a Ley N. 29733 (Perú)
- `/terminos` (`app/terminos/page.tsx`): 8 secciones con condiciones de uso
- Cross-links entre ambas páginas
- Sin dependencias externas (contenido estático inline)

---

## Componentes de soporte — auditados

| Archivo | Estado | Propósito |
|---|---|---|
| `push-manager.tsx` | 🟢 Completo | Registra `/sw.js`, suscribe a push (VAPID). Auto-suscribe si permiso ya concedido; botón flotante si permiso "default" |
| `address-bar.tsx` | 🟢 Completo | Topbar con dirección default. Abre bottom sheet para cambiar. Queries `customer_addresses` ordenado por `is_default`. Escucha `onAuthStateChange` (fuera del callback para evitar deadlock) |
| `address-fields.tsx` | 🟢 Completo | Formulario reutilizable: label picker (Casa/Trabajo/Otro), `MapPicker` con GPS, input calle/jirón, textarea referencia con char counter |
| `map-picker.tsx` | 🟢 Completo | Wrapper Leaflet (dynamic import `ssr:false`). Fetch coverage config de Supabase. Pin arrastrable/tap. Validez de zona en tiempo real. Botón "Usar mi ubicación" |
| `map-picker-inner.tsx` | 🟢 Completo | React-Leaflet `MapContainer`: OSM tiles, coverage polygon/circle, draggable SVG pin, `TapToMove`, `Recenter`, `FitZone` inicial |
| `product-modal.tsx` | 🟢 Completo | Bottom sheet de personalización: imagen hero, modificadores (single/multi, required/optional), nota (140 chars), cantidad, precio total |
| `cart-sheet.tsx` | 🟢 Completo | `CartButton`, `CartSheet`, `CartSidebar`, `CartLineList`, `CartEmptyState`, `CartCtas` (adaptativo por modo negocio) |
| `schedule-row.tsx` | 🟢 Completo | Horario colapsable. Muestra hoy + badge Abierto/Cerrado. Expande a 7 días. Sin schedule = sin badge (negocio siempre abierto) |
| `ui.tsx` | 🟢 Completo | Re-exports de `@tindivo/ui`. `SupportLink` (WhatsApp contextual), `ProductImage` (img o placeholder por hue) |
| `lib/cart.ts` | 🟢 Completo | Zustand store + `CartHydrator` + `useCartHydrated` (ver sección Carrito) |
| `lib/onboarding-store.ts` | 🟢 Completo | Zustand store del flujo onboarding + resume localStorage (TTL 30 min) |
| `lib/api.ts` | 🟢 Completo | Cliente API con Bearer token automático desde sesión Supabase |
| `lib/business-ordering.ts` | 🟢 Completo | Hook `useBusinessOrdering(id)`: fetch `GET /public/businesses/{id}`, cache 60s, dedup de requests en vuelo, detecta modo `delivery` vs `whatsapp` |
| `lib/coverage.ts` | 🟢 Completo | Lectura de `app_settings` (coverage, coverage_polygon, location_validation). Haversine, point-in-polygon (ray-casting). FALLBACKs hardcodeados a San Jacinto |
| `lib/geolocation.ts` | 🟢 Completo | `getCurrentPositionHA()` con `enableHighAccuracy: true`. `GeolocationError` tipado con mensajes en español |
| `lib/use-search.ts` | 🟢 Completo | `useCatalogSearch()`: debounce 300ms, AbortController, mínimo 2 chars, `GET /public/search?q=...` |
| `lib/whatsapp.ts` | 🟢 Completo | `buildCartWhatsAppMessage()`, `waOrderLink()`, `telLink()`. Formato peruano (51 + 9 dígitos) |
| `lib/supabase/client.ts` | 🟢 Completo | Singleton `createBrowserClient<Database>()` con storage key `tindivo-customer-auth` aislada |
| `auth-onboarding/host.tsx` | 🟢 Completo | Montado en root layout. `resumeOnboardingIfPending()` post-OAuth redirect. Renderiza `AuthOnboardingSheet` |
| `auth-onboarding/auth-onboarding-sheet.tsx` | 🟢 Completo | Carrusel horizontal de 6 steps con CSS translate. Skip en pasos no críticos. `onAuthStateChange` mientras está abierto |
| `auth-onboarding/persistence.ts` | 🟢 Completo | Todas las operaciones de auth, perfil, direcciones, términos (ver sección Onboarding) |
| Todos los 6 `steps/*.tsx` | 🟢 Completo | Cada step es una pantalla independiente con validación, estados de carga/error, y UX en español peruano |

---

## Deuda técnica confirmada — tabla final

| # | Tipo | Archivo | Descripción | Impacto |
|---|---|---|---|---|
| 1 | Gap | `persistence.ts` | `phone_verified_at` nunca se escribe desde el frontend. No hay flujo OTP/SMS | Sin verificación de teléfono, el antifraude del backend no puede confiar en el phone como identidad verificada |
| 2 | Gap | `checkout/page.tsx` | No se lee `strikes` ni `phone_verified_at` para decisiones antifraude. Solo se usan `contraentrega_blocked` y `blocked_until` | El backend puede tener más señales de riesgo que el frontend ignora |
| 3 | Gap | `cuenta/page.tsx` | No hay cambio de email, reset de password, ni eliminación de cuenta | Usuarios no pueden recuperar acceso ni gestionar su identidad completa |
| 4 | Deuda técnica | `checkout/page.tsx:25` | `DEFAULT_PREPAY_THRESHOLD = 80` hardcodeado como fallback | Si se cambia en DB, el frontend solo lo lee si `app_settings` responde; si falla, usa el hardcode |
| 5 | Deuda técnica | `checkout/page.tsx:26-27` | `NEAR_DELIVERY_FEE = 2.0` y `PICKUP_ENABLED = false` hardcodeados | La tarifa de delivery debería venir del negocio (ya existe en `business_profiles.delivery_fee`); pickup es decisión de producto, no técnica |
| 6 | Gap | `checkout/page.tsx` | `pending_mixed` payment intent no tiene UI | El enum existe en contratos pero el frontend no lo maneja |
| 7 | Gap | `pedido/[shortId]/page.tsx` | No hay mapa con ubicación del driver en tiempo real | El tracking muestra pasos pero no posición GPS del motorizado |
| 8 | Gap | `cart.ts` | Carrito 100% cliente (localStorage). No se persiste en servidor | Si el usuario cambia de dispositivo, pierde el carrito |
| 9 | Missing | — | No hay "order for later" (scheduled ordering) | Solo pedidos inmediatos |
| 10 | Missing | — | No hay tips/propinas en el checkout | Funcionalidad postergada |

---

## Estado general — auditoría completa

| Módulo | Estado |
|---|---|
| Onboarding (email + Google + 6 steps + resume) | 🟢 Completo |
| Home — lista de restaurantes | 🟢 Completo |
| Home — search global | 🟢 Completo |
| Negocio — menú con categorías | 🟢 Completo |
| Negocio — modal de producto con modificadores | 🟢 Completo |
| Negocio — modo WhatsApp (catálogo) | 🟢 Completo |
| Carrito (Zustand + localStorage + mono-negocio) | 🟢 Completo |
| Checkout — datos de entrega (dirección, mapa, GPS) | 🟢 Completo |
| Checkout — métodos de pago (3/4 intents) | 🟢 Completo (falta `pending_mixed`) |
| Checkout — GPS antifraude (3 geo-blocks) | 🟢 Completo |
| Checkout — flujo prepago (QR + comprobante) | 🟢 Completo |
| Checkout — bloqueo de cuenta | 🟢 Completo |
| Tracking — progress bar + timeline + cancel | 🟢 Completo |
| Tracking — polling 8s + Realtime | 🟢 Completo |
| Historial de pedidos | 🟢 Completo |
| Cuenta — perfil + direcciones CRUD | 🟢 Completo |
| Push notifications (suscripción) | 🟢 Completo |
| Páginas legales (privacidad + términos) | 🟢 Completo |
| Cobertura geográfica (polygon/circle, Haversine) | 🟢 Completo |
| Phone verification (OTP) | 🔴 No existe |
| Reset de password | 🔴 No existe |
| Eliminación de cuenta | 🔴 No existe |
| Driver GPS tracking en mapa | 🔴 No existe |
| Tips / propinas | 🔴 No existe |
| Orden programada (order for later) | 🔴 No existe |
| `pending_mixed` payment UI | 🟡 Enum existe, sin UI |
| Server-side cart persistence | 🟡 Solo cliente (localStorage) |

---

## Lo que falta para lanzar

Priorizado por necesidad para el flujo mínimo viable del piloto San Jacinto:

### 🔴 Crítico (bloquea lanzamiento)

1. **Verificación de teléfono (OTP/SMS)** — Sin esto, el antifraude del backend no puede confiar en la identidad del cliente. `phone_verified_at` debe setearse tras verificar un código SMS. Impacta directamente las reglas de contraentrega y prepago forzado.

### 🟡 Importante (primeras semanas post-lanzamiento)

2. **Reset de password** — Flujo "olvidé mi contraseña" con email de recuperación. Sin esto, usuarios que pierden su contraseña no pueden volver a entrar.
3. **Leer `strikes` y `phone_verified_at` en checkout** — El frontend debería reflejar el estado de riesgo completo (no solo `blocked`/`contraentrega_blocked`). Un warning de "Tu cuenta tiene X incidencias" antes de permitir efectivo.
4. **`pending_mixed` payment UI** — Si el negocio acepta pago mixto (parte billetera, parte efectivo), el frontend debe ofrecer la UI correspondiente.
5. **Delivery fee desde backend** — `NEAR_DELIVERY_FEE = 2.0` hardcodeado debe venir de `business_profiles.delivery_fee` o `app_settings`.

### 🟢 Deseable (post-piloto)

6. **Driver GPS en mapa para el cliente** — Mostrar la ubicación del motorizado en tiempo real durante el paso "En camino".
7. **Carrito server-side** — Persistir el carrito en el backend para que sobreviva cambios de dispositivo.
8. **Order for later** — Permitir programar un pedido para más tarde (ej. "entrega a las 8pm").
9. **Tips / propinas** — Selector de monto o porcentaje en el checkout.
10. **Eliminación de cuenta** — Flujo de auto-eliminación con confirmación.

---

**Veredicto:** `apps/customer` está **80% completo para el flujo mínimo viable del piloto**. El funnel completo (registro → browse → menú → carrito → checkout → tracking) funciona de punta a punta con GPS antifraude y 3 métodos de pago. El gap crítico es la verificación de teléfono (OTP), que es la base de la confianza para el Sistema Antifraude. Los demás gaps son importantes pero no bloquean el MVP.
