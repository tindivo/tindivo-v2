# 05 · Arranque — 01 · Cuentas de tienda, firmas y servicios (paso a paso)

> Redactado el **2026-09-20**. Es la parte del plan que tiene **plazos externos**: se empieza ya y corre en
> paralelo al código. Amplía `MOB-17` y `PRO-08` (`02-auditoria-backend/`).
> **✔** = lo contrasté hoy con fuentes públicas (enlaces al final). Lo demás es práctica habitual de las
> tiendas: **confírmalo en pantalla** al hacerlo, porque los menús y los requisitos cambian.

## 1. Resumen: qué necesitas, cuánto cuesta y cuánto tarda

| Pieza | Para qué | Coste | Plazo |
|---|---|---|---|
| **Cuenta de Google Play Console** (*personal*) | Publicar **Negocios** y **Customer** en Android | **US$ 25**, una sola vez ✔ | Verificación de identidad: unos días. **Para publicar al público: prueba cerrada con ≥ 12 testers durante 14 días seguidos y luego solicitar producción (Google responde en ≤ 7 días, por lo general)** ✔. De 3 a 5 semanas desde crear la cuenta hasta tener la app viva |
| **Apple Developer Program** (*individual*) | Publicar **Customer** en iPhone; claves de push (APNs); Sign in with Apple; TestFlight | **US$ 99 al año** ✔ | 24–48 h; hasta 3 días ✔ |
| **Proyecto Firebase** (plan *Spark*) | Avisos push en Android (FCM) y, a través de APNs, en iPhone; opcional: fallos y analítica | Gratis | Minutos |
| **Mac con Xcode 26** | Escribir, depurar y subir la app de iPhone | Ya lo tienes | Comprobar versión (§3, paso 0) |
| **Páginas públicas y enlaces** en `tindivo.com` | Política de privacidad, términos, **borrado de cuenta**, soporte, enlaces universales | Gratis | Días de trabajo (`MOB-05`, `MOB-10`) |
| **Teléfonos de prueba** | Un Android de gama baja y un iPhone físico | — | — |

**Qué se publica dónde** (decisiones `D-12` y `D-30`, 2026-09-20):

| App | Android (Google Play) | iPhone (App Store) |
|---|---|---|
| **Customer** | Sí | Sí, **el mismo día** que Android |
| **Negocios** (cajera) | Sí, **primero y con urgencia** | **No por ahora** |
| Motorizados | Después | Después (4 de sus 5 suscripciones de push son iPhone) |

**Orden de hoy** (por el camino crítico): **1)** Google Play, porque su reloj de 14 días es lo más largo; **2)** Apple;
**3)** Firebase; **4)** comprobar el Mac; **5)** empezar la lista de 12 testers (§4, paso 8).

## 2. Antes de pulsar «registrar»: lo que no se puede cambiar después

### 2.1 Persona natural u organización

| | **Persona natural** (individual) | **Organización** |
|---|---|---|
| Qué pide | Documento oficial, tarjeta a tu nombre, dirección y teléfono | Entidad legal (RUC de empresa), **número D-U-N-S**, persona con autoridad; verificación más lenta |
| Cómo aparece en la tienda | **Tu nombre legal** como desarrollador/vendedor | «Tindivo» (razón social) |
| Google Play | Sujeta a la **prueba cerrada de 12 testers × 14 días** ✔ | Exenta de esa prueba ✔ |
| Cuándo la tienes | **Hoy** | Semanas (constituir la empresa + D-U-N-S) |

**Recomendación:** empezar como **persona natural** (es lo que te desbloquea ahora). Ambas tiendas tienen una
función de **transferencia de apps** entre cuentas, con condiciones (◦ verifícalas antes de depender de ella),
así que no te encierras. Decisión registrada como `D-36`.

### 2.2 Identificadores (se fijan al crear la app y **no se pueden cambiar** una vez publicada)

Propuesta, con el dominio `tindivo.com` en orden inverso y en inglés como el resto del repositorio:

| App | Nombre en tienda | Android `applicationId` | iOS *bundle id* |
|---|---|---|---|
| Customer | **Tindivo** | `com.tindivo.customer` | `com.tindivo.customer` |
| Negocios | **Tindivo Negocios** | `com.tindivo.business` | *(se reserva, no se usa aún)* |
| Motorizados | **Tindivo Repartidores** | `com.tindivo.driver` | *(se reserva)* |

