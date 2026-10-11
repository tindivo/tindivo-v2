# Registro de hallazgos de la auditoría de backend

> **48 hallazgos únicos** (49 entradas: `NOT-04` es el mismo hecho que `SEC-01`) en 6 áreas, más 21
> capacidades de preparación móvil (`MOB-*`, en [`07-preparacion-para-cliente-nativo.md`](07-preparacion-para-cliente-nativo.md)).
> Medición: 2026-09-20, `HEAD 09749a4`, `tindivo-prod` en la migración 0230. Actualizado el mismo día tras confirmar
> con el usuario la operación real y los planes gratuitos (`PER-02`, `PRO-06` y el nuevo `DAT-08`).
> Escalas y etiquetas: [`00-veredicto-y-metodo.md`](00-veredicto-y-metodo.md).

## Conteo

| Severidad | Cantidad | Bloquean el móvil («Sí») |
|---|---|---|
| **Crítico** (para el móvil) | 1 (`ARQ-07`) | 1 |
| **Alto** | 22 | 9 |
| **Medio** | 18 | 1 |
| **Bajo / Bajo-Medio** | 7 | 0 |
| **Total** | **48** | **11** |

Además hay **13 hallazgos que bloquean «Parcial»** (se puede publicar con una mitigación).

---

## Orden de ataque propuesto

No es un cronograma: es **qué depende de qué**. El plan de fases está en
[`../05-arranque/03-plan-de-ejecucion.md`](../05-arranque/03-plan-de-ejecucion.md).

### Ola A · Ahora: son de la operación real de hoy y no esperan a la app

Con **operación real** y **planes gratuitos**, estos cinco trabajos reducen riesgo **hoy**, no dependen del móvil y son
pequeños. Detalle y comprobaciones: [`../05-arranque/02-planes-region-y-mejoras-rapidas.md`](../05-arranque/02-planes-region-y-mejoras-rapidas.md) §5.

| # | Trabajo | Hallazgos | Coste |
|---|---|---|---|
| A.1 | **Copias de seguridad**: Supabase Pro, o como mínimo un volcado nocturno cifrado | PRO-06 | US$ 25/mes · gratis |
| A.2 | **Funciones de Vercel a `pdx1`**, junto a la base (`us-west-2`) | PER-02 | gratis |
| A.3 | **Podar `cron.job_run_details`** (conservar 7 días) | DAT-08 | gratis |
| A.4 | **Cerrar `send-push`** a la clave pública | SEC-01 / NOT-04 | gratis |
| A.5 | **Vercel Pro** (uso comercial) | PRO-06 | US$ 20/mes |

### Ola 0 · Bloqueadores: antes del primer *build* de tienda

Sin esto no se debe publicar. Están ordenados por dependencia, no por importancia.

| # | Trabajo | Hallazgos | Por qué va en este orden |
|---|---|---|---|
| 0.1 | **Generalizar `source = 'customer_pwa'`** y añadir `client_platform`/`client_app_version` | ARQ-08 | Es una migración pequeña que, si se olvida, **desactiva reglas en silencio** para los pedidos nativos. Hacerla primero. |
| 0.2 | **Superficie móvil explícita + política de compatibilidad + `GET /config`** (versión mínima por plataforma, *flags*) | ARQ-01, ARQ-07, MOB-02 | Define **qué** se construye y **cómo** puede cambiar después. (Versión mínima: `04-decisiones-abiertas.md` §3.1.) |
| 0.3 | **Contrato OpenAPI** con respuestas y **códigos de error de dominio** | ARQ-02, DAT-02, MOB-01 | Sin esto no se pueden generar los clientes Swift/Kotlin ni bifurcar la UI por error. |
| 0.4 | **Registro de dispositivos + *outbox* real + push nativo (APNs/FCM) + preferencias y consentimiento** | NOT-01, NOT-02, NOT-05, NOT-06, MOB-03 | Es lo que resuelve «avisos que no llegan» y desbloquea el marketing. **También es lo primero que necesita la app de Negocios.** |
| 0.5 | **Borrado de cuenta + Sign in with Apple + cumplimiento de tiendas** | SEC-09, MOB-04, MOB-10 | Sin ellos, la revisión de Apple/Google rechaza la app. Requiere decisión de negocio y revisión legal. |
| 0.6 | **Cuentas, claves, firmas y macOS + cadena de compilación** | PRO-08, MOB-16 – MOB-19 | Trabajo de organización con plazos externos (inscripción de desarrollador, revisión de cuentas): **empezarlo cuanto antes** (guía en [`../05-arranque/01-cuentas-y-firmas.md`](../05-arranque/01-cuentas-y-firmas.md)). |

