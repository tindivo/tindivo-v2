# App cliente — decisiones abiertas

> Estado: **propuesto**, pendiente de aprobación de Jesús · Actualizado el 2026-11-17 con las decisiones de Jesús de ese día y contrastado con las juntas del 17-nov (`tindivo-auditorias/2026-11-16-ux-movil/v3/junta-17nov/conclusion.md` y `junta-17nov-b/conclusion.md`, críticas de diseño sin valor de firma ni de asesoría legal; todo lo jurídico va **A VERIFICAR**) ·
> Regla (README, «Cómo se mantiene», punto 4): lo que se decide y aún no se diseña vive aquí, nunca en un comentario suelto.
> Los puntos que tocan dinero o datos llevan la marca **dinero** o **datos**: requieren la revisión explícita de Jesús y la de Codex antes de aplicarse. Las decisiones resueltas están en la sección «Resueltas el 2026-11-17», con su efecto en los requisitos y las pantallas.

## Índice de lo que sigue abierto

| | Tema | Tipo | Bloquea |
|---|---|---|---|
| G | Cuenta secundaria al pagar con Yape o Plin | diseño · **dinero** | `CUS-PAY-014` |
| H | Foto del motorizado (el resto se resolvió) | diseño · **datos** | `CUS-TRK-021` |
| I | Estado «va a recoger» | diseño | `CUS-TRK-002` |
| K | `strikes.blockThreshold` = 2 igual a `prepaymentOnlyThreshold` = 2 | aclaración | `CUS-CHK-007`, `CUS-CHK-024` |
| M | Cómo reembolsa Store sin retener fondos (pospuesto con Store) | diseño · **dinero** | `CUS-STO-008` |
| U | Quién atiende «Ayuda con este pedido» | operación | `CUS-SUP-006`, `CUS-CAT-026` |
| V | Revisión de capturas, plazo del prepago y doble cobro | **dinero** | `CUS-PAY-014/015` |
| W | Efecto de la falta «no se presentó» y destino del dinero prepagado | **dinero** | `CUS-TRK-022` |
| X | Entregas: lo que no está en la lista de inDrive (punto menor) | diseño | `CUS-ENT-022` |
| Y | Dudas menores de las decisiones del 17-nov | diseño | varios |
| Z | Requisitos de las tiendas para el lanzamiento conjunto | **A VERIFICAR** | plan de lanzamiento |

---

### G. Cuenta secundaria al pagar con Yape o Plin

- **Contexto.** Un negocio puede tener dos cuentas de cobro (hoy «Yape» y «Plin», más un QR de reserva, `CUS-PAY-002`). La maqueta v3 del comprobante resume la segunda en una línea: «¿No funciona? Usa Plin» (Codex sugirió «Usar Plin»). El 2026-11-17 Jesús revirtió la billetera agnóstica: la opción se llama «Yape o Plin», con logos, y es **un solo pago** (decisión 2). Queda sin decidir si hay una segunda cuenta visible. La junta (17-nov, B, punto 10) recomienda un solo destino visible, fijado al crear el pedido, sin segunda cuenta ni pago dividido; la maqueta `Comprobante-plin` aún dibuja «Usa otra cuenta».
- **Alternativas.** (a) «Usar otra cuenta», colapsada, con su número, titular y «Copiar» al abrirla. (b) Mantener «Usar Plin». (c) Mostrar las dos a la vez.
- **Recomendación.** (d) un solo destino (junta B). Si algún negocio usa números distintos para Yape y Plin y quién puede cambiar el destino: por confirmar. Si no, (a): una sola cuenta a la vista, la otra a un toque y sin marca, y que la primera lleve el número, el titular y «Copiar» (`CUS-PAY-011`).
- **Afecta.** `CUS-PAY-002`, `CUS-PAY-011`, `CUS-PAY-012`, `CUS-TRK-018`.
- **Fuentes.** `tindivo-auditorias/2026-11-16-ux-movil/v3/comprobante-inventario.md`; `comprobante-codex.md`; `PATRONES-V2.md` §12.

### H. Foto del motorizado

- **Contexto.** El 2026-11-17 Jesús decidió que el cliente ve el **nombre completo** del motorizado y **no** ve teléfono, WhatsApp ni placa (`CUS-TRK-021`). No dijo nada de la foto: la maqueta dibuja un avatar (foto, o iniciales si no hay). Es un dato personal de un tercero.
- **Alternativas.** (a) Solo iniciales. (b) Avatar con foto solo si existe, está vigente y el motorizado dio su consentimiento; si no, iniciales (propuesta de la junta A, T4).
- **Recomendación.** (b), con política de datos (Ley 29733, A VERIFICAR). **Datos.**
- **Afecta.** `CUS-TRK-021`, `CUS-ENT-014`.

