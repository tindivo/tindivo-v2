package com.tindivo.customer.push

/**
 * El aviso que manda `send-push` a la app (payload v1, `packages/contracts/src/native-push.ts`). Al cliente le llega
 * solo-datos (sin bloque `notification`): siempre pasa por `PushService.onMessageReceived`, en `data` y todo como texto.
 * Por eso se decodifica desde un `Map<String, String>`.
 *
 * [tag] identifica el aviso (el tipo de evento y lo que lo distingue, invariante 5) y es su identidad en la bandeja: uno
 * con el mismo tag reemplaza al anterior. [install] es el `installId` de la instalación destinataria: la puerta
 * ([PushPresenter.onPush]) descarta el aviso que no es de la instalación vigente.
 */
data class NativePushPayload(
    val type: String,
    val tag: String,
    val title: String,
    val body: String,
    val deepLink: String,
    val install: String? = null,
) {
    /**
     * Lo ÚNICO que viaja en el `Intent` de la notificación: la versión y la ruta (`/pedido/<sid>`, `/entregas/<sid>`).
     * Ni el título ni el cuerpo —que llevan nombres— salen de la notificación (CAX-006).
     */
    fun routeExtras(): Map<String, String> = mapOf(KEY_V to SUPPORTED_VERSION, KEY_DEEP_LINK to deepLink)

    companion object {
        const val SUPPORTED_VERSION = "1"
        const val KEY_V = "v"
        const val KEY_TYPE = "type"
        const val KEY_TAG = "tag"
        const val KEY_TITLE = "title"
        const val KEY_BODY = "body"
        const val KEY_DEEP_LINK = "deepLink"
        const val KEY_INSTALL = "install"

        /** Las mismas cotas del esquema Zod del contrato. El tipo es opaco (API-3, CAX-012): de 1 a 64 caracteres. */
        private const val MAX_TYPE = 64
        private const val MAX_TAG = 256
        private const val MAX_TITLE = 256
        private const val MAX_BODY = 1024
        private const val MAX_DEEP_LINK = 512
        private const val MIN_INSTALL = 8
        private const val MAX_INSTALL = 64

        /**
         * Lee el payload v1. Devuelve `null` (el aviso se descarta, no se muestra) si la versión no es la 1, si falta un
         * campo o se pasa de su cota, si el título está vacío o si [deepLink] no es una ruta relativa de la app: tiene
         * que empezar con `/`, no con `//`, y no puede llevar `\` ni espacios (nada que un intérprete de URL pueda leer
         * como un host). Un [install] fuera de sus cotas se ignora: el aviso queda sin instalación y la puerta lo descarta.
         */
        fun decode(data: Map<String, String>): NativePushPayload? {
            val type = data[KEY_TYPE]?.takeIf { it.length in 1..MAX_TYPE }
            val tag = data[KEY_TAG]?.takeIf { it.isNotEmpty() && it.length <= MAX_TAG }
            val title = data[KEY_TITLE]?.takeIf { it.isNotBlank() && it.length <= MAX_TITLE }
            val body = data[KEY_BODY]?.takeIf { it.length <= MAX_BODY }
            val deepLink = data[KEY_DEEP_LINK]?.takeIf(::isAppPath)
            if (data[KEY_V] != SUPPORTED_VERSION) return null
            if (type == null || tag == null || title == null || body == null || deepLink == null) return null
            return NativePushPayload(
                type = type,
                tag = tag,
                title = title,
                body = body,
                deepLink = deepLink,
                install = data[KEY_INSTALL]?.takeIf { it.length in MIN_INSTALL..MAX_INSTALL },
            )
        }

        /**
         * La ruta a la que lleva un aviso TOCADO, desde los extras con que se abrió la app (los de [routeExtras]). Solo
         * se mira la versión y la ruta: nada más hace falta para navegar. `null` si no es la versión 1 o la ruta no es
         * relativa y limpia (ver [decode]).
         */
        fun decodeRoute(extras: Map<String, String>): String? {
            if (extras[KEY_V] != SUPPORTED_VERSION) return null
            return extras[KEY_DEEP_LINK]?.takeIf(::isAppPath)
        }

        private fun isAppPath(path: String): Boolean =
            path.length <= MAX_DEEP_LINK &&
                path.startsWith("/") &&
                !path.startsWith("//") &&
                path.none { it == '\\' || it.isWhitespace() || it.isISOControl() }
    }
}
