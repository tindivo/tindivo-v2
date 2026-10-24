# Términos y Condiciones de Tindivo · borrador

> 2026-10-24 · **Borrador de trabajo: no manda ni está publicado.** Lo redactó Codex (gpt-6.1-sol, esfuerzo high, thread
> `01a16e7d-0354-7ca2-ab1a-0a4a176172f4`) a pedido de Jesús, solo desde las fuentes de su tabla de trazabilidad
> (snapshot de `develop@1531b659`). Su guía fue el expediente de tiendas,
> [`../movil/07-publicacion-tiendas.md`](../movil/07-publicacion-tiendas.md). Claude lo auditó por muestreo contra el
> canon (antifraude, Entregas, Store, dinero y plataforma) y le aplicó las observaciones de abajo. La revisión legal es
> de Jesús (D-04). No es asesoría legal.
>
> **Siguiente paso:** Jesús decide los `[PENDIENTE DE JESÚS]` y las decisiones de la sección 4. Después, el texto
> sustituye a `apps/customer/app/terminos/page.tsx` y se enlaza en la app con aceptación versionada.

## Observaciones de Claude ya aplicadas

1. **Cláusula 7.1, antifraude.** Codex enumeraba las señales internas que deciden si alguien puede pagar al recibir.
   Publicarlas le enseña a un estafador qué imitar. Ahora la cláusula
   solo dice que puede pedirse prepago o validación. Las consecuencias de los strikes (7.3) siguen escritas, porque el
   cliente tiene que conocerlas.
2. **Plazos que viven en configuración**: la aceptación de Entregas (`timers.courierAcceptMinutes`) y las esperas del
   motorizado (`timers.courierWaitMinutes` y `noShowWaitMinutes`). Pasan a «el tiempo que indica la app», como el
   monto del prepago, para que cambiar un ajuste no deje mal el contrato. Se quedan fijos el horario de Entregas
   (ADR 0035), los 5 kg, la mochila de 45 cm y los strikes, porque son reglas del canon y no ajustes.
3. **En las cláusulas generales actúa «la administración de Tindivo»**, no Jesús por su nombre (cancelaciones,
   reportes, apelaciones y reclamos). En Store sí se le nombra, porque ahí el vendedor es él.

Observación sin aplicar, para decidir: el anexo de Apple (cláusula 14) está escrito sin consultar la guía vigente,
porque Codex no tenía red. Codex y Claude recomiendan usar la EULA estándar de Apple (14.11) en vez de una licencia
propia.

---

# 1. Borrador

**Borrador técnico provisional del 24 de octubre de 2026. No constituye asesoría legal. Revisión a cargo de Jesús conforme a D-04.**

**Versión:** [PENDIENTE DE JESÚS: identificador de esta versión].  
**Vigente desde:** [PENDIENTE DE JESÚS: fecha de entrada en vigencia].

## Cláusula 1. Quién presta el servicio y cómo aceptas estos términos

**1.1. Responsable y contacto.** Tindivo es el nombre del servicio operado por Jesús, como persona natural:

- Nombre legal completo: [PENDIENTE DE JESÚS: nombre y apellidos].
- Documento de identificación: [PENDIENTE DE JESÚS: DNI y actualización del RUC cuando corresponda; actualmente no hay RUC].
- Domicilio: [PENDIENTE DE JESÚS: domicilio completo].
- Correo de soporte: [PENDIENTE DE JESÚS: correo].
- Correo de privacidad: [PENDIENTE DE JESÚS: correo].
- WhatsApp de soporte: el que aparece en Tindivo. [PENDIENTE DE JESÚS: incorporar el número completo al texto].

**1.2. Alcance y aceptación.** Estos términos regulan tu uso de Tindivo en la app nativa y en la web. Las funciones disponibles pueden variar según el canal y el servicio.

Antes de aceptar, puedes leer estos términos y la Política de Privacidad. Aceptas una versión mediante una acción expresa en [PENDIENTE DE JESÚS: definir el control de aceptación y el momento del flujo en que se solicita en cada canal].

Tindivo registra la versión que aceptaste y la fecha de aceptación. Volver a aceptar la misma versión no cambia la fecha original. La aceptación de estos términos no incluye el consentimiento para recibir promociones.

**1.3. Nuevas versiones.** Cada modificación se identificará con una nueva versión y su fecha de vigencia. Haber aceptado una versión anterior no equivale a aceptar automáticamente una nueva.

[PENDIENTE DE JESÚS: definir cómo y con qué anticipación se avisan los cambios, cuándo se exige una nueva aceptación y qué funciones siguen disponibles si no aceptas. La decisión debe contemplar pedidos en curso, soporte, reclamos y borrado de cuenta].

## Cláusula 2. Qué es Tindivo y quién hace cada parte

**2.1. La plataforma.** Tindivo conecta a clientes, negocios locales y motorizados en San Jacinto, Áncash, Perú. En los pedidos de restaurante actúa como intermediario y coordina la entrega o el recojo en el local.

Tindivo no prepara ni produce los alimentos. Tampoco recibe ni guarda el dinero de tu pedido de restaurante: pagas directamente al negocio. Cuando el motorizado cobra ese pedido en efectivo, lo hace por cuenta del negocio.

**2.2. Responsabilidades.** El negocio acepta y prepara tu pedido, informa sobre sus productos y verifica los pagos que recibe. Le corresponde responder por los alimentos que vende, su preparación y su correspondencia con lo ofrecido.

El motorizado realiza el recojo y la entrega y registra el cobro cuando corresponde. Tindivo responde por la operación de su plataforma, la coordinación que asume y la atención de las incidencias que le corresponden.

Este reparto de tareas no elimina las responsabilidades que la legislación peruana atribuya a cada participante ni limita tus derechos como consumidor.

**2.3. Otros servicios.** Tindivo Entregas presta transporte de objetos ya coordinados y pagados. Tindivo Store es un catálogo de segunda mano cuyo único vendedor es Jesús. Sus condiciones particulares se explican en la cláusula 5; el pago directo al restaurante no describe estos dos servicios.

## Cláusula 3. Tu cuenta

**3.1. Edad mínima.** Para usar Tindivo debes tener **18 años cumplidos**.

**3.2. Identidad e inicio de sesión.** Utiliza los métodos de acceso que estén habilitados en el canal que usas. El teléfono se verifica por SMS en el flujo de cliente; esa verificación no significa, por sí sola, que el teléfono sea un método de inicio de sesión.

[PENDIENTE DE JESÚS: cerrar D-22 y describir los métodos definitivos de acceso y recuperación, incluido el tratamiento de un teléfono asociado a otra cuenta. Este borrador no promete acceso por OTP ni disponibilidad general de Google, Apple o correo y contraseña en todos los canales].

**3.3. Datos y seguridad.** Proporciona un nombre, teléfono, dirección y referencias correctos y mantenlos actualizados. Cuida el acceso a tu cuenta y no compartas tus códigos de verificación ni tus credenciales. Si detectas un acceso que no reconoces, comunícalo al soporte indicado en la cláusula 1.

## Cláusula 4. Pedidos de restaurante

