# 04 · Decisiones, supuestos y riesgos de ejecución

> **Actualizado el 2026-09-20** con tus respuestas. La sección 1 es lo decidido; lo que no me correspondía decidir
> sigue en las secciones 2 y 3, con opciones, una **recomendación** y de qué depende.

## 1. Decidido (registrado)

| # | Decisión | Quién / cuándo | Consecuencias reflejadas en el análisis |
|---|---|---|---|
| D-00 | **Dos apps 100 % nativas: Swift (iOS) y Kotlin (Android).** Capacitor descartado. | Tú, 2026-09-20 | OpenAPI obligatorio, sin reutilizar TypeScript, el catálogo de requisitos es la especificación común (`ARQ-02/03`, `03-requisitos/`) |
| D-01 | **Primero la app de clientes** (Customer). Admin se queda en web. | Tú, 2026-09-20 (admin: mi propuesta) | Fases M1/M2/M3/W. **Matizada por `D-30`**: Negocios pasa por delante |
| D-02 | Todo el análisis vive en `Docs/customer_app_migration/`. | Tú | — |
| D-03 | **`tindivo-prod` es operación real** (1 mes y 5 días a 2026-09-20). | Tú, 2026-09-20 | Compatibilidad hacia atrás obligatoria; cambios fuera de 18:00-23:00; Ola A. **Corrige** mis notas del 2026-09-10 («no hay producción viva») |
| D-04 | **La revisión legal la haces tú** (sin abogado por ahora). | Tú, 2026-09-20 | Textos estándar ahora y revisión profesional más adelante; no bloquea el arranque. Ver `D-23/D-24` |
| D-10 | **Tienes Mac.** | Tú, 2026-09-20 | iOS se escribe y depura ahí; **falta modelo y macOS** para Xcode 26 (`05-arranque/01` paso 0) |
| D-12 | **Customer: Android e iOS se lanzan a la vez.** | Tú, 2026-09-20 | Android se construye primero e iOS lo sigue de cerca con la misma especificación y vectores (lanzar a la vez ≠ construir a la vez): `05-arranque/03` |
| D-13 | **Planes gratuitos** (Supabase y Vercel); regiones EE. UU. | Tú, 2026-09-20 | Regiones confirmadas: base `us-west-2`, funciones `iad1` (`PER-02`). Sin copias y Hobby no comercial (`PRO-06`). Ver `D-37` |
| D-30 | **App de Negocios (cajera): sube de prioridad; solo Android; es lo más urgente.** | Tú, 2026-09-20 | Primer carril de app (N). iOS de Negocios queda fuera por ahora. Ver `D-35` |

## 2. Decisiones abiertas — organización y plazos externos

| # | Decisión | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| D-11 | **Cuentas de tienda**: Apple Developer Program y Google Play Console. | Crear ambas hoy · esperar. | **Hoy.** Apple: la creas ahora (guía paso a paso en `05-arranque/01-cuentas-y-firmas.md`). **Google Play: por crear** y con el **camino crítico** de 12 testers × 14 días por app para Customer. | Fecha del primer lanzamiento |
| D-14 | **Estructura del repositorio** (`MOB-16`). | Proyectos `apps/ios` y `apps/android` en el monorepo · repos separados con la especificación como submódulo. | Monorepo: el spec OpenAPI, los vectores de conformidad y los tokens de diseño viven junto al backend y el CI los valida. | Ritmo de trabajo |
| D-35 | **Orden de construcción.** | Negocios Android primero y Customer después · en paralelo · Customer primero. | **Negocios Android primero** (lo más urgente, 4 usuarios que conoces, pista interna sin la prueba de 12 × 14). El backend (B1-B3) y la organización (O) corren **en paralelo**; Customer arranca al terminar N1, con la pista cerrada abierta cuanto antes. Ver `05-arranque/03`. **Decidido por Jesús el 2026-10-09: Customer primero, Negocios Android después y la mudanza al VPS al final** (`../plan-migraciones/cola.md`) | Plan de fases |
| D-36 | **Quién figura como publicador** en las tiendas. | Persona natural (hoy; tu nombre legal) · organización (empresa + D-U-N-S; semanas; exime de la prueba de 12 testers de Google). | **Persona natural ahora**; ambas tiendas permiten transferir la app a otra cuenta más adelante (con condiciones). | Fecha del primer lanzamiento |
| D-37 | **Subir a planes de pago** (`PRO-06`). | Supabase Pro (US$ 25/mes) y Vercel Pro (US$ 20/mes) · quedarse en gratuito con el mínimo de la Ola A. | **Subir ambos antes del lanzamiento público** (copias de seguridad y términos de uso comercial). Hoy, el mínimo gratis: funciones a `pdx1`, poda de `pg_cron` y un volcado nocturno cifrado. | Fiabilidad y cumplimiento |

