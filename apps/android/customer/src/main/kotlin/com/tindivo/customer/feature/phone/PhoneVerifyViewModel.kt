package com.tindivo.customer.feature.phone

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.PhoneRepository
import com.tindivo.core.network.TransferOffer
import com.tindivo.core.network.generated.model.SendPhoneCodeRequest
import com.tindivo.core.network.generated.model.TransferCustomerPhoneRequest
import com.tindivo.core.network.generated.model.VerifyPhoneCodeRequest
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SessionWatch
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Clock
import java.time.Instant
import javax.inject.Inject

internal const val PHONE_LENGTH = 9
internal const val CODE_LENGTH = 6
internal const val RESEND_SECONDS = 60L
private const val TICK_MILLIS = 1_000L
private const val MILLIS_PER_SECOND = 1_000L
private const val HTTP_UNAUTHORIZED = 401

internal enum class PhoneStep { Number, Code, Done }

/** Lo que la pantalla le dice a la persona cuando algo no sale. */
internal sealed interface PhoneError {
    /** Texto en español del servidor (`detail` o el mensaje del campo): se muestra tal cual. */
    data class Server(
        val text: String,
    ) : PhoneError

    data object InvalidNumber : PhoneError

    data object InvalidCode : PhoneError

    /** El permiso de traslado ya venció según el reloj del teléfono: hay que pedir un código nuevo. */
    data object ChallengeExpired : PhoneError

    data object Network : PhoneError

    data object Generic : PhoneError
}

/**
 * [code] y [transfer] son secretos de corta vida: viven solo aquí, nunca en `SavedStateHandle` ni en disco, y
 * [toString] no los deja salir a un log.
 */
internal data class PhoneUiState(
    val step: PhoneStep = PhoneStep.Number,
    val phone: String = "",
    val code: String = "",
    val sending: Boolean = false,
    val error: PhoneError? = null,
    val transfer: TransferOffer? = null,
    val resendSeconds: Int = 0,
    val verifiedPhone: String? = null,
    val loggedOut: Boolean = false,
) {
    override fun toString(): String = "PhoneUiState(step=$step, sending=$sending, loggedOut=$loggedOut)"
}

/**
 * Verificar el teléfono por SMS (D-22) y trasladarlo si está en otra cuenta (D-63). Ningún POST se repite solo: cada
 * llamada sale de un toque, y con una en curso los toques siguientes no hacen nada. Al cerrarse la sesión se cancela
 * lo que haya en vuelo, se borra el estado (código y permiso de traslado incluidos) y no se vuelve a llamar.
 */
