# 04 · Seguridad y cumplimiento de tiendas

> **Alcance:** revisión de código y de configuración + advisors de Supabase + **una** llamada sin
> efectos. **No es una prueba de penetración.** No se incluyen instrucciones de explotación: solo
> la clase de problema, la evidencia y el arreglo.
> Etiquetas y escalas: [`00-veredicto-y-metodo.md`](00-veredicto-y-metodo.md).

## Balance: sin críticos explotables hoy

**Lo que se revisó y está bien** `[ADVISOR]` `[DB-PROD]` `[CÓDIGO]`:

- **RLS activa en las 45 tablas** de `public`; las tres sin políticas (`customer_otp_attempts`,
  `idempotency_keys`, `outbox_events`) son *deny-all* a propósito (migración 0201).
- **88 de 88 funciones `SECURITY DEFINER` con `search_path` fijado.** Los advisors no reportan
  `function_search_path_mutable`, `security_definer_view`, `auth_rls_initplan` ni ningún ERROR.
- **La clave *service-role* no aparece en ningún frontend** (`git grep` en `apps/customer`,
  `negocios`, `motorizados`, `admin`, `packages/ui`, `packages/api-client`: solo dos comentarios que
  la mencionan). Solo hay plantillas (`.env.example`, `.env.kimi.example`) en git; `.gitignore`
  cubre `.env`, `.env.local` y `.env.*.local`. Los JWT que
  aparecen en el repo están en tests de integración y son las **claves demo públicas** de Supabase
  local (`iss: supabase-demo`).
- **Storage:** los comprobantes viven en un bucket **privado**, con RLS por carpeta de usuario
  (`storage.foldername(name)[1] = auth.uid()`); los buckets públicos (logos, QR, menú) tienen
  límite de 3 MB y solo `webp/jpeg/png`.
- **Datos personales de la nota al motorizado** («el portón azul…») no salen por la función
  pública de tracking, sino por lectura bajo RLS (`use-tracking.ts:14-25`); y el texto de las
  reseñas está protegido por `GRANT` por columna (0217).
- **El teléfono que cuenta para el antifraude sale del perfil verificado, nunca del pedido**
  (`customer_contraentrega_decision`).
- **Historial de endurecimiento activo:** 0153/0167/0197 (`search_path`), 0175/0188/0196/0204
  (funciones abiertas a Internet, incluida «anyone could close the restaurant»), 0104/0201
  (RLS en tablas internas).

Ese último punto es también la advertencia: **la misma clase de fallo («función expuesta que no
debía») se ha corregido cuatro veces**, lo que sugiere que falta una comprobación automática
(véase `SEC-02`).

---

## SEC-01 · La Edge Function `send-push` acepta la *anon key* pública

| | |
|---|---|
| **Severidad** | Medio (**Alto** en cuanto exista marketing push) |
| **Bloquea el móvil** | Parcial |
| **Esfuerzo** | S |

**En una frase.** `verify_jwt: true` solo exige *algún* JWT válido del proyecto, y la clave anónima
(pública, incrustada en cada PWA) lo es; la función no comprueba quién llama.

**Evidencia.**
- `[DB-PROD]` `list_edge_functions`: `send-push`, versión 12, `verify_jwt: true`.
- `[DB-PROD]` `app_settings.push_dispatch` guarda la URL de la función **y la *anon key***; el
  disparador `dispatch_event` llama con `Authorization: Bearer <anon key>`. Es decir: **la propia
  base usa la clave pública** para invocarla.
- `[PRUEBA]` Una llamada **sin efectos** (evento inexistente, ningún pedido asociado) con esa clave
  devolvió **HTTP 200** (`{"ok":true,"recipients":0,…}`); **sin cabecera** de autorización devolvió
  **401**. No se envió ninguna notificación.
- `[CÓDIGO]` `send-push/index.ts:1046-1127`: el manejador toma `event_type`, `aggregate_id` y
  `payload` del cuerpo y arma y envía; **no verifica el rol del llamante**.