**4.1. Envío y confirmación.** Puedes pedir con entrega a domicilio o recojo en el local cuando el negocio tenga habilitada esa opción. Algunos negocios muestran su catálogo y reciben los pedidos por sus propios canales.

Enviar el pedido no significa que el negocio ya lo haya aceptado. El negocio debe confirmarlo y, si corresponde, validar tus datos o verificar el prepago antes de prepararlo. Revisa el estado del pedido en Tindivo.

**4.2. Disponibilidad, horarios y cobertura.** Cada negocio tiene sus propios horarios. Un plato puede agotarse o estar disponible únicamente en determinados días y franjas horarias. Que un negocio atienda no significa que todos sus platos estén disponibles.

La entrega está sujeta a la cobertura disponible para tu dirección en San Jacinto. No existe un horario único de restaurante aplicable a todos los negocios.

[PENDIENTE DE JESÚS: precisar la información pública sobre cobertura de restaurantes, sus exclusiones y dónde puedes consultarla antes de confirmar].

**4.3. Tiempos y vencimientos.** Los tiempos de preparación y entrega que se muestran son estimados. El negocio puede ampliar el tiempo de preparación conforme a las reglas del servicio.

Existen plazos para aceptar el pedido, completar su validación, pagar y verificar el comprobante. El pedido puede cancelarse si vence el plazo de aceptación, validación o pago. Esos plazos dependen de la configuración vigente del servicio.

**4.4. Cancelación.** Puedes solicitar la cancelación mediante la función disponible para tu pedido o comunicarte con soporte. Que la solicites no significa que ya se haya efectuado: revisa la confirmación de su estado.

El negocio o la administración de Tindivo pueden cancelar un pedido que todavía no esté cerrado. También existen cancelaciones por vencimiento de plazos o por falta de recepción. Un pedido registrado como entregado no vuelve a un estado anterior; cualquier reclamo o devolución se atiende por separado.

[PENDIENTE DE JESÚS: definir hasta qué estado puedes cancelar directamente, cuándo interviene el negocio o soporte y qué consecuencias económicas corresponden. Las fuentes autorizadas no permiten fijar una prohibición universal de cancelar desde que empieza la preparación].

La cancelación no acredita por sí sola que se haya devuelto un pago. Los reembolsos se tratan en la cláusula 8.

**4.5. Recojo en el local.** Si eliges recojo «ahora» y pago en caja, debes pagar antes de que el pedido pase a cocina. El recojo «más tarde» requiere prepago. El recojo no ofrece Yape al recibir como modalidad de contraentrega; puedes usar el prepago con comprobante cuando esté habilitado.

## Cláusula 5. Tindivo Entregas y Tindivo Store

**5.1. Qué incluye Tindivo Entregas.** Un motorizado recoge en un punto A algo que ya está coordinado, pagado y listo, y lo lleva a un punto B dentro de San Jacinto. El motorizado no compra productos ni adelanta su precio.

Debes marcar origen y destino en el mapa, añadir sus referencias y confirmar en cada envío que el contenido está permitido y ya está pagado. Ambos puntos deben estar dentro de la cobertura.

El horario documentado es de lunes a domingo, de **18:00 a 23:00, hora de Lima**, sujeto a que el servicio esté habilitado. Se permite un envío activo por teléfono en el uso ordinario del servicio.

**5.2. Qué puedes enviar.** Puedes enviar objetos de hasta **5 kg** que quepan en una mochila de **45 × 45 × 45 cm**, incluidos productos de bodega ya pagados, objetos pequeños, sobres sencillos y medicinas comunes ya compradas en su bolsa sellada.

No puedes enviar comida preparada, dinero ni valores, documentos de identidad, medicinas con receta retenida, alcohol, animales, objetos peligrosos ni productos que el motorizado tenga que comprar.

Si el objeto es frágil, debes indicarlo. El motorizado decide si puede transportarlo.

**5.3. Aceptación y transporte en Entregas.** Si ningún motorizado acepta el envío dentro del plazo que indica la app, se cancela sin cobro. En el punto de recojo, el motorizado espera el tiempo que indica la app.

El transporte lo paga al motorizado quien entrega el objeto al recogerlo o quien lo recibe al entregarlo, según lo elegido. Se admite efectivo o Yape. El precio del objeto debe estar pagado por separado.

[PENDIENTE DE JESÚS: completar las reglas ante ausencia del destinatario, imposibilidad de recojo o entrega, retorno del objeto, pérdida, daño y reclamación; precisar las condiciones de cancelación y devolución del transporte. No se incorpora un tope de responsabilidad procedente de un borrador sin revisión].

**5.4. Tindivo Store.** Store muestra piezas únicas de segunda mano vendidas por Jesús. No tiene carrito ni cobro dentro de la plataforma: eliges una pieza y coordinas la venta y el pago con Jesús por WhatsApp, mediante el contacto indicado en Store.

El catálogo distingue piezas disponibles, reservadas y vendidas. El precio y la información de envío deben consultarse en la publicación y al coordinar la compra.

[PENDIENTE DE JESÚS: definir cómo se confirma una reserva o venta, sus condiciones, los medios de pago, la entrega, los comprobantes y la atención de garantías, devoluciones y reclamos. La condición de segunda mano no elimina los derechos que te reconozca la ley].

## Cláusula 6. Precios, delivery y pagos

**6.1. Importes.** Revisa el precio de los productos, el delivery y el total antes de confirmar tu pedido. Las tarifas dependen de la configuración del servicio y de la ubicación de entrega. La comisión que el negocio paga a Tindivo se liquida entre ambos.

En Entregas, revisa el precio del transporte. En Store, confirma con Jesús el precio de la pieza y el envío antes de cerrar la compra.

**6.2. Pago al restaurante.** Pagas al negocio por Yape, Plin o efectivo, según las opciones habilitadas para ese pedido. La posibilidad de pagar al recibir depende de las reglas de riesgo, el importe y la modalidad de entrega o recojo.

Cuando el total, incluido el delivery, supere **el monto que indica la app al pagar**, debes hacer el prepago. También puede exigirse prepago por las reglas antifraude o por tratarse de un recojo «más tarde».

Si eliges efectivo, declara con cuánto pagarás y respeta los límites de billete y vuelto disponibles para tu pedido.

**6.3. Comprobante de pago.** Cuando hagas un prepago por Yape o Plin, envía el dinero al destinatario indicado y sube una captura auténtica del comprobante. El negocio verifica el pago; subir una imagen no equivale a que el dinero haya sido recibido o verificado.

La captura de Yape o Plin acredita una operación de pago y no sustituye el comprobante de venta que corresponda.

[PENDIENTE DE JESÚS: identificar quién emite y cómo solicitas el comprobante correspondiente a la comida y al delivery, al transporte de Entregas y a las ventas de Store].

## Cláusula 7. Verificación e incidencias

**7.1. Verificación humana.** Para proteger a los negocios del fraude, Tindivo decide en cada pedido si puedes pagar al recibir o si se requiere prepago, y si el negocio debe validar el pedido antes de prepararlo. La app te indica antes de confirmar qué opciones de pago tienes.

