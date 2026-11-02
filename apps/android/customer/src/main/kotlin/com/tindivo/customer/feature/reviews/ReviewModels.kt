package com.tindivo.customer.feature.reviews

import com.tindivo.core.network.generated.model.GetCustomerPendingReview200ResponseData
import java.util.UUID

/** El largo máximo del comentario en pantalla (el de la web). El servidor admite más; aquí se pide menos. */
internal const val MAX_REVIEW_COMMENT = 400

internal const val MIN_RATING = 1
internal const val MAX_RATING = 5

internal data class ReviewTagUi(
    val id: String,
    val label: String,
)

/** El pedido por el que se pregunta «¿cómo estuvo?». */
internal data class PendingReviewUi(
    val orderId: UUID,
    val businessName: String,
    val tags: List<ReviewTagUi>,
)

/** Qué hoja se ve: ninguna, la pregunta de las cinco estrellas o el detalle con comentario. */
internal enum class ReviewStep { Hidden, Prompt, Form }

/** Lo que falló al enviar. [detail] es el del servidor, si lo explicó; si no, la pantalla dice el texto genérico. */
internal data class ReviewSubmitError(
    val detail: String?,
)

internal data class ReviewUiState(
    val pending: PendingReviewUi? = null,
    val step: ReviewStep = ReviewStep.Hidden,
    val rating: Int = 0,
    val selectedTags: Set<String> = emptySet(),
    val comment: String = "",
    val submitting: Boolean = false,
    val error: ReviewSubmitError? = null,
) {
    val canSubmit: Boolean get() = pending != null && !submitting && rating in MIN_RATING..MAX_RATING
}

internal fun GetCustomerPendingReview200ResponseData.toUi() =
    PendingReviewUi(
        orderId = orderId,
        businessName = businessName,
        tags = tags.map { ReviewTagUi(it.id, it.label) },
    )

/** Lo que hacen las hojas; las pantallas lo cablean al [ReviewViewModel]. */
internal class ReviewActions(
    val onRating: (Int) -> Unit,
    val onTag: (String) -> Unit,
    val onComment: (String) -> Unit,
    val onSubmit: () -> Unit,
    val onDismiss: () -> Unit,
)