## 3. Decisiones abiertas — producto y arquitectura

| # | Decisión | Opciones | Recomendación | Depende / bloquea |
|---|---|---|---|---|
| D-20 | **Dónde vive el dominio** (`ARQ-04`). | A: base de datos (lo actual, ordenado: esquema declarativo, una función por acción, tests en CI). B: TypeScript con RPC finas. | **A, y no ahora**: conserva lo probado y es higiene de la Ola 2, no un bloqueador. | `ARQ-04` |
| D-21 | **Superficie que consume la app** (`ARQ-01`). | A: Supabase directo (SDK de Swift/Kotlin). B: fachada REST completa (`03-superficie-api.md §4`). **C: mixto mínimo.** | **C**: lecturas simples y tiempo real directos con RLS; **escrituras con reglas** por REST/RPC **versionadas**; más `GET /config`. Ver §3.1 | Bloquea el primer *build* de Customer |
| D-22 | **Identidad del cliente** (`DAT-03`). | Mantener Google + correo y **añadir Apple** · hacer del **teléfono verificado** una identidad de primera clase (OTP como método de acceso) · retirar correo+contraseña en nativo. | Añadir Apple + Google nativo + **flujo de recuperación** cuando el teléfono ya existe en otra cuenta; decidir sobre contraseña con los números de uso (22 de 86 cuentas). | `CUS-AUT-*` |
| D-23 | **Política de borrado de cuenta** (`SEC-09`). | Anonimización con retención mínima del vínculo antifraude (hash del teléfono) · borrado total. | Anonimización; los plazos de retención los decides tú (`D-04`); una revisión profesional puntual sería lo ideal (Ley 29733). | Bloquea la publicación |
| D-24 | **Consentimiento y marketing** (`NAT-CON`). | Texto, categorías, edad mínima, horas de silencio, frecuencia máxima. | Empezar por `order_updates` (no comercial) y añadir `promotions` tras M1; texto estándar y revisión más adelante (`D-04`). | `NAT-MKT-001` |
| D-25 | **Motor de notificaciones** (`NOT-01/05/07`). | FCM + APNs **directos** desde un *worker* propio · servicio gestionado para campañas (OneSignal, etc.). | **Directo para lo transaccional** (control de fiabilidad y prioridad); evaluar un servicio gestionado **solo para campañas** si construir segmentos y programación cuesta más de lo que vale. | `NAT-PSH`, `NAT-MKT` |
| D-26 | **Proveedor de mapas nativo** (`NAT-LOC-002`). | iOS: MapKit. Android: Google Maps SDK · MapLibre con teselas propias. | MapKit + Google Maps SDK; **comprobar la calidad del satélite en San Jacinto** antes de fijar. Las teselas de OSM/CARTO de la web **no** deben usarse en una app publicada. | `CUS-ADR-008` |
| D-27 | **Alcance de la web cuando exista la app** (`MOB-15`). | Apagar la PWA · dejarla como respaldo de enlaces, tienda y borrado de cuenta. | **Respaldo** (no apagar). Para Negocios, además, la web sigue siendo la vía de los usuarios de escritorio y de iPhone. | `CUS-WEB-007` |
| D-28 | **Sistema de diseño en nativo** (`MOB-21`). | Iconos: Material Symbols en ambas · SF Symbols en iOS + Material en Android. Modo oscuro sí/no. | Exportar los **tokens** (color, radio, tipografía Geist/JetBrains Mono) como JSON; SF Symbols en iOS; modo oscuro **fuera de M1**. | Diseño de M1 |
| D-29 | **Versiones mínimas de SO** y presupuesto de dispositivo. | iOS 16.1+ (Live Activities) o 17+ · Android 8 (API 26) o superior. | Decidir con **datos reales de dispositivos** de la PWA (`@vercel/analytics` en el Customer) y con el móvil gama baja que se quiera soportar. `targetSdk` = 36 (obligatorio en Play desde el 2026-08-31). | Alcance de `NAT-LIV` |
| D-31 | **Referencia mínima de dirección** (`CUS-ADR-001`). | 5 (código) · 15 (`DECISIONS.md §13`). | Decidir con la cajera/motorizados qué referencia sirve a la puerta; el número debe vivir en **una** fuente (⚙). | Validaciones |
| D-32 | **Formato del código de pedido**: `#TND-` (oficial) vs `#TDV-` (mensajes de WhatsApp). | — | Unificar en `#TND-`. | Textos |
| D-33 | **Canal del pedido nativo** (`ARQ-08`). | Renombrar `customer_pwa` · conservarlo y añadir `client_platform` (`ios`/`android`/`web`). | **Conservar y añadir columnas**; generalizar los CHECK con un predicado. | Antes del primer *build* |
| D-34 | **Quién financia cupones/promos** (`NAT-MKT-003`). | Tindivo · el negocio. | Depende del modelo económico (Tindivo no retiene fondos). | `NAT-MKT-003` |

