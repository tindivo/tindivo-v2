package com.tindivo.customer.push

/**
 * El aviso que manda `send-push` a la app (payload v1, `packages/contracts/src/native-push.ts`). En FCM llega en `data`,
 * todo como texto; al tocar un aviso que pintó el sistema (app en segundo plano), esas mismas claves llegan como extras
 * del intent. Por eso se decodifica desde un `Map<String, String>`.
 */
data class NativePushPayload(
    val type: String,
    val tag: String,
    val title: String,
    val body: String,
    val deepLink: String,
) {
    /** Las claves de `data`, para devolverlas tal cual en el intent del aviso que pinta la app. */
    fun toData(): Map<String, String> =
        mapOf(
            KEY_V to SUPPORTED_VERSION,
            KEY_TYPE to type,
            KEY_TAG to tag,
            KEY_TITLE to title,
            KEY_BODY to body,
            KEY_DEEP_LINK to deepLink,
        )

    companion object {
        const val SUPPORTED_VERSION = "1"
        const val KEY_V = "v"
        const val KEY_TYPE = "type"
        const val KEY_TAG = "tag"
        const val KEY_TITLE = "title"
        const val KEY_BODY = "body"
        const val KEY_DEEP_LINK = "deepLink"

        /** Las mismas cotas del esquema Zod del contrato. */
        private const val MAX_TYPE = 64
        private const val MAX_TAG = 256
        private const val MAX_TITLE = 256
        private const val MAX_BODY = 1024
        private const val MAX_DEEP_LINK = 512

        /**
         * Lee el payload v1. Devuelve `null` (el aviso se descarta, no se muestra) si la versión no es la 1, si falta un
         * campo o se pasa de su cota, si el título está vacío o si [deepLink] no es una ruta relativa de la app: tiene que
         * empezar con `/`, no con `//`, y no puede llevar `\` ni espacios (nada que un intérprete de URL pueda leer
         * como un host).
         */
        fun decode(data: Map<String, String>): NativePushPayload? {
            if (data[KEY_V] != SUPPORTED_VERSION) return null
            val type = data[KEY_TYPE]?.takeIf { it.isNotEmpty() && it.length <= MAX_TYPE }
            val tag = data[KEY_TAG]?.takeIf { it.isNotEmpty() && it.length <= MAX_TAG }
            val title = data[KEY_TITLE]?.takeIf { it.isNotBlank() && it.length <= MAX_TITLE }
            val body = data[KEY_BODY]?.takeIf { it.length <= MAX_BODY }
            val deepLink = data[KEY_DEEP_LINK]?.takeIf(::isAppPath)
            if (type == null || tag == null || title == null || body == null || deepLink == null) return null
            return NativePushPayload(type = type, tag = tag, title = title, body = body, deepLink = deepLink)
        }

        private fun isAppPath(path: String): Boolean =
            path.length <= MAX_DEEP_LINK &&
                path.startsWith("/") &&
                !path.startsWith("//") &&
                path.none { it == '\\' || it.isWhitespace() || it.isISOControl() }
    }
}
