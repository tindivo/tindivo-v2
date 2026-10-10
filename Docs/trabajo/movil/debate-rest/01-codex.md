# Apertura de Codex (con evidencia)

Mantengo mi postura: **REST como contrato del dominio para las apps nativas; Supabase directo para Auth y excepciones acotadas de Realtime y Storage**. Mantengo también que hacer squash no es la mejor primera respuesta para facilitar la lectura de la base.

**Cambio respecto a mi primera apertura:** ahora confirmo que ya existen Bearer auth, errores estructurados, idempotencia, caché y algunos límites. El problema no es implementarlos desde cero, sino cerrar garantías incompletas. También identifico una prioridad mayor: el registro del comprobante tiene una escritura de estado vulnerable a concurrencia.

Esta evaluación corresponde al paquete de `develop` en `0306918`; no certifica por sí sola las definiciones vivas de producción.

## 1. Qué deben consumir las apps nativas

Usaría `/api/v1` para catálogo, perfil, direcciones, pedidos, reseñas, elegibilidad y seguimiento. No crearía otra API `/api/mobile/v1`: duplicaría contratos para un desarrollador solo.

Ya hay bastante superficie reutilizable: negocios y menú, búsqueda, seguimiento de restaurantes, Entregas y Store. El inventario de `route.ts` muestra, sin embargo, que faltan rutas customer de historial, direcciones y perfil; esos accesos siguen directos en la PWA —por ejemplo, `apps/customer/app/pedidos/page.tsx:138` y `apps/customer/features/account/hooks/use-account-page.ts:111`, según el grep entregado—.

Conservaría:

- **Supabase Auth**, con tokens enviados a REST: ya funciona así (`apps/customer/lib/api.ts:5–9`; `apps/api/lib/http/auth.ts:16–30`).
- **Realtime como aviso para refrescar REST**, con recuperación al reconectar o volver al primer plano. Hoy el store ya interpreta cambios como invalidación, aunque recarga desde tablas (`apps/customer/lib/active-orders.ts:123–138`).
- **Carga directa de comprobantes**, si sus políticas son correctas; la asociación al pedido se confirma en el servidor.

El §3.1 previo acierta al exigir compatibilidad para versiones instaladas, pero discrepo con que el contrato estable importe principalmente en dinero y estados. Direcciones, catálogo y nulabilidad también pueden romper una app. Su opción C exige mantener vistas/RPC públicas **además** de REST: menos endpoints no necesariamente significa menos mantenimiento.

Tampoco aceptaría el supuesto «a Negocios le basta menos porque se actualiza por WhatsApp». Un negocio desconectado o con actualización pendiente sigue necesitando compatibilidad. Sí reduciría su documentación al alcance necesario, no sus garantías.

## 2. El REST: buena base, garantías pendientes

**Lo sólido.** Hay validación Zod, catálogo de códigos y Problem Details (`packages/contracts/src/errors.ts:7–59`; `apps/api/lib/http/problem.ts:19–64`). Auth valida contra Supabase y consulta roles (`auth.ts:26–44`). El catálogo selecciona columnas públicas explícitas (`public/businesses/route.ts:10–14`) y tiene caché de 15 segundos (`:89–93`). El cliente distingue timeout de respuesta de negocio y aplica plazo también al cuerpo (`packages/api-client/src/index.ts:140–168`).

**Prioridad máxima: escrituras y reintentos.**

El comprobante se valida con un SELECT y después se actualiza solo por `id`; no repite condición de estado en el UPDATE. Un cambio concurrente podría quedar sobrescrito. Además, UPDATE y log son operaciones separadas y sus errores no se comprueban (`apps/api/app/api/v1/customer/orders/[id]/prepay-proof/route.ts:32–65`). Esto cuestiona incluso la garantía documentada de terminalidad si ocurre una carrera; falta verificar triggers vivos. Lo movería a una RPC con bloqueo, transición autorizada y evento transaccional.

La idempotencia existe, pero **no es atómica con el pedido**: reserva clave, ejecuta handler y guarda resultado por separado; ignora el error de esa última escritura (`apps/api/lib/http/idempotency.ts:45–65`). Una excepción deja `reserved`; una caída después de crear deja resultado desconocido. Los reintentos posteriores reciben conflicto (`:83–85`).

