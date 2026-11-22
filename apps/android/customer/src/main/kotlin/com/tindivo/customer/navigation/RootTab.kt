package com.tindivo.customer.navigation

/** Las cuatro pestañas raíz de la barra inferior. */
enum class RootTab { Home, Courier, Orders, Account }

private val ROUTES =
    mapOf(
        RootTab.Home to "com.tindivo.customer.navigation.CatalogHomeRoute",
        RootTab.Courier to "com.tindivo.customer.feature.courier.CourierHomeRoute",
        RootTab.Orders to "com.tindivo.customer.feature.orders.OrdersRoute",
        RootTab.Account to "com.tindivo.customer.navigation.AccountRoute",
    )

/**
 * La pestaña a la que pertenece [route] (el patrón de la ruta tipada), o `null` si no es una raíz: ahí la barra no se
 * ve. «Mis entregas» ([courierListOnly]) es una pantalla interior, no la raíz de Entregas.
 */
fun rootTabFor(
    route: String?,
    courierListOnly: Boolean = false,
): RootTab? {
    if (route == null) return null
    val tab =
        ROUTES.entries
            .firstOrNull { (_, name) ->
                route == name || route.startsWith("$name?") ||
                    route.startsWith("$name/")
            }?.key
    return if (tab == RootTab.Courier && courierListOnly) null else tab
}

/**
 * Sin sesión, «Pedidos» y «Cuenta» abren la entrada: el historial es de una cuenta, y abrirlo sin ella devolvía a la
 * persona al Inicio sin decirle por qué.
 */
fun tabNeedsSignIn(
    tab: RootTab,
    signedIn: Boolean,
): Boolean = !signedIn && (tab == RootTab.Orders || tab == RootTab.Account)