Cuando corresponde una llamada, la hace la cajera antes de cocinar. Su finalidad es verificar el pedido; no sustituye los avisos de estado de Tindivo. Un pedido prepagado no se valida mediante esta llamada.

**7.2. Incidencias por falta de recepción.** Si el motorizado llega y no apareces, puede reportar la falta de recepción después de esperar el tiempo que indica la app desde que registró su llegada. El reporte puede generar una incidencia o *strike*, una comunicación al cliente y un reporte para la administración de Tindivo.

En el recojo en el local, la falta de asistencia puede reportarse pasado ese mismo tiempo desde que el pedido quedó listo. La incidencia se vincula al teléfono; **si el recojo ya estaba pagado, no genera un strike**.

Si consideras incorrecta una incidencia, comunícala a soporte.

**7.3. Consecuencias documentadas.** Con **dos strikes**, solo puedes pedir con prepago. Con **tres strikes**, se aplica un bloqueo de **treinta días** durante el cual tampoco puedes pedir con prepago.

En los pedidos con entrega, las restricciones se vinculan al teléfono y a la dirección; cambiar uno de esos datos no elimina la restricción asociada al otro. En los recojos se vinculan al teléfono.

No toda cancelación ni toda falla del servicio constituye un strike.

## Cláusula 8. Reclamos, reembolsos y devoluciones

**8.1. Atención.** Si tienes un problema con tu pedido, puedes comunicarlo al WhatsApp de soporte de Tindivo e identificar el pedido y lo ocurrido.

Los problemas con los alimentos se atienden con el negocio que los vende. Tindivo coordina las incidencias de la plataforma y la entrega, y la administración de Tindivo interviene en los casos que requieren su resolución. En Store, Jesús atiende como vendedor; en Entregas, Tindivo atiende el transporte.

[PENDIENTE DE JESÚS: completar el procedimiento de recepción, seguimiento y respuesta, los datos necesarios y los plazos aplicables, sin sustituir las vías que te reconoce la ley].

**8.2. Pedidos de restaurante.** Si el negocio rechazó por error tu comprobante de prepago y la administración de Tindivo aprueba tu apelación, Tindivo te devuelve el dinero y lo recupera del negocio. Esto es un adelanto de la devolución, no una custodia de tu dinero.

[PENDIENTE DE JESÚS: conciliar el alcance de los demás reembolsos. El canon de dinero contempla devoluciones acordadas con el restaurante y registros por cancelación de prepago verificado y reclamación aprobada; el canon de plataforma presenta la apelación aprobada como única excepción. Definir la regla aplicable, los canales de solicitud, los medios y plazos de devolución].

Registrar una cancelación o un cargo de reembolso no demuestra, por sí solo, que hayas recibido la devolución.

**8.3. Entregas y Store.** Si una Entrega se cancela después de cobrar el transporte, la devolución corresponde a Tindivo. [PENDIENTE DE JESÚS: precisar condiciones, importe, medio y plazo de devolución].

En Store, las devoluciones y los reclamos de la compra se atienden con Jesús como vendedor. [PENDIENTE DE JESÚS: completar las condiciones de atención y devolución, respetando los derechos que correspondan].

**8.4. Libro de Reclamaciones.** [PENDIENTE DE JESÚS: completar la cláusula del Libro de Reclamaciones conforme a la Ley N.° 29571, su enlace, identificación del proveedor y procedimiento aplicable. Actualmente está diseñado y pendiente del RUC; este borrador no afirma que se encuentre habilitado ni que su espera suspenda obligaciones legales].

El contacto de soporte no sustituye los mecanismos de reclamación que correspondan legalmente.

## Cláusula 9. Conducta, reseñas y contenido

**9.1. Uso correcto.** No uses Tindivo para hacer pedidos falsos, presentar comprobantes alterados, suplantar a otra persona, enviar objetos prohibidos o interferir con el servicio. Trata con respeto a los negocios, motorizados y personal de soporte. No envíes amenazas ni contenido ilícito.

Estas reglas no incorporan sanciones automáticas adicionales a las descritas en la cláusula 7.

**9.2. Reseñas y comentarios.** Las reseñas **no son públicas**: otros clientes no ven lo que escribes. El negocio ve la calificación y las etiquetas, pero no el texto de tu comentario. El panel de administración permite revisar las reseñas.

Las reseñas se usan para evaluar la calidad del servicio y no modifican por sí mismas los cobros ni la asignación de pedidos. Escribe sobre tu experiencia y evita incluir datos personales de terceros que no sean necesarios.

Tus notas y comentarios se utilizan para atender el servicio y revisar su calidad. No otorgas mediante esta cláusula una autorización para publicarlos como publicidad.

## Cláusula 10. Avisos del pedido y promociones

**10.1. Avisos del servicio.** Tindivo muestra y envía avisos sobre el estado de tu pedido mediante sus funciones de seguimiento y notificaciones. Su recepción depende también de los permisos y ajustes de tu dispositivo. Puedes consultar el estado dentro de Tindivo.

Estos avisos son distintos de las promociones y no dependen de que aceptes recibir publicidad. La llamada de verificación de la cajera tiene la finalidad indicada en la cláusula 7.

**10.2. Promociones.** Si Tindivo habilita promociones, solo te las enviará cuando des tu consentimiento mediante un control separado, **apagado por defecto**. Aceptar estos términos o permitir las notificaciones del dispositivo no activa por sí solo las promociones.

Puedes retirar ese consentimiento mediante el control correspondiente, sin desactivar por ello los avisos del pedido.

[PENDIENTE DE JESÚS: completar el texto del consentimiento y definir los canales, la frecuencia máxima, las horas de silencio y la ubicación del control antes de habilitar promociones].

## Cláusula 11. Datos personales

El tratamiento de tus datos se explica en la **Política de Privacidad**, disponible en `/privacidad` en la web y mediante el enlace correspondiente en la app.

Consúltala para conocer los datos tratados, sus finalidades, destinatarios, proveedores, transferencias internacionales, conservación y ejercicio de tus derechos. La aceptación de estos términos no sustituye los consentimientos separados que correspondan.

[PENDIENTE DE JESÚS: publicar una versión de privacidad coherente con estos términos, D-44 y los datos y proveedores efectivamente utilizados; completar el contacto de privacidad y los datos del responsable].

## Cláusula 12. Borrado de cuenta y conservación

**12.1. Cómo solicitarlo.** Puedes solicitar el borrado desde **Cuenta → Borrar mi cuenta** y mediante una página web que permite hacerlo sin tener instalada la app, previa identificación.

[PENDIENTE DE JESÚS: habilitar y verificar ambos recorridos antes de publicar esta cláusula; incorporar la URL de borrado y confirmar el plazo de ejecución y comunicación. El expediente prevé ejecución inmediata dentro de la app].

Borrar tu cuenta implica retirar tu acceso y eliminar o anonimizar los datos que corresponden. No significa eliminar todos los registros relacionados con los servicios que utilizaste.

**12.2. Qué se elimina o anonimiza.** Se eliminan tu perfil, las direcciones guardadas en tu cuenta, las suscripciones a avisos y los registros asociados previstos para el borrado, incluida la aceptación de términos.

