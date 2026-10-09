# Plan de migraciones · conclusión común Claude + Codex

> 2026-10-08/09. Dos rondas sobre el repo (`develop`, `99d70a0`), con Codex **leyendo el código por su cuenta** en
> modo solo lectura, y datos de `tindivo-prod` medidos por Claude. Debate en [`debate/`](debate/); hechos en
> [`00-contexto.md`](00-contexto.md). No reabre el contrato REST
> (`../customer_app_migration/debate-rest/conclusion.md`) ni la arquitectura (`../arquitectura/`).

## En cinco líneas

1. **Primero se corrige y estabiliza el paso 0; después se muda el hosting, antes de mudar la base**, sin cambios
   funcionales: mismo código, mismos dominios, mismas claves y la misma base (Supabase). La mudanza no exige reescribir
   nada.
2. **Antes de mudar, una red de seguridad mínima** (humo por URL, monitoreo, inventario y capacidad medida). Después de
   mudar, el desacoplamiento y la preparación nativa, como ya estaba acordado.
3. **Las notificaciones web no dependen del hosting.** Sobreviven a la mudanza si se conservan los dominios (incluido
   `www`), el `sw.js` y la clave VAPID. Para nativo: un módulo de avisos con Web Push para la web, FCM para Android y
   APNs para iOS.
4. **Mudar la base es otro proyecto, posterior y con precondiciones.** Las apps nativas **no dependen** de él: pueden
   avanzar contra el Supabase actual.
5. **Contra «que no funcione como espero»: evidencia repetible**, no promesas: contrato verificado en CI, recorridos
   en staging, humo tras cada cambio, pruebas en dispositivos reales y una vuelta atrás ensayada.

## Tu pregunta: ¿usa Server Components y llamadas directas en el frontend?

| App | ¿Server Components con datos? | ¿Llama directo a la base desde el navegador? | Qué necesita para correr fuera de Vercel |
|---|---|---|---|
| **admin** | No: las 31 páginas son de cliente | Sí, 12 llamadas | Node con `next start` |
| **negocios** | No: las 12 son de cliente | **Sí, 99**, la más acoplada | Node con `next start` |
| **motorizados** | No (7 de 8 son de cliente; `efectivo` no lleva la directiva) | Sí, 8 | Node con `next start` |
| **customer** | **Sí**: home, negocio, Store, OG, sitemap; lee la sesión por *cookies* en el servidor (`app/page.tsx`, `auth/callback`) | Sí, 61 | Servidor Next (cookies, callback OAuth, caché `revalidate`, imágenes, OG) |
| **api** | — (es la API) | — | Node; el PDF necesita un cambio pequeño (ver F1) |

Exportar admin, negocios y motorizados como estáticos **no es inmediato**: tienen 9 rutas dinámicas (`/orders/[id]`,
`/menu/item/[id]`, `/pedido/[id]`…). Queda como ensayo posterior, empezando por admin.

## El plan, por fases

### F0 · Paso 0 (en Vercel, como hoy)

Los defectos de producción ya acordados:

- el comprobante con transición condicionada, y después transaccional;
- la idempotencia aislada por usuario y recuperable;
- los límites e inmutabilidad de los archivos;
- revocar la ejecución de `expire_courier_orders()` a `PUBLIC`, `anon` **y `authenticated`** (la 0238 se la concede a
  los dos roles de cliente: `supabase/migrations/0238_entregas_abre_de_noche_y_avisa_sin_descuentos.sql:237`),
  conservando la del cron; verificar los permisos efectivos, el rechazo desde clientes y que el cron sigue venciendo.

Los criterios completos son los de `../customer_app_migration/debate-rest/conclusion.md` §3 (paso 0); este resumen no
los sustituye. **Estabilizado** significa: una semana de operación sin errores nuevos en esas rutas ni incidentes
relacionados, registrada antes de empezar F2.

### F1 · Preparación del corte (los cambios previos se despliegan por separado, cada uno con su verificación)

