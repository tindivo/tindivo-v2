# Decisiones abiertas

Cola única de decisiones pendientes (`Docs/README.md` §4). Jesús la revisa cada semana. Está exenta del borrado por inactividad de `Docs/trabajo/`. Cuando una entrada se decide, pasa al ADR o al canon que corresponda y se borra de aquí.

Formato de cada entrada: fecha · qué bloquea · quién la detectó · contexto · alternativas · recomendación. Los números no se reutilizan.

Cada entrada se contrastó el 2026-10-12 con `DECISIONS.md`, `Docs/decisiones/`, `Docs/planes/movil/decisiones.md` y `Docs/planes/movil/contrato-rest.md`. Lo que ya estaba decidido no entra y se cita su decisión; lo que ya estaba abierto en `Docs/planes/movil/decisiones.md` remite a su D-xx:

| Entrada | Por qué no está aquí |
|---|---|
| DA-01 · Camino del OTP | El OTP del teléfono ya va por la API (`customer/phone/send-code` y `customer/phone/verify`) y la sesión es del SDK de Supabase Auth (`contrato-rest.md` §1). Si el teléfono pasa a ser una identidad de acceso, es la D-22, abierta en `Docs/planes/movil/decisiones.md` §3 |
| DA-04 · Métodos de pago en la app nativa | La app usa el mismo contrato REST que la PWA (D-21, D-38) y las reglas de pago de `DECISIONS.md` (§7). Qué se ofrece lo calcula el servidor (`customer/payment-options`) |
| DA-05 · Qué se conserva al borrar una cuenta | Decidido: D-44 |
| DA-07 · Tope y ventana de las promociones | Abierta en la D-24 (`Docs/planes/movil/decisiones.md` §3: consentimiento, horas de silencio, frecuencia máxima). Valor inicial propuesto por el paquete: como mucho 2 promociones por usuario por semana, entre las 10:00 y las 21:00 (hora de Lima); se decide dentro de la D-24, antes de enviar la primera promoción |
| DA-09 · Versiones mínimas de sistema | Decidido: D-47 (Android 8 e iOS 17) |
| DA-13 · Fuente del criterio de DES-5 | Lo resuelve el PR de los estándares |

Los números DA-01 a DA-14 se conservan aunque falten entradas.

---

### DA-02 · Dominio de la API

- 2026-10-12 · Bloquea: antes de crear los proyectos nativos · Detectó: Claude
- **Contexto**: hoy la API se sirve en `apiv2.tindivo.com` (medido el 2026-08-28 en `Docs/negocio/apps.md`; las web viven en `tindivo.com` y sus subdominios). `apps/api` es el desplegable que expone `packages/backend`. Las apps instaladas llamarán a su dominio durante años.
- **Alternativas**: (a) un dominio estable y neutro para la API, por ejemplo `api.tindivo.com`, desde el que se pueda mover el servidor detrás de un proxy; (b) quedarse con `apiv2.tindivo.com`, cuyo nombre arrastra la versión.
- **Recomendación**: (a). Un nombre que no cambia permite mover las rutas a otro servidor sin publicar versiones nuevas de las apps.

### DA-03 · Enrutador de la API

- 2026-10-12 · No bloquea · Detectó: Claude
- **Contexto**: los handlers son Fetch API y declaran su método y su ruta (TS-17), así que el enrutador solo afecta a `apps/api`.
- **Alternativas**: (a) rutas por carpetas de Next.js con `toNextRoute`; (b) Hono, montado en Next.js o en un servidor propio, con el enrutador generado desde los handlers.
- **Recomendación**: (a) mientras la API siga en Next.js; (b) al salir de Next.js.

### DA-06 · Política de versiones soportadas

- 2026-10-12 · Bloquea: antes de publicar · Detectó: Claude
- **Contexto**: la D-41 ya fija que los mínimos son independientes para Negocios Android, Customer Android y Customer iOS; falta cuánto tiempo se soporta una versión publicada.
- **Recomendación**: soportar toda versión publicada en los últimos 90 días; subir la mínima con el tráfico por versión (CLI-3, CLI-15).

### DA-08 · Herramienta de *crashes* y errores de las apps

- 2026-10-12 · Bloquea: antes de crear los proyectos nativos · Detectó: Claude
- **Contexto**: el repo no tiene hoy ningún rastreador de errores (no aparece Sentry ni Crashlytics en el código ni en el canon).
- **Alternativas**: (a) Firebase Crashlytics, en el mismo proyecto de Firebase que el push; (b) Sentry, que también cubre web y API.
- **Recomendación**: (a) para las apps (sin coste según Firebase; verificar las condiciones vigentes). La API y las web siguen sin rastreador hasta que se decida.

### DA-10 · Identidad propia por agente en GitHub

- 2026-10-12 · No bloquea · Detectó: Claude
- **Contexto**: GitHub no deja que el autor apruebe su propio PR, pero si todos los agentes firman con la misma cuenta, GitHub ve un solo autor.
- **Alternativas**: (a) una identidad por agente y protección de rama que exija la aprobación de otra; (b) mantener la regla como instrucción.
- **Recomendación**: (a) cuando sea viable. Mientras tanto, «nadie revisa su propio trabajo» es instrucción, no mecanismo (`Docs/README.md` §7.1).

