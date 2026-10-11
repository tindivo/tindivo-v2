# 01 · Mapa del sistema actual

> **Para qué sirve:** que alguien que no ha visto el código entienda **qué es Tindivo, quién lo usa,
> de qué piezas se compone y por dónde pasa un pedido**. Todo está medido el 2026-09-20 (`HEAD 09749a4`,
> base `tindivo-prod` en la migración 0230). Los hallazgos están en `../02-auditoria-backend/`.

## 1. Qué es

Plataforma de **delivery hiper-local** para pueblos del Perú. Piloto: **San Jacinto (Áncash)**, de
**noche** (⚙ 18:00-23:00). **Tindivo no retiene fondos**: el cliente paga por Yape/Plin o en efectivo
**directo al negocio**; Tindivo cobra al negocio una comisión por pedido entregado. El antifraude es
**humano** (la cajera llama). Reconstruido desde cero respecto del v1 (`../tindivo-delivery`).

**Lo que dicen los datos** (`tindivo-prod`, 2026-09-20): 716 pedidos desde el 2026-08-08, **4 negocios**,
4 motorizados; **619 pedidos (86 %) los teclea la cajera** por lo que le dicen por teléfono y **97 (13,5 %)
los hace el cliente** en la PWA. Es decir: el producto hoy es, sobre todo, **una herramienta de cajera y
motorizado**, y la app de cliente es el canal de autoservicio que se quiere hacer crecer.

## 2. Quién lo usa (actores)

| Actor | Qué hace | App |
|---|---|---|
| **Cliente** | Explora, pide, paga (efectivo / Yape-Plin al recibir / prepago), sigue el pedido, cancela, reseña, apela | `apps/customer` (PWA) |
| **Cajera / negocio** | Recibe pedidos (web y por teléfono), acepta, cocina, valida comprobantes, cobra recojos, confirma efectivo, gestiona menú | `apps/negocios` (PWA) |
| **Motorizado** | Toma pedidos, recoge, entrega, cobra, declara efectivo, reporta incidentes | `apps/motorizados` (PWA) |
| **Admin / soporte** | Configura, resuelve casos y apelaciones, liquida, gestiona negocios/motorizados/zonas | `apps/admin` |
| **Sistemas** | Twilio Verify (OTP por SMS), Inngest (plazos), Google (OAuth), WhatsApp (solo enlaces `wa.me`), Yape/Plin (sin API; solo QR) | — |

## 3. Piezas y tamaño

| Proyecto | Qué es | Páginas | Líneas TS/TSX (sin tests) | Notas |
|---|---|---|---|---|
| `apps/api` | REST único `/api/v1` en **Next 16** (Route Handlers), desplegado en Vercel | 85 rutas | 12,3 k | Dominio `apiv2.tindivo.com` (`api.tindivo.com` es el v1) |
| `apps/customer` | PWA de cliente (`tindivo.com`, `www`) | 9 | 24,9 k | **Lo que se reescribe primero** |
| `apps/negocios` | PWA de negocio (`negocios.tindivo.com`) | 12 | 29,6 k | La más grande; 103 accesos directos a tablas |
| `apps/motorizados` | PWA de motorizado (`motorizados.tindivo.com`) | 6 | 13,5 k | La más pulida |
| `apps/admin` | Panel (`admin.tindivo.com`) | 26 | 14,4 k | Solo escritorio |
| `packages/contracts` | Zod canónico: primitivas, enums, máquina de estados, reglas de pago, horarios | — | 1,9 k | Solo **peticiones** (`ARQ-02`) |
| `packages/core` | Dominio en TS: `order` (dinero, short id, máquina de estados), `reports`, `review` | — | 1,3 k | La lógica real está en SQL (`ARQ-04`) |
| `packages/api-client` | Cliente REST tipado con plazos y reintento | — | — | 15 s de plazo |
| `packages/supabase` | Fábricas de cliente + tipos generados de la base | — | — | `database.types.ts` |
| `packages/ui` | Sistema de diseño (Tailwind v4, tokens en `theme.css`) | — | — | Solo web |
| `packages/images` | Compresión de imágenes por perfil (`logo`, `banner`, `product`, `qr`, `proof`) | — | — | Lado del navegador |
| `supabase/` | 230 migraciones, 78 *rollbacks*, 1 Edge Function (`send-push`, 1 127 líneas) | — | ≈ 245 KB de SQL en funciones | Postgres 17 |

