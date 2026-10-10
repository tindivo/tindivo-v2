# 00 · Resumen ejecutivo

> **Lee esto primero.** Todo lo demás es el respaldo. Medido el **2026-09-20** sobre `HEAD 09749a4` y la
> base `tindivo-prod` (migración 0230). Decisión de partida: **dos apps nativas, Swift y Kotlin**.
> **Actualizado el mismo día** con tus respuestas (ver «Novedades»): Customer en Android e iOS a la vez y
> **Negocios (cajera) en Android como lo más urgente**.

## Lo que pediste y dónde está

| Pediste | Dónde |
|---|---|
| **Análisis en profundidad de las deficiencias del backend** (malas prácticas, cuellos de botella, si la arquitectura es adecuada) | [`02-auditoria-backend/`](02-auditoria-backend/00-veredicto-y-metodo.md): **48 hallazgos** con evidencia, severidad y esfuerzo, y una **preparación móvil** de 21 capacidades |
| **Listar todas las funcionalidades actuales**, con un formato elegido por mí, marcando lo que **no** irá al móvil | [`03-requisitos/`](03-requisitos/00-formato-y-convenciones.md): **324 requisitos y capacidades** con ID estable; el Customer a nivel de especificación (140), lo demás por capacidad |
| Entender el **estado actual** antes de migrar | [`01-sistema-actual/`](01-sistema-actual/01-mapa-del-sistema.md): mapa, modelo de datos, API, estados y plazos, notificaciones |
| Todo centralizado en `docs/customer_app_migration` | Esta carpeta |
| *(nuevo)* Cómo crear las **cuentas de tienda** y por dónde empezar | [`05-arranque/`](05-arranque/03-plan-de-ejecucion.md): cuentas y firmas, planes y región, plan de ejecución |

## Novedades del 2026-09-20 (tras tus respuestas)

**Lo que quedó decidido:**

| Tema | Decisión | Efecto |
|---|---|---|
| ¿Es operación real? | **Sí**, desde hace 1 mes y 5 días | Compatibilidad hacia atrás y cambios fuera de 18:00-23:00. Corrige mis notas del 2026-09-10 |
| Mac | **Tienes** | iOS se escribe y depura ahí; falta modelo y macOS para **Xcode 26** |
| Cuentas | **Apple:** la creas ahora · **Google Play:** por crear | Guía paso a paso: [`05-arranque/01-cuentas-y-firmas.md`](05-arranque/01-cuentas-y-firmas.md) |
| Customer | **Android e iOS, lanzados a la vez** | Android se construye primero e iOS lo sigue de cerca; el lanzamiento es el mismo día |
| Negocios (cajera) | **Sube de prioridad: solo Android, y es lo más urgente** | Primer carril de app. iOS de Negocios queda fuera por ahora |
| Planes | **Gratuitos** (Supabase y Vercel); regiones EE. UU. | Regiones confirmadas (abajo) y **Ola A** |
| Lo legal | Solo tú, sin abogado | Textos estándar ahora, revisión profesional más adelante; no bloquea el arranque |

**Lo nuevo que salió al verificar (léelo antes de nada):**

1. **Tu base y tu API están en costas opuestas de EE. UU.** (Oregón `us-west-2` frente a Virginia `iad1`): eso explica
   ≈ 0,13 s por cada consulta y del orden de 1-2 s de cada pedido. **Se arregla gratis** moviendo las funciones a `pdx1`
   (`PER-02`).
2. **No tienes copias de seguridad.** El plan gratuito de Supabase no las incluye y `Docs/13-deploy` dice lo contrario
   (`PRO-06`). Con dinero registrado en la base, es lo primero a cubrir.
3. **Vercel Hobby no permite uso comercial** (`PRO-06`): riesgo de suspensión el día menos pensado.
4. **El registro de `pg_cron` es el 79 % de tu base** (117 de 148 MB) y crece 2,1 MB al día: en el plan gratuito
   llegarías al tope de 500 MB hacia febrero-marzo de 2027 (`DAT-08`).
