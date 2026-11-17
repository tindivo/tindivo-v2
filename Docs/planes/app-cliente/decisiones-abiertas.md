# App cliente — decisiones abiertas

> Estado: **propuesto**, pendiente de aprobación de Jesús · Verificado el 2026-11-17 contra el código (`develop`) y las fuentes que se citan ·
> Regla (README, «Cómo se mantiene», punto 4): lo que se decide y aún no se diseña vive aquí, nunca en un comentario suelto.
> Cada punto trae contexto, alternativas, recomendación y los requisitos que mueve. **Ninguna recomendación está aplicada**: decide Jesús.
> Los puntos que tocan dinero o datos llevan la marca **dinero** o **datos**: requieren su revisión explícita y la de Codex antes de aplicarse.

## Índice

| | Tema | Tipo | Bloquea |
|---|---|---|---|
| 1 | Referencia mínima de la dirección: 5 o 15 | contradicción | `CUS-ADR-001`, validaciones |
| 3 | Prefijo del código de pedido: `#TDV-` o `#TND-` | contradicción | textos de WhatsApp |
| 5 | Orden de las apps: iOS a la vez o después | contradicción (casi resuelta) | plan de iOS |
| 6 | Formas de pago en recojo «ahora» | contradicción | `CUS-CHK-004/006` |
| A | Notificaciones: obligatorias o no, y su texto | diseño | `CUS-NOT-*`, `CUS-ACC-005` |
| B | «No se presentó»: falta automática o con revisión | diseño · **dinero** | `CUS-TRK-015`, `CUS-ENT-021` |
| C | Cómo auditar faltas sin apelación | diseño · **dinero** | `CUS-SUP-005`, `CUS-PAY-009` |
| D | Texto del caso `no_history` → `validando` | diseño | `CUS-CHK-007`, `CUS-CHK-021` |
| E | Variante de recojo sin maqueta | diseño | `CUS-CHK-004` |
| F | Subtotal y chip «S/ 20» | diseño | `CUS-CHK-001`, `CUS-CHK-008` |
| G | Cuenta secundaria al prepagar | diseño | `CUS-PAY-002`, `CUS-PAY-011` |
| H | Datos del motorizado: foto, placa, teléfono | diseño · **datos** | `CUS-TRK-007` |
| I | Estado «va a recoger» | diseño | `CUS-TRK-002` |
| J | Captura al pagar al recibir | diseño | `CUS-PAY-013` |
| K | `strikes.blockThreshold` = 2 igual a `prepaymentOnlyThreshold` = 2 | aclaración | `CUS-CHK-007`, `CUS-CHK-021` |
| L | Qué se puede enviar por Entregas | contradicción · **dinero** | `CUS-ENT-010/011` |
| M | Cómo reembolsa Store sin retener fondos | diseño · **dinero** | `CUS-STO-008` |
| N | Reaceptación de Términos: al abrir o al actuar | diseño | AUT, `AUT-terminos-actualizados` |
| O | Casilla de Términos: siempre o solo si falta | diseño | `AUT-entrar` |
| P | Uno o dos interruptores de notificaciones | diseño · **datos** | NOT, ACC |
| Q | Celular que ya pertenece a otra cuenta | diseño · **datos** | `CUS-AUT-008` |
| R | Abrir un pedido ajeno | diseño · **datos** | TRK |
| S | A quién se paga «al recibir» con billetera | **dinero** | `CUS-CHK-006`, PAY |

Los números 2 y 4 de la lista original de contradicciones no están: ver «Contradicciones revisadas que no quedan abiertas», al final.

---

## Contradicciones confirmadas

### 1. Referencia mínima de la dirección: 5 o 15 caracteres

