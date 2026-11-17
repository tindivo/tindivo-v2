# CUS-ACC · Cuenta

> Estado: **propuesto**, pendiente de aprobación de Jesús · Parte de `Docs/planes/app-cliente/README.md` · Android `feature/` `account`, `deleteaccount` · Formato: `Docs/trabajo/movil/03-requisitos/00-formato-y-convenciones.md` con la columna `Est.` partida en **Android** e **iOS** (✅ hecho · 🟡 parcial · ⚠️ defecto · ⬜ por hacer · 📝 sin verificar en código · — no aplica). Rutas Android relativas a `apps/android/customer/src/main/kotlin/com/tindivo/customer/` (las de `core/` están en `apps/android/core/`; `res/` y `AndroidManifest.xml`, en `apps/android/customer/src/main/`). ⚙ = parámetro de `app_settings` (se lee de `GET /config`, nunca va escrito en la app). ★ = crítico de paridad.

## Requisitos

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-ACC-001 | La app debe mostrar el perfil, el estado de verificación del celular y el progreso. | Permite verificar el celular desde aquí. | `app/cuenta/page.tsx` · Android: `feature/account/AccountScreen.kt` (`account_phone_verified`, `account_phone_verify`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-ACC-002 | La app debe mostrar las direcciones guardadas con acciones de añadir, editar y predeterminar. | Ver `CUS-ADR-*`. | `features/account/components/addresses-list.tsx` · Android: `feature/addresses/AddressListScreen.kt` | ✅ | ⬜ | IGUAL · M1 |
| CUS-ACC-003 | La app debe mostrar los tres pedidos más recientes y accesos rápidos (pedidos activos, reclamos). | Contadores: reclamos totales, pendientes, completados. | `recent-orders-preview.tsx`; `quick-actions-grid.tsx` · Android: `feature/account/AccountScreen.kt` (acceso a «Mis pedidos»; tres recientes y reclamos no se encontraron) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-ACC-004 | La app debe mostrar el menú de cuenta con cerrar sesión. | Ver `CUS-AUT-013`. | `account-menu.tsx` · Android: `feature/account/AccountScreen.kt` (`account_sign_out`) | ✅ | ⬜ | IGUAL · M1 |

## Requisitos nuevos (decisiones de Jesús, noviembre de 2026)

Fuente de cada fila: la decisión que la origina. Android: verificado contra `apps/android/` el 2026-11-17; iOS aún no empieza.

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-ACC-005 | **Modificado por CUS-NOT-005: el interruptor es «Avisos de tus pedidos»** (Decisión de Jesús, 2026-11-17). La app debe ofrecer en Cuenta un solo interruptor de notificaciones. | **Decisión A resuelta el 2026-11-17: ver CUS-NOT-005.** Es el mismo control de CUS-NOT-002. | Decisión de Jesús, 2026-11-16 (`tindivo-auditorias/2026-11-16-ux-movil/PATRONES-V2.md` §11) | ⬜ | ⬜ | ADAPTAR · M1 |
| CUS-ACC-006 | La app debe dar a «Mis direcciones» un lugar de primer nivel en Cuenta, con más peso que los accesos secundarios. | El ícono de color solo en la dirección principal está por decidir (`propuestas-patrones.md`, «Cuenta»). Acciones: CUS-ACC-002. | Decisión de Jesús, 2026-11-16 (encargo; pantalla `Cuenta` del rediseño v3) · Android: existe el acceso `account_addresses`; el peso visual no se verificó | 🟡 | ⬜ | IGUAL · M1 |
| CUS-ACC-007 | Cuando falten datos del perfil, la app debe mostrar el aviso «Completa tu perfil» con un botón por cada paso pendiente (nombre, celular, dirección). | Reemplaza el aviso único de «Falta tu nombre». Cada botón abre su hoja dentro de Cuenta; nunca obliga a salir. | Decisión de Jesús, 2026-11-16 (encargo; `tindivo-auditorias/2026-11-16-ux-movil/PATRONES-V2.md` §11, «Dirección, celular y nombre se piden en hojas») · Android: solo el nombre: `feature/account/AccountScreen.kt` (`account_profile_missing_*`); el celular tiene su propio acceso | 🟡 | ⬜ | IGUAL · M1 |
| CUS-ACC-008 | Cuando el cliente borra su cuenta, el sistema debe conservar sus reseñas anonimizadas («Cliente de Tindivo»), con el comentario y sin vínculo con el autor. | **Requiere revisión de Jesús y de Codex** (cambia la retención de datos). Hoy la migración 0284 anula `customer_user_id` **y borra el comentario** (`supabase/migrations/0284_los_datos_tienen_plazo_de_conservacion.sql:219`), y la privacidad v2 lo dice así. La app ya dice «Las reseñas se quedan sin tu nombre» (`delete_account_kept_body`), pero el comentario no se conserva. Tarea T3 de la ronda 2. | Decisión de Jesús, 2026-11-16 (`tindivo-auditorias/2026-11-16-terminos-v3/decisiones-jesus-ronda2.md`, «Reseñas tras borrar la cuenta», T3) · Android: el texto de la app no coincide con lo decidido: `customer/src/main/res/values/strings.xml` (`delete_account_kept_body`) | ⚠️ | ⬜ | IGUAL · M1 |