**Impacto.** Quien tenga la clave pública y un UUID de pedido válido (los ve el cliente dueño, el
negocio y los motorizados) puede provocar avisos falsos con `requireInteraction` y vibración:
p. ej. «❌ CANCELADO · no vayas al local» a un motorizado, o `OrderOverdue` a **todos** los
motorizados activos. No expone datos (los avisos van a los destinatarios legítimos), pero es
**suplantación y molestia**, y con marketing sería un vector de spam.

**Dirección.** Autenticar el origen: un **secreto compartido** guardado en Vault que la función
compare en cada petición (y que use `dispatch_event`), o comprobar que el JWT tenga
`role = service_role`. Y quitar la *anon key* de `app_settings`.

---

## SEC-02 · 31 funciones `SECURITY DEFINER` ejecutables por `anon` o `authenticated`

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S |

**Evidencia.** `[ADVISOR]` (8 `anon`, 23 `authenticated`) · `[DB-PROD]` (13 ejecutables por `anon`
de cualquier tipo, 30 por `authenticated`):

- **`anon` (8):** `current_service_date`, `delivery_band_for_point`, `effective_max_change`,
  `get_order_intake_status`, **`get_tracking`**, `is_published_business`,
  `is_within_order_intake_window`, `point_in_coverage_polygon`.
- **`authenticated` (23):** las anteriores más `cart_item_free_delivery`, `create_appeal_report`,
  `create_order_review`, `current_business_id`, `current_driver_id`, `current_user_has_role`,
  `current_customer_*` (3), `driver_businesses`, `get_pending_review`, `queue_lead_minutes`, y las
  tres administrativas **`mark_appeal_in_review`, `resolve_appeal`, `register_appeal_refund`**.

**Lo revisado por dentro.** Las tres administrativas **sí validan** `auth.uid()` y
`current_user_has_role('admin')` antes de tocar nada (definiciones leídas): no son explotables por
un cliente. Pero:

- **`register_appeal_refund` recibe un `p_admin_user_id`** que se usa para **atribuir** la acción en
  el registro de auditoría (`v_admin_user_id := p_admin_user_id`, cae a `auth.uid()` si es nulo):
  un admin puede **falsear quién hizo** el reembolso. Riesgo de integridad de auditoría, no de acceso.
- **Coexisten dos convenciones:** RPC que **reciben al actor como parámetro** y solo son seguras
  porque no las ejecuta nadie más que `service_role` (`advance_order`, `cancel_customer_order`,
  `validate_order`…), y RPC que **leen `auth.uid()`** y se llaman con el JWT del usuario
  (`createUserClient`). Cada función nueva tiene que acertar la convención a mano.
- **Historial:** 0175, 0188, 0196 y 0204 corrigieron funciones abiertas «a todo Internet». La causa
  raíz es que **el privilegio por defecto de Supabase deja `EXECUTE` a `anon`/`authenticated` en
  cada `CREATE FUNCTION`** y hay que revocarlo a mano.

**Dirección.** (1) Una **comprobación en CI** (`check:grants`, como `check:auth`) que compare los
`EXECUTE` de `anon`/`authenticated` con una **lista permitida** versionada y falle si aparece uno
nuevo. (2) Quitar `p_admin_user_id` y usar solo `auth.uid()`. (3) Unificar la convención (ver
`ARQ-04`).

---

## SEC-03 · No existe *rate limiting* en ninguna ruta

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | Parcial (hay que tenerlo antes de abrirlo al público) |
| **Esfuerzo** | S-M |

**Evidencia.** `[CÓDIGO]`
- `apps/api/package.json:24-25` declara `@upstash/ratelimit` y `@upstash/redis`, y
  `lib/env.ts` prevé `UPSTASH_REDIS_REST_URL`; **ningún fichero los importa** (`git grep` sin
  resultados en `*.ts`/`*.tsx`). El código de error `rate_limited` (429) está definido y solo lo
  emite el contador de OTP.
