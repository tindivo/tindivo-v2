# 00 · Veredicto y método de la auditoría de backend

> **Fecha de la medición:** 2026-09-20 · **Código:** `HEAD 09749a4` (rama `develop`) ·
> **Base medida:** `tindivo-prod` (remoto, ref `zpnipajgwfthxhdtzhly`, migraciones hasta la
> **0230**; el repo llega a la 0231), en **solo lectura** por MCP.
> **Alcance:** todo lo que hay detrás de las pantallas: `apps/api`, Supabase (Postgres, RLS,
> RPC, cron, Realtime, Storage, Auth, Edge Function), Inngest, Twilio y los paquetes
> `contracts`, `core`, `api-client` y `supabase`.

## 1. Veredicto

**El backend funciona y tiene un dominio valioso, pero todavía no es una plataforma para apps
distribuidas por las tiendas.** No hay que reescribirlo: hay que **envolverlo y endurecerlo**.

En una frase por tema:

| Tema | Veredicto |
|---|---|
| **Rendimiento bruto** | **No es el problema.** En 58 días la base acumuló 8,7 horas de CPU y el 65 % lo consume el propio Realtime. Con 716 pedidos en total, nada se «rompe por volumen». |
| **Latencia** | **Sí es un problema, y viene de la arquitectura de la petición**, no de la base: cada llamada autenticada hace 2 saltos extra antes de empezar (verificar el token contra GoTrue y consultar `user_roles`), y crear un pedido encadena entre 11 y 17 idas y vueltas. |
| **Contrato** | **El mayor riesgo para el móvil.** La «API» real es la suma de 85 rutas REST + el esquema de la base + 30 RPC ejecutables por cualquier usuario autenticado. No hay OpenAPI, no hay tipos de respuesta, no hay versionado ni política de compatibilidad, y los cambios rompientes se despliegan sin alias. Una app instalada en la tienda no se actualiza a la vez que el backend. |
| **Notificaciones** | **Aquí está tu dolor.** El «outbox» no lo es (el 100 % de 5 620 eventos tiene `published_at` vacío), el envío es *fire-and-forget*, el modelo es Web Push, y **solo 11 de 77 usuarios cliente tienen un dispositivo registrado (14 %), todos Android: ninguno en iPhone**. No hay nada para APNs/FCM, marketing ni consentimiento. El envío al servicio de push tiene éxito el 99,95 % de las veces: **lo que falla es el alcance, no la entrega.** |
| **Seguridad** | **Sin críticos explotables hoy**, con una base sólida (RLS 45/45, `search_path` fijado 88/88). Lo más serio: **no existe *rate limiting*** (Upstash está en las dependencias y no se usa; el OTP por SMS es explotable por coste) y **no existe borrado de cuenta** (requisito de App Store y Google Play). Además: la Edge Function de push acepta la *anon key* pública, 31 funciones `SECURITY DEFINER` son ejecutables por `anon`/`authenticated` y la impersonación de admin no deja rastro. |
| **Reglas de negocio** | **Repetidas en 3-4 sitios.** Viven en 245 KB de PL/pgSQL, en `contracts` (TypeScript), en la ruta de la API y en el cliente. Swift y Kotlin no pueden reutilizar el TypeScript: cada regla sería una copia más. El propio código documenta tres incidentes causados por esa duplicación. |
| **Proceso** | **El CI está rojo en su segundo paso** (`check:ds` con la línea base desactualizada) y **nunca ejecuta la suite de integración del backend** (30 ficheros, 307 casos). Las 230 migraciones (numeración hasta la 0231) llevan un ritmo de ~1,7 por día en el último mes. |

**Lo que hay que hacer antes del primer build de tienda** (detalle y orden en
[`registro-de-hallazgos.md`](registro-de-hallazgos.md) y en
[`../00-resumen-ejecutivo.md`](../00-resumen-ejecutivo.md)): definir una **superficie móvil
versionada con OpenAPI**, **códigos de error de dominio estables**, **registro de dispositivos +
outbox real + APNs/FCM**, **cerrar `send-push`**, **generalizar `source = 'customer_pwa'`**
(si no, un canal nativo se salta reglas por CHECK) y **añadir borrado de cuenta y Sign in with
Apple**.

## 2. Lo que está bien y hay que conservar

No todo es deuda. Esto es lo que la migración **no** debe tirar:

1. **RLS activa en las 45 tablas de `public`** y **88 de 88 funciones `SECURITY DEFINER` con
   `search_path` fijado**; los advisors no reportan `function_search_path_mutable` ni ningún
   ERROR. `[ADVISOR]` `[DB-PROD]`
2. **Errores en RFC 9457 (Problem Details)** con `code`, `requestId` y `errors[]` por campo, y
   `x-request-id` propagado desde el cliente. `[CÓDIGO]` `apps/api/lib/http/problem.ts:19-35`
