# 07 · Preparación para un cliente nativo (Swift + Kotlin)

> **Pregunta:** capacidad por capacidad, ¿qué tiene el backend hoy y qué le falta para servir a una
> app de iOS y una de Android publicadas en las tiendas?
> Este documento **no repite** los hallazgos de los demás: los **agrupa por capacidad** y añade lo
> que solo aparece al mirar desde el móvil. Etiquetas y escalas:
> [`00-veredicto-y-metodo.md`](00-veredicto-y-metodo.md).

**Decisión de stack registrada:** dos apps **100 % nativas** (Swift/SwiftUI en iOS, Kotlin/Jetpack
Compose en Android). Consecuencias que condicionan todo lo demás:

1. **No se reutiliza nada de TypeScript.** El contrato tiene que salir como **OpenAPI** y las reglas
   que hoy están en `contracts`/`core` se reimplementan o se mueven al servidor (`ARQ-02`, `ARQ-03`).
2. **El catálogo de requisitos (`03-requisitos/`) es la especificación común** que mantiene la
   *paridad* entre plataformas: cada requisito tiene un ID estable con criterios de aceptación que
   ambas apps deben cumplir.
3. **Para compilar iOS hace falta macOS** (Xcode). El equipo de trabajo actual es Windows: ver
   `MOB-17` y `04-decisiones-abiertas.md`.

## Matriz de capacidades

**Leyenda de estado:** ✅ existe y sirve · 🟡 existe pero hay que adaptarlo · ❌ no existe.

| ID | Capacidad | Hoy | Brecha principal | Hallazgos relacionados | Bloquea |
|---|---|---|---|---|---|
| MOB-01 | **Contrato** OpenAPI y clientes generados | ❌ | Solo Zod de peticiones; sin respuestas ni OpenAPI | ARQ-02 | **Sí** |
| MOB-02 | **Configuración remota**: versión mínima por plataforma, *kill-switch*, *feature flags*, parámetros de negocio | ❌ | Sin `GET /config`; sin versión mínima; sin 426 | ARQ-07, DAT-07 | **Sí** |
| MOB-03 | **Registro de dispositivos y push nativo** (APNs/FCM), preferencias y consentimiento | ❌ | Solo `push_subscriptions` (Web Push) | NOT-02, NOT-06 | **Sí** |
| MOB-04 | **Autenticación nativa** | 🟡 | Google y correo existen; falta **Sign in with Apple**, Google nativo, OTP con autocompletado y almacenamiento seguro | SEC-07, SEC-08, DAT-03 | **Sí** |
| MOB-05 | **Enlaces profundos** (*universal links* / *App Links*) | ❌ | Rutas web existen (`/pedido/:shortId`, `/negocio/:slug`); faltan `apple-app-site-association` y `assetlinks.json` | — | Parcial |
| MOB-06 | **Ubicación y direcciones** | 🟡 | Modelo con `accuracy_m`, `method`, `confirmed_at` ✅; falta *mock location*, unificar almacenes | DAT-04 | No |
| MOB-07 | **Reintentos y modo sin red** | 🟡 | `Idempotency-Key` solo en 4 de 49 rutas | DAT-01 | Parcial |
| MOB-08 | **Imágenes** para móvil | 🟡 | Compresión al subir ✅ (`packages/images`); sin variantes por densidad | — | No |
| MOB-09 | **Idioma, zona horaria y formatos** | ✅ | `es-PE`, `America/Lima`, `PEN`; los mensajes de error son texto en español | DAT-02 | No |
| MOB-10 | **Cumplimiento de tiendas** | ❌ | Sin borrado de cuenta, sin inventario de privacidad, sin consentimiento de notificaciones | SEC-09, DAT-06, NOT-06 | **Sí** |
| MOB-11 | **Analítica y reporte de fallos** | ❌ | Ningún tracker; solo `@vercel/analytics` | PRO-05 | Parcial |
| MOB-12 | **Tiempo real** del pedido | 🟡 | Solo `postgres_changes` + polling; falta *Broadcast* por pedido y Live Activities | PER-04, PER-05 | No |
| MOB-13 | **Pagos Yape/Plin** (captura, QR) | ✅ | `prepay-info` y QR existen; el envío del comprobante es de 2 pasos | DAT-05 | No |
| MOB-14 | **Soporte** | ✅ | `app_settings.support_whatsapp` | — | No |
| MOB-15 | **Web de respaldo** | 🟡 | La PWA actual hace de respaldo; hay que decidir su alcance | — | Parcial |
| MOB-16 | **Repositorio y estructura** de las apps nativas | ❌ | Decidir monorepo vs repos separados | — | Parcial |
| MOB-17 | **Cuentas, claves y firmas** (Apple, Google, Firebase) y **macOS** | ❌ | Ninguna configurada | PRO-08 | **Sí** |
| MOB-18 | **CI/CD móvil** | ❌ | Ninguno | PRO-01, PRO-08 | Parcial |
| MOB-19 | **Pruebas, distribución y versionado** | ❌ | Ninguno | PRO-02 | Parcial |
| MOB-20 | **Seguridad del cliente nativo** | ❌ | Sin App Attest/Play Integrity; sin límites de abuso | SEC-03 | Parcial |
| MOB-21 | **Sistema de diseño** para nativo | 🟡 | Tokens web (Tailwind); hay que exportarlos | — | No |