- **OTP por SMS** (`customer/phone/send-code/route.ts:22, 84-96`): el tope es **3 por *usuario* en 24
  h**, contado en `customer_otp_attempts`. Como el usuario se crea gratis (Google), **un atacante
  puede crear cuentas y disparar SMS a números ajenos** (coste para Tindivo —Twilio Verify cobra por
  verificación— y acoso al dueño del número). No hay tope por **número de destino**, por **IP** ni por
  **dispositivo**. `verify` no tiene contador propio (delega en el límite de Twilio).
- **Endpoints públicos** sin límite: `/public/businesses*`, `/public/search`, `/public/schedule`,
  `/public/orders/:shortId`, `/public/pilot-access`.
- **`get_tracking` es ejecutable por `anon` directamente en PostgREST**, es decir, **se salta la
  API** (y cualquier límite que se ponga en ella). El `short_id` tiene 8 caracteres de un alfabeto de
  32 símbolos = 2⁴⁰ ≈ 1,1 × 10¹² combinaciones frente a ~716 pedidos existentes: adivinar uno válido
  es poco probable, pero **no hay nada que lo frene** ni lo detecte.

**Por qué importa con nativo.** Una app publicada es más descubrible y automatizable que una PWA.

**Dirección.** (1) Activar Upstash (ya pagado, ya en dependencias) como *middleware* común: por IP
en públicos, por usuario en autenticados, **por número de destino** y por dispositivo en OTP.
(2) Revocar `EXECUTE` de `anon` en `get_tracking` y servirlo solo por la API. (3) Para nativo,
**App Attest (iOS) y Play Integrity (Android)** como señal de que la petición viene de la app
legítima. (4) Alertar si el gasto de SMS sube.

---

## SEC-04 · El seguimiento público por `short_id` revela más de lo necesario

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S |

**Evidencia.** `[DB-PROD]` `get_tracking` (definición leída). Quien tiene el `short_id` (el enlace se
comparte por WhatsApp a propósito) obtiene: nombre y **apellidos del motorizado** (`driverName`),
**teléfono del motorizado** una vez llegado (`driverPhone`), importes, ítems, método de pago,
`changeToGive`, `paysWith`, **la ruta del comprobante** (`proofUrl`) y el estado. **No** devuelve el
teléfono, la dirección ni el nombre del cliente (bien).

**Dirección.** Para el dueño, un endpoint **autenticado** por `id` (`GET /me/orders/:id`); la vista
pública por enlace con **menos campos** (sin apellido, sin teléfono, sin ruta de comprobante) y con
un token de seguimiento **más largo o firmado** si se quiere endurecer.

---

## SEC-05 · Los comprobantes de pago son modificables por su autor y sin límites de bucket

| | |
|---|---|
| **Severidad** | Bajo-Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S |

**Evidencia.** `[DB-PROD]` políticas de `storage.objects`: `storage proofs update` permite **UPDATE**
del propio objeto en `payment-proofs`/`receipts`; los buckets `payment-proofs` y `receipts` **no
tienen `file_size_limit` ni `allowed_mime_types`** (los tres públicos sí). `[CÓDIGO]`
`customer/orders/[id]/prepay-proof/route.ts:27-30` solo comprueba que la ruta empiece por
`<user_id>/`, no que el objeto exista ni sea una imagen.

**Impacto.** Un cliente podría **reemplazar la captura después de que el negocio la validó** (la
evidencia deja de ser evidencia) o subir ficheros grandes o de cualquier tipo a su carpeta.

**Dirección.** El cliente **ya** sube a una ruta única por intento
(`<user>/<order>/attempt-<n>-<ts>.<ext>`, `prepay-proof-section.tsx:184`), así que el arreglo es de
servidor: **sin UPDATE ni DELETE** para el autor sobre lo ya registrado, límite de tamaño y tipos en
el bucket (hoy solo el navegador comprime y valida), y que la ruta registrada por
`prepay-proof` **exista y sea una imagen** antes de aceptarla.