### DA-11 · Dominio para *deep links* y la página de borrado

- 2026-10-12 · Bloquea: antes de crear los proyectos nativos · Detectó: Claude
- **Contexto**: Universal Links y App Links exigen un dominio propio con HTTPS que sirva `apple-app-site-association` y `assetlinks.json`. Google exige además un enlace web para borrar la cuenta. El dominio de la marca ya es `tindivo.com`; falta decidir en qué subdominio se sirven esos archivos y la página de borrado.
- **Decidir**: el subdominio, y el de la API si DA-02 es (a).

### DA-12 · Identificadores de las apps

- 2026-10-12 · Bloquea: antes de crear los proyectos nativos · Irreversible · Detectó: Claude
- **Contexto**: el bundle ID de iOS y el `applicationId` de Android no se pueden cambiar después de publicar. **Android ya está decidido** (Jesús, 2026-10-22: `com.tindivo.customer`, con `.dev` en el sabor de staging; `Docs/arquitectura/estandares/kotlin.md`); queda el bundle ID de iOS.
- **Recomendación**: el dominio de la marca invertido + `.customer`: `com.tindivo.customer`, porque el dominio es `tindivo.com`.

### DA-14 · Procedimiento de incidentes (OPS-9)

- 2026-10-12 · Bloquea: antes de publicar · Detectó: Claude
- **Contexto**: falta `Docs/operacion/incidentes.md`. Lo técnico lo redacta Claude; los plazos y las notificaciones legales los fija Jesús.

### DA-15 · JWT local (JWKS) frente a `getUser()` en la API

- 2026-10-12 · No bloquea la construcción de rutas; bloquea la optimización de latencia · Detectó: Claude, a partir de `contrato-rest.md` (paso 4)
- **Contexto**: hoy `requireRole` llama a `auth.getUser(token)` (una ida a Supabase Auth) y después consulta `user_roles`, antes de la consulta que se quería (`Docs/negocio/apps.md`, medición de latencia). API-12 del paquete de estándares da por obligatoria la verificación de autenticación y el contrato dice que esta optimización se mide antes de decidirse: no está probado que `getUser` detecte al instante una sesión revocada (`contrato-rest.md` §5).
- **Medir antes**: TTL efectivo del token, renovación, cierre de sesión, revocación y bloqueo, con una configuración igual a la de producción.
- **Alternativas**: (a) verificar el JWT en local con las claves públicas (JWKS) y comprobar rol y propiedad dentro de la operación; (b) mantener `getUser()`; (c) mixto: local por defecto y `getUser()` en las acciones sensibles (por ejemplo, las de Negocios).
- **Recomendación**: no decidir hasta tener las mediciones. Con ellas, (c) si la revocación instantánea importa en las acciones sensibles.

### DA-16 · Mochila de 4: cómo sale a producción

- 2026-10-19 · Bloquea: las fases 1 y 2 de `Docs/planes/mochila-de-cuatro/plan.md` · Detectó: Claude
- **Contexto**: el motorizado tiene que poder llevar 4 pedidos y no 3; va como arreglo urgente desde `main`, sin migración. Jesús lo retoma cuando acabe el servicio en curso.
- **Decidir**: (1) si Vercel despliega `motorizados` a producción desde `main`; (2) traspaso por silencio: (a) `UPDATE` de `assignment_rules.maxOccupancySlotsPerDriver` en producción, revisado por Codex, o (b) esperar al lote 0248–0266; (3) si el tope cuenta espacios de mochila o pedidos.
- **Recomendación**: (2a), para que el traspaso por silencio no se quede en 3; y (3) espacios, que es lo que la app ya cuenta.

### DA-19 · Foto del motorizado en el seguimiento

- 2026-11-19 · Bloquea: el avatar de `seguimiento` (CUS-TRK-021) · Detectó: Claude
- **Contexto**: la maqueta dibuja un avatar con foto o iniciales; la foto es un dato personal de un tercero (Ley 29733, a verificar). Jesús aprobó el resto de decisiones del 2026-11-19 pero no esta.
- **Alternativas**: (a) solo iniciales; (b) foto si existe, está vigente y el motorizado dio su consentimiento; si no, iniciales.
- **Recomendación**: (b) con política de datos, o (a) si al lanzar no hay consentimiento registrado. Mientras tanto la app muestra iniciales.

### DA-20 · «No se presentó»: efecto de la falta y dinero prepagado