---

## Detalle de las capacidades que necesitan una decisión o un diseño

### MOB-02 · Configuración remota y control de versiones

Es **la pieza más barata y más protectora**. Propuesta mínima de `GET /config` (público, cacheable
corto):

```
{
  "platform_min_version": { "ios": "1.0.0", "android": "1.0.0" },
  "platform_latest_version": { "ios": "1.2.0", "android": "1.2.0" },
  "maintenance": { "active": false, "message": null },
  "flags": { "live_activities": true, "marketing_opt_in_prompt": true, ... },
  "business_rules": { "prepay_threshold": 80, "max_cash_bill": 100, "max_change": 50,
                      "support_whatsapp": "51…", "terms_version": "2026-05" },
  "coverage": { "polygon": [...], "center": {...} }
}
```

La app la lee **al abrir** y **antes de acciones críticas**; si la versión está por debajo del
mínimo, muestra una pantalla de «actualiza para continuar» (el backend responde **426** a las
rutas de mutación de esa versión). Los números de `business_rules` **no se escriben en la app**
(`DAT-07`).

### MOB-03 · Registro de dispositivos y push nativo

Modelo mínimo (detalle y justificación en `NOT-02`, `NOT-06`):

```
devices(id, user_id, platform, token, environment, app_version, os_version, device_model,
        locale, timezone, notifications_enabled, live_activity_push_to_start_token,
        last_seen_at, created_at)
notification_preferences(user_id, category, enabled, updated_at, source)
consent_log(id, user_id, category, text_version, granted, at, device_id)
live_activities(id, user_id, order_id, device_id, activity_push_token, started_at, ended_at)
```

Reglas: **un dispositivo por instalación**, se **reasigna** al usuario que inicia sesión (y se
desasocia al cerrar sesión: un móvil compartido no debe recibir los avisos del anterior);
`token` **único**; purga por `410/UNREGISTERED`; y **`environment`** (`sandbox`/`production`) porque
un token de APNs de desarrollo no sirve en producción.

### MOB-04 · Autenticación nativa

| Método | Estado | Notas |
|---|---|---|
| Correo + contraseña | ✅ (22 cuentas) | Mantener por compatibilidad; **no** ofrecerlo como principal en nativo |
| Google | ✅ (64 cuentas) | En nativo usar el flujo de **ID token** (`signInWithIdToken`) con clientes OAuth de iOS y Android |
| **Sign in with Apple** | ❌ | **Obligatorio en iOS** al ofrecer Google u otro *login* social (guía 4.8); puede **ocultar el correo** → `users.email` no puede asumirse real |
| **OTP de teléfono** | 🟡 (propio, Twilio Verify, SMS) | Añadir autocompletado: iOS `oneTimeCode`; Android **SMS Retriever** (requiere el *hash* de la app en el mensaje) |
| Sesión | 🟡 | Guardar en **Keychain / Keystore**; refresco automático; el cierre de sesión debe ser **local al dispositivo** (`scope: local`), porque el `signOut()` global echó a todos los usuarios ya una vez (`Docs/handoff/2026-08-17-el-logout-que-echaba-a-todos.md`; guarda `check:auth`) |
| Borrado de cuenta | ❌ | `SEC-09` |

### MOB-05 · Enlaces profundos

Hay que servir dos ficheros estáticos en el dominio del cliente (`tindivo.com` / `www`): **`/.well-known/apple-app-site-association`**
(sin extensión, `application/json`) y **`/.well-known/assetlinks.json`**. Mapa de rutas mínimo que la
app y los avisos deben entender:

| Enlace | Destino |
|---|---|
| `/pedido/:shortId` | Seguimiento del pedido (también lo envía la cajera por WhatsApp, `DECISIONS.md §5`) |
| `/negocio/:slug` | Página de un negocio |
| `/cuenta`, `/pedidos` | Cuenta, historial |
| `/promo/:code` *(nuevo)* | Promoción de una campaña |

Si la app **no** está instalada, el mismo enlace debe seguir abriendo la **web** (respaldo) con un
banner para instalar (**Smart App Banner** en iOS; *install referrer* en Android).

### MOB-06 · Ubicación y direcciones

Lo que **ya existe y conviene aprovechar**: `customer_addresses.location_accuracy_m` y
`location_confirmed_at`, `orders.customer_gps_method`
(`gps_high_accuracy|gps_low_accuracy|manual_skip_prepaid|failed`), `orders.delivery_coordinates_accuracy_m`,
`map_landmarks` (43 puntos de interés del pueblo), polígono de cobertura en `app_settings`. **No hay
geocodificación**: la dirección es **pin + referencia libre de 15-140 caracteres** (`ADDRESS_REFERENCE_MIN/MAX`),
lo que es adecuado para un pueblo sin numeración.