Comprueba antes que los nombres estén libres en ambas tiendas.

### 2.3 Cuentas y credenciales

- Crea **una cuenta de Google y una Apple Account dedicadas al negocio** (no las personales), con
  **verificación en dos pasos** y recuperación a tu teléfono. Guarda todo en un gestor de contraseñas.
- El **nombre y apellido** de ambas cuentas deben ser tu **nombre legal exacto**, igual que en tu documento. Un alias o
  el nombre de una empresa retrasa la aprobación de Apple ✔.
- Tarjeta **de crédito o débito** (Google **no acepta prepago** ✔) con **compras internacionales por internet
  habilitadas** en dólares: en Perú es lo que más falla al pagar.

## 3. Apple Developer Program — paso a paso (individual)

**Paso 0 · Tu Mac (5 minutos, hazlo primero).** «Acerca de este Mac» → modelo, año y versión de macOS.
- Desde el **28-abr-2026** Apple solo acepta subidas hechas con **Xcode 26 o posterior** (SDK de iOS 26) ✔.
- **Xcode 26.0–26.3** pide **macOS Sequoia 15.6** o superior; **Xcode 26.4 en adelante** pide **macOS Tahoe 26.2** ✔.
- Un Mac de **2018-2019 en adelante** suele poder con Sequoia (◦ confírmalo en la página oficial de requisitos de Xcode).
- Reserva **≥ 60 GB libres** (Xcode + simuladores). Dime el **modelo y la versión** y te digo si sirve.

**Paso 1 · Apple Account.** Con verificación en dos pasos, nombre legal y mayoría de edad ✔.

**Paso 2 · Inscribirte.** En `developer.apple.com/programs/enroll` o con la **app Apple Developer**, que permite
verificar la identidad fotografiando tu documento ✔. Tipo: **Individual**. Pagas **US$ 99** ✔ (el precio puede
variar por región). Te piden nombre legal, teléfono, dirección y, a veces, número de documento o foto ✔.

**Paso 3 · Esperar el correo de activación** (24–48 h, hasta 3 días) ✔. Si no llega en 3 días, contacta a Apple
Developer Support: los bloqueos típicos son nombre distinto al del documento o tarjeta rechazada.

**Paso 4 · Tras activarse (en `developer.apple.com/account`).**
1. *Certificates, Identifiers & Profiles → Identifiers → App IDs*: crea `com.tindivo.customer` con las
   capacidades **Push Notifications**, **Sign in with Apple** y **Associated Domains** (enlaces universales).
   *Live Activities* se activa desde el proyecto (`NSSupportsLiveActivities`) y usa el mismo permiso de push.
2. *Keys → +*: crea una **clave APNs** (*Apple Push Notifications service*). Se descarga **una sola vez** (`.p8`):
   guárdala como secreto. Anota **Key ID** y **Team ID**. Esa clave es la que se sube a Firebase (§5).
3. Anota el **Team ID** (se ve en *Membership details*).

**Paso 5 · App Store Connect** (`appstoreconnect.apple.com`).
1. *Business / Agreements*: al ser una app **gratuita y sin compras dentro de la app**, basta el acuerdo de apps
   gratuitas. No hace falta cuenta bancaria ni impuestos (◦ solo aplican a apps de pago o con compras).
2. *Apps → +*: crea la app (nombre, idioma principal, *bundle id*, SKU interno).
3. Ficha: nombre, subtítulo, descripción, palabras clave, **icono 1024×1024 sin transparencia**, capturas (App
   Store Connect te indica los tamaños vigentes), categoría **Comida y bebidas**, URL de **soporte** y de **privacidad**.
4. **Clasificación por edades** (cuestionario) y **Privacidad de la app** (las «etiquetas»: qué datos recoges y
   para qué; sale del inventario de PII, `DAT-06`).
5. **Cifrado**: usas solo HTTPS, así que declara cifrado exento (en el proyecto, `ITSAppUsesNonExemptEncryption = NO`)
   y no te preguntarán en cada subida.

**Paso 6 · TestFlight.** *Internos*: hasta 100 personas con rol en tu cuenta, sin revisión. *Externos*: hasta 10 000,
**con** revisión de beta (1-2 días) y enlace público (◦). Es el modo de tener testers reales de iPhone antes del lanzamiento.