5. **Google Play** exige a las cuentas personales nuevas **12 testers durante 14 días, por app**, antes de publicar al
   público: es el **camino crítico** de Customer. **Negocios no lo necesita** (va por la pista interna).
6. **Negocios en Android no cubre a todos:** entre los usuarios de negocio con push hay 2 en Android, 3 en Windows,
   2 en Mac y 1 en iPhone (por dispositivo; una persona puede tener varios). Los de escritorio y el iPhone seguirán
   con la web.

**Lo que necesito de ti ahora:**

1. **Mac:** modelo, año y versión de macOS (para saber si aguanta Xcode 26).
2. **Cuentas:** crear hoy **Google Play** y **Apple** (guía en `05-arranque/01`) y reunir **15-20 testers** con Android.
3. **Planes:** ¿subes **Supabase Pro** (US$ 25) y **Vercel Pro** (US$ 20) antes del lanzamiento público? Mientras tanto,
   la Ola A mínima es gratis: región, poda y un volcado nocturno (`D-37`).
4. **Contrato:** ¿te parece bien la **versión mínima** y no la fachada completa? (`04-decisiones-abiertas.md` §3.1)
5. **Orden:** ¿confirmas **Negocios Android primero** y Customer después? (`D-35`)

## Veredicto en cinco líneas

1. **No hay que reescribir el backend: hay que envolverlo y endurecerlo.** Su dominio (dinero, estados,
   antifraude, plazos) es valioso y está bien pensado; es lo más difícil de rehacer.
2. **Rendimiento no es el problema; latencia y contrato sí.** La base usó 8,7 h de CPU en 58 días y el
   65 % es el propio Realtime. Pero cada petición autenticada pierde ~0,27 s antes de empezar, crear un
   pedido encadena 11-17 rondas (≈ 2-3 s; cada una cruza el país por `PER-02`), y la «API» real es el esquema
   de la base: **una app publicada en la tienda no puede convivir con eso**.
3. **Tu dolor de «avisos que no llegan» no es de entrega, es de alcance:** el 99,95 % de los envíos se
   acepta, pero **solo 11 de 77 clientes tienen un dispositivo registrado y ninguno es iPhone**. La causa
   es Web Push; el remedio es APNs/FCM + Live Activities + un *outbox* de verdad.
4. **Seguridad: sin críticos explotables hoy**, con una base sólida (RLS 45/45). Lo más serio: **no hay
   *rate limiting*** y **no hay borrado de cuenta** (las tiendas lo exigen).
5. **El canal de cliente es el 13,5 % de los pedidos** (operación real de 1 mes y 5 días); la cajera teclea el
   86 %. La app móvil de cliente solo cambia el negocio si **desplaza** ese tecleo: por eso importan tanto la
   instalación, los avisos y la precisión de la dirección. Y por eso **la app de la cajera es lo más urgente**.

## Tus cuatro dolores → qué encontré → qué los resuelve

| Dolor | Qué encontré (medido) | Qué lo resuelve | Dónde |
|---|---|---|---|
| **Avisos que no llegan** | 0 de 5 620 eventos marcados como publicados; envío *fire-and-forget*; modelo Web Push; 14 % de clientes con dispositivo; 0 en iPhone; sin TTL/urgencia | Registro de dispositivos + *outbox* real + APNs/FCM con prioridad y caducidad + Live Activity + acuse | `NOT-01…08`, `NAT-PSH`, `NAT-LIV` |
| **No puedo hacer push de marketing** | No existe consentimiento, preferencias, segmentos ni campañas; `send-push` es serial y acepta la *anon key* | Consentimiento (App Store 4.5.4) + preferencias + servicio de campañas + cerrar `send-push` | `NOT-06/07`, `SEC-01`, `NAT-CON`, `NAT-MKT` |
| **No saben bajar una PWA / no conocen la web** | En iPhone Web Push exige instalar la PWA (el código lo admite); banners fijos en el código | Estar en las tiendas + enlaces universales + *banner* + QR del mostrador | `NAT-LNK`, `MOB-05/15` |
| **Direcciones inexactas** | El pin sale del navegador; GPS falsificable sin root; tres almacenes de direcciones | GPS nativo (precisión, aproximada, *mock*) + mapa nativo + un solo modelo de direcciones | `NAT-LOC`, `NAT-FRD`, `DAT-04` |
| **Lentitud** | ~0,47 s de suelo, +0,13 s por ronda a la base porque la **función está en `iad1` (Virginia) y la base en `us-west-2` (Oregón)** | Funciones a `pdx1` (gratis), JWT local + *claims*, una RPC por acción, HTTP/2 nativo, caché local | `PER-01…03`, `NAT-OFF` |

