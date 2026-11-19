# Términos y Condiciones de Tindivo · v2 (borrador)

> 2026-11-19 · **Borrador de trabajo: no manda ni está publicado.** Lo redactó un agente (Sonnet) a partir de
> `terminos-borrador.md` (24-oct), el canon y las capacidades de la app cliente. **No es asesoría legal ni lo revisó un
> abogado**: lo revisa Jesús (D-04). Los textos entre corchetes `[POR DECIDIR]` dependen de una decisión abierta (ver
> «Para revisar con Jesús», al final). Va dirigido a la **app Android** del cliente; la web se apaga (D-27).

## Afirmación → fuente

| Afirmación del texto | Fuente |
|---|---|
| Tindivo la opera Jesús como persona natural; contactos y domicilio | `apps/customer/app/privacidad/page.tsx` §1 (rama `docs/privacidad-v2`); `Docs/planes/movil/decisiones.md` D-36 |
| Tindivo no retiene fondos: pagas directo al negocio (Yape, Plin o efectivo) | `Docs/negocio/plataforma.md` «Principios» 1; `Docs/negocio/dinero.md` «En una frase» |
| En Entregas el cliente paga el transporte al motorizado y este se lo rinde a Tindivo; es tarifa de Tindivo | `Docs/negocio/dinero.md` «Tindivo Entregas»; aprobado por Jesús el 2026-11-19 (encargo) |
| Las devoluciones por apelación las adelanta Tindivo y las repone el negocio | `Docs/negocio/plataforma.md` principio 1; `Docs/negocio/dinero.md` «Reembolsos»; ADR 0036 |
| Entrada solo con Google (Apple en iOS); celular verificado por SMS | `Docs/producto/acceso/capacidad.md` CUS-AUT-019, CUS-AUT-007 (PR #201) |
| Casilla de aceptación desmarcada; se guarda versión y fecha | CUS-AUT-020, CUS-AUT-021 (PR #201) |
| Reaceptación al actuar; nunca bloquea pedido en curso, cancelación en los primeros minutos, soporte ni cerrar sesión | CUS-AUT-027 (PR #201) |
| Un número verificado pertenece a una sola cuenta; si ya es de otra, soporte por WhatsApp | CUS-AUT-008, CUS-AUT-028 (PR #201); `movil:D-63` |
| Edad mínima: 18 años | `Docs/planes/movil/decisiones.md` D-46 |
| Se puede pedir con entrega o recojo; el negocio confirma antes de preparar | `Docs/negocio/servicios/pedidos-restaurante.md`; `Docs/producto/seguimiento/capacidad.md` CUS-TRK-006 (PR #200) |
| Cancelar: solo mientras el servidor lo permita; después, por soporte | CUS-TRK-006, CA-TRK-01 (PR #200) |
| Todo recojo desde la app va prepagado | `Docs/negocio/antifraude.md` «En el mostrador no se fía»; migración 0283 |
| Prepago sobre el monto que indica la app; el resto lo decide el riesgo | `Docs/negocio/antifraude.md` «Cómo se decide…»; `apps/customer/lib/prepay.ts` (no se fija cifra) |
| Antifraude humano: la cajera llama antes de cocinar | `Docs/negocio/plataforma.md` principio 2; `Docs/negocio/antifraude.md` «La llamada» |
| Strikes: 2 → solo prepago; 3 → 30 días sin pedir; recojo ya pagado no genera strike | `Docs/negocio/antifraude.md` «Cómo se decide…» y «Strikes» |
| Los strikes dejan de contar a los 24 meses | `Docs/operacion/retencion-de-datos.md` (fila «Strikes antifraude», migración 0286) |
| Entregas: de A a B algo ya coordinado y pagado; 18:00 a 23:00; mochila 45×45×45; límite de peso `courier.maxWeightKg`; un envío activo por celular | `Docs/negocio/servicios/entregas.md`; ADR 0035; `Docs/producto/entregas/capacidad.md` CUS-ENT-002, 008, 012 (PR #199) |
| Entregas: lista de prohibidos como la de inDrive | `Docs/negocio/servicios/entregas.md` «Qué se lleva y qué no» (decisión 2026-11-17) |
| Además, animales vivos y objetos robados no se llevan; los medicamentos de venta libre sí | Jesús, 2026-11-19 (encargo). **El canon de Entregas aún dice «por decidir»: hay que actualizarlo** |
| La comida sí va por Entregas | `Docs/negocio/servicios/entregas.md` «Reglas al pedir» (decisión 2026-11-11) |
| Si nadie acepta en el plazo de la app, se cancela sin cobro | `Docs/negocio/servicios/entregas.md` «El motorizado»; CUS-ENT-016, 017 (PR #199) |
| Daños y pérdidas en Entregas: por soporte de WhatsApp; Tindivo responde por la conducta de sus motorizados | CUS-ENT-020 (PR #199), decisión de Jesús 2026-11-16 |
| Store: piezas de segunda mano, vende Jesús, se cierra por WhatsApp, sin cobro en la plataforma | `Docs/negocio/servicios/store.md`; `DECISIONS.md` §32 |
| Reseñas: no públicas; el negocio ve nota y etiquetas, nunca el texto | `Docs/negocio/apps.md` (reseñas) |
| Avisos del pedido: opcionales; sin promociones por ahora | `Docs/producto/cuenta/capacidad.md` CUS-ACC-005; CUS-AUT-018 (PR #201) |
| Borrado de cuenta: se escribe `BORRAR`; se bloquea con pedido en curso o dinero sin resolver | `Docs/producto/cuenta/capacidad.md` «Antes de tocar», CA-ACC-04 (PR #201) |
| Qué se conserva al borrar y por cuánto | `Docs/operacion/retencion-de-datos.md`; ver también `privacidad-v2.md` |
| Reseñas tras el borrado: se conserva la nota y las etiquetas, sin comentario | Jesús, opción C, 2026-11-19 (encargo); `retencion-de-datos.md` (migración 0284) |
| Libro de Reclamaciones no se promete | `Docs/trabajo/legal/terminos-borrador.md` cláusula 8.4; memoria del proyecto: en stand by hasta el RUC |
| Ley peruana y derechos del consumidor | Redacción estándar (sin fuente en el canon) |

---

**Versión:** 2 · **Vigente desde:** `[POR DECIDIR: fecha]`

## 1. Quién es Tindivo y cómo aceptas estos términos

**1.1. Quién presta el servicio.** Tindivo es un servicio operado por **Jesús Castillo Vidal**, persona natural.

- Domicilio: C.P. San Jacinto Mz. 51 Lt. 8, distrito de Nepeña, provincia del Santa, Áncash, Perú.
- Correo: tindivodelivery@gmail.com.
- WhatsApp de soporte: +51 906 550 166.

**1.2. Aceptación.** Al entrar a la app marcas «Acepto los Términos y la Política de privacidad». Guardamos qué versión
aceptaste y cuándo. Aceptar no significa que aceptes recibir promociones.

**1.3. Si cambian los términos.** Te pedimos aceptar la nueva versión **cuando vayas a pedir o a cambiar tus datos**,
no al abrir la app. Nunca te lo pedimos si tienes un pedido en curso, si quieres cancelarlo en los primeros minutos,
si vas a escribir a soporte o a cerrar sesión. `[POR DECIDIR: con cuántos días de aviso, y qué pasa si no aceptas la
nueva versión]`

## 2. Qué es Tindivo y quién hace qué

**2.1.** Tindivo conecta a clientes, negocios locales y motorizados en San Jacinto, Áncash. En los pedidos de
restaurante, **Tindivo no cocina ni recibe tu dinero**: pagas directo al negocio por Yape, Plin o efectivo. Si el
motorizado cobra en efectivo, lo hace por cuenta del negocio.

**2.2.** El negocio prepara lo que vendes y responde por su comida. El motorizado recoge y entrega. Tindivo responde
por su plataforma, por la coordinación del servicio y por la conducta de sus motorizados. Nada de esto reduce los
derechos que la ley peruana te da como consumidor.

**2.3.** Tindivo Entregas y Tindivo Store son otros servicios, con reglas propias (cláusula 5).

## 3. Tu cuenta

**3.1. Edad.** Debes tener **18 años cumplidos**.

**3.2. Cómo entras.** En la app entras con tu cuenta de **Google** (en iPhone, también con Apple). Para hacer tu
primer pedido verificamos tu **celular por SMS**. El SMS sirve para verificar el número, no para entrar a la cuenta.

**3.3. Un número, una cuenta.** Un celular verificado pertenece a una sola cuenta. Si el tuyo ya está en otra, escríbenos
por WhatsApp: no te mostramos nada de la otra cuenta. Si perdiste tu cuenta de Google, también escríbenos.

**3.4. Tus datos.** Escribe un nombre, un celular, una dirección y una referencia correctos. Cuida tu acceso. Si ves
un ingreso que no reconoces, avísanos por WhatsApp.

## 4. Pedidos de restaurante

**4.1. Pedir.** Puedes pedir con entrega o recojo, cuando el negocio lo tenga habilitado. Enviar el pedido no es que ya
esté aceptado: el negocio lo confirma antes de prepararlo. Mira el estado dentro de la app.

**4.2. Horarios y cobertura.** Cada negocio tiene su horario y sus platos pueden agotarse. Entregamos solo dentro de
la cobertura de San Jacinto. Los tiempos que ves son estimados.

**4.3. Plazos.** El negocio tiene un tiempo para aceptar, y tú para pagar o ser validado, según lo que indique la app.
Si se vence, el pedido se cancela.

**4.4. Cancelar.** Puedes cancelar desde la app **mientras el servicio lo permita**. Después de que el negocio acepta,
la cancelación se pide por soporte. Un pedido entregado no se cancela; si hay un problema, se reclama (cláusula 8).
`[POR DECIDIR: hasta qué estado cancela el cliente y qué consecuencias económicas tiene]`

**4.5. Recojo.** Todo recojo pedido desde la app va **prepagado**: pagas antes y el pedido llega pagado a cocina.

## 5. Tindivo Entregas y Tindivo Store

**5.1. Entregas.** Un motorizado recoge en un punto A algo que **ya está coordinado, pagado y listo**, y lo lleva a un
punto B dentro de San Jacinto. No compra nada ni adelanta dinero. En cada envío confirmas que el contenido **ya está
pagado** y que **está permitido**. Atendemos de lunes a domingo, de **18:00 a 23:00** (hora de Lima), si el servicio
está encendido. Puedes tener **un envío activo** por celular.

**5.2. Qué se lleva.** Lo que cabe en una mochila de **45 × 45 × 45 cm** y no pasa del peso que indica la app. Se
permiten documentos, comida y **medicamentos de venta libre**.

**5.3. Qué no se lleva.** Lo mismo que no lleva inDrive: alcohol, tabaco y vapeadores; joyas, metales y piedras
preciosas; efectivo, billetes y monedas; armas, municiones y armas blancas; explosivos, pólvora, fuegos artificiales y
venenos; drogas; material obsceno; artículos de venta restringida. Además, **animales vivos** y **objetos robados**.
Si lo que envías es frágil, dilo al motorizado cuando llegue a recoger: él decide si puede llevarlo.

**5.4. Pago del transporte.** El precio del transporte lo ves antes de pedir. Es una **tarifa de Tindivo**: lo paga, en
efectivo o Yape, quien entrega el objeto al recogerlo o quien lo recibe al entregarlo, y el motorizado se lo rinde a
Tindivo. El precio del objeto se paga aparte; no pasa por Tindivo.

**5.5. Cancelación y daños.** Si nadie acepta tu envío en el plazo que indica la app, se cancela **sin cobro**. Los
daños y pérdidas se atienden por el WhatsApp de soporte; Tindivo responde por la conducta de sus motorizados.
`[POR DECIDIR: ausencia del destinatario, retorno del objeto, tope de responsabilidad, devolución del transporte]`

**5.6. Store.** Store muestra piezas únicas de segunda mano vendidas por Jesús. No hay carrito ni cobro en la app:
eliges una pieza y cierras la compra y el pago con Jesús por WhatsApp. El catálogo marca las piezas como disponibles,
reservadas o vendidas. La condición de segunda mano no quita los derechos que te da la ley.
`[POR DECIDIR: reserva, entrega, comprobantes y devoluciones de Store]`

## 6. Precios y pagos

**6.1.** Antes de confirmar, revisa el precio de los productos, el delivery y el total. Los precios de delivery y de
Entregas los fija Tindivo y se muestran en la app.

**6.2. Cómo pagas un pedido de restaurante.** Por Yape, Plin o efectivo, según lo habilitado para tu pedido. Si el total
(con delivery) supera el **monto que indica la app al pagar**, o si Tindivo lo decide por seguridad, debes **pagar por
adelantado**. Si pagas en efectivo, di con cuánto pagas.

**6.3. Comprobante.** En un prepago envías el dinero al destino que te indica la app y **subes la captura real**. El
negocio revisa el pago: subir la imagen no significa que ya se verificó. La captura no es un comprobante de venta.
`[POR DECIDIR: quién emite el comprobante de venta y cómo se pide]`

## 7. Verificación y faltas

**7.1. Llamada de verificación.** Para proteger a los negocios del fraude, en algunos pedidos la cajera te llama antes
de cocinar. Tindivo decide qué formas de pago tienes según cada caso y la app te las muestra antes de confirmar.

**7.2. Strikes.** Si el motorizado llega y no apareces, y espera el tiempo que indica la app, puede reportarlo y recibes
un **strike**; también si no vienes a un recojo (si el recojo estaba pagado, no hay strike). Con **dos strikes** solo
puedes pedir con prepago. Con **tres**, no puedes pedir por **treinta días**. Los strikes se vinculan a tu teléfono y,
en entregas, a la dirección. Dejan de contar a los **24 meses**. Si crees que un strike es un error, escríbenos.

## 8. Reclamos y devoluciones

**8.1. Dónde reclamar.** Escribe al WhatsApp de soporte diciendo qué pedido y qué pasó. Lo de la comida se ve con el
negocio; la plataforma y la entrega, con Tindivo; en Store, con Jesús como vendedor.

**8.2. Devoluciones en pedidos de restaurante.** Si el negocio rechazó por error tu comprobante y tu apelación se
aprueba, **Tindivo te devuelve el dinero y se lo cobra después al negocio**. Tindivo adelanta la devolución, no guarda
tu dinero. `[POR DECIDIR: otros casos de devolución, medios y plazos]`

**8.3. Entregas.** Si una Entrega se cancela después de cobrado el transporte, la devolución la hace Tindivo.
`[POR DECIDIR: condiciones, medio y plazo]`

**8.4.** Escribirnos no te quita las vías de reclamo que la ley te da como consumidor.

## 9. Conducta y reseñas

**9.1.** No uses Tindivo para pedidos falsos, comprobantes alterados, suplantar a otra persona, enviar objetos
prohibidos o molestar al servicio. Trata bien a negocios, motorizados y soporte.

**9.2. Reseñas.** Las reseñas **no son públicas**. El negocio ve tu nota y las etiquetas, **no tu comentario**; el
comentario lo ve el equipo de Tindivo. No lo usamos como publicidad. No escribas datos de otras personas.

## 10. Avisos y promociones

**10.1.** Los avisos del pedido (por notificación de tu celular) son **opcionales**: puedes apagarlos en **Cuenta** o
en los ajustes del teléfono, y entonces consultas el estado dentro de la app.

**10.2.** Hoy **no enviamos promociones**. Si algún día lo hacemos, te lo pediremos aparte, con un control apagado por
defecto.

## 11. Tus datos personales

Cómo usamos tus datos, con quién los compartimos y cómo ejercer tus derechos está en la **Política de Privacidad**.
Aceptar estos términos no reemplaza los consentimientos que la ley pida por separado.

## 12. Borrar tu cuenta

**12.1. Cómo.** En la app: **Cuenta → Borrar mi cuenta**, escribiendo `BORRAR`. `[POR DECIDIR: la dirección web para
quien ya no tiene la app]`

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

**13.2.** Estos términos se rigen por las leyes del Perú. Puedes acudir a las autoridades competentes. Ninguna
cláusula renuncia a tus derechos como consumidor.

---

# Para revisar con Jesús

Cláusulas que dependen de decisiones abiertas o de cosas que el canon aún no dice:

1. **Qué cambio obliga a reaceptar** (1.3). La regla de *cuándo* aparece la ventana está aprobada (CUS-AUT-027); falta
   decir **qué cambios** la disparan (¿toda versión nueva o solo las que cambian obligaciones?) y con cuántos días de
   aviso. Hoy la versión vigente es una constante de la app: ninguna operación la publica (defecto 3 del PR #201).
2. **Dónde se publican los textos cuando se apague la web** (11, 12.1). Los términos, la privacidad y la página de borrado
   viven hoy en `tindivo.com`; Play exige un enlace público de borrado. Hay que decidir el dominio o la página que los
   reemplaza (decisión 7 del PR #201; `movil:D-27`). Hasta entonces el texto no puede citar una URL.
3. **Cómo se comprueba la edad** (3.1). D-46 fija 18 años, pero ninguna ficha define el control (decisión 4 del PR #201):
   ¿solo la declaración al aceptar la casilla, o algo más? El texto hoy solo dice «debes tener 18».
4. **Cancelación por el cliente** (4.4): hasta qué estado y con qué efecto económico.
5. **Medicamentos** (5.2 y 5.3): Jesús dijo «venta libre sí» el 2026-11-19. Escribí que los demás medicamentos entran
   en «artículos de venta restringida». Confirmar. Y actualizar `Docs/negocio/servicios/entregas.md`, que aún los pone
   «por decidir».
6. **Responsabilidad en Entregas** (5.5): ausencia, retorno, daño y tope (el S/ 200 del borrador viejo no se usó).
7. **Reembolsos** (8.2, 8.3): el canon de dinero registra más casos que la apelación (prepago cancelado, reclamo de
   fraude); la plataforma dice que la apelación es la única excepción. Decidir cuál es la regla.
8. **Comprobante de venta** (6.3): quién emite el de la comida, el del transporte y el de Store.
9. **Libro de Reclamaciones**: no lo prometí. Mientras no haya RUC, ¿se escribe algo (la ley 29571 lo pide a proveedores
   que venden bienes y servicios)? Es una consulta legal, no mía.
10. **Anexo de tiendas (Apple/Google)**: no lo incluí. El del borrador del 24-oct no estaba contrastado con la guía vigente.
11. **Fuero y jurisdicción** (13.2): quité «San Jacinto» de la web actual porque un fuero exclusivo contra un consumidor
    puede no valer; confirmar.
12. **Comisión de Entregas** (5.4): el canon de dinero habla de «S/ 3 que paga el cliente»; la decisión del 2026-11-19
    (tarifa de Tindivo) todavía no está escrita en `dinero.md`.
13. **Strikes a 24 meses** (7.2): vale cuando la migración 0286 corra en `tindivo-prod` (ver el punto 2 de `privacidad-v2.md`).