- **Contexto.** `packages/contracts/src/primitives.ts:68` define `ADDRESS_REFERENCE_MIN = 5` y Android lo repite (`feature/addresses/AddressRules.kt:9`). `DECISIONS.md:615` (§13, fila 12) dice «Mín 15 / máx 140», bajado de 20 el 2026-06-22. El índice de `DECISIONS.md` clasifica §13 como historia, de modo que el 15 ya no manda por sí solo, pero nadie decidió el cambio a 5. `Docs/planes/movil/decisiones.md` lo tiene como `D-31`, abierta.
- **Alternativas.**
  1. Dejar 5 (lo que rige hoy en la web, el servidor y Android).
  2. Subir a 15 (lo que decía el canon antiguo; obliga a migrar contratos, web y Android).
  3. Un valor intermedio medido con datos reales y guardado en ⚙ (`app_settings`), no en el código.
- **Recomendación.** Opción 3 con el 5 vigente mientras tanto: mide en `tindivo-prod` cuántas direcciones guardadas tienen referencias de 5 a 14 caracteres y pregunta a la cajera y a los motorizados cuáles no sirven para llegar a la puerta. El número debe vivir en una sola fuente (⚙). No es una corrección de lint: es un cambio de comportamiento y va aparte.
- **Afecta.** `CUS-ADR-001`, `CUS-CHK-005`, `CUS-CHK-013`, `CUS-CRT-008`; defecto 5 de `requisitos/ADR.md`.
- **Fuentes.** `DECISIONS.md:615`; `packages/contracts/src/primitives.ts:68`; `Docs/planes/movil/decisiones.md` (`D-31`).

### 3. Prefijo del código de pedido: `#TDV-` o `#TND-`

- **Contexto.** La referencia humana oficial es `#TND-XXXXXXXX` (`DECISIONS.md:294`; comentario en `packages/contracts/src/primitives.ts:10`). Android arma el mensaje de soporte con `#TDV-` (`apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/SupportContact.kt:90`, y su prueba `SupportContactTest.kt:136`); la web hace lo mismo (`pedidos/page.tsx`, `appeal-create-view.tsx`). `D-32` ya recomienda unificar.
- **Alternativas.** (a) Unificar en `#TND-`. (b) Unificar en `#TDV-`. (c) Dejar los dos.
- **Recomendación.** (a): es el que dicen el canon y el contrato, y es un cambio de texto en dos clientes. Se commitea por separado (cambia lo que la cajera ve en WhatsApp). Antes, confirmar con la cajera cuál reconoce en su búsqueda.
- **Afecta.** `CUS-ORD-004`, `CUS-SUP-001`; defecto 2 de `requisitos/ORD.md`.
- **Fuentes.** `DECISIONS.md:294`; `SupportContact.kt:90`; `Docs/planes/movil/decisiones.md` (`D-32`).

### 5. Orden de las apps

- **Contexto.** Dentro de `Docs/planes/movil/decisiones.md` conviven: `D-30` y la recomendación de `D-35` («Negocios Android primero»), `D-01` («primero Customer»), la nota de `D-35` («Decidido por Jesús el 2026-10-09: Customer primero, Negocios Android después y la mudanza al VPS al final») y `D-12` («Android e iOS se lanzan a la vez»). La línea 211 y la pregunta 5 de la línea 220 repiten el orden viejo. Frente a eso, el README de esta carpeta dice «Android hoy, iOS después».
- **Lo resuelto.** Customer va primero (nota de `D-35`, 2026-10-09). No es una decisión abierta.
- **Lo que sigue abierto.** ¿iOS sale **a la vez** que Android (`D-12`) o **después**? No encontré una decisión escrita que reemplace a `D-12`.
- **Alternativas.** (a) Mantener `D-12` (lanzar a la vez). (b) iOS después de que Android esté en Play y estable.
- **Recomendación.** (b), porque coincide con el README y con el estado real (Android existe; iOS no empezó). Y limpiar en `decisiones.md` las frases viejas de `D-30`, la línea 211 y la pregunta 5.
- **Afecta.** Columna «iOS» de todos los requisitos; `matriz.md`.
- **Fuentes.** `Docs/planes/movil/decisiones.md` (`D-01`, `D-12`, `D-30`, `D-35`, líneas 211 y 220); `Docs/planes/app-cliente/README.md`.

### 6. Formas de pago en recojo «ahora»

