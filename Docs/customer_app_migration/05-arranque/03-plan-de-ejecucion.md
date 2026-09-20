# 05 · Arranque — 03 · Plan de ejecución v1 (secuencia y dependencias)

> Redactado el **2026-09-20**, con tus respuestas a `04-decisiones-abiertas.md`. Es un plan de **qué va antes de
> qué y por qué**, no un calendario: aún no tengo una medida de velocidad real. Los tamaños son **relativos**
> (S ≤ 2 días · M ≤ 2 semanas · L ≤ 6 semanas · XL > 6 semanas de trabajo efectivo, contigo revisando y yo
> escribiendo) y se recalibran con el primer hito (**N1**), que es pequeño y real. **◦** = por verificar.

## 1. Lo decidido que condiciona el plan

| Decisión (tuya, 2026-09-20) | Consecuencia en el plan |
|---|---|
| **Es operación real** (1 mes y 5 días) | Todo cambio de backend es **aditivo y reversible**, con pruebas de integración y **fuera de 18:00-23:00 Lima**. Las apps web actuales siguen funcionando durante toda la migración |
| Trabajas **solo** (incluye lo legal) | **Un carril de app a la vez**; lo que sí corre en paralelo es la organización externa y el backend |
| Tienes **Mac** | iOS se escribe y depura ahí; falta confirmar modelo y macOS para **Xcode 26** (`01`, paso 0) |
| **Planes gratuitos**; regiones EE. UU. | Se confirmó `us-west-2` (base) e `iad1` (funciones): **Ola A** (`02`) |
| **Customer**: Android e iOS **a la vez** | Un mismo contrato y una misma especificación; **se lanza el mismo día** (ver principio 2) |
| **Negocios (cajera)**: solo **Android**, y es **lo más urgente** | Es el **primer** carril de app (N). iOS de Negocios queda fuera por ahora |

## 2. Principios

1. **Operación real primero.** Nada de reescrituras que no puedan volver atrás. `advance_order` y
   `create_customer_order` (los dos monstruos de la base) solo se tocan con sus pruebas de integración.
2. **Lanzar a la vez no es construir a la vez.** Dentro de cada app se construye **Android primero** y iOS le pisa
   los talones con la **misma especificación y los mismos vectores de conformidad**; el lanzamiento conjunto es una
   fecha, no un trabajo simultáneo (que con una sola persona revisando dobla el coste de coordinar).
3. **Primero el dolor medido:** el aviso que **no suena** (Negocios) y el que **no llega** (Customer, 0 iPhone).
4. **El servidor decide el dinero y los estados** (`ARQ-03`); las apps los muestran. Los ⚙ llegan por `GET /config`.
5. **Medir antes de prometer:** cada hito tiene una medición repetible (`anexos/C-consultas-de-medicion.md`).
6. **Una funcionalidad a la vez, con criterio de aceptación** (`CA-*`), en las dos plataformas.

## 3. Mapa de carriles

```
HOY ──► A  Ola A: copias · región pdx1 · poda de cron · cerrar send-push · Vercel Pro        (días)
    ──► O  Organización: Google Play → Apple → Firebase → 15-20 testers → páginas públicas    (plazos externos)
         │
         ├─ B1 avisos nativos ─► N0 especificación ─► N1 Negocios Android ─► N2 piloto ─► 4 negocios ─► N3 resto
         │                       (la escribo yo)      (pista interna)         La Florencia
         │
         ├─ B2 contrato mínimo ─┐
         ├─ B3 tiendas ─────────┼─► C1 Customer Android ─► C3 pruebas cerradas ─► C4 lanzamiento conjunto ─► C5 M2
         └─ B4 apertura pública ┘        └───────► C2 Customer iOS ──────┘
                                                                                     M  Motorizados (después)
```

## 4. Carril A — Ahora (operación real de hoy)

Detalle, comandos y comprobaciones en [`02-planes-region-y-mejoras-rapidas.md`](02-planes-region-y-mejoras-rapidas.md) §5:
**A.1** copias de seguridad · **A.2** funciones a `pdx1` · **A.3** podar `cron.job_run_details` · **A.4** cerrar
`send-push` · **A.5** Vercel Pro. Tamaño total: **S**. No espera a nada y **reduce el riesgo de todo lo demás**.

## 5. Carril O — Organización (tú; plazos externos)

Guía completa en [`01-cuentas-y-firmas.md`](01-cuentas-y-firmas.md). Orden: **Google Play** (empieza el reloj de
identidad) → **Apple** → **Firebase** → comprobar el Mac → **lista de 15-20 testers** → páginas públicas
(eliminar cuenta, soporte, enlaces universales). Es lo único con **plazos que no controlas**: por eso va primero.

## 6. Carril B — Backend para nativo (yo escribo, tú revisas; siempre aditivo)