### I. Estado «va a recoger»

- **Contexto.** El seguimiento proyecta cuatro pasos (`CUS-TRK-002`): `heading_to_restaurant` y `waiting_at_restaurant` caen en «Preparando». La maqueta propone un estado nuevo «motorizado yendo a recoger». Android ya tiene «Va a recoger» en Entregas (`courier_headline_going`), no en pedidos de restaurante.
- **Alternativas.** (a) Mantener cuatro pasos. (b) Añadir una línea de detalle dentro de «Preparando» (sin paso nuevo). (c) Añadir un paso.
- **Recomendación.** (b): no cambia la proyección ★ de paridad (`CUS-TRK-002`) ni los vectores de conformidad, y da la sensación de avance. Con (c) habría que cambiar la proyección en el servidor y en las dos apps.
- **Afecta.** `CUS-TRK-002`, `CUS-TRK-003`.
- **Nota.** La junta (17-nov, B, punto 11) coincide con (b): línea de detalle dentro de «Preparando» («El motorizado va al local» / «está esperando en el local»); «Listo» solo con la preparación confirmada. Jesús aún no lo ratificó.
- **Fuentes.** `propuestas-patrones.md` («Seguimiento»); `packages/contracts/src/order-status.ts`.

### K. `strikes.blockThreshold` = 2 igual a `prepaymentOnlyThreshold` = 2

- **Contexto y medición.** En `app_settings.strikes` de producción (2026-11-16): `prepaymentOnlyThreshold` 2, `temporaryBlockThreshold` 3, `temporaryBlockDays` 30, `blockThreshold` 2. En el código, las funciones SQL leen `prepaymentOnlyThreshold` y usan `blockThreshold` **solo como respaldo** si el primero falta (`coalesce(prepaymentOnlyThreshold, blockThreshold, 2)`: `0044:145-146,162,245`; `0277:391`; `0286:70`). El bloqueo total lo da `temporaryBlockThreshold` (3 faltas, 30 días). Es decir: `prepaymentOnlyThreshold` decide cuándo solo se puede pagar por adelantado; `blockThreshold` es un valor heredado de `0013` que hoy no decide nada mientras exista el otro; y el bloqueo total es otro número. Por eso la pantalla v3 usa `prepaymentOnlyThreshold`.
- **Alternativas.** (a) Dejar los dos iguales y no tocar nada. (b) Retirar `blockThreshold` con una migración que quite el respaldo. (c) Documentar `blockThreshold` como heredado.
- **Recomendación.** (c) ahora y (b) en una migración propia, con revisión (toca antifraude). En los textos del cliente y de los Términos hablar siempre de «2 faltas → solo pago adelantado» y «3 faltas → bloqueo de 30 días», con los valores de ⚙, nunca de `blockThreshold`.
- **Afecta.** `CUS-CHK-007`, `CUS-CHK-021`, `CUS-CHK-012`.
- **Fuentes.** `Docs/trabajo/.../app-settings-prod-2026-11-16.md` (nota final); `supabase/migrations/0013`, `0044`, `0277`, `0286`; `DECISIONS.md` §8 (línea 310).

### M. Cómo reembolsa Store sin retener fondos

- **Contexto.** La decisión del 2026-11-16 (segunda vuelta) hace que Tindivo actúe como intermediario de Store: atiende reclamos por WhatsApp, puede sancionar al proveedor y **puede reembolsar** si el producto es defectuoso o no corresponde, con 24 h para reclamar. Pero el canon dice que Store no registra cobros: el pago es al recibir, en efectivo o Yape, fuera de la plataforma; y el principio general es que Tindivo no retiene fondos (`AGENTS.md`). No hay forma definida de que Tindivo devuelva un dinero que nunca pasó por Tindivo.
- **Alternativas.** (a) Tindivo reembolsa de su caja y se lo cobra al proveedor. (b) El proveedor reembolsa y Tindivo solo ordena y sanciona. (c) Tindivo cobra Store por la plataforma (cambia el principio de no retener fondos).
- **Recomendación.** (b) o (a) según el margen real; en el texto, solo «Tindivo evalúa y, si corresponde, reembolsa», sin plazo ni medio. **Dinero**: no se implementa nada antes de la revisión de Jesús y de Codex. Si Store sigue con una sola pieza vendida a la vez y pocas ventas, la política puede esperar a que haya ventas reales (al 2026-10-10: ninguna pieza cargada).
- **Estado 2026-11-17.** Store sale después del lanzamiento (decisión 17): este punto no bloquea el lanzamiento y se retoma al volver Store. La junta (17-nov, B, punto 13) recomendó (a): Tindivo reembolsa de su caja por Yape o Plin al pagador real verificado y lo registra en `business_charges`, sin publicar plazos de evaluación ni abono. **Nada se implementa antes de la revisión de Jesús y de Codex.**
- **Afecta.** `CUS-STO-007`, `CUS-STO-008`.
- **Fuentes.** `decisiones-jesus-ronda2.md` («Segunda vuelta», «Respuestas de Jesús»); `Docs/negocio/servicios/store.md` («El dinero»).

