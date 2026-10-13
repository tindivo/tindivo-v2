# Enmienda al plan móvil (D-49 a D-53)

> **Resuelta por Jesús el 2026-10-13. No manda: lo aprobado manda en `Docs/planes/movil/decisiones.md`.** 2026-10-12,
> actualizada el 2026-10-13 · Trabajo, no canon. Sale del diff entre la spec de la app nativa ([`spec.md`](spec.md)) y el
> plan móvil aprobado (`Docs/planes/movil/`); solo recoge los puntos clasificados **nuevo** en
> [`clasificacion.md`](clasificacion.md). Campañas y consentimientos no están aquí: van aparte en
> [`../campanas/propuesta.md`](../campanas/propuesta.md). **Estado de cada decisión:** D-49, D-50 (con condición), D-51,
> D-52 (acotada) y D-53, aprobadas y *promovidas a `decisiones.md`* (sección «Decididas el 2026-10-13»). `D-54` y `D-55`
> **no son decisiones del plan**: ya son reglas de los estándares de código v2 (`DES-6` y `CLI-14`, PR #50) y la
> numeración queda libre desde `D-54`. El texto que sigue se conserva como análisis y alternativas; esta nota se borra
> al cerrarse el PR de campañas, que es lo único pendiente que cuelga de ella.
>
> **Reglas con las que se redactó:** ninguna decisión contradice una D-xx vigente ni `contrato-rest.md` (REST como única
> superficie, `D-21`; dinero como texto en lo nuevo, `D-39`; mínimos por app y plataforma, `D-41`; conservar `customer_pwa`
> y añadir columnas, `D-33`; el agregador `GET /home` se difiere, `contrato-rest.md` línea 107). Nada de esto toca
> `business_charges` ni ningún saldo (invariante 9). Cualquier migración que salga de aquí pasa por Codex y se aplica
> fuera de 18:00-23:00.

## 1. Resumen

| # | Decisión | Estado | ¿Backend nuevo? | ¿Migración? |
|---|---|---|---|---|
| D-49 | Pedir en tres pasos y el recurrente en dos toques son **criterio de aceptación** de la app | Aprobada. Promovido a `decisiones.md` | No | No |
| D-50 | Método de pago por defecto | Aprobada con condición (se filtra por lo que permita la cotización o `payment-options`). Promovido a `decisiones.md` | No | No |
| D-51 | Repetir un pedido | Aprobada. Promovido a `decisiones.md` | **Sí**, una ruta | No |
| D-52 | Banners y ofertas del inicio administrables | Aprobada **acotada**: solo los bloques tipados que sirve la API; el admin que los edita va con campañas. Promovido a `decisiones.md` | **Sí**, ruta + admin | **Sí** |
| D-53 | Métricas de la app: base propia, sin SDK de analítica | Aprobada. Promovido a `decisiones.md` | Poco (columnas ya decididas en D-33) | Solo las de D-33 |
| ~~D-54~~ | Guardia de compatibilidad del contrato en CI | **No es decisión del plan:** es la regla `DES-6` de los estándares (#50). Número libre | No (CI) | No |
| ~~D-55~~ | Publicación: liberación gradual y prueba del 426 sin riesgo | **No es decisión del plan:** es la regla `CLI-14` de los estándares (#50). Número libre | No | No |

## 2. Las decisiones

### D-49 · El recorrido «tres pasos» y el «dos toques» como criterio de aceptación

**Estado: aprobada el 2026-10-13; promovida a `decisiones.md`.**

*Origen:* spec §1, §4 (filas 1, 30 de la clasificación).

El plan fija capacidades de la API, no el recorrido de la pantalla. La spec propone: armar, revisar y confirmar; y que un
cliente recurrente (dirección y pago por defecto) pida en dos toques.

| Alternativa | Qué implica |
|---|---|
| A. Criterio de aceptación de la app: Revisar → Confirmar en dos toques para el recurrente, comprobado en el flujo crítico contra la API simulada | Es verificable (una aserción por plataforma) y obliga a que dirección por defecto y pago sean datos que la app ya tiene |
| B. Orientación de diseño, sin criterio | Más libertad; nadie comprueba que el recorrido se mantenga |

**Recomendación: A**, con las precondiciones que el plan ya cubre: dirección por defecto (`isDefault`, migración `0256`),
cotización (`POST /customer/checkout/quote`) y elegibilidad de contraentrega (`GET /customer/payment-options`). Depende de
**D-22** (identidad): mientras esté abierta, el «OTP solo la primera vez» de la spec no se asume; el recorrido se mide desde
que hay sesión.

*Backend:* ninguno nuevo. *Contradice:* nada.

### D-50 · Método de pago por defecto

**Estado: aprobada con condición el 2026-10-13; promovida a `decisiones.md`.** La condición: el valor por defecto se filtra por lo que permita la cotización o `payment-options`.

*Origen:* spec §2.4 (fila 8). Hoy no existe una preferencia guardada; `payment-options` solo dice si hay contraentrega.

| Alternativa | Qué implica |
|---|---|
| A. Columna en el perfil (`PATCH /customer/profile`) | Estado nuevo en el servidor, un campo más en el contrato y su migración |
| B. Guardarlo en el dispositivo | Sin servidor; se pierde al reinstalar o cambiar de teléfono |
| C. Derivarlo del último pedido (`GET /customer/orders`) y ofrecerlo solo si `payment-options` lo permite | Sin estado nuevo; siempre coherente con la regla del servidor (si el cliente perdió la contraentrega, no se ofrece) |

**Recomendación: C.** El servidor ya decide qué métodos se permiten; guardar una preferencia aparte crearía otro sitio que
puede quedar desfasado (la lección de `H-7`). Si C no basta tras medir (D-53), se pasa a A.

*Backend:* ninguno. *Contradice:* nada.

### D-51 · Repetir un pedido

**Estado: aprobada el 2026-10-13; promovida a `decisiones.md`.**

*Origen:* spec §2.5, §4, §5 (filas 9, 31, 39). Hoy «Volver a pedir» solo abre el negocio y `cart.replace` no se usa en
producción (`CUS-CRT-012`); `NAT-MKT-004` lo pide para M2, pero `contrato-rest.md` y `mv4-inventario-rutas.md` no lo
incluyen.

| Alternativa | Qué implica |
|---|---|
| A. La app lo arma con rutas existentes: `GET /customer/orders/{id}`, el menú de `GET /public/businesses/{id}` y `POST /customer/checkout/quote` | Sin backend; la regla «¿sigue el plato, cambió el precio, cambiaron las opciones?» se escribe **dos veces** (Swift y Kotlin) y puede diferir |
| B. Ruta de solo lectura `GET /customer/orders/{id}/reorder`: devuelve el carrito con precios y disponibilidad **actuales** y una lista de diferencias (plato ya no existe, precio distinto, opción retirada). No crea pedido | Una sola implementación de la regla, en el servidor; el dinero viaja como texto (`D-39`); la cotización y la creación siguen revalidando |

**Recomendación: B.** Es el mismo argumento de `D-21`/`H-7` (el cliente no decide precios ni disponibilidad). El pedido solo
se crea con `POST /customer/orders` y `Idempotency-Key`, igual que cualquier otro.

*Backend:* una ruta nueva, su esquema en `packages/contracts`, su entrada en el OpenAPI y pruebas de integración (acceso
ajeno: un pedido de otro cliente da 404). Sin migración. *Contradice:* nada. Repetir una Entrega
(`backlog-entregas.md`) queda fuera.

### D-52 · Banners y ofertas del inicio administrables

**Estado: aprobada acotada el 2026-10-13; promovida a `decisiones.md`.** Se aprobó solo la parte de los bloques tipados que sirve la API; la pantalla del admin para editarlos va con campañas. Lo que sigue describe la propuesta original.

*Origen:* spec §2.7, §3, §6 (filas 11, 22, 53). Los banners están escritos en el código (`CUS-CAT-020`); en una app nativa
cambiarlos exigiría pasar la revisión de la tienda. `NAT-MKT-002` los proponía como `home_banners` en M2.

| Alternativa | Qué implica |
|---|---|
| A. Seguir en el binario | Cada cambio comercial pasa por la tienda |
| B. Tabla mínima `home_blocks` (imagen, texto, enlace, vigencia, orden) + `GET /public/home-blocks`, editable desde el admin web | Un cambio comercial no pasa por la tienda; sin segmentos, sin agregador, sin campañas |
| C. La spec completa: `segment`, `campaign_id`, `kind` | Obliga a tener segmentación y campañas, que van aparte |

**Recomendación: B.** No es el agregador `GET /home` que el plan difiere hasta medir (`contrato-rest.md` línea 107): es una
lista de bloques, una consulta, sin mezclar catálogo ni pedidos. Si más adelante hay campañas, `segment` y `campaign_id` se
añaden como columnas opcionales. Los bloques se validan con un esquema de `@tindivo/contracts`.

*Backend:* migración (tabla con RLS y política explícita de lectura pública solo de lo vigente; invariante 3 y 10: la
vigencia se evalúa en hora de Lima), ruta pública, ruta de admin (rol comprobado en el caso de uso, `API-7`), una pantalla
en el admin web para editarlos. *Contradice:* nada, siempre que no se llame «home».

### D-53 · Métricas de la app: base propia, sin SDK de analítica

**Estado: aprobada el 2026-10-13; promovida a `decisiones.md`.**

*Origen:* spec §2 («No entra: analítica de terceros»), §10 (filas 20, 95, 98, 100). `07` §6 dejó «uso de la app» por decidir;
`NAT-ANA-002` proponía analítica de producto (M2).

| Alternativa | Qué implica |
|---|---|
| A. SDK de analítica de producto (Firebase Analytics u otro) | Embudo fino, pero un SDK más que declarar en *Data safety* y *App Privacy* (R4 de `07`) |
| B. Solo la base propia: pedidos por `client_platform`, recompra a 30 días app frente a PWA, aceptación del permiso de push por plataforma; los fallos, con el rastreador de OPS-4 (no es analítica de producto) | Sin SDK y sin ATT; un embudo menos detallado (no se ve el «abrir → bolsa») |

**Recomendación: B** para v1, revisando cada semana el primer mes. Vuelve a A si el embudo previo al pedido se vuelve
necesario.

*Backend:* lo único que no está ya decidido es **guardar el estado del permiso de push por dispositivo**
(`NAT-CON-003`, parte del registro de dispositivos del paso 5). Las columnas `client_platform`/`client_version` ya salen de
`D-33`. Las consultas viven en `Docs/operacion/` o, si Jesús las quiere a la vista, amplían `GET /admin/online-stats`.
*Contradice:* nada; precisa `NAT-ANA-002`, que es análisis y no plan.

### D-54 y D-55 · No son decisiones del plan

Jesús (2026-10-13): ya son reglas de los estándares de código v2 (PR #50, ADR 0038), así que el plan las cita sin número
propio y no se enmiendan.

- **Guardia de compatibilidad del contrato** (antes D-54, spec §9 F0, filas 78 y 82): `DES-6` (`oasdiff` contra la rama
  base, OBLIGATORIA), con `API-1` (Spectral) y `CLI-1` (`scripts/sync-openapi.sh`). Pendiente de comprobar antes de
  montarla: si el test de cobertura ya falla cuando `packages/contracts/openapi/v1.json` está desactualizado respecto de
  Zod (no se verificó).
- **Publicación gradual** (antes D-55, filas 92 y 94): `CLI-14`. Queda una práctica sin regla: la prueba del 426 en
  producción subiendo el mínimo de una app sin usuarios (los mínimos son por app y plataforma, `D-41`; por ejemplo
  `motorizados` en iOS). `CLI-14` no la pide; se anota en el runbook de publicación cuando se escriba.

## 3. Lo que el backend necesita para la app, y debe entrar ahora

Jesús quiere que el backend entre durante los servicios (las tiendas van después). Separado por origen, para no mezclar lo
que ya está decidido con lo que esta enmienda propone:

**Ya decidido en el plan, sin construir (no es nuevo, pero la spec lo da por hecho):**

| Pieza | Fuente | Estado |
|---|---|---|
| Registro de dispositivos nativos (APNs/FCM): token, plataforma, versión de app, estado del permiso, rotación, baja y cambio de usuario, **manteniendo Web Push** | `contrato-rest.md` §3 paso 5 (línea 67); `NAT-PSH-001`, `NAT-CON-003` | `push/subscriptions` solo guarda `endpoint` y claves de Web Push; **`cola.md` no tenía ningún lote para el paso 5**. Ahora es **MV7** (Jesús, 2026-10-13: el próximo lote de servicios) |
| Envío push nativo desde el outbox, con reintentos | mismo paso 5; invariantes 4 y 5 de `AGENTS.md` | Sin construir |
| Columnas `client_platform` y `client_version` en `orders`, y generalizar el `source` fijo `customer_pwa` | `D-33`; `customer/orders/route.ts:339` | Sin construir; toca `create_customer_order`, así que pasa por Codex |
| *Kill switch* y *flags* en `GET /config` | `decisiones.md` línea 85 | `ClientCompatSettingsSchema` solo tiene `minAppVersion` y `minOs`. **Lote MV3b en `cola.md`** (Jesús, 2026-10-13) |
| Contrato formal del payload de push (tipo, id de pedido, estado, deep link, título y cuerpo) | `NAT-PSH-004/005` | Se escribe con el paso 5 |

**Nuevo, aprobado el 2026-10-13:**

| Pieza | Decisión | Tamaño |
|---|---|---|
| `GET /customer/orders/{id}/reorder` | D-51 | Una ruta, sin migración |
| Bloques tipados del inicio + `GET /public/home-blocks` (D-52 acotada) | D-52 | Migración y una ruta pública. **Sin** ruta ni pantalla de admin: van con campañas |
| Guardia `oasdiff` en CI | regla `DES-6` (no es decisión del plan) | Un paso de workflow |
| Consultas de métricas | D-53 | Documento en `Docs/operacion/` |

**Orden:** el próximo lote de servicios es el push nativo (MV7), con los kill switches en el lote de `config` (MV3b); D-33
(columnas) y después D-51 y D-52, que no bloquean a los otros. Nada de esto se despliega a producción sin Jesús (`cola.md`, «Para
retomar», punto 4).

## 4. Lo que esta enmienda no resuelve

- **D-22 (identidad del cliente)**, abierta (planteada en [`d-22.md`](d-22.md)): la spec supone OTP del teléfono como identidad y cotizar sin sesión. El plan
  exige sesión de cliente en todas las rutas de pedido y cotización (`quote/route.ts:44`). Es una pregunta para Jesús, no
  una decisión nueva.
- **Campañas y consentimientos:** [`../campanas/propuesta.md`](../campanas/propuesta.md).
- **Estándares v2.2 y `packages/backend`:** son arquitectura, sin aprobar.
- **DA-01…DA-12 de la spec:** están en la cola `Docs/trabajo/decisiones-abiertas.md` del PR #49 (DA-02, 06, 08, 11 y 12 abiertas; DA-01, 04 y 07 remiten a D-22, D-21/D-38 y D-24). Se resuelven allí, no aquí.