- **Contexto.** Los requisitos de la web copiados a `requisitos/CHK.md` (`CUS-CHK-004`, `CUS-CHK-006`, `CA-CHK-01`) dicen que en recojo «ahora» se puede pagar en la caja (efectivo o Yape o Plin) o con prepago, y que solo «más tarde» es prepago. El código dice otra cosa: `packages/contracts/src/payment-rules.ts` (`customerPaymentIntents`) devuelve solo `['prepaid']` para **todo** recojo, por la migración `0283` («un recojo siempre va prepagado», decisión de Jesús del 2026-10-29, que revierte la columna «recojo ahora» de `0223`); lo recogen `DECISIONS.md:369` y `Docs/negocio/antifraude.md:54`. Android ya lo cumple: `checkout_pickup_now_hint` dice «Pagas por adelantado y lo preparamos apenas confirmemos el pago».
- **Alternativas.** (a) Vale `0283`: todo recojo es prepago; se reescriben `CUS-CHK-004/006` y `CA-CHK-01`. (b) Volver a abrir la caja para «ahora»: exige migración y es dinero.
- **Recomendación.** (a): es lo decidido y lo que corre en producción; la web copiada está desactualizada. Se reescribe al aprobar esta carpeta.
- **Afecta.** `CUS-CHK-004`, `CUS-CHK-006`, `CA-CHK-01`; ver también la decisión E.
- **Fuentes.** `packages/contracts/src/payment-rules.ts`; `DECISIONS.md` («Un recojo siempre va prepagado (`0283`)», línea 369); `Docs/negocio/antifraude.md:54`; `supabase/migrations/0283_un_recojo_siempre_va_prepagado.sql`.

---

## Decisiones de diseño abiertas

### A. Notificaciones: obligatorias o no, y su texto

- **Contexto.** Jesús decidió (2026-11-16, noche) **un solo permiso**, como Yape, que cubre estados del pedido y novedades, con un solo interruptor en Cuenta, y lo repitió en `PATRONES-V2.md` §11. Después pidió saber si deben ser **obligatorias** para pedir. El debate de diseño (Codex y Gemini Hydrogen, 3 rondas) concluyó que **no**: el permiso no garantiza que el aviso llegue (canal silenciado, ahorro de batería), obligarlo puede atrapar a quien ya lo negó en Android 13+, y condicionar pedir a un permiso que también cubre promociones pone en duda el consentimiento comercial (Ley 29733, **a verificar con abogado**) y la revisión de Google Play (**a verificar**). Nadie consultó fuentes externas.
- **Alternativas.**
  1. **Obligatorias** para confirmar un pedido.
  2. **Opcionales**, con invitación única tras el primer pedido confirmado, franja «Notificaciones desactivadas · Abrir Ajustes» en cualquier pedido con avisos apagados, y un interruptor en Cuenta (recomendación del debate; es lo que ya aprobó Jesús el 16-nov para el flujo).
  Y, para el texto, dos variantes:
  - (i) «Pedidos, novedades y promociones» (la regla actual, un solo permiso): elección expresa registrada en la app, revocable en Cuenta, **sin enviar promociones** hasta validar el esquema.
  - (ii) «Avisos de tus pedidos» ahora y, cuando existan promociones, una casilla aparte, desmarcada y revocable: «Quiero recibir novedades y promociones».
- **Recomendación.** Opcionales (2) y texto (ii). Si Jesús prefiere (i), con las cautelas indicadas. Medir antes de decidir más: abandono del checkout, negativas del permiso, regresos de Ajustes y adelantos vencidos. No prometer SMS ni WhatsApp automáticos: hoy no existen.
- **Afecta.** `CUS-NOT-001…004`, `CUS-ACC-005`, `CUS-AUT-018`, `CUS-AUT-022`, `CUS-TRK-013`.
- **Fuentes.** `tindivo-auditorias/2026-11-16-ux-movil/v3/debate-notificaciones/conclusion.md`; `.../2026-11-16-terminos-v3/decisiones-jesus-ronda2.md` («Cambio de Jesús, noche»); `PATRONES-V2.md` §11.

### B. «No se presentó»: falta automática o con revisión