**Paso 7 · Enviar a revisión.** Suele tardar **1-2 días** (◦); el primer envío trae preguntas. Aporta en *Notas para
el revisor* la **cuenta de demostración** y cómo llegar al flujo de pedido (§8). Sin ellas, es el primer rechazo.

**Paso 8 · Renovación.** Anual. Si caduca, **la app sale de la tienda**. Pon un recordatorio a 60 días.

## 4. Google Play Console — paso a paso (cuenta personal)

**Paso 1 · Cuenta de Google** dedicada, con verificación en dos pasos.

**Paso 2 · Registro** en `play.google.com/console/signup`: tipo **Personal**; nombre de desarrollador,
dirección, teléfono y correo; **US$ 25** con tarjeta a tu nombre (no prepago) ✔. Te piden **documento oficial**
(DNI o pasaporte) para verificar tu identidad ✔; si la información es inválida, **no se devuelve la cuota** ✔.
Es posible que pidan comprobar un **teléfono Android** con la app *Play Console* (◦).

**Paso 3 · Crear la app.** *Todas las apps → Crear app*: nombre, idioma (**español - Latinoamérica**), tipo *app*,
**gratuita**. Acepta las declaraciones.

**Paso 4 · Contenido de la app** (obligatorio antes de publicar): política de privacidad (URL), **acceso a la app**
(credenciales de la cuenta de demostración, §8), anuncios (no), clasificación de contenido (cuestionario IARC),
público objetivo, **seguridad de los datos** (el equivalente de las etiquetas de Apple) y **eliminación de
cuenta**: Google exige una **vía dentro de la app y una URL web** (`SEC-09`, `CUS-AUT-017`).

**Paso 5 · Firma.** Usa **Play App Signing** (Google guarda la clave de firma final; tú guardas la **clave de
subida**) y publica en formato **AAB**. **Haz copia de la clave de subida en dos sitios**: si la pierdes, hay que pedir
un restablecimiento. Anota las huellas **SHA-1/SHA-256** de la clave de subida **y de la de Google** (Play Console →
*Integridad de la aplicación*): las necesita el inicio de sesión con Google (§5).

**Paso 6 · Pistas de prueba** ✔:

| Pista | Testers | Revisión | Sirve para |
|---|---|---|---|
| **Interna** | Hasta 100, por correo | **Ninguna**; disponible en minutos | **Negocios**: las 4 cajeras la instalan desde un enlace. **No cuenta** para publicar al público |
| **Cerrada** | Lista o Grupo de Google | Sí (la primera, hasta ~7 días) | **Customer**: es la que **cuenta** para pedir producción |
| Abierta | Cualquiera | Sí | Opcional |
| **Producción** | Todos | Sí | Lanzamiento |

**Paso 7 · Requisito de cuentas personales nuevas** ✔: prueba **cerrada con ≥ 12 testers que se mantengan inscritos
14 días seguidos**; después, **solicitar acceso a producción** en el *Panel* y responder unas preguntas sobre la
prueba. Google contesta, por lo general, en **≤ 7 días**. **Solo cuenta la pista cerrada**, no la interna.

**El requisito es por app** (◦ según fuentes de la comunidad; confírmalo en la ayuda oficial): la prueba de una app no
vale para la siguiente. Consecuencias para Tindivo: **Negocios** va por la **pista interna** (sin este requisito);
**Customer** necesita **su propia** prueba cerrada. Como lo que cuenta es que los testers sigan **inscritos** (no la
versión que probaron), conviene **abrir la pista cerrada con la primera versión usable** y seguir subiendo versiones
nuevas a esa misma pista mientras se termina la app (◦): el reloj corre mientras trabajas.

**Paso 8 · Reclutar los 12 testers desde ya** (es lo que más se subestima): personas con un Android y Gmail
(personal de La Florencia, familia, clientes). Deben **aceptar la invitación, instalar y no desinstalar** durante los 14
días, y darte comentarios reales (te los preguntan). Recluta **15-20** para tener margen.

**Paso 9 · Requisitos técnicos de la plataforma** ✔: desde el **31-ago-2026**, las apps nuevas y sus actualizaciones
deben apuntar a **Android 16 (API 36)** o superior (Google permite pedir una prórroga hasta el 1-nov-2026, que no
nos hace falta). Como empezamos de cero, `targetSdk = 36` desde el primer día.

