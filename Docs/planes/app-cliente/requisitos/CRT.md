# CUS-CRT · Bolsa (carrito)

> Estado: **propuesto**, pendiente de aprobación de Jesús · Parte de `Docs/planes/app-cliente/README.md` · Android `feature/` `cart` · Formato: `Docs/trabajo/movil/03-requisitos/00-formato-y-convenciones.md` con la columna `Est.` partida en **Android** e **iOS** (✅ hecho · 🟡 parcial · ⚠️ defecto · ⬜ por hacer · 📝 sin verificar en código · — no aplica). Rutas Android relativas a `apps/android/customer/src/main/kotlin/com/tindivo/customer/` (las de `core/` están en `apps/android/core/`; `res/` y `AndroidManifest.xml`, en `apps/android/customer/src/main/`). ⚙ = parámetro de `app_settings` (se lee de `GET /config`, nunca va escrito en la app). ★ = crítico de paridad.

## Requisitos

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-CRT-001 ★ | La bolsa debe pertenecer a **un solo negocio**; al agregar un plato de otro, la app debe pedir confirmación y reemplazarla. | Cambiar de negocio vacía las líneas, la validación y el método de entrega (vuelve a *delivery*). | `lib/cart.ts:154-180`; `features/catalog/components/cart-replace-sheet.tsx` · Android: `feature/catalog/business/DishSheet.kt:181` (`dish_new_bag_*`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CRT-002 | Cuando se agrega una línea idéntica, la app debe **fusionarla** sumando cantidad. | Idéntica = mismo plato + mismo conjunto de opciones (orden irrelevante) + misma nota (recortada). | `lib/cart.ts:108-116,168-178` · Android: `feature/cart/Cart.kt:85-98` (`mergeInto`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CRT-003 | La app debe permitir cambiar la cantidad (mín. 1) o quitar una línea; si queda vacía, se reinicia. | Al vaciarse se limpia negocio, validación y método. | `cart.ts:193-207` · Android: `feature/cart/CartScreen.kt` (`cart_line_less`, `cart_line_more`, `cart_remove`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CRT-004 | La app debe **guardar la bolsa en el dispositivo** entre sesiones. | Persiste negocio, líneas y método; **no** persiste la validación; al rehidratar se sanea el método contra el enum. | `cart.ts:236-270` · Android: `feature/cart/CartStore.kt` (DataStore) | ✅ | ⬜ | ADAPTAR · M1 |
| CUS-CRT-005 ★ | Cuando se abre la carta o el checkout, la app debe **validar la bolsa contra el catálogo vigente**. | Detecta plato **eliminado**, **agotado**, **fuera de franja**, **precio base** o de **opción** cambiado; muestra aviso; permite quitar las líneas inválidas; con líneas inválidas el checkout se bloquea («Revisa tu bolsa»). | `lib/cart-validation.ts`; `use-checkout-validation.ts:75-82` · Android: `feature/checkout/CheckoutReducers.kt` (avisos `checkout_msg_options_changed` y `checkout_msg_total_changed` desde el servidor; no se encontró la validación local contra la carta) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-CRT-006 | La app debe calcular el subtotal con redondeo a dos decimales. | — | `cart.ts:210-211` · Android: `feature/cart/Money.kt` | ✅ | ⬜ | IGUAL · M1 |
| CUS-CRT-007 | La app debe recordar el método de entrega **por bolsa**, no por perfil. | Por defecto *delivery* (pide más, así que equivocarse hacia ahí es lo barato). | `cart.ts:11-19,65` · Android: `feature/cart/Cart.kt` | 📝 | ⬜ | IGUAL · M1 |
| CUS-CRT-008 ★ | Antes del checkout, la app debe comprobar en orden: sesión → celular verificado → dirección válida → sin caso de pago pendiente. | La dirección **solo se exige en delivery**: línea ≥ 5, referencia ≥ 5 y pin **dentro del polígono**. El celular se exige también en recojo (strikes por teléfono). Propuesta: que lo calcule el servidor (`GET /me/readiness`). | `lib/order-gates.ts`; `hooks/use-order-readiness.ts` · Android: `feature/checkout/CheckoutUiState.kt` (sesión, celular, dirección y nombre sí; el caso de pago sin resolver no se encontró) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-CRT-009 | Cuando «Ir a pagar» esté deshabilitado, la app debe decir siempre por qué. | «Cargando…» o «El restaurante está cerrado ahora». Nació del incidente del 2026-09-09. | `features/cart/components/cart-ctas.tsx:75-121` · Android: `res/values/strings.xml` (`checkout_cta_*` dicen qué falta) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CRT-010 | La app debe mostrar un aviso cuando la bolsa es de recojo. | — | `features/cart/components/cart-pickup-notice.tsx` · Android: `res/values/strings.xml` (`checkout_pickup_at`, dentro del checkout, no en la bolsa) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-CRT-011 | La app debe respetar los topes de la bolsa. | ≤ 50 líneas, cantidad 1-50, ≤ 20 opciones por línea. | `contracts/requests.ts:14-22,113` · Android: `feature/cart/Cart.kt` (`MAX_LINES`, `MAX_QUANTITY`, `MAX_MODIFIERS`) | ✅ | ⬜ | IGUAL · M1 |
| CUS-CRT-012 | La acción «Volver a pedir» debe reponer la bolsa con los platos de un pedido anterior. | **Hoy solo abre el negocio**; `cart.replace` no se usa en producción. Debe revalidar disponibilidad y precios actuales. | `app/pedidos/page.tsx:203`; `lib/cart.ts:182-191` · Android: `feature/orders/OrdersScreen.kt:47` (`onReorder(businessId)` solo abre el negocio) | ⚠️ | ⬜ | NUEVO · M2 |

## Criterios de aceptación ★
```
CA-CRT-01 · Bolsa de un solo negocio                                       (CUS-CRT-001)
  Dado una bolsa con 2 platos del negocio A
  Cuando el cliente agrega un plato del negocio B
  Entonces la app pide confirmación de reemplazo
  Y al aceptar la bolsa queda con solo el plato de B y el método vuelve a «delivery»
```

## Defectos conocidos

Encontrados al especificar la web (2026-09/10); se corrigen en nativo, no se copian.

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 6 | CUS-CRT-012 | «Volver a pedir» no repone la bolsa; `cart.replace` solo se usa en tests. | `pedidos/page.tsx:203`; `lib/cart.ts:182` |
