> **Insumo, no manda.** Copia literal de `app-clientes-nativa/spec.md`, escrita por otro Claude sin acceso al repo (paquete `tindivo-specs-2026-10-12`, recibido el 2026-10-12); manda `Docs/planes/movil/`, y por qué cada punto entra o no está en [`clasificacion.md`](clasificacion.md).

# App de clientes nativa v1 (iOS y Android)

> Estado: aprobado · Aprobado por Jesús el {FECHA_APROBACION} ({MEDIO}) · Commit de referencia: `{SHA}`
> Alcance: §2 · Criterios de aceptación: §9 · Decisión: `Docs/decisiones/NNNN-app-clientes-nativa.md` · Estándares: `Docs/arquitectura/estandares/`

## 1. Objetivo

Que un cliente pida en tres pasos, reciba notificaciones de Tindivo y que Jesús pueda enviar ofertas y descuentos medidos campaña por campaña.

## 2. Alcance

### Entra en v1

1. Explorar sin cuenta: inicio, negocios, menú, producto.
2. Carrito persistente.
3. Confirmar pedido en tres pasos (§4), con identificación por OTP al confirmar la primera vez.
4. Direcciones guardadas y método de pago por defecto.
5. Repetir un pedido anterior.
6. Estado del pedido por push y en la pantalla del pedido, que lo relee al abrirse y al deslizar para actualizar.
7. Inicio, banners y ofertas servidos por la API (DES-8).
8. Consentimientos de notificación, transaccional y promocional, y su gestión en Cuenta.
9. Borrado de cuenta en la app y en una página web.
10. Configuración remota y actualización obligatoria según el contrato: `GET /api/v1/config` y `426 client_upgrade_required` (CLI-4).
11. Campañas desde el admin web: crear, segmentar, programar, probar, enviar, cancelar y medir.

### No entra en v1

- Una vista del estado del pedido en tiempo real: no se prioriza en v1. El contrato permite Realtime como aviso, y la app podrá usarlo después sin cambiar el contrato.
- Apps nativas de motorizados y de negocios.
- Métodos de pago que hoy no existan (DA-04).
- Chat, programa de puntos y analítica de terceros.

## 3. Principios

- **El servidor decide** precios, envío, promociones y si el cliente puede pagar contraentrega. La app muestra.
- **Nada comercial en el binario** (DES-8): lo comercial cambia sin pasar por revisión de tienda.
- **Una app instalada no se rompe** (API-3, CLI-2).
- **Todo se mide por plataforma y por campaña** (§10), con datos de la base propia.

## 4. Los tres pasos

| Paso | Pantalla | Qué hace | Qué llama |
|---|---|---|---|
| 1. Armar | Inicio → negocio → producto, o «Repetir pedido» | Añade productos al carrito | Inicio, catálogo y repetir pedido (§5) |
| 2. Revisar | Checkout | Muestra total, envío, promoción aplicada, dirección por defecto y métodos de pago permitidos | Cotizar (§5) |
| 3. Confirmar | Botón «Confirmar pedido» | Pide OTP solo la primera vez y crea el pedido | Supabase Auth (DA-01); crear pedido con `Idempotency-Key` (§5) |

Criterios:

- Cliente recurrente con dirección y pago por defecto: del carrito al pedido creado en dos toques (Revisar → Confirmar).
- «Repetir pedido»: dos toques (Repetir → Confirmar) si nada cambió; si cambió un precio o falta un producto, el paso 2 lo muestra antes de confirmar.
- Si el cliente no puede pagar contraentrega, lo sabe en el paso 2, nunca al confirmar.

## 5. Contrato

Las rutas, los códigos, las cabeceras y las formas son los de `Docs/planes/movil/contrato-rest.md`, aprobado y en producción; para esta app, rutas por actor bajo `/api/v1/customer/…`. Esta spec no fija rutas: dice qué necesita la app. Antes de F1, el agente completa la columna «Ruta en el contrato» con la ruta existente o, si falta, la propone en el contrato siguiendo sus convenciones, con su aprobación.

### Lo que necesita la app de clientes