3. **Idempotency-Key estilo Stripe** en la creación de pedidos, con *replay* antes de los guards
   de estado y un cliente (`packages/api-client`) que distingue «el servidor dijo no» de «no sé
   qué pasó» (`ApiTimeoutError`) y conserva la clave en el segundo caso. `[CÓDIGO]`
   `apps/api/lib/http/idempotency.ts:18-30`, `packages/api-client/src/index.ts:19-58`
4. **Parámetros operativos en `app_settings`**, no en el código: plazos, umbrales, comisiones,
   polígono de cobertura. `[DB-PROD]` (21 claves)
5. **Dinero en `numeric(10,2)`**, `short_id` validado solo al crear, `numero_pedido` atómico.
6. **Guardas automáticas de invariantes** que ni el linter ni el tipado ven: `check:auth`
   (898 ficheros OK), `check:dialogs` (389 OK), drift de enums en compilación y drift de tipos de
   base en CI. `[PRUEBA]`
7. **Un dominio de antifraude explícito y medido** (strikes anclados a teléfono y dirección,
   `compra_previa`, señal de GPS, validación humana). Es lo más valioso y lo más difícil de
   rehacer; ver `SYS-transversal.md`.
8. **Storage con RLS por carpeta de usuario** y bucket privado para comprobantes; columnas
   sensibles protegidas con `GRANT` por columna (texto de las reseñas, migración 0217).
9. **Cultura de post-mortem:** cada incidente deja comentario, migración y test (CORS 2026-08-12,
   VAPID 2026-08-01, Twilio 2026-08-12, PDF 2026-09-08). Es lo que permite auditar sin adivinar.
10. **Retención definida** en los crons de limpieza (`domain_events` 90 días, `push_delivery_log`
    30 días, `idempotency_keys` 24 h; **salvo el registro del propio `pg_cron`**, `DAT-08`) y **78 scripts de
    rollback** de migraciones.
11. **Catálogo público con caché de borde** (`s-maxage=15, stale-while-revalidate=45`).
12. **`X-Request-Id`, tiempos de espera explícitos (15 s) y una política de reintento pensada para
    conexiones malas de pueblo**: exactamente la mentalidad que necesita un cliente móvil.

## 3. La escala real (para no dimensionar por miedo)

| Dimensión | Valor | Fuente |
|---|---|---|
| Pedidos totales | **716** desde el 2026-08-08 (619 tecleados por la cajera, **97 hechos por clientes en la PWA = 13,5 %**) | `[DB-PROD]` |
| Negocios / motorizados / admin | 4 / 4 / 1 | `[DB-PROD]` `user_roles` |
| Cuentas | 86 usuarios en Auth (64 con Google, 22 con correo; **0 con teléfono como identidad de Auth**); 77 con rol principal cliente, 63 con teléfono verificado por OTP | `[DB-PROD]` |
| Dispositivos con push | 26 suscripciones de 19 usuarios: **11 clientes (todos Android, 0 iOS)**, 4 negocios, 3 motorizados, 1 admin. 10 de los 32 clientes que han pedido (31 %) | `[DB-PROD]` |
| Tablas / funciones SQL | 45 / 106 (**245 KB** de PL/pgSQL, 88 con `SECURITY DEFINER`) | `[DB-PROD]` |
| `orders` | **98 columnas**, 9 triggers, 19 índices, 4 políticas de lectura | `[DB-PROD]` |
| Rutas REST | 85 (40 admin · 18 negocio · 9 motorizado · **8 cliente** · 6 públicas · push · health · inngest) | `[CÓDIGO]` |
| Código TypeScript (sin tests) | ~98 k líneas (negocios 29,6 k · customer 24,9 k · admin 14,4 k · motorizados 13,5 k · api 12,3 k · contratos 1,9 k · core 1,3 k) | `[CÓDIGO]` |
| Migraciones | 230 ficheros (numeración hasta la 0231; hueco en la 0091); **51 en los últimos 30 días** | `[CÓDIGO]` |
| Cron jobs | 11 activos (4 barridos de 1 min) | `[DB-PROD]` |
| Tiempo de CPU de la base | 31,4 M ms ≈ **8,7 h en 58 días** (desde 2026-07-24) | `[DB-PROD]` `pg_stat_statements` |
| Tests | 30 ficheros / **307 casos** de integración (fuera de CI) · 28 specs e2e · 77 ficheros unitarios (`admin` tiene 0) | `[CÓDIGO]` |

> **Operación real (confirmado el 2026-09-20).** Estas cifras son actividad real de `tindivo-prod`: el usuario
> confirmó «operación real de 1 mes y 5 días» (`D-03`). Mis notas del 2026-09-10 decían que no había producción
> viva; los datos ya lo desmentían (pedidos en 43 de 44 días, ≈ 17 por día activo, 386 teléfonos distintos, cierres de
> efectivo y pagos de restaurantes). Consecuencia: **todo cambio de backend debe ser compatible hacia atrás** y hacerse
> fuera de 18:00-23:00 (`05-arranque/03-plan-de-ejecucion.md`).