Los pedidos de restaurante y Entregas se conservan **anonimizados sin límite de tiempo** para el registro de la operación. Se retiran de esos pedidos tu nombre, teléfono, dirección, referencias, coordenadas y notas del cliente.

Las calificaciones se conservan sin identificarte como autor. [PENDIENTE DE JESÚS: precisar el tratamiento del texto libre de las reseñas y su eliminación o anonimización].

**12.3. Qué se conserva.** Los comprobantes de pago se conservan durante **noventa días**. [PENDIENTE DE JESÚS: definir desde qué evento se cuentan esos días y confirmar la eliminación al vencer el plazo].

También se conservan el directorio de direcciones que utiliza el negocio y el historial antifraude vinculado al teléfono. Por ello, borrar tu cuenta no borra esos registros ni elimina las restricciones antifraude que correspondan.

[PENDIENTE DE JESÚS: precisar los campos conservados, responsables de su tratamiento, finalidades y plazos del directorio y del antifraude; definir si el vínculo telefónico se conserva como número o mediante otra representación. Coordinarlo con la Política de Privacidad].

**12.4. Pedidos y casos abiertos.** [PENDIENTE DE JESÚS: definir cómo se atiende una solicitud de borrado con pedidos, pagos, apelaciones o reclamos pendientes y cómo puedes seguir el caso después de perder el acceso. Definir también el tratamiento de la identidad de inicio de sesión].

## Cláusula 13. Disponibilidad, cambios y ley aplicable

**13.1. Disponibilidad.** Tindivo puede sufrir interrupciones por mantenimiento, conexión, fallas técnicas o indisponibilidad de los participantes. La app puede requerir una actualización para seguir funcionando.

[PENDIENTE DE JESÚS: definir cómo se comunica y atiende una interrupción que afecte pedidos o pagos en curso].

**13.2. Cambios.** Los cambios de estos términos se sujetan a la cláusula 1.3. La actualización de un precio o una tarifa no convierte una nueva cotización en una modificación de un pedido ya confirmado; cualquier regla de modificación de un pedido requiere su definición específica.

[PENDIENTE DE JESÚS: completar las reglas para cambios de productos, importes o modalidad de pago después de confirmar, diferenciando pedidos de la app y pedidos tomados por la cajera].

**13.3. Ley y autoridades competentes.** Estos términos se rigen por las leyes de la República del Perú. Puedes acudir a las autoridades administrativas y judiciales competentes conforme a la ley. Ninguna cláusula implica renunciar a tus derechos como consumidor ni a las competencias obligatorias que te protejan.

[PENDIENTE DE JESÚS: confirmar si se incorporará una referencia territorial adicional y su formulación; no establecer un fuero exclusivo sin comprobar su procedencia].

## Cláusula 14. Anexo para descargas desde tiendas

**14.1. Elección de licencia para App Store.** [PENDIENTE DE JESÚS: decidir si estos términos también serán la licencia de usuario final de la app o si la licencia será la EULA estándar de Apple. Los puntos 14.2 a 14.11 forman la propuesta para una licencia propia; deben ajustarse o sustituirse por una remisión expresa a la EULA estándar si eliges esa alternativa]. **Verificar con la guía vigente.**

**14.2. Partes y alcance.** Si descargas Tindivo desde App Store, la licencia se celebra entre tú y el responsable identificado en la cláusula 1. Apple no es parte y Tindivo responde por la app y su contenido. La licencia de uso es no transferible y permite utilizar la app en dispositivos Apple compatibles que poseas o controles, conforme a las reglas de uso de sus servicios y a los usos adicionales que estas autoricen, incluidos los que correspondan a Compartir en Familia o compras por volumen. **Verificar con la guía vigente.**

**14.3. Mantenimiento y soporte.** El responsable de Tindivo presta el mantenimiento y soporte que corresponda según estos términos y la ley. Apple no tiene obligación de prestarlos. El contacto es el indicado en la cláusula 1. **Verificar con la guía vigente.**

**14.4. Garantías.** Tindivo responde por las garantías aplicables a la app en la medida exigida por la ley. Si la app incumple una garantía aplicable, puedes comunicarlo a Apple para que, cuando corresponda, devuelva el precio pagado por la app. En la máxima medida permitida por la ley, Apple no asume otras obligaciones de garantía; las demás reclamaciones, pérdidas, responsabilidades, daños, costos o gastos atribuibles a ese incumplimiento corresponden al responsable de Tindivo. **Verificar con la guía vigente.**

**14.5. Reclamaciones sobre la app.** Corresponde al responsable de Tindivo, y no a Apple, atender las reclamaciones tuyas o de terceros relacionadas con la app o con su posesión o uso, incluidas las de responsabilidad por producto, incumplimiento de requisitos legales o regulatorios y protección del consumidor o privacidad, en la medida aplicable. **Verificar con la guía vigente.**

**14.6. Propiedad intelectual de terceros.** Si un tercero reclama que la app o tu posesión y uso de ella infringen sus derechos de propiedad intelectual, corresponde al responsable de Tindivo, y no a Apple, investigar, defender, resolver y atender esa reclamación conforme a las obligaciones aplicables. **Verificar con la guía vigente.**

**14.7. Cumplimiento legal.** Declaras que no te encuentras en un país sujeto a embargo del Gobierno de Estados Unidos o designado por dicho Gobierno como país que apoya el terrorismo, y que no figuras en sus listas de personas o entidades prohibidas o restringidas, según resulte exigible para la distribución de la app. **Verificar con la guía vigente.**

**14.8. Identificación del desarrollador.** Para preguntas, quejas o reclamaciones sobre la app, puedes dirigirte al responsable de Tindivo mediante su nombre legal, domicilio, teléfono y correo indicados en la cláusula 1. [PENDIENTE DE JESÚS: completar todos esos datos antes de usar este anexo]. **Verificar con la guía vigente.**

**14.9. Condiciones de terceros.** Al usar la app debes cumplir los acuerdos de terceros que te resulten aplicables, como los de tu proveedor de conexión. **Verificar con la guía vigente.**

**14.10. Beneficiarios.** Apple y sus subsidiarias son terceros beneficiarios de la licencia de la app. Al aceptarla, reconoces que Apple puede exigir su cumplimiento frente a ti como tercero beneficiario. **Verificar con la guía vigente.**

**14.11. Alternativa de licencia estándar.** Si Jesús elige la EULA estándar, sustituir la propuesta anterior por: «La licencia de uso de la app descargada desde App Store se rige por la EULA estándar de Apple, disponible en [PENDIENTE DE JESÚS: enlace oficial vigente]. Estos términos regulan los servicios de Tindivo». [PENDIENTE DE JESÚS: confirmar su configuración en App Store Connect y resolver cualquier incompatibilidad entre documentos]. **Verificar con la guía vigente.**