| Capacidad | Sesión | Idempotencia | Ruta en el contrato |
|---|---|---|---|
| Configuración y actualización obligatoria | No | — | `GET /api/v1/config` (existe) y `426 client_upgrade_required` |
| Inicio: bloques comerciales vigentes para el segmento del usuario (DES-8) | Opcional | — | A completar |
| Catálogo: negocios, menú y producto | No | — | A completar |
| Cotizar: total, envío, promoción y métodos de pago permitidos; con sesión, la elegibilidad de contraentrega | Opcional | — | A completar |
| Crear el pedido, con `campaignId` opcional (§7) | Sí | Sí (API-6) | A completar |
| Repetir un pedido: carrito con precios y disponibilidad actuales, sin crear pedido | Sí | — | A completar |
| Historial y detalle de pedidos | Sí | — | A completar |
| Direcciones, una por defecto | Sí | Al crear | A completar |
| Registrar y quitar el dispositivo de push: token, plataforma, versión y estado del permiso | Sí | Idempotente | A completar; si ya existe para web push, se amplía |
| Consentimientos transaccional y promocional | Sí | — | A completar |
| Registrar la apertura de un push | Sí | — | A completar |
| Borrar la cuenta (DB-13, D-44) | Sí | — | A completar |

La página web de borrado de cuenta vive en el dominio de DA-11, se identifica con OTP y usa el mismo caso de uso que la ruta de borrado.

### Lo que necesita el admin web

| Capacidad | Ruta en el contrato |
|---|---|
| Listar, crear y editar campañas en borrador | A completar |
| Programar, cancelar y enviar una prueba al dispositivo de quien la crea | A completar |
| Embudo de una campaña (§10) | A completar |
| Bloques de inicio | A completar |

Todas exigen rol de administrador, comprobado en el caso de uso (API-7).

### Payloads de push (CLI-8)

Si el contrato ya define los payloads de push, mandan esos. Si no, se proponen en el contrato con esta información mínima: tipo de evento, identificador del pedido o de la campaña, estado del pedido (valores de la máquina de estados de `orders`) y *deep link*. Cada push lleva además título y cuerpo visibles.

## 6. Modelo de datos nuevo

Lo revisa Codex antes de migrar: toca datos personales y permisos. Nombres y tipos según `sql.md`. Antes de migrar, el agente contrasta cada tabla con el esquema real: lo que ya exista, como las suscripciones de push actuales, se reutiliza o se amplía. Esta tabla describe lo que falta.

| Tabla | Columnas principales | Reglas |
|---|---|---|
| `devices` | `installation_id` (PK), `user_id`, `platform` (`ios`, `android`), `push_token` (único), `app_version`, `push_permission` (`granted`, `denied`, `not_determined`), `last_seen_at`, `created_at`, `updated_at` | Se borra al cerrar sesión y al borrar la cuenta |
| `consent_events` | `id`, `user_id`, `kind` (`transactional`, `promotional`), `is_granted`, `text_version`, `platform`, `created_at` | Solo inserción (DB-14); estado vigente con `current_consent` |
| `campaigns` | `id`, `name`, `status` (`draft`, `scheduled`, `sending`, `sent`, `cancelled`), `segment`, `title`, `body`, `deeplink`, `scheduled_at`, `sent_at`, `created_by`, `created_at`, `updated_at` | `segment`: `all` o una categoría de Clientes Frecuentes: VIP, Activo, Dormido o Nuevo (sin verificar su nombre en código) |
| `campaign_deliveries` | `id`, `campaign_id`, `user_id`, `installation_id`, `status` (`sent`, `failed`, `skipped_no_consent`, `skipped_frequency_cap`, `skipped_outside_window`), `created_at` | Solo inserción: es bitácora (DB-8) |
| `notification_opens` | `id`, `user_id`, `campaign_id`, `order_id`, `created_at` | Solo inserción |
| `home_blocks` | `id`, `kind` (`banner`, `section`, `offer`), `payload` (`jsonb` validado con el esquema de `contracts`, DB-19), `segment`, `priority`, `starts_at`, `ends_at`, `campaign_id`, `created_at`, `updated_at` | Lo sirve la ruta de inicio |
| `orders` (columnas nuevas) | `client_platform` (`ios`, `android`, `web`), `client_version`, `campaign_id` (opcional) | Atribución y medición |