### Ola 1 · Antes de abrir al público

| Trabajo | Hallazgos |
|---|---|
| **Límites de abuso** (Upstash en API, OTP por destino/IP/dispositivo, revocar `get_tracking` a `anon`, App Attest/Play Integrity) | SEC-03, MOB-20 |
| **Idempotencia en toda la superficie móvil** y semántica de reintento correcta | DAT-01, MOB-07 |
| **Latencia**: autenticación local con *claims*, recortar rondas de `POST /customer/orders` (la región, `PER-02`, ya está en la Ola A) | PER-01, PER-03 |
| **Observabilidad** (errores, métricas, alertas, `x-request-id` hasta el evento) | PRO-05, NOT-08, MOB-11 |
| **CI verde y con la suite de integración** + `check:grants` | PRO-01, SEC-02 |
| **Reglas del cliente al servidor** (apertura, franja, métodos de pago, pasos del tracking) o vectores de conformidad | ARQ-03 |
| **Configuración de Auth como código** | SEC-08 |
| **Retención de datos e inventario de PII** | DAT-06 |
| **Identidad: teléfono como identidad de primera clase y flujo de recuperación** | DAT-03 |

### Ola 2 · Después del lanzamiento

| Trabajo | Hallazgos |
|---|---|
| **Campañas de marketing** (segmentos, programación, tope de frecuencia, métricas) | NOT-07 |
| **Tiempo real por pedido** (*Broadcast*/Live Activities) y retirar `postgres_changes` del cliente | PER-04, PER-05, MOB-12 |
| **Simplificar asíncronos** (un outbox, un motor de plazos) | ARQ-06 |
| **Dominio ordenado** (esquema versionado, `advance_order` por acción) | ARQ-04, PRO-03 |
| Vistas de lectura por rol / `orders` | ARQ-05 |
| Higiene: SEC-04..07, SEC-10, DAT-04, DAT-05, DAT-07, PER-06, PER-07, PRO-02, PRO-04, PRO-07 | — |

---

## Tabla completa

**Bloquea:** S = Sí · P = Parcial · N = No. **Esf.:** S ≤ 2 d · M ≤ 2 sem · L > 2 sem.

