# 06 · Proceso, calidad y operación

> **Pregunta:** ¿el modo de trabajar y de operar el sistema sostiene un producto con apps en las
> tiendas?
> Etiquetas y escalas: [`00-veredicto-y-metodo.md`](00-veredicto-y-metodo.md).

## El estilo de trabajo, medido

| Dato | Valor | Lectura |
|---|---|---|
| Commits totales | 779 en 112 días (2026-05-31 → 2026-09-19) | ~7 por día |
| Migraciones añadidas en los últimos 30 días | **51** | ~1,7 por día |
| Funciones SQL redefinidas enteras por migración | `create_customer_order` **36 veces**, `advance_order` 24, `create_business_manual_order` 18, `get_tracking` 15, `validate_order` 11 | Cada cambio reescribe el cuerpo completo |
| Documentación en comentarios | Muy alta: cada incidente deja causa, fecha y decisión en el código | Fortaleza: permite auditar sin preguntar |

Es el ritmo típico de **iterar en producto**: rápido y con memoria escrita. La consecuencia para el
móvil no es «lento» sino que **el sistema cambia más deprisa de lo que una app de tienda puede
seguir** (ver `ARQ-07`).

---

## PRO-01 · El CI está rojo en su segundo paso y nunca ejecuta la suite de integración del backend

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | No (pero es la red de seguridad de todo lo demás) |
| **Esfuerzo** | M |

**Evidencia.** `[PRUEBA]` `[CÓDIGO]` `.github/workflows/ci.yml`:
- Pasos: Biome → `check:ds` → `check:auth` → type-check → **tests solo de core + contracts** (`turbo
  run test --filter='!@tindivo/api'`) → build. Más un job de *drift* de `database.types.ts`.