- Idempotencia (API-6): se usa el mecanismo que ya existe para `idempotency_conflict`.
- Borrado de cuenta (DB-13): se anonimiza el perfil, se borran direcciones y dispositivos, y se revocan sesiones. Si el usuario de Auth se borra o se desactiva depende de que los pedidos no dependan de él en cascada (sin verificar el esquema). Qué se conserva para antifraude es lo que decidió D-44.
- Todo objeto nuevo entra en `Docs/arquitectura/propiedad.md` con su módulo dueño (DES-7).

## 7. Notificaciones y campañas

### Tipos

- **Transaccionales**: cambios de estado del pedido. No requieren consentimiento promocional; sí el permiso del sistema.
- **Promocionales**: campañas. Requieren el permiso del sistema y el consentimiento promocional vigente (CLI-9).

### Textos de consentimiento (v1)

La parte legal la revisa Jesús. Cada texto tiene una versión que se guarda con el consentimiento.

Después del primer pedido, antes del diálogo del sistema (CLI-11), `textVersion: "orders-v1"`:

> **¿Te avisamos de tu pedido?**
> Te contamos cuando salga y cuando esté por llegar.
> [Activar avisos] [Ahora no]

En la siguiente apertura de la app, o desde Cuenta › Notificaciones, `textVersion: "promo-v1"`:

> **¿Quieres recibir ofertas?**
> Te enviaremos descuentos y promociones de los negocios de Tindivo. Puedes desactivarlas cuando quieras en Cuenta › Notificaciones.
> [Sí, quiero ofertas] [Ahora no]

### Envío de una campaña

1. Se resuelve el segmento.
2. Se descarta a quien no tiene consentimiento promocional vigente.
3. Se aplican el tope de frecuencia y la ventana horaria (DA-07).
4. Se envía por FCM, que entrega en Android y, a través de APNs, en iOS.
5. Cada usuario queda registrado en `campaign_deliveries`, también los omitidos y por qué.

Antes de programar, «Probar en mi dispositivo» (`test-send`).

### Atribución

- El *deep link* de la campaña lleva `campaignId`. La app lo guarda con el carrito y lo envía al crear el pedido.
- Ventana: 24 h desde la apertura del push (valor inicial).
- La apertura se registra con la ruta de aperturas (§5).

## 8. Requisitos de tienda

### Apple

- [ ] Borrado de cuenta que se inicia desde la app (guía 5.1.1(v)), fácil de encontrar.
- [ ] Push promocional solo con consentimiento explícito y baja desde la app (guía 4.5.4).
- [ ] Compilado con Xcode 26 y SDK de iOS 26 (exigido desde el 28-04-2026).
- [ ] Datos de privacidad en App Store Connect y política de privacidad publicada (detalle a revisar en App Store Connect al publicar).
- [ ] Si algún día se añade inicio de sesión con Google o Facebook, revisar la guía 4.8 (sin verificar).

### Google Play

- [ ] Borrado de cuenta en la app y además por un enlace web declarado en el formulario de seguridad de datos; desactivar o congelar la cuenta no vale como borrado.
- [ ] `targetSdk` 36 (exigido desde el 31-08-2026 para apps nuevas y actualizaciones).
- [ ] Permiso `POST_NOTIFICATIONS` en Android 13 o superior.
- [ ] Formulario de seguridad de datos completo.

### Ambas

- [ ] Identificador de la app (bundle ID y `applicationId`) decidido antes de la primera subida (DA-12): no se puede cambiar después.

## 9. Fases y criterios de aceptación

### F0 · Cimientos (bloquea todo lo demás)