- **Contexto.** Hoy el cancelado por `no_show` explica el motivo según método (`CUS-TRK-015`). El debate de notificaciones pide que **ninguna falta «no se presentó» se aplique sin revisión y sin un intento de contacto previo** (una llamada sin respuesta tampoco prueba culpa), y que un adelanto vencido cancele sin falta. Jesús aún no lo aprobó. La suposición de que el adelanto vencido hoy cancela sin falta **no se contrastó con el código**. Para Entregas, el caso «cliente no está» (T7) está por diseñar.
- **Alternativas.** (a) Falta automática. (b) Falta solo tras revisión humana y un intento de contacto registrado (quién llama: el negocio para el pago, el motorizado para la llegada). (c) Mixto: automática para recojo (el cliente nunca vino), con revisión para delivery.
- **Recomendación.** (b), con la regla escrita en la tabla «Reglas vigentes» de los Términos y con el intento de contacto registrado. Contrastar antes con el código qué hace hoy `no_show`. **Dinero** (las faltas llevan a prepago obligatorio y a bloqueos).
- **Afecta.** `CUS-TRK-015`, `CUS-ENT-021`, `CUS-SUP-005`; decisión C.
- **Fuentes.** `debate-notificaciones/conclusion.md` («En qué coinciden», «Decisiones que se le piden a Jesús», 3); `decisiones-jesus-ronda2.md` (T7).

### C. Cómo auditar faltas sin apelación

- **Contexto.** La ronda 2 de los Términos (C2) escribió «Tindivo evalúa tu caso por WhatsApp y decide si corresponde una devolución». Luego Jesús dijo que **cree que las apelaciones no van** y pidió ayuda para diseñar cómo auditar sanciones y cobros. Quedó «pendiente de cerrar». Hoy existe `CUS-PAY-009` (solicitar revisión de pago tras `proof_rejected_final`, con respuesta en ≤ 24 h y strike si se rechaza). El texto de producto ya propuesto es «Si crees que hubo un error, escríbenos por WhatsApp» (`CUS-SUP-005`).
- **Alternativas.**
  1. Sin canal formal: solo el WhatsApp de soporte (rápido, pero sin rastro ni control).
  2. **Evidencia obligatoria por falta**: cada strike guarda hora, intento de contacto, GPS y quién lo registró, visible en Admin, más **revisión periódica de una muestra** por Jesús; el WhatsApp es la puerta de entrada.
  3. Apelación formal con plazo y resolución escrita (lo que hace hoy `CUS-PAY-009`, extendido a toda falta).
- **Recomendación.** 2: da trazabilidad sin construir un proceso de apelación, y el WhatsApp sigue como puerta. Cualquier devolución o levantamiento de falta se escribe en `business_charges` (invariante 9). **Dinero**: requiere revisión de Jesús y Codex. Decidir qué pasa con `CUS-PAY-009`.
- **Afecta.** `CUS-SUP-005`, `CUS-PAY-009`, `CUS-PAY-008`, `CUS-CHK-007`.
- **Fuentes.** `decisiones-jesus-ronda2.md` (C2 y «Respuestas de Jesús», Apelaciones).

### D. Texto del caso `no_history` → `validando`

- **Contexto.** Un cliente sin compra previa con GPS dentro de cobertura pasa a `validando` y la cajera lo llama (`CUS-CHK-007`). La maqueta v3 no tiene el texto que se lo explica (`pantallas/CHK-confirmar-pedido.md`, «Pendiente»).
- **Alternativas** (≤ 40 caracteres, minimalismo de `PATRONES-V2.md` §10): (a) «Te llamaremos para confirmar tu pedido». (b) «Lo confirmamos contigo por llamada». (c) No decir nada en el checkout y avisar solo en el seguimiento.
- **Recomendación.** (a) en la línea bajo el botón, y repetir el estado en el seguimiento («Confirmando contigo», sin cuenta atrás, como ya manda `CUS-TRK-005`). Redacción final: la fija Jesús.
- **Afecta.** `CUS-CHK-007`, `CUS-CHK-021`, `CUS-TRK-003`.
- **Fuentes.** `Docs/planes/app-cliente/pantallas/CHK-confirmar-pedido.md` («Pendiente»).