**Stack:** Next 16.2 · React 19.2 · TypeScript 6 (estricto) · Tailwind 4 · Zod 4 · `@supabase/ssr` +
`supabase-js` · TanStack Query · Zustand · React Hook Form · Leaflet (mapas) · Motion · Biome ·
Vitest · Playwright · Turborepo + pnpm · Node 24.

## 4. Infraestructura y proveedores

| Proveedor | Para qué | Región / plan |
|---|---|---|
| **Vercel** (5 proyectos) | Hospeda las 4 apps y la API; **la función de la API corre en `iad1` (Washington)**, el borde que atiende desde Perú es `gru1` (São Paulo) `[PRUEBA]` | Plan: **Hobby (gratuito)**, confirmado por el usuario el 2026-09-20; no admite uso comercial (`PRO-06`) |
| **Supabase** (`tindivo-prod`, ref `zpnipajgwfthxhdtzhly`) | Postgres 17, Auth (Google + correo), Realtime, Storage (5 buckets), Edge Function, Vault, `pg_cron`, `pg_net` | Región: **`us-west-2` (Oregón)** (`PER-02`). Plan: **Free (gratuito)**, confirmado por el usuario el 2026-09-20: sin copias de seguridad (`PRO-06`) |
| **Inngest Cloud** | Plazos por pedido (aceptación, validación, pago, traspaso) y un cron de outbox de apelaciones | Gratuito (50 k ejecuciones/mes según la doc) |
| **Twilio Verify** | Código OTP por **SMS** (WhatsApp no está aprobado) | De pago por verificación |
| **Upstash** (Redis) | Declarado para *rate limiting* | **No se usa** (`SEC-03`) |
| **Google OAuth** | Inicio de sesión | Configurado en el panel de Supabase (no versionado, `SEC-08`) |
| **CARTO / OpenStreetMap / Esri** | Teselas del mapa (calle y satélite) | Solo web (Leaflet) |
| **WhatsApp** | Solo **enlaces** (`wa.me`, `api.whatsapp.com`) para soporte, pedidos en modo catálogo y avisos de la cajera | Sin API de WhatsApp Business |
| **Yape / Plin** | El cliente paga **a la cuenta del negocio**; Tindivo solo muestra el QR y el número | Sin integración |

Dominios: `tindivo.com` y `www` → app de cliente · `apiv2.tindivo.com` → API · `api.tindivo.com` → **v1 legacy**.

## 5. Por dónde pasa un pedido (de punta a punta)

```
CLIENTE (PWA)                     API (Vercel, iad1)                   SUPABASE
─────────────                     ─────────────────                   ────────
Arma bolsa (local, sin cuenta)
  └─ lee catálogo ───────────────► GET /public/businesses/:id ───────► 8 consultas (caché de borde 15 s)
Inicia sesión (Google/correo) ────────────────────────────────────────► Auth
Verifica celular ────────────────► POST /customer/phone/send-code ───► Twilio Verify (SMS) · customer_otp_attempts
Confirma pedido ─────────────────► POST /customer/orders ────────────► 11-17 rondas; RPC create_customer_order
   (Idempotency-Key)                    │  reglas: horario, pausa, capacidades, umbral, antifraude…
                                        └─ Inngest: temporizador de aceptación
                                                                        ├─ INSERT orders + items (misma transacción)
                                                                        └─ INSERT domain_events → trigger dispatch_event
                                                                              └─ pg_net → Edge Function send-push → Web Push
NEGOCIO (cajera) ◄── push / pantalla ── (aviso «Nuevo pedido»)
Acepta (tiempo de preparación) ──► POST /business/orders/:id/transition ► advance_order('accept')
                                        · contraentrega → preparing      · prepago → awaiting_payment
CLIENTE ◄── push «Ya puedes pagar» (prepago)
Sube captura ────────────────────► Storage (payment-proofs) + POST …/prepay-proof ► estado validando
NEGOCIO valida comprobante ──────► POST /business/orders/:id/validate ─► validate_order (máx. 2 intentos)
   … cocina → «Listo» ──────────► advance_order('ready')  (recorta la ETA a queue_lead_minutes)
MOTORIZADO toma ─────────────────► POST /driver/orders/:id/transition ► take → arrived → pickup
                                                                        → arrived_customer → deliver (cobra)
CLIENTE ◄── seguimiento: GET /public/orders/:shortId cada 8 s + Realtime + push
Entrega ─────────────────────────► delivered (terminal) → cargos al negocio (business_charges) → ventana de reseña
```

