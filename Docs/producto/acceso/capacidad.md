---
id: acceso
nombre: Acceso, términos y celular
actores: [CUS]
lineas: [pedidos-restaurante, entregas]
depende_de: []
dinero: false
codigo:
  web: [apps/customer/components/auth-onboarding/auth-onboarding-sheet.tsx, apps/customer/components/auth-onboarding/host.tsx, apps/customer/components/auth-onboarding/persistence.ts, apps/customer/lib/order-gates.ts, apps/customer/lib/sign-out.ts, apps/customer/lib/onboarding-store.ts, packages/supabase/src/session-verdict.ts, packages/supabase/src/sign-out-local.ts]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/session/**]
  ios: []
  backend: [apps/api/app/api/v1/customer/phone/**, apps/api/app/api/v1/customer/terms-acceptance/**, apps/api/app/api/v1/customer/profile/**]
operaciones: [transferCustomerPhone]
reglas: [PHONE_PE_RE, UpdateCustomerProfileRequestSchema, app_settings:terms_version, app_settings:support_whatsapp]
---

# Acceso, términos y celular

> Verificado: 2026-11-18 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el AAAA-MM-DD (medio) — pendiente de su visto bueno

## Antes de tocar

- Es la puerta de la app: entrar con Google (en iOS, también Apple), aceptar Términos y Privacidad, verificar el
  celular por SMS y conservar o cerrar la sesión. La cuenta ya creada (perfil, nombre, borrado) es de `cuenta`.
- `dinero: false`, pero es zona de **seguridad y datos personales** (sesión, SMS, teléfono, correo): todo cambio aquí
  pasa por Codex (`codex-worker.md` §2, S02 y S04). Este documento no lleva secretos ni valores reales.
- En nativo se entra **solo con Google** (`movil:D-22`); correo y contraseña quedan retirados. En iOS se suma Apple.
- La casilla de Términos va **siempre**, desmarcada, antes de «Continuar con Google» (Jesús, 2026-11-17).
- Edad mínima de uso: 18 años (`movil:D-46`). Ninguna ficha de `trabajo/` define cómo la comprueba la app (decisión 4).
- Un número verificado pertenece a una sola cuenta (`movil:D-63`). En el lanzamiento **no hay traslado automático**:
  lo resuelve soporte por WhatsApp (CUS-AUT-028). `transferCustomerPhone` sigue en la API v1: hay apps instaladas.
- La sesión de Android vive cifrada en el aparato (`session/`). Cerrar sesión es siempre local; borra el archivo y
  destruye la clave (`movil:D-64`). Un cierre global echó a todos una vez.
- La versión vigente de los Términos va fija en la app y ninguna operación la publica (defecto 3).
- Celular y nombre son **hojas dentro del checkout**, no pantallas aparte: su lógica es `feature/phone` y `feature/profile`.
- La web del cliente se apaga (`movil:D-27`): sus archivos son referencia, no se corrigen. iOS aún no empieza.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-AUT-001 | Cuando el cliente no tiene sesión, la app debe permitirle explorar el catálogo y armar la bolsa; el acceso se exige solo al pasar al checkout o a pedir una entrega. | `apps/customer/lib/order-gates.ts` · `Docs/trabajo/app-cliente/flujos/acceso-y-datos.md` §0 | |
| CUS-AUT-002 | Cuando el cliente elige Google, la app debe iniciar sesión con el ID token de Google, mostrando siempre el selector de cuenta; los errores se muestran en español. | `apps/customer/components/auth-onboarding/persistence.ts` · `movil:D-22` | |
| CUS-AUT-003 | Cuando el cliente use iPhone, la app debe ofrecer Sign in with Apple además de Google. El correo puede venir oculto: `users.email` no siempre es real. Solo iOS. | `movil:D-22` · guía 4.8 de App Store | |
| CUS-AUT-004 | **Retirado en nativo.** Crear la cuenta con nombre, correo y contraseña no existe en las apps; solo Google. Se conserva el ID por la historia. | `movil:D-22` | |
| CUS-AUT-005 | **Retirado en nativo.** Iniciar sesión con correo y contraseña no existe en las apps; solo Google. Se conserva el ID por la historia. | `movil:D-22` | |
| CUS-AUT-006 | Cuando el cliente entra por primera vez, la app debe confirmar su nombre visible y registrar la aceptación de los Términos. El nombre se pide en una hoja, nunca llevando a Cuenta. | `apps/customer/components/auth-onboarding/persistence.ts` · `app_settings:terms_version` | |
| CUS-AUT-007 | La app debe verificar el celular del cliente por código SMS antes de su primer pedido: número peruano, código de 6 dígitos, reenvío tras una espera y tope de envíos por usuario que fija el servidor. Solo SMS. | `apps/api/app/api/v1/customer/phone/send-code/route.ts` · `PHONE_PE_RE` | ★ |
| CUS-AUT-008 | El servidor debe guardar el celular verificado en formato E.164 y asociarlo a una sola cuenta; si ya es de otra, responde 409 y no hay flujo de fusión ni recuperación. | `movil:D-63` · `apps/api/app/api/v1/customer/phone/verify/route.ts` | |
| CUS-AUT-009 | Cuando el cliente cambia el celular en el checkout, la app debe exigir una nueva verificación antes de crear el pedido. | `apps/customer/features/checkout/hooks/use-checkout-actions.ts` | |
| CUS-AUT-010 | Si hay sesión pero no perfil (por ejemplo, Google en otro dispositivo), la app debe pedir completar el nombre. | `apps/customer/features/checkout/hooks/use-checkout-auth.ts` | |
| CUS-AUT-011 | Si no se puede confirmar la sesión por falta de red, la app debe conservar la sesión local; solo la desmiente un veredicto del servidor. | `packages/supabase/src/session-verdict.ts` | |
| CUS-AUT-012 | Si el servidor desmiente la sesión, la app debe cerrar solo la sesión local, nunca la de otros dispositivos. | `apps/customer/lib/sign-out.ts` · `movil:D-64` | |
| CUS-AUT-016 | **No aplica en nativo.** Reanudar el alta tras volver del inicio de sesión de Google existe solo porque en web la página se recarga. | `apps/customer/lib/onboarding-store.ts` | |
| CUS-AUT-018 | **Fuera del lanzamiento.** Gestionar el consentimiento y las categorías de notificaciones queda retirado (CUS-NOT-005, Jesús, 2026-11-17). | `Docs/trabajo/app-cliente/requisitos/AUT.md` | |
| CUS-AUT-019 | Cuando el cliente entra a la app nativa, la app debe ofrecer solo «Continuar con Google» como forma de acceso; en iOS se suma Apple. El celular se sigue verificando por SMS para poder pedir. | `movil:D-22` · Jesús, 2026-11-16 | |
| CUS-AUT-020 | Cuando la persona llega a la pantalla de acceso, la app debe mostrar, antes del botón, la casilla «Acepto los Términos y la Política de privacidad», desmarcada, y mantener «Continuar con Google» sin efecto hasta que la marque. Los enlaces a Términos y Privacidad miden 48 dp de alto. | Jesús, 2026-11-17 (decisión O) | ★ |
| CUS-AUT-021 | Cuando el acceso se completa, el sistema debe guardar en la cuenta la versión de los Términos, la versión de la Privacidad, la fecha y hora en UTC y la huella (o identificador) del texto mostrado. Nunca se guarda si el acceso falla. | Jesús, 2026-11-16 · `app_settings:terms_version` | ★ |
| CUS-AUT-022 | **Reemplazado por CUS-AUT-027.** La ventana de reaceptación al abrir la app ya no existe. | Jesús, 2026-11-17 | |
| CUS-AUT-023 | Cuando una cuenta tiene aceptación implícita (anterior a la casilla), la app debe pedir la aceptación explícita en su siguiente acceso o pedido, con la ventana de CUS-AUT-027. | Jesús, 2026-11-16 | |
| CUS-AUT-024 | Cuando el cliente escribe el código SMS, la app debe verificarlo solo al completar los 6 dígitos; con menos no envía nada. | Jesús, 2026-11-16 | |
| CUS-AUT-025 | Si el cliente pierde su cuenta de Google, la app debe indicarle que escriba a soporte por WhatsApp, donde se verifica su celular. | Jesús, 2026-11-16 · `app_settings:support_whatsapp` | |
| CUS-AUT-026 | Cuando el cliente abre la app por primera vez, la app debe mostrar el Inicio de restaurantes como invitado, sin pantallas previas ni introducción, con la franja descartable «Pide en San Jacinto · Pagas directo al negocio» y «¿Cómo pago?» opcional. | Jesús, 2026-11-16 | |
| CUS-AUT-027 | Cuando cambian los Términos o la Privacidad, la app debe pedir la reaceptación **al actuar** (pedir o editar datos de Cuenta), no al abrir, y nunca debe bloquear un pedido en curso, su cancelación en los primeros minutos, el soporte, cerrar sesión ni consultar Cuenta. Las salidas de la ventana son «Aceptar y continuar» y «Cerrar sesión». | Jesús, 2026-11-17 (decisión N) | ★ |
| CUS-AUT-028 | Cuando el celular ya pertenece a otra cuenta, la app debe mandar a soporte por WhatsApp y no ofrecer el traslado automático; sin revelar pedidos ni faltas de la otra cuenta. El servidor debe controlar el traslado sin romper a los clientes instalados. | Jesús, 2026-11-17 (decisión Q) · `movil:D-63` | |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-AUT-01 | Dado un invitado con una bolsa, cuando explora el catálogo, entonces no se le pide nada; cuando toca «Continuar» al checkout, entonces se le pide entrar y la bolsa sigue intacta al volver. | CUS-AUT-001 |
| CA-AUT-02 | Dado la pantalla de acceso en Android, entonces la única forma de entrar es «Continuar con Google» (sin correo ni teléfono) y cada toque abre el selector de cuentas. | CUS-AUT-002, CUS-AUT-019 |
| CA-AUT-P1 | Dado la pantalla con la casilla vacía, cuando la persona toca «Continuar con Google», entonces no se abre el selector de cuentas, la casilla se sacude y recibe el foco. | CUS-AUT-020 |
| CA-AUT-P2 | Dado la casilla marcada y un acceso con Google completado, entonces se registra la aceptación con las versiones vigentes de Términos y Privacidad y la fecha en UTC, y la persona vuelve a donde estaba. | CUS-AUT-006, CUS-AUT-021 |
| CA-AUT-P3 | Dado una bolsa con productos y la pantalla abierta desde «Ir a pagar», cuando toca «Ahora no», entonces vuelve a la bolsa, que sigue intacta, sin sesión. | CUS-AUT-001 |
| CA-AUT-03 | Dado un acceso con Google que falla al guardar la aceptación, entonces la persona no sigue, ve «No pudimos guardar. Reintenta.» y la bolsa se conserva. | CUS-AUT-021 |
| CA-AUT-04 | Dado una cuenta sin perfil que acaba de entrar, entonces se le pide el nombre en una hoja y, al guardarlo, vuelve a donde estaba. | CUS-AUT-010, CUS-AUT-006 |
| CA-AUT-05 | Dado una sesión guardada y un arranque sin red, entonces la sesión local se conserva; solo se cierra si el servidor la desmiente. | CUS-AUT-011 |
| CA-AUT-06 | Dado dos dispositivos con la misma cuenta, cuando uno cierra sesión o su sesión es desmentida, entonces el otro sigue con su sesión. | CUS-AUT-012 |
| CA-AUT-P4 | Dado una versión de Términos distinta de la aceptada y una acción de pedir, entonces la persona ve «Actualizamos los términos» y no puede cerrarla con «atrás» ni tocando fuera; las únicas salidas son «Aceptar y continuar» y «Cerrar sesión». | CUS-AUT-027 |
| CA-AUT-P5 | Dado la ventana abierta, cuando toca «Aceptar y continuar», entonces se guarda la versión vigente y la fecha en UTC y la persona sigue en lo que hacía, con la bolsa intacta. | CUS-AUT-027, CUS-AUT-021 |
| CA-AUT-P6 | Dado la ventana abierta, cuando toca «Cerrar sesión», entonces no se registra aceptación y la app queda como invitado. | CUS-AUT-027 |
| CA-AUT-07 | Dado un pedido activo, cuando la persona lo abre, lo cancela dentro de los primeros minutos, escribe a soporte, cierra sesión o abre Cuenta solo para consultar, entonces la ventana no aparece aunque haya términos nuevos. | CUS-AUT-027 |
| CA-AUT-08 | Dado una cuenta con aceptación implícita, cuando pide o edita datos de Cuenta, entonces se le pide la aceptación explícita con la misma ventana. | CUS-AUT-023 |
| CA-AUT-P7 | Dado el paso del número, cuando tiene menos de 9 dígitos o no empieza con 9, entonces «Enviar código» está deshabilitado y el campo dice «Escribe un celular de 9 dígitos que empiece con 9.»; con un número válido se habilita. | CUS-AUT-007 |
| CA-AUT-P8 | Dado el paso del código con 5 dígitos, cuando la persona escribe el sexto, entonces el campo se bloquea, aparece el progreso y se llama a la verificación sin tocar otro botón; con menos de 6 dígitos no se envía nada. | CUS-AUT-024, CUS-AUT-007 |
| CA-AUT-P9 | Dado un código recién enviado, entonces «Reenviar código» no está disponible hasta terminar la espera y el servidor responde 429 al pasar el tope de envíos. | CUS-AUT-007 |
| CA-AUT-P10 | Dado un celular ya verificado en el checkout, cuando la persona escribe uno distinto, entonces no se puede confirmar el pedido hasta verificarlo. | CUS-AUT-009 |
| CA-AUT-09 | Dado un número verificado en la cuenta A, cuando la cuenta B lo verifica por SMS, entonces recibe «Este número ya está asociado a otra cuenta» con «Contactar soporte» y «Usar otro número», no hay traslado, y no ve pedidos ni faltas de A. | CUS-AUT-008, CUS-AUT-028 |
| CA-AUT-10 | Dado una persona que perdió su cuenta de Google, cuando está en la pantalla de acceso, entonces ve cómo escribir a soporte por WhatsApp. | CUS-AUT-025 |
| CA-AUT-11 | Dado la primera apertura de la app, entonces se ve el Inicio de restaurantes como invitado, sin pantallas previas, con la franja «Pide en San Jacinto · Pagas directo al negocio». | CUS-AUT-026 |

## Reglas

- Formato del celular peruano (nueve dígitos que empiezan con nueve): `PHONE_PE_RE`.
- Nombre del perfil (largo y caracteres): `UpdateCustomerProfileRequestSchema`.
- Versión vigente de los Términos: `app_settings:terms_version`.
- Soporte por WhatsApp: `app_settings:support_whatsapp`.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-AUT-020, CUS-AUT-021 | Android no tiene casilla ni «Ahora no»; la aceptación se registra después, en «¿Cómo te llamas?», y solo si falta el perfil. Una cuenta con perfil nunca la registra. | `feature/signin/SignInScreen.kt` · `feature/profile/ProfileViewModel.kt` |
| 2 | CUS-AUT-021 | Solo viaja la versión de los Términos; la versión de la Privacidad y la huella no existen. El servidor guarda versión y fecha de aceptación. | `core/network/.../CustomerRepository.kt` · `apps/api/app/api/v1/customer/terms-acceptance/route.ts` |
| 3 | CUS-AUT-027 | La versión vigente es una constante de la app (`TERMS_VERSION`) y ninguna operación del contrato la publica; tampoco hay un error estructurado del servidor que dispare la ventana. | `feature/profile/ProfileName.kt` · `packages/contracts/openapi/v1.json` |
| 4 | CUS-AUT-024 | La verificación exige tocar «Verificar»; no se envía sola al sexto dígito. | `feature/phone/PhoneVerifyViewModel.kt` · `feature/phone/PhoneVerifyScreen.kt` |
| 5 | CUS-AUT-007 | El número solo admite nueve dígitos escritos: pegar «+51…» lo rechaza. La cuenta atrás del reenvío se reinicia al reabrir la app; el servidor solo limita el cupo. | `feature/phone/PhoneVerifyViewModel.kt` |
| 6 | CUS-AUT-007 | El tope de envíos por usuario es una constante local de la ruta, no un parámetro de `app_settings` ni de `packages/contracts`. | `apps/api/app/api/v1/customer/phone/send-code/route.ts` |
| 7 | CUS-AUT-028 | Android ofrece el traslado («Usar en esta cuenta») y el servidor lo permite; el lanzamiento exige soporte por WhatsApp. | `feature/phone/PhoneVerifyViewModel.kt` · `apps/api/app/api/v1/customer/phone/verify/route.ts` |
| 8 | CUS-AUT-009 | El checkout muestra el celular verificado del perfil, sin «Cambiar» junto a él. | `feature/checkout/CheckoutDeliverySection.kt` |
| 9 | CUS-AUT-025 | La pantalla de acceso no tiene el enlace de ayuda a WhatsApp. | `feature/signin/SignInScreen.kt` |
| 10 | CUS-AUT-026 | El Inicio es el destino de arranque, pero no existe la franja «Pide en San Jacinto · Pagas directo al negocio». | `navigation/AppNavHost.kt` · `feature/catalog/home/` |
| 11 | CUS-AUT-023 | La app no compara versiones al arrancar ni al actuar: no hay forma de saber qué cuentas tienen aceptación implícita. | `feature/profile/ProfileViewModel.kt` |