### E. Variante de recojo sin maqueta

- **Contexto.** La pregunta «¿Vas al local ahora?» (`CUS-CHK-004`) no tiene maqueta v3. Desde `0283` los dos casos son prepago (decisión 6): la respuesta ya no cambia las formas de pago; solo cambia que «ahora» no pasa por `validando`, que el GPS no bloquea y que «más tarde» se guarda hasta el cierre sin devolución (`CUS-CHK-015`).
- **Alternativas.** (a) Mantener la pregunta con el mismo texto y la maqueta del checkout sin tarjeta de entrega. (b) Quitar la pregunta y tratar todo recojo igual (exige que el servidor deje de distinguir y es cambio de comportamiento). (c) Mantenerla pero explicar la diferencia en una línea.
- **Recomendación.** (a) ahora, porque no cambia el contrato; revisar (b) después de medir cuánta gente elige «más tarde». Diseñarla una vez resuelta la decisión 6.
- **Afecta.** `CUS-CHK-004`, `CUS-CHK-015`, `CUS-CHK-018`, `CUS-CRT-010`.
- **Fuentes.** `pantallas/CHK-confirmar-pedido.md` («Pendiente»); `packages/contracts/src/payment-rules.ts`.

### F. Subtotal y chip «S/ 20»

- **Contexto.** La maqueta v3 del checkout quitó el **subtotal** y el chip **S/ 20**. El código de Android los tiene: los chips de efectivo son «Exacto / S/ 20 / S/ 50 / S/ 100 / otro» (`CUS-CHK-008`) y el resumen muestra subtotal, envío y total (`CUS-CHK-001`).
- **Alternativas.** (a) Seguir la maqueta: sin subtotal y sin S/ 20. (b) Mantener ambos. (c) Subtotal solo dentro de la hoja «Ver» y chips solo para billetes que el negocio puede vueltear.
- **Recomendación.** (c): el total ya dice cuánto pagar; el subtotal baja a la hoja «Ver», y los chips se limitan por el billete máximo ⚙ `max_cash_bill` y el vuelto ⚙ de la caja esa noche, así «S/ 20» solo aparece si cubre el total. Decide Jesús si el chip de 20 vale cuando el total es menor.
- **Afecta.** `CUS-CHK-001`, `CUS-CHK-008`.
- **Fuentes.** `pantallas/CHK-confirmar-pedido.md` («Pendiente»); `requisitos/CHK.md`.

### G. Cuenta secundaria al prepagar

- **Contexto.** Un negocio puede tener dos cuentas de cobro (hoy «Yape» y «Plin», más un QR de reserva, `CUS-PAY-002`). La maqueta v3 del comprobante resume la segunda en una línea: «¿No funciona? Usa Plin» (Codex sugirió «Usar Plin»). Pero Jesús decidió que el cobro sea **agnóstico a la billetera** (`PATRONES-V2.md` §12), así que rotularla por marca choca.
- **Alternativas.** (a) «Usar otra cuenta» sin marca, colapsada, con su número, titular y «Copiar» al abrirla. (b) Mantener «Usar Plin». (c) Mostrar las dos a la vez.
- **Recomendación.** (a): una sola cuenta a la vista, la otra a un toque y sin marca, y que la primera lleve el número, el titular y «Copiar» (`CUS-PAY-011`).
- **Afecta.** `CUS-PAY-002`, `CUS-PAY-011`, `CUS-PAY-012`, `CUS-TRK-018`.
- **Fuentes.** `tindivo-auditorias/2026-11-16-ux-movil/v3/comprobante-inventario.md`; `comprobante-codex.md`; `PATRONES-V2.md` §12.

### H. Datos del motorizado: foto, placa, teléfono