## Los 11 bloqueadores para publicar (de 48 hallazgos)

Sin resolverlos no se debe enviar el primer *build* a las tiendas (detalle y orden en
[`02-auditoria-backend/registro-de-hallazgos.md`](02-auditoria-backend/registro-de-hallazgos.md)):

| # | Bloqueador | ID |
|---|---|---|
| 1 | Sin política de **compatibilidad** ni versión mínima (`426`) | `ARQ-07` **(Crítico)** |
| 2 | Dos APIs (REST + Supabase directo): definir **una superficie móvil** | `ARQ-01` |
| 3 | Sin **OpenAPI** ni esquemas de respuesta | `ARQ-02` |
| 4 | Errores de negocio sin **código estable** | `DAT-02` |
| 5 | `source = 'customer_pwa'` en reglas y CHECK: un canal nativo **se salta las reglas** | `ARQ-08` |
| 6 | *Outbox* que no publica y sin reintentos | `NOT-01` |
| 7 | Solo Web Push: **registro de dispositivos y APNs/FCM** | `NOT-02` |
| 8 | Sin **preferencias ni consentimiento** | `NOT-06` |
| 9 | Textos y payload de aviso con forma Web Push; *tags* > 64 B | `NOT-05` |
| 10 | **Sin borrado de cuenta** | `SEC-09` |
| 11 | Sin **cadena de compilación móvil** (macOS, firmas, CI) | `PRO-08` |

Además: **ahora** (Ola A, no depende del móvil) copias de seguridad, región de las funciones, poda del registro de
`pg_cron`, cerrar `send-push` y Vercel Pro; y antes de abrirlo al público (Ola 1) *rate limiting*, idempotencia en
toda la superficie, latencia, observabilidad y CI verde con la suite de integración.

## Qué replicar y qué no (catálogo de requisitos)

**324 entradas**: Customer 140 · Negocios 40 · Motorizados 21 · Admin 24 · Servidor 41 · Nativo nuevo 58.

| Disposición | Cantidad | Qué significa |
|---|---|---|
| **IGUAL** | 119 | Se replica tal cual (dominio del negocio) |
| **ADAPTAR** | 43 | Se replica con la capacidad nativa (push, GPS, mapa, cámara, sesión) |
| **SOLO-WEB** | 36 | **No va al móvil** (PWA, SEO, admin, impresión…) |
| **DIFERIR** | 54 | Después del primer lanzamiento (negocios, motorizados) |
| **MUERTO** | 2 | Código vestigial (muro del piloto, hook sin uso) |
| **NUEVO** | 70 | No existe hoy: borrado de cuenta, Apple, campañas, Live Activities… |

Del Customer (140): **85 IGUAL, 33 ADAPTAR, 9 SOLO-WEB, 10 NUEVO**. **26 requisitos ★** son críticos de
paridad (dinero, antifraude, estados, plazos): iOS y Android deben decidir **exactamente igual**, con
criterios de aceptación y vectores de conformidad. La lista de lo que **no** se migra está en
[`matriz-disposicion-movil.md`](03-requisitos/matriz-disposicion-movil.md) §5.

**Cambio por `D-30`:** las filas de `NEG-negocios.md` que hoy dicen «DIFERIR · M3» y entran en el primer alcance de
Negocios Android (`05-arranque/03-plan-de-ejecucion.md` §7) pasan a ejecutarse **antes** que Customer M2. Se reclasificarán
al escribir la especificación de Negocios (paso **N0**); la matriz generada aún refleja la clasificación anterior.

