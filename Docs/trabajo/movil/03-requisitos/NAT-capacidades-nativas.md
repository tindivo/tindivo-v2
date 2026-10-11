# NAT · Capacidades nativas nuevas (lo que hoy no existe y el móvil habilita)

> **Son tus «balas de plata».** Cada capacidad se justifica por **qué dolor tuyo resuelve**, qué
> pide al **backend**, en qué **plataforma** aplica y cuándo tiene sentido. Todas son
> `➕ · NUEVO`. Formato y leyendas: [`00-formato-y-convenciones.md`](00-formato-y-convenciones.md).
>
> **Tus cuatro motivos, y dónde se atacan:**
>
> | Lo que dijiste | Se resuelve con |
> |---|---|
> | «Avisos que no llegan» | `NAT-PSH-*` (push nativo fiable) + `NAT-LIV-*` (seguimiento vivo) |
> | «No puedo mandar push de marketing» | `NAT-CON-*` (consentimiento) + `NAT-MKT-*` (campañas) |
> | «No saben descargar una PWA / no conocen la web» | Estar en las tiendas + `NAT-LNK-*` (enlaces, QR, *banner*) |
> | «Las direcciones no son exactas en el navegador» | `NAT-LOC-*` (GPS nativo, precisión, mapa) + `NAT-FRD-*` |
> | «Lentitud» | Cliente nativo con conexiones reutilizadas + `NAT-OFF-*` (caché, reintentos) + `PER-01…03` |
>
> **Dato para dimensionar el efecto:** hoy **11 de 77** cuentas de cliente tienen push (**0 en iPhone**,
> `NOT`) y solo **13,5 %** de los pedidos nacen en la PWA. El techo de estos avances no es la
> tecnología: es cuánta gente instale la app.

## Cómo priorizar (recomendación de trabajo, a validar)

| Ola | Qué entra | Criterio |
|---|---|---|
| **M1** (lanzamiento) | `NAT-PSH-001…008`, `NAT-CON-001…003`, `NAT-LOC-001…003`, `NAT-AUT-001…003`, `NAT-LNK-001…003`, `NAT-PAY-001…003`, `NAT-OFF-001…003`, `NAT-ANA-001,004`, `NAT-FRD-002,004` | Sin esto no hay paridad ni se pasa la revisión de tiendas, o el valor de estar nativos no se ve |
| **M2** (diferenciadores) | `NAT-LIV-001…002`, `NAT-MKT-001…004`, `NAT-MKT-006`, `NAT-FRD-001,003`, `NAT-ANA-002…003`, `NAT-UX-001…003` | Es donde el nativo **gana** a la PWA y responde a tus dolores; se apoya en M1 |
| **M3** (opcionales) | `NAT-LIV-003`, `NAT-MKT-005`, `NAT-LNK-004…005`, `NAT-AUT-004`, `NAT-UX-004…005`, `NAT-PSH-009` | Útil pero de retorno menor o incierto |

**Lo que no recomiendo hacer todavía** (no por imposible, sino por retorno): *App Clip* (iOS) y
experiencias instantáneas de Android (verificar vigencia), *passkeys*, integración profunda con
Yape/Plin (no hay API pública documentada), *widgets* y atajos de Siri. Primero notificaciones,
ubicación y campañas.

---