- **Contexto.** Hoy la web da solo el nombre; el teléfono viaja **solo** cuando el motorizado llegó (`CUS-TRK-007`). La maqueta v3 sacó moto y placa. `propuestas-patrones.md` lo marca como «decisión de Jesús, no de diseño». Es un dato personal de un tercero.
- **Alternativas.** (a) Solo el nombre (hoy). (b) Nombre y foto. (c) Nombre, foto, moto y placa. (d) Además, el teléfono siempre.
- **Recomendación.** (b) cuando el motorizado ya aceptó, y el teléfono solo al llegar como hoy. La foto y la placa ayudan a reconocerlo en la puerta y bajan la desconfianza, pero exigen consentimiento del motorizado y una política de datos (Ley 29733): **datos**, con revisión de Jesús.
- **Afecta.** `CUS-TRK-007`, `CUS-ENT-014`.
- **Fuentes.** `tindivo-auditorias/2026-11-16-ux-movil/propuestas-patrones.md` («Seguimiento»); `v3/seguimiento-inventario.md`.

### I. Estado «va a recoger»

- **Contexto.** El seguimiento proyecta cuatro pasos (`CUS-TRK-002`): `heading_to_restaurant` y `waiting_at_restaurant` caen en «Preparando». La maqueta propone un estado nuevo «motorizado yendo a recoger». Android ya tiene «Va a recoger» en Entregas (`courier_headline_going`), no en pedidos de restaurante.
- **Alternativas.** (a) Mantener cuatro pasos. (b) Añadir una línea de detalle dentro de «Preparando» (sin paso nuevo). (c) Añadir un paso.
- **Recomendación.** (b): no cambia la proyección ★ de paridad (`CUS-TRK-002`) ni los vectores de conformidad, y da la sensación de avance. Con (c) habría que cambiar la proyección en el servidor y en las dos apps.
- **Afecta.** `CUS-TRK-002`, `CUS-TRK-003`.
- **Fuentes.** `propuestas-patrones.md` («Seguimiento»); `packages/contracts/src/order-status.ts`.

### J. Captura al pagar al recibir

- **Contexto.** `propuestas-patrones.md` propone «subir captura opcional en contra entrega con Yape». Hoy la captura existe solo en el prepago (`CUS-PAY-003/004`); en contra entrega Yape el cliente le transfiere al motorizado en la puerta y el motorizado confirma el cobro.
- **Alternativas.** (a) No hay captura en contra entrega. (b) Captura opcional, sin validación, como evidencia. (c) Captura obligatoria.
- **Recomendación.** (a) por ahora: añade una pantalla y una regla (¿quién la revisa?) sin que nadie la revise hoy. Si el problema es el cobro disputado, mejor medir primero cuántos casos hay. Si se acepta (b), la decisión G y `CUS-PAY-013` aplican.
- **Afecta.** `CUS-PAY-013`, `CUS-PAY-003`, `CUS-CHK-021`.
- **Fuentes.** `propuestas-patrones.md` («Seguimiento»).

### K. `strikes.blockThreshold` = 2 igual a `prepaymentOnlyThreshold` = 2

- **Contexto y medición.** En `app_settings.strikes` de producción (2026-11-16): `prepaymentOnlyThreshold` 2, `temporaryBlockThreshold` 3, `temporaryBlockDays` 30, `blockThreshold` 2. En el código, las funciones SQL leen `prepaymentOnlyThreshold` y usan `blockThreshold` **solo como respaldo** si el primero falta (`coalesce(prepaymentOnlyThreshold, blockThreshold, 2)`: `0044:145-146,162,245`; `0277:391`; `0286:70`). El bloqueo total lo da `temporaryBlockThreshold` (3 faltas, 30 días). Es decir: `prepaymentOnlyThreshold` decide cuándo solo se puede pagar por adelantado; `blockThreshold` es un valor heredado de `0013` que hoy no decide nada mientras exista el otro; y el bloqueo total es otro número. Por eso la pantalla v3 usa `prepaymentOnlyThreshold`.
- **Alternativas.** (a) Dejar los dos iguales y no tocar nada. (b) Retirar `blockThreshold` con una migración que quite el respaldo. (c) Documentar `blockThreshold` como heredado.
- **Recomendación.** (c) ahora y (b) en una migración propia, con revisión (toca antifraude). En los textos del cliente y de los Términos hablar siempre de «2 faltas → solo pago adelantado» y «3 faltas → bloqueo de 30 días», con los valores de ⚙, nunca de `blockThreshold`.
- **Afecta.** `CUS-CHK-007`, `CUS-CHK-021`, `CUS-CHK-012`.
- **Fuentes.** `Docs/trabajo/.../app-settings-prod-2026-11-16.md` (nota final); `supabase/migrations/0013`, `0044`, `0277`, `0286`; `DECISIONS.md` §8 (línea 310).