- DA-01, DA-02, DA-08, DA-11 y DA-12 decididas. Las versiones mínimas de sistema son las de D-47.
- Estándares v2.2 aprobados y resumidos en `AGENTS.md`.
- CI del contrato: `oasdiff`, Spectral y `scripts/sync-openapi.sh --check`.
- `packages/backend` creado con `defineHandler` (TS-17), con el `GET /api/v1/config` existente migrado a él sin cambiar su contrato (`Docs/decisiones/NNNN-backend-y-api.md`).
- Cabeceras de CLI-3 registradas por la API.
- Proyectos `apps/customer-ios/` y `apps/customer-android/` creados con la estructura de SW-2 y KT-2, con su `AGENTS.md` local, lint y un test que pasa en CI (iOS en runner macOS o en la Mac, registrado).

**Aceptación**: un PR de prueba que rompe el contrato falla en CI; ambas apps compilan y muestran la pantalla de actualización cuando la API responde `426 client_upgrade_required`.

### F1 · Backend de la app

- Rutas de cliente de §5 con tests de integración, de acceso ajeno (API-7) e idempotencia con concurrencia (API-6, TST-2).
- Tablas de §6 con pgTAP (DB-6), RLS (DB-2) y permisos (DB-3, DB-4).
- Borrado de cuenta y su página web.
- Límites de uso configurados (API-10).

**Aceptación**: la suite pasa en CI; borrar la cuenta deja al cliente sin datos personales y los cargos intactos (test); la misma `Idempotency-Key` enviada dos veces a la vez crea un solo pedido.

### F2 · Apps (iOS y Android en paralelo)

- Flujos de §2 y §4 en cada plataforma, con TST-6.
- CLI-1 a CLI-14 cumplidas con su verificación.

**Aceptación**: el flujo crítico pasa en ambas plataformas contra una API simulada; los fixtures de compatibilidad futura decodifican; cerrar la app al confirmar no duplica el pedido.

### F3 · Campañas (admin web)

- Crear, segmentar, programar, probar, enviar y cancelar.
- Tope de frecuencia y ventana horaria.
- Estadísticas por campaña.

**Aceptación**: una campaña de prueba a un segmento con usuarios sin consentimiento solo llega a quienes consintieron, y las omisiones quedan registradas; un pedido hecho desde el push queda atribuido a la campaña.

### F4 · Publicación

- TestFlight y pista interna con un grupo pequeño de clientes reales.
- Lista de §8 completa; OPS-4, OPS-5, OPS-9 y OPS-10 cumplidas.
- Primera publicación según `Docs/operacion/publicar-apps-nativas.md`, con liberación gradual.

**Aceptación**: ambas apps publicadas; los *crashes* y errores se ven en el rastreador; la actualización obligatoria se probó en producción con una versión mínima de prueba.

## 10. Métricas

Salen de la base propia, sin SDK de analítica.

| Métrica | Cómo se calcula |
|---|---|
| Aceptación del permiso de push | Dispositivos activos en 30 días con `push_permission = 'granted'` / dispositivos activos en 30 días, por plataforma |
| Consentimiento promocional | Usuarios de la app con consentimiento promocional vigente / usuarios de la app |
| Pedidos por canal | Pedidos por `client_platform` |
| Recompra a 30 días | Clientes con 2 o más pedidos en 30 días / clientes con al menos 1, app frente a PWA |
| Embudo de campaña | Enviados → abiertos → pedidos atribuidos → ingresos |

Se revisan cada semana durante el primer mes. La decisión de hacer nativa la app de negocios se apoya en estas cifras.

## 11. Riesgos

| Riesgo | Respuesta |
|---|---|
| Pocos aceptan el permiso de push y las ofertas no llegan | Pedirlo en contexto (CLI-11) y mostrar las ofertas también en inicio |
| Rechazo de la tienda | Lista de §8 antes de cada envío |
| Abuso del OTP (costo de SMS) | API-10 o los límites de Supabase Auth |
| iOS y Android se comportan distinto | Clientes generados, los mismos fixtures y la misma TST-6 |
| Un agente en la nube no puede compilar iOS | Las tareas de iOS se hacen en la Mac |

## 12. Decisiones abiertas

En `Docs/trabajo/decisiones-abiertas.md`: DA-01, DA-02, DA-04, DA-06, DA-07, DA-08, DA-11 y DA-12, cada una con la fase que bloquea. Ya decididas, y no se reabren: qué se conserva al borrar una cuenta (D-44) y las versiones mínimas de sistema (D-47).