## NAT-PSH · Notificaciones nativas transaccionales

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-PSH-001 | **Registro de dispositivo y token** al iniciar sesión; reasignar al cambiar de usuario; **desasociar al cerrar sesión**; refrescar el token. | Alcance real: cada instalación es un destino. | Tabla `devices` (`MOB-03`): plataforma, token, **entorno** sandbox/producción, versión de app/SO, idioma, zona horaria, `notifications_enabled`. Purga por `410 Unregistered` / `UNREGISTERED`. | iOS · Android | M | M1 |
| NAT-PSH-002 | **Pedir el permiso en el momento de valor** (justo tras pedir), con explicación previa. | El permiso es «un cartucho»: un «No» del sistema no se repite (`lib/push.ts:14-33`). | iOS: opción de **autorización provisional** (entrega silenciosa sin diálogo) como plan B. Android 13+: `POST_NOTIFICATIONS`. Guardar cuántas veces se ofreció y qué respondió. | iOS · Android | S | M1 |
| NAT-PSH-003 | **Canales y categorías**: `order_updates` (alta), `promotions` (baja), `news`. | Que el cliente silencie marketing sin perder «tu motorizado llegó». | Cada aviso del catálogo (`SYS-transversal`) lleva su canal. Android: canales obligatorios. iOS: categorías; **`time-sensitive`** para «está en tu puerta» (requiere la capacidad correspondiente). | iOS · Android | S | M1 |
| NAT-PSH-004 | Entregar los **15 avisos** del catálogo con **prioridad, TTL y colapso** propios. | Resuelve `NOT-03`: un «tu pedido salió» no debe llegar mañana. | APNs: `apns-priority`, `apns-expiration`, `apns-collapse-id` (**≤ 64 B**), `apns-push-type`. FCM (HTTP v1): `android.priority`, `android.ttl`, `android.collapse_key`. Modelo semántico de notificación (`NOT-05`). | iOS · Android | M | M1 |
| NAT-PSH-005 | **Abrir la pantalla correcta** al tocar el aviso, con estado fresco. | Hoy la URL es web relativa. | Cada aviso lleva `deep_link` (`tindivo://pedido/ABC12345` o universal link). | iOS · Android | S | M1 |
| NAT-PSH-006 | **Acuse** de recibido/abierto. | Medir la entrega real (`NOT-08`). | `POST /me/notifications/{id}/ack`; guardar `apns-id`/`message_id`. | iOS · Android | S | M1 |
| NAT-PSH-007 | **Sonido propio** (la campanilla de cocina y el tono de Tindivo). | Identidad; el aviso que importa se reconoce sin mirar. | Assets `.caf` (iOS, ≤ 30 s) y `res/raw` (Android); el sonido se elige por canal. | iOS · Android | S | M1 |
| NAT-PSH-008 | **Enriquecer** el aviso (logo del negocio) y **medir** con la *Notification Service Extension*. | Reconocimiento; base del acuse en iOS. | URL de imagen firmada/pública en el payload; `mutable-content`. | iOS | M | M1 |
| NAT-PSH-009 | **Acciones rápidas** en el aviso («Ver pedido», «Escribir al motorizado»). | Menos toques. | Categorías con acciones y manejador. | iOS · Android | S | M3 |
| NAT-PSH-010 | **Insignia** con los pedidos activos. | Recordatorio visual. | Contador en el payload (`badge`) o local. | iOS · Android | S | M2 |

## NAT-CON · Consentimiento y preferencias

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-CON-001 | **Centro de preferencias** por categoría. | Requisito de tienda y de confianza. | `notification_preferences(user_id, category, enabled, updated_at, source)`; `order_updates` fuera del control comercial. | iOS · Android | S | M1 |
| NAT-CON-002 | **Consentimiento explícito de marketing** con el texto en la app y **baja en un toque**; registro auditable. | **App Store 4.5.4**; Ley 29733 (validar con asesoría legal). | `consent_log(user_id, category, text_version, granted, at, device_id)`; endpoint de baja. Nunca activar marketing por defecto. | iOS · Android | S | M1 |
| NAT-CON-003 | Sincronizar el **permiso del sistema** con `notifications_enabled`. | Saber a quién *realmente* se puede llegar. | `PATCH /me/devices/:id`. Cambio al volver a primer plano. | iOS · Android | S | M1 |

## NAT-MKT · Marketing y crecimiento

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-MKT-001 | **Campañas push**: segmentos (recencia, negocio favorito, zona, «sin pedir en N días», cliente nuevo), programación en hora `America/Lima`, **tope de frecuencia**, **horas de silencio**, plantillas con variables, *deep link* a negocio/plato/promo, envío de prueba y **métricas** (enviado → entregado → abierto → pedido). | Tu motivo central. | Servicio de campañas con **envío en lotes y concurrencia limitada** (hoy `send-push` es serial, `PER-07`); respeta `NAT-CON`; panel en el admin (`ADM-MKT-*` por crear); consultas de segmentos sobre `orders`/`address_directory`. | iOS · Android | L | M2 |
| NAT-MKT-002 | **Banners y promociones administrables** con vigencia y segmentación. | Hoy están escritos en el código (`CUS-CAT-020`). | Tabla `home_banners` (imagen, enlace, vigencia, segmento) + `GET /home`. | iOS · Android | M | M2 |
| NAT-MKT-003 | **Cupones y códigos** (envío gratis, descuento). | Reutiliza el mecanismo de la promo de lanzamiento (`CUS-CHK-017`). | `promo_redemptions` ya existe; definir **quién financia** (Tindivo no retiene fondos). | iOS · Android | M | M2 |
| NAT-MKT-004 | **Recompra real** («Volver a pedir») y recordatorio con consentimiento. | Aumenta el autoservicio frente al tecleo de la cajera. | `POST /me/orders/:id/reorder` que **revalida** disponibilidad y precios (`CUS-CRT-012`). | iOS · Android | M | M2 |
| NAT-MKT-005 | **Compartir/invitar** con enlace y código; atribución. | Crecimiento boca a boca en un pueblo. | Universal links con parámetros; tabla de referidos. | iOS · Android | M | M3 |
| NAT-MKT-006 | Pedir **valoración de tienda** (StoreKit / Play In-App Review) tras una entrega y una reseña positiva. | Reputación en las tiendas. | Solo cliente; regla: tras N pedidos entregados sin incidentes. | iOS · Android | S | M2 |
| NAT-MKT-007 | **Atribución de instalación** (QR del mostrador, campañas). | Ya hay `source=qr_*` como dato de marketing (`DECISIONS §8`). | `install referrer` (Android) y parámetros de enlace (iOS). | iOS · Android | S | M2 |

