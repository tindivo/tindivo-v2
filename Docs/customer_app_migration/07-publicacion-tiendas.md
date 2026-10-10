# Publicación en Google Play y App Store · expediente del customer

> 2026-10-09 · Lote **MV1** de `../plan-migraciones/cola.md`. Objetivo de Jesús: que la primera revisión pase sin
> idas y vueltas. Nadie puede garantizar cero observaciones; esto ataca una por una las causas conocidas de rechazo
> que aplican a Tindivo. Los datos de la base salen de `tindivo-prod` (solo lectura, 2026-10-09); las reglas de las
> tiendas, de las fuentes del final, y **se vuelven a verificar el día que se sube el primer build**, porque cambian.
> Lo legal es un borrador técnico: **lo revisa Jesús**.
>
> **Complementa, no sustituye, a [`05-arranque/01-cuentas-y-firmas.md`](05-arranque/01-cuentas-y-firmas.md)**
> (2026-09-20): allí están las cuentas paso a paso, los identificadores que no se pueden cambiar, Firebase y las
> páginas públicas. Aquí va lo que faltaba: la estrategia del primer build, el inventario de datos medido en la base,
> lo que le falta a la política, el diseño del borrado y de la cuenta de revisión, la nota al revisor y la ficha. Los
> IDs entre paréntesis (`SEC-09`, `DAT-06`…) son los del catálogo de `03-requisitos/`.

## 1. El camino crítico

```
cuentas ─┐
         ├─ build Android usable ─► prueba cerrada: 12+ testers × 14 días seguidos ─► solicitud de producción ─► publicación
testers ─┘        (solo lectura contra prod)     (se siguen subiendo versiones)           (Google la revisa)        el mismo día
                                                                                                                   en las dos
build iOS ─► TestFlight interno ─► TestFlight externo (revisión ligera) ─► App Review (1-2 días) ─────────────────► tiendas
```

- **Google manda la fecha.** Las cuentas personales creadas después del 13-nov-2023 necesitan una prueba cerrada con
  al menos **12 testers apuntados durante 14 días seguidos** antes de poder pedir producción. El reloj arranca con un
  build publicado en la pista cerrada **y** los testers apuntados desde el enlace; si en algún momento quedan menos
  de 12, vuelve a cero. Por eso se invitan 15-16.
- **Subir versiones durante esos 14 días no reinicia nada**, y ayuda: al pedir producción, Google pregunta cómo se
  reclutó a los testers, qué dijeron y qué se cambió. Que lo usen de verdad cuenta.
- **Estrategia:** el primer build entra a la pista cerrada en cuanto sea usable contra producción en modo lectura
  (entrar, negocios, carta, horarios). Checkout, pedido y seguimiento llegan como actualizaciones dentro de los 14
  días. Así la espera de Google corre a la vez que se construye.
- **Apple no tiene esa regla.** TestFlight interno no pasa revisión; el externo pasa una revisión ligera la primera
  vez. App Review suele tardar uno o dos días.
- **Las cuentas de organización** se libran de los 12 × 14, pero piden número D-U-N-S, que exige una entidad legal.
  Hoy no compensa.

## 2. Cuentas (nivel C: solo Jesús)

Paso a paso en [`05-arranque/01-cuentas-y-firmas.md`](05-arranque/01-cuentas-y-firmas.md) §3-§5. Lo esencial: Google
Play personal (US$ 25, una vez; la verificación de identidad tarda días y es lo primero), Apple Developer individual
(US$ 99 al año; el vendedor que ve el público es **el nombre legal de Jesús**, no «Tindivo»), Firebase, y un Mac con
macOS Sequoia 15.6+ o Tahoe 26.2+, porque desde el 28-abr-2026 App Store Connect solo acepta builds de Xcode 26.

## 3. Requisitos técnicos que nacen en el proyecto

| Requisito | Android | iOS |
|---|---|---|
| Nivel mínimo de herramientas | `targetSdk 36` (Android 16), obligatorio para apps nuevas desde el 31-ago-2026 | Xcode 26 / SDK iOS 26 |
| Versión mínima de sistema | Por decidir (`minSdk`): en San Jacinto abundan los gama baja. Propuesta: Android 8 (API 26) | Por decidir. Propuesta: iOS 17 |
| Empaquetado | AAB firmado, con Play App Signing | Archivo subido desde Xcode o por CLI |
| Dispositivos | Teléfono | **Solo iPhone** (si se declara iPad, piden capturas de iPad y que funcione bien ahí) |
| Cifrado | — | Solo HTTPS → `ITSAppUsesNonExemptEncryption = NO` en `Info.plist` (evita el cuestionario de exportación) |