### U. Quién atiende «Ayuda con este pedido»

- **Contexto.** Jesús quitó el contacto del negocio y del motorizado y dejó «Ayuda con este pedido», que abre el WhatsApp de soporte. Los tres de la junta A coinciden en que **eliminar teléfonos no crea capacidad de atención**: sin responsable y horario definidos, el botón no resuelve.
- **Decide Jesús.** Quién responde cada incidencia (pago, preparación, entrega), en qué horario y qué puede resolver; si mientras tanto se deja «Contactar al local por este pedido» solo dentro de un pedido activo. Riesgo de desintermediación aceptado a cambio de no dejar al cliente atrapado.
- **Afecta.** `CUS-SUP-006`, `CUS-CAT-026`, `CUS-TRK-021`.

### V. Revisión de capturas, plazo del prepago y doble cobro (dinero)

- **Contexto.** Jesús decidió que restaurante y motorizado asignado ven la captura y que solo el restaurante confirma (`CUS-PAY-015`). La junta A (T7) y la junta B dejan sin resolver:
  1. Quién revisa las capturas y con qué cobertura durante la entrega; qué hace el motorizado si la revisión demora; cómo se le avisa de que su pantalla quedó vieja.
  2. El plazo del prepago (⚙, hoy 15 min): desde cuándo corre (aceptación), qué pasa al vencer y que una captura enviada a tiempo no caduque mientras la caja demora.
  3. Doble cobro (el cliente sube captura y además paga al motorizado): quién devuelve el excedente y en qué plazo; no se muestra «Reembolso realizado» sin confirmación de quien tiene el dinero.
  4. Qué ve el motorizado: imagen completa (lo decidido), con acceso deliberado «Ver captura» y solo mientras no esté aprobada (recomendación de la junta).
- **A VERIFICAR.** Ley 29733 (que el repartidor vea datos del pagador, retención de las capturas, aviso informado), Ley 29571 y la declaración de seguridad de datos de Google Play.
- **Afecta.** `CUS-PAY-014`, `CUS-PAY-015`, `CUS-TRK-005`.

### W. Efecto de la falta «no se presentó» y destino del dinero prepagado (dinero)

- **Contexto.** Jesús decidió que, si el cliente no se comunica en la noche, el pedido se marca «no se presentó» con la función existente y el cliente recibe la falta; Jesús puede confirmarla o anularla desde el admin (`CUS-TRK-022`).
- **Sin decidir.** (1) Si la falta ya cuenta (prepago obligatorio, bloqueo) antes de que Jesús la confirme o si nace «en revisión» sin efecto, como recomienda la junta B. (2) **Qué pasa con el dinero de un pedido prepagado que termina en «no se presentó»** o en recojo no recogido («sin devolución»: A VERIFICAR Ley 29571). Cualquier ajuste se escribe solo en `business_charges` (invariante 9). (3) Sin comprobar en el código: qué hace `CUS-PAY-009`, si `prepay_timeout` escribe falta y si el RPC `0224` registra el contacto.
- **Afecta.** `CUS-TRK-022`, `CUS-TRK-015`, `CUS-SUP-005`, `CUS-PAY-009`, `CUS-ENT-021`.

### X. Entregas: lo que no está en la lista de inDrive

- **Contexto.** El 2026-11-17 Jesús decidió que Entregas sigue la lista de prohibidos de inDrive (resuelta, ver abajo). Lo que esa lista no trata queda por decidir: **medicamentos** (la categoría «Medicinas» y el texto de Android «sin nada que necesite receta especial»), y si siguen prohibidos los «animales vivos» y los «objetos robados» de la decisión del 2026-11-16, que inDrive no lista.
- **Recomendación.** Decidir cada uno por separado; mientras tanto no prometerlos como prohibidos ni como permitidos en la app.
- **Afecta.** `CUS-ENT-006`, `CUS-ENT-022`.

### Y. Dudas menores de las decisiones del 17-nov