## NAT-LIV · Seguimiento vivo

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-LIV-001 | **Live Activity + Dynamic Island** con: paso actual (4), ETA en rango, cuenta atrás del plazo de pago, nombre de pila del motorizado y «en tu puerta». | Es *el* seguimiento: el cliente ve el estado **sin abrir la app** ni depender de un push suelto. Resuelve gran parte de «avisos que no llegan». | Iniciar en el dispositivo al crear el pedido; **push de actualización** (`apns-push-type: liveactivity`, tópico `<bundle>.push-type.liveactivity`, prioridad y `stale-date`) con el **token de la actividad**; *push-to-start* (iOS 17.2+); cierre en `delivered`/`cancelled`. Tabla `live_activities(order_id, device_id, activity_push_token, …)`. Una actividad dura hasta **8 h**. | iOS 16.1+ | L | M2 |
| NAT-LIV-002 | **Notificación en curso** con progreso (y *Live Updates* en Android 16). | Equivalente Android. | Actualizar la misma notificación por FCM (mismo `tag`) o servicio en primer plano acotado; canal `order_updates`. | Android | M | M2 |
| NAT-LIV-003 | **Widget** «mi pedido en curso». | Comodidad. | `GET /me/orders/active` ligero. | iOS · Android | M | M3 |
| NAT-LIV-004 | Mostrar el **mapa** del motorizado en la actividad. | Confianza. | Requiere que **la app de motorizados** envíe ubicación (hoy solo captura en la puerta); política de privacidad y consentimiento del motorizado. **No existe hoy.** | iOS · Android | L | M3 |

## NAT-LOC · Ubicación precisa (tu queja de «direcciones inexactas»)

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-LOC-001 | **GPS nativo de alta precisión** con permiso «mientras se usa», manejo de **precisión aproximada** (iOS 14+, Android 12+) y solicitud de **precisión temporal** cuando falte. | El pin nace con la lectura del sensor, no del navegador. | Guardar `precision` (`precise|approximate`). | iOS · Android | M | M1 |
| NAT-LOC-002 | **Mapa nativo** con satélite y ajuste fino del pin; puntos de interés del pueblo. | En un pueblo sin numeración, ver la casa por satélite es lo que decide. | `map_landmarks`, polígono ⚙ y zonas (ya existen). MapKit (iOS); Google Maps SDK o MapLibre (Android): **decisión** (`04-decisiones-abiertas.md`). | iOS · Android | M | M1 |
| NAT-LOC-003 | **Enriquecer** la dirección con `location_source` (`gps`/`pin_adjusted`/`manual`), `is_mock_provider`, precisión y hora. | Calidad del punto para el motorizado (`CUS-ADR-011`) y antifraude. | Columnas nuevas en `customer_addresses` y `orders`; recalcular la distancia **en servidor**. | iOS · Android | S | M1 |
| NAT-LOC-004 | **Geocodificación inversa opcional** para sugerir la línea de dirección. | Ahorra tecleo. | Solo ayuda, nunca requisito (en San Jacinto puede ser pobre). Hoy no existe geocodificación. | iOS · Android | S | M3 |