## 5. Firebase (avisos y, opcionalmente, fallos y analítica)

1. `console.firebase.google.com` → **Añadir proyecto** (plan **Spark**, gratuito; FCM no tiene coste).
2. **Añadir app Android** con `com.tindivo.customer` (y otra para `com.tindivo.business`): descarga
   `google-services.json`. Añade las huellas **SHA-1/SHA-256** (**debug, subida y Play App Signing**): si falta la
   de Play App Signing, *el inicio de sesión con Google funciona en desarrollo y falla en la versión de la tienda*.
3. **Añadir app iOS** con `com.tindivo.customer`: descarga `GoogleService-Info.plist`.
4. *Configuración del proyecto → Cloud Messaging → Configuración de la app de Apple*: sube la **clave APNs (`.p8`)**
   con su **Key ID** y **Team ID**.
5. Comprueba que esté habilitada la **API de Firebase Cloud Messaging (HTTP v1)**. La antigua «clave de servidor»
   está retirada.
6. *Cuentas de servicio → Generar nueva clave privada*: el JSON se guarda como **secreto del backend** (Supabase y/o
   Vercel), **nunca en el repositorio**. Con él, el servidor envía los avisos (`NOT-01`, `NOT-02`).
7. Opcional y gratuito: **Crashlytics** y **Analytics** (`MOB-11`, `PRO-05`); **App Distribution** como alternativa a
   la pista interna de Play para las cajeras.

**Sobre el inicio de sesión** (`NAT-AUT-001`): en nativo se usa el **token de identidad** de Google y de Apple con
Supabase Auth; hay que añadir los **identificadores de cliente** de Android/iOS a la lista permitida del proveedor en
Supabase (`SEC-08`: la configuración de Auth hoy no está versionada). El *Service ID* de Apple solo hace falta si
mantienes el acceso con Apple en la web.

## 6. Páginas públicas y enlaces (en `tindivo.com`)

| Pieza | Estado hoy | Hace falta |
|---|---|---|
| `/privacidad` | ✅ existe (`apps/customer/app/privacidad/page.tsx`) | Revisarla contra el **inventario de PII** y los plazos reales (`DAT-06`); ambas tiendas la enlazan |
| `/terminos` | ✅ existe | Alinear con la app |
| **Eliminar cuenta** (URL pública) | ❌ | Página con el procedimiento y formulario; obligatoria en **Google Play** y recomendada en Apple (`SEC-09`) |
| **Soporte** (URL y correo) | 🟡 solo `support_whatsapp` | Página de contacto que ambas fichas pueden enlazar |
| `/.well-known/apple-app-site-association` | ❌ | Para **enlaces universales** de iPhone (`MOB-05`) |
| `/.well-known/assetlinks.json` | ❌ | Para **App Links** de Android, con las huellas SHA-256 (`MOB-05`) |

## 7. Lo que las tiendas revisan y afecta a Tindivo

| Requisito | Apple | Google | Estado (ID) |
|---|---|---|---|
| **Borrar la cuenta** dentro de la app y por web | 5.1.1(v) | Política de eliminación de cuentas | ❌ `SEC-09`, `CUS-AUT-017` |
| **Sign in with Apple** si ofreces Google | 4.8 | — | ❌ `CUS-AUT-003`, `NAT-AUT-001` |
| Política de privacidad y declaración de datos | Etiquetas de privacidad | Seguridad de los datos | 🟡 `DAT-06` |
| **Consentimiento** de notificaciones de marketing | 4.5.4 | Buenas prácticas | ❌ `NOT-06`, `NAT-CON` |
| Cuenta de **demostración** que funcione a cualquier hora | 2.1 | Acceso a la app | ❌ §8 |
| Textos de **propósito de los permisos** (ubicación, notificaciones, cámara para el comprobante) | Obligatorios | Declaración de permisos | ❌ `NAT-LOC` |
| Bienes físicos con **pago fuera de la app** (Yape/Plin/efectivo) | Permitido (3.1.3) | Permitido | ✅ sin compras dentro de la app |
| Reseñas de restaurantes | 1.2 (contenido de usuarios) | Contenido generado | ✅ no aplica en principio: **no son públicas** (`CUS-REV-002`); confírmalo en el cuestionario |
| Nivel de SDK | Xcode 26 / SDK iOS 26 ✔ | `targetSdk` 36 ✔ | — |
| Funcionalidad mínima (no ser una web envuelta) | 4.2 | Calidad de la app | ✅ es nativa (`D-00`) |