---

## SEC-06 · La impersonación de administrador no deja rastro

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S |

**Evidencia.** `[CÓDIGO]` `POST /admin/impersonate/:userId` (`apps/api/.../admin/impersonate/[userId]/route.ts:19-51`)
genera un *magic link* de un solo uso para **cualquier usuario** (por su correo) y lo devuelve. **No
escribe nada** en `order_event_log` ni en ninguna tabla de auditoría, no exige motivo ni MFA, y no
limita el rol destino (un admin puede entrar como otro admin).

**Dirección.** Registro inmutable (quién, a quién, cuándo, motivo), motivo obligatorio, prohibir
impersonar admins, caducidad corta, y **MFA obligatorio para el rol admin** (Supabase lo soporta).

---

## SEC-07 · Autenticación por contraseña sin protección de contraseñas filtradas

| | |
|---|---|
| **Severidad** | Bajo |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S |

**Evidencia.** `[ADVISOR]` `auth_leaked_password_protection`: **deshabilitada**. `[DB-PROD]` 22 de
86 cuentas usan correo y contraseña (sin verificación previa: DECISIONS §14). Es una función de plan
de pago en Supabase (verificar el plan).

**Dirección.** Activarla, o **retirar correo+contraseña** en las apps nativas a favor de Google, Sign
in with Apple y OTP (menos superficie y menos fricción); dejar la contraseña solo donde ya exista.

---

## SEC-08 · La configuración de Auth/Realtime/API no está versionada

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | Parcial |
| **Esfuerzo** | S |

**Evidencia.** `[CÓDIGO]` `supabase/config.toml` solo contiene `[db]` y `[db.migrations]`: los
proveedores de Auth (Google), URLs de redirección, caducidad de JWT, plantillas de correo,
límites de Auth y de Realtime **viven solo en el panel**. No son revisables, ni reproducibles en
un entorno nuevo, ni comparables entre local y remoto.

**Por qué importa con nativo.** Habrá que añadir esquemas de redirección (`tindivo://…`), *universal
links*, la clave de **Sign in with Apple**, la identidad de Google para iOS/Android y posiblemente un
*Custom Access Token Hook*. Sin configuración como código, cada cambio es una deriva silenciosa.

**Dirección.** Llevar Auth/Realtime/Storage a `config.toml` (o Terraform/`supabase config push`) y
documentar en `04-decisiones-abiertas.md` quién es dueño del panel.

---

## SEC-09 · No existe borrado de cuenta (requisito de App Store y Google Play)

| | |
|---|---|
| **Severidad** | **Alto** |
| **Bloquea el móvil** | **Sí** (rechazo de la revisión) |
| **Esfuerzo** | M |

**Evidencia.** `[CÓDIGO]` `git grep` de «eliminar/borrar cuenta», `deleteAccount`, `account deletion`
**solo devuelve** `auth.admin.deleteUser` en dos rutas de **alta** de admin (rollback de creación de
negocio/motorizado) y en tests. **No hay ninguna pantalla, endpoint ni RPC** para que un cliente
borre su cuenta ni sus datos.

**Por qué bloquea.**
- **App Store, guía 5.1.1(v):** toda app que permita crear cuenta **debe permitir iniciar el
  borrado de la cuenta desde la propia app**.
- **Google Play:** las apps con creación de cuenta deben ofrecer borrado **en la app y desde un
  enlace web**, y declararlo en el formulario de seguridad de datos.

**Además, las decisiones de negocio ya escritas chocan con un borrado ingenuo:** el antifraude
ancla **strikes al teléfono y a la dirección** (`DECISIONS.md §8`); `orders` guarda `customer_phone`,
`delivery_address` y `customer_notes`; `delivered` es terminal y hay libro contable
(`business_charges`, `cash_settlements`). Borrar la fila de `auth.users` en cascada podría **destruir
historial financiero** o **liberar un número con strikes**.