- 2026-11-19 · Bloquea: CUS-TRK-022 · Detectó: Claude · **Dinero** (invariante 9): requiere la revisión explícita de Jesús y de Codex.
- **Contexto**: `Docs/negocio/antifraude.md` dice que el motorizado espera 5 minutos y reporta, con falta al instante; la decisión del 2026-11-17 dice que el motorizado se va y la falta nace de noche, con confirmación de Jesús en el admin. Sin decidir: si la falta cuenta antes de confirmarse, qué pasa con el dinero de un pedido prepagado que termina en `no_show` y si el admin tiene hoy la pantalla de confirmar o anular. Todo ajuste de dinero se escribe solo en `business_charges`.
- **Alternativas**: (a) la falta nace «en revisión» y sin efecto hasta que Jesús la confirme; (b) cuenta al instante y se anula si Jesús lo decide.
- **Recomendación**: (a), y actualizar `antifraude.md` con la aprobación de Jesús. El destino del dinero prepagado, sin recomendación hasta tener la política.

### DA-25 · Espera del negocio: ¿el plazo completo o lo que queda?

- 2026-11-19 · Bloquea: CA-TRK-06 y la cuenta atrás de la espera (CUS-TRK-019, CUS-TRK-005) · Detectó: Claude
- **Contexto**: el criterio aprobado dice «Responde en hasta [plazo de aceptación] min», con el plazo completo; el requisito de la cuenta atrás dice que mientras corra un plazo se muestra lo que queda. Una sola línea no puede ser las dos cosas. Hoy Android muestra, aparte, la cuenta atrás en `m:ss` y sin texto propio, igual que la web.
- **Alternativas**: (a) dos líneas: «Responde en hasta [plazo] min» fija y la cuenta atrás en `m:ss` (es lo que hace hoy Android; Jesús decide si se le agrega un texto); (b) una línea que baja: «Responde en hasta [lo que queda] min»; (c) solo el plazo completo, sin cuenta atrás visible hasta el último tercio.
- **Recomendación**: (a). Conserva lo aprobado y da la cuenta atrás; la cuenta atrás va sin texto hasta que Jesús apruebe uno.
### DA-18 · Soporte de WhatsApp y responsabilidad por daños en Entregas

- 2026-11-19 · Bloquea: CUS-ENT-020 · Detectó: Claude
- **Contexto**: la decisión de Jesús del 2026-11-16 dice que los daños y pérdidas se atienden por el soporte de WhatsApp y que Tindivo responde por la conducta de sus motorizados; la redacción y el tope económico (S/ 200 en el borrador de 2026-09) esperan la revisión legal. Android no tiene ese texto.
- **Alternativas**: (a) esperar a la revisión legal; (b) publicar un aviso mínimo sin tope.
- **Recomendación**: (a). Jesús aprobó el 2026-11-19 dejarla abierta.
### DA-17 · Compartir plato y distintivo «Para compartir» (app cliente)

- 2026-11-19 · No bloquea el lanzamiento · Detectó: Claude (PR #198, capacidad `catalogo`)
- **Contexto**: el canvas dibuja un botón de compartir en la ficha del plato y un distintivo «Para compartir» en las filas de la carta. Sin enlaces compartidos (CUS-CAT-022 diferido) no hay destino, y nadie definió quién asigna el distintivo.
- **Decidir**: (1) a dónde lleva «compartir»; (2) si el distintivo lo marca el negocio o se calcula.
- **Alternativas**: (a) quitarlos hasta tener enlaces; (b) el negocio marca el distintivo en el panel; (c) calcularlo por reglas.
- **Recomendación**: (a). Jesús no respondió a esta decisión el 2026-11-19: queda abierta y no entra en la app.

### DA-24 · Código HTTP del bloqueo «un pedido activo por negocio» (CUS-CAT-018) · RESUELTA

- 2026-11-19 · No bloquea el lanzamiento · Detectó: la batería E2E (#209); lo registra Claude (PR #208)
- **Contexto**: la fuente decía 409 `active_order_block`. En el código, `active_order_block:<id>:<shortId>:<estado>` es el `details` interno de la RPC `create_customer_order`; la API lo traduce a 422 `validation_error` con el texto «Ya tienes un pedido activo…» (`apps/api/app/api/v1/customer/orders/route.ts`). `contrato-rest.md` y el OpenAPI no definen este caso. El cliente web arma su aviso con su propia lista de pedidos activos, sin leer el 422 ni su texto por regex; Android aún no lo maneja.
- **Alternativas**: (a) dejar 422 y documentarlo en el contrato, con un campo `blocking_order` (id y estado) en el problema; (b) pasar a 409 con un código estable, aditivo y sin romper al cliente web (que muestra el texto).
- **Recomendación**: (a), porque no cambia el comportamiento que ya sirve y evita tocar el contrato v1 (API-3).
- **RESUELTA** · 2026-11-21 · por la junta con la delegación de Jesús: se queda el **422 `validation_error`** que la API responde hoy, con su mensaje legible (`customer/orders/route.ts:420-424`). El contrato REST y la app instalada mandan (API-3); cambiar el código no le da nada al cliente. Riesgo: la app no distingue este bloqueo de otro 422 sin leer el mensaje; si hace falta, se añade un campo aditivo en el cuerpo, sin cambiar el código HTTP. Se corrige CUS-CAT-018 en `Docs/producto/catalogo/capacidad.md`.