**Permisos, pedidos en el momento de usarlos y con el texto en español:**

| Permiso | Para qué | Texto propuesto (iOS `Info.plist` / diálogo previo en Android) |
|---|---|---|
| Ubicación **mientras se usa** | Marcar la entrega en el mapa («Mi ubicación») | «Tindivo usa tu ubicación para marcar dónde te entregamos el pedido.» |
| Cámara | Fotografiar el comprobante de Yape/Plin | «Para tomar la foto del comprobante de pago.» |
| Fotos | Elegir la captura del comprobante | «Para elegir la captura de tu pago con Yape o Plin.» (En Android 13+, el selector de fotos del sistema no pide permiso) |
| Notificaciones | Avisos del pedido | Se piden **después** del primer pedido, no al abrir la app |

**Lo que no se pide nunca en el customer:** ubicación en segundo plano (es la revisión más dura de Google y no hace
falta), contactos, micrófono.

## 4. Las causas de rechazo que aplican a Tindivo

| # | Causa | Tienda | Qué la provoca aquí | Cómo se evita |
|---|---|---|---|---|
| R1 | **El revisor no puede usar la app** (Apple 2.1, Google «App access») | Las dos | El revisor está fuera de San Jacinto, de día, y La Florencia abre de noche: ve todo cerrado | Cuenta y negocio de revisión (§7) + nota al revisor (§9) + credenciales en «App access» de Google |
| R2 | Iniciar sesión con Google sin iniciar sesión con Apple (Apple 4.8) | App Store | Hoy solo hay Google | Sign in with Apple desde el primer build de iOS, configurado en Supabase Auth (`CUS-AUT-003`, `NAT-AUT-001`) |
| R3 | No se puede borrar la cuenta (Apple 5.1.1(v), Google *Account deletion*) | Las dos | No existe | Borrado dentro de la app **y** una página web para pedirlo sin la app (Google la exige y la enlaza en la ficha) — §8 (`SEC-09`, `CUS-AUT-017`) |
| R4 | Formularios de privacidad que no cuadran con lo que la app hace | Las dos | Los SDK (Firebase, mapas, errores) recogen datos que hay que declarar | Inventario del §6, revisado con la lista final de SDK antes de rellenar (`DAT-06`) |
| R5 | Política de privacidad incompleta o inaccesible | Las dos | La actual (`/privacidad`, versión 2026-05) no menciona ubicación, fotos, avisos, proveedores ni borrado | Nueva versión (§5), en una URL pública que no sea PDF (`DAT-06`) |
| R6 | Permisos sin justificar o pedidos al abrir | Las dos | — | §3: en el momento de uso, con texto (`NAT-LOC`) |
| R7 | Avisos de marketing sin consentimiento (Apple 4.5.4) | App Store | Promociones por push están en los planes | Interruptor aparte para promociones, apagado por defecto; los avisos del pedido no dependen de él (`NOT-06`, `NAT-CON`) |
| R8 | App que es solo una web dentro de un contenedor (Apple 4.2) | App Store | No aplica: es nativa | — |
| R9 | Datos de la ficha engañosos o capturas que no son de la app | Las dos | — | Capturas reales del build, sin promesas que la app no cumple |
| R10 | Compras sin el sistema de pago de la tienda (Apple 3.1.1) | App Store | **No aplica**: es comida, un bien físico, y se paga por fuera (Yape, Plin, efectivo) | Decirlo en la nota al revisor para que no haya dudas |

## 5. Política de privacidad: qué falta y borrador

**Lo que tiene la actual** (`apps/customer/app/privacidad/page.tsx`): Ley 29733, nombre, teléfono, correo,
direcciones, historial, finalidades, compartir con negocio y motorizado, derechos ARCO por WhatsApp, conservación
genérica.

**Lo que falta para las tiendas y para la ley**, verificado contra la base:

1. **Quién es el responsable**: nombre legal o razón social, documento (RUC si lo hay), domicilio y un **correo**.
   WhatsApp solo no basta como contacto de privacidad.
2. **Datos que hoy no se mencionan:** ubicación precisa (el pin de entrega y las coordenadas del aparato al pedir:
   `orders.customer_gps_lat/lng`), **fotos de comprobantes de pago** (bucket `payment-proofs`), reseñas y comentarios
   (`order_reviews`), notas al negocio y al motorizado, identificador de avisos del aparato (`push_subscriptions`),
   datos de uso y de errores (analítica y diagnóstico).
