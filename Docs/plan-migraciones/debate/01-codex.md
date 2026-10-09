# Apertura de Codex

**Recomiendo mudar primero el hosting conservando Next, los dominios y Supabase.** Preparar el servicio para nativo es un trabajo paralelo y gradual; terminarlo no debe ser requisito para salir de Vercel.

Esta apertura contrasta documentos con código, sin consultar red ni base. Los números de producción —39 suscripciones, región, cron y policies— provienen de `Docs/plan-migraciones/00-contexto.md:44`. Encontré una diferencia: el registro actual de Inngest contiene **siete funciones**, frente a las ocho del contexto (`apps/api/lib/inngest/functions.ts:316`). Hay que reconciliar ese inventario antes del corte.

**1. Mudanza del hosting**

Para el primer ensayo usaría cinco procesos Next sobre Node 24, detrás de Caddy o Nginx con HTTPS, reinicio automático y despliegues identificados por commit. Puede empaquetarse en contenedores después de probarlo. `standalone` sería una opción de empaquetado; hoy las configuraciones no lo declaran.

| App | Necesita fuera de Vercel | Verificación imprescindible |
|---|---|---|
| **api** | Next en Node, secretos, conectividad con Supabase, Twilio, Inngest y Upstash si está configurado. PDF con Chromium compatible. | Auth, autorización, OTP, creación/repetición de pedidos, transiciones, PDF e Inngest. |
| **customer** | Servidor Next: cookies, callback OAuth, renderizado, caché, optimizador de imágenes y OG. | Google login, renovación, home, negocio, Store, 404, sitemap, imágenes y enlaces compartidos. |
| **negocios** | Inicialmente Next; conservar assets, fuente de iconos, manifest y `/sw.js`. | Login, tablero, aceptación, cocina, recojo, comprobantes y push. |
| **motorizados** | Inicialmente Next; manifest, SW y permisos del navegador. | Cola, competencia por pedido, transferencia, GPS, cobro y Entregas. |
| **admin** | Inicialmente Next; variables propias y SW. | Roles, operaciones administrativas, Store, reportes y enlaces al customer. |

Customer no es solo cliente: el home lee sesión y consulta la API con `revalidate: 15` (`apps/customer/app/page.tsx:11`, `:88`); el callback escribe cookies (`apps/customer/app/auth/callback/route.ts:17`). `/entregas` ahora redirige al home (`apps/customer/app/entregas/page.tsx:20`).

Los puntos de fallo concretos:

- **Auth y cookies:** conservar el origen canónico, nombres de cookies y callback. Configurar correctamente host/protocolo tras el proxy: el callback construye redirects desde `request.url` (`apps/customer/app/auth/callback/route.ts:6`). Revisar Site URL y Redirect URLs de Supabase y configuración OAuth; el repo no demuestra su estado. Probar login nuevo y sesión existente.
- **CORS:** conservar dominios y añadir staging explícitamente. No superponer cabeceras del proxy: el cliente manda Bearer y también `credentials: 'include'` (`packages/api-client/src/index.ts:136`, `:150`); CORS exige origen concreto y `Vary: Origin` (`apps/api/lib/http/cors.ts:59`).
- **Inngest:** mantener `/api/inngest` accesible, firmado y sin caché ni autenticación adicional del proxy (`apps/api/app/api/inngest/route.ts:8`). Verificar sincronización y una ejecución pendiente que despierte después del corte. No registrar dos consumidores de producción por accidente.
- **PDF:** `NODE_ENV=production` obliga a usar Sparticuz; **definir `PUPPETEER_EXECUTABLE_PATH` no cambia esa rama** (`apps/api/lib/pdf/browser.ts:49`, `:89`). Ensayar el binario actual o introducir selección explícita de motor para VPS, con fuentes y dependencias instaladas. Descargar un PDF real desde el build productivo.
- **Caché:** empezar con una instancia por app. Verificar regeneración, almacenamiento y reinicio; si luego hay varias réplicas, resolver coherencia entre cachés. No cachear sesiones ni respuestas privadas en el proxy. Los endpoints públicos tienen políticas propias (`apps/api/app/api/v1/public/businesses/route.ts:90`).
- **Imágenes y OG:** conservar optimización, límites de recursos y URLs públicas. Customer permite Storage de Supabase (`apps/customer/next.config.ts:46`); OG de negocio usa `ImageResponse` y fetch cacheado (`apps/customer/app/negocio/[id]/opengraph-image.tsx:32`, `:111`). Probar PNG y previews compartidos.
- **Variables:** inventario por app, distinguiendo build y runtime. `NEXT_PUBLIC_*` requiere reconstruir el frontend cuando cambia. Incluir Upstash, omitido del resumen inicial (`apps/api/lib/env.ts:11`). Sustituir o retirar Analytics de Vercel (`apps/customer/app/layout.tsx:182`).
- **Región:** medir desde Perú y desde el servidor hacia Supabase en Oregón. Un VPS cercano al usuario puede alejar la API de la base. Comparar latencias p50/p95 en operaciones reales, no únicamente `/health`.