| Trabajo | «Hecho» cuando… |
|---|---|
| **Inventario C** (condición de corte) | Un documento con valores **verificados** y su procedencia: variables por app separando las de construcción (`NEXT_PUBLIC_*`, se incrustan al construir) de las de ejecución, sin copiar secretos (solo nombre y dónde están); Upstash; origen canónico (`www`); rutas y *scope* de los `sw.js`; nombres de cookies; caché; dependencias del PDF; versiones (Node de la CI); **Site URL y Redirect URLs de Supabase Auth y el cliente OAuth de Google, leídos en el panel**; funciones registradas en Inngest y su sincronización; dominios y TTL; procedimiento de retorno |
| **Capacidad D** (condición de corte) | Medidos en el ensayo: memoria en reposo, con tráfico representativo (el pico de una noche real: pedidos, tableros de
negocio y motorizado abiertos y Realtime) y con PDF concurrentes; CPU, disco y reinicio tras fallo. El PDF con **límite de concurrencia y de tiempo** antes de dimensionar |
| **Motor del PDF** | Selección explícita del navegador (`apps/api/lib/pdf/browser.ts:49` hoy fuerza `@sparticuz` en producción), con el valor por defecto igual que hoy; un PDF real descargado desde el *build* de producción en el VPS, **comparado con el de Vercel** (páginas, cifras, fuentes y emoji) |
| **Inngest: limpieza** | En un despliegue aparte y previo: retirar **únicamente** la función no registrada `orderPaymentTimeout` y sus *imports* exclusivos. **Se conservan el evento, sus emisores y `OrderPaymentTimeoutData`**, que sigue tipando `sendOrderPaymentTimeout` (`apps/api/lib/inngest/client.ts:81, 86`), porque `orderAcceptanceTimeout` y `orderValidationTimeout` usan el evento en su `cancelOn` (`apps/api/lib/inngest/functions.ts:36, 72`). El registro actual no la incluye (`functions.ts:316`); que **nunca** estuvo registrada sale del historial (`git log -S`, verificado por Claude). Probar aceptación y validación hacia `awaiting_payment`, la cancelación de los temporizadores anteriores y el vencimiento por cron |
| **Red de seguridad mínima** | Suite de humo **nueva** (`e2e/smoke/`), de solo lectura y parametrizada por URL: cada app abre, la home, un negocio, Store, el seguimiento de un pedido de prueba, `/api/v1/health` y GET públicos; **nunca escribe en producción**. Monitoreo de errores y latencia por ruta, con una alerta |
| **Región** | Latencia medida (p50/p95 en operaciones reales, no solo `/health`) desde Perú y desde el VPS hacia la base en Oregón, comparando candidatos |
| **Staging** | Entorno aislado con *build* de producción, base de pruebas (rama de Supabase o proyecto aparte) con el mundo e2e; el recorrido completo (`e2e/viaje-pedido-online.spec.ts`) parametrizado para staging, con guardas contra producción |
| **Ensayo completo** | Las cinco apps en el VPS sin DNS público (fichero `hosts` o subdominios de prueba), contra producción **solo con lecturas**, y un ensayo de la vuelta atrás. **Contra producción se impiden las escrituras y los efectos indirectos:** no se registran suscripciones push (abrir una app con sesión las registra sola: `apps/admin/components/push-manager.tsx:23-27`) ni se sincroniza una segunda app de Inngest de producción. Las pruebas completas de OAuth, renovación de sesión, escrituras y push se hacen **primero en staging** |
| **Condiciones de corte** | Escritas antes de cada corte: umbrales de errores, latencia, memoria y antigüedad del outbox; cuánto tiempo se observa; quién decide; **qué dispara la vuelta atrás**. Verificados: cookies y redirecciones, CORS sin cabeceras duplicadas, caché privada aislada (sin cachear sesiones ni respuestas privadas en el proxy), regeneración de páginas, imágenes y OG, contenido del PDF y actualización del `sw.js` (servido con revalidación). Los *assets* antiguos se mantienen para las pestañas abiertas |

### F2 · La mudanza

- **Empaquetado:** Docker desde el ensayo si Jesús lo va a operar (reproduce Linux, Chromium y fuentes); si no,
  procesos gestionados con instalación, arranque, reinicio y restauración documentados. Delante, Caddy o Nginx con
  HTTPS y cabeceras `X-Forwarded-Proto`/`Host` correctas (`auth/callback` construye la redirección con
  `request.url`).
- **Orden de corte:** **API → admin → customer → negocios → motorizados**:
  - un dominio cada vez;
  - fuera de 18:00-23:00;
  - TTL bajado antes;
  - con verificación entre hitos.

  La API va primero porque concentra el riesgo (secretos, Inngest, PDF, región) mientras los frontends siguen en
  Vercel como control.
- **Tras cada corte:**
  - humo automático;
  - un pedido real de prueba de punta a punta, **identificado como prueba** y con sus efectos contables (cargos,
    liquidación) documentados y anulados;
  - un push de prueba a un dispositivo de cada app;
  - en la API, además, un PDF y un temporizador de Inngest que despierte después del corte.
- **Vuelta atrás:** DNS o proxy de vuelta a Vercel **y la configuración de Inngest**. **Nunca** restaurar una copia
  vieja de la base, porque se perderían los pedidos del corte. Durante la propagación conviven las dos versiones:
  deben ser el mismo commit. Vercel sigue vivo **al menos dos semanas**, y más si no se ha verificado toda la
  operación.
- **No se mezcla con la mudanza:**
  - Hono, el driver SQL, los esquemas por módulo, el squash, Auth o una cola nueva;
  - el *static export*;
  - cambiar `www` por el dominio sin `www`;
  - cambiar las claves VAPID.

### F3 · Desacoplamiento y preparación nativa (lo ya acordado)

El orden 0-7 de `../customer_app_migration/debate-rest/conclusion.md`, con los estándares graduales de
`../arquitectura/05-estandares.md`:

- contrato REST y OpenAPI;
- integración en CI;
- compatibilidad (`/config`, versión mínima) antes del primer build distribuido;
- rutas que faltan y `quote`;
- recorrido temprano en dispositivos reales;
- la PWA del customer se muda al contrato según lo acordado; **Negocios** (la más acoplada, 99 llamadas, y la app nativa
  más urgente) se suma como frente adicional priorizado, sin sustituir ese orden.

**Avisos (módulo `notifications`):**

- **Registro de dispositivos por REST**, con plataforma, app y consentimiento.
- **Adaptadores:** Web Push VAPID para la web (las ~39 suscripciones no se tocan), FCM para Android y APNs para iOS.
  FCM para la web queda como opción futura, que sería cambiar un adaptador.
- **El envío sale de la base:** `dispatch_event` deja de llamar por HTTP (`pg_net`) dentro de la transacción. La
  transacción guarda el evento y el trabajo pendiente, y un consumidor externo los reclama, envía y reintenta. El
  consumidor necesita:
  - reclamación recuperable;
  - deduplicación por evento y dispositivo;
  - caducidad;
  - errores permanentes y cuarentena;
  - métricas.

  El procesador actual de outbox solo cubre dos tipos (`apps/api/lib/outbox/processor.ts:45`).
- **La Edge Function se conserva** hasta que el consumidor demuestre su reemplazo.

### F4 · Mudar la base (posterior y opcional)

**Precondiciones**, todas antes de tocarla:

- las cuatro webs sin acceso directo a las tablas;
- Supabase aislado en adaptadores (datos, identidad, archivos, avisos);
- el envío de push fuera de la base (F3);
- inventario de `auth.uid()` y roles, grants, Storage y URLs firmadas, Realtime y Broadcast, Vault y los 12 crons,
  con una decisión por cada uno (conservar, trasladar o reemplazar);
- un ensayo con conciliación de pedidos, cargos y saldos, y una **restauración ensayada** de datos, archivos y permisos.

**Dos alcances distintos:** mudar **Postgres** y abandonar **Supabase entero**. Mantener Supabase Auth **no** reproduce
`auth.uid()` en otro Postgres: hay que recrear el contexto de identidad y permisos. Y no es «cambiar la cadena de
conexión», porque hoy el acceso es `supabase-js`.

### F5 · Apps nativas

**No esperan a F4.** Se construyen sobre el contrato ya ejercitado por la web, contra el Supabase actual.

## La red de seguridad, completa

| Capa | Qué demuestra | Dónde |
|---|---|---|
| **Contrato** | OpenAPI fiel a la API actual; modelos de Swift y Kotlin que compilan; diff contra `main` con revisión semántica (nulabilidad, dinero, estados desconocidos, errores, autorización, idempotencia). **Por sí solo no garantiza que funcione** | CI |
| **Integración** | Supabase aislado, migraciones reconstruidas desde cero, `pnpm db:seed:e2e` y la suite de la API (hoy la CI no lo hace, `.github/workflows/ci.yml:52`) | CI |
| **Recorridos** | El pedido hasta entregado (`e2e/viaje-pedido-online.spec.ts:131`) más pérdida de respuesta tras el *commit*, renovación de sesión, reconexión, vuelta al primer plano y permisos de push. Hoy los permisos se conceden globalmente (`playwright.config.ts:49`) | Staging |
| **Humo** | Que cada app y la API responden tras un cambio | Producción, solo lectura |
| **Dispositivos reales** | Android e iPhone en segundo plano, cerrada, enlace profundo y vuelta al estado leído por REST: **puerta de entrada al primer build**. Las pruebas completas de avisos (rotación y baja del *token*, cambio de usuario en el mismo aparato) en los builds que incorporan los avisos | Antes de cada build distribuido |
| **Operación** | Errores, latencia, antigüedad del outbox y fallos de push, con umbrales y responsable definidos antes del corte | Producción |

## Lo que decide Jesús

| # | Decisión |
|---|---|
| M-01 | **Destino y presupuesto** del hosting (qué VPS y de qué tamaño, tras medir la capacidad D) |
| M-02 | **Región**, con las mediciones de latencia delante |
| M-03 | **Docker o procesos gestionados**, según cómo quiera operar el servidor |
| M-04 | **Aprobación de cada corte** (fecha y hora fuera del horario de pedidos) |
| E-01 | Los estándares pendientes (`../arquitectura/05-estandares.md`) |
| D-40 | Formatos y límites de los comprobantes (paso 0) |

## Lo que no afirmamos

- Que la mudanza mejore la latencia: depende de la región, y se mide.
- Que estar cerca de Oregón sea lo mejor para usuarios en Perú: también se mide.
- Que el OpenAPI garantice que las apps nativas funcionen: es una condición necesaria, no suficiente.
- Que el retiro de `orderPaymentTimeout` sea inocuo sin probarlo: por eso va con pruebas y en un despliegue aparte.
