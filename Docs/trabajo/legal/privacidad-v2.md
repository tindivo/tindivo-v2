# Política de Privacidad de Tindivo · v2 (borrador)

> 2026-11-19 · **Borrador de trabajo: no manda ni está publicado.** Parte del texto ya redactado en este PR
> (`apps/customer/app/privacidad/page.tsx`, «versión 2 · 14 de noviembre») y lo pone al día con la retención aprobada
> (`retencion-de-datos.md`), el borrado de cuenta y las decisiones del 2026-11-19. **No es asesoría legal ni lo revisó un
> abogado**; lo revisa Jesús. `[POR DECIDIR]` marca lo que depende de una decisión abierta (ver el final).

## Afirmación → fuente

| Afirmación del texto | Fuente |
|---|---|
| Responsable, DNI, domicilio, correo, WhatsApp; Ley 29733 y DS 016-2024-JUS; banco «Usuarios de la aplicación móvil», PN-2026-559 | `apps/customer/app/privacidad/page.tsx` §1 (commit b8068f7f de esta rama) |
| Entrada solo con Google (Apple en iOS); celular por SMS con Twilio Verify | `Docs/producto/acceso/capacidad.md` CUS-AUT-019, 007 (PR #201); `package.json` de `apps/api` (`twilio`) |
| Un número, una cuenta; aviso de traslado y restricciones del número | CUS-AUT-008, 028 (PR #201); página vigente §2 |
| Edad mínima 18 | `Docs/planes/movil/decisiones.md` D-46 |
| Datos de dirección y ubicación; permiso de ubicación opcional y solo en primer plano | página vigente §2 y §9; `Docs/producto/direcciones/capacidad.md` |
| Mapas: Google Maps en Android; Leaflet con CARTO/OpenStreetMap/Esri en la web | `apps/android/gradle/libs.versions.toml` (`play-services-maps`, `maps-compose`); `leaflet` en `apps/customer`; `arcgisonline.com` en `apps/customer` |
| Pedidos, Entregas, notas, incidencias, apelaciones | página vigente §2; `Docs/negocio/servicios/entregas.md`; `Docs/producto/entregas/capacidad.md` (PR #199) |
| Tindivo no retiene fondos; guarda la captura del comprobante | `Docs/negocio/plataforma.md` principio 1; página vigente §3 |
| Entregas: el motorizado le rinde a Tindivo el transporte, que es tarifa de Tindivo | `Docs/negocio/dinero.md` «Tindivo Entregas»; Jesús, 2026-11-19 (encargo) |
| Proveedores: Supabase, Vercel (+ Analytics), Google (acceso, FCM, Maps, Fonts), Twilio, Upstash, Inngest, WhatsApp | `package.json` de `apps/*` y `packages/*` (`@supabase/*`, `@vercel/analytics`, `twilio`, `@upstash/*`, `inngest`); `libs.versions.toml` de Android (`credentials`, `googleid`, `play-services-*`); `fonts.googleapis.com` en `apps/customer` |
| Transferencias fuera del Perú comunicadas a la Autoridad | página vigente §5 (commit b8068f7f) |
| Plazos de conservación (comprobantes 90 días; antifraude, directorio, asignaciones 24 meses; eventos de tienda, registro de avisos y alertas 13 meses; reclamos y caja 5 años; solicitudes de soporte 2 años) | `Docs/operacion/retencion-de-datos.md` «Tabla de plazos» y «Solicitudes… (manual)» |
| Pedidos conservados sin datos personales, sin límite de tiempo | página vigente §6; `Docs/producto/cuenta/capacidad.md` |
| Reseñas tras el borrado: queda la nota y las etiquetas, sin comentario ni autor | Jesús, opción C, 2026-11-19 (encargo); `retencion-de-datos.md` (migración 0284) |
| Borrado: `BORRAR`, inmediato, 409 si hay pedido en curso o dinero sin resolver | `Docs/producto/cuenta/capacidad.md` «Antes de tocar», CA-ACC-04, 05 (PR #201) |
| Derechos y plazos (8, 20, 10 días hábiles; art. 69 del reglamento) | página vigente §8 |
| Permisos: ubicación, selector de fotos, notificaciones; nunca contactos, micrófono ni ubicación en segundo plano | página vigente §9 |
| Avisos del pedido opcionales; no hay promociones | `Docs/producto/cuenta/capacidad.md` CUS-ACC-005; CUS-AUT-018 (PR #201) |
| Antifraude humano: la cajera llama | `Docs/negocio/plataforma.md` principio 2 |
| Sesión en Android cifrada; cierre de sesión siempre local | CUS-AUT-012 (PR #201); `movil:D-64` |
| Libro de Reclamaciones: no se menciona | memoria del proyecto: en stand by hasta el RUC |

---

**Versión:** 2 · **Vigente desde:** `[POR DECIDIR: fecha]`

Esta política explica qué datos usa Tindivo, para qué, con quién los comparte, cuánto tiempo los guarda y cómo ejercer
tus derechos. Rige para la **app Android** (`com.tindivo.customer`) y la web mientras exista.

## 1. Quién es responsable de tus datos

**Jesús Castillo Vidal**, persona natural, con el nombre comercial Tindivo. DNI 70771140. Domicilio: C.P. San Jacinto
Mz. 51 Lt. 8, distrito de Nepeña, provincia del Santa, Áncash, Perú. Correo de privacidad:
tindivodelivery@gmail.com. WhatsApp de soporte: +51 906 550 166.

Tratamos tus datos según la Ley N.° 29733 y su reglamento (DS N.° 016-2024-JUS). Forman parte del banco de datos
**«Usuarios de la aplicación móvil»**, inscrito con el código **PN-2026-559** el 14 de noviembre de 2026.

## 2. Qué datos usamos y para qué

Para pedir necesitas una cuenta, un celular verificado y los datos de entrega. La ubicación del celular es opcional.

| Dato | De dónde sale | Para qué |
|---|---|---|
| Nombre, correo e identificador de cuenta | De tu cuenta de Google (en iPhone, de Apple) y del sistema | Identificarte y dejarte entrar |
| Celular, resultado y fecha de la verificación, intentos | Lo escribes tú; el SMS lo envía Twilio Verify | Contactarte por el pedido, prevenir pedidos falsos. Es necesario para pedir |
| Historial de a qué cuenta perteneció el número | Del sistema | Que un número esté en una sola cuenta y conservar sus restricciones |
| Aceptación de términos (versión, fecha) | De tu aceptación | Dejar constancia |
| Dirección, referencia, punto en el mapa | Lo escribes o marcas tú | Entregar bien. Es necesario para una entrega |
| Ubicación del celular (latitud, longitud, precisión) | Del teléfono, solo si tocas «Usar mi ubicación» y das permiso | Ayudarte a marcar el punto. Puedes negarte y marcarlo a mano |
| Productos, importe, forma de pago, código, estado y fechas del pedido | De tu pedido y de quienes lo atienden | Atender el pedido, darle seguimiento y llevar la caja del negocio |
| Entregas: nombre y celular de quien pide y de quien recibe, origen, destino, referencias, qué se lleva | Los pones tú | Coordinar el recojo y la entrega |
| Notas, motivos de cancelación, incidencias, apelaciones y devoluciones | Tuyas, del negocio, del motorizado o de Tindivo | Resolver problemas y dejar constancia |
| Foto o captura del comprobante de pago, y lo que se vea en ella | La subes tú | Que el negocio revise tu pago adelantado |
| Reseña (nota, etiquetas, comentario) | La escribes tú; es opcional | Medir la calidad. El negocio ve nota y etiquetas, no el comentario |
| Identificador de instalación, token de avisos, plataforma y versión de la app, modelo del aparato, permiso de notificaciones | Del aparato y de la app, si activas avisos | Enviarte los avisos del pedido |
| Eventos de uso de Store (acción, producto, texto de búsqueda, identificador aleatorio de la sesión; sin cuenta) | De la app | Medir el uso de Store |
| Visitas a la web, de forma agregada | De Vercel Analytics, sin cookies de publicidad | Medir el uso de la web |

Si das datos de otra persona (por ejemplo, quien recibe una Entrega), avísale y comparte solo lo necesario. Evita poner
datos personales innecesarios en notas, reseñas, imágenes o el buscador de Store.

## 3. Pagos y foto del comprobante

**Tindivo no cobra ni retiene el dinero de tu pedido de restaurante**: pagas directo al negocio por Yape, Plin o
efectivo. No pedimos números de tarjeta ni claves bancarias, de Yape ni de Plin. En **Tindivo Entregas**, el transporte
lo cobra el motorizado en nombre de Tindivo, que es quien fija la tarifa, y él se lo rinde a Tindivo.

Si pagas por adelantado, **sí recibimos y guardamos la imagen del comprobante** y lo que se vea en ella (nombre,
monto, fecha, número de operación). Sirve para que el negocio revise tu pago y para revisar una apelación o devolución.

## 4. Con quién compartimos tus datos

| Destinatario | Datos y motivo | País |
|---|---|---|
| Negocio de tu pedido | Nombre y contacto necesarios, productos, indicaciones, datos de entrega y comprobante. Para confirmar, preparar, entregar y revisar el pago | Perú |
| Motorizado asignado | Nombre y contacto necesarios, recojo, destino, referencias. Para entregar | Perú |
| Equipo autorizado de Tindivo (incluida la cajera) | Soporte, coordinación, incidencias y prevención de fraude. La cajera puede llamarte para verificar un pedido | Perú |

Estos servicios técnicos intervienen en el funcionamiento de Tindivo:

| Servicio | Para qué y qué datos | País |
|---|---|---|
| Supabase | Base de datos, autenticación y archivos (incluidos los comprobantes) | Estados Unidos u otro país donde tenga servidores |
| Vercel | Alojamiento de la API y de la web; analítica de la web | Ídem |
| Google | Inicio de sesión; Firebase Cloud Messaging (avisos); Google Maps y ubicación (Android); Google Fonts (web) | Ídem |
| Apple | Inicio de sesión en iPhone | Ídem |
| Twilio Verify | Verificar tu celular por SMS (el número y datos de la verificación) | Ídem |
| Upstash e Inngest | Limitar solicitudes y manejar los temporizadores de los pedidos | Ídem |
| WhatsApp | Canal de soporte: recibe lo que decidas enviar. Store lo abre para contactar a Jesús | Ídem |
| Mapas de la web: CARTO, OpenStreetMap y Esri | Mostrar el mapa en la web | Ídem |
| Servicio de avisos del navegador | Avisos en la web, si los activas | Ídem |

**No vendemos tus datos ni los cedemos con fines publicitarios.**

## 5. Datos que salen del Perú

Parte de tus datos se trata fuera del Perú para que funcionen tu acceso, la app, los mapas, la verificación por SMS, el
almacenamiento y los avisos (ver la tabla anterior). Estas transferencias están comunicadas a la Autoridad Nacional de
Protección de Datos Personales como parte de la inscripción del banco de datos. Si una finalidad necesita tu
consentimiento, te lo pediremos de forma válida.

## 6. Cuánto tiempo guardamos tus datos

| Datos | Cuánto |
|---|---|
| Perfil, direcciones guardadas, avisos, aceptación de términos y verificaciones | Mientras tengas la cuenta. Al borrarla, se eliminan |
| Identidad de acceso | Se elimina al borrar la cuenta (no elimina tu cuenta de Google) |
| Pedidos y Entregas | Se quedan **sin tus datos** (nombre, teléfono, dirección, referencias, coordenadas y notas) **sin límite de tiempo**, para la caja del negocio. Quedan importes, estados, fechas e identificadores |
| Comprobantes de pago | Mientras tengas la cuenta; tras borrarla, **90 días** |
| Reseñas | Al borrar la cuenta se conservan **la nota y las etiquetas, sin tu nombre y sin tu comentario** |
| Incidencias y reportes antifraude cerrados | **24 meses** desde el hecho o su revisión; después se anonimizan |
| Strikes | **24 meses**; después dejan de contar y se anonimizan |
| Restricciones del número ya levantadas o vencidas, y el historial de dueños del número | **24 meses**; después se eliminan. Una restricción vigente no se toca |
| Directorio de la cajera | **24 meses sin uso**; después se elimina |
| Eventos de Store, registro de envío de avisos y alertas de administración resueltas | **13 meses** |
| Notas de liquidaciones de caja y reclamos económicos | **5 años** (cuentan desde el 1 de enero siguiente); después se borran las notas, quedan importes y estados |
| Solicitudes de soporte y de derechos sobre tus datos (WhatsApp) | **2 años** desde la última respuesta, salvo que haya un reclamo abierto |
| Analítica de la web y otros registros técnicos | `[POR DECIDIR: sin plazo definido hoy]` |

Retirar tus datos de contacto de un pedido **no elimina toda posibilidad de relacionarlo con una persona**: quedan
identificadores internos y algunos reportes. Una purga automática diaria aplica estos plazos.

## 7. Cómo borrar tu cuenta

1. **En la app:** **Cuenta → Borrar mi cuenta**, y escribe `BORRAR`.
2. **Sin la app:** `[POR DECIDIR: dirección web]`. Si no puedes entrar, escribe al correo de privacidad o al WhatsApp.

El borrado es **inmediato y no se puede deshacer**. Elimina tu perfil, direcciones guardadas, avisos y tu acceso; retira
tus datos de los pedidos y Entregas; deja la nota y las etiquetas de tus reseñas sin tu nombre y sin comentario.

**No se borra todo.** El directorio, el historial antifraude, las asignaciones y las restricciones del teléfono siguen
hasta que vence su plazo (sección 6): crear otra cuenta con el mismo número no los quita. Si el número es reciclado o
crees que hay un error, pide una revisión por soporte.

**Cuándo no se puede.** Si tienes un pedido o Entrega en curso, una apelación o devolución pendiente, o dinero sin
resolver, la app lo dice y no borra; cuando se resuelva, lo pides de nuevo. Si tu cuenta también es de negocio,
motorizado o administración, lo cierra soporte. Estas condiciones no te impiden ejercer tus derechos.

Cerrar sesión o desinstalar la app **no** borra tu cuenta.

## 8. Tus derechos

Puedes pedir: **información**, **acceso**, **rectificación y actualización**, **inclusión**, **cancelación o
supresión**, **oposición**, **impedir el suministro a terceros**, **retirar tu consentimiento** (sin afectar lo hecho
antes), **no ser sujeto de decisiones solo automatizadas** (puedes pedir revisar una restricción) y **portabilidad**.

Escribe a tindivodelivery@gmail.com o al WhatsApp +51 906 550 166: indica qué pides, cómo ubicar tu cuenta y por qué medio
quieres la respuesta. Verificaremos tu identidad; no envíes claves ni contraseñas.

| Solicitud | Plazo máximo |
|---|---|
| Información | 8 días hábiles |
| Acceso y portabilidad | 20 días hábiles |
| Rectificación, cancelación y oposición | 10 días hábiles |

Los plazos se cuentan desde el día siguiente de presentada la solicitud (art. 69 del reglamento). Si falta algo, te lo
decimos para que lo completes. Si necesitamos información adicional, el plazo se suspende hasta que la envíes. Salvo en
información, podemos ampliar el plazo una sola vez y por un período igual, explicándote el motivo. Si denegamos tu
solicitud, te decimos por qué y que puedes acudir a la **Autoridad Nacional de Protección de Datos Personales** del
Ministerio de Justicia o al Poder Judicial (hábeas data). Si no respondemos a tiempo, puedes considerarla denegada.

## 9. Permisos del teléfono

- **Ubicación:** solo cuando tocas «Usar mi ubicación», y en primer plano. Puedes rechazarla y marcar el punto a mano.
- **Fotos:** eliges el comprobante con el selector del sistema; no accedemos a tu galería.
- **Notificaciones:** opcionales. En Android 13 o más, la app pide permiso.
- **Internet:** para hablar con los servicios de Tindivo.

La app **nunca** pide ubicación en segundo plano, contactos ni micrófono. Puedes cambiar los permisos en los ajustes.

## 10. Avisos y publicidad

Los avisos son del pedido. Los apagas en **Cuenta** o en los ajustes del teléfono; entonces consultas el estado dentro
de la app. **No enviamos promociones.** Si algún día lo hacemos, te lo pediremos aparte; aceptar avisos del pedido no es
aceptar publicidad.

## 11. Menores de edad

Tindivo es para personas de **18 años o más**. Si ves que una persona menor entregó datos, avisa al correo de privacidad
para revisar el caso.

## 12. Seguridad

Usamos conexiones cifradas. El registro de avisos y las operaciones de borrado tienen acceso restringido al servidor. En
Android, la sesión se guarda cifrada y al cerrar sesión se borra del aparato; no podemos prometer que el cierre local
sea infalible. Ningún sistema es 100 % seguro: si ves un problema, avísanos.

## 13. Cambios a esta política

Publicaremos las nuevas versiones con su fecha. Si una finalidad nueva necesita tu consentimiento, te lo pediremos antes.
Cuando cambie una versión, la app te pedirá aceptarla cuando vayas a pedir o cambiar tus datos, nunca en medio de un
pedido (ver los Términos). **Fecha de esta versión:** `[POR DECIDIR]`.

---

# Para revisar con Jesús

1. **Reseñas: la página vigente dice lo contrario.** El commit `c0d38e04` de este PR dice que «el texto de tus reseñas se
   conserva»; la opción C (2026-11-19) y la migración 0284 borran el comentario. Este borrador sigue la C. Hay que
   corregir `page.tsx` y `borrar-cuenta/page.tsx` cuando se publique, y la pantalla de borrado de Android
   (`delete_account_kept_body`, defecto 5 del PR #201).
2. **Plazos: ¿ya corre la purga en `tindivo-prod`?** La sección 6 promete plazos de 13 y 24 meses y 5 años que
   `retencion-de-datos.md` marca como migraciones 0284–0286 («sin aplicar» el 14-nov; la 0285 «pendiente de revisión de
   Jesús», es dinero). Si no están aplicadas en prod el día que se publique, **la política promete lo que no hace**. La
   versión de la página vigente decía «sin plazo final» para esos datos.
3. **Qué cambio obliga a reaceptar** la privacidad: ¿toda versión o solo las que cambian finalidades o terceros? Hoy la
   versión viaja fija en la app y solo se guarda la de Términos (defectos 2 y 3 del PR #201).
4. **Dónde se publican los textos cuando se apague la web.** La política, los términos y el borrado hoy son rutas de
   `tindivo.com`. Play exige un enlace público de borrado y de privacidad (decisión 7 del PR #201; D-27). Hasta decidirlo,
   la sección 7 queda sin dirección.
5. **Cómo se comprueba la edad.** El texto dice 18 años (D-46), pero ninguna ficha define el control: ¿basta la casilla?
6. **Firebase en Android.** La política original lista Firebase Cloud Messaging en Android. El cliente Android no trae
   Firebase en su Gradle hoy (el servidor sí sabe enviar por FCM, y `cuenta` dice «sin FCM no hay qué apagar»). Si los
   avisos no salen en el primer lanzamiento, esa fila y la de Google FCM sobran. Verificar contra el build final.
7. **Apple.** La fila de Apple solo vale cuando exista la app de iPhone (iOS aún no empieza).
8. **Terceros sin plazo:** analítica de la web y registros técnicos de proveedores (Vercel, Supabase). Decidir plazo o
   aceptar «sin plazo definido» por escrito.
9. **«Sin límite de tiempo» en pedidos anonimizados** (sección 6): ya estaba aprobado en el borrado, pero conviene que
   Jesús lo confirme a la vista de la Ley 29733 (conservar solo lo necesario).
10. **Entregas** (sección 3): el texto dice que el transporte es tarifa de Tindivo (2026-11-19). Hay que escribirlo en
    `Docs/negocio/dinero.md`, que aún lo describe como «S/ 3 que paga el cliente»; todo cambio que toque dinero lo
    revisa Jesús.
11. **Web de respaldo.** El texto dice «la app y la web mientras exista»; ajustar cuando se apague.
12. **Libro de Reclamaciones:** no se menciona (stand by).