**Static export:** lo ensayaría después, empezando por admin. Que todas las páginas lleven `use client` no demuestra exportabilidad: existen rutas como `orders/[id]`, `menu/item/[id]` y `pedido/[id]` (`apps/admin/app/orders/[id]/page.tsx:1`, `apps/negocios/app/menu/item/[id]/page.tsx:1`, `apps/motorizados/app/pedido/[id]/page.tsx:1`). Hay que resolver rutas desconocidas al build, recarga directa, fallback, manifests e imágenes. Exportar puede exigir cambiar navegación y producir 404 inesperados. Customer conservaría servidor.

**Orden del corte:** ensayo completo → API → admin → customer → negocios → motorizados, con verificación entre hitos y fuera de 18:00–23:00. Reducir TTL antes, conservar los despliegues Vercel y cambiar un dominio por vez. Durante propagación ambos hosts deben ejecutar versiones compatibles contra la misma base.

**Vuelta atrás:** restaurar DNS/proxy y configuración de Inngest al despliegue anterior. No restaurar una copia vieja de la base: perdería pedidos creados durante el corte. Ensayar también el retorno y mantener assets antiguos mientras existan pestañas abiertas.

**2. Qué no mezclar y cómo ordenar**

1. **Paso 0 inmediatamente:** comprobante condicionado y luego transaccional, evento durable, recuperación idempotente aislada por usuario y límites/inmutabilidad de archivos. El acuerdo ya establece pruebas y condiciones (`Docs/customer_app_migration/debate-rest/conclusion.md:77`).
2. **Estándares y desacoplamiento al tocar:** rutas finas, casos de uso y adaptadores, con excepciones para legado. La v2.1 sigue siendo propuesta pendiente de aprobación (`Docs/arquitectura/05-estandares.md:3`).
3. **Mudanza:** cambios de ejecución, configuración y PDF necesarios para demostrar equivalencia.
4. **Preparación nativa:** inventario REST, OpenAPI, integración en CI, compatibilidad, rutas faltantes y recorrido temprano en dispositivos; conservar el orden acordado.
5. **Base:** proyecto posterior con restauración y ensayo propios.

No juntaría mudanza con Hono, driver SQL, esquemas por módulo, squash, reemplazo de Auth o nueva cola. Son decisiones independientes; varios siguen siendo ensayos (`Docs/arquitectura/04-arquitectura-objetivo.md:135`).

**3. Notificaciones más fáciles y listas para nativo**

Recomiendo un módulo **notifications**, con registro REST de dispositivos, selección de destinatarios, mensajes y seguimiento de entregas comunes. Adaptadores: **Web Push VAPID para web, FCM para Android y APNs para iOS**.

FCM para todo reduce integraciones de envío, pero agrega dependencia y una migración del registro web. No lo elegiría solo por aparente simplicidad: el Web Push existente ya funciona y conservarlo evita cambiar permisos y suscripciones junto al hosting.

Hoy registro y envío ya están separados: customer registra por REST (`apps/customer/lib/push.ts:105`); `send-push` resuelve destinatarios, envía y registra resultados (`supabase/functions/send-push/index.ts:419`, `:1212`). Primero conservaría esa Edge Function; después extraería su lógica a un consumidor ejecutable fuera de Supabase.