3. **Proveedores y transferencia internacional:** los datos se guardan en **EE. UU.** (Supabase en Oregón, Vercel en
   Virginia). Hay que nombrar a los encargados y declarar el flujo transfronterizo. Lista: Supabase, Vercel, Google
   (inicio de sesión y FCM), Apple (inicio de sesión y APNs), el proveedor de mapas, Upstash (límite de peticiones),
   Inngest (temporizadores de pedidos) y el SDK de errores que se elija.
4. **Cómo se borra la cuenta** (en la app y en la web) y **qué se conserva** después (§8).
5. **Plazos de conservación** concretos.
6. **Menores:** a partir de qué edad se puede usar.
7. **El banco de datos inscrito** ante la Autoridad Nacional de Protección de Datos Personales: la Ley 29733 obliga a
   inscribirlo. Pendiente de Jesús, con el reglamento vigente delante.

**Borrador** (para sustituir `SECTIONS` cuando Jesús lo apruebe; los `[…]` los rellena él):

> **1. Responsable.** [Nombre legal], [DNI/RUC], con domicilio en [dirección], San Jacinto, Áncash, es responsable
> del tratamiento de tus datos en Tindivo. Contacto de privacidad: [correo]. Banco de datos inscrito ante la ANPD con
> el código [código].
>
> **2. Qué datos tratamos.** Nombre, teléfono y correo; las direcciones de entrega con sus referencias y su ubicación
> en el mapa; la ubicación de tu celular cuando la usas para marcar la entrega; tus pedidos y su historial; las fotos
> de los comprobantes de Yape o Plin que subes; las reseñas, comentarios y notas que escribes; el identificador de tu
> celular para enviarte avisos, y datos técnicos de uso y de errores de la app. No tratamos datos de tarjetas.
>
> **3. Para qué.** Para tomar, preparar y entregar tus pedidos; avisarte de su estado; verificar los pagos; prevenir
> fraudes; atender reclamos, y mejorar la app. Solo si lo activas, para avisarte de promociones.
>
> **4. Con quién se comparten.** Con el negocio que prepara tu pedido y con el motorizado que lo entrega, solo lo
> necesario para hacerlo. Con los proveedores que nos dan el servicio (alojamiento, base de datos, inicio de sesión,
> avisos, mapas y diagnóstico), que tratan los datos por encargo nuestro. No vendemos tus datos.
>
> **5. Dónde se guardan.** En servidores de Supabase y Vercel en Estados Unidos. Al usar Tindivo aceptas esta
> transferencia internacional, que se hace con medidas de seguridad equivalentes.
>
> **6. Cuánto tiempo.** Mientras tengas cuenta. Si la borras, eliminamos tu perfil, direcciones, avisos y reseñas
> como autor, y anonimizamos tus pedidos; conservamos [plazo] los datos mínimos de cada pedido que el negocio
> necesita para su caja y para atender reclamos.
>
> **7. Tus derechos.** Acceso, rectificación, cancelación y oposición (ARCO): escríbenos a [correo] o por el WhatsApp
> de soporte. Puedes **borrar tu cuenta** desde la app (Cuenta → Borrar mi cuenta) o en [URL de borrado].
>
> **8. Menores.** Tindivo es para mayores de [edad] años.
>
> **9. Cambios.** Si cambia esta política, te lo diremos en la app antes de que aplique.

## 6. Inventario de datos para *Data safety* (Google) y *App Privacy* (Apple)

Medido en la base (columnas de `orders`, `courier_orders`, `customer_profiles`, `customer_addresses`, `users`,
`push_subscriptions`, `order_reviews`, `address_directory`, `customer_strikes`, `customer_incidents`). Los SDK
nativos aún no existen: **cada SDK que se añada se cruza con esta tabla antes de rellenar los formularios.**

