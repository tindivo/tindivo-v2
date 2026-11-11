package com.tindivo.customer.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.AccountMismatchException
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/** Cómo terminó la pantalla: [Saved] avisa a quien la abrió que recargue; [Left] solo vuelve atrás. */
internal enum class ProfileOutcome { Saved, Left }

/** Un guardado que no salió y que se puede reintentar sin perder lo escrito. */
internal enum class ProfileSaveError { Network, Generic }

internal data class ProfileUiState(
    val name: String = "",
    /** La persona ya escribió algo: desde ahí un campo vacío se marca como error. */
    val touched: Boolean = false,
    val saving: Boolean = false,
    /** El servidor rechazó el nombre (422) aunque aquí pasara. */
    val rejected: Boolean = false,
    val saveError: ProfileSaveError? = null,
    val outcome: ProfileOutcome? = null,
) {
    val problem: NameProblem? get() = nameProblem(name)

    /** El mensaje bajo el campo. Una sola letra mientras se escribe no se marca: solo deja «Continuar» apagado. */
    val nameError: Boolean
        get() =
            rejected || problem == NameProblem.InvalidCharacters || problem == NameProblem.TooLong ||
                (touched && cleanName(name).isEmpty())

    val canSave: Boolean get() = problem == null && !saving && outcome == null

    /** El nombre es un dato personal: no sale en un log. */
    override fun toString(): String =
        "ProfileUiState(name=***, touched=$touched, saving=$saving, rejected=$rejected, saveError=$saveError, " +
            "outcome=$outcome)"
}

/**
 * «Completa tu perfil»: el nombre con el que el negocio y el motorizado llaman al cliente. Como la web al entrar con
 * Google (`saveGoogleName`): primero registra la aceptación de los términos y, solo si salió, guarda el nombre con
 * `PUT /customer/profile`, que crea el perfil.
 *
 * Todo va atado a la cuenta con la que se abrió la pantalla: las dos llamadas salen solo con su token, y un resultado
 * que llega cuando la sesión ya terminó o es de otra cuenta no se publica.
 */
@HiltViewModel
internal class ProfileViewModel
    @Inject
    constructor(
        private val profiles: ProfileGateway,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
        nameHint: GoogleNameHint,
    ) : ViewModel() {
        private val accountId: String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId

        private val _state =
            MutableStateFlow(
                if (accountId == null) {
                    ProfileUiState(outcome = ProfileOutcome.Left)
                } else {
                    ProfileUiState(name = nameHint.take(accountId)?.take(NAME_MAX).orEmpty())
                },
            )
        val state: StateFlow<ProfileUiState> = _state.asStateFlow()

        private var job: Job? = null

        @Volatile private var ended = accountId == null

        // Irreversible: la hoja del checkout se cerró con la pantalla libre; desde ahí no se guarda el nombre.
        private var released = false

        init {
            viewModelScope.launch {
                sessionStore.state.collect { session ->
                    val foreign = session is SessionState.SignedIn && session.userId != accountId
                    if (session is SessionState.SignedOut || foreign) endSession()
                }
            }
        }

        fun onName(value: String) {
            _state.update {
                if (it.saving || it.outcome != null) {
                    it
                } else {
                    it.copy(name = value.take(NAME_MAX), touched = true, rejected = false, saveError = null)
                }
            }
        }

        /** Términos y luego el nombre. Con un guardado en curso no hace nada: un doble toque manda una sola vez. */
        fun save() {
            val current = _state.value
            if (!current.canSave || job?.isActive == true || released) return
            val account = accountId ?: return endSession()
            val name = cleanName(current.name)
            _state.update { it.copy(saving = true, rejected = false, saveError = null) }
            job =
                viewModelScope.launch {
                    val terms = profiles.acceptTerms(TERMS_VERSION, account)
                    if (terms is ApiResult.Failure) return@launch onFailure(terms.error, account)
                    if (!isCurrent(account)) return@launch endSession()
                    when (val saved = profiles.saveName(name, account)) {
                        is ApiResult.Success -> {
                            if (isCurrent(account)) {
                                settle { it.copy(saving = false, outcome = ProfileOutcome.Saved) }
                            } else {
                                endSession()
                            }
                        }

                        is ApiResult.Failure -> {
                            onFailure(saved.error, account)
                        }
                    }
                }
        }

        /**
         * La hoja del checkout se cerró: el nombre escrito (dato personal) no se queda en memoria mientras el checkout
         * siga abierto. Cancela el guardado en vuelo de esta apertura, que ya no publica nada; no cierra la sesión ni
         * llama al servidor. Conserva [ProfileUiState.outcome]: lo que ya terminó no se reabre.
         */
        fun discardInput() {
            job?.cancel()
            _state.update { ProfileUiState(outcome = it.outcome) }
        }

        /**
         * La hoja del checkout pide cerrarse (ya escondida, o con su «Cancelar»): se cierra solo si no hay un guardado
         * en curso, leído ahora en el estado y no en la última recomposición de la hoja. Si se cierra, esta apertura ya
         * no empieza ninguna llamada: un toque que llegue tarde no manda nada cuyo resultado ya no llegaría al checkout
         * (CAX-005). Devuelve si se puede cerrar.
         */
        fun closeIfIdle(): Boolean {
            if (_state.value.saving) return false
            released = true
            return true
        }

        /** Sigue siendo la cuenta de la pantalla: no terminó Y la sesión vigente, leída ahora, es la de [account]. */
        private fun isCurrent(account: String) =
            !ended && (sessionStore.state.value as? SessionState.SignedIn)?.userId == account

        private suspend fun onFailure(
            error: AppError,
            account: String,
        ) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            when {
                // La sesión ya es de otra cuenta: no salió nada. Se cierra la pantalla sin tocar la sesión nueva.
                error is AppError.Network && error.cause is AccountMismatchException -> {
                    endSession()
                }

                error.isUnauthorized() -> {
                    // Pasó por el refresco y el servidor sigue sin reconocer la sesión: se cierra, si aún es la suya
                    // (comprobado y cerrado de una vez en el almacén: un 401 de A no cierra la sesión de B).
                    withContext(NonCancellable) { sessionStore.signOutIf(account) }
                    endSession()
                }

                error.isValidation() -> {
                    settle { it.copy(saving = false, rejected = true) }
                }

                error is AppError.Network -> {
                    settle { it.copy(saving = false, saveError = ProfileSaveError.Network) }
                }

                error is AppError.UpgradeRequired -> {
                    settle { it.copy(saving = false) }
                }

                else -> {
                    settle { it.copy(saving = false, saveError = ProfileSaveError.Generic) }
                }
            }
        }

        /** Lo que llega tras cerrar la pantalla, o de un guardado cancelado al cerrar la hoja, no se publica. */
        private suspend fun settle(change: (ProfileUiState) -> ProfileUiState) {
            if (!currentCoroutineContext().isActive) return
            _state.update { if (it.outcome != null || ended) it else change(it) }
        }

        /** La sesión de esta pantalla terminó (cierre o cambio de cuenta): no se publica nada más y se vuelve atrás. */
        private fun endSession() {
            ended = true
            job?.cancel()
            _state.update {
                if (it.outcome == ProfileOutcome.Saved) it else it.copy(saving = false, outcome = ProfileOutcome.Left)
            }
        }
    }

private fun AppError.isUnauthorized(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.Unauthorized || status == HTTP_UNAUTHORIZED)

private fun AppError.isValidation(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.ValidationError || status == HTTP_UNPROCESSABLE)

private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_UNPROCESSABLE = 422