Además, la unicidad es `key,scope`, y el replay no comprueba usuario (`:25–29`, `:49`, `:68–86`). Una clave conocida y reutilizada con el mismo payload podría reproducir una respuesta ajena. No es una fuga demostrada, pero requiere cerrar aislamiento por identidad. En restaurantes el replay ocurre **después** de guards de teléfono y pago (`customer/orders/route.ts:45–183`): una configuración cambiada puede impedir recuperar un pedido ya creado.

**Contrato y errores.** Las respuestas usan `{data}`, JSON directo y `204`: es válido si se documenta por operación (`problem.ts:37–44`; `public/store/events/route.ts:53`). El cliente solo hace casts, sin validar respuestas (`api-client/src/index.ts:158–163`). La clasificación de RPC mediante regex de mensajes es frágil (`apps/api/lib/http/rpc-error.ts:8–51`); Entregas reconoce prefijos, pero los reduce a códigos genéricos (`customer/courier-orders/route.ts:19–35`). Añadiría razones estables sin retirar códigos vigentes.

**Dinero, listados y límites.** Hay conversiones a `Number` en prepago y Store (`customer/orders/[id]/prepay-info/route.ts:60`; `apps/api/lib/store/store.ts:75–95`). Definiría representación exacta y moneda para nuevos campos; no cambiaría tipos existentes silenciosamente. Apelaciones carece de paginación (`customer/appeals/route.ts:26–58`); Store no expone parámetros de página, aunque falta ver límites internos de sus RPC (`public/store/route.ts:28–44`).

Sí existen límites en OTP y eventos, pero cuentan y escriben separadamente; pueden excederse bajo concurrencia. El identificador anónimo de Store es renovable (`phone/send-code/route.ts:114–169`; `public/store/events/route.ts:18–47`). El grep sin usos de `ratelimit` no prueba ausencia de protección externa.

Falta acreditar OpenAPI y política de compatibilidad. Las tres mediciones de health —0,48 a 0,84 segundos— justifican medir región y latencia, no afirmar un «suelo» universal. No reemplazaría `getUser` por JWKS solo porque hay una clave ES256: cambiaría también cuándo se detectan revocaciones.

## 3. Qué encarece portar el customer

El checkout mezcla estado React, consultas, reglas de pago, geografía y cálculos monetarios (`apps/customer/features/checkout/hooks/use-checkout-state.ts:332–599`). Swift y Kotlin no reutilizarán esos hooks.

Propondría una **cotización REST** que devuelva total, envío, promociones, opciones de pago permitidas y restricciones relevantes. Reutilizaría predicados SQL; crear pedido vuelve a validar. No expondría señales internas antifraude.

También hay duplicación dentro del servidor: REST recalcula subtotal, modificadores y envío cercano para el umbral (`customer/orders/route.ts:115–175`). Los comentarios documentan dos divergencias anteriores con SQL (`:62–106`). Encapsular mediante REST no corrige por sí solo esa duplicación.

Direcciones necesita operaciones atómicas: desmarcar la predeterminada y guardar son llamadas separadas (`apps/customer/lib/address-save.ts:73–111`). El grep muestra otras escrituras en cuenta y barra de dirección, contradiciendo que este archivo sea «el único sitio» (`:37–46`).

Conservaría en clientes carrito provisional, captura GPS y presentación. Para disponibilidad temporal, el catálogo transmite reglas que evalúa el reloj del cliente (`public/businesses/[id]/route.ts:97–102`): aportaría tiempo del servidor y próxima transición, sin exigir consultas cada segundo.

## 4. Primeros pasos, en orden

