# Clasificación de la spec de la app nativa contra el plan móvil

> Trabajo, no norma. 2026-10-12, revisada el 2026-10-13 con la cola de decisiones abiertas (PR #49), los estándares de código v2 (PR #50) y las decisiones de Jesús sobre la enmienda · Decisión de Jesús: la spec de otro Claude sin acceso al repo ([`insumos.md`](insumos.md)) no entra
> en `Docs/planes/`; se trabaja por diff. Aquí, cada punto contra el plan móvil aprobado y en ejecución
> (`Docs/planes/movil/{contrato-rest,decisiones}.md`, las fases MV de `Docs/planes/migraciones/cola.md`), el análisis de
> `Docs/trabajo/movil/` y el código de `develop` (591ec569). Lo **nuevo** pasa a [`enmienda.md`](enmienda.md); lo de
> campañas, a [`../campanas/propuesta.md`](../campanas/propuesta.md). En conflicto, gana el plan.

**Clases.** *Cubierto*: el plan ya lo decide o lo hizo. *En conflicto*: choca con una D-xx, el contrato o el código;
gana el plan. *Nuevo*: no está en el plan. *Fuera de alcance*: no es del plan móvil (con su destino).

**Referencias:** `cr` = `Docs/planes/movil/contrato-rest.md`; `dec` = `Docs/planes/movil/decisiones.md`; `cola` =
`Docs/planes/migraciones/cola.md`; `07` = `Docs/trabajo/movil/07-publicacion-tiendas.md`; `08` =
`Docs/trabajo/movil/08-mv5-requisitos-revision.md`; `NAT`/`CUS`/`SYS` = `Docs/trabajo/movil/03-requisitos/`.

## Hallazgos que afectan a toda la spec

- **Los IDs de la spec sí existen, pero en ramas aún no integradas.** `CLI-1…15`, `DES-1…11`, `TS-17`, `TST-6`,
  `SW-2`, `KT-2`, `DB-13/14/19`, `API-1…12` y `OPS-4/5/9/10` están en el paquete de estándares de código v2
  (`Docs/arquitectura/estandares/`, aprobado por Jesús el 2026-10-12, ADR 0038) del **PR #50**, y las DA en la cola
  `Docs/trabajo/decisiones-abiertas.md` del **PR #49**. Ninguno está todavía en `develop`: por eso este documento los
  nombra como texto y no los enlaza. La primera versión (2026-10-12) los buscó en
  `Docs/trabajo/arquitectura/05-estandares.md` (v2.1) y los dio por ausentes; esta revisión los resuelve contra el #50
  y el #49. Siguen sin existir `Docs/operacion/publicar-apps-nativas.md` y `Docs/operacion/incidentes.md`: los
  estándares los marcan «por crear».
- **El plan ya tiene su propia numeración** (D-xx, MV, pasos del contrato). La spec la ignora, así que casi todo lo que
  llama «a completar» ya existe o ya está decidido.

## Tabla

| # | Punto de la spec (sección) | Clase | Dónde lo cubre o con qué choca | Motivo |
|---|---|---|---|---|
| 1 | Objetivo: pedir en tres pasos (§1) | Nuevo | Sin equivalente: el plan fija capacidades de la API, no el recorrido. Backend que lo sostiene: `POST /customer/checkout/quote` (`apps/api/app/api/v1/customer/checkout/quote/route.ts`), direcciones, `payment-options` (MV4b, PR #37) | Es un criterio de producto de la app → D-49 |
| 2 | Objetivo: recibir notificaciones de Tindivo (§1) | Cubierto | `cr` §3 paso 5 «Avisos nativos» (línea 67); `NAT-PSH-001…008` | Es el paso 5, aún sin lote en `cola` |
| 3 | Objetivo: ofertas y descuentos medidos campaña a campaña (§1) | Fuera de alcance → campañas | `NAT-MKT-001`, `dec` D-24/D-25/D-34 (abiertas) | Campañas son un sistema aparte (`../campanas/propuesta.md`) |
| 4 | Alcance 1: explorar sin cuenta (§2) | Cubierto | `GET /public/businesses`, `/public/businesses/{id}`, `/public/store`, `/public/config`, `/public/landmarks` (MV4a, PR #34) | El catálogo ya es público |
| 5 | Alcance 2: carrito persistente (§2) | Cubierto | `NAT-OFF-002` (caché local) y `CUS-CRT-*`; es estado del cliente, sin ruta | Solo la app |
| 6 | Alcance 3: confirmar en tres pasos con OTP la primera vez (§2) | En conflicto | `dec` D-22 (identidad del cliente, **abierta**: Apple + Google + recuperación; el OTP del teléfono se verifica *después* de la sesión); `POST /customer/phone/send-code`/`verify`; todas las rutas de pedido exigen `requireRole(req,'customer')` (`customer/orders/route.ts:33`) | La spec trata el OTP como identidad; eso es D-22, sin decidir. Gana el plan; pregunta abierta para Jesús, no se enmienda |
| 7 | Alcance 4: direcciones guardadas (§2) | Cubierto | `GET/POST /customer/addresses`, `PATCH/DELETE …/{id}`, `isDefault` (MV4b, migración `0256`) | Hecho |
| 8 | Alcance 4: método de pago por defecto (§2) | Nuevo | No existe columna ni campo en el perfil (`customer/profile/route.ts`); `payment-options` solo dice si hay contraentrega | → D-50 |
| 9 | Alcance 5: repetir un pedido anterior (§2) | Nuevo | Solo hay análisis: `NAT-MKT-004`, `CUS-CRT-012` (M2) y `Docs/trabajo/movil/01-sistema-actual/03-superficie-api.md:85` («no existe»); ni `cr` ni `mv4-inventario-rutas.md` lo incluyen | → D-51 |
| 10 | Alcance 6: estado por push y pantalla que relee al abrir y al deslizar (§2) | Cubierto | `cr` §1 «Tiempo real» (línea 28): push como canal principal, Realtime solo aviso, la app vuelve a pedir por REST y recupera al volver al primer plano; `GET /customer/orders/{id}` (MV4b) | Mismo diseño |
| 11 | Alcance 7: inicio, banners y ofertas servidos por la API (§2) | Nuevo (banners) / En conflicto (agregador `GET /home`) | `cr` línea 107: «no se construye un agregador de home sin medición»; `dec` §3.1 «Lo que se difiere: el agregador GET /home». Hoy los banners están en el código (`CUS-CAT-020`, `DEFAULT_BANNERS`); `NAT-MKT-002` los propone en M2 | El agregador choca y se descarta; los bloques administrables sin agregador son nuevos → D-52. Las «ofertas» con código van a campañas |
| 12 | Alcance 8: consentimientos transaccional y promocional, y su gestión en Cuenta (§2) | Fuera de alcance → campañas | `NAT-CON-001…003` (análisis M1), `dec` D-24 (abierta) | Consentimientos van a campañas por decisión de Jesús. El diseño de D-24 sigue abierto en el plan |
| 13 | Alcance 9: borrado de cuenta en la app y en una página web (§2) | Cubierto | MV5: `DELETE /customer/account` (migración `0259`, `customer/account/route.ts`), página `/borrar-cuenta`; `07` §8, `08` §A | Hecho en el repo, sin aplicar a producción |
| 14 | Alcance 10: configuración remota y actualización obligatoria, `GET /api/v1/config` y 426 (§2) | Cubierto | MV3 (PR #32): `apps/api/app/api/v1/config/route.ts`, `packages/contracts/src/client-compat.ts`, migración `0253`, `cr` §3 paso 2 (línea 63) | Hecho; mínimos de app en `0.0.0` hasta que Jesús los suba |
| 15 | Alcance 11: campañas desde el admin (crear, segmentar, programar, probar, enviar, cancelar, medir) (§2) | Fuera de alcance → campañas | `NAT-MKT-001`; `dec` D-25 (motor propio o gestionado, abierta) | Campañas |
| 16 | No entra: vista en tiempo real del pedido (§2) | Cubierto | `cr` línea 28: Realtime solo como aviso | Coincide |
| 17 | No entra: apps nativas de motorizados y negocios (§2) | Cubierto | `dec` D-30/D-35 (Negocios Android y luego Motorizados); el alcance de la spec es solo la del cliente | Compatible; no contradice el plan |
| 18 | No entra: métodos de pago que no existan (DA-04) (§2) | Cubierto | `NAT-PAY-003` («sin API pública de Yape/Plin: verificar antes de prometer»); `07` R10; DA-04 no está en el repo | Mismo criterio |
| 19 | No entra: chat, programa de puntos (§2) | Cubierto | Ninguno está en el plan | Coincide |
| 20 | No entra: analítica de terceros (§2, §10) | Nuevo | `07` §6 deja «uso de la app: por decidir» (hoy `@vercel/analytics` en la web); `NAT-ANA-002` (analítica de producto, M2) la propone | Decide una pregunta abierta del plan → D-53 |
| 21 | Principio: el servidor decide precios, envío, promociones y contraentrega (§3) | Cubierto | `cr` §1 («reglas de dinero y de estado en el servidor»), `quote/route.ts` (solo pinta; `create_customer_order` vuelve a decidir), `payment-options/route.ts:13-23` | Mismo principio |
| 22 | Principio: nada comercial en el binario, DES-8 (§3) | Cubierto (parámetros) / Nuevo (contenido comercial) | Parámetros ⚙ por `GET /config` (`dec` línea 85); regla `DES-8` de los estándares (#50: ningún contenido comercial en el binario; la ruta que lo sirva la fija el contrato). El contenido comercial es la fila 11 | La parte de parámetros ya está; banners → D-52 |
| 23 | Principio: una app instalada no se rompe, API-3/CLI-2 (§3) | Cubierto | `dec` D-41 (mínimos independientes), MV3, 426; `API-3` existe en `05-estandares.md` | Hecho |
| 24 | Principio: todo se mide por plataforma y por campaña (§3) | Cubierto (plataforma) / Fuera de alcance → campañas (campaña) | Plataforma: `dec` D-33 (conservar `customer_pwa` y añadir `client_platform`); hoy `p_source: 'customer_pwa'` fijo (`customer/orders/route.ts:339`) | Pendiente de implementar, ya decidido |
| 25 | Paso 1 «Armar»: inicio → negocio → producto, o repetir (§4) | Cubierto / Nuevo | Catálogo cubierto (fila 4); «Repetir» es la fila 9 | — |
| 26 | Paso 2 «Revisar»: total, envío, promoción aplicada (§4) | Cubierto | `POST /customer/checkout/quote` (MV4b): total, envío, promo de lanzamiento y por plato, vuelto máximo, umbral de prepago | Hecho |
| 27 | Paso 2: dirección por defecto y métodos de pago permitidos (§4) | Cubierto | `GET /customer/addresses` (`isDefault`), `GET /customer/payment-options` (`contraentregaAllowed`, `prepayRequired`) | Hecho; ver fila 28 por la sesión |
| 28 | Paso 2 llama a «Cotizar» con sesión opcional (§4, §5) | En conflicto | `quote/route.ts:44` y `payment-options/route.ts:27` exigen `requireRole(req,'customer')` | Cotizar sin sesión depende de D-22 (fila 6); hoy no se puede. Gana el plan |
| 29 | Paso 3: pide OTP solo la primera vez y crea el pedido con `Idempotency-Key` (§4) | En conflicto (OTP) / Cubierto (idempotencia) | OTP: fila 6. Idempotencia: C4 (PR #31, migraciones `0250`-`0252`), `customer/orders/route.ts:41-47` | Idempotencia hecha; OTP como identidad es D-22 |
| 30 | Criterio: recurrente con dirección y pago por defecto, dos toques (§4) | Nuevo | Sin equivalente en el plan | Criterio de producto → D-49 (junto con D-50) |
| 31 | Criterio: «Repetir pedido» en dos toques; si algo cambió, el paso 2 lo muestra (§4) | Nuevo | Fila 9 | → D-51 |
| 32 | Criterio: si no puede pagar contraentrega, lo sabe en el paso 2 (§4) | Cubierto | `CUS-CHK-007`, `payment-options` (prepago forzado y motivo), `create_customer_order` revalida | Hecho |
| 33 | §5: las rutas son las de `contrato-rest.md`, bajo `/api/v1/customer/…` (§5) | Cubierto | `cr` §1 y OpenAPI en `packages/contracts/openapi/v1.json` (MV2) | Mismo principio |
| 34 | Ruta «Configuración y actualización obligatoria»: `GET /api/v1/config` (§5) | Cubierto | MV3 (fila 14) | La spec ya la da por existente |
| 35 | Ruta «Inicio: bloques comerciales por segmento» (§5) | En conflicto / Nuevo | Filas 11 y 22 (agregador diferido; bloques → D-52) | El «por segmento del usuario» además exige segmentación → campañas |
| 36 | Ruta «Catálogo: negocios, menú y producto» (§5) | Cubierto | `GET /public/businesses`, `/public/businesses/{id}`, `/public/store`, `/public/store/{slug}` | Hecho |
| 37 | Ruta «Cotizar» (§5) | Cubierto | `POST /customer/checkout/quote` (fila 26) | Hecho |
| 38 | Ruta «Crear el pedido, con `campaignId` opcional» (§5) | Cubierto (pedido) / Fuera de alcance → campañas (`campaignId`) | `POST /customer/orders`, `POST /customer/courier-orders` | La atribución a campaña va con campañas |
| 39 | Ruta «Repetir un pedido» (§5) | Nuevo | Fila 9 | → D-51 |
| 40 | Ruta «Historial y detalle de pedidos» (§5) | Cubierto | `GET /customer/orders`, `GET /customer/orders/{id}`, `GET /customer/courier-orders` (MV4b) | Hecho |
| 41 | Ruta «Direcciones, una por defecto, idempotente al crear» (§5) | Cubierto | `customer/addresses/*` (migración `0256`: se guarda de una vez) | Hecho |
| 42 | Ruta «Registrar y quitar el dispositivo de push: token, plataforma, versión, permiso» (§5) | Cubierto | `cr` §3 paso 5 (línea 67: registro APNs/FCM, rotación, baja, cambio de usuario, manteniendo Web Push); `NAT-PSH-001` (`devices`: versión de app, `notifications_enabled`). Hoy `push/subscriptions` es solo Web Push (`endpoint` + claves) | Decidido y sin construir; **`cola` no tiene lote** para el paso 5 → ver enmienda §3 |
| 43 | Ruta «Consentimientos transaccional y promocional» (§5) | Fuera de alcance → campañas | Fila 12 | Consentimientos |
| 44 | Ruta «Registrar la apertura de un push» (§5) | Fuera de alcance → campañas | `NAT-PSH-006` (acuse, M1) ya cubre abrir un aviso transaccional; la apertura con `campaign_id` es de campañas | Se separa por destino |
| 45 | Ruta «Borrar la cuenta» (DB-13, D-44) (§5) | Cubierto | `DELETE /customer/account` (fila 13); `dec` D-44 | Hecho. `DB-13` (estándares, #50) pide anonimizar y D-44 lo concreta |
| 46 | Página web de borrado en el dominio de DA-11 con OTP, mismo caso de uso (§5) | Cubierto | `/borrar-cuenta` (`apps/customer/app/borrar-cuenta/`) usa la misma ruta; DA-11 (dominio de la página) sigue abierta en la cola del #49 | Hecho (revisa Codex) |
| 47 | Admin: listar, crear, editar campañas; programar, cancelar, probar; embudo; bloques de inicio (§5) | Fuera de alcance → campañas (los bloques de inicio: fila 11) | Ninguna ruta `admin/campaigns` | Campañas |
| 48 | Admin: rol administrador comprobado en el caso de uso, API-7 (§5) | Cubierto | `API-7` existe; ya se cumple en `admin/*` | Mismo estándar |
| 49 | Payloads de push (CLI-8): tipo de evento, id de pedido/campaña, estado, deep link, título y cuerpo (§5) | Cubierto | `NAT-PSH-004/005` (prioridad, TTL, colapso, `deep_link`), invariante 5 de `AGENTS.md` (tag `${event_type}-${shortId}`), `SYS-transversal` (catálogo de 15 avisos). El contrato formal del payload se escribe en el paso 5 | `CLI-8` (estándares, #50) pide el esquema del payload en `packages/contracts`, que es lo que se escribe en el paso 5; el campo `campaignId` es de campañas |
| 50 | Modelo: tabla `devices` (§6) | Cubierto | `NAT-PSH-001`/`MOB-03`, `cr` paso 5; hoy existe `push_subscriptions` con `install_id` (`push/subscriptions/route.ts`) | Mismo objeto, otro nombre; se amplía o se crea al hacer el paso 5 |
| 51 | Modelo: `consent_events` (§6) | Fuera de alcance → campañas | `NAT-CON-002` (`consent_log`), `dec` D-24 | Consentimientos |
| 52 | Modelo: `campaigns`, `campaign_deliveries`, `notification_opens` (§6) | Fuera de alcance → campañas | `NAT-MKT-001` | Campañas |
| 53 | Modelo: `home_blocks` (§6) | Nuevo | Fila 11 (`NAT-MKT-002` proponía `home_banners`) | → D-52 (sin `campaign_id`, sin `segment`) |
| 54 | Modelo: `orders.client_platform`, `client_version` (§6) | Cubierto | `dec` D-33 («conservar y añadir columnas»), `NAT-ANA-004`, `cr` paso 2 | Decidido, sin implementar (el `source` sigue fijo) |
| 55 | Modelo: `orders.campaign_id` (§6) | Fuera de alcance → campañas | — | Campañas |
| 56 | Idempotencia con el mecanismo existente (API-6) (§6) | Cubierto | C4: `creation_idempotency` (`0250`-`0252`) | Mismo mecanismo |
| 57 | Borrado de cuenta: anonimizar, borrar direcciones y dispositivos, revocar sesiones; no depender en cascada de Auth (§6) | Cubierto | `0259` anonimiza `orders`/`courier_orders` (`ON DELETE NO ACTION`, `07` §8), borra perfil, direcciones y `push_subscriptions`, y borra `auth.users` | Hecho; la spec lo dejó «sin verificar» |
| 58 | Todo objeto nuevo entra en `Docs/arquitectura/propiedad.md` (DES-7) (§6) | Fuera de alcance → arquitectura | `DES-7` (estándares, #50); el registro `Docs/arquitectura/propiedad.md` nace con ese PR | Depende de la arquitectura; entra con el #50 |
| 59 | Tabla del modelo la revisa Codex antes de migrar (§6) | Cubierto | `cola` y `Docs/operacion/agentes-en-esta-maquina.md`: lo que toca datos personales, seguridad o dinero pasa por Codex | Ya es la regla |
| 60 | Notificaciones transaccionales: cambios de estado, sin consentimiento promocional, con permiso del sistema (§7) | Cubierto | `NAT-PSH-003` (canales: `order_updates` fuera del control comercial), `07` R7 | Mismo diseño |
| 61 | Notificaciones promocionales con permiso y consentimiento vigente, CLI-9 (§7) | Fuera de alcance → campañas | `07` R7 (Apple 4.5.4) exige el interruptor aparte y apagado si hay promos | Campañas |
| 62 | Texto de consentimiento `orders-v1` tras el primer pedido, antes del diálogo del sistema (§7) | Cubierto | `NAT-PSH-002` («pedir el permiso en el momento de valor, justo tras pedir, con explicación previa»); `07` §3 | El texto es copy de la app; versionarlo es de campañas |
| 63 | Texto de consentimiento `promo-v1` (§7) | Fuera de alcance → campañas | — | Consentimientos |
| 64 | Envío de una campaña en cinco pasos (segmento, descartes, tope, FCM/APNs, bitácora) y `test-send` (§7) | Fuera de alcance → campañas | `NAT-MKT-001`, `dec` D-25 | Campañas |
| 65 | Atribución por `campaignId` en el deep link, ventana de 24 h (§7) | Fuera de alcance → campañas | — | Campañas |
| 66 | Apple: borrado desde la app, 5.1.1(v) (§8) | Cubierto | `07` R3, §8; MV5 | Hecho en el repo |
| 67 | Apple: push promocional con consentimiento y baja, 4.5.4 (§8) | Cubierto | `07` R7 | Ya en el expediente |
| 68 | Apple: Xcode 26 y SDK iOS 26 (§8) | Cubierto | `07` §3; `cola` «Lo que espera a Jesús» punto 4 (Mac) | Mismo requisito |
| 69 | Apple: datos de privacidad y política publicada (§8) | Cubierto | `07` §5 (política, borrador) y §6 (inventario de datos) | Mismo requisito |
| 70 | Apple: revisar 4.8 si se añade Google/Facebook (§8) | Cubierto | `07` R2: Sign in with Apple obligatorio porque ya hay Google; falta de Jesús (`08`) | La spec lo deja condicional; el plan ya lo exige |
| 71 | Google: borrado en la app y por enlace web en el formulario; congelar no vale (§8) | Cubierto | `07` R3; `/borrar-cuenta`; `0259` borra la identidad | Hecho |
| 72 | Google: `targetSdk` 36 (§8) | Cubierto | `07` §3 (línea 50) y `dec` línea 57 | Mismo requisito |
| 73 | Google: permiso `POST_NOTIFICATIONS` (§8) | Cubierto | `07` §3 (permisos), `NAT-PSH-002` | Mismo requisito |
| 74 | Google: formulario de seguridad de datos (§8) | Cubierto | `07` §6 | Mismo requisito |
| 75 | Ambas: bundle ID y `applicationId` decididos antes de la primera subida, DA-12 (§8) | Cubierto | `Docs/trabajo/movil/05-arranque/01-cuentas-y-firmas.md:49` (tabla) y `:241` (no se puede cambiar); DA-12 abierta en la cola del #49, con recomendación `com.tindivo.customer` | Pendiente de Jesús (no del repo) |
| 76 | F0: DA-01, DA-02, DA-08, DA-11, DA-12 decididas; mínimos de D-47 (§9) | Cubierto (D-47) / No verificable (DA) | `dec` D-47. DA-01 → D-22 (abierta); DA-02, DA-08, DA-11 y DA-12 están abiertas en la cola `decisiones-abiertas.md` del #49, cada una con la fase que bloquea (F0) | Contrastado: ninguna de las cinco está decidida, así que la condición de F0 de la spec sigue sin cumplirse. Es un asunto de Jesús, no una discrepancia |
| 77 | F0: estándares v2.2 aprobados y resumidos en `AGENTS.md` (§9) | Fuera de alcance → arquitectura | Los estándares de código v2 (`Docs/arquitectura/estandares/`, ADR 0038) están aprobados por Jesús el 2026-10-12 y entran con el PR #50; la v2.1 de `Docs/trabajo/arquitectura/05-estandares.md` queda superada | La aprobación de los estándares no es del plan móvil; ya se dio fuera de él |
| 78 | F0: CI del contrato con `oasdiff`, Spectral y `scripts/sync-openapi.sh --check` (§9) | Cubierto | Regla `DES-6` (estándares, #50): `oasdiff` contra la rama base, OBLIGATORIA; `API-1` (Spectral) y `CLI-1` (`scripts/sync-openapi.sh`). Hoy: OpenAPI generado de Zod y test de cobertura/conformidad (MV2a/b, `pnpm mobile:models`); ninguno de los tres existe aún en `scripts/` ni en `.github/` | Regla de los estándares, no decisión del plan (Jesús, 2026-10-13); se implementa con el #50 |
| 79 | F0: `packages/backend` con `defineHandler` (TS-17) y `/config` migrado (§9) | Fuera de alcance → arquitectura | `AGENTS.md` fija los paquetes; `dec` §5 «no se reescribe el dominio»; `TS-17` y el ADR 0039 (el backend es un paquete y la API su interfaz) entran con el PR #50 | Es decisión de arquitectura, ya tomada en el #50; no la toma el plan móvil |
| 80 | F0: cabeceras de CLI-3 registradas por la API (§9) | Cubierto | MV3: `X-Tindivo-Platform/App/App-Version/Build` (`client-compat.ts`) | Hecho |
| 81 | F0: proyectos `apps/customer-ios/` y `apps/customer-android/` con `AGENTS.md` local, lint y un test en CI (§9) | En conflicto | `dec` D-14 recomienda `apps/ios` y `apps/android` (abierta); CI de modelos: Kotlin por PR, Swift diario (D-48, `mobile-models-*`) | Gana el plan en nombres; `SW-2` y `KT-2` (estándares, #50) llaman a las carpetas `apps/customer-ios/` y `apps/customer-android/`, como la spec. Resolver al decidir D-14 |
| 82 | F0 aceptación: un PR que rompe el contrato falla en CI; ambas apps muestran la pantalla de actualización con 426 (§9) | Cubierto | Primera: `DES-6` (fila 78). Segunda: MV3 + `cr` paso 2 («versión vieja recibe el error documentado») y `CLI-4` | — |
| 83 | F1: rutas de cliente con tests de integración, acceso ajeno e idempotencia con concurrencia (§9) | Cubierto | `cr` paso 3 («cada ruta con prueba de integración y en OpenAPI»), C4 (concurrencia), `mv4b-customer-routes.integration.test.ts` | Hecho para lo existente |
| 84 | F1: tablas nuevas con pgTAP, RLS y permisos (§9) | Cubierto | `AGENTS.md` invariante 3; `DB-2/3/4/6` | Ya es la regla (la base se prueba con tests de integración, no pgTAP, hoy) |
| 85 | F1: borrado de cuenta y su página; límites de uso (API-10) (§9) | Cubierto | Borrado: fila 13. Límites: `apps/api/lib/http/rate-limit.ts` (PR #38) y OTP por número (SEC-03b, `lib/otp/phone-limit.ts`, umbral 5 en 24 h) | `API-10` (estándares, #50) exige ambos límites; siguen inactivos hasta definir Upstash |
| 86 | F1 aceptación: borrar deja al cliente sin datos personales y los cargos intactos; la misma clave dos veces a la vez crea un solo pedido (§9) | Cubierto | `0259` (no toca `business_charges`, `08` §A); concurrencia de C4 | Hecho |
| 87 | F2: flujos de §2 y §4 en cada plataforma (TST-6), CLI-1…14 (§9) | Cubierto | `dec` D-12 (lanzar a la vez; Android primero, iOS lo sigue), vectores de conformidad (`dec` §5); `TST-6` (prueba de UI del flujo crítico por plataforma contra una API simulada) y `CLI-1…14` (estándares, #50) | Mismo enfoque; los IDs existen |
| 88 | F2 aceptación: flujo crítico contra una API simulada; fixtures de compatibilidad futura; cerrar la app al confirmar no duplica (§9) | Cubierto | Vectores de conformidad y clientes generados (MV2c); C4 | Mismo enfoque |
| 89 | F3: campañas, tope y ventana horaria, estadísticas (§9) | Fuera de alcance → campañas | — | Campañas |
| 90 | F4: TestFlight y pista interna con un grupo pequeño de clientes reales (§9) | Cubierto | `07` §1, `cola` «Carril móvil» (pista cerrada de 12 testers × 14 días), `dec` D-11 | Mismo plan |
| 91 | F4: lista de §8 completa; OPS-4, OPS-5, OPS-9, OPS-10 (§9) | Cubierto | `OPS-4/5/9/10` (estándares, #50): OPS-4/5 y OPS-9 «obligatoria antes del lanzamiento nativo»; `Docs/operacion/incidentes.md` (OPS-9) está por crear (DA-14) | — |
| 92 | F4: primera publicación según `Docs/operacion/publicar-apps-nativas.md`, con liberación gradual (§9) | Cubierto | Regla `CLI-14` (estándares, #50): pruebas internas y luego liberación gradual (App Store) o escalonada (Google Play), con registro en `Docs/operacion/publicar-apps-nativas.md` (por crear). `07` y `01-cuentas-y-firmas.md` cubren cuentas y revisión | Regla de los estándares, no decisión del plan (Jesús, 2026-10-13) |
| 93 | F4 aceptación: crashes y errores se ven en el rastreador (§9) | Cubierto | **OPS-4** (`05-estandares.md:102`) y `NAT-ANA-001` (rastreador de fallos; Crashlytics o Sentry «por decidir», `07` §6) | Regla del encargo: los *crashes* no son alcance nuevo |
| 94 | F4 aceptación: la actualización obligatoria se probó en producción con un mínimo de prueba (§9) | Cubierto | MV3 lo prueba en CI; `CLI-4` (comportamiento ante el 426) y `CLI-14` (pruebas internas antes de producción) | Sin certeza: `CLI-14` no pide probar el 426 en producción. El método de la enmienda (subir el mínimo de una app sin usuarios) queda como práctica de publicación, no como decisión |
| 95 | Métrica: aceptación del permiso de push por plataforma (§10) | Nuevo | Requiere guardar el permiso del sistema por dispositivo (`NAT-CON-003` lo propone: `PATCH /me/devices/:id`); ninguna medición definida | → D-53 |
| 96 | Métrica: consentimiento promocional vigente (§10) | Fuera de alcance → campañas | — | Consentimientos |
| 97 | Métrica: pedidos por canal (`client_platform`) (§10) | Cubierto | `dec` D-33; `ADM-OPE-006` (`GET /admin/online-stats`, `/admin/conversion-stats`) y riesgo «cajera como canal dominante» (`dec` §5) | Misma medida, hay que añadir la columna |
| 98 | Métrica: recompra a 30 días, app frente a PWA (§10) | Nuevo | Sin definición en el plan; depende de la fila 97 | → D-53 |
| 99 | Métrica: embudo de campaña (§10) | Fuera de alcance → campañas | — | Campañas |
| 100 | Métricas: base propia, sin SDK, revisión semanal el primer mes (§10) | Nuevo | `NAT-ANA-002` propone lo contrario (analítica de producto en M2) | → D-53 |
| 101 | Métricas: la decisión de hacer nativa la app de negocios se apoya en ellas (§10) | En conflicto | `dec` D-30: Negocios Android ya está decidido y sube de prioridad; `D-35` | La app de Negocios no espera a estas cifras. Gana el plan |
| 102 | Riesgo: pocos aceptan el permiso de push (§11) | Cubierto | `dec` §5 («el efecto depende de cuántos instalen»), `NAT-PSH-002` | Misma mitigación |
| 103 | Riesgo: rechazo de la tienda (§11) | Cubierto | `07` §4 (R1…R10) | Más completo en el plan |
| 104 | Riesgo: abuso del OTP (§11) | Cubierto | SEC-03 / SEC-03b (límite por IP y por número), `rate-limit.ts`; `NAT-FRD-004` | Hecho en el repo, inactivo hasta Upstash |
| 105 | Riesgo: iOS y Android se comportan distinto (§11) | Cubierto | `dec` §5 («especificación única, vectores, tokens»), D-48 | Misma respuesta |
| 106 | Riesgo: un agente en la nube no puede compilar iOS (§11) | Cubierto | `dec` D-10 (tienes Mac), riesgo «iOS exige macOS y Xcode 26» | Misma respuesta |
| 107 | Decisiones abiertas: DA-01, 02, 04, 06, 07, 08, 11, 12 (§12) | Cubierto | Cada DA tiene destino en el canon: DA-02 (dominio de la API, F0), DA-06 (versiones soportadas, F4), DA-08 (herramienta de *crashes*, F0), DA-11 (dominio de deep links y borrado, F0) y DA-12 (identificadores de las apps, F0) son entradas abiertas de la cola del #49. DA-01 (camino del OTP) → D-22, abierta; DA-04 (pagos) → D-21/D-38 y `DECISIONS.md` §7; DA-07 (tope y ventana de promociones) → D-24, abierta | Ya existe la cola; ninguna DA nace de la spec |
| 108 | Decisiones cerradas: D-44 y D-47 no se reabren (§12) | Cubierto | `dec` D-44, D-47 | Coincide |
| 109 | Cabecera de la spec: «Estado: aprobado… {FECHA_APROBACION}», alcance «§2», estándares en `Docs/arquitectura/estandares/` | En conflicto | `Docs/README.md` §2: solo Jesús aprueba, por documento; los estándares que cita ya están aprobados (ADR 0038) y entran con el #50 | La spec no está aprobada; entra por esta enmienda |

Las filas con dos clases se cuentan en la **primera**. Tras la revisión del 2026-10-13 no queda ninguna fila sin
clasificar: los IDs que faltaban se resolvieron contra el #49 y el #50.

## Un punto que la spec no menciona y el plan sí

Los *kill switches* y las *flags* de `GET /config` están en el plan (`dec` línea 85; `Docs/trabajo/movil/06-contrato-rest-movil.md:108`)
pero **no están en el código**: `ClientCompatSettingsSchema` (`packages/contracts/src/client-compat.ts:57-66`) solo tiene
`minAppVersion` y `minOs`. La spec no los pide; el pendiente es del plan y se señala en la enmienda §3.

## Resumen

Conteo de las 109 filas (medido con un script sobre esta tabla), por la primera clase de cada fila.

| Clase | Filas |
|---|---|
| Cubierto | 71 |
| En conflicto | 7 |
| Nuevo | 12 |
| Fuera de alcance | 19 (16 → campañas, 3 → arquitectura) |
| Sin clasificar | 0 |
| **Total** | **109** |

- **Nuevo (12 filas), agrupado en las decisiones de [`enmienda.md`](enmienda.md):** D-49 (filas 1, 30), D-50 (8), D-51 (9, 31,
  39), D-52 (11, 53), D-53 (20, 95, 98, 100). Las cinco están aprobadas por Jesús (2026-10-13) y promovidas a
  `Docs/planes/movil/decisiones.md`. Las filas 78, 82, 92 y 94, que la primera versión agrupaba en D-54 y D-55, son
  **reglas de los estándares** (`DES-6`, `CLI-14`), no decisiones del plan: pasan a Cubierto.
- **Fuera de alcance → campañas (16):** filas 3, 12, 15, 43, 44, 47, 51, 52, 55, 61, 63, 64, 65, 89, 96, 99. Además,
  las partes de campaña de las filas 24 y 38 (clasificadas Cubierto por su parte principal).
- **Fuera de alcance → arquitectura (3):** 58, 77, 79 (`propiedad.md`, estándares v2, `packages/backend`): ya decididas en el #50.
- **En conflicto (7):** 6 y 29 (OTP como identidad, D-22), 28 (cotizar sin sesión), 35 (agregador `GET /home`), 81 (nombres
  de carpetas, D-14), 101 (Negocios no espera a las métricas, D-30), 109 (la spec no está aprobada). Gana el plan en todos.
- **Sin clasificar (0).** La fila 107 (las DA-xx) se resolvió contra la cola del #49: cada DA tiene destino.
- **Choque con una decisión abierta de Jesús:** D-22 (identidad del cliente). Su planteamiento está en [`d-22.md`](d-22.md).
