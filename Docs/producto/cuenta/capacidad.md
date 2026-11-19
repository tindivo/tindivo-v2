---
id: cuenta
nombre: Cuenta y borrado de cuenta
actores: [CUS]
lineas: [pedidos-restaurante, entregas]
depende_de: [acceso, direcciones]
dinero: false
codigo:
  web: [apps/customer/features/account/**, apps/customer/app/cuenta/**, apps/customer/app/borrar-cuenta/**]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/deleteaccount/**]
  ios: []
  backend: [apps/api/app/api/v1/customer/account/**]
operaciones: []
reglas: [UpdateCustomerProfileRequestSchema, app_settings:support_whatsapp]
---

# Cuenta y borrado de cuenta

> Verificado: 2026-11-18 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el 2026-11-19 (conversación con Claude Code: «apruebo las recomendaciones de los cuatro»)

## Antes de tocar

- Es la pestaña «Cuenta» del cliente: perfil, estado del celular, direcciones, interruptor de avisos, ayuda, legal,
  cerrar sesión y **borrar la cuenta**. Entrar, el celular y los Términos son de `acceso`; las direcciones, de `direcciones`.
- `dinero: false`, pero **borrar la cuenta es irreversible** y toca datos personales: todo cambio de esta capacidad
  pasa por Codex (`codex-worker.md` §2, D01, D02 y S04). El documento no lleva datos reales.
- Borrar es inmediato y sin vuelta atrás: anonimiza los pedidos, borra lo personal y la identidad. La app exige
  escribir `BORRAR` y el servidor responde 409 con el motivo si hay un pedido en curso, dinero sin resolver o un rol que no
  es de cliente (apps de negocio o motorizado: lo cierra soporte).
- Lo que se conserva y por qué: `Docs/operacion/retencion-de-datos.md`. Al borrar la cuenta, de una reseña
  quedan nota y etiquetas, sin autor y **sin comentario** (Jesús, 2026-11-19, opción C): no lo cambies sin aprobación.
- Cerrar sesión es siempre local (`movil:D-64`); «cerrar en todos» no existe todavía.
- El interruptor «Avisos de tus pedidos» depende de las notificaciones (CUS-NOT-005, aún en `trabajo/`): sin FCM no hay qué apagar.
- Google Play exige poder borrar la cuenta dentro de la app y desde un enlace web público; la web del cliente se
  apaga (`movil:D-27`): una página pública mínima (Términos, Privacidad y borrado) sobrevive al apagado (Jesús, 2026-11-19, decisión 7).
- iOS aún no empieza: `codigo.ios` vacío.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-ACC-001 | La app debe mostrar el perfil, el estado de verificación del celular y poder verificarlo desde Cuenta. | `apps/customer/app/cuenta/page.tsx` · `Docs/trabajo/app-cliente/requisitos/ACC.md` | |
| CUS-ACC-002 | La app debe mostrar las direcciones guardadas en Cuenta, con las acciones de añadir, editar y predeterminar de la capacidad `direcciones`. | `apps/customer/features/account/components/addresses-list.tsx` | |
| CUS-ACC-003 | La app debe mostrar los tres pedidos más recientes y accesos rápidos (pedidos activos, reclamos) con los contadores de reclamos. | `apps/customer/features/account/components/recent-orders-preview.tsx` | |
| CUS-ACC-004 | La app debe mostrar el menú de cuenta con cerrar sesión. | `apps/customer/features/account/components/account-menu.tsx` | |
| CUS-ACC-005 | La app debe ofrecer en Cuenta un solo interruptor de notificaciones, «Avisos de tus pedidos»; es el mismo control de CUS-NOT-002. Sin interruptor de promociones. | Jesús, 2026-11-17 (decisiones A y P) | |
| CUS-ACC-006 | La app debe dar a «Mis direcciones» un lugar de primer nivel en Cuenta, con más peso que los accesos secundarios. | Jesús, 2026-11-16 · `Docs/trabajo/app-cliente/requisitos/ACC.md` | |
| CUS-ACC-007 | Cuando falten datos del perfil, la app debe mostrar el aviso «Completa tu perfil» con un botón por cada paso pendiente (nombre, celular, dirección). Cada botón abre su hoja dentro de Cuenta; nunca obliga a salir. | Jesús, 2026-11-16 | |
| CUS-ACC-008 | Cuando el cliente borra su cuenta, el sistema debe conservar la nota y las etiquetas de sus reseñas, sin vínculo con el autor y **sin el comentario**; el texto de la app debe decirlo así. | Jesús, 2026-11-19 (opción C, sustituye a la T3 del 2026-11-16) · `Docs/operacion/retencion-de-datos.md` | |
| CUS-AUT-013 | La app debe ofrecer «cerrar sesión en este dispositivo» y, aparte, «cerrar en todos». | `apps/customer/features/account/components/account-menu.tsx` · `apps/customer/lib/sign-out.ts` | |
| CUS-AUT-014 | La app debe permitir editar el nombre del perfil, con el mismo largo y los mismos caracteres que valida el servidor. | `apps/customer/features/account/hooks/use-account-page.ts` · `UpdateCustomerProfileRequestSchema` | |
| CUS-AUT-015 | La app debe mostrar el progreso del perfil (nombre, celular verificado, dirección) y llevar al paso que falta. | `apps/customer/features/account/components/profile-hero.tsx` | |
| CUS-AUT-017 | La app debe permitir borrar la cuenta y los datos personales desde la propia app, confirmando escribiendo `BORRAR`, con anonimización de los pedidos y retención mínima. Bloquea la publicación en las tiendas. | `apps/api/app/api/v1/customer/account/route.ts` · `Docs/operacion/retencion-de-datos.md` | ★ |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-ACC-01 | Dado una cuenta con perfil completo, entonces Cuenta muestra el nombre, el celular verificado, las direcciones guardadas y el menú con cerrar sesión. | CUS-ACC-001, CUS-ACC-002, CUS-ACC-004 |
| CA-ACC-P1 | Dado una cuenta con celular sin verificar y sin direcciones, cuando la persona verifica su celular, entonces el paso «Verifica tu celular» se marca y se tacha con un rebote; al agregar la primera dirección, la tarjeta se contrae y desaparece. | CUS-ACC-007, CUS-AUT-015 |
| CA-ACC-P2 | Dado la sección «Notificaciones», entonces hay un único interruptor con «Avisos de tus pedidos» y no existe uno aparte de promociones. | CUS-ACC-005 |
| CA-ACC-P3 | Dado la persona en «Eliminar mi cuenta», entonces el botón de borrado está deshabilitado hasta escribir exactamente `BORRAR`; borrar no se puede deshacer ni deja volver a la sesión anterior. | CUS-AUT-017 |
| CA-ACC-02 | Dado una cuenta con nombre, cuando la persona lo edita y guarda un nombre válido, entonces el perfil lo muestra; con uno inválido, no se guarda. | CUS-AUT-014 |
| CA-ACC-03 | Dado dos dispositivos con la misma cuenta, cuando uno elige «cerrar sesión en este dispositivo», entonces el otro sigue con sesión; cuando elige «cerrar en todos», ambos quedan sin sesión. | CUS-AUT-013 |
| CA-ACC-04 | Dado una cuenta con un pedido en curso, cuando intenta borrarla, entonces el servidor responde 409, la app muestra el motivo en español, la sesión sigue abierta y nada cambia. Prueba: `apps/api/lib/__tests__/account-deletion.integration.test.ts` («con un pedido en curso: 409…»). | CUS-AUT-017 |
| CA-ACC-05 | Dado una cuenta sin pedidos en curso, cuando se borra, entonces los pedidos quedan sin la persona, el ledger no se toca y repetir la petición con el mismo token da 401. Prueba: `apps/api/lib/__tests__/account-deletion.integration.test.ts` («borra lo personal…» y «repetirla…»). | CUS-AUT-017 |
| CA-ACC-06 | Dado una cuenta que borró sus datos, entonces ninguna otra cuenta cambia. Prueba: `apps/api/lib/__tests__/account-deletion.integration.test.ts` («no toca a las demás cuentas»). | CUS-AUT-017 |
| CA-ACC-07 | Dado una cuenta con reseñas, cuando se borra, entonces cada reseña conserva nota y etiquetas, sin autor y sin comentario, y la pantalla de borrado dice que el comentario se elimina. | CUS-ACC-008 |

## Reglas

- Nombre del perfil (largo y caracteres): `UpdateCustomerProfileRequestSchema`.
- Soporte por WhatsApp (ayuda y cuentas que solo cierra soporte): `app_settings:support_whatsapp`.

## Abierto

- Reautenticar antes de borrar: Jesús aprobó dejar solo la sesión y escribir `BORRAR`; Codex debe confirmarlo al auditar.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-AUT-014 | Con el perfil completo no hay cómo editar el nombre: la hoja solo se abre cuando falta. | `feature/account/AccountScreen.kt` · `navigation/AppNavHost.kt` |
| 2 | CUS-AUT-013 | Solo existe «Cerrar sesión» (local); falta «cerrar en todos». | `feature/account/AccountScreen.kt` · `feature/account/AccountViewModel.kt` |
| 3 | CUS-ACC-003, CUS-ACC-005, CUS-ACC-006 | Cuenta es una columna de botones: sin pedidos recientes ni reclamos, sin interruptor de avisos y sin la lista de direcciones. | `feature/account/AccountScreen.kt` |
| 4 | CUS-ACC-007, CUS-AUT-015 | Solo el nombre tiene aviso; el celular tiene su botón aparte y no hay progreso ni paso de dirección. | `feature/account/AccountScreen.kt` · `feature/account/AccountViewModel.kt` |
| 5 | CUS-ACC-008 | El texto de borrado dice «Las reseñas se quedan sin tu nombre», pero no avisa de que el comentario se borra. | `res/values/strings.xml` (`delete_account_kept_body`) · `Docs/operacion/retencion-de-datos.md` |
| 6 | CUS-AUT-017 | La pantalla de borrado nombra «Google, Apple o correo» como inicio de sesión; en Android solo hay Google. | `res/values/strings.xml` (`delete_account_removed_login`) |
