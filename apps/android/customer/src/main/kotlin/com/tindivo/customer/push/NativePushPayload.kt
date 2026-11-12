package com.tindivo.customer.push

/**
 * El aviso que manda `send-push` a la app (payload v1, `packages/contracts/src/native-push.ts`). En FCM llega en `data`,
 * todo como texto; al tocar un aviso, esas mismas claves llegan como extras del intent. Por eso se decodifica desde un
 * `Map<String, String>`.
 *
 * [tag] identifica el EVENTO (`${event_type}-${shortId}`, invariante 5). [group] es la llave de PRESENTACIÓN: todos los
 * avisos de un mismo pedido o entrega la comparten (`order-<shortId>`, `courier-<shortId>`), así cada uno reemplaza al
 * anterior en la bandeja. Es opcional en el contrato (aditivo): un aviso sin ella usa [tag].
 *
 * [progress] y [terminal] (opcionales, aditivos) son el seguimiento: en qué paso va el pedido y si ya terminó. Con un
 * paso y sin terminar, la notificación es fija y lleva barra de progreso (ver [lookFor]).
 */
data class NativePushPayload(
    val type: String,
    val tag: String,
    val title: String,
    val body: String,
    val deepLink: String,
    val group: String = tag,
    val progress: TrackingProgress? = null,
    val terminal: Boolean = false,
) {
    /** Las claves de `data`, para devolverlas tal cual en el intent del aviso que pinta la app. */
    fun toData(): Map<String, String> =
        buildMap {
            put(KEY_V, SUPPORTED_VERSION)
            put(KEY_TYPE, type)
            put(KEY_TAG, tag)
            put(KEY_GROUP, group)
            put(KEY_TITLE, title)
            put(KEY_BODY, body)
            put(KEY_DEEP_LINK, deepLink)
            progress?.let {
                put(KEY_STEP, it.step.toString())
                put(KEY_STEPS, it.steps.toString())
            }
            if (terminal) put(KEY_TERMINAL, TERMINAL_YES)
        }

    companion object {
        const val SUPPORTED_VERSION = "1"
        const val KEY_V = "v"
        const val KEY_TYPE = "type"
        const val KEY_TAG = "tag"
        const val KEY_GROUP = "group"
        const val KEY_TITLE = "title"
        const val KEY_BODY = "body"
        const val KEY_DEEP_LINK = "deepLink"
        const val KEY_STEP = "step"
        const val KEY_STEPS = "steps"
        const val KEY_TERMINAL = "terminal"
        private const val TERMINAL_YES = "1"

        /** Las mismas cotas del esquema Zod del contrato. */
        private const val MAX_TYPE = 64
        private const val MAX_TAG = 256
        private const val MAX_GROUP = 256
        private const val MAX_TITLE = 256
        private const val MAX_BODY = 1024
        private const val MAX_DEEP_LINK = 512

        /** Un paso es un entero positivo sin ceros a la izquierda y de hasta dos cifras, como en el contrato. */
        private val STEP_TEXT = Regex("[1-9][0-9]?")

        /**
         * Lee el payload v1. Devuelve `null` (el aviso se descarta, no se muestra) si la versión no es la 1, si falta un
         * campo o se pasa de su cota, si el título está vacío o si [deepLink] no es una ruta relativa de la app: tiene que
         * empezar con `/`, no con `//`, y no puede llevar `\` ni espacios (nada que un intérprete de URL pueda leer
         * como un host). [group] es opcional: si falta vale [tag]; si viene vacío o pasado de su cota no cumple el
         * contrato, y el aviso también se descarta.
         *
         * El paso es más tolerante: `step`/`steps` inválidos (0, no numéricos, uno sin el otro, `step > steps`) solo
         * quitan la barra; el aviso se muestra igual. [terminal] solo es `true` con el valor exacto `"1"`.
         */
        fun decode(data: Map<String, String>): NativePushPayload? {
            if (data[KEY_V] != SUPPORTED_VERSION) return null
            val type = data[KEY_TYPE]?.takeIf { it.isNotEmpty() && it.length <= MAX_TYPE }
            val tag = data[KEY_TAG]?.takeIf { it.isNotEmpty() && it.length <= MAX_TAG }
            val title = data[KEY_TITLE]?.takeIf { it.isNotBlank() && it.length <= MAX_TITLE }
            val body = data[KEY_BODY]?.takeIf { it.length <= MAX_BODY }
            val deepLink = data[KEY_DEEP_LINK]?.takeIf(::isAppPath)
            val group = data[KEY_GROUP]
            if (group != null && (group.isEmpty() || group.length > MAX_GROUP)) return null
            if (type == null || tag == null || title == null || body == null || deepLink == null) return null
            return NativePushPayload(
                type = type,
                tag = tag,
                title = title,
                body = body,
                deepLink = deepLink,
                group = group ?: tag,
                progress = progressOf(data[KEY_STEP], data[KEY_STEPS]),
                terminal = data[KEY_TERMINAL] == TERMINAL_YES,
            )
        }

        private fun progressOf(
            step: String?,
            steps: String?,
        ): TrackingProgress? {
            if (step == null || steps == null) return null
            if (!STEP_TEXT.matches(step) || !STEP_TEXT.matches(steps)) return null
            return TrackingProgress.of(step.toInt(), steps.toInt())
        }

        private fun isAppPath(path: String): Boolean =
            path.length <= MAX_DEEP_LINK &&
                path.startsWith("/") &&
                !path.startsWith("//") &&
                path.none { it == '\\' || it.isWhitespace() || it.isISOControl() }
    }
}