## NAT-FRD · Antifraude y abuso

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-FRD-001 | **Detectar ubicación simulada** y enviarla como **señal** (no como bloqueo). | El GPS del navegador «se falsifica sin root» (`DECISIONS §8`); en nativo hay bandera oficial. | `orders.customer_gps_is_mock`; `customer_contraentrega_decision` puede **ponderar** la señal. Decisión de negocio. | iOS (`isSimulatedBySoftware`) · Android (`isMock`) | S | M2 |
| NAT-FRD-002 | **App Attest / Play Integrity** en endpoints sensibles (`send-code`, `POST /orders`). | Complementa el *rate limiting* (`SEC-03`): la petición viene de la app legítima. | Verificación en servidor con cuotas; puede degradarse sin bloquear. | iOS · Android | M | M1 |
| NAT-FRD-003 | **Identificador de instalación** estable para detectar varias cuentas por dispositivo. | Anti-abuso de promos y de strikes. | `devices.id`; **sin** IDFA. Informar en la política de privacidad. | iOS · Android | S | M2 |
| NAT-FRD-004 | **Límites de OTP** por destino, IP y dispositivo. | SMS de pago por verificación (`SEC-03`). | Upstash en la API; contador por número. | Servidor | S | M1 |

## NAT-AUT · Acceso nativo

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-AUT-001 | **Sign in with Apple**, **Google nativo** (ID token) y correo. | Obligatorio en iOS (4.8). | Proveedor de Apple en Supabase (Service ID, clave); clientes OAuth de Google iOS/Android (`SEC-08`). | iOS · Android | M | M1 |
| NAT-AUT-002 | **Autocompletado del código OTP**. | Menos fricción en el alta: el OTP es un paso obligatorio antes del primer pedido y cada envío es un SMS de pago. | iOS: `.oneTimeCode`; Android: **SMS Retriever** (requiere incluir el *hash* de la app en el SMS de Twilio Verify) o *User Consent*. | iOS · Android | S | M1 |
| NAT-AUT-003 | **Sesión en Keychain / Keystore**; biometría opcional para reautenticar acciones sensibles (borrar cuenta). | Seguridad. | Refresco de token y cierre **local** (`CUS-AUT-012`). | iOS · Android | S | M1 |
| NAT-AUT-004 | **Passkeys**. | Sin contraseñas. | Soporte de Auth. | iOS · Android | M | M3 |

## NAT-LNK · Enlaces y entrada

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-LNK-001 | **Universal Links / App Links** para `/pedido/:shortId`, `/negocio/:slug`, `/promo/:code`. | Los enlaces que ya circulan por WhatsApp abren la app. | `apple-app-site-association` y `assetlinks.json` en el dominio web; ruta de respaldo web. | iOS · Android | S | M1 |
| NAT-LNK-002 | **Banner de instalación** (Smart App Banner / *install referrer*) en la web. | Convierte a quien entra por la web («no conocen cómo ingresar»). | Metaetiquetas + parámetros de atribución. | Web | S | M1 |
| NAT-LNK-003 | **QR del mostrador** que abre la app o la tienda con atribución. | El QR del local ya existe como dato de marketing. | `source=qr_*` + enlace corto. | iOS · Android | S | M1 |
| NAT-LNK-004 | **App Clip** (iOS): pedir sin instalar. | Ataca directamente «no saben descargar». | Requiere tamaño mínimo y flujo reducido; evaluar tras M2. | iOS | L | M3 |
| NAT-LNK-005 | **Compartir** negocio/pedido (hoja de compartir). | Boca a boca. | Enlaces canónicos. | iOS · Android | S | M3 |

## NAT-PAY · Pago y comprobante

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-PAY-001 | **Captura con cámara o galería** (selector nativo), compresión y **subida reanudable**. | El prepago es donde el cliente se pierde: **13 de 41** pedidos prepagados del canal cliente se cancelaron (32 %), frente al 18-27 % de los otros métodos. | URL firmada/TUS de Storage; `prepay-proof` que **verifique** la imagen (`SEC-05`). | iOS · Android | M | M1 |
| NAT-PAY-002 | **Copiar el número**, **guardar el QR** en fotos y compartir. | Menos pasos para pagar. | `prepay-info` ya devuelve QR y número. | iOS · Android | S | M1 |
| NAT-PAY-003 | Botón **«Abrir Yape/Plin»** si la app está instalada. | Un toque menos. | **Sin API pública documentada**: verificar esquemas de URL antes de prometerlo. | iOS · Android | S | M1 (si se verifica) |
| NAT-PAY-004 | **Recordatorio local** a los 5 min del plazo de pago. | Reduce `prepay_timeout` (3 de las 25 cancelaciones del canal cliente). | Solo cliente, con el plazo ⚙ recibido en `prepay-info`. | iOS · Android | S | M2 |

