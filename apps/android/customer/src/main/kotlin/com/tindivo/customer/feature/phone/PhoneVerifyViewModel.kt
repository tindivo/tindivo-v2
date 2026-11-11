package com.tindivo.customer.feature.phone

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.AccountMismatchException
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.PhoneRepository
import com.tindivo.core.network.TransferOffer
import com.tindivo.core.network.generated.model.SendPhoneCodeRequest
import com.tindivo.core.network.generated.model.TransferCustomerPhoneRequest
import com.tindivo.core.network.generated.model.VerifyPhoneCodeRequest
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
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
 *
 * Todo va atado a la cuenta con la que se abrió la pantalla: cada llamada sale solo con su token (`boundTo` en
 * [PhoneRepository]), así que el número y el código de esa cuenta nunca se verifican ni se trasladan con el token de
 * otra. Un resultado que llega cuando la sesión vigente ya no es esa cuenta no se publica.
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

        /** La cuenta con la que se abrió la pantalla; sin cuenta, la pantalla nace cerrada y no llama. */
        private val accountId: String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId

        private var work: Job? = null
        private var ticker: Job? = null
        private var resendAt: Instant = Instant.EPOCH

        // Irreversible: una vez cerrada la sesión, esta instancia no acepta acciones ni publica resultados.
        private var closed = false

        // Irreversible: la hoja del checkout se cerró con la pantalla libre; desde ahí no sale ninguna llamada.
        private var released = false

        private val acceptsCalls get() = !closed && !released

        init {
            if (accountId == null) endSession()
            viewModelScope.launch {
                sessionStore.state.collect { session ->
                    val foreign = session is SessionState.SignedIn && session.userId != accountId
                    if (session is SessionState.SignedOut || foreign) endSession()
                }
            }
        }

        fun onPhoneChanged(text: String) {
            if (closed || _state.value.step != PhoneStep.Number) return
            _state.update { if (it.loggedOut) it else it.copy(phone = text.digitsOnly(PHONE_LENGTH), error = null) }
        }

        fun onCodeChanged(text: String) {
            if (closed || _state.value.step != PhoneStep.Code) return
            _state.update { if (it.loggedOut) it else it.copy(code = text.digitsOnly(CODE_LENGTH), error = null) }
        }

        /** «Enviar código» (primer envío). */
        fun sendCode() {
            if (closed || _state.value.step != PhoneStep.Number) return
            val phone = _state.value.phone
            if (!phone.matches(PERU_MOBILE)) {
                fail(PhoneError.InvalidNumber)
                return
            }
            launchCall { sendAndAdvance(phone, it) }
        }

        /** «Reenviar código»: solo cuando pasaron los 60 s. */
        fun resend() {
            val current = _state.value
            if (closed || current.step != PhoneStep.Code || clock.instant().isBefore(resendAt)) return
            launchCall { sendAndAdvance(current.phone, it) }
        }

        fun verify() {
            val current = _state.value
            if (closed || current.step != PhoneStep.Code) return
            if (current.code.length != CODE_LENGTH) {
                fail(PhoneError.InvalidCode)
                return
            }
            launchCall { account ->
                val request = VerifyPhoneCodeRequest(phone = current.phone, code = current.code)
                when (val result = phones.verify(request, account)) {
                    is ApiResult.Success -> finish(result.data.phone, account)
                    is ApiResult.Failure -> onFailure(result.error, account, offersTransfer = true)
                }
            }
        }

        /** «Usar en esta cuenta». Si el permiso ya venció, no se llama: se pide un código nuevo. */
        fun confirmTransfer() {
            if (closed) return
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
            launchCall { account ->
                val request = TransferCustomerPhoneRequest(challengeId = offer.challengeId)
                when (val result = phones.transfer(request, account)) {
                    is ApiResult.Success -> finish(result.data.phone, account)
                    is ApiResult.Failure -> onFailure(result.error, account, offersTransfer = false)
                }
            }
        }

        /** «Cancelar» en el diálogo de traslado: el permiso se olvida. */
        fun dismissTransfer() {
            if (closed || _state.value.sending) return
            _state.update { it.copy(transfer = null, code = "") }
        }

        /** «Cambiar número»: vuelve a la pantalla del número y olvida código y permiso. */
        fun changeNumber() {
            if (closed || _state.value.sending) return
            ticker?.cancel()
            resendAt = Instant.EPOCH
            _state.update { PhoneUiState(phone = it.phone) }
        }

        /**
         * La hoja del checkout se cerró: el número, el código, el permiso de traslado y el número verificado no se
         * quedan en memoria mientras el checkout siga abierto. Cancela la llamada en vuelo de esta apertura, que ya no
         * publica nada; no cierra la sesión ni llama al servidor (lo que ya salió, salió). Con la sesión cerrada el
         * estado ya está vacío.
         */
        fun discardInput() {
            if (closed) return
            work?.cancel()
            ticker?.cancel()
            resendAt = Instant.EPOCH
            _state.value = PhoneUiState()
        }

        /**
         * La hoja del checkout pide cerrarse (ya escondida, o con su «Cancelar»): se cierra solo si no hay un envío,
         * una verificación ni un traslado en curso, leído ahora en el estado y no en la última recomposición de la
         * hoja. Si se cierra, esta apertura ya no empieza ninguna llamada: un toque que llegue tarde no manda nada cuyo
         * resultado ya no llegaría al checkout (CAX-005). Devuelve si se puede cerrar.
         */
        fun closeIfIdle(): Boolean {
            if (_state.value.sending) return false
            released = true
            return true
        }

        private suspend fun sendAndAdvance(
            phone: String,
            account: String,
        ) {
            when (val result = phones.sendCode(SendPhoneCodeRequest(phone = phone), account)) {
                is ApiResult.Success -> {
                    if (result.data.verified == true) {
                        // Simulacro local: el número ya quedó verificado y no hay código que pedir.
                        finish("$PREFIX$phone", account)
                    } else if (settle(account) { it.copy(step = PhoneStep.Code, code = "", transfer = null) }) {
                        startCountdown()
                    }
                }

                is ApiResult.Failure -> {
                    onFailure(result.error, account, offersTransfer = true)
                }
            }
        }

        private suspend fun finish(
            phone: String,
            account: String,
        ) {
            if (!isCurrent(account)) return endSession()
            ticker?.cancel()
            settle(account) {
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

        /**
         * Una sola llamada a la vez: con otra en curso, o con la sesión cerrada, el toque no hace nada. [block] recibe la
         * cuenta de la pantalla; si la sesión vigente ya es otra, no se llama y la pantalla se cierra.
         */
        private fun launchCall(block: suspend (account: String) -> Unit) {
            val current = _state.value
            if (!acceptsCalls || current.sending || current.loggedOut) return
            val account = accountId ?: return endSession()
            if (!isCurrent(account)) return endSession()
            _state.update { it.copy(sending = true, error = null) }
            work = viewModelScope.launch { block(account) }
        }

        /** Sigue siendo la cuenta de la pantalla: no se cerró Y la sesión vigente, leída ahora, es la de [account]. */
        private fun isCurrent(account: String) =
            !closed && (sessionStore.state.value as? SessionState.SignedIn)?.userId == account

        private suspend fun onFailure(
            error: AppError,
            account: String,
            offersTransfer: Boolean,
        ) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (error is AppError.Network && error.cause is AccountMismatchException) {
                // La sesión ya es de otra cuenta: no salió nada. Se cierra la pantalla sin tocar la sesión nueva.
                endSession()
                return
            }
            if (error.isUnauthorized()) {
                // El servidor no reconoce la sesión: se cierra aquí también, pero solo si sigue siendo la de esta
                // pantalla (un 401 de A no cierra la sesión de B). El cierre cancela esta misma llamada.
                withContext(NonCancellable) { sessionStore.signOutIf(account) }
                endSession()
                return
            }
            val offer = if (offersTransfer) (error as? AppError.Known)?.takeIf { it.isConflict() }?.transfer else null
            settle(account) { it.copy(error = if (offer == null) error.toPhoneError() else null, transfer = offer) }
        }

        /** Un error de validación local; con la sesión cerrada no toca el estado. */
        private fun fail(error: PhoneError) {
            if (closed) return
            _state.update { if (it.loggedOut) it else it.copy(error = error) }
        }

        /**
         * Lo que llega después de cerrar la sesión, con la sesión ya en otra cuenta, o de una llamada cancelada al cerrar
         * la hoja, no se publica. Devuelve si se publicó.
         */
        private suspend fun settle(
            account: String,
            next: (PhoneUiState) -> PhoneUiState,
        ): Boolean {
            if (closed || !currentCoroutineContext().isActive) return false
            if (!isCurrent(account)) {
                endSession()
                return false
            }
            _state.update { if (it.loggedOut) it else next(it).copy(sending = false) }
            return true
        }

        private fun endSession() {
            closed = true
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