- **Chip «S/ 20» del efectivo:** la maqueta del checkout trae Exacto / S/ 50 / S/ 100 / Otro; `CUS-CHK-008` sigue como está hasta que Jesús diga si el chip de 20 vale.
- **Tarjeta de Store en el Inicio:** la decisión 5 fija su texto («Variedad de productos») y la 17 saca Store del lanzamiento: ¿se oculta la tarjeta?
- **`pickupTiming`:** el servidor lo exige en recojo (422); la app ya no pregunta. Qué valor envía debe fijarse con el contrato REST v1 sin romper clientes instalados.
- **Modo catálogo:** «Pedir por WhatsApp» y «Llamar» (`CUS-CAT-015`) conviven con «sin contacto» de la información del negocio: confirmar que no cambian.
- **Texto exacto** de la invitación a notificaciones y de la línea bajo «Te llamaremos para confirmar tu pedido»: son propuestas de la junta.

### Z. Requisitos de las tiendas para el lanzamiento conjunto (A VERIFICAR)

- **Contexto.** Android e iOS salen juntos (decisión 18). Riesgos que señala la junta B, todos sin verificar contra fuentes externas: «Iniciar sesión con Apple» si hay Google (y el correo oculto crea una segunda cuenta que choca con un celular por cuenta); eliminación de cuenta dentro de la app; el revisor de Apple prueba desde fuera de Perú (cuenta demo y flujo de prueba por el SMS +51 y la llamada humana); declaración de seguridad de datos de Play; pagos externos (Yape y Plin) por bienes físicos; sin garantía de publicar a la misma hora.
- **Decide Jesús.** La fecha según la ruta más larga (iOS no ha empezado, hay dos revisiones de tienda); si es inamovible se recorta alcance (Store, promociones y traslado de celular ya están recortados), y si el alcance es inamovible se mueve la fecha.

---

## Backlog

- **Revisión formal de faltas** (antes decisión C, «Cómo auditar faltas sin apelación»). Decisión de Jesús del 2026-11-17: va al backlog, no es una decisión pendiente del lanzamiento. Contexto para cuando se retome: evidencia mínima por falta (hora de «llegué» y fin de la espera, intento de contacto con hora y resultado, ubicación con su precisión, quién registró y quién decidió), confirmación idempotente (un reintento o dos revisores no duplican faltas), una anulación recalcula las restricciones, revisión por muestra, cifras (2 faltas, 3 faltas, 30 días) en «Reglas vigentes» con versión y fecha. Decidir también el destino de `CUS-PAY-009`. **Dinero.**

---

## Resueltas el 2026-11-17

Decisiones de Jesús del 2026-11-17. Cada una está escrita en el requisito o la pantalla que cambia, con esa fuente.