- **`pnpm check:ds` falla hoy también en `HEAD` limpio** (copia exportada de `09749a4`): «6
  infracciones resueltas. Corre `pnpm check:ds --update»: la línea base tiene entradas que ya no
  aplican. Como el CI **aborta en el primer paso rojo**, **nunca llega** a type-check, tests ni build.
- `pnpm lint` (Biome): **0 errores, 13 avisos** (accesibilidad). `check:auth` y `check:dialogs`: OK.
- **La suite de integración de la API** (30 ficheros, **307 casos**, la que prueba las RPC y las
  reglas de negocio) está **excluida** con un comentario que lo explica: «ningún workflow lo ha hecho
  nunca», porque el *runner* no levanta Supabase local. Se corre a mano.
- **Admin tiene 0 tests unitarios**; Customer 17 ficheros; Negocios 20; Motorizados 9.

**Por qué importa.** El backend lleva **245 KB de lógica en SQL** y es exactamente lo que no está
cubierto en CI. Para publicar apps de tienda, una regresión en una RPC es una regresión en versiones
que no se pueden retirar.

**Dirección.** (1) Arreglar `check:ds` (actualizar la línea base) **ya**. (2) Levantar Supabase local
en CI (`supabase start`) y ejecutar la suite de integración. (3) Añadir `check:grants` (`SEC-02`) y
el **test de contrato/OpenAPI** (`ARQ-02`). (4) Que el CI sea una **puerta**, no un aviso.

---

## PRO-02 · Un despliegue son tres despliegues en orden, sin entorno de prueba visible

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | Parcial |
| **Esfuerzo** | M |

**Evidencia.** `[CÓDIGO]` `[DB-PROD]`
- Orden obligatorio: **`supabase db push` → apps en Vercel → `supabase functions deploy`**
  (`Docs/13-deploy-y-devops.md:305-310`). Existe un verificador (`pnpm check:deploy`) que necesita
  la **contraseña del proyecto** y falla si no la tiene.
- **El remoto está una migración por detrás del repo** (0230 frente a 0231). La 0231 no afecta al
  cliente, pero demuestra que el desfase es la normalidad.
- La doc menciona una rama `staging` y un proyecto Supabase de *staging* (`Docs/13:239`); **no se
  pudo verificar que exista** (no está en el repo ni en el MCP).
- No hay *feature flags* ni *canary*: cada cambio de base es global e inmediato.

**Por qué importa con nativo.** Con apps publicadas, **un despliegue de backend mal ordenado no se
puede deshacer desde la tienda**.

**Dirección.** Un entorno de *staging* real (proyecto Supabase + despliegue Vercel) contra el que
corran los **builds de TestFlight/pruebas internas de Play**, y *feature flags* remotos (`MOB-02`).

---

## PRO-03 · Las migraciones son el único historial del dominio

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | M |

**Evidencia.** `[CÓDIGO]` `[DB-PROD]`
- **230 ficheros** (numeración 0001-0231, con un **hueco en la 0091**); **229 aplicadas** en remoto.
- **No hay un esquema resultante** (`supabase/schemas/` o un volcado versionado): el estado
  vigente de una función es la última de N redefiniciones (`ARQ-04`).
- **78 scripts de rollback** en `supabase/rollbacks/` (bien), pero no hay evidencia de que se
  ejecuten en ningún flujo automático.
- Los nombres de las últimas (`the_queue_hears_when_an_order_is_taken`, `the_free_ride_gets_an_expiration_date`)
  son frases de intención (útiles), pero no permiten localizar por tema.

**Dirección.** Un **volcado de esquema versionado** regenerado en CI (`supabase db dump`) y revisado en
cada PR (el *diff* del esquema, no solo el de la migración), más un índice de migraciones por
dominio.

---

## PRO-04 · La documentación de estado contradice el estado real

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No (pero es el riesgo de que Swift/Kotlin se construyan sobre datos falsos) |
| **Esfuerzo** | S |

Contradicciones **verificadas** entre documentos y realidad (2026-09-20):

| Documento | Dice | Realidad |
|---|---|---|
| `DECISIONS.md` §2 | Proyecto «Web v2», ref `psjigdoinfpgrnedxeyf`, región `us-east-2`; «no hay CLI local» | El vivo es `tindivo-prod` (`zpnipajgwfthxhdtzhly`); **sí hay CLI** (`CLAUDE.md`) |
| `DECISIONS.md` §7 | Prepago obligatorio desde S/100 | **80** en `app_settings.prepay_threshold` |
| `DECISIONS.md` §4 | Comisión de delivery S/1.00 | **1.50** en `app_settings.commissions.delivery` |
| `DECISIONS.md` §3 | Existe `packages/inngest` | No existe; Inngest vive en `apps/api/lib/inngest/` |
| `DECISIONS.md` §11 | «un cron de reconciliación reprocesa no publicados» | **No existe** (0 de 5 620 publicados; `NOT-01`) |
| `DECISIONS.md` §12 | Roles en el JWT «sin query a DB» | Cada petición consulta `user_roles` (`PER-01`) |
| `DECISIONS.md` §12 | Idempotencia «en todos los POST de creación» | 4 de 49 rutas (`DAT-01`) |
| `DECISIONS.md` §1 | Las apps consumen «un REST único» | Doble vía (`ARQ-01`) |
| `Docs/13-deploy` | Postgres 15; Edge Functions `send-push`, `prune-domain-events`; `pg_cron` cada 5 min; Inngest solo hace 2 cosas | Postgres 17; solo `send-push`; crons de 1 min; Inngest hace 4 timeouts + un cron |
| `Docs/13-deploy` | Free tier con «backups diarios, retención 7 días» | **Falso**: el plan gratuito de Supabase no incluye copias de seguridad (`PRO-06`); las copias diarias son del plan Pro |
| `Docs/07-flujo-cliente` | 13 pantallas conmutables por un `currentScreen` en Zustand | Next App Router con 9 páginas |
| Comentario en `customer/orders/route.ts:259` | «el pedido sin aceptar expira solo a los 15 minutos» | 8 minutos (`timers.acceptanceMinutes`) |
| `Docs/INVENTARIO_ESTADO_ACTUAL.md` (borrado; en git: `8f26aed`) | Inventario de motorizados y pedidos manuales (2026-07-23) | 100+ migraciones más; solo cubre 2 de 5 proyectos |

**Regla de esta migración:** **el código y la base mandan; los documentos son pista.** Cada
requisito de `03-requisitos/` cita su fuente en código o base.

**Dirección.** Mantener **una** fuente de verdad viva por tema y **derivar** lo demás
(OpenAPI para la API, volcado para el esquema, `app_settings` para los parámetros); retirar o marcar
como histórico lo demás.

---

## PRO-05 · No hay observabilidad de aplicación

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | Parcial |
| **Esfuerzo** | S-M |

**Evidencia.** `[CÓDIGO]`
- **Ningún rastreador de errores** (Sentry, Bugsnag…), ni APM, ni analítica de producto: la única
  dependencia de este tipo es `@vercel/analytics` en el Customer.
- El manejo de errores 500 es `console.error('[api] error no manejado:', err)`
  (`lib/http/problem.ts:63`). `Docs/13:566` indica **retención de logs de 1 día** en Vercel.
- **Sí existe** `x-request-id` extremo a extremo entre cliente y API (bien), pero **no llega a la
  base ni a la Edge Function**, así que un aviso no se puede rastrear hasta el evento que lo causó.
- No hay métricas ni alertas de: latencia por ruta, tasa de error, fallos de OTP/SMS, retraso de
  avisos, cancelaciones por temporizador.

**Por qué importa con nativo.** En móvil **los fallos ocurren en el teléfono del usuario**: sin
*crash reporting* (Crashlytics/Sentry) ni trazabilidad de peticiones, «no me llegó» no se puede
diagnosticar (`NOT-08`).

**Dirección.** Sentry (o equivalente) en API y en las dos apps, propagar `x-request-id` hasta
`domain_events.metadata`, panel mínimo de salud (latencia P50/P95 por ruta, errores 5xx, avisos
por hora) y alertas a un canal humano.

---

## PRO-06 · Planes gratuitos con operación real: sin copias de seguridad y con Vercel fuera de sus términos

| | |
|---|---|
| **Severidad** | Alto (confirmado por el usuario el 2026-09-20 y contrastado con la documentación pública) |
| **Bloquea el móvil** | Parcial |
| **Esfuerzo** | S |

**Evidencia.** El usuario confirmó el 2026-09-20 que **Supabase y Vercel están en plan gratuito** y que hay
**operación real** desde hace un mes. Contrastado el mismo día con la documentación pública de cada proveedor:
- **Supabase Free:** **sin copias de seguridad ni recuperación a un punto en el tiempo**, base de 500 MB, pausa tras
  una semana sin actividad, 5 GB de salida + 5 GB en caché. `Docs/13-deploy` afirma «backups diarios, retención
  7 días» en el plan gratuito: **no es así**, y da una falsa sensación de seguridad. **Pro (US$ 25/mes)** incluye copias
  diarias con 7 días de retención y no se pausa. Uso real: 148 MB, de los que **117 MB son el registro de `pg_cron`**
  (`DAT-08`). Pendiente de revisar: conexiones y Realtime; protección de contraseñas filtradas (`SEC-07`).
- **Vercel Hobby:** limitado al **uso personal no comercial**; cualquier despliegue usado para el beneficio económico de
  alguien del proyecto exige **Pro (US$ 20 por usuario y mes)**. Tindivo cobra comisión de delivery: es uso comercial.
  Riesgo de suspensión en el peor momento. Además, límites de tiempo de ejecución de funciones (relevante para el PDF
  con Chromium, `next.config.ts:57-62`; no verificado).
- **Inngest:** 50 000 ejecuciones al mes gratis; con 4 funciones por pedido el margen es corto
  (`Docs/13:146-150`; `[DOC]`, no verificado).
- **Twilio Verify:** coste por verificación; en Perú solo SMS (el canal WhatsApp no está aprobado,
  `send-code/route.ts:33-42`).
- **DNS:** `api.tindivo.com` **apunta al proyecto v1 legacy** (no al v2, que es `apiv2.tindivo.com`).
  Un cliente nativo que apunte por error a `api.` recibiría 404 «normales».

**Dirección.** Copias de seguridad **ya** (Supabase Pro o, como mínimo, un volcado nocturno cifrado), Vercel Pro por sus
términos de uso, y el inventario de costes de `05-arranque/02-planes-region-y-mejoras-rapidas.md` (`D-37`).

---

## PRO-07 · Código y datos vestigiales

| | |
|---|---|
| **Severidad** | Bajo |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S |

`[CÓDIGO]` `[DB-PROD]` Piezas que **no deben migrarse** (disposición «Muerto» en `03-requisitos/`):

| Pieza | Evidencia |
|---|---|
| **Muro del piloto** | `apps/api/lib/pilot/gate.ts`: `isPhoneAllowed` devuelve siempre `true` («Tras el lanzamiento público…»); sigue en pie `apps/customer/features/pilot/*` (61 líneas), `POST /public/pilot-access`, `contracts/src/pilot.ts` |
| **Temporizador Inngest «legacy»** | `orderPrepayTimeout` (`inngest/functions.ts:151-182`) «conservado por compatibilidad» |
| **Promo de envío gratis** | `app_settings.promo_free_delivery` con `active: true` y `to: 2026-09-05`; `promo_redemptions` |
| **Códigos de error sin uso** | `business_blocked`, `payment_required` (`DAT-02`) |
| **Índices sin uso** | 13 (`PER-06`) |
| **Comentarios desfasados** | Ver `PRO-04` |
| **Nombres que mienten** | `menu_items.is_compact` significa «destacado» (migración 0206); `businesses.accepting_orders_until` es «pausado hasta»; `order_source = customer_pwa` |

---

## PRO-08 · Compilar y publicar las apps móviles es un proceso nuevo que no existe todavía

| | |
|---|---|
| **Severidad** | Alto (es trabajo nuevo, no deuda) |
| **Bloquea el móvil** | **Sí** |
| **Esfuerzo** | M |

Nada de esto existe hoy en el repo, y es previo al primer usuario real. Está detallado en
`07-preparacion-para-cliente-nativo.md` (`MOB-16`–`MOB-19`): repositorio y estructura (monorepo o no),
**firmas y cuentas** (Apple Developer, Google Play Console), **CI para iOS (requiere macOS)** y
Android, **TestFlight / pruebas internas**, entorno de *staging*, y política de versiones.

## Resumen de este documento

| ID | Hallazgo | Sev. | Bloquea | Esf. |
|---|---|---|---|---|
| PRO-01 | CI rojo en `check:ds`; suite de integración (307 casos) fuera de CI | Alto | No | M |
| PRO-02 | Despliegue en tres pasos ordenados; sin *staging* verificado; sin flags | Medio | Parcial | M |
| PRO-03 | Migraciones como único historial; sin volcado de esquema | Medio | No | M |
| PRO-04 | Documentación de estado contradice la realidad (13 casos medidos) | Medio | No | S |
| PRO-05 | Sin rastreador de errores, APM ni métricas; logs a 1 día | Alto | Parcial | S-M |
| PRO-06 | Planes gratuitos con operación real: sin copias de seguridad; Vercel Hobby no comercial | Alto | Parcial | S |
| PRO-07 | Código y datos vestigiales | Bajo | No | S |
| PRO-08 | No existe la cadena de compilación y publicación móvil | Alto | **Sí** | M |