Lo que **falta**: `location_source` (`gps|pin_adjusted|manual`), `is_mock_provider` (Android:
`Location.isMock`; iOS: `CLLocationSourceInformation.isSimulatedBySoftware`), `precision`
(`precise|approximate`, porque iOS 14+ y Android 12+ permiten conceder solo ubicación aproximada), y
recalcular en servidor la distancia al centro (`DAT-04`, `SEC-10`).

### MOB-10 · Cumplimiento de tiendas (lista de comprobación)

| Requisito | App Store | Google Play | Estado |
|---|---|---|---|
| Borrado de cuenta desde la app | 5.1.1(v) | Política de cuentas | ❌ |
| Enlace web de solicitud de borrado | — | Sí | ❌ |
| Política de privacidad y términos accesibles | Sí | Sí | ✅ (`/privacidad`, `/terminos`) |
| Etiquetas de privacidad / seguridad de datos | Sí | Sí | ❌ (`DAT-06`) |
| Sign in with Apple si hay login social | 4.8 | — | ❌ |
| Notificaciones **no obligatorias** y consentimiento para marketing con baja | 4.5.4 | Recomendado | ❌ |
| Permiso de notificaciones (Android 13+) y **canales** | — | Sí | ❌ |
| Explicación de uso de ubicación | `NSLocationWhenInUseUsageDescription` | Declaración de permisos | ❌ (nuevo) |
| Pagos fuera de la tienda para bienes y servicios físicos (sin compra dentro de la app) | 3.1.3(e) | Política de pagos | ✅ Tindivo **no retiene fondos**; Yape/Plin/efectivo directo al negocio |
| Contenido generado por usuarios (reseñas) con moderación | 1.2 | UGC | 🟡 (las reseñas no son públicas hoy, `DECISIONS §28`) |

(Las guías cambian; hay que contrastarlas con las vigentes de Apple y Google al enviar.)

### MOB-15 · Qué hace la web cuando exista la app

Recomendación de trabajo, a validar (`04-decisiones-abiertas.md`): **no apagar la PWA.** Debe
quedar como (1) **respaldo de enlaces** (`/pedido/:shortId` para quien no tiene la app), (2)
**página de aterrizaje de las tiendas** (URL de soporte y de política requeridas), (3) **página de
borrado de cuenta**, (4) `/.well-known/*`, y (5) **embudo hacia la tienda** (*Smart App Banner*,
QR). Lo que **deja de mantenerse** en la web de cliente: instalación de PWA, `service worker`, suscripción
Web Push, y el flujo completo de pedido si se decide que el pedido solo se hace en la app.

### MOB-16 a MOB-19 · Programa de entrega móvil

| ID | Tema | Lo que hay que decidir/tener |
|---|---|---|
| MOB-16 | **Estructura** | Proyectos Xcode y Gradle dentro del monorepo (`apps/ios`, `apps/android`) o repos aparte. Ventaja del monorepo: la **especificación OpenAPI, los vectores de conformidad y los tokens de diseño** viven juntos y el CI los valida. |
| MOB-17 | **Cuentas y firmas** | Apple Developer Program (pago anual) y Google Play Console (pago único); *bundle id* / *application id*; **clave APNs (.p8)**; proyecto **Firebase** (FCM, opcional Crashlytics); *Service ID* de Sign in with Apple; clientes OAuth de Google para iOS/Android/Web; huellas SHA-1/SHA-256; **Play App Signing**. **macOS obligatorio para iOS**: un Mac propio o un servicio en la nube (Xcode Cloud, GitHub Actions con *runners* macOS, Codemagic, Bitrise). |
| MOB-18 | **CI/CD** | *Builds* reproducibles; **fastlane** o Xcode Cloud; Gradle en Linux; secretos de firma en el gestor del CI; subida automática a TestFlight y a la pista interna de Play. |
| MOB-19 | **Pruebas y distribución** | XCTest/XCUITest y JUnit/Espresso/Compose UI test; **pruebas de contrato contra *staging***; TestFlight y pruebas internas/cerradas de Play; política de versiones (`MAJOR.MINOR.PATCH` + número de compilación) enlazada con `platform_min_version`. |

---

## Lo que **sí** está listo para el móvil

- **Errores RFC 9457 con `requestId`** y un cliente con **plazos** y **política de reintento** pensados para mala red.
- **Idempotencia bien diseñada** para la creación del pedido.
- **Storage con URL firmadas** y subida directa (adecuada para *uploads* reanudables desde móvil).
- **Modelo de ubicación con precisión** y método de captura.
- **Parámetros operativos en `app_settings`** (falta exponerlos por `GET /config`).
- **Tindivo no retiene fondos**: sin pasarela de pago ni comisiones de tienda por compras dentro de la app.
- **Un dominio de antifraude explícito**, portable tal cual (es servidor).

## Resumen de este documento

Veintiuna capacidades (`MOB-01`–`MOB-21`); **seis bloquean la publicación**: contrato, configuración
remota y versiones, dispositivos y push nativo, autenticación (Sign in with Apple), cumplimiento de
tiendas y, aunque es de organización más que de backend, cuentas/firmas/macOS (`MOB-17`).
