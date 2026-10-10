# 00 · Formato y convenciones del catálogo de requisitos

> **El formato elegido:** catálogo en Markdown con **IDs estables**, enunciado **EARS** en español,
> **fuente de verdad** (código o base), **estado real**, **disposición móvil** y **fase**. Es la
> especificación común de las dos apps nativas: **si iOS y Android cumplen los mismos IDs, hay
> paridad**.

## Por qué este formato

Con dos apps 100 % nativas (Swift y Kotlin) no hay código compartido que garantice que se comporten
igual. Lo único que se puede compartir es **la especificación**. Por eso cada requisito:

1. Tiene un **ID que no cambia ni se reutiliza** (se puede citar en un ticket, un test o un PR).
2. Se redacta **verificable** (patrón EARS): un tester sabe cuándo se cumple.
3. **Cita su fuente** (fichero o función SQL): no se afirma nada que no se haya leído.
4. Lleva una **disposición móvil** que separa lo que se replica de lo que no (lo que pediste:
   «muchas cosas que se usan en web no se usarán en el móvil»).
5. Se puede **contar y filtrar** (tablas con columnas fijas, sin prosa escondida).

## Anatomía

Cada área se escribe como **tabla**, con estas columnas:

| Columna | Contenido |
|---|---|
| **ID** | `APP-ÁREA-NNN` (ver abajo) |
| **Requisito** | Enunciado EARS. El sujeto es **la app** (cliente) o **el servidor** (backend) |
| **Reglas y validaciones clave** | Números, límites, condiciones, textos de error relevantes. Los valores **configurables** se marcan con ⚙ y se leen de `GET /config` (`MOB-02`); nunca se escriben en la app |
| **Fuente** | Dónde se verificó: `ruta/fichero.ts:línea`, función SQL, migración |
| **Est.** | Estado real (leyenda abajo) |
| **Móvil** | Disposición móvil y fase (leyenda abajo) |

Debajo de cada tabla van, cuando hace falta:
- **Backend:** los endpoints, RPC o tablas que el requisito consume (para armar la superficie móvil, `ARQ-01`).
- **Criterios de aceptación** de los flujos críticos, en formato *Dado / Cuando / Entonces*.
- **Notas** (defectos conocidos, decisiones).

## Convención de IDs

`<APP>-<ÁREA>-<NNN>`; el número es correlativo dentro del área y **no se reutiliza** aunque el
requisito se elimine (se marca «Muerto» o «Retirado»).

| App | Significado |
|---|---|
| **CUS** | App de **clientes** (`apps/customer`), la prioridad de esta migración |
| **NEG** | App de **negocios** / cajera (`apps/negocios`) |
| **MOT** | App de **motorizados** (`apps/motorizados`) |
| **ADM** | Panel de **administración** (`apps/admin`) |
| **SYS** | Reglas y servicios **transversales** del backend (antifraude, dinero, plazos, notificaciones…) |
| **NAT** | Capacidades **nativas nuevas** que hoy no existen (marketing push, Live Activities…) |

Áreas del Customer (las de las demás apps están al inicio de su fichero):

| Área | Tema | Área | Tema |
|---|---|---|---|
| `AUT` | Acceso, verificación y perfil | `TRK` | Seguimiento del pedido |
| `CAT` | Catálogo, búsqueda y negocio | `ORD` | Historial y pedidos activos |
| `CRT` | Bolsa (carrito) | `REV` | Reseñas |
| `ADR` | Direcciones y ubicación | `ACC` | Mi cuenta |
| `CHK` | Checkout y creación del pedido | `SUP` | Soporte y legal |
| `PAY` | Prepago, comprobante y apelaciones | `WEB` | Solo web (PWA, SEO, instalación) |

## Cómo se redactan (EARS)

| Patrón | Plantilla | Ejemplo |
|---|---|---|
| **Ubicuo** | «La app debe …» | La app debe guardar la bolsa en el dispositivo. |
| **Por evento** | «Cuando …, la app debe …» | Cuando el cliente cambia de negocio, la app debe pedir confirmación antes de vaciar la bolsa. |
| **Por estado** | «Mientras …, la app debe …» | Mientras el negocio esté cerrado, la app debe deshabilitar «Ir a pagar» y decir por qué. |
| **No deseado** | «Si …, entonces la app debe …» | Si el servidor responde con error de red, entonces la app debe conservar la clave de idempotencia. |
| **Opcional** | «Donde …, la app debe …» | Donde el negocio acepte recojo, la app debe mostrar el selector Delivery/Recojo. |

Reglas de estilo: **una obligación por requisito**, sin «y/o», **sin números de negocio escritos**
(los configurables se referencian como ⚙ con su clave), y siempre en **español peruano**.