## NAT-OFF · Fiabilidad de red y rendimiento percibido

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-OFF-001 | **Cola de reintentos** con idempotencia (cancelar, subir comprobante, reseña). | Redes de pueblo. | `Idempotency-Key` en toda la superficie móvil (`DAT-01`). | iOS · Android | M | M1 |
| NAT-OFF-002 | **Caché local** de catálogo, últimos pedidos y direcciones; arranque instantáneo con datos viejos y refresco. | Ataca «lentitud». | `ETag` / `If-None-Match` y `Cache-Control` en el catálogo; SwiftData / Room. | iOS · Android | M | M1 |
| NAT-OFF-003 | **Estado de red** visible y reintento automático. | Evita el «botón muerto» (incidente 2026-09-09). | — | iOS · Android | S | M1 |
| NAT-OFF-004 | **Caché de imágenes** con variantes por densidad. | Datos móviles. | Variantes `w=` en Storage (según plan) o generadas al subir (`packages/images`). | iOS · Android | S | M2 |

## NAT-ANA · Analítica y calidad

| ID | Capacidad | Valor | Requisitos de backend | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-ANA-001 | **Informe de fallos** (Crashlytics o Sentry). | Los fallos ocurren en el teléfono del usuario (`PRO-05`). | Símbolos/mapas de ofuscación en CI. | iOS · Android | S | M1 |
| NAT-ANA-002 | **Analítica de producto**: embudo abrir → negocio → bolsa → checkout → pedido → entregado. | Medir si el autoservicio crece frente al tecleo. | Eventos con `request_id`; respetar privacidad (sin seguimiento entre apps → no exige ATT). | iOS · Android | M | M2 |
| NAT-ANA-003 | **Rendimiento** (arranque, red) con MetricKit / Firebase Performance. | Validar `PER-*`. | — | iOS · Android | S | M2 |
| NAT-ANA-004 | Enviar `X-Client-Platform`, `X-Client-Version`, `X-Client-Build` en cada petición. | Base del control de versiones (`MOB-02`, `ARQ-07`). | Columnas `client_*` en `orders` (`ARQ-08`). | iOS · Android | S | M1 |

## NAT-UX · Experiencia nativa

| ID | Capacidad | Valor | Nota | Plataforma | Esf. | Fase |
|---|---|---|---|---|---|---|
| NAT-UX-001 | **Háptica** en acciones clave (agregar, confirmar, error). | Sensación de calidad. | — | iOS · Android | S | M2 |
| NAT-UX-002 | **Accesibilidad**: Dynamic Type, VoiceOver, TalkBack, contraste. | Requisito de calidad; el diseño web tiene deuda (`--color-ink-subtle` da 2,5:1). | Tokens de diseño a exportar (`MOB-21`). | iOS · Android | M | M2 |
| NAT-UX-003 | **Modo oscuro**. | Uso nocturno (el negocio opera de noche). | ⚠️ El diseño actual es **«sin dark mode»** (`DECISIONS §16`): decisión de producto. | iOS · Android | M | M2 |
| NAT-UX-004 | **Atajos** (Siri / App Intents; *App Shortcuts*): «¿Dónde está mi pedido?», «repetir mi último pedido». | Comodidad. | Depende de `NAT-MKT-004`. | iOS · Android | M | M3 |
| NAT-UX-005 | **Sonidos** con sesión de audio correcta (no interrumpir música). | Los sonidos de confirmación existen hoy (`kitchen-bell.mp3`). | — | iOS · Android | S | M2 |

## Lo que necesita el **backend** para habilitar todo esto (resumen)

| Pieza | Sirve a |
|---|---|
| `devices`, `notification_preferences`, `consent_log`, `live_activities` | `NAT-PSH`, `NAT-CON`, `NAT-LIV` |
| Modelo semántico de notificación + renderizador APNs/FCM/Web + **outbox real** | `NAT-PSH-004`, `NAT-MKT-001` |
| Servicio de **campañas** (segmentos, programación, tope, lotes, métricas) | `NAT-MKT-001` |
| `GET /config` (versiones mínimas, *flags*, parámetros) | `MOB-02`, todo |
| `GET /home` con banners, `GET /me/*` con modelos de lectura | `NAT-MKT-002`, `ARQ-01` |
| Columnas `client_*`, `location_source`, `is_mock_provider`, `precision` | `NAT-ANA-004`, `NAT-LOC-003`, `NAT-FRD-001` |
| *Rate limiting*, App Attest / Play Integrity | `NAT-FRD-002/004` |
| `DELETE /me` (anonimización) | `CUS-AUT-017` |
