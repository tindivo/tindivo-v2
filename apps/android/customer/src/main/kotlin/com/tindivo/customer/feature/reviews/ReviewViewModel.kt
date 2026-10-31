package com.tindivo.customer.feature.reviews

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.ReviewRepository
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * La reseña tras la entrega. Con sesión consulta el pedido pendiente (uno solo); sin sesión no consulta nada. Quien
 * quiera la pregunta emergente (el inicio) llama a [enableAutoPrompt]; quien solo ofrece «Calificar» (el detalle de un
 * pedido) lee [ReviewUiState.pending] y llama a [openForm]. Un fallo al consultar se calla: la reseña nunca estorba.
 */
@HiltViewModel
internal class ReviewViewModel
    @Inject
    constructor(
        private val reviews: ReviewRepository,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(ReviewUiState())
        val state: StateFlow<ReviewUiState> = mutableState.asStateFlow()

        private var autoPrompt = false

        /** La pregunta emergente sale una sola vez por ViewModel, aunque se descarte o se vuelva a la pantalla. */
        private var promptShown = false
        private var loadedFor: String? = null

        /** El envío en curso: si la cuenta cambia o se cierra, se cancela y su resultado no se publica. */
        private var submitJob: Job? = null

        init {
            viewModelScope.launch { sessionStore.state.collect(::onSession) }
        }

        /** Pide que, si hay un pendiente, salga la pregunta de las cinco estrellas (el inicio). */
        fun enableAutoPrompt() {
            autoPrompt = true
            showPromptIfDue()
        }

        /** Abre el detalle sin nota puesta (el botón «Calificar» del pedido). */
        fun openForm() {
            mutableState.update {
                if (it.pending == null || it.submitting) it else it.copy(step = ReviewStep.Form, error = null)
            }
        }

        /** Cambia la nota. Tocar una estrella de la pregunta ya es la respuesta: abre el detalle con la nota puesta. */
        fun onRating(rating: Int) {
            if (rating !in MIN_RATING..MAX_RATING) return
            mutableState.update {
                when {
                    it.submitting -> it
                    it.step == ReviewStep.Prompt -> it.copy(step = ReviewStep.Form, rating = rating, error = null)
                    else -> it.copy(rating = rating)
                }
            }
        }

        fun onTag(id: String) {
            mutableState.update {
                if (it.submitting) it else it.copy(selectedTags = it.selectedTags.toggle(id))
            }
        }

        fun onComment(text: String) {
            mutableState.update { if (it.submitting) it else it.copy(comment = text.take(MAX_REVIEW_COMMENT)) }
        }

        /** Manda la reseña. Un segundo toque mientras envía no hace nada. */
        fun submit() {
            val current = mutableState.value
            val pending = current.pending
            if (pending == null || !current.canSubmit) return
            // `submitting` se fija antes de lanzar nada: un doble toque ve ya el estado nuevo.
            mutableState.update { it.copy(submitting = true, error = null) }
            submitJob = viewModelScope.launch {
                val result =
                    reviews.create(
                        orderId = pending.orderId,
                        rating = current.rating,
                        tags = pending.tags.map { it.id }.filter { it in current.selectedTags },
                        comment = current.comment.trim().ifEmpty { null },
                    )
                ensureActive()
                when (result) {
                    is ApiResult.Success -> {
                        mutableState.value = ReviewUiState()
                    }

                    is ApiResult.Failure -> {
                        configService.reportUpgrade(result.error)
                        val error = ReviewSubmitError(result.error.detail())
                        mutableState.update { it.copy(submitting = false, error = error) }
                    }
                }
            }
        }

        /**
         * «Ahora no» o cerrar: la hoja se va al instante y el aviso al servidor sale detrás; si falla, se ignora. El
         * pedido se queda como pendiente para que el detalle aún pueda ofrecer «Calificar».
         */
        fun dismiss() {
            val current = mutableState.value
            if (current.submitting || current.step == ReviewStep.Hidden) return
            val pending = current.pending
            mutableState.update {
                it.copy(step = ReviewStep.Hidden, rating = 0, selectedTags = emptySet(), comment = "", error = null)
            }
            if (pending != null) viewModelScope.launch { reviews.dismiss(pending.orderId) }
        }

        private suspend fun onSession(session: SessionState) {
            when (session) {
                is SessionState.SignedIn -> {
                    if (loadedFor != session.userId) {
                        // De una cuenta a otra sin pasar por la salida: lo de la anterior no se queda ni se publica.
                        if (loadedFor != null) clearAccountState()
                        loadedFor = session.userId
                        load()
                    }
                }

                SessionState.SignedOut -> {
                    // Lo de la cuenta que salió no se queda en pantalla.
                    loadedFor = null
                    clearAccountState()
                }

                SessionState.Unknown -> {
                    Unit
                }
            }
        }

        private fun clearAccountState() {
            submitJob?.cancel()
            submitJob = null
            promptShown = false
            mutableState.value = ReviewUiState()
        }

        private suspend fun load() {
            when (val result = reviews.pending()) {
                is ApiResult.Success -> {
                    val pending = result.data?.toUi()
                    mutableState.update { it.copy(pending = pending) }
                    showPromptIfDue()
                }

                is ApiResult.Failure -> {
                    configService.reportUpgrade(result.error)
                }
            }
        }

        private fun showPromptIfDue() {
            val current = mutableState.value
            if (!autoPrompt || promptShown) return
            if (current.pending == null || current.step != ReviewStep.Hidden) return
            promptShown = true
            mutableState.value = current.copy(step = ReviewStep.Prompt)
        }
    }

private fun ConfigService.reportUpgrade(error: AppError) {
    if (error is AppError.UpgradeRequired) reportUpgradeRequired(error.minVersion)
}

private fun Set<String>.toggle(id: String): Set<String> = if (id in this) this - id else this + id

/** Solo lo que el servidor explicó con un código del contrato; el detalle de una lectura fallida es técnico. */
private fun AppError.detail(): String? = (this as? AppError.Known)?.detail