## Estado real (columna «Est.»)

| Marca | Significado |
|---|---|
| ✅ | **Implementado** y verificado en código |
| 🟡 | **Parcial**: existe pero le falta una parte |
| ⚠️ | **Con defecto conocido** (se explica en Notas) |
| 🗑️ | **Muerto**: código sin uso o superado |
| 📝 | Solo en documentación, **no verificado** en código |
| ➕ | **Nuevo**: no existe hoy; se especifica para el móvil |

## Disposición móvil y fase (columna «Móvil»)

**Disposición** (decide *qué se hace con el requisito al pasar a nativo*):

| Código | Significado | Cómo decidir |
|---|---|---|
| **IGUAL** | Se replica tal cual: mismo comportamiento y mismas reglas | Es dominio del negocio, independiente del canal |
| **ADAPTAR** | Se replica, pero con la **capacidad nativa equivalente** | El comportamiento existe, la tecnología web no (push, GPS, mapa, sesión, cámara) |
| **SOLO-WEB** | **No** existe en la app; se queda en la web (o se descarta con la PWA) | Depende del navegador: instalación de PWA, *service worker*, SEO, OpenGraph, `manifest` |
| **DIFERIR** | Se replicará, pero **después** del primer lanzamiento | Útil pero no imprescindible para paridad de la v1 |
| **MUERTO** | **No** se migra: código vestigial o superado | Ver `PRO-07` |
| **NUEVO** | Capacidad que **no existe** y se añade con el móvil | Solo en `NAT-*` y en las filas ➕ |

**Fase:**

| Fase | Alcance |
|---|---|
| **M1** | App de **clientes**, primer lanzamiento en tiendas (paridad + lo bloqueante de `registro-de-hallazgos.md`) |
| **M2** | App de clientes **tras el lanzamiento** (campañas, Live Activities, *widgets*, recompra…) |
| **M3** | **Otras apps** (motorizados, negocios) si se decide llevarlas a nativo |
| **W** | Se queda **en web** de forma permanente |

Se escribe junto: `IGUAL · M1`, `ADAPTAR · M1`, `SOLO-WEB · W`, `NUEVO · M2`.

> **Nota (2026-09-20, `D-30`):** Negocios (solo Android) se adelanta y se planifica como el carril **N** de
> [`../05-arranque/03-plan-de-ejecucion.md`](../05-arranque/03-plan-de-ejecucion.md). Sus filas «DIFERIR · M3» que entran
> en el primer alcance se reclasificarán (con una fase propia para Negocios) al escribir su especificación, paso **N0**.

**★ Crítico de paridad:** los requisitos cuyo incumplimiento hace que iOS y Android **cobren o
decidan distinto** (dinero, antifraude, estados, plazos) se marcan con ★ en el ID y llevan
criterios de aceptación y **vectores de conformidad** (`ARQ-03`).

## Criterios de aceptación (formato)

Se escriben para los flujos ★ y los de riesgo de negocio:

```
CA-CHK-01 · Recojo «más tarde» solo admite prepago
  Dado un negocio que acepta recojo
  Y el cliente eligió «No, paso más tarde»
  Cuando abre la lista de formas de pago
  Entonces solo «Yape o Plin (antes de recibir)» está habilitada
  Y «Pagas en el local» aparece apagada con su motivo
  Y «Yape o Plin al recibir» no aparece
```

## Vectores de conformidad (propuesta)

Para reglas puras que se repiten en las dos apps (¿abierto?, franja de un plato, matriz de pagos,
tope de vuelto, punto en polígono, ETA, plazos), se propone un directorio
`Docs/customer_app_migration/03-requisitos/vectores/` con casos **entrada → salida esperada** en JSON,
que ejecutan los tests de Swift y de Kotlin (y los del servidor si la regla se mueve allí). Los
casos se extraen de los tests existentes (`packages/contracts/src/__tests__`, `apps/customer/**/__tests__`).

## Trazabilidad y mantenimiento

- Un cambio de comportamiento **empieza cambiando el requisito** (PR sobre este catálogo) y luego
  el código de las dos apps.
- Un requisito **retirado** se marca «Retirado» con la fecha; el ID no se reasigna.
- La columna **Fuente** se revalida cada vez que se toca el código (`graphify query` ayuda a
  localizar dependencias).
- **Los números de este catálogo son fotografías del 2026-09-20**; los configurables (⚙) mandan
  desde la base. Cuando este documento y `app_settings` discrepen, gana `app_settings`.

## Resumen por app y disposición

Ver [`matriz-disposicion-movil.md`](matriz-disposicion-movil.md).