Implicación: **no hay problema de escala que resolver ahora.** Lo que hay que resolver es la
**fiabilidad de lo que ya ocurre** (avisos, reintentos, contrato) y el **coste de cambiar** el
sistema (reglas duplicadas, migraciones que reescriben funciones enteras).

## 4. Método y sus límites

**Cómo se midió.** Cuatro tipos de evidencia, siempre etiquetados:

| Etiqueta | Qué significa |
|---|---|
| `[CÓDIGO]` | Fichero y línea en `HEAD 09749a4`. Se leyó el código; no se dedujo de la documentación. |
| `[DB-PROD]` | Consulta de **solo lectura** contra `tindivo-prod` (0230) el 2026-09-20 por MCP. Las consultas exactas están en [`../anexos/C-consultas-de-medicion.md`](../anexos/C-consultas-de-medicion.md). |
| `[ADVISOR]` | Resultado de `get_advisors` (security y performance) sobre `tindivo-prod`, 2026-09-20. |
| `[PRUEBA]` | Algo que se **ejecutó** durante la auditoría (`pnpm lint`, `check:*`, una llamada sin efectos a la Edge Function). |
| `[DOC]` | Afirmación de la documentación **no verificada**. Solo se usa para señalar contradicciones. |

**Límites que conviene conocer:**

- **No se corrieron los tests de integración** (escriben en la base y contaminan los fixtures de
  las demás sesiones). Se contaron, no se ejecutaron.
- **Docker estaba detenido** durante la auditoría, así que no hay medición contra la base local.
  El remoto va **una migración por detrás** del repo (falta la 0231, el *broadcast* de la cola de
  motorizados), que no afecta a nada de lo aquí medido.
- **No hay carga sintética ni pruebas de penetración.** Las afirmaciones de seguridad son de
  revisión de código y de configuración, más **una** llamada sin efectos (ver `SEC-01`).
- **`pg_stat_statements` se reinició el 2026-07-24**, así que los tiempos son de ~58 días, no de
  toda la vida del proyecto.
- **Sin acceso a los paneles** de Supabase ni de Vercel: la región de Supabase se dedujo del fichero de enlace de
  la CLI (`us-west-2`; `PER-02`) y los planes (gratuitos) los confirmó el usuario el 2026-09-20 (`PRO-06`).
- **La documentación existente se usó como pista, no como verdad.** Hay contradicciones medidas
  entre `DECISIONS.md`/`Docs/` y el estado real (ver `PRO-04`).

## 5. Escalas usadas en todos los hallazgos

**Severidad**

| Nivel | Criterio |
|---|---|
| **Crítico** | Pérdida de dinero o de datos, o brecha explotable hoy, o impide publicar en las tiendas sin arreglo. |
| **Alto** | Degrada la fiabilidad o el contrato de forma que **afectará al móvil**; arreglar antes del primer lanzamiento. |
| **Medio** | Deuda que encarece el cambio o riesgo acotado; planificar. |
| **Bajo** | Higiene. |

**Bloquea el móvil:** **Sí** (no se debe publicar sin resolverlo) · **Parcial** (se puede publicar
con una mitigación) · **No**.

**Esfuerzo** (orden de magnitud para una persona con contexto, **no** un compromiso):
**S** ≤ 2 días · **M** ≤ 2 semanas · **L** > 2 semanas.

## 6. Cómo leer el resto

| Documento | Contenido | IDs |
|---|---|---|
| [`01-arquitectura-y-contrato.md`](01-arquitectura-y-contrato.md) | Doble vía de acceso, contrato, reglas duplicadas, SQL como dominio, mecanismos asíncronos, compatibilidad | `ARQ-*` |
| [`02-rendimiento-y-latencia.md`](02-rendimiento-y-latencia.md) | Cadena de saltos, región, polling, Realtime, políticas, Edge Function | `PER-*` |
| [`03-notificaciones.md`](03-notificaciones.md) | El pipeline de avisos de punta a punta | `NOT-*` |
| [`04-seguridad.md`](04-seguridad.md) | Superficie expuesta, abuso, cumplimiento de tiendas | `SEC-*` |
| [`05-datos-y-consistencia.md`](05-datos-y-consistencia.md) | Idempotencia, errores de dominio, identidad, direcciones | `DAT-*` |
| [`06-proceso-calidad-y-operacion.md`](06-proceso-calidad-y-operacion.md) | CI, despliegue, observabilidad, documentación, código muerto | `PRO-*` |
| [`07-preparacion-para-cliente-nativo.md`](07-preparacion-para-cliente-nativo.md) | Lo que falta para Swift/Kotlin, capacidad por capacidad | `MOB-*` |
| [`registro-de-hallazgos.md`](registro-de-hallazgos.md) | Todos los hallazgos, ordenados y filtrables | — |