**14.12. Google Play.** Si descargas Tindivo desde Google Play, estos términos regulan tu relación con Tindivo, junto con las condiciones de Google Play que te correspondan. La descarga no convierte a Google en vendedor de los alimentos, objetos o servicios de transporte de Tindivo. El soporte de Tindivo se presta por los contactos de la cláusula 1. [PENDIENTE DE JESÚS: confirmar si se incorporará una licencia de software específica para Android]. **Verificar con la guía vigente.**

**14.13. Pagos de servicios físicos.** Los pagos de restaurante, transporte de Entregas y compras físicas en Store siguen los canales descritos en estos términos. No se presentan como compras de contenido digital de la tienda. **Verificar con la guía vigente.**

---

# 2. Tabla de trazabilidad

Las referencias corresponden exclusivamente al snapshot suministrado. Las reglas propuestas sin respaldo documental se identifican como redacción estándar o quedan pendientes; no se presentan como implementación comprobada.

| Cláusula | Fuente y alcance |
|---|---|
| 1.1. Responsable y contactos | `Docs/planes/movil/decisiones.md:88` — publicador persona natural; `Docs/trabajo/movil/07-publicacion-tiendas.md:91-92`, `:109-111`, `:255` — identidad, domicilio y correo pendientes. D-36 se aplica con el estado confirmado en el encargo. Ausencia de RUC: encargo de Jesús. |
| 1.2. Alcance web y app | `Docs/negocio/apps.md:9-17`, `:47-50`; `Docs/planes/movil/decisiones.md:102`. |
| 1.2. Registro de aceptación | `apps/api/app/api/v1/customer/terms-acceptance/route.ts:15-23`, `:28-39`, `:43-54` — versión, fecha e idempotencia. Acción y momento de aceptación: pendientes; la ruta no acredita la interfaz. |
| 1.2. Consentimiento comercial separado | `Docs/trabajo/movil/07-publicacion-tiendas.md:78`; `Docs/planes/movil/decisiones.md:99`. |
| 1.3. Cambios de versión | La capacidad de registrar versiones consta en `apps/api/app/api/v1/customer/terms-acceptance/route.ts:21-22`. Aviso, vigencia y nueva aceptación: **sin fuente: redacción estándar**, con decisiones pendientes. |
| 2.1. Intermediación y pagos | `Docs/negocio/plataforma.md:7-10`, `:53-58`; `Docs/negocio/dinero.md:13-15`; `apps/customer/app/terminos/page.tsx:16`. |
| 2.2. Funciones y responsabilidades | Funciones: `Docs/negocio/servicios/pedidos-restaurante.md:26-40`; `Docs/glosario.md:33-36`. Atribución jurídica y salvaguarda de derechos: **sin fuente: redacción estándar**. |
| 2.3. Diferencia entre servicios | `Docs/negocio/servicios/entregas.md:8-10`; `Docs/negocio/servicios/store.md:8-10`; `Docs/negocio/dinero.md:15`, `:125-126`. |
| 3.1. Edad | `Docs/planes/movil/decisiones.md:31` — D-46. |
| 3.2. Identidad | `Docs/planes/movil/decisiones.md:97` — D-22 abierta; `Docs/negocio/apps.md:13` — verificación telefónica. |
| 3.3. Datos correctos y seguridad | `apps/customer/app/terminos/page.tsx:39`; `Docs/negocio/servicios/entregas.md:31-32`. Credenciales y comunicación de accesos desconocidos: **sin fuente: redacción estándar**. |
| 4.1. Modalidades y confirmación | `Docs/negocio/servicios/pedidos-restaurante.md:14-17`, `:28-30`; `Docs/negocio/plataforma.md:28-33`; `Docs/glosario.md:56`. |
| 4.2. Horarios y disponibilidad | `Docs/negocio/plataforma.md:44-49`; `Docs/negocio/servicios/pedidos-restaurante.md:73-85`. Detalle público de cobertura de restaurantes: insuficiente; queda pendiente. |
| 4.3. Tiempos y vencimientos | `Docs/negocio/servicios/pedidos-restaurante.md:50-69`; la ampliación consta en `:58`. |
| 4.4. Cancelación | `Docs/negocio/servicios/pedidos-restaurante.md:19`, `:32-43`; `Docs/negocio/dinero.md:85-94`. Límite exacto de cancelación por el cliente: sin especificar en las fuentes autorizadas. |
| 4.5. Recojo y pago | `Docs/negocio/antifraude.md:47-55`; `Docs/negocio/servicios/pedidos-restaurante.md:15-17`. |
| 5.1. Entregas y requisitos | `Docs/negocio/servicios/entregas.md:8-10`, `:24-32`, `:52-53`. |
| 5.2. Objetos permitidos y prohibidos | `Docs/negocio/servicios/entregas.md:38-45`. El límite de responsabilidad mencionado allí es un borrador; no se incorpora como regla vigente. |
| 5.3. Aceptación, espera y pago | `Docs/negocio/servicios/entregas.md:58-66`; `Docs/negocio/dinero.md:107-112`. Pérdida, daño, retorno y otras condiciones: pendientes. |
| 5.4. Store | `Docs/negocio/servicios/store.md:8-10`, `:14-21`, `:28-29`; `Docs/negocio/dinero.md:125-126`. Salvaguarda de derechos: **sin fuente: redacción estándar**. |
| 6.1. Precios y delivery | `Docs/negocio/dinero.md:19-35`; `Docs/negocio/servicios/store.md:20-21`. Revisión previa del total: **sin fuente: redacción estándar**. |
| 6.2. Medios de pago y umbral | `apps/customer/app/terminos/page.tsx:35`; `apps/customer/lib/prepay.ts:20-32`; `Docs/negocio/antifraude.md:21-32`, `:47-55`, `:67-69`. |
| 6.3. Capturas y verificación | `Docs/glosario.md:48`; `Docs/negocio/servicios/pedidos-restaurante.md:56-57`; `Docs/trabajo/movil/07-publicacion-tiendas.md:219-221`. Distinción respecto del comprobante de venta: **sin fuente: redacción estándar**. Emisión y solicitud: pendientes. |
| 7.1. Antifraude humano | `Docs/negocio/antifraude.md:8-13`, `:21-43`; `Docs/negocio/apps.md:16-17`. |
| 7.2. Incidencias | `Docs/negocio/antifraude.md:59-63`; `Docs/negocio/servicios/pedidos-restaurante.md:37-39`. Contacto para discutir una incidencia: soporte publicado en `apps/customer/app/terminos/page.tsx:55`; no se afirma un procedimiento formal. |
| 7.3. Consecuencias | `Docs/negocio/antifraude.md:21-24`, `:61-63`. |
| 8.1. Atención y reparto | `apps/customer/app/terminos/page.tsx:55`; `Docs/negocio/plataforma.md:40`; `Docs/negocio/dinero.md:85-103`, `:111-112`; `Docs/negocio/servicios/store.md:8-10`. Procedimiento y plazos: pendientes. |
| 8.2. Reembolsos de restaurante | `Docs/negocio/plataforma.md:55-58`; `Docs/negocio/dinero.md:85-94`. Existe contradicción de alcance; se conserva el supuesto común y se marca el resto. |
| 8.3. Entregas y Store | `Docs/negocio/dinero.md:107-112`, `:125-126`. Condiciones concretas de devolución: pendientes. |
| 8.4. Libro de Reclamaciones | Estado pendiente del RUC y referencia a Ley 29571: encargo de Jesús, **sin fuente en los archivos autorizados**. No sustitución de derechos: **sin fuente: redacción estándar**. |
| 9.1. Conducta | Fraude y objetos prohibidos: `Docs/negocio/antifraude.md:8-13`; `Docs/negocio/servicios/entregas.md:24`, `:38-43`. Respeto, suplantación e interferencia: **sin fuente: redacción estándar**. |
| 9.2. Reseñas | `Docs/negocio/apps.md:41-44`; `Docs/trabajo/movil/07-publicacion-tiendas.md:242-245`; `:118-119`. Límites sobre publicidad y datos ajenos: **sin fuente: redacción estándar**. |
| 10.1. Avisos operativos | `Docs/negocio/apps.md:15-17`; `Docs/trabajo/movil/07-publicacion-tiendas.md:63`, `:78`. Dependencia de permisos y dispositivo: **sin fuente: redacción estándar**. |
| 10.2. Promociones | `Docs/trabajo/movil/07-publicacion-tiendas.md:78`, `:118-119`; `Docs/planes/movil/decisiones.md:99`. Frecuencia y horarios: pendientes. |
| 11. Privacidad | `apps/customer/app/terminos/page.tsx:80-84`; `apps/customer/app/privacidad/page.tsx:14-39`; `Docs/trabajo/movil/07-publicacion-tiendas.md:89-105`. |
| 12.1. Recorridos de borrado | `Docs/trabajo/movil/07-publicacion-tiendas.md:74`, `:132-133`, `:189-208`. Son diseño, no prueba de funcionamiento. |
| 12.2. Eliminación y anonimización | `Docs/planes/movil/decisiones.md:29`; `Docs/trabajo/movil/07-publicacion-tiendas.md:199-201`. Tratamiento de comentarios libres: pendiente de precisión. |
| 12.3. Retención | `Docs/planes/movil/decisiones.md:29` — D-44; `Docs/trabajo/movil/07-publicacion-tiendas.md:251`. Inicio del cómputo y plazos restantes: no definidos. |
| 12.4. Casos abiertos e identidad | Identidad pendiente en `Docs/trabajo/movil/07-publicacion-tiendas.md:205`. Tratamiento de operaciones abiertas: sin regla en las fuentes autorizadas. |
| 13.1. Disponibilidad y actualización | Versión mínima obligatoria: `Docs/planes/movil/decisiones.md:117-118`, `:130-134`. Interrupciones: **sin fuente: redacción estándar**; atención operativa pendiente. |
| 13.2. Cambios | Configuración y pedidos manuales: `Docs/negocio/dinero.md:32-37`. Distinción entre nueva cotización y pedido confirmado: **sin fuente: redacción estándar**; regla posterior pendiente. |
| 13.3. Ley y jurisdicción | Perú y referencia territorial publicada: `apps/customer/app/terminos/page.tsx:51`. Competencia legal y salvaguarda de derechos: **sin fuente: redacción estándar**. |
| 14.1. Elección de EULA | **Sin fuente: redacción estándar**. Decisión y comprobación pendientes. |
| 14.2. Partes y alcance | **Sin fuente: redacción estándar**, basada en conocimiento general de los mínimos de Apple; verificar con la guía vigente. |
| 14.3. Soporte | **Sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.4. Garantías | **Sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.5. Reclamaciones | **Sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.6. Propiedad intelectual | **Sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.7. Cumplimiento legal | **Sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.8. Datos del desarrollador | Datos requeridos por el expediente: `Docs/trabajo/movil/07-publicacion-tiendas.md:91-92`, `:109-111`. Exigencia contractual de Apple: **sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.9. Acuerdos de terceros | **Sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.10. Beneficiarios | **Sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.11. EULA estándar | **Sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.12. Google Play | **Sin fuente: redacción estándar**; verificar con la guía vigente. |
| 14.13. Bienes y servicios físicos | `Docs/trabajo/movil/07-publicacion-tiendas.md:81`, `:219-221`; extensión a Entregas y Store sustentada en `Docs/negocio/dinero.md:107-112`, `:125-126`. Verificar con la guía vigente. |