Las **39 filas no requieren migración por cambiar servidor** si se mantienen origen, SW, clave VAPID y registro. Cambiar `www` por apex también cambia origen. Cambiar origen o clave exige reinscripción; ninguna copia de filas evita eso. Conservar `/sw.js`, HTTPS y scope; servirlo con revalidación, sin caché prolongada. Probar permiso concedido, denegado, reinscripción y clic con la app cerrada.

Antes de mudar la base, sacar **el envío HTTP del trigger**, no únicamente mover la Edge Function. `dispatch_event` todavía ejecuta `net.http_post` (`supabase/migrations/0238_entregas_abre_de_noche_y_avisa_sin_descuentos.sql:193`). La transacción debe guardar evento y trabajo durable; un consumidor externo reclama, envía y reintenta.

Necesita lease recuperable, deduplicación por evento/dispositivo, expiración, errores permanentes, cuarentena y métricas. El procesador existente cubre solo dos tipos y no reemplaza todo el push (`apps/api/lib/outbox/processor.ts:52`). El tag de una notificación tampoco garantiza entrega exactamente una vez.

**4. Antes de mudar la base**

Cerrar accesos directos al dominio desde **las cuatro webs**, además de nativo; aislar Supabase en adaptadores de datos, identidad, archivos y avisos. Mantener las RPC como autoridad, autorización dentro de la operación y outbox transaccional.

Inventariar dependencias de `auth.uid()`, roles/grants, Storage, URLs firmadas, Realtime/Broadcast, Vault y los doce cron del contexto. Para cada cron decidir conservar, trasladar o reemplazar, incluyendo sus efectos transaccionales.

Migrar Postgres y abandonar Supabase completo son alcances distintos. Un puerto de identidad permite cambiar implementación; no transporta automáticamente usuarios, contraseñas o sesiones. Ensayar datos, objetos, archivos y permisos, con conciliación de pedidos, cargos y saldos. Mantener historial; el squash sigue separado.

**5. Red de seguridad frente al temor de Jesús**

La garantía será evidencia repetible:

- **Contrato:** OpenAPI fiel al API actual, modelos compilables en Swift/Kotlin, diff y revisión semántica. Probar nulabilidad, dinero, estados desconocidos, errores, autorización e idempotencia. `/config` y mínimos por app/plataforma antes del primer build distribuido.
- **Integración en CI:** levantar Supabase aislado, reconstruir migraciones, ejecutar `pnpm db:seed:e2e` y suite API. Hoy CI excluye API y solo compara tipos con remoto (`.github/workflows/ci.yml:52`, `:91`).
- **E2E por entorno:** parametrizar URLs de todas las apps y fixtures, desactivar `webServer` para staging. No basta cambiar `baseURL`: el recorrido completo fija URLs y Supabase local (`e2e/viaje-pedido-online.spec.ts:23`, `:44`, `:181`). Mantener guardas contra producción.
- **Recorridos:** reutilizar el pedido hasta entregado (`e2e/viaje-pedido-online.spec.ts:131`) y añadir pérdida de respuesta tras commit, renovación, reconexión, vuelta al primer plano y permisos push. Hoy se conceden notificaciones globalmente (`playwright.config.ts:51`).
- **Dispositivos reales:** Android/iPhone con background, cierre, notificación, deep link y retorno al estado obtenido por REST.
- **Operación:** staging con build productivo, ensayo de corte/retorno, alertas de errores, latencia, antigüedad del outbox y fallos push. Definir umbrales y responsables antes del corte.

**6. Lo que puede salir mal en mi propuesta**

El VPS concentra fallos y exige mantenimiento que hoy cubre Vercel. Cinco procesos más Chromium pueden agotar memoria. DNS y pestañas antiguas mantienen versiones simultáneas. Un despliegue correcto puede fallar al generar el primer PDF o despertar el primer timer.

El desacoplamiento puede dejar reglas duplicadas; un consumidor durable puede repetir avisos tras enviar y caer antes de confirmar. Staging no reproduce cobertura móvil ni restricciones del sistema operativo.

Por eso cada cambio debe tener una prueba específica, umbral de aceptación y retorno ensayado. **Mover hosting puede ser pequeño; prometer equivalencia web/nativo sin esas pruebas sería demasiado grande.**