### L. Qué se puede enviar por Entregas

- **Contexto.** Jesús decidió el 2026-11-16 (C4) los prohibidos **como inDrive Perú**: drogas y sustancias psicotrópicas, armas y municiones, explosivos, pirotecnia e inflamables, material obsceno, objetos robados o de venta prohibida, animales vivos; **efectivo y joyas sí**, declarándolos al pedir. Además, «que quepa dentro de la mochila del motorizado» + 5 kg, sin medida en cm. El canon escrito (`Docs/negocio/servicios/entregas.md`) dice lo contrario en tres puntos: **no** se lleva dinero ni valores, ni documentos de identidad, ni alcohol, y fija la mochila en 45 × 45 × 45 cm. Android muestra «Sin alcohol, sin nada que necesite receta especial ni refrigeración» y la categoría «Documentos».
- **Alternativas.** (a) Gana la decisión de Jesús: se reescribe `entregas.md` y el texto de la app. (b) Gana el canon actual. (c) Mixto: cambiar los prohibidos pero mantener el alcohol y los documentos de identidad fuera.
- **Recomendación.** (a), porque es la decisión más reciente, y dejar explícito si el **alcohol** (que no está en la lista de inDrive citada) y los **documentos de identidad** siguen prohibidos. Llevar efectivo o joyas es **dinero y seguridad**: definir quién responde si se pierde y el tope (el borrador de 2026-09 decía S/ 200, sin revisión legal). Requiere Codex.
- **Afecta.** `CUS-ENT-006`, `CUS-ENT-008`, `CUS-ENT-010`, `CUS-ENT-011`, `CUS-ENT-020`.
- **Fuentes.** `decisiones-jesus-ronda2.md` (C4 y «Respuestas de Jesús»); `Docs/negocio/servicios/entregas.md` («Qué se lleva y qué no»); `customer/src/main/res/values/strings.xml` (`courier_allowed_info`).

### M. Cómo reembolsa Store sin retener fondos

- **Contexto.** La decisión del 2026-11-16 (segunda vuelta) hace que Tindivo actúe como intermediario de Store: atiende reclamos por WhatsApp, puede sancionar al proveedor y **puede reembolsar** si el producto es defectuoso o no corresponde, con 24 h para reclamar. Pero el canon dice que Store no registra cobros: el pago es al recibir, en efectivo o Yape, fuera de la plataforma; y el principio general es que Tindivo no retiene fondos (`AGENTS.md`). No hay forma definida de que Tindivo devuelva un dinero que nunca pasó por Tindivo.
- **Alternativas.** (a) Tindivo reembolsa de su caja y se lo cobra al proveedor. (b) El proveedor reembolsa y Tindivo solo ordena y sanciona. (c) Tindivo cobra Store por la plataforma (cambia el principio de no retener fondos).
- **Recomendación.** (b) o (a) según el margen real; en el texto, solo «Tindivo evalúa y, si corresponde, reembolsa», sin plazo ni medio. **Dinero**: no se implementa nada antes de la revisión de Jesús y de Codex. Si Store sigue con una sola pieza vendida a la vez y pocas ventas, la política puede esperar a que haya ventas reales (al 2026-10-10: ninguna pieza cargada).
- **Afecta.** `CUS-STO-007`, `CUS-STO-008`.
- **Fuentes.** `decisiones-jesus-ronda2.md` («Segunda vuelta», «Respuestas de Jesús»); `Docs/negocio/servicios/store.md` («El dinero»).

---

### N. Reaceptación de Términos: al abrir o al actuar