# 3. Contradicciones y desfases

| Tema | Fuentes enfrentadas | Tratamiento en el borrador |
|---|---|---|
| **Prohibición absoluta de cancelar al empezar la preparación** | Publicado: `apps/customer/app/terminos/page.tsx:20`. Canon: `Docs/negocio/servicios/pedidos-restaurante.md:33` permite cancelación por negocio o administrador de pedidos no cerrados; `:42-43` reconoce una función de cancelación por el cliente sin describir aquí sus límites. | Se retira la prohibición universal. No se deduce de ello que el cliente pueda cancelar libremente en cualquier estado; queda pendiente su regla exacta. |
| **“Fondo de contingencia”** | Publicado: título y cláusula en `apps/customer/app/terminos/page.tsx:46-47`. Canon: `Docs/negocio/plataforma.md:53-58` declara eliminado el fondo y describe un adelanto de devolución. | Se elimina ese nombre y se describe el adelanto documentado. |
| **Alcance de reembolsos dentro del propio canon** | `Docs/negocio/plataforma.md:55-58` presenta la apelación aprobada como única excepción. `Docs/negocio/dinero.md:85-94` contempla devoluciones acordadas con el restaurante y otros registros de reembolso; `:111-112` atribuye a Tindivo la devolución del transporte de Entregas canceladas tras el cobro. | No se elige una regla universal entre textos del mismo nivel. Se conserva la apelación como supuesto común, se separa el transporte propio de Entregas y se marca la conciliación del resto. |
| **Cargo de reembolso frente a devolución ejecutada** | Publicado: `apps/customer/app/terminos/page.tsx:47` habla de adelantos registrados. Canon: `Docs/negocio/dinero.md:85-88` distingue expresamente el cargo de la devolución; `:96-100` documenta un cargo sin devolución real. | Se aclara que el registro no demuestra que el cliente haya cobrado. |
| **Pago al negocio formulado para toda Tindivo** | Publicado: `apps/customer/app/terminos/page.tsx:16`, `:35`; privacidad: `apps/customer/app/privacidad/page.tsx:19`. Canon: `Docs/negocio/dinero.md:13-15`, `:107-112`, `:125-126`. | Se limita esa descripción a restaurantes. Entregas cobra transporte para Tindivo; Store cobra Jesús fuera de la plataforma. |
| **Umbral estático frente a configuración** | Publicado: `apps/customer/app/terminos/page.tsx:35` interpola una constante. `apps/customer/lib/prepay.ts:20-32` reconoce que es un valor de respaldo y que el documento puede desalinearse. Canon: `Docs/negocio/plataforma.md:62-63`. | Se remite a «el monto que indica la app al pagar», sin fijar cifra. |
| **Medios de pago sin distinguir recojo** | Publicado: `apps/customer/app/terminos/page.tsx:35`. Canon: `Docs/negocio/antifraude.md:47-55`. | Se añade que el recojo «más tarde» requiere prepago y que no existe Yape al recibir para recojo. |
| **Consecuencias antifraude incompletas** | Publicado: `apps/customer/app/terminos/page.tsx:43` describe dos incidencias y una facultad general de suspensión. Canon: `Docs/negocio/antifraude.md:21-24`, `:61-63`. | Se añaden tres strikes y bloqueo de treinta días, el anclaje particular del recojo y la excepción de recojo ya pagado. No se crea una potestad sancionadora adicional. |
| **Llamada diseñada frente a práctica operativa** | Regla: `Docs/negocio/antifraude.md:12-13`, `:29-31`. Práctica documentada: `:38-40` indica que la cajera rara vez llama o escribe y valida desde el tablero. | Se describe la llamada cuando corresponde, sin afirmar que toda validación efectivamente incluya una llamada. |
| **No-show definido frente a práctica y prueba pendiente** | Regla: `Docs/negocio/antifraude.md:59-63`. Práctica: `:79-81` señala que no se ha usado y que falta la prueba fotográfica prevista en backlog. | Se documenta la regla; no se inventa una fotografía obligatoria ni un procedimiento probatorio ya implantado. |
| **D-44 frente al diseño antiguo de borrado** | Canon: `Docs/planes/movil/decisiones.md:29`. Expediente: `Docs/trabajo/movil/07-publicacion-tiendas.md:202-204` deja comprobantes sin plazo, permite borrado inmediato de pedidos cerrados y deja directorio y antifraude por decidir. Su propia tabla posterior, `:251`, ya contiene la recomendación aceptada. | Mandan los noventa días y la conservación de directorio y antifraude. No se conserva como alternativa el borrado inmediato del comprobante. |
| **D-44 frente a privacidad publicada y borrador** | Canon: `Docs/planes/movil/decisiones.md:29`. Publicado: `apps/customer/app/privacidad/page.tsx:35`, conservación genérica. Borrador del expediente: `Docs/trabajo/movil/07-publicacion-tiendas.md:128-130`, plazo pendiente y sin explicar directorio y antifraude. | Se explicita la retención aprobada y se exige coordinar la privacidad antes de publicar. |
| **Identidad simplificada en el expediente** | `Docs/trabajo/movil/07-publicacion-tiendas.md:73` dice que hoy solo hay Google. `Docs/planes/movil/decisiones.md:97` contempla Google, correo y contraseña, Apple y posible acceso telefónico, con decisión todavía abierta. | No se promete una lista definitiva de métodos. La nota del expediente no basta para cerrar D-22. |
| **Acceso Apple y borrado descritos como disponibles** | Nota al revisor: `Docs/trabajo/movil/07-publicacion-tiendas.md:223`. El mismo expediente reconoce que el borrado no existe en `:74` y describe su diseño en `:189-208`; D-22 sigue abierta en `Docs/planes/movil/decisiones.md:97`. | Se trata esa nota como texto para un build futuro, no como evidencia de disponibilidad actual. |
| **Edad y sistemas mínimos aún señalados como pendientes** | Expediente: `Docs/trabajo/movil/07-publicacion-tiendas.md:51`, `:135`. Decisiones aprobadas: `Docs/planes/movil/decisiones.md:31-32`; D-29 sigue apareciendo abierta en `:104`. | Se usa edad mínima de dieciocho años. Android 8 e iOS 17 son los mínimos decididos, sin convertirlos en una garantía permanente en los términos. |
| **Reseñas: precisión sobre quién ve qué** | Expediente: `Docs/trabajo/movil/07-publicacion-tiendas.md:242-245` resume que solo las lee administración. Canon: `Docs/negocio/apps.md:43-44` permite al negocio ver nota y etiquetas, nunca el texto. | Se distingue calificación y etiquetas del comentario. No hay reseñas públicas. |
| **Web de respaldo frente a futura desactivación** | D-27: `Docs/planes/movil/decisiones.md:102` recomienda conservar respaldo. D-59: `:77` justifica diferencias porque Jesús va a apagar la web. El encargo confirma expresamente conservarla. | Se aplica el alcance web y app indicado por Jesús. Se señala la inconsistencia interna sin eliminar la web del borrador. |
| **Estado documental de D-36** | `Docs/planes/movil/decisiones.md:88` mantiene la persona natural como recomendación bajo decisiones abiertas; `:196` vuelve a pedir confirmación. El encargo la presenta como decisión vigente. | Se aplica la instrucción actual: Jesús publica como persona natural. No se reabre esa elección. |