| Dato | Dónde vive | Para qué | ¿Ligado al usuario? | Origen |
|---|---|---|---|---|
| Nombre | `users.full_name`, `customer_profiles.full_name`, copia en `orders.customer_name` | Pedido | Sí | El usuario / Google / Apple |
| Correo | `users.email` | Cuenta | Sí | Google / Apple |
| Teléfono | `customer_profiles.phone`, copia en `orders.customer_phone`, `address_directory.phone` | Pedido, antifraude | Sí | El usuario |
| Ubicación precisa | `customer_addresses.coordinates_*`, `orders.delivery_coordinates_*`, `orders.customer_gps_*` | Entrega | Sí | Pin en el mapa y GPS mientras se usa |
| Direcciones y referencias | `customer_addresses`, `orders.delivery_address/reference`, `address_directory` | Entrega | Sí | El usuario |
| Historial de compras | `orders`, `courier_orders` | Servicio, caja del negocio | Sí | La app |
| Fotos | Bucket `payment-proofs` | Verificar el pago | Sí | Cámara o galería |
| Contenido del usuario | `order_reviews.comment`, `orders.customer_notes`, `courier_orders.driver_note` | Servicio, calidad | Sí | El usuario |
| Identificador del aparato | `push_subscriptions` (hoy Web Push; en nativo, token FCM/APNs) | Avisos | Sí | El sistema |
| Uso de la app | Hoy `@vercel/analytics` en la web; en nativo, por decidir | Mejorar la app | Por decidir | SDK |
| Diagnóstico | SDK de errores por decidir (Crashlytics o Sentry) | Estabilidad | Por decidir | SDK |

Respuestas que salen de aquí:

- **Rastreo entre apps de terceros (Apple *tracking*):** **no**. Sin publicidad, sin IDFA, sin ATT.
- **Se comparte con terceros (Google):** el envío al negocio y al motorizado ocurre porque el usuario hace un pedido,
  que es lo que espera; los proveedores actúan por encargo. Se declara así, y se revisa con el texto vigente del
  formulario el día que se rellene.
- **Cifrado en tránsito:** sí (HTTPS).
- **El usuario puede pedir el borrado:** sí, cuando exista MV5.

## 7. La cuenta y el negocio de revisión (diseño para MV5)

El revisor necesita hacer el recorrido completo: entrar, ver un negocio abierto, pedir, pagar y seguir el pedido.
Hacerlo con La Florencia es imposible (de día está cerrada) e indeseable (un pedido del revisor llegaría a la cocina
y a la caja).

**Propuesta:**

- Un rol nuevo, `reviewer`, en `user_roles`, y dos cuentas de revisión (una por tienda), con correo y contraseña: el
  revisor no puede entrar con la cuenta de Google de Jesús. Con el **teléfono ya verificado en la base**: el OTP va
  por Twilio Verify y el revisor no puede recibir el SMS. Nada de «código maestro» general.
- Un negocio **«Tindivo · Demo para revisión»** marcado como tal, que **solo ven** las cuentas con rol `reviewer`,
  siempre abierto y con zona de entrega en cualquier punto.
- Sus pedidos **no notifican** a ningún negocio real ni motorizado, se avanzan solos hasta entregado y quedan
  **fuera de toda contabilidad**: `generate_delivery_charges`, liquidaciones, caja y estadísticas. Esto toca el
  invariante 8 de `CLAUDE.md` por el lado bueno (llegan a `delivered` como cualquier pedido), así que cada función
  que suma dinero tiene que excluirlos de forma explícita y con prueba.
- **Alternativa más barata:** un vídeo del recorrido real grabado de noche en San Jacinto, adjunto en la nota de
  revisión, con la explicación de zona y horario. Apple lo acepta a veces y otras pide acceso real; por eso es el
  plan B y no el A.

## 8. Borrado de cuenta (diseño para MV5)

**Hallazgo:** un borrado de verdad **falla hoy**. `orders.customer_user_id` y `courier_orders.customer_user_id`
referencian `public.users` con `ON DELETE NO ACTION`, así que Postgres rechaza borrar a un cliente con pedidos. Y
debe seguir así: los pedidos son la caja de los negocios.

Por tanto, «borrar la cuenta» = **anonimizar y desactivar**, en una RPC transaccional:

| Qué | Acción | Hoy en la base |
|---|---|---|
| `customer_profiles`, `customer_addresses`, `push_subscriptions`, `terms_acceptance`, `order_review_dismissals`, `promo_redemptions`, `user_roles` | Borrar | Ya caen en cascada con el usuario |
| `orders`, `courier_orders` del cliente | Conservar el pedido, vaciar `customer_name`, `customer_phone`, dirección, referencia, coordenadas y notas del cliente | `NO ACTION`: hay que hacerlo a mano |
| `order_reviews` | Conservar la nota, quitar el autor | `SET NULL` ya lo hace |
| Comprobantes en `payment-proofs` | Borrar tras [plazo], o al instante si el pedido está cerrado | Sin regla |
| `address_directory` | Decidir: es el directorio que usa la cajera, con teléfono y nombre | Sin vínculo al usuario (va por teléfono) |
| `customer_strikes`, `customer_incidents` | Decidir: es el antifraude | `SET NULL`: borrar la cuenta borraría el historial de fraude |
| `auth.users` | Borrar o bloquear la identidad | — |

