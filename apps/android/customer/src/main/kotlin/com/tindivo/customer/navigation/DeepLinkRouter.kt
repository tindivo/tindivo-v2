package com.tindivo.customer.navigation

/** A dónde lleva una ruta de la app (KT-11). Lo que no se reconoce lleva al inicio. */
sealed interface DeepLinkTarget {
    data object Home : DeepLinkTarget

    /** «Mi cuenta». Sin sesión, el inicio. */
    data object Account : DeepLinkTarget

    /** El seguimiento de un pedido por su código corto (`/pedido/AB2C3D4E`). */
    data class Order(
        val shortId: String,
    ) : DeepLinkTarget
}

/**
 * El único traductor de rutas de la app a destinos (KT-11): lo usan los avisos y, cuando lleguen, los App Links. Recibe
 * solo la RUTA (sin host); quien la entrega ya comprobó que es relativa (ver `NativePushPayload.decode`).
 *
 * El código corto no se valida con las reglas de creación (invariante 1: solo al crear); aquí solo se exige que tenga
 * forma de un código, para no armar una búsqueda con cualquier texto.
 */
object DeepLinkRouter {
    private val SHORT_ID = Regex("^[A-Za-z0-9]{4,16}$")

    fun route(path: String): DeepLinkTarget {
        val segments =
            path
                .substringBefore('?')
                .substringBefore('#')
                .split('/')
                .filter { it.isNotEmpty() }
        return when {
            segments.isEmpty() -> {
                DeepLinkTarget.Home
            }

            segments == listOf("cuenta") -> {
                DeepLinkTarget.Account
            }

            segments.size == 2 && segments[0] == "pedido" && SHORT_ID.matches(segments[1]) -> {
                DeepLinkTarget.Order(segments[1].uppercase())
            }

            else -> {
                DeepLinkTarget.Home
            }
        }
    }
}