Caminos alternativos: **cancelación** (cliente en la ventana; negocio; admin; timers), **recojo**
(`preparing → ready_for_pickup → delivered`, cerrado por la cajera con `handover`/`pickup_no_show`),
**apelación** de un comprobante rechazado, **traspaso** entre motorizados, **catálogo** (modo
WhatsApp: no hay pedido en la plataforma).

## 6. Dónde vive cada tipo de lógica

| Tipo de regla | Vive en… | Consecuencia |
|---|---|---|
| Estados, dinero, antifraude, plazos | **Funciones SQL** (`advance_order`, `create_customer_order`, `validate_order`, `get_tracking`…) | Es el dominio real; se prueba con integración (fuera de CI) |
| Forma de las peticiones, límites de campos | `packages/contracts` (Zod) | No lo entienden Swift/Kotlin |
| Reglas de horario, franja de plato, matriz de pagos, pasos del seguimiento | `packages/contracts` (TS) **y** el cliente | Copias ×4 con SQL y las dos apps nativas (`ARQ-03`) |
| Guards duplicados «por defensa» | `apps/api/.../customer/orders/route.ts` | Ya costó tres incidentes |
| Parámetros | `app_settings` (tabla) | Bien: editables sin desplegar |
| Textos de los avisos push | Edge Function `send-push` | Con forma Web Push (`NOT-05`) |
| Autorización de datos | RLS + `GRANT` por columna + `SECURITY DEFINER` | Sólido; hay que vigilar los `EXECUTE` (`SEC-02`) |

## 7. Glosario (lenguaje del negocio)

| Término | Significa |
|---|---|
| **Cajera / negocio** | Quien atiende el restaurante y opera la app `negocios` |
| **Papelito** | Franja/color de un negocio en las tarjetas de pedido (`accent_color`) |
| **Contraentrega** | Pagar al recibir (efectivo o Yape/Plin al motorizado) |
| **Prepago** | Pagar antes de cocinar: el cliente sube una **captura** (comprobante) y la cajera la **valida** |
| **Recojo «ahora» / «más tarde»** | Cliente en el mostrador / que pasa después (este último solo prepago) |
| **Validación / `validando`** | La cajera **llama** al cliente para confirmarlo (cliente nuevo, monto grande o strike) |
| **Strike** | Falta anclada al teléfono y a la dirección (2 → solo prepago; 3 → bloqueo 30 días) |
| **Compra previa** | Tener historial (pedido entregado por cuenta o teléfono, o fila en el directorio) |
| **Banda** | `near` / `far`: tarifa de envío por zona del punto de entrega |
| **Sencillo / vuelto** | Cambio que la caja adelanta al motorizado para cobrar en efectivo |
| **Bolsa** | El carrito del cliente |
| **Mochila / slots** | Cuántos pedidos puede llevar un motorizado a la vez (⚙ máx. 3) |
| **Traspaso** | Un motorizado le pide su pedido a otro (30 s; callarse cede) |
| **Liquidación** | Entrega de efectivo del motorizado al negocio (por pedido) o pago de comisiones del negocio a Tindivo (semanal, manual) |
| **Apelación** | Reclamo del cliente cuando se rechaza su comprobante por segunda vez |
| **Pilot / piloto** | Fase actual; el «muro del piloto» ya está apagado (`PRO-07`) |