# 4. Decisiones que debe tomar Jesús para cerrar el texto

Las decisiones D-04, D-44, D-45 y D-46 se mantienen. D-36 y la continuidad de la web se aplican como las confirma este encargo.

| Decisión pendiente | Alternativas | Recomendación |
|---|---|---|
| **Identificación y contactos** | Domicilio y contactos específicos para el servicio; o contactos personales existentes destinados también a esa atención. | Completar nombre legal, DNI, domicilio, teléfono y correos verificables. Mantener coherencia con el publicador de las tiendas y actualizar el RUC cuando corresponda. |
| **Versión y entrada en vigencia** | Identificador por fecha; o identificador secuencial. | Una fecha más revisión, usando exactamente el mismo identificador en documento, web, app y registro de aceptación. Fijar la fecha cuando el texto y las funciones estén listos. |
| **Aceptación y cambios** | Aceptación expresa antes del primer pedido y ante cambios relevantes; o aceptación expresa de cada nueva versión publicada. | Separar correcciones editoriales de cambios de obligaciones y solicitar nueva aceptación para los segundos. Definir expresamente las funciones accesibles sin aceptar, conservando atención de pedidos y derechos. Es una propuesta, no una regla vigente. |
| **Identidad — D-22** | Mantener los accesos actuales y añadir Apple; introducir acceso por teléfono; retirar o mantener contraseña en nativo. | Cerrar D-22 con los datos de uso y un flujo de recuperación para teléfonos existentes. Hasta entonces, usar una descripción neutral como la del borrador. |
| **Cancelación por el cliente** | Cancelación directa hasta un estado definido; o solicitud atendida por negocio/soporte después de ese estado. | Definir ambas etapas y hacerlas coincidir con el servidor. No conservar la prohibición absoluta publicada ni prometer cancelación ilimitada. |
| **Cambios posteriores al pedido** | Bloquear modificaciones; o permitir cambios delimitados con información y conformidad del cliente. | Diferenciar pedidos de la app y pedidos manuales. Precisar qué sucede con productos agotados, total y pago, antes de escribir consecuencias económicas. |
| **Cobertura pública de restaurantes** | Mapa consultable; o validación de dirección acompañada de una explicación clara. | Mostrar la cobertura o su validación antes de confirmar, con un mensaje comprensible cuando no haya servicio. |
| **Alcance del reembolso de restaurante** | Limitar el adelanto de Tindivo a apelaciones; o formalizar los demás supuestos descritos por el canon de dinero. | Conciliar ambos documentos y describir exactamente los supuestos que Jesús asumirá, separando aprobación, registro del cargo y devolución efectivamente realizada. |
| **Atención, devolución y comprobantes** | Resolución coordinada por soporte; o combinación de soporte con funciones específicas en la plataforma. | Documentar el flujo real y asignar responsable, canal y plazo a cada servicio. Identificar al emisor de cada comprobante antes de prometerlo. |
| **Entregas: ausencia, retorno, pérdida o daño** | Resolver caso por caso; o aprobar reglas generales previas al envío. | Aprobar reglas generales que informen aceptación, cancelación, custodia, retorno y reparación. No reutilizar automáticamente el límite económico del borrador antiguo. |
| **Store: condiciones de venta** | Mantener cierre por WhatsApp con información estructurada; o desarrollar un flujo de compra en plataforma. | Mantener el cierre actual por WhatsApp y preparar condiciones escritas de reserva, estado de la pieza, pago, envío, comprobantes y atención posterior. |
| **Libro de Reclamaciones** | Mantener el diseño en espera; o completar los datos y habilitación aplicables. | Resolver su situación y completar la cláusula con el procedimiento real. La falta de RUC no debe presentarse en el texto como una exención. |
| **Cómputo de los noventa días** | Desde el pago o carga del comprobante; o desde el cierre del pedido. | Definir un evento único, verificable y compatible con la finalidad de conservación. Como propuesta operativa, contar desde el cierre del pedido; requiere decisión expresa, no está fijado por D-44. |
| **Directorio y antifraude** | Conservar campos y teléfono identificable; o minimizar campos y usar una representación del teléfono cuando permita cumplir la finalidad. | Mantener la conservación decidida en D-44 y precisar campos, acceso, finalidad y plazo de cada conjunto. Evaluar el hash sugerido por D-23 sin tratarlo como ya aprobado. |
| **Borrado y operaciones abiertas** | Anonimización inmediata con gestión separada del caso; o tratamiento diferenciado mientras exista una operación pendiente. | Diseñar una regla que permita pedir el borrado y seguir reclamando sin perder el caso. Confirmar ejecución, comunicación y tratamiento de la identidad de acceso. |
| **Comentarios de reseñas tras el borrado** | Eliminar el texto; o conservarlo tras una anonimización efectiva. | Conservar la calificación sin autor y eliminar el texto libre salvo que exista una finalidad concreta y un mecanismo fiable para retirar identificadores. |
| **Promociones — D-24** | Lanzar solo avisos del pedido; o activar promociones con consentimiento separado. | Empezar con avisos del pedido. Completar consentimiento, frecuencia y horarios antes de habilitar promociones. |
| **Licencia para tiendas** | EULA estándar de Apple y términos separados de servicio; o términos propios que también sean EULA. Para Android, licencia expresa o integración delimitada en estos términos. | Usar la EULA estándar de Apple para reducir el texto contractual propio; confirmar su enlace y configuración. Para Android, definir expresamente el alcance del permiso de uso. Verificar ambas soluciones con las guías vigentes. |
| **Jurisdicción** | Referencia general a autoridades competentes en Perú; o referencia territorial adicional jurídicamente comprobada. | Mantener la formulación general del borrador y evitar un fuero exclusivo no confirmado. |

