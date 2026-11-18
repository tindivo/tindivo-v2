# Equivalencias: requisitos del cliente, lista del 20-sep → spec del #182 (17-nov)

> Trabajo, no manda. Sirve para migrar cada capacidad a `Docs/producto/` sin perder un requisito (estándar §2.4).
> Vieja: `Docs/trabajo/movil/03-requisitos/CUS-cliente.md` (140 IDs). Nueva: `requisitos/` de esta carpeta.
> Método: Haiku y Gemini Flash la armaron por separado sin verse; coincidieron en 134 de 140. Claude resolvió las 6
> diferencias y las dudas leyendo las filas. Clases: equivale · modifica · sustituye · retira.

Totales: equivale 115 · modifica 12 · retira 10 · sustituye 3 · total 140

| ID viejo | Clase | ID nuevo | Motivo | Quién |
|---|---|---|---|---|
| CUS-ACC-001 | equivale | CUS-ACC-001 | mismo perfil y verificación de celular desde Cuenta | Haiku = Gemini |
| CUS-ACC-002 | equivale | CUS-ACC-002 | mismas acciones de añadir, editar y predeterminar direcciones | Haiku = Gemini |
| CUS-ACC-003 | equivale | CUS-ACC-003 | mismos tres pedidos recientes y contadores de reclamos | Haiku = Gemini |
| CUS-ACC-004 | equivale | CUS-ACC-004 | mismo menú de cuenta con cerrar sesión | Haiku = Gemini |
| CUS-ADR-001 | equivale | CUS-ADR-001 | referencia 5-140 en ambas; la nueva solo añade la ratificación de Jesús | Claude (resolvió desacuerdo o duda) |
| CUS-ADR-002 | equivale | CUS-ADR-002 | mismo rechazo de textos basura en línea y referencia | Haiku = Gemini |
| CUS-ADR-003 | equivale | CUS-ADR-003 | mismo pin obligatorio dentro del polígono de reparto | Haiku = Gemini |
| CUS-ADR-004 | equivale | CUS-ADR-004 | misma ubicación vacía por defecto, sin centro del pueblo | Haiku = Gemini |
| CUS-ADR-005 | equivale | CUS-ADR-005 | misma lectura única de GPS con alta precisión | Haiku = Gemini |
| CUS-ADR-006 | equivale | CUS-ADR-006 | mismo aviso de precisión insuficiente a 30 m | Haiku = Gemini |
| CUS-ADR-007 | equivale | CUS-ADR-007 | misma petición de precisión aproximada y precisa | Haiku = Gemini |
| CUS-ADR-008 | equivale | CUS-ADR-008 | mismo mapa con vista previa y pantalla completa | Haiku = Gemini |
| CUS-ADR-009 | equivale | CUS-ADR-009 | misma dirección predeterminada única | Haiku = Gemini |
| CUS-ADR-010 | equivale | CUS-ADR-010 | mismas acciones de añadir, editar, eliminar y predeterminar | Haiku = Gemini |
| CUS-ADR-011 | equivale | CUS-ADR-011 | misma calidad del punto de entrega enviada con el pedido | Haiku = Gemini |
| CUS-ADR-012 | equivale | CUS-ADR-012 | misma tarifa de envío mostrada antes de confirmar | Haiku = Gemini |
| CUS-ADR-013 | equivale | CUS-ADR-013 | mismo requisito de tarifa devuelta por el servidor | Haiku = Gemini |
| CUS-ADR-014 | equivale | CUS-ADR-014 | mismo recojo sin dirección ni coordenadas | Haiku = Gemini |
| CUS-ADR-015 | equivale | CUS-ADR-015 | mismo guardado best-effort de dirección nueva como Casa | Haiku = Gemini |
| CUS-AUT-001 | equivale | CUS-AUT-001 | mismo catálogo sin sesión y login solo al checkout | Haiku = Gemini |
| CUS-AUT-002 | equivale | CUS-AUT-002 | mismo acceso con Google y selector de cuenta | Haiku = Gemini |
| CUS-AUT-003 | equivale | CUS-AUT-003 | mismo Sign in with Apple en iPhone | Haiku = Gemini |
| CUS-AUT-004 | retira | - | texto igual, nota dice retirado en nativo, solo Google | Haiku = Gemini |
| CUS-AUT-005 | retira | - | texto igual, nota dice retirado en nativo, solo Google | Haiku = Gemini |
| CUS-AUT-006 | equivale | CUS-AUT-006 | misma confirmación de nombre y aceptación de términos | Haiku = Gemini |
| CUS-AUT-007 | equivale | CUS-AUT-007 | misma verificación de celular por SMS antes del primer pedido | Haiku = Gemini |
| CUS-AUT-008 | modifica | CUS-AUT-008 | sin traslado automático de celular en el lanzamiento (AUT-028) | Haiku = Gemini |
| CUS-AUT-009 | equivale | CUS-AUT-009 | misma reverificación si cambia el celular en checkout | Haiku = Gemini |
| CUS-AUT-010 | equivale | CUS-AUT-010 | mismo completar nombre si falta el perfil | Haiku = Gemini |
| CUS-AUT-011 | equivale | CUS-AUT-011 | misma sesión local conservada sin red | Haiku = Gemini |
| CUS-AUT-012 | equivale | CUS-AUT-012 | mismo cierre solo de la sesión local | Haiku = Gemini |
| CUS-AUT-013 | equivale | CUS-AUT-013 | mismas dos acciones de cerrar sesión | Haiku = Gemini |
| CUS-AUT-014 | equivale | CUS-AUT-014 | mismo editar nombre del perfil | Haiku = Gemini |
| CUS-AUT-015 | equivale | CUS-AUT-015 | mismo progreso del perfil y paso faltante | Haiku = Gemini |
| CUS-AUT-016 | equivale | CUS-AUT-016 | solo web en ambas listas | Claude (resolvió desacuerdo o duda) |
| CUS-AUT-017 | equivale | CUS-AUT-017 | mismo borrado de cuenta desde la app | Haiku = Gemini |
| CUS-AUT-018 | retira | - | retirado del lanzamiento, sin categorías ni consentimiento comercial | Haiku = Gemini |
| CUS-CAT-001 | equivale | CUS-CAT-001 | mismo listado de negocios con eslogan, logo, ETA y estado | Haiku = Gemini |
| CUS-CAT-002 | equivale | CUS-CAT-002 | mismo saludo por nombre y pedido en curso | Haiku = Gemini |
| CUS-CAT-003 | equivale | CUS-CAT-003 | misma búsqueda de negocios y platos desde 2 caracteres | Haiku = Gemini |
| CUS-CAT-004 | equivale | CUS-CAT-004 | misma página de negocio con banner, horario y categorías | Haiku = Gemini |
| CUS-CAT-005 | modifica | CUS-CAT-005 | Destacados lo elige el restaurante (ver CUS-CAT-028) | Haiku = Gemini |
| CUS-CAT-006 | equivale | CUS-CAT-006 | misma búsqueda dentro de la carta | Haiku = Gemini |
| CUS-CAT-007 | equivale | CUS-CAT-007 | misma ficha de producto con precio, imagen y etiquetas | Haiku = Gemini |
| CUS-CAT-008 | equivale | CUS-CAT-008 | mismas reglas de modificadores por grupo | Haiku = Gemini |
| CUS-CAT-009 | equivale | CUS-CAT-009 | mismo cálculo de línea y límites de cantidad | Haiku = Gemini |
| CUS-CAT-010 | equivale | CUS-CAT-010 | mismo Agotado y bloqueo de platos no disponibles | Haiku = Gemini |
| CUS-CAT-011 | equivale | CUS-CAT-011 | misma franja horaria de platos con su etiqueta | Haiku = Gemini |
| CUS-CAT-012 | equivale | CUS-CAT-012 | mismo estado cerrado con hora de apertura | Haiku = Gemini |
| CUS-CAT-013 | equivale | CUS-CAT-013 | mismo rechazo de pedidos si no atiende hoy | Haiku = Gemini |
| CUS-CAT-014 | equivale | CUS-CAT-014 | mismo rechazo de pedidos si el negocio está pausado | Haiku = Gemini |
| CUS-CAT-015 | equivale | CUS-CAT-015 | mismo modo catálogo con pedido por WhatsApp | Haiku = Gemini |
| CUS-CAT-016 | equivale | CUS-CAT-016 | mismas capacidades de delivery y recojo del negocio | Haiku = Gemini |
| CUS-CAT-017 | equivale | CUS-CAT-017 | mismo selector Delivery/Recojo cuando ambos existen | Haiku = Gemini |
| CUS-CAT-018 | equivale | CUS-CAT-018 | mismo bloqueo de un pedido activo por negocio | Haiku = Gemini |
| CUS-CAT-019 | sustituye | CUS-CAT-031 | tarjeta de pedido en curso y punto en Pedidos | Haiku = Gemini |
| CUS-CAT-020 | equivale | CUS-CAT-020 | mismo carrusel de promociones en el inicio | Haiku = Gemini |
| CUS-CAT-021 | modifica | CUS-CAT-021 | horario y datos del negocio sin contacto (ver CUS-CAT-026) | Haiku = Gemini |
| CUS-CAT-022 | equivale | CUS-CAT-022 | mismo acceso a negocio por enlace compartido | Haiku = Gemini |
| CUS-CAT-023 | equivale | CUS-CAT-023 | mismo estado de apertura y disponibilidad calculados por servidor | Haiku = Gemini |
| CUS-CAT-024 | equivale | CUS-CAT-024 | marcado muerto en ambas listas | Claude (resolvió desacuerdo o duda) |
| CUS-CAT-025 | equivale | CUS-CAT-025 | marcado muerto en ambas listas | Claude (resolvió desacuerdo o duda) |
| CUS-CHK-001 | equivale | CUS-CHK-001 | mismo resumen con ítems, subtotal, envío y total | Haiku = Gemini |
| CUS-CHK-002 | equivale | CUS-CHK-002 | mismas reglas de nombre y celular válidos | Haiku = Gemini |
| CUS-CHK-003 | equivale | CUS-CHK-003 | mismo método de entrega que admite el negocio | Haiku = Gemini |
| CUS-CHK-004 | sustituye | CUS-CHK-028 | ya no se pregunta por recojo, todo recojo es prepago | Haiku = Gemini |
| CUS-CHK-005 | equivale | CUS-CHK-005 | misma dirección guardada o nueva con referencia y nota | Haiku = Gemini |
| CUS-CHK-006 | modifica | CUS-CHK-006 | sin selector de pago, todo recojo es prepago (CHK-024/028) | Haiku = Gemini |
| CUS-CHK-007 | modifica | CUS-CHK-007 | recojo «más tarde» eliminado, todo recojo es prepago | Haiku = Gemini |
| CUS-CHK-008 | equivale | CUS-CHK-008 | mismo pago en efectivo con billete y vuelto validado | Haiku = Gemini |
| CUS-CHK-009 | modifica | CUS-CHK-009 | en recojo el GPS ya no bloquea, «recojo ahora» eliminado | Haiku = Gemini |
| CUS-CHK-010 | equivale | CUS-CHK-010 | misma clave de idempotencia por intento | Haiku = Gemini |
| CUS-CHK-011 | equivale | CUS-CHK-011 | mismo vaciar bolsa y abrir seguimiento al crear | Haiku = Gemini |
| CUS-CHK-012 | equivale | CUS-CHK-012 | misma vista de bloqueo cuando la cuenta está bloqueada | Haiku = Gemini |
| CUS-CHK-013 | modifica | CUS-CHK-013 | sale la pregunta de recojo del orden de campos | Haiku = Gemini |
| CUS-CHK-014 | equivale | CUS-CHK-014 | mismo mensaje mientras se verifica la bolsa | Haiku = Gemini |
| CUS-CHK-015 | modifica | CUS-CHK-015 | sale el recojo «más tarde» de la explicación de plazos | Haiku = Gemini |
| CUS-CHK-016 | equivale | CUS-CHK-016 | mismo envío gratis de plato cuando la bolsa lo incluya | Haiku = Gemini |
| CUS-CHK-017 | equivale | CUS-CHK-017 | misma promo de envío gratis, diferida a M2 | Haiku = Gemini |
| CUS-CHK-018 | modifica | CUS-CHK-018 | deja de preguntar, pickupTiming según contrato REST v1 | Haiku = Gemini |
| CUS-CHK-019 | equivale | CUS-CHK-019 | mismo bloqueo del checkout por caso de pago pendiente | Haiku = Gemini |
| CUS-CHK-020 | equivale | CUS-CHK-020 | mismos mensajes comprensibles de errores del servidor | Haiku = Gemini |
| CUS-CRT-001 | equivale | CUS-CRT-001 | misma bolsa de un solo negocio con confirmación de reemplazo | Haiku = Gemini |
| CUS-CRT-002 | equivale | CUS-CRT-002 | misma fusión de líneas idénticas sumando cantidad | Haiku = Gemini |
| CUS-CRT-003 | equivale | CUS-CRT-003 | mismo cambio de cantidad y quitar línea | Haiku = Gemini |
| CUS-CRT-004 | equivale | CUS-CRT-004 | misma bolsa guardada en el dispositivo | Haiku = Gemini |
| CUS-CRT-005 | equivale | CUS-CRT-005 | misma validación de bolsa contra el catálogo vigente | Haiku = Gemini |
| CUS-CRT-006 | equivale | CUS-CRT-006 | mismo subtotal con redondeo a dos decimales | Haiku = Gemini |
| CUS-CRT-007 | equivale | CUS-CRT-007 | mismo método de entrega por bolsa | Haiku = Gemini |
| CUS-CRT-008 | equivale | CUS-CRT-008 | mismas comprobaciones previas al checkout en orden | Haiku = Gemini |
| CUS-CRT-009 | equivale | CUS-CRT-009 | mismo motivo visible si Ir a pagar está deshabilitado | Haiku = Gemini |
| CUS-CRT-010 | equivale | CUS-CRT-010 | mismo aviso de bolsa de recojo | Haiku = Gemini |
| CUS-CRT-011 | equivale | CUS-CRT-011 | mismos topes de líneas, cantidad y opciones | Haiku = Gemini |
| CUS-CRT-012 | equivale | CUS-CRT-012 | mismo Volver a pedir que repone la bolsa | Haiku = Gemini |
| CUS-ORD-001 | equivale | CUS-ORD-001 | mismo historial de últimos pedidos con resumen y estado | Haiku = Gemini |
| CUS-ORD-002 | equivale | CUS-ORD-002 | misma etiqueta corta de estado del pedido | Haiku = Gemini |
| CUS-ORD-003 | equivale | CUS-ORD-003 | mismas acciones según pedido: seguimiento, caso, calificar, repetir | Haiku = Gemini |
| CUS-ORD-004 | modifica | CUS-ORD-004 | prefijo del código fijado en #TDV- por decisión de Jesús | Haiku = Gemini |
| CUS-ORD-005 | equivale | CUS-ORD-005 | mismo contador de pedidos activos con consulta compartida | Haiku = Gemini |
| CUS-ORD-006 | equivale | CUS-ORD-006 | mismo historial paginado por servidor con estado proyectado | Haiku = Gemini |
| CUS-PAY-001 | equivale | CUS-PAY-001 | mismas tres esperas del prepago y su turno | Haiku = Gemini |
| CUS-PAY-002 | equivale | CUS-PAY-002 | mismo cómo pagar al aceptar: cuenta, QR, total y plazo | Haiku = Gemini |
| CUS-PAY-003 | equivale | CUS-PAY-003 | misma compresión de captura y vista previa | Haiku = Gemini |
| CUS-PAY-004 | equivale | CUS-PAY-004 | misma subida del comprobante a almacenamiento privado | Haiku = Gemini |
| CUS-PAY-005 | equivale | CUS-PAY-005 | mismo máximo de dos intentos de comprobante | Haiku = Gemini |
| CUS-PAY-006 | equivale | CUS-PAY-006 | mismo comprobante enviado visible con URL firmada | Haiku = Gemini |
| CUS-PAY-007 | equivale | CUS-PAY-007 | mismo resalte del botón al volver de la billetera | Haiku = Gemini |
| CUS-PAY-008 | equivale | CUS-PAY-008 | mismo bloqueo de pedidos con caso de pago sin resolver | Haiku = Gemini |
| CUS-PAY-009 | equivale | CUS-PAY-009 | misma solicitud de revisión de pago tras rechazo final | Haiku = Gemini |
| CUS-PAY-010 | equivale | CUS-PAY-010 | mismo resumen de reclamos y comprobante de devolución | Haiku = Gemini |
| CUS-REV-001 | equivale | CUS-REV-001 | misma reseña pendiente en el siguiente contacto | Haiku = Gemini |
| CUS-REV-002 | equivale | CUS-REV-002 | mismas puntuaciones de 1 a 5 con etiquetas y comentario | Haiku = Gemini |
| CUS-REV-003 | equivale | CUS-REV-003 | mismo Ahora no que descarta sin cerrar la ventana | Haiku = Gemini |
| CUS-SUP-001 | equivale | CUS-SUP-001 | mismo soporte por WhatsApp con mensaje preescrito | Haiku = Gemini |
| CUS-SUP-002 | equivale | CUS-SUP-002 | mismo acceso a Términos y Privacidad | Haiku = Gemini |
| CUS-SUP-003 | equivale | CUS-SUP-003 | mismo ejercicio de derechos ARCO desde la app | Haiku = Gemini |
| CUS-TRK-001 | equivale | CUS-TRK-001 | mismo seguimiento por código con o sin sesión | Haiku = Gemini |
| CUS-TRK-002 | equivale | CUS-TRK-002 | mismos cuatro pasos del estado y cancelado aparte | Haiku = Gemini |
| CUS-TRK-003 | equivale | CUS-TRK-003 | mismos subtítulos y mensajes según estado y pago | Haiku = Gemini |
| CUS-TRK-004 | equivale | CUS-TRK-004 | mismo tiempo estimado como rango | Haiku = Gemini |
| CUS-TRK-005 | equivale | CUS-TRK-005 | misma cuenta atrás con su sujeto por plazo | Haiku = Gemini |
| CUS-TRK-006 | equivale | CUS-TRK-006 | misma cancelación solo mientras el servidor lo permita | Haiku = Gemini |
| CUS-TRK-007 | sustituye | CUS-TRK-021 | motorizado sin teléfono ni WhatsApp | Haiku = Gemini |
| CUS-TRK-008 | equivale | CUS-TRK-008 | mismo detalle de ítems, totales y forma de pago | Haiku = Gemini |
| CUS-TRK-009 | equivale | CUS-TRK-009 | misma nota del dueño leída bajo RLS | Haiku = Gemini |
| CUS-TRK-010 | equivale | CUS-TRK-010 | mismos avisos con mensaje, tono y sonido | Haiku = Gemini |
| CUS-TRK-011 | equivale | CUS-TRK-011 | mismo silenciar o activar el sonido | Haiku = Gemini |
| CUS-TRK-012 | equivale | CUS-TRK-012 | misma pantalla que no se apaga mientras vive el pedido | Haiku = Gemini |
| CUS-TRK-013 | modifica | CUS-NOT-005 | Se ofrece una sola vez, tras el primer pedido confirmado (manda CUS-NOT-005; Jesús, 2026-11-17) | Claude (resolvió desacuerdo o duda) |
| CUS-TRK-014 | equivale | CUS-TRK-014 | mismo refresco al volver a primer plano y cada 8 s | Haiku = Gemini |
| CUS-TRK-015 | modifica | CUS-TRK-015 | falta «no se presentó» tiene regla propia (TRK-022) | Haiku = Gemini |
| CUS-TRK-016 | equivale | CUS-TRK-016 | solo web en ambas listas | Claude (resolvió desacuerdo o duda) |
| CUS-TRK-017 | equivale | CUS-TRK-017 | misma notificación viva o Live Activity, M2 | Haiku = Gemini |
| CUS-WEB-001 | retira | - | manifiesto PWA, solo web | Haiku = Gemini |
| CUS-WEB-002 | retira | - | service worker y Web Push, solo web, avisos nativos en CUS-NOT | Haiku = Gemini |
| CUS-WEB-003 | retira | - | instalación de PWA, solo web | Haiku = Gemini |
| CUS-WEB-004 | retira | - | SEO y metadatos, solo web | Haiku = Gemini |
| CUS-WEB-005 | retira | - | retorno OAuth y cookies de Supabase, solo web | Haiku = Gemini |
| CUS-WEB-006 | retira | - | audio por gesto, política de autoplay del navegador | Haiku = Gemini |
| CUS-WEB-007 | retira | - | la web de respaldo no figura; **abierto**: la web queda como landing y legales | Claude (resolvió desacuerdo o duda) |