La página web de borrado (exigida por Google) pide iniciar sesión y lanza la misma RPC. Plazo de respuesta al
usuario: inmediato en la app; Google pide que la web diga cuánto se tarda y qué se conserva.

## 9. Nota para el revisor (borrador, en inglés)

> Tindivo is a food delivery app that currently operates only in San Jacinto, Áncash, Peru, at night (roughly 6 pm –
> 11 pm Peru time, UTC−5). To let you review the full flow at any time and from any location, please sign in with
> the review account below: it shows a demo restaurant that is always open and delivers anywhere. Orders placed with
> this account never reach a real restaurant or courier.
>
> Review account: [email] / [password]
>
> Payments: customers pay the restaurant directly via Yape, Plin (Peruvian bank transfer apps) or cash on delivery.
> The app never processes payments; it only lets the customer upload a screenshot of the transfer so the restaurant
> can verify it. These are physical goods (food), so in-app purchase does not apply.
>
> Sign in with Apple and Google are both available. Account deletion: Account → Delete my account.

## 10. Ficha de la tienda (borrador)

| Campo | Límite | Propuesta |
|---|---|---|
| Nombre | 30 | Tindivo |
| Subtítulo (Apple) | 30 | Delivery en San Jacinto |
| Descripción corta (Google) | 80 | Pide comida de los negocios de San Jacinto y síguela hasta tu puerta. |
| Palabras clave (Apple) | 100 | delivery,comida,pedidos,San Jacinto,Áncash,Nepeña,restaurante,pollo,yape,plin |
| Categoría | — | Comida y bebida |
| Icono | 512×512 (Google), 1024×1024 (Apple) | Del manual de marca (vectorial) |
| Gráfico destacado (Google) | 1024×500 | Por diseñar |
| Capturas | Google: 2 a 8 de teléfono. Apple: las del tamaño de iPhone que pida App Store Connect (6,9") | Entrar · negocios · carta · checkout · seguimiento · aviso |

**Descripción larga** (borrador): qué es, en qué zona y horario funciona, cómo se paga (Yape, Plin o efectivo
directo al negocio) y que los avisos llegan aunque la app esté cerrada. Sin superlativos que la revisión pueda tomar
por engañosos.

**Clasificación por edad:** cuestionario IARC en Google y el de Apple (4+, 9+, 13+, 16+, 18+). Sin violencia, sin
apuestas, y ningún usuario ve lo que escribe otro (las reseñas solo las lee el panel de admin:
`apps/api/app/api/v1/admin/reviews/route.ts`) → debería salir en la franja más baja. Si algún día se publican
reseñas, Apple pide moderación y forma de denunciar (1.2). La edad mínima de uso es otra cosa y la decide Jesús (§5, punto 6).

## 11. Lo que decide Jesús

| # | Decisión | Recomendación |
|---|---|---|
| D-44 | Qué se conserva al borrar una cuenta y cuánto tiempo (pedidos anonimizados, comprobantes, directorio, antifraude) | Pedidos anonimizados para siempre; comprobantes 90 días; directorio y antifraude por teléfono **conservados**, porque son del negocio y protegen contra el fraude, y dicho en la política |
| D-45 | Cómo accede el revisor | Negocio de demostración (§7); vídeo solo como respaldo |
| D-46 | Edad mínima de uso | 18 años |
| D-47 | Versiones mínimas de sistema | Android 8 (API 26) e iOS 17 |
| — | Datos del responsable, correo de privacidad y de soporte, inscripción en la ANPD | Nivel C |

## Fuentes

- Requisito de API de destino de Google Play: <https://developer.android.com/google/play/requirements/target-sdk>
- Requisitos mínimos de SDK de Apple: <https://www.developer.apple.com/news/upcoming-requirements/>
- Prueba cerrada de 12 testers × 14 días (resúmenes de terceros; confirmar en la ayuda de Play Console):
  <https://www.choicely.com/blog/google-play-12-tester-rule>,
  <https://www.testerscommunity.com/blog/google-play-closed-testing-requirements-2026>
- Directrices de revisión de App Store (2.1, 3.1.1, 4.2, 4.5.4, 4.8, 5.1.1): <https://developer.apple.com/app-store/review/guidelines/>
- Requisitos de borrado de cuenta de Google Play: <https://support.google.com/googleplay/android-developer/answer/13327111>
