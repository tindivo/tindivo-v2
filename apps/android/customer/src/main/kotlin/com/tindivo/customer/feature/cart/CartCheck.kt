package com.tindivo.customer.feature.cart

/** Por qué una línea ya no vale frente a la carta vigente (CUS-CRT-005). */
enum class LineIssue {
    /** El plato ya no está en la carta. */
    Removed,

    /** Agotado por ahora. */
    Unavailable,

    /** Existe, pero hoy no se sirve a esta hora. */
    OutOfWindow,

    /** El precio del plato o el de una opción cambió. */
    PriceChanged,

    /** Una opción elegida ya no existe en el plato. */
    OptionRemoved,

    /** Las opciones elegidas ya no cumplen las reglas de sus grupos. */
    InvalidSelection,
}

/**
 * Lo que se sabe de la bolsa frente a la carta del negocio. Vive solo mientras la pantalla está abierta: no se guarda
 * y se repite cada vez que se abre la bolsa (CUS-CRT-005).
 */
sealed interface CartCheck {
    /** Esperando la respuesta de la carta. */
    data object Checking : CartCheck

    /** No se pudo leer la carta (red, servidor, datos rotos). */
    data object Failed : CartCheck

    /**
     * La carta respondió. [issues] va por firma de línea; una línea sin entrada es válida. [etaMin] y [etaMax] son el
     * plazo de entrega que informa el negocio, si lo informa.
     */
    data class Done(
        val closed: Boolean,
        val issues: Map<String, List<LineIssue>>,
        val etaMin: Int? = null,
        val etaMax: Int? = null,
        /** Los platos de la carta que tienen grupos de opciones (en minúsculas): los que se pueden editar. */
        val customizable: Set<String> = emptySet(),
    ) : CartCheck
}

/** Por qué «Continuar» no se puede tocar; la pantalla lo traduce a texto. */
enum class ContinueBlock {
    Checking,
    CheckFailed,
    Closed,
    InvalidLines,
}

/** «Continuar» con la píldora del total: el mismo texto que el subtotal (CUS-CRT-015). [blocked] `null` = se puede. */
data class ContinueUi(
    val amount: String,
    val blocked: ContinueBlock? = null,
)

/** El motivo, en el orden en que la persona lo puede resolver: esperar, reintentar, volver más tarde, quitar líneas. */
internal fun continueFor(
    amount: String,
    check: CartCheck,
    signatures: Collection<String>,
): ContinueUi =
    ContinueUi(
        amount = amount,
        blocked =
            when (check) {
                CartCheck.Checking -> {
                    ContinueBlock.Checking
                }

                CartCheck.Failed -> {
                    ContinueBlock.CheckFailed
                }

                is CartCheck.Done -> {
                    when {
                        check.closed -> ContinueBlock.Closed
                        signatures.any { check.issues[it].orEmpty().isNotEmpty() } -> ContinueBlock.InvalidLines
                        else -> null
                    }
                }
            },
    )