| | Tema | Decisión (una línea) | Dónde quedó |
|---|---|---|---|
| 1 | Referencia mínima de la dirección | Se ratifica el mínimo de 5 caracteres. | `CUS-ADR-001` |
| 3 | Prefijo del código de pedido | Gana `#TDV-`; se corrige el canon, aparte. | `CUS-ORD-007`, `CUS-ORD-004` |
| 5 | Orden de las apps | Android e iOS se lanzan juntos, en la misma fecha; la paridad se asegura con vectores de conformidad JSON compartidos. | `README.md`, `Docs/arquitectura/apps-nativas.md` §8 |
| 6 | Formas de pago en recojo «ahora» | Todo recojo se paga por adelantado. | `CUS-CHK-028` |
| A | Notificaciones obligatorias o no | No son obligatorias; permiso tras el primer pedido confirmado. | `CUS-NOT-005` |
| B | «No se presentó» | Si en la noche el cliente no se comunica, se marca «no se presentó» y recibe la falta; Jesús la confirma o anula en el admin (el efecto sigue en W). | `CUS-TRK-022` |
| C | Auditar faltas sin apelación | La revisión formal va al backlog. | «Backlog» |
| D | Texto de `validando` | «Te llamaremos para confirmar tu pedido», con el número verificado debajo. | `CUS-CHK-027` |
| E | Variante de recojo sin maqueta | Se retira «¿Vas al local ahora?». | `CUS-CHK-028` |
| F | Subtotal | El checkout muestra siempre subtotal, envío y total (el chip «S/ 20» sigue en Y). | `CUS-CHK-026` |
| H | Datos del motorizado | Nombre completo; sin teléfono, WhatsApp ni placa (la foto sigue en H). | `CUS-TRK-021` |
| J | Captura al pagar al recibir | La captura es opcional para el confiable y obligatoria para el no confiable; la ven restaurante y motorizado y solo el restaurante confirma. | `CUS-PAY-014`, `CUS-PAY-015` |
| L | Qué se puede enviar por Entregas | Se sigue la lista de prohibidos de inDrive (alcohol, tabaco y vapeadores; joyas, metales y piedras preciosas; efectivo, billetes y moneda; armas, municiones y armas blancas; explosivos, pólvora, fuegos artificiales y venenos; drogas; material obsceno; artículos de venta restringida); los documentos sí. Evidencia: `tindivo-auditorias/2026-11-16-ux-movil/v3/entregas-prohibidos.md`. `Docs/negocio/servicios/entregas.md` (canon) se corrige en un PR aparte con aprobación de Jesús. | `CUS-ENT-022` |
| N | Reaceptación de Términos | Al actuar, no al abrir; nunca bloquea un pedido en curso ni el soporte. | `CUS-AUT-027` |
| O | Casilla de Términos | Siempre, desmarcada, antes de «Continuar con Google». | `CUS-AUT-020` |
| P | Uno o dos interruptores | Uno solo, «Avisos de tus pedidos»; las promociones quedan fuera del lanzamiento. | `CUS-NOT-005`, `CUS-NOT-006` |
| Q | Celular de otra cuenta | Lo resuelve soporte por WhatsApp; sin traslado automático. | `CUS-AUT-028` |
| R | Pedido ajeno | «No puedes abrir este pedido», con «Mis pedidos» y «Entrar con otra cuenta». | `CUS-TRK-023` |
| S | A quién se paga con billetera | El pago va al número del negocio, que lo confirma; el confiable puede en cambio pagar al motorizado al llegar. La conciliación sigue sujeta a la revisión de dinero (invariante 9). | `CUS-PAY-014`, `CUS-PAY-015` |
| — | Formas de pago | El confiable elige «Efectivo» o «Yape o Plin» (con logos); se elimina «Al recibir» / «Pagar ahora»; el no confiable ve «Yape o Plin por adelantado». Revierte la billetera agnóstica. | `CUS-CHK-024`, `CUS-CHK-025`, `Docs/negocio/diseno.md` §5 |
| — | Espera de aceptación | Tras confirmar, el pedido espera al negocio (⚙ `timers.acceptance`); el pago se muestra después, dentro del seguimiento. | `CUS-TRK-019`, `CUS-TRK-020` |
| — | Negocio, Inicio y plato | Sin contacto en la información; fila «Información del negocio ›»; «Destacados» reutilizable; contador fuera de la foto; Inicio sin nada flotante; plato con `price_display = 'total'` (migración `0156`). | `CUS-CAT-026` a `CUS-CAT-034` |
| 17 | Store | Sale después del lanzamiento. | `STO.md` |
| 18 | Recortes del lanzamiento | Store, promociones y traslado de celular. | `README.md` |

## Contradicciones revisadas que no quedan abiertas

Se verificaron todas antes de anotarlas. Estas dos no son decisiones pendientes:

- **2. Comisión de delivery, S/ 1,50 o S/ 1,00: ya está resuelta.** `DECISIONS.md` (líneas 149-165) la corrigió el 2026-10-10, confirmada por Jesús: la comisión por pedido con entrega es **S/ 1,50**; S/ 1,00 es la del **recojo**. Lo repiten `Docs/negocio/dinero.md` (líneas 25-26) y `Docs/negocio/plataforma.md` (línea 70). El «S/ 1,00 (§4)» que se cita todavía aparece solo en dos documentos de trabajo (`Docs/trabajo/movil/02-auditoria-backend/05-datos-y-consistencia.md:228` y `06-proceso-calidad-y-operacion.md:115`), y ahí se cita como el error ya corregido. No se anota. El valor vivo es ⚙ `commissions.delivery` en `app_settings`, que no se leyó para esta verificación (el extracto de `app_settings` de producción lo trata como interno).
- **4. REST solo o mixto: real como contradicción entre documentos, pero ya resuelta.** `Docs/planes/movil/decisiones.md:122` (`D-21`) recomienda la opción C («mixto mínimo»: lecturas simples y tiempo real directos con RLS). `Docs/planes/movil/contrato-rest.md:113` registra que `D-21` pasó a «**REST como contrato del dominio**, sustituye a la opción C», y la invariante 11 del `AGENTS.md` dice que el contrato REST v1 manda. Falta solo corregir `decisiones.md` (y las frases «Superficie móvil propuesta» de `CUS-cliente.md`, que no se migraron: el contrato vigente es `contrato-rest.md`). No requiere decisión de Jesús.