| Paso | Criterio de hecho | Riesgo |
|---|---|---|
| 1. Inventario y contrato actual | Flujos de Customer y Negocios Android mapeados; ejemplos de restaurantes, Entregas y Store; pruebas de compatibilidad. | Nulo para producción. |
| 2. Comprobante transaccional | Concurrencia no sobrescribe estados; errores no responden éxito; log/outbox coherentes. | Medio, cambio interno conservando respuesta. |
| 3. Idempotencia completa | Usuario aislado; recuperación tras caída, excepción y respuesta perdida; un pedido por intento lógico. | Medio, requiere migración y pruebas de fallos. |
| 4. Auth y dispositivos nativos | Sesión, renovación y revocación probadas; registro y envío nativo definidos. El contrato actual es Web Push (`push/subscriptions/route.ts:10–19`). | Medio, mantener Web Push vigente. |
| 5. Cotización y datos faltantes | Checkout sin reconstruir decisiones; perfil/direcciones/historial/reseñas disponibles con autorización y límites. | Bajo a medio, rutas aditivas. |
| 6. Compatibilidad y operación | OpenAPI, campos monetarios exactos, config por plataforma, límites y métricas; headers nuevos permitidos en CORS (`cors.ts:60–61`). | Bajo si es aditivo. |
| 7. Prueba Swift/Kotlin | Pedido recuperable tras pérdida de red; regreso al primer plano; push y enlaces probados. | Bajo en entorno aislado. |

Cada hito debe ser revisable. CI hoy excluye integración API y no levanta Supabase (`.github/workflows/ci.yml:52–60`): automatizaría las pruebas críticas en base aislada.

No reescribiría el dominio SQL, impondría un agregador de home sin medición ni retiraría accesos de la PWA de golpe. Cambios delicados, fuera de 18:00–23:00.

## 5. Riesgos de mi propuesta

REST puede aumentar latencia y convertirse en cuello de botella. La cotización puede quedar obsoleta: debe informar cambios antes de confirmar, no prometer reserva inexistente.

Realtime sigue acoplado a tablas mientras use `postgres_changes`; aceptarlo como excepción conserva esa deuda. Push nativo agrega trabajo operativo real que mi primera apertura subestimó.

El mayor riesgo es querer cerrar todas las rutas antes de entregar valor. Priorizaría recorridos del lanzamiento y Negocios Android, con compatibilidad común.

## 6. Squash: primero estado actual legible

Hay **246 archivos, 54.073 líneas y 78 rollbacks**; `create_customer_order` aparece redefinida 36 veces —salidas de `ls/wc` y grep de funciones—. El problema de lectura es real.

Mi postura sigue siendo **no hacer squash ahora**. Prepararía un snapshot estructural por dominio, índice de funciones/policies y manifiesto operativo, indicando fecha y procedencia: reconstrucción local versus `tindivo-prod`. Los tipos no bastan para explicar RLS, grants o cuerpos de funciones.

El grep confirma configuración sembrada, cron, buckets, políticas de Storage, publicación Realtime, triggers en `auth.users` y grants repartidos por el historial. Una línea base que omita cualquiera puede reconstruir tablas y fallar en operación. Tampoco un dump SQL repone archivos de Storage o configuración externa.

Hay instrucciones contradictorias: `supabase/config.toml:2` dice aplicar por MCP; `CLAUDE.md:121–126` exige CLI. Corregiría esa documentación. Revisaría además `schema_paths` (`config.toml:8–9`) antes de introducir archivos de referencia.

Si posteriormente conviene compactar:

1. Conservar historial, rollbacks y correspondencia de versiones en Git.
2. Generar línea base en entorno aislado, con datos indispensables separados.
3. Comparar reconstrucción histórica y compactada: objetos, permisos, cron, Auth, Storage, Realtime y comportamiento.
4. Ensayar actualización de una base existente y reconciliación de historial con la versión concreta del CLI.
5. Adoptar sin ejecutar la línea base sobre producción ni resetearla.

La ayuda de `migration squash` demuestra que existe el comando, no qué preserva ni cómo reconciliar prod. No usaría `--linked` a ciegas. CI hoy verifica tipos remotos, pero no reconstrucción (`ci.yml:65–99`); ese chequeo debe preceder a la compactación.

## Pido para la ronda 2

- SQL vigente de idempotencia, triggers de pedidos y RPC de creación/comprobante, con sus pruebas.
- Contratos de respuestas, OpenAPI existente y SQL de límites de Store.
- Políticas de comprobantes, procesamiento outbox y envío push.
- `DECISIONS.md` relevante; dump estructural e inventarios operativos de prod; contenido representativo de rollbacks y comportamiento documentado del squash con el CLI instalado.