- **Contexto:** Jesús decidió (2026-11-16) una ventana obligatoria cuando cambian los Términos. La auditoría del flujo
  (`flujos/acceso-y-datos.md`) recomienda pedirla al **actuar** (pedir, abrir Cuenta), no al abrir la app.
- **Alternativas:** (1) al abrir, bloquea todo; (2) al actuar, se puede mirar el menú.
- **Recomendación:** (2). **Afecta:** AUT (reaceptación), `pantallas/AUT-terminos-actualizados.md`.

### O. Casilla de Términos: siempre junto a Google o solo si falta

- **Alternativas:** (A) casilla siempre, desmarcada, antes de «Continuar con Google» (Hydrogen); (B) Google primero y la
  casilla solo si falta la aceptación vigente (Codex).
- **Recomendación:** (A). **Afecta:** `pantallas/AUT-entrar.md`.

### P. Un interruptor de notificaciones o dos

- **Contexto:** Jesús decidió «un solo permiso, como Yape». La auditoría propone mantener **un** permiso del sistema pero
  **dos** interruptores en Cuenta: «Pedidos» y «Promociones» (consentimiento comercial libre, Ley 29733: A VERIFICAR).
- **Recomendación:** dos interruptores. **Afecta:** NOT, ACC, `pantallas/ACC-cuenta.md`. Va junto con A.

### Q. Celular que ya pertenece a otra cuenta

- **Recomendación:** traslado con límites; si no procede, «Escribir por WhatsApp» o «Probar otro número» (nunca un
  callejón). **Afecta:** AUT-008, `pantallas/AUT-celular.md`.

### R. Abrir un pedido ajeno (enlace o aviso)

- **Recomendación:** «No puedes abrir este pedido», sin decir de quién es. **Afecta:** TRK, deep links (por crear).

### S. A quién se paga «al recibir» con billetera digital (dinero: revisión de Jesús)

- **Contexto:** la maqueta v3 muestra el número **del negocio** con titular y «Copiar»; el código Android de `CHK` dice
  «al motorizado en tu puerta». Cambia quién recibe el dinero y cómo se concilia.
- **Alternativas:** (1) al motorizado; (2) al negocio. **Sin recomendación**: es decisión de negocio y de dinero.
- **Afecta:** CHK-006, PAY (pago al recibir), `pantallas/PAY-pago-al-recibir.md`, `pantallas/TRK-seguimiento.md`.

## Contradicciones revisadas que no quedan abiertas

Se verificaron todas antes de anotarlas. Estas dos no son decisiones pendientes:

- **2. Comisión de delivery, S/ 1,50 o S/ 1,00: ya está resuelta.** `DECISIONS.md` (líneas 149-165) la corrigió el 2026-10-10, confirmada por Jesús: la comisión por pedido con entrega es **S/ 1,50**; S/ 1,00 es la del **recojo**. Lo repiten `Docs/negocio/dinero.md` (líneas 25-26) y `Docs/negocio/plataforma.md` (línea 70). El «S/ 1,00 (§4)» que se cita todavía aparece solo en dos documentos de trabajo (`Docs/trabajo/movil/02-auditoria-backend/05-datos-y-consistencia.md:228` y `06-proceso-calidad-y-operacion.md:115`), y ahí se cita como el error ya corregido. No se anota. El valor vivo es ⚙ `commissions.delivery` en `app_settings`, que no se leyó para esta verificación (el extracto de `app_settings` de producción lo trata como interno).
- **4. REST solo o mixto: real como contradicción entre documentos, pero ya resuelta.** `Docs/planes/movil/decisiones.md:122` (`D-21`) recomienda la opción C («mixto mínimo»: lecturas simples y tiempo real directos con RLS). `Docs/planes/movil/contrato-rest.md:113` registra que `D-21` pasó a «**REST como contrato del dominio**, sustituye a la opción C», y la invariante 11 del `AGENTS.md` dice que el contrato REST v1 manda. Falta solo corregir `decisiones.md` (y las frases «Superficie móvil propuesta» de `CUS-cliente.md`, que no se migraron: el contrato vigente es `contrato-rest.md`). No requiere decisión de Jesús.