## 8. Cuenta y negocio de demostración (lo que más rechazos causa)

Los revisores prueban **a cualquier hora, en horario de EE. UU.**, y Tindivo opera **de noche** (⚙ 18:00-23:00
Lima). Si al abrir la app ven **«cerrado»** o no pueden completar un pedido, la app se rechaza por no poder probarse.

- Crea un **negocio de demostración** siempre abierto, **visible solo para la cuenta de revisión**, sin personal real:
  sus pedidos **no deben avisar a ninguna cajera ni motorizado reales**.
- Crea un **usuario de revisión con correo y clave** y el **teléfono ya verificado en la base**, para no depender
  de un SMS (el OTP va por Twilio Verify y un revisor no puede recibirlo). No abras un «código maestro» general.
- Apple: *Notas para el revisor* con usuario, clave y los pasos. Google: *Acceso a la app*. Prepara además un
  video corto del flujo.
- Estas piezas de backend entran en `05-arranque/03-plan-de-ejecucion.md`, carril F1.

## 9. Lista de comprobación de hoy

- [ ] Mac: modelo, año y macOS anotados (paso 0 de Apple) y compartidos conmigo.
- [ ] Cuenta de Google y Apple Account **dedicadas**, con dos pasos y nombre legal exacto.
- [ ] **Google Play Console** registrada y con la **identidad en verificación**.
- [ ] **Apple Developer Program** pagado y en espera de activación.
- [ ] Tarjeta con compras internacionales en USD habilitadas.
- [ ] Proyecto **Firebase** creado; nadie más que tú con acceso de propietario.
- [ ] Lista de **15-20 testers** con Android y Gmail (nombre + correo).
- [ ] Identificadores de §2.2 **confirmados** y nombres de tienda comprobados.
- [ ] Un Android de gama baja y un iPhone físico localizados.
- [ ] Gestor de contraseñas con todo lo anterior; **claves de firma con copia doble**.

## 10. Errores frecuentes que retrasan semanas

1. **Nombre distinto al del documento** (o alias) en Apple/Google → rechazo de identidad.
2. **Tarjeta prepago** o sin compras internacionales → el pago falla.
3. **Contar la pista interna** para los 14 días → no cuenta; hace falta la **cerrada** ✔.
4. **Testers que se desinstalan** antes de los 14 días → el contador se reinicia.
5. **Perder la clave de subida** o el `.p8` de APNs (se descarga una vez).
6. **Olvidar la huella SHA-1 de Play App Signing** en Firebase/Google → el login con Google falla solo en la tienda.
7. **Apple sin cuenta de demostración** o con un negocio «cerrado» → primer rechazo.
8. Cambiar el *bundle id* / `applicationId` a mitad de camino: no se puede; se crea una app nueva.

## Fuentes (consultadas el 2026-09-20)

- Apple: [inscripción](https://developer.apple.com/help/account/membership/program-enrollment/) ·
  [verificación de identidad](https://developer.apple.com/help/account/membership/identity-verification/) ·
  [inscripción con la app Apple Developer](https://developer.apple.com/help/account/membership/enrolling-in-the-app/) ·
  [requisitos mínimos de SDK](https://developer.apple.com/news/upcoming-requirements/) ·
  [requisitos de Xcode](https://developer.apple.com/xcode/system-requirements) ·
  [Xcode 26.4 exige macOS Tahoe 26.2 (fuente secundaria)](https://news.ycombinator.com/item?id=47687167)
- Google: [empezar con Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) ·
  [verificar la identidad](https://support.google.com/googleplay/android-developer/answer/10841920) ·
  [requisito de prueba para cuentas personales nuevas](https://support.google.com/googleplay/android-developer/answer/14151465) ·
  [pistas de prueba](https://support.google.com/googleplay/android-developer/answer/9845334) ·
  [el requisito de 12 testers es por app (guía de la comunidad)](https://support.google.com/googleplay/android-developer/community-guide/255621488/everything-about-the-12-testers-requirement) ·
  [nivel de API objetivo](https://support.google.com/googleplay/android-developer/answer/11926878) ·
  [tiempos de revisión (fuente secundaria)](https://primetestlab.com/blog/google-play-review-time-2026)