| ID | Trabajo | Hallazgos | Lo necesita | Tam. | «Hecho» cuando |
|---|---|---|---|---|---|
| **B1** | **Avisos nativos fiables**: registro de dispositivos (FCM), *outbox* que publica con reintentos, envío FCM v1 con prioridad/TTL/*collapse*, registro de entrega y **acuse**; cerrar `send-push` | `NOT-01/02/03/05/08`, `SEC-01` | **N1** y C | L | Un pedido nuevo **suena con la pantalla bloqueada** en un Android de prueba; sin eventos atascados en el *outbox*; 0 envíos con la clave anónima |
| **B2** | **Contrato mínimo**: cabeceras `X-Client-*`, `GET /config` (versión mínima, *kill switch*, *flags*, ⚙), `426`, **códigos de error estables**, **OpenAPI** de las rutas que usan las apps, generalizar `source` + `client_platform` | `ARQ-07/08/02`, `DAT-02`, `MOB-01/02` | C (y N en versión reducida) | M-L | OpenAPI validado en CI; un cliente de prueba generado en Kotlin y en Swift llama a una ruta real |
| **B3** | **Cumplimiento de tiendas**: borrado de cuenta, preferencias y consentimiento, Apple/Google nativo en Auth, **negocio y cuenta de demostración**, páginas públicas | `SEC-09`, `NOT-06`, `MOB-04/05/10`, `DAT-06` | C | M-L | Lista de `01` §7 en verde |
| **B4** | **Antes de abrir al público**: latencia (JWT local, menos rondas), *rate limiting* y OTP, idempotencia ampliada, observabilidad, CI verde con la suite de integración | `PER-01/03`, `SEC-03`, `DAT-01`, `PRO-05/01` | C (lanzamiento) | L | *p95* de crear pedido en el objetivo; alertas activas; CI verde |

**Sobre tu pregunta de la fachada REST (`D-20/D-21`):** lo que aquí se pide es la **versión mínima** (B2), no la
superficie completa de `03-superficie-api.md §4`. La explicación está en `04-decisiones-abiertas.md` §3.1.

## 7. Carril N — Negocios Android (lo más urgente)

**Por qué va primero:** (i) **619 de 716 pedidos** pasan por ahí; (ii) el dolor «sonó y no lo vi / no sonó» vive
aquí (`NEG-TAB-013`, un `AudioContext` que el navegador suspende); (iii) la audiencia son **4 negocios que conoces**:
puedes exigir la actualización por WhatsApp, así que el riesgo de compatibilidad es bajo; (iv) va por la **pista
interna de Play**, **sin** la prueba de 12 testers × 14 días; (v) valida el motor de avisos (B1) que después reusa Customer.

| Paso | Qué | Tam. | Salida |
|---|---|---|---|
| **N0** | **Especificación de Negocios a nivel de requisito** (yo): subir las 40 capacidades de `NEG-negocios.md` al nivel de `CUS-cliente.md`, con criterios de aceptación, e **inventario de contrato** de sus 103 accesos directos y 18 rutas | M | `NEG-negocios.md` v2 + lista de rutas/RPC que la app usará |
| **N1** | **MVP de la cajera** (propuesta de alcance abajo) sobre la pista interna | L | Instalable en los teléfonos de las cajeras |
| **N2** | **Piloto** en La Florencia (noches), **en paralelo a la PWA** sin doble alarma (el registro de dispositivos decide quién suena); luego los 4 negocios | M | Una semana de noches sin depender de la PWA |
| **N3** | Lo demás (menú, deuda, rendimiento, reseñas…) o se queda en la web | L | Decisión con datos |

**Alcance propuesto de N1** (IDs de `NEG-negocios.md`): **tablero y acciones** `NEG-TAB-001…010` y `012` (aceptar,
rechazar, validar comprobante y por llamada, extender, listo, cerrar recojo, aviso por WhatsApp) · **la alerta de pedido nuevo**
`NEG-TAB-013` (el corazón del carril) · **pedido manual** `NEG-MAN-001…004` **con idempotencia** (`NEG-MAN-006`, hoy
un doble toque duplica) · **apertura y pausa** `NEG-APE-001…002` · **efectivo** `NEG-EFE-001` · sencillo `NEG-CFG-004`.
Se quedan en la web: **imprimir** el ticket (`NEG-TAB-011`) y el PDF de rendimiento (`NEG-REN-002`).

**Ingeniería de la alerta (◦ a verificar en N0):** mensajes FCM de **prioridad alta**; canal de notificación con
sonido de alarma y vibración; permisos guiados (notificaciones, **no molestar**, exención de la optimización de
batería, autoarranque en fabricantes que matan procesos); **servicio en primer plano mientras el turno está abierto**;
indicador de **«canal sano»** con latido del dispositivo (sustituye a `use-channel-health`); respaldo local si el aviso
no llega. Android 14+ restringe los avisos a pantalla completa: puede requerir un permiso manual.

**Criterios de éxito propuestos:** ≥ 99 % de los pedidos nuevos **mostrados en el dispositivo en < 10 s** (medido con
acuse); **0** `pending_acceptance_timeout` atribuibles a «no lo oí»; una noche completa operada solo con la app.

## 8. Carril C — Customer (Android e iOS, lanzamiento conjunto)

| Paso | Qué | Tam. | Depende de |
|---|---|---|---|
| **C1** | **Customer Android (M1)** en Kotlin: los **85 IGUAL + 33 ADAPTAR + 10 NUEVO** de `CUS-cliente.md`, contra el OpenAPI | XL | B1, B2, B3 |
| **C2** | **Customer iOS (M1)** en Swift, **desfasado** de C1, con la misma especificación y vectores de conformidad de los **26 ★** | L-XL | C1 estable, Mac con Xcode 26 |
| **C3** | **Pruebas cerradas**: Google (**≥ 12 testers × 14 días**) y TestFlight externo | — (plazo) | Primera versión usable |
| **C4** | **Lanzamiento conjunto**: enlaces universales, banner en la PWA, QR en el mostrador, consentimiento de avisos | M | C3, B4 |
| **C5** | **M2**: Live Activities, campañas, recompra, accesibilidad, analítica | L | C4 |

**Estrategia del reloj (importante):** la prueba cerrada de Google es **por app** y **lo que cuenta es que los testers
sigan inscritos**. Abre la pista cerrada con la **primera versión usable** (inicio de sesión, ver un negocio, hacer un
pedido en el negocio de demostración) y sigue subiendo versiones a esa misma pista: los 14 días corren mientras
terminas. Así el «después» de C3 se reduce a esperar la respuesta de Google (≤ 7 días por lo general).

## 9. Carril M — Motorizados (después)

No decidido. Dato relevante: **4 de sus 5 suscripciones de push son iPhone**; a diferencia de Negocios, aquí iOS
**sí** importaría. Se decide tras N2.

## 10. Camino crítico y plazos externos

| Plazo | Duración | Fuente |
|---|---|---|
| Activar Apple Developer | 24-48 h (hasta 3 días) | Apple ✔ |
| Verificar identidad en Google Play | unos días | Google ✔ |
| Pista cerrada de Customer | **14 días** con ≥ 12 testers inscritos | Google ✔ |
| Primera revisión de la pista cerrada | hasta ~7 días | ◦ fuente secundaria |
| Solicitud de producción | ≤ 7 días, por lo general | Google ✔ |
| Revisión de App Store / beta externa de TestFlight | 1-2 días | ◦ práctica habitual |

**Lectura:** a Customer le quedan **de 3 a 5 semanas desde la primera versión usable en pista cerrada** hasta el
lanzamiento público en Android, y de 1 a 2 semanas menos en iOS. Cuanto antes exista esa primera versión y antes
estén los 15-20 testers, antes corre el reloj. **Negocios no tiene esa espera.**

## 11. Qué haré a continuación (con tu visto bueno)

1. **N0**: la especificación de Negocios a nivel de requisito y su inventario de contrato (es lo más urgente que
   depende solo de mí).
2. Redactar como **migraciones y cambios propuestos**, sin aplicarlos, `A.3` (poda) y `A.4` (`send-push`), y el diseño de
   **B1** (registro de dispositivos y *outbox* con reintentos) para revisarlo contigo.
3. Volver a medir la latencia **antes y después** de mover la región (`A.2`).

## 12. Riesgos de este plan

| Riesgo | Mitigación |
|---|---|
| **Una sola persona** con tres carriles de app (Negocios Android, Customer Android, Customer iOS) | Un carril de app a la vez; iOS desfasado; especificación única y vectores; recalibrar tamaños tras N1 |
| **Fabricantes Android que matan procesos** o restringen avisos a pantalla completa | Diseño de N0 con permisos guiados, servicio en primer plano y latido; probar en el móvil real de la cajera |
| **Reloj de Google** más largo de lo previsto (testers que se van, rechazo de la solicitud) | 15-20 testers; abrir la prueba cuanto antes; respuestas de calidad en la solicitud |
| **Rechazo de Apple** por cuenta de demostración o negocio «cerrado» | `01` §8 |
| **Cambios de backend con operación real** | Aditivo, con pruebas de integración, fuera de horario, con vuelta atrás |
| **Planes gratuitos** (sin copias, Hobby no comercial, tope de 500 MB) | Ola A **antes** que cualquier otra cosa |

## 13. Cómo sabremos que funcionó (metas propuestas)

| Métrica | Hoy | Meta |
|---|---|---|
| Pedidos nuevos **mostrados** en el dispositivo de la cajera < 10 s | no se mide | ≥ 99 % |
| Clientes con dispositivo registrado (push) | 11 de 77 (14 %); 0 iPhone | ≥ 80 % de los usuarios de la app |
| Crear un pedido (*p95* de extremo a extremo) | ≈ 2-3 s (estimado) | < 1,5 s tras `A.2`, JWT local y menos rondas |
| Cuota del canal cliente | 13,5 % de los pedidos | Creciente; se mide (`ADM-OPE-006`) |
| Sesiones sin fallos | sin medida (`PRO-05`) | ≥ 99,5 % |