### 3.1 Tu pregunta: «¿lo ves muy necesario? ¿es buena práctica? ¿es un estándar?»

**Respuesta corta:** el **principio** sí es estándar y no es negociable; la **fachada completa** que propuse, no.
Te recomiendo la **versión mínima**.

**Lo que sí es estándar en la industria (y por qué).** Una app instalada **no se actualiza cuando tú despliegas**: hay
versiones viejas vivas durante meses (a diferencia de tu PWA, que se actualiza sola). Por eso toda app móvil seria tiene
un **contrato estable, versionado y documentado** con su servidor, una **versión mínima** con pantalla de «actualiza la
app», **errores con código estable** y las reglas de dinero y de estado decididas **en el servidor**. Sin esto, la primera
vez que cambies una columna o una función de la base, **las apps ya instaladas se rompen y no puedes arreglarlas con un
despliegue**: hay que esperar la revisión de la tienda (días) mientras los clientes ven errores.

**Lo que no es obligatorio:** que ese contrato sea *una capa REST nueva y separada*. Hay tres formas válidas:

| Opción | Cómo es | Ventaja | Coste | En Tindivo |
|---|---|---|---|---|
| **A · Supabase directo** (SDK de Swift/Kotlin) | La app habla con PostgREST, RPC y Realtime | Menos código y menos latencia (sin salto extra) | **El esquema y las RPC pasan a ser tu API pública**: cada cambio debe ser compatible hacia atrás durante meses | Ya es la mitad del sistema hoy (103 accesos directos en `negocios`, 48 en `customer`) |
| **B · Fachada REST completa** (`/api/mobile/v1`) | Toda lectura y escritura por endpoints propios | Control total: versionado, validación, límites, idempotencia, observabilidad | Otra capa que escribir y mantener; un salto más (suelo de ~0,47 s hoy) | La propuesta original |
| **C · Mixto mínimo** *(recomendada)* | Lecturas simples y tiempo real **directos** con RLS; **escrituras con reglas** (crear/cancelar pedido, pagos, borrado de cuenta, dispositivos) por REST/RPC **versionadas**; más `GET /config` | Contrato estable **donde importa** (dinero, estados) sin reescribirlo todo | Disciplina: congelar lo que la app lee directo (vistas o RPC estables, no tablas) | Lo que el sistema ya hace, con reglas |

**Qué es «la versión mínima» (lo que hay que tener antes del primer *build* público):**
1. Cabeceras `X-Client-Platform/Version/Build` en toda petición.
2. `GET /config`: versión mínima por plataforma, *kill switch*, *flags* y los parámetros ⚙ (la app no lleva números escritos).
3. `426 Upgrade Required` y una pantalla de «actualiza la app».
4. **Códigos de error estables** (`code`) en las rutas y RPC que usa la app, en vez de frases en español.
5. **OpenAPI** de esas rutas, generado a partir de los Zod que ya existen, para generar los clientes de Swift y Kotlin.
6. Generalizar `source = 'customer_pwa'` (`ARQ-08`, `D-33`).
7. Congelar como contrato lo que la app lee directo: vistas o RPC estables, no tablas.

**Lo que se difiere** hasta que una **medición** diga que hace falta: el agregador `GET /home`, los `/me/*` completos, el
canal *Broadcast* por pedido y la reescritura de `advance_order` por acción (`D-20`).

**Por qué a Negocios le basta menos:** son 4 negocios que conoces y puedes exigir actualizar por WhatsApp; con los
puntos 1-4 alcanza. **Customer exige lo estricto**: es público, se instala sin que sepas quién y pasa por la revisión
de la tienda.

## 4. Supuestos que hice (corrígeme si alguno es falso)

1. **La documentación es pista, no verdad.** Donde `DECISIONS.md`/`Docs/` contradicen al código o a la
   base, manda lo medido (13 casos en `PRO-04`).
2. **Resuelto (`D-03`): es operación real.** Los datos ya lo sugerían: 716 pedidos en 43 de los 44 días desde el
   2026-08-08 (≈ 17 por día activo; 25 en las últimas 24 h; 663 entregados; 619 tecleados por la cajera), **386
   teléfonos distintos** (254 piden una sola vez, 12 cinco veces o más), 231 filas en `cash_settlements`, 16 en
   `restaurant_payments`, 1 308 en `business_charges` (consulta de solo lectura contra `tindivo-prod`, 2026-09-20;
   `anexos/C-consultas-de-medicion.md`).