## Plan (dependencias, no un cronograma)

Detalle, tamaños y criterios de «hecho» en [`05-arranque/03-plan-de-ejecucion.md`](05-arranque/03-plan-de-ejecucion.md):

```
HOY ──► A  Ola A: copias · región pdx1 · poda de cron · cerrar send-push · Vercel Pro
    ──► O  Organización: Google Play → Apple → Firebase → 15-20 testers → páginas públicas   (plazos externos)
         │
         ├─ B1 avisos nativos ─► N0 especificación ─► N1 Negocios Android ─► N2 piloto ─► 4 negocios ─► N3 resto
         │
         ├─ B2 contrato mínimo ─┐
         ├─ B3 tiendas ─────────┼─► C1 Customer Android ─► C3 pruebas cerradas ─► C4 lanzamiento conjunto ─► C5 M2
         └─ B4 apertura pública ┘        └───────► C2 Customer iOS ──────┘
                                                                                     M  Motorizados (después)
```

**Camino crítico de Customer:** la prueba cerrada de Google (≥ 12 testers × 14 días) y su solicitud de producción
(≤ 7 días): **de 3 a 5 semanas desde la primera versión usable**. Por eso se abre la pista cerrada con la primera
versión que sirva y se sigue actualizando. **Negocios no tiene esa espera.**

## Cómo se hizo, y sus límites

- **Grafo de conocimiento actualizado** (`graphify update`: 7 745 nodos) para localizar; después, lectura directa de
  código, funciones SQL vivas y datos reales. La documentación existente se usó **como pista**, no como verdad.
- **Solo lectura.** No se modificó código, ni se aplicó ninguna migración, ni se hizo un commit. Solo se escribió en
  esta carpeta (y `graphify-out/` cambió por la actualización del grafo, sin commitear). Las consultas nuevas del
  día (tamaños, `pg_cron`, actividad, dispositivos de los negocios) también fueron de solo lectura.
- **Una** llamada sin efectos a la Edge Function `send-push` para verificar un hallazgo de seguridad; solo `GET`
  públicos para medir latencia.
- **No se ejecutaron** los tests de integración (escriben en la base) ni hubo Docker durante la auditoría; el remoto
  está una migración por detrás del repo (0230 vs 0231) sin efecto sobre lo medido.
- **Sin acceso a los paneles** de Supabase/Vercel/Apple/Google: la región de Supabase se dedujo del fichero de enlace
  de la CLI y los planes los confirmaste tú; siguen sin verse la configuración de Auth, la salida de datos y los
  límites de Realtime.
- Las **cuotas y requisitos** de las tiendas y de los proveedores se contrastaron el 2026-09-20 con fuentes públicas
  (enlaces al final de cada documento de `05-arranque/`). Cambian con frecuencia.
- **Lo legal** (Ley 29733, políticas de tiendas) es orientación técnica, no asesoría.

## Cómo está organizada la carpeta

| Carpeta | Contenido |
|---|---|
| [`01-sistema-actual/`](01-sistema-actual/01-mapa-del-sistema.md) | Mapa, modelo de datos, API (y la **propuesta de superficie móvil**), estados/plazos, notificaciones |
| [`02-auditoria-backend/`](02-auditoria-backend/00-veredicto-y-metodo.md) | 48 hallazgos en 6 documentos + preparación móvil + registro ordenado |
| [`03-requisitos/`](03-requisitos/00-formato-y-convenciones.md) | Formato, catálogo por app, transversal, nativo nuevo y matriz de disposición |
| [`04-decisiones-abiertas.md`](04-decisiones-abiertas.md) | Lo decidido, lo que falta por decidir, supuestos y riesgos |
| [`05-arranque/`](05-arranque/03-plan-de-ejecucion.md) | Cuentas y firmas, planes y región, plan de ejecución |
| [`anexos/`](anexos/A-superficie-api.md) | Superficie de las 85 rutas, columnas de `orders`, consultas de medición y scripts |
