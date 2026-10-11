# 01 · Auditoría del código: ¿seguimos un estándar?

> Medido el 2026-10-08 sobre `develop` (`99d70a0`). Solo lectura. Los números salen de `grep`, `wc` y `biome`
> sobre el repo; cada sección dice cómo se midió.

## Veredicto

**Hay oficio, pero no hay un estándar de arquitectura.** El código está cuidado a nivel de detalle: TypeScript
estricto, Zod en las entradas, errores RFC 9457, idempotencia, timeouts, tests, y un linter casi limpio (0 errores,
37 avisos en 1 066 ficheros). Lo que falta está un nivel más arriba: **no hay capas ni fronteras entre módulos**, y
cada ruta resuelve a su manera lo que debería resolverse una sola vez. Eso es justo lo que encarece crecer
(mototaxi, promociones) y lo que impide separar servicios más adelante.

## Hallazgos

### C-01 · Las rutas lo hacen todo (controlador + servicio + repositorio en un fichero)

- 107 rutas, 8 238 líneas. Las rutas de la API hacen **159 `.from()` y 57 `.rpc()` directamente** dentro del
  handler. En la mayoría no hay capa de aplicación ni repositorios; Store es la excepción parcial, porque delega su
  acceso en `apps/api/lib/store/`.
- Ejemplo: `apps/api/app/api/v1/customer/orders/route.ts` (392 líneas) valida, autoriza, calcula subtotal y envío,
  consulta 7 tablas, aplica 6 reglas de negocio, gestiona idempotencia, llama a la RPC, escribe un log y agenda
  temporizadores.
- **Consecuencia:** una regla no se puede probar sin HTTP ni base, no se puede reutilizar desde otro canal (un
  *worker*, otra app) y no se puede mover a otro servicio sin arrastrar la ruta entera.

### C-02 · El mismo «cableado» copiado ~100 veces

| Pieza repetida a mano | Rutas que la repiten |
|---|---|
| `handleOptions` (preflight CORS) | 106 |
| `corsHeaders(req)` | 104 |
| `getRequestId(req)` | 103 |
| `try { … } catch (err) { return handleError(err …) }` | 103 |
| `requireRole(req, …)` | 90 |
| `createServiceClient()` | 85 |

El *proxy* ya centraliza el preflight y las cabeceras CORS de las respuestas correctas (`apps/api/proxy.ts`), pero no
hay un `defineRoute()` ni *middleware* por ruta para lo demás. Cada copia es una oportunidad de olvidar algo: el comprobante
(H-1 del debate) no comprobaba errores, y una ruta nueva puede olvidar CORS en la respuesta de error, que ya pasó
(`lib/http/problem.ts`, comentario de `handleError`).

### C-03 · `packages/core` no es el núcleo del dominio

`DECISIONS.md` dice «hexagonal solo en `orders`». En la práctica, de 62 ficheros de la API que importan
`@tindivo/core`, **61 solo traen `DomainError`**. `shared/ports.ts` define `Clock` e `IdGenerator`, que nadie inyecta.
La máquina de estados del pedido existe **dos veces**: en SQL (`advance_order`, la que manda) y en TypeScript
(`packages/contracts/src/order-status.ts`, que `packages/core/src/order/state-machine.ts` reexporta), donde solo la usan
tests y la interfaz. La «arquitectura hexagonal» es nominal.

### C-04 · Reglas de negocio repetidas en varias capas

Documentado en el debate (H-7): el checkout calcula dinero y elegibilidad en React (`use-checkout-state.ts`, 724
líneas), la ruta lo recalcula en TypeScript y la RPC una tercera vez. Los propios comentarios del código cuentan dos
divergencias que ya llegaron a producción (`customer/orders/route.ts:62-106`).

### C-05 · Los frontends también son «backend»

Llamadas directas a Supabase por app, **solo código de producción** (sin `__tests__`, `*.test.*` ni `node_modules`).
`.from()` sirve tanto para leer como para escribir; la columna de escrituras es un conteo aproximado de
`.insert/.update/.upsert/.delete`:

| App | `.from()` | `.rpc()` | Escrituras (aprox.) |
|---|---|---|---|
| customer | 55 | 6 | 21 |
| negocios | 96 | 3 | 44 |
| motorizados | 6 | 2 | 13 |
| admin | 12 | 0 | 9 |

**Negocios es el caso más serio**, y es la app nativa más urgente: 99 llamadas directas, unas 44 de ellas escrituras
(menú, horarios, QR, perfil), que en Kotlin habría que rehacer contra tablas.

### C-06 · Autorización a mano en cada ruta

85 de las 107 rutas crean el cliente `service_role` (se salta la RLS); 6, las de apelaciones, usan el token del
usuario con RLS (`createUserClient`); las demás no tocan la base o delegan en un ayudante. En las 85, **la autorización de cada recurso la escribe cada ruta**: comprobar que el pedido es del usuario, que el negocio es suyo… Funciona, pero no hay un patrón común (ver
`customer/courier-orders/[id]/cancel/route.ts`, que lo hace con un `select` previo, frente a otras que lo delegan en la
RPC).

### C-07 · Convención de idioma incumplida

`CLAUDE.md` exige identificadores en inglés. Hay al menos **59 declaraciones con nombre en español** (`conPlazo`,
`traerYAplicar`, `ultimaPeticion`, `pedirContraentrega`, `montoDevolucion`, `negocioDeLaBolsa`…). En la base pasa lo mismo:
`orders.comprobante_prepago_url`, el estado `validando` y las categorías de `map_landmark_category` (`salud`,
`farmacia`…). No es grave por sí solo, pero a dos apps nativas les llega como contrato.

### C-08 · La historia vive en los comentarios

Muchos ficheros llevan párrafos que cuentan incidentes y migraciones («Tumbó el registro del piloto en producción el
2026-08-12…», «desde la 0171…»): hay 764 números con formato de migración en el TypeScript. Explican el porqué y han
evitado errores, así que no se borran. Pero mezclan dos cosas: **la regla vigente** (va en el código, corta) y **la
historia de cómo se llegó** (va en un ADR o en el commit). Un fichero de 392 líneas donde la mitad es historia cuesta
leerlo, sea persona o agente.

### C-09 · Escapes del sistema de tipos

En la API: 11 `as unknown as`, 4 `as any`, 1 `as never` y 4 `biome-ignore`. Casi todos se deben a que los tipos
generados de las RPC no expresan `null` (comentario en `customer/courier-orders/route.ts`). Es poco, pero señala un
límite de usar el cliente de Supabase como capa de datos.

### C-10 · Lo que el linter no vigila

`biome.json` aplica las reglas recomendadas, que cubren estilo y errores comunes. **No hay ninguna regla de
arquitectura**: ni fronteras de importación entre módulos, ni tamaño máximo de fichero o función, ni convención de
nombres. La regla «una feature no importa de otra» de `CLAUDE.md` y la de «máximo 300 líneas» de
`apps/customer/ARCHITECTURE.md` (16 ficheros la pasan) se cumplen solo por disciplina.

### C-11 · Pruebas

| Paquete | Ficheros de test |
|---|---|
| apps/api | 40 (integración contra base) |
| apps/customer · negocios · motorizados | 23 · 20 · 11 |
| packages/contracts · core · ui | 12 · 7 · 2 |
| apps/admin | 0 |
| e2e (Playwright) | 8 especificaciones + carpetas `driver/` y `negocios/` |

La lógica que más pesa (277 KB de PL/pgSQL) **no tiene pruebas propias**: no existe `supabase/tests` ni ningún
test pgTAP, así que solo se prueba de forma indirecta a través de la API. Y la CI no corre la integración (`ci.yml:52-60`).

## Lo que está bien y hay que conservar

- `strict`, Zod 4 en todas las entradas, Problem Details, idempotencia, `Idempotency-Replayed`, request-id.
- `packages/api-client` con plazo y distinción entre fallo de red y respuesta del servidor.
- Vertical slicing por *feature* en los frontends, y un `ARCHITECTURE.md` en el customer.
- Disciplina de commits en español que cuentan el efecto para el usuario.
- Biome casi limpio.
