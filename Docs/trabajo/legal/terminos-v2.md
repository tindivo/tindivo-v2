# Términos y Condiciones de Tindivo · v2 (borrador)

> 2026-11-26 · **Borrador de trabajo: no manda ni está publicado.** Lo redactó un agente (Sonnet) a partir de
> `terminos-borrador.md` (24-oct), el canon, las capacidades de la app cliente y las decisiones de Jesús del 26-nov
> (`tindivo-auditorias/2026-11-26-terminos-v2/decisiones-jesus.md`, fuera del repo). **No es asesoría legal ni lo revisó
> un abogado**: lo revisa Jesús (D-04) y, en lo que dice la lista del final, un abogado. Lo que sigue abierto va entre
> corchetes `[POR DECIDIR]` y se resume en «Pendiente», al final. Va dirigido a la **app Android** del cliente; la web
> del cliente queda como página de inicio (D-27). Está escrito para que lo entienda un chico de 14 años.

## Afirmación → fuente

| Afirmación del texto | Fuente |
|---|---|
| Tindivo la opera Jesús como persona natural; contactos y domicilio | `apps/customer/app/privacidad/page.tsx` §1 (rama `docs/privacidad-v2`); `Docs/planes/movil/decisiones.md` D-36 |
| Textos publicados en tindivo.com/terminos, /privacidad y /borrar-cuenta | Jesús, 2026-11-26 (punto 2) |
| Tindivo no retiene fondos: pagas directo al negocio (Yape, Plin o efectivo) | `Docs/negocio/plataforma.md` «Principios» 1; `Docs/negocio/dinero.md` «En una frase» |
| «Tindivo se encarga» de que el negocio cumpla con la entrega, también si la comida llega vencida o en mal estado | Jesús, 2026-11-26 (cláusula 2). Redacción: «se encarga», nunca «garantiza» |
| En Entregas el cliente paga el transporte al motorizado, que lo cobra y es parte de su pago; el texto no fija la cifra | Jesús, 2026-11-26 (punto 12); `Docs/negocio/dinero.md` «Tindivo Entregas» (actualizado en este PR) |
| Las devoluciones las hace Tindivo y se las cobra después al negocio | ADR 0036 (Jesús, 2026-11-26, punto 7: se mantiene); `Docs/negocio/dinero.md` «Reembolsos al cliente» |
| Entrada solo con Google (Apple en iOS); celular verificado por SMS | `Docs/producto/acceso/capacidad.md` CUS-AUT-019, CUS-AUT-007 (PR #201) |
| Casilla de aceptación desmarcada; se guarda versión y fecha; la casilla incluye «Declaro tener la edad mínima» | CUS-AUT-020, CUS-AUT-021 (PR #201); Jesús, 2026-11-26 (punto 3) |
| Reaceptar solo por cambios materiales, con 7 días de aviso; quien no acepta no hace pedidos nuevos, pero cierra lo que tiene en curso o borra su cuenta | Jesús, 2026-11-26 (punto 1); CUS-AUT-027 (PR #201) en cuanto a cuándo aparece la ventana |
| Un número verificado pertenece a una sola cuenta; si ya es de otra, soporte por WhatsApp | CUS-AUT-008, CUS-AUT-028 (PR #201); `movil:D-63` |
| Edad mínima: 14 años; alcohol y tabaco solo para mayores de 18 | `Docs/planes/movil/decisiones.md` D-46 (actualizada en este PR); Jesús, 2026-11-26. Base legal citada por Jesús: D.S. 016-2024-JUS art. 22.2, 22.3 y 25; Ley 28681 |
| Menores: strikes iguales; los padres pueden escribirnos; sin promociones sin permiso de los padres; no dar datos de terceros salvo dirección y celular para entregar | Jesús, 2026-11-26 (propuesta 5) |
| Se puede pedir con entrega o recojo; el negocio confirma antes de preparar | `Docs/negocio/servicios/pedidos-restaurante.md`; `Docs/producto/seguimiento/capacidad.md` CUS-TRK-006 (PR #200) |
| Cancelar libre hasta que el negocio acepta, con devolución completa si ya prepagaste; después, por soporte, caso a caso | Jesús, 2026-11-26 (punto 4) |
| Comida vencida, en mal estado o incompleta: reposición o devolución; reclamo esa noche o hasta el mediodía siguiente, con foto (vía rápida, no caducidad del derecho) | Jesús, 2026-11-26 (propuesta 1) |
| Todo recojo desde la app va prepagado | `Docs/negocio/antifraude.md` «En el mostrador no se fía»; migración 0283 |
| Prepago sobre el monto que indica la app; el resto lo decide el riesgo | `Docs/negocio/antifraude.md` «Cómo se decide…»; `apps/customer/lib/prepay.ts` (no se fija cifra) |
| Antifraude humano: la cajera llama antes de cocinar | `Docs/negocio/plataforma.md` principio 2; `Docs/negocio/antifraude.md` «La llamada» |
| Strikes: 2 → solo prepago; 3 → 30 días sin pedir; recojo ya pagado no genera strike | `Docs/negocio/antifraude.md` «Cómo se decide…» y «Strikes» |
| Los strikes dejan de contar a los 24 meses | `Docs/operacion/retencion-de-datos.md` (fila «Strikes antifraude», migración 0286); Jesús, 2026-11-26 (punto 13): vale cuando la 0286 llegue a prod |
| Destinatario ausente: el motorizado espera 5 minutos y prioriza otras entregas; si nadie se comunica hasta las 23:00, «cliente no habido» y strike | Jesús, 2026-11-26 (punto 6). **Función por implementar** (`Docs/trabajo/backlog.md`) |
| Entregas, cliente no habido: el objeto vuelve a quien lo envió sin cobrar la vuelta; sin ubicar a nadie, Tindivo lo guarda 7 días; la comida no se guarda; el transporte de la ida se paga | Jesús, 2026-11-26 (propuesta 2). **Estados de retorno y custodia por implementar** |
| Entregas: de A a B algo ya coordinado y pagado; 18:00 a 23:00; mochila del motorizado (sin medida en centímetros); límite de peso `courier.maxWeightKg`; un envío activo por celular | `Docs/negocio/servicios/entregas.md`; ADR 0035; `Docs/producto/entregas/capacidad.md` CUS-ENT-002, 008, 012 (PR #199) |
| Entregas: lista de prohibidos como la de inDrive, más animales vivos y objetos robados | `Docs/negocio/servicios/entregas.md` «Qué se lleva y qué no» (decisiones 2026-11-17 y 2026-11-19) |
| Medicamentos: sin mención especial; Tindivo solo lleva lo ya comprado y quien envía responde de que esté permitido | Jesús, 2026-11-26 (punto 5) |
| La comida sí va por Entregas | `Docs/negocio/servicios/entregas.md` «Reglas al pedir» (decisión 2026-11-11) |
| Si nadie acepta en el plazo de la app, se cancela sin cobro | `Docs/negocio/servicios/entregas.md` «El motorizado»; CUS-ENT-016, 017 (PR #199) |
| Entregas, daños y pérdidas: Tindivo responde ante el cliente y lo arregla con el motorizado; tope S/ 200 por envío más la devolución del transporte; reclamo en 24 h con foto | Jesús, 2026-11-26 (propuesta 3); `Docs/negocio/servicios/entregas.md` (actualizado en este PR). **A la lista del abogado** |
| Alcohol y tabaco en pedidos de restaurante: el motorizado puede pedir DNI; si eres menor o no lo muestras, eso no se entrega y se devuelve lo pagado por eso | Jesús, 2026-11-26 (propuesta 4). **Marca +18 en `menu_items` por implementar** |
| La boleta de la comida la da el negocio; de Entregas y Store no se dice nada | Jesús, 2026-11-26 (punto 8) |
| Store: piezas de segunda mano, vende Jesús, se cierra por WhatsApp, sin cobro en la plataforma | `Docs/negocio/servicios/store.md`; `DECISIONS.md` §32 |
| Reseñas: no públicas; el negocio ve nota y etiquetas, nunca el texto | `Docs/negocio/apps.md` (reseñas) |
| Avisos del pedido: opcionales; sin promociones por ahora | `Docs/producto/cuenta/capacidad.md` CUS-ACC-005; CUS-AUT-018 (PR #201) |
| Borrado de cuenta: se escribe `BORRAR`; se bloquea con pedido en curso o dinero sin resolver | `Docs/producto/cuenta/capacidad.md` «Antes de tocar», CA-ACC-04 (PR #201) |
| Qué se conserva al borrar y por cuánto | `Docs/operacion/retencion-de-datos.md`; ver también `privacidad-v2.md` |
| Reseñas tras el borrado: se conserva la nota y las etiquetas, sin comentario | Jesús, opción C, 2026-11-19 (encargo); `retencion-de-datos.md` (migración 0284) |
| Libro de Reclamaciones: se incluye | Jesús, 2026-11-26 (punto 9; hay RUC 10); Ley 29571 (`Docs/trabajo/backlog.md` fila 9). La dirección y el RUC faltan |
| Sin fuero exclusivo: rige la ley peruana y puedes acudir a la autoridad que te corresponda | Jesús, 2026-11-26 (punto 11) |
| Anexo de tiendas: términos mínimos de licencia de Apple (Apple diferido hasta iOS) y nota de Google Play | Jesús, 2026-11-26 (punto 10). Contenido de Apple: las condiciones mínimas del EULA estándar, por contrastar con la guía vigente antes de publicar |

---

**Versión:** 2 · **Vigente desde:** `[POR DECIDIR: fecha]`

## 1. Quién es Tindivo y cómo aceptas estos términos

**1.1. Quién presta el servicio.** Tindivo es un servicio de **Jesús Castillo Vidal**, persona natural.

- Domicilio: C.P. San Jacinto Mz. 51 Lt. 8, distrito de Nepeña, provincia del Santa, Áncash, Perú.
- Correo: tindivodelivery@gmail.com.
- WhatsApp de soporte: +51 906 550 166.

**1.2. Aceptación.** Al entrar a la app marcas la casilla «Acepto los Términos y la Política de privacidad» y declaras
que tienes la edad mínima («Declaro tener la edad mínima»). Guardamos qué versión aceptaste y cuándo. Aceptar no
significa que aceptes recibir promociones.

**1.3. Dónde los lees.** Estos términos están en **tindivo.com/terminos**, la política de privacidad en
**tindivo.com/privacidad** y el borrado de cuenta en **tindivo.com/borrar-cuenta**.

**1.4. Si cambian los términos.** Si el cambio es importante (tus obligaciones, los pagos o el uso de tus datos), te
avisamos **7 días antes** y te pedimos aceptar la nueva versión cuando vayas a pedir o a cambiar tus datos, no al abrir
la app. Los cambios pequeños, como corregir una errata, no piden que aceptes de nuevo.

Si no aceptas, **no puedes hacer pedidos nuevos**. Sí puedes cerrar lo que ya tienes en curso o **borrar tu cuenta**.
Nunca te pedimos aceptar si tienes un pedido en curso, si quieres cancelarlo, si vas a escribir a soporte o si vas a
cerrar sesión.

## 2. Qué es Tindivo y quién hace qué

**2.1.** Tindivo conecta a clientes, negocios locales y motorizados en San Jacinto, Áncash. En los pedidos de
restaurante, **Tindivo no cocina ni recibe tu dinero**: pagas directo al negocio por Yape, Plin o efectivo. Si el
motorizado cobra en efectivo, lo hace en nombre del negocio.

**2.2.** El negocio prepara lo que vende y responde por su comida. El motorizado recoge y entrega. **Tindivo se encarga**
de la plataforma, de coordinar el servicio y de la conducta de sus motorizados. También **se encarga de que el negocio
cumpla con tu entrega**, incluso si la comida llega vencida o en mal estado: mira la cláusula 8. Nada de esto reduce los
derechos que la ley peruana te da como consumidor.

**2.3.** Tindivo Entregas y Tindivo Store son otros servicios, con reglas propias (cláusula 5).

## 3. Tu cuenta

**3.1. Edad.** Debes tener **14 años cumplidos**. Para pedir **alcohol o tabaco** debes tener **18 años cumplidos**
(cláusula 4.6).

**3.2. Si eres menor de edad.** Las reglas, los strikes y los plazos son iguales para ti. Tu mamá, papá o apoderado
puede escribirnos para revisar tu cuenta o tus datos. No te enviamos promociones sin permiso de tus padres. No nos des
datos de tus papás ni de otras personas, salvo la **dirección y el celular** que hagan falta para entregar tu pedido.

**3.3. Cómo entras.** En la app entras con tu cuenta de **Google** (en iPhone, también con Apple). Para hacer tu primer
pedido verificamos tu **celular por SMS**. El SMS sirve para verificar el número, no para entrar a la cuenta.

**3.4. Un número, una cuenta.** Un celular verificado pertenece a una sola cuenta. Si el tuyo ya está en otra, escríbenos
por WhatsApp: no te mostramos nada de la otra cuenta. Si perdiste tu cuenta de Google, también escríbenos.

**3.5. Tus datos.** Escribe un nombre, un celular, una dirección y una referencia correctos. Cuida tu acceso. Si ves
un ingreso que no reconoces, avísanos por WhatsApp.

## 4. Pedidos de restaurante

**4.1. Pedir.** Puedes pedir con entrega o recojo, cuando el negocio lo tenga habilitado. Enviar el pedido no es que ya
esté aceptado: el negocio lo confirma antes de prepararlo. Mira el estado dentro de la app.

**4.2. Horarios y cobertura.** Cada negocio tiene su horario y sus platos pueden agotarse. Entregamos solo dentro de
la cobertura de San Jacinto. Los tiempos que ves son estimados.

**4.3. Plazos.** El negocio tiene un tiempo para aceptar, y tú para pagar o ser validado, según lo que indique la app.
Si se vence, el pedido se cancela.

**4.4. Cancelar.** Puedes cancelar desde la app **hasta que el negocio acepte tu pedido**. Si ya habías pagado por
adelantado, **te devolvemos todo lo que pagaste**. Después de que el negocio acepta, la cancelación se pide por soporte
y se ve **caso por caso**. Un pedido entregado no se cancela; si hay un problema, se reclama (cláusula 8).

**4.5. Recojo.** Todo recojo pedido desde la app va **prepagado**: pagas antes y el pedido llega pagado a cocina.

**4.6. Alcohol y tabaco.** Solo se venden a **mayores de 18 años**. El motorizado puede pedirte tu DNI al entregar. Si
eres menor de 18 o no lo muestras, **no te entrega eso**, te devolvemos lo que pagaste por eso y **el resto de tu
pedido sí se entrega**.

## 5. Tindivo Entregas y Tindivo Store

**5.1. Entregas.** Un motorizado recoge en un punto A algo que **ya está coordinado, pagado y listo**, y lo lleva a un
punto B dentro de San Jacinto. **Tindivo solo lleva lo que ya compraste.** No lo vende, no lo compra ni lo revisa. En
cada envío confirmas que el contenido **ya está pagado** y que **está permitido**: de eso respondes tú. Atendemos de
lunes a domingo, de **18:00 a 23:00** (hora de Lima), si el servicio está encendido. Puedes tener **un envío activo**
por celular.

**5.2. Qué se lleva.** Lo que cabe en la mochila del motorizado y no pasa del peso que indica la app. Se
permiten documentos y comida.

**5.3. Qué no se lleva.** Lo mismo que no lleva inDrive: alcohol, tabaco y vapeadores; joyas, metales y piedras
preciosas; efectivo, billetes y monedas; armas, municiones y armas blancas; explosivos, pólvora, fuegos artificiales y
venenos; drogas; material obsceno; artículos de venta restringida. Además, **animales vivos** y **objetos robados**.
Si lo que envías es frágil, dilo al motorizado cuando llegue a recoger: él decide si puede llevarlo.

**5.4. Pago del transporte.** El precio del transporte lo ves en la app antes de pedir. Lo paga, en efectivo o Yape,
quien entrega el objeto al recogerlo o quien lo recibe al entregarlo. Lo cobra el motorizado y es parte de su pago. El
precio del objeto se paga aparte; no pasa por Tindivo.

**5.5. Cancelación.** Si nadie acepta tu envío en el plazo que indica la app, se cancela **sin cobro**.

**5.6. Si no hay nadie para recibir (cliente no habido).** El motorizado espera **5 minutos** en el destino y puede
atender otras entregas mientras tanto. Si nadie se comunica hasta las **23:00**, el envío queda como **«cliente no
habido»** y quien lo pidió recibe un **strike** (cláusula 7).

- El objeto **vuelve a quien lo envió**, y **no te cobramos la vuelta**.
- Si no se ubica a nadie, Tindivo **guarda el objeto 7 días**. **La comida no se guarda.**
- **El transporte de la ida sí se paga**. Si lo iba a pagar el destinatario, lo paga quien envió cuando recupera el objeto.

**5.7. Daños y pérdidas.** Si el objeto se daña o se pierde en el camino, **Tindivo responde ante ti** y después lo
arregla con el motorizado. Respondemos hasta **S/ 200 por envío**, más la devolución de lo que pagaste por el transporte.
Reclama dentro de **24 horas**, por el WhatsApp de soporte y con una **foto**. **No envíes cosas que valgan más.**

**5.8. Store.** Store muestra piezas únicas de segunda mano vendidas por Jesús. No hay carrito ni cobro en la app:
eliges una pieza y cierras la compra y el pago con Jesús por WhatsApp. El catálogo marca las piezas como disponibles,
reservadas o vendidas. La condición de segunda mano no quita los derechos que te da la ley.
`[POR DECIDIR: reserva, entrega y devoluciones de Store]`

## 6. Precios y pagos

**6.1.** Antes de confirmar, revisa el precio de los productos, el delivery y el total. Los precios de delivery y de
Entregas los fija Tindivo y se muestran en la app.

**6.2. Cómo pagas un pedido de restaurante.** Por Yape, Plin o efectivo, según lo habilitado para tu pedido. Si el total
(con delivery) supera el **monto que indica la app al pagar**, o si Tindivo lo decide por seguridad, debes **pagar por
adelantado**. Si pagas en efectivo, di con cuánto pagas.

**6.3. Comprobante de pago.** En un prepago envías el dinero al destino que te indica la app y **subes la captura real**.
El negocio revisa el pago: subir la imagen no significa que ya se verificó. La captura no es una boleta.

**6.4. Boleta.** La boleta de tu comida la da el **negocio**.

## 7. Verificación y faltas

**7.1. Llamada de verificación.** Para proteger a los negocios del fraude, en algunos pedidos la cajera te llama antes
de cocinar. Tindivo decide qué formas de pago tienes según cada caso y la app te las muestra antes de confirmar.

**7.2. Strikes.** Si el motorizado llega y no apareces, y espera el tiempo que indica la app, puede reportarlo y recibes
un **strike** (una falta). También si no vienes a un recojo (si el recojo estaba pagado, no hay strike) o si tu envío queda como
«cliente no habido» (cláusula 5.6). Con **dos strikes** solo puedes pedir con prepago. Con **tres**, no puedes pedir por
**treinta días**. Los strikes se vinculan a tu teléfono y, en entregas, a la dirección. Dejan de contar a los **24
meses**. Si crees que un strike es un error, escríbenos. Si eres menor, tu mamá, papá o apoderado puede escribirnos para
revisarlo.

## 8. Reclamos y devoluciones

**8.1. Dónde reclamar.** Escribe al WhatsApp de soporte diciendo qué pedido y qué pasó. Lo de la plataforma y la entrega
lo ve Tindivo; en Store, Jesús como vendedor.

**8.2. Comida vencida, en mal estado o incompleta.** Tú eliges: que **te la repongan** o que **te devuelvan tu dinero**.
Escríbenos por WhatsApp **esa misma noche o hasta el mediodía siguiente**, con una **foto**. Es la vía rápida: si pasa
ese plazo, igual puedes reclamar y lo vemos. Si eliges la devolución, **Tindivo te devuelve tu dinero y se lo cobra
después al negocio**. Tindivo adelanta la devolución, no guarda tu dinero.

**8.3. Otras devoluciones de pedidos de restaurante.** Si el negocio rechazó por error tu comprobante y tu apelación se
aprueba, la devolución también la hace Tindivo, y se la cobra al negocio. `[POR DECIDIR: medio y plazo de las devoluciones]`

**8.4. Entregas.** Si una Entrega se cancela después de cobrado el transporte, la devolución la hace Tindivo. Los daños y
las pérdidas se ven en la cláusula 5.7.

**8.5. Libro de Reclamaciones.** Tindivo tiene su **Libro de Reclamaciones**, como manda la Ley 29571. Lo encuentras en
`[POR DECIDIR: dirección del Libro de Reclamaciones]`. Proveedor: Jesús Castillo Vidal, RUC `[POR DECIDIR: número de
RUC]`. Usarlo no te quita ninguna otra vía de reclamo.

**8.6.** Escribirnos no te quita las vías de reclamo que la ley te da como consumidor.

## 9. Conducta y reseñas

**9.1.** No uses Tindivo para pedidos falsos, comprobantes alterados, suplantar a otra persona, enviar objetos
prohibidos o molestar al servicio. Trata bien a negocios, motorizados y soporte.

**9.2. Reseñas.** Las reseñas **no son públicas**. El negocio ve tu nota y las etiquetas, **no tu comentario**; el
comentario lo ve el equipo de Tindivo. No lo usamos como publicidad. No escribas datos de otras personas.

## 10. Avisos y promociones

**10.1.** Los avisos del pedido (por notificación de tu celular) son **opcionales**: puedes apagarlos en **Cuenta** o
en los ajustes del teléfono, y entonces consultas el estado dentro de la app.

**10.2.** Hoy **no enviamos promociones**. Si algún día lo hacemos, te lo pediremos aparte, con un control apagado por
defecto. A menores de edad no les enviamos promociones sin permiso de sus padres.

## 11. Tus datos personales

Cómo usamos tus datos, con quién los compartimos y cómo ejercer tus derechos está en la **Política de Privacidad**
(tindivo.com/privacidad). Aceptar estos términos no reemplaza los consentimientos que la ley pida por separado.

## 12. Borrar tu cuenta

**12.1. Cómo.** En la app: **Cuenta → Borrar mi cuenta**, escribiendo `BORRAR`. Si ya no tienes la app, entra a
**tindivo.com/borrar-cuenta**.

**12.2. Cuándo no se puede.** Si tienes un pedido en curso, una apelación o devolución pendiente, o dinero sin
resolver, la app te dice el motivo y no borra; cuando se resuelva, lo pides de nuevo. Si tu cuenta también es de negocio o
motorizado, lo cierra soporte.

**12.3. Qué pasa.** El borrado es inmediato y **no se puede deshacer**. Se borran tu perfil, direcciones guardadas, avisos
y tu acceso. Los pedidos se **conservan sin tus datos** (nombre, teléfono, dirección, referencias, coordenadas y
notas): esa es la caja del negocio. De tus reseñas se conservan la **nota y las etiquetas, sin tu nombre ni tu
comentario**. Los comprobantes de pago se eliminan a los **90 días del borrado**.

**12.4. Qué no se borra.** El directorio que usa la cajera y el historial antifraude de tu teléfono siguen hasta que
vence su plazo (24 meses, ver la Política de Privacidad); por eso borrar la cuenta no quita una restricción vigente.

## 13. Disponibilidad, cambios y ley

**13.1.** La app puede fallar por mantenimiento, conexión o terceros, y puede pedirte actualizarla.

**13.2.** Estos términos se rigen por las leyes del Perú. Puedes acudir a la autoridad que te corresponda como
consumidor. Ninguna cláusula renuncia a tus derechos.

---

# Anexo de tiendas de aplicaciones

> Borrador. Apple se publica cuando exista la app de iPhone (iOS está diferido); hasta entonces solo aplica Google Play.
> Las condiciones de Apple son las mínimas que exige su contrato de licencia estándar para apps; **hay que contrastarlas
> con la guía vigente de Apple antes de publicar**.

**A. Si descargas la app de la App Store de Apple** (cuando exista)

1. Estos términos son entre tú y **Tindivo (Jesús Castillo Vidal)**, no con Apple. Tindivo es el único responsable de la
   app y de su contenido.
2. Tienes una licencia limitada, personal, que no se puede transferir, para usar la app en aparatos de Apple que sean
   tuyos o que controles, según las reglas de uso de la App Store.
3. Tindivo es el único responsable del mantenimiento y del soporte de la app. Apple no tiene ninguna obligación de darlos.
4. Si la app no cumple lo que se te prometió, avisa a Apple y Apple te devuelve el precio de compra, si lo hubo (la app es
   gratis). Fuera de eso, Apple no tiene otra obligación de garantía sobre la app. Los reclamos, las pérdidas y los daños
   por no cumplir una garantía los atiende Tindivo.
5. Tindivo, y no Apple, atiende cualquier reclamo tuyo o de un tercero sobre la app o su uso: productos defectuosos,
   incumplimiento de la ley, protección del consumidor y privacidad.
6. Si un tercero dice que la app infringe su propiedad intelectual, Tindivo, y no Apple, se encarga de investigar, defender
   y resolver el reclamo.
7. Declaras que no estás en un país bajo embargo de los Estados Unidos ni en una lista de partes prohibidas de ese país.
8. Debes cumplir también los términos de terceros que apliquen (por ejemplo, los de tu operadora de datos).
9. **Apple y sus subsidiarias son terceros beneficiarios** de estos términos. Cuando los aceptas, Apple puede hacerlos
   valer contra ti.
10. Datos de contacto del proveedor para consultas sobre la app: Jesús Castillo Vidal, C.P. San Jacinto Mz. 51 Lt. 8,
    Nepeña, Santa, Áncash, Perú · tindivodelivery@gmail.com · +51 906 550 166.

**B. Si descargas la app de Google Play**

1. Estos términos son entre tú y **Tindivo**. **Google no es parte** y no responde por la app ni por el servicio.
2. También rigen las condiciones de Google Play y sus políticas para ti como usuario de la tienda.
3. Puedes pedir el borrado de tu cuenta y de tus datos dentro de la app y en tindivo.com/borrar-cuenta (cláusula 12). La
   ficha de la app en Google Play enlaza a esta página y a la Política de Privacidad.

---

# Pendiente

Lo que sigue abierto. Nada de esto se resolvió por iniciativa del redactor.

**Por decidir (Jesús)**

1. **Fecha de vigencia** de la versión 2.
2. **Libro de Reclamaciones** (8.5): la dirección donde se encuentra y el número de RUC. El formulario público no está
   hecho (`Docs/trabajo/backlog.md`, fila 9).
3. **Medio y plazo de las devoluciones** (8.3): por dónde se devuelve (Yape, Plin, efectivo) y en cuántos días.
4. **Store** (5.8): reserva, entrega y devoluciones. Jesús no decidió comprobantes de Store (punto 8: no se dice nada).
5. **Texto de la casilla de aceptación** (1.2): el canon del acceso (CUS-AUT-020) tiene que sumar «Declaro tener la
   edad mínima»; ese cambio de producto no se hizo en este PR.
6. **Strikes a 24 meses** (7.2): el texto vale cuando la migración 0286 corra en `tindivo-prod`.
7. **Anexo de Apple**: contrastar con la guía vigente cuando empiece iOS.
8. **Quién absorbe el transporte devuelto** (5.7, 8.4): Tindivo devuelve una tarifa que cobró el motorizado (DA-26 en `Docs/trabajo/decisiones-abiertas.md`).
9. **Anexo de Google Play** (B.1, B.2): suavizar «Google no responde» y «rigen las condiciones de Google Play», que Tindivo no puede imponer.

**Por implementar (backlog, `Docs/trabajo/backlog.md`)**

Estados de retorno y custodia de Entregas; strike por «cliente no habido» (y a quién va si el destinatario no tiene
cuenta); marca +18 en `menu_items`; el choque de `drinks_liquor` con la lista de prohibidos de Entregas
(`packages/contracts/src/enums.ts`).

**Lista para el abogado**

- El **tope de S/ 200** en Entregas (posible cláusula abusiva).
- La **capacidad de 16 y 17 años** tras el D.Leg. 1384 (art. 1358 del Código Civil).
- La **venta de Store a menores** por WhatsApp.
- El **Libro de Reclamaciones**.
- El **alcohol por delivery**.
- La cláusula 2.2 («Tindivo se encarga de que el negocio cumpla con tu entrega»): suena a obligación de resultado, aunque no diga «garantiza».
- Contrastar con el art. 23 del D.S. 016-2024-JUS la frase «no nos des datos de tus papás ni de otras personas».