@HiltViewModel
internal class PhoneVerifyViewModel
    @Inject
    constructor(
        private val phones: PhoneRepository,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
        private val clock: Clock,
    ) : ViewModel() {
        private val _state = MutableStateFlow(PhoneUiState())
        val state: StateFlow<PhoneUiState> = _state.asStateFlow()

        private var work: Job? = null
        private var ticker: Job? = null
        private var resendAt: Instant = Instant.EPOCH

        init {
            val watch = SessionWatch()
            viewModelScope.launch { sessionStore.state.collect { if (watch.ended(it)) endSession() } }
        }

        fun onPhoneChanged(text: String) {
            if (_state.value.step != PhoneStep.Number) return
            _state.update { if (it.loggedOut) it else it.copy(phone = text.digitsOnly(PHONE_LENGTH), error = null) }
        }

        fun onCodeChanged(text: String) {
            if (_state.value.step != PhoneStep.Code) return
            _state.update { if (it.loggedOut) it else it.copy(code = text.digitsOnly(CODE_LENGTH), error = null) }
        }

        /** «Enviar código» (primer envío). */
        fun sendCode() {
            val phone = _state.value.phone
            if (!phone.matches(PERU_MOBILE)) {
                fail(PhoneError.InvalidNumber)
                return
            }
            launchCall { sendAndAdvance(phone) }
        }

        /** «Reenviar código»: solo cuando pasaron los 60 s. */
        fun resend() {
            val current = _state.value
            if (current.step != PhoneStep.Code || clock.instant().isBefore(resendAt)) return
            launchCall { sendAndAdvance(current.phone) }
        }

        fun verify() {
            val current = _state.value
            if (current.step != PhoneStep.Code) return
            if (current.code.length != CODE_LENGTH) {
                fail(PhoneError.InvalidCode)
                return
            }
            launchCall {
                when (val result = phones.verify(VerifyPhoneCodeRequest(phone = current.phone, code = current.code))) {
                    is ApiResult.Success -> finish(result.data.phone)
                    is ApiResult.Failure -> onFailure(result.error, offersTransfer = true)
                }
            }
        }

        /** «Usar en esta cuenta». Si el permiso ya venció, no se llama: se pide un código nuevo. */
        fun confirmTransfer() {
            val offer = _state.value.transfer ?: return
            if (!offer.expiresAt.isAfter(clock.instant())) {
                if (!_state.value.sending) {
                    _state.update {
                        if (it.loggedOut) {
                            it
                        } else {
                            it.copy(transfer = null, code = "", error = PhoneError.ChallengeExpired)
                        }
                    }
                }
                return
            }
            launchCall {
                when (val result = phones.transfer(TransferCustomerPhoneRequest(challengeId = offer.challengeId))) {
                    is ApiResult.Success -> finish(result.data.phone)
                    is ApiResult.Failure -> onFailure(result.error, offersTransfer = false)
                }
            }
        }

        /** «Cancelar» en el diálogo de traslado: el permiso se olvida. */
        fun dismissTransfer() {
            if (_state.value.sending) return
            _state.update { it.copy(transfer = null, code = "") }
        }

        /** «Cambiar número»: vuelve a la pantalla del número y olvida código y permiso. */
        fun changeNumber() {
            if (_state.value.sending) return
            ticker?.cancel()
            resendAt = Instant.EPOCH
            _state.update { PhoneUiState(phone = it.phone) }
        }

        private suspend fun sendAndAdvance(phone: String) {
            when (val result = phones.sendCode(SendPhoneCodeRequest(phone = phone))) {
                is ApiResult.Success -> {
                    if (result.data.verified == true) {
                        // Simulacro local: el número ya quedó verificado y no hay código que pedir.
                        finish("$PREFIX$phone")
                    } else {
                        settle { it.copy(step = PhoneStep.Code, code = "", transfer = null) }
                        startCountdown()
                    }
                }

                is ApiResult.Failure -> {
                    onFailure(result.error, offersTransfer = true)
                }
            }
        }

        private fun finish(phone: String) {
            ticker?.cancel()
            settle {
                PhoneUiState(step = PhoneStep.Done, phone = it.phone, verifiedPhone = phone)
            }
        }

        private fun startCountdown() {
            resendAt = clock.instant().plusSeconds(RESEND_SECONDS)
            ticker?.cancel()
            ticker =
                viewModelScope.launch {
                    // Acotado: aunque el reloj no avance (en las pruebas), termina tras el plazo de reenvío.
                    repeat(RESEND_SECONDS.toInt() + 1) {
                        val left = secondsLeft()
                        _state.update { if (it.loggedOut) it else it.copy(resendSeconds = left) }
                        if (left <= 0) return@launch
                        delay(TICK_MILLIS)
                    }
                    _state.update { if (it.loggedOut) it else it.copy(resendSeconds = 0) }
                }
        }

        private fun secondsLeft(): Int {
            val millis = resendAt.toEpochMilli() - clock.millis()
            return if (millis <= 0) 0 else ((millis + MILLIS_PER_SECOND - 1) / MILLIS_PER_SECOND).toInt()
        }

        /** Una sola llamada a la vez: con otra en curso, o con la sesión cerrada, el toque no hace nada. */
        private fun launchCall(block: suspend () -> Unit) {
            val current = _state.value
            if (current.sending || current.loggedOut) return
            _state.update { it.copy(sending = true, error = null) }
            work = viewModelScope.launch { block() }
        }

        private suspend fun onFailure(
            error: AppError,
            offersTransfer: Boolean,
        ) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (error.isUnauthorized()) {
                // El servidor no reconoce la sesión: se cierra aquí también. El cierre cancela esta misma llamada.
                withContext(NonCancellable) { sessionStore.signOut() }
                endSession()
                return
            }
            val offer = if (offersTransfer) (error as? AppError.Known)?.takeIf { it.isConflict() }?.transfer else null
            settle { it.copy(error = if (offer == null) error.toPhoneError() else null, transfer = offer) }
        }

        /** Un error de validación local; con la sesión cerrada no toca el estado. */
        private fun fail(error: PhoneError) {
            _state.update { if (it.loggedOut) it else it.copy(error = error) }
        }

        /** Lo que llega después de cerrar la sesión no se publica. */
        private fun settle(next: (PhoneUiState) -> PhoneUiState) {
            _state.update { if (it.loggedOut) it else next(it).copy(sending = false) }
        }

        private fun endSession() {
            work?.cancel()
            ticker?.cancel()
            resendAt = Instant.EPOCH
            _state.value = PhoneUiState(loggedOut = true)
        }
    }

private val PERU_MOBILE = Regex("^9[0-9]{8}$")
private const val PREFIX = "+51"

private fun String.digitsOnly(max: Int): String = filter { it in '0'..'9' }.take(max)

private fun AppError.isUnauthorized(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.Unauthorized || status == HTTP_UNAUTHORIZED)

private fun AppError.Known.isConflict(): Boolean = code == ApiErrorCode.Conflict

/** El 409 (sin permiso de traslado), el 429 y el 422 traen un texto del servidor pensado para el cliente. */
private fun AppError.toPhoneError(): PhoneError =
    when (this) {
        is AppError.Network -> {
            PhoneError.Network
        }

        is AppError.Known -> {
            val text =
                when (code) {
                    ApiErrorCode.Conflict, ApiErrorCode.RateLimited -> detail
                    ApiErrorCode.ValidationError -> fieldMessage ?: detail
                    else -> null
                }
            text?.takeIf { it.isNotBlank() }?.let(PhoneError::Server) ?: PhoneError.Generic
        }

        else -> {
            PhoneError.Generic
        }
    }