# 5. Qué falta para las tiendas

Este texto no implementa los flujos ni acredita su funcionamiento. Las fuentes describen varios de ellos como trabajo pendiente.

| Pendiente | Qué debe quedar resuelto |
|---|---|
| **Publicación y enlaces** | Publicar la versión aprobada en `/terminos`, accesible desde la app y desde el control de aceptación; conservar también el enlace a privacidad. Comprobar que los enlaces abren el documento correcto y que la versión visible coincide con la registrada. La página actual aún muestra la versión anterior: `apps/customer/app/terminos/page.tsx:71`. |
| **Aceptación versionada en ambos canales** | Conectar el control de aceptación de web y nativo con el registro por versión. La ruta ya registra versión y fecha y conserva la aceptación original al repetirla: `apps/api/app/api/v1/customer/terms-acceptance/route.ts:15-23`, `:28-54`. El archivo no demuestra cuándo aparece el control, qué versión se considera vigente ni que se impida continuar cuando corresponda. |
| **Texto aceptado recuperable** | Conservar una copia identificable de cada versión publicada para poder relacionarla con la aceptación registrada. La ruta suministrada guarda identificador y fecha; no demuestra un archivo histórico del documento. Es una necesidad operativa de trazabilidad, no un requisito de tienda comprobado en este expediente. |
| **Borrado dentro de la app** | Habilitar un recorrido real en Cuenta, no solo la cláusula. Resolver referencias de pedidos, anonimización, identidad y datos relacionados conforme a D-44. El expediente identifica impedimentos y propone una operación transaccional: `Docs/trabajo/movil/07-publicacion-tiendas.md:189-205`. |
| **Página web de borrado** | Publicar la URL, permitir solicitarlo sin la app, identificar al solicitante y explicar plazo y conservación. Usar el mismo tratamiento que en la app y enlazarla en la ficha de Google Play: `Docs/trabajo/movil/07-publicacion-tiendas.md:74`, `:207-208`. |
| **Retención efectivamente aplicada** | Implementar los noventa días de comprobantes y el tratamiento de directorio, antifraude y pedidos; comprobar que la eliminación de cuenta no borre por accidente lo que D-44 manda conservar. Corregir las instrucciones antiguas del expediente. |
| **Privacidad coherente** | Actualizar `/privacidad` con responsable, contactos, ubicación, comprobantes, reseñas, notificaciones, proveedores, transferencias y borrado. Revisar el inventario contra el build final y sus SDK: `Docs/trabajo/movil/07-publicacion-tiendas.md:89-105`, `:139-166`. D-53 ya descarta un SDK de analítica de producto nativa: `Docs/planes/movil/decisiones.md:43`. |
| **Consentimiento de promociones** | Implementar y comprobar el control separado, apagado por defecto, sin condicionar los avisos del pedido. Si no hay promociones, no presentarlas como disponibles: `Docs/trabajo/movil/07-publicacion-tiendas.md:78`; `Docs/planes/movil/decisiones.md:99`. |
| **Licencia y configuración de tienda** | Elegir EULA propia o estándar, completar identificación y contacto y configurar la opción correspondiente en App Store Connect. Confirmar también las condiciones aplicables a Google Play. El expediente no contiene los mínimos de EULA; el anexo se redactó sin consulta externa y cada punto exige verificar la guía vigente. |
| **Recorrido del revisor** | Permitir consultar los documentos, aceptar la versión y probar el borrado sin afectar operaciones reales. Aplicar el negocio de demostración decidido en D-45 y actualizar la nota del revisor para describir únicamente funciones terminadas: `Docs/planes/movil/decisiones.md:30`; `Docs/trabajo/movil/07-publicacion-tiendas.md:168-187`, `:210-223`. |
| **Comprobación al enviar** | Volver a contrastar enlaces, borrado, licencia y declaraciones con las guías vigentes de ambas tiendas. El propio expediente exige esa revisión en el momento del envío: `Docs/trabajo/movil/07-publicacion-tiendas.md:3-7`; `Docs/planes/movil/decisiones.md:162-164`. |