| ID | Hallazgo | Sev. | Bloq. | Esf. | Doc |
|---|---|---|---|---|---|
| ARQ-01 | Dos APIs (REST + Supabase directo), solo una en el contrato | Alto | S | L | [01](01-arquitectura-y-contrato.md) |
| ARQ-02 | Sin OpenAPI ni esquemas de respuesta | Alto | S | M | 01 |
| ARQ-03 | Reglas del cliente en TypeScript (copias ×4) | Alto | P | M | 01 |
| ARQ-04 | Dominio en 245 KB de PL/pgSQL; 36 migraciones por función | Alto | N | L | 01 |
| ARQ-05 | `orders`: 98 columnas, 9 triggers, sensibles y públicos juntos | Medio | N | S/L | 01 |
| ARQ-06 | Cinco mecanismos asíncronos; plazos por duplicado | Alto | P | M-L | 01 |
| ARQ-07 | Sin política de compatibilidad ni versión mínima | **Crítico** | S | M | 01 |
| ARQ-08 | `customer_pwa` grabado en reglas y CHECK | Alto | S | S-M | 01 |
| PER-01 | 2 rondas de autenticación por petición (~0,27 s) | Alto | N | S-M | [02](02-rendimiento-y-latencia.md) |
| PER-02 | Función en `iad1` y base en `us-west-2` (confirmado); ronda a base ≈ 0,13 s | Alto | N | S / L | 02 |
| PER-03 | Crear pedido = 11-17 rondas (≈ 2-3 s) | Alto | N | M | 02 |
| PER-04 | Sondeo de 8 s / 15 s / 1 min por todas partes | Medio | N | M | 02 |
| PER-05 | 65 % del tiempo de base es Realtime `postgres_changes` | Medio | N | M | 02 |
| PER-06 | 63 políticas permisivas múltiples, 30 FK sin índice, 13 sin uso | Bajo | N | S-M | 02 |
| PER-07 | `send-push` serial, arranque en frío, sin métricas | Medio | P | M | 02 |
| NOT-01 | Outbox de push a fondo perdido: 0 de 5 620 publicados | Alto | S | M | [03](03-notificaciones.md) |
| NOT-02 | Modelo solo Web Push; 0 clientes iOS registrados | Alto | S | M | 03 |
| NOT-03 | Sin TTL ni urgencia en los envíos | Medio | N | S | 03 |
| NOT-04 | = SEC-01 | Medio | P | S | 03 |
| NOT-05 | Textos y lógica de aviso en la Edge Function; forma Web Push; tags > 64 B | Medio | S | M | 03 |
| NOT-06 | Sin preferencias, consentimiento ni segmentación | Alto | S | M | 03 |
| NOT-07 | Sin infraestructura de campañas | Alto | N | L | 03 |
| NOT-08 | Sin métricas de entrega ni acuse del cliente | Alto | P | M | 03 |
| SEC-01 | `send-push` acepta la *anon key* pública | Medio (Alto con marketing) | P | S | [04](04-seguridad.md) |
| SEC-02 | 31 funciones `SECURITY DEFINER` ejecutables; sin chequeo en CI | Medio | N | S | 04 |
| SEC-03 | Sin *rate limiting*; SMS/OTP explotable por coste | **Alto** | P | S-M | 04 |
| SEC-04 | Tracking público expone apellido y teléfono del motorizado | Medio | N | S | 04 |
| SEC-05 | Comprobantes mutables; bucket sin límites | Bajo-Medio | N | S | 04 |
| SEC-06 | Impersonación de admin sin auditoría ni MFA | Medio | N | S | 04 |
| SEC-07 | Sin protección de contraseñas filtradas | Bajo | N | S | 04 |
| SEC-08 | Config de Auth/Realtime no versionada | Medio | P | S | 04 |
| SEC-09 | **Sin borrado de cuenta** | **Alto** | **S** | M | 04 |
| SEC-10 | Menores (CORS, `credentials`, `anonKey`, `prepay-proof`, GPS) | Bajo | N | S | 04 |
| DAT-01 | Idempotencia en 4 de 49 rutas; reintentos engañosos; clave atascable | Alto | P | M | [05](05-datos-y-consistencia.md) |
| DAT-02 | Errores de negocio sin código estable | Alto | **S** | M | 05 |
| DAT-03 | Tres modelos de identidad sin unificar | Medio | P | M | 05 |
| DAT-04 | Tres almacenes de direcciones; tipos numéricos mezclados | Medio | N | M | 05 |
| DAT-05 | Estado mutado fuera de la máquina de estados | Bajo-Medio | N | S | 05 |
| DAT-06 | Sin política de retención de datos personales | Medio | P | M | 05 |
| DAT-07 | Parámetros documentados ≠ vivos | Bajo | N | S | 05 |
| DAT-08 | Registro de `pg_cron` sin poda: 79 % de la base (117 MB) | Medio | N | S | 05 |
| PRO-01 | CI rojo en `check:ds`; 307 casos de integración fuera de CI | Alto | N | M | [06](06-proceso-calidad-y-operacion.md) |
| PRO-02 | Despliegue en 3 pasos; sin *staging* verificado; sin flags | Medio | P | M | 06 |
| PRO-03 | Migraciones como único historial; sin volcado de esquema | Medio | N | M | 06 |
| PRO-04 | Documentación de estado contradice la realidad (13 casos) | Medio | N | S | 06 |
| PRO-05 | Sin rastreador de errores, APM ni métricas | Alto | P | S-M | 06 |
| PRO-06 | Planes gratuitos con operación real: sin copias de seguridad y Vercel Hobby no comercial | **Alto** | P | S | 06 |
| PRO-07 | Código y datos vestigiales | Bajo | N | S | 06 |
| PRO-08 | No existe la cadena de compilación y publicación móvil | Alto | **S** | M | 06 |