3. **Las medidas de latencia salen del equipo de trabajo** (nueva conexión TLS en cada llamada; conexión al borde de
   Cloudflare de 0,22-0,50 s). Sirven para el orden de magnitud y para comparar, no como línea base final.
4. **Admin se queda en web** (nada en `ADM-*` va a móvil).
5. **Sin acceso a los paneles** de Supabase, Vercel, Inngest, Twilio, Apple y Google: la región de Supabase se dedujo
   del fichero de enlace de la CLI (`us-west-2`) y los planes los confirmaste tú; siguen sin verse la configuración
   de Auth, la salida de datos y los límites de Realtime.
6. **No se ejecutaron los tests de integración** ni se tocó ninguna base con escritura.
7. **Los textos legales** (privacidad, términos, consentimiento) los revisarás tú (`D-04`); lo aquí dicho sobre
   Ley 29733 y políticas de tiendas es orientación técnica, no asesoría legal. Las guías de Apple y Google cambian:
   hay que contrastarlas al enviar.
8. **Tu Mac aguanta Xcode 26** (macOS Sequoia 15.6 o Tahoe 26.2 según la versión de Xcode): sin confirmar. Necesito el
   modelo, el año y la versión de macOS.
9. **Las cajeras que usarán Negocios tienen teléfono o tablet Android.** Los datos lo matizan: entre los usuarios de
   negocio con push hay **2 en Android, 3 en Windows, 2 en Mac y 1 en iPhone** (suscripciones por dispositivo; una
   persona puede tener varios). Comprobar con los 4 negocios qué usan **durante la noche**; quien use escritorio o iPhone
   seguirá con la web.
10. **Motorizados sin decisión.** 3 de sus 4 usuarios con push usan iPhone: a diferencia de Negocios, ahí iOS sí
    importaría.

## 5. Riesgos de ejecución (no para reabrir D-00, sino para gestionarlo)

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **Dos bases de código nativas (y una tercera, Negocios) con una sola persona** | El coste se duplica y las apps divergen | Especificación única (`03-requisitos/`), OpenAPI, **vectores de conformidad**, tokens de diseño compartidos; **un carril de app a la vez**, iOS desfasado de Android (`05-arranque/03`) |
| **iOS exige macOS y Xcode 26** | Sin un Mac compatible no hay iOS | `D-10`: confirmar modelo y versión; trabajo de Android y de backend sin bloqueo mientras tanto |
| **El backend cambia más rápido que las apps publicadas** | Una versión vieja deja de poder pedir | Política de compatibilidad + versión mínima + `426` **antes** del primer envío (`ARQ-07`) |
| **Plazos externos** (cuentas de desarrollador, revisión de tiendas, **12 testers × 14 días por app en Google**) | No dependen del código | Abrir las cuentas ya; reclutar 15-20 testers; abrir la pista cerrada con la primera versión usable (`05-arranque/01`) |
| **Planes gratuitos con operación real** | Sin copias de seguridad; Hobby no comercial; tope de 500 MB por el registro de `pg_cron` | Ola A antes que cualquier otra cosa (`05-arranque/02`) |
| **Reglas de negocio en cuatro sitios** | Iguales en la teoría, distintas en la práctica | Mover al servidor lo que dependa de hora/config/estado (`ARQ-03`); vectores para lo demás |
| **Notificaciones: el efecto depende de cuántos instalen la app** | El techo es la adopción, no la tecnología | Embudo web → tienda (`NAT-LNK-*`), QR del mostrador, y medir (`NAT-ANA-002`) |
| **Fabricantes Android que matan procesos o restringen avisos a pantalla completa** | La alarma de la cajera puede no sonar aun siendo nativa | Diseño de N0 con permisos guiados, servicio en primer plano y latido; probar en el móvil real de la cajera |
| **Cajera como canal dominante (86 %)** | Si el móvil de cliente no la desplaza, poco cambia | `D-30` (Negocios primero) y medir la cuota de autoservicio (`ADM-OPE-006`) |
| **Deriva de los documentos** | Ya se ha construido sobre datos falsos antes (incluida la promesa de copias de seguridad) | Este catálogo se regenera y se revalida (`00-formato…`); los números son fotografías del 2026-09-20 |

## 6. Lo que sigue pendiente de ti (por orden de impacto)

1. **`D-10`**: modelo, año y versión de macOS de tu Mac.
2. **`D-11`**: crear hoy la cuenta de **Google Play** y la de **Apple**, y reunir 15-20 testers (`05-arranque/01`).
3. **`D-37`**: ¿subes Supabase y Vercel a Pro antes del lanzamiento público?
4. **`D-21`**: ¿aprobamos la **versión mínima** del contrato (§3.1)?
5. **`D-35`**: ¿confirmas Negocios Android primero y Customer después?
6. **`D-36`**: ¿publicas como persona natural por ahora?