**Dirección.** Diseñar el borrado como **anonimización con retención mínima**: eliminar credenciales y
PII de perfil/direcciones/dispositivos/reseñas; en `orders` anonimizar nombre/teléfono/dirección
manteniendo importes y estados; **conservar el vínculo antifraude solo como hash del teléfono** con
plazo declarado en la política de privacidad; endpoint `DELETE /me` (con reautenticación) + página
web pública de solicitud (requisito de Play) + registro. Requiere **decisión de negocio y revisión
legal** (Ley 29733) antes de escribirlo.

---

## SEC-10 · Otros puntos menores

| Punto | Evidencia | Sev. | Dirección |
|---|---|---|---|
| **CORS es solo para navegadores** | `lib/http/cors.ts:38-55`: sin `Origin` → `isAllowed = true` y `Access-Control-Allow-Origin: *`. Para un cliente nativo no aplica (no envía `Origin`), pero **no protege nada** frente a él. | Bajo | No confundir CORS con autorización; la protección real es JWT + RLS + límites. |
| **CORS aplicado en tres capas** | `proxy.ts`, cada ruta (`corsHeaders`, 82 de 85) y `handleError`; el comentario de `next.config.ts:81` dice «71 de las 72». | Bajo | Una sola capa (`proxy.ts`). |
| **`credentials: 'include'` con auth por Bearer** | `packages/api-client/src/index.ts:150,182`: envía cookies cross-origin aunque la auth es por token. | Bajo | Quitarlo; reduce superficie y problemas de CORS. |
| **`anonKey` legible en `app_settings`** | Cualquier autenticado puede leerla (`as_public_read`). Es una clave pública, así que no filtra nada, pero **no debe ser el secreto del disparador** (ver `SEC-01`). | Bajo | Mover a Vault. |
| **Estado del pedido mutado fuera de la RPC** | `customer/orders/[id]/prepay-proof/route.ts:45-55` hace `UPDATE orders SET status='validando'…` desde la ruta, sin transacción con el evento ni `FOR UPDATE` (comprobar-y-actualizar con condición de carrera). `CLAUDE.md` lo documenta como el «único `.update()` directo». | Bajo-Medio | Pasarlo a una RPC (`submit_payment_proof`) con la transición dentro de `advance_order`. |
| **Antifraude confía en datos del cliente** | `CreateOrderRequestSchema.gpsValidation.{distanceToCenterKm, method}` los calcula el dispositivo. En nativo hay señales mejores (ver `NAT-FRD-*`). | Bajo | Recalcular la distancia en servidor; aceptar `mock_location` como señal. |

## Resumen de este documento

| ID | Hallazgo | Sev. | Bloquea | Esf. |
|---|---|---|---|---|
| SEC-01 | `send-push` acepta la *anon key* pública | Medio (Alto con marketing) | Parcial | S |
| SEC-02 | 31 funciones `SECURITY DEFINER` ejecutables; actor-parametrizable; sin chequeo en CI | Medio | No | S |
| SEC-03 | Sin *rate limiting*; SMS/OTP explotable por coste | **Alto** | Parcial | S-M |
| SEC-04 | Tracking público expone apellido y teléfono del motorizado | Medio | No | S |
| SEC-05 | Comprobantes mutables por su autor; bucket sin límites | Bajo-Medio | No | S |
| SEC-06 | Impersonación de admin sin auditoría ni MFA | Medio | No | S |
| SEC-07 | Sin protección de contraseñas filtradas | Bajo | No | S |
| SEC-08 | Config de Auth/Realtime no versionada | Medio | Parcial | S |
| SEC-09 | **Sin borrado de cuenta** | **Alto** | **Sí** | M |
| SEC-10 | Menores (CORS, `credentials`, `anonKey`, `prepay-proof`, GPS) | Bajo | No | S |
