package com.tindivo.customer.feature.deleteaccount

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import javax.inject.Inject

/** La palabra que hay que escribir, la misma que en la web: un toque sin querer no borra una cuenta. */
internal const val CONFIRM_WORD = "BORRAR"

private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_FORBIDDEN = 403
private const val HTTP_CONFLICT = 409

internal enum class DeletePhase {
    /** Se puede escribir la palabra y borrar. */
    Ready,

    /** El `DELETE` salió: nada más se puede tocar hasta que vuelva. */
    Deleting,

    /** La cuenta ya no existe y lo local de ella se soltó: la pantalla lleva a la portada con el aviso. */
    Deleted,

    /** La sesión con la que se abrió terminó (se cerró o es otra cuenta): se sale sin decir «borrada». */
    Left,

    /**
     * Volvió un 401: la sesión se cerró, pero eso no prueba que la cuenta se borró (también lo da una cuenta viva cuyo
     * refresco falló). No se soltó nada de ella; la pantalla lo dice y solo deja volver.
     */
    Unconfirmed,
}

/** Lo que la pantalla le dice a la persona cuando no se pudo borrar. */
internal sealed interface DeleteNotice {
    /** El servidor dijo que ahora no (409, 403): su motivo en español, tal cual. La sesión sigue abierta. */
    data class Blocked(
        val detail: String?,
        val showOrders: Boolean,
    ) : DeleteNotice

    /** Sin conexión, un 5xx o una respuesta que no se entiende: no se sabe si se borró; se puede volver a intentar. */
    data object Failed : DeleteNotice

    /** Un 401: no se pudo confirmar que se borró. La sesión ya está cerrada; al volver a entrar se ve qué pasó. */
    data object Unconfirmed : DeleteNotice
}

internal data class DeleteAccountUiState(
    val typed: String = "",
    val phase: DeletePhase = DeletePhase.Ready,
    val notice: DeleteNotice? = null,
) {
    val confirmed: Boolean get() = typed.trim().uppercase(Locale.ROOT) == CONFIRM_WORD

    val canDelete: Boolean get() = confirmed && phase == DeletePhase.Ready
}

/**
 * Quién confirmó el borrado y con qué [SessionStore.signInGeneration]: si la generación cambió, alguien entró desde
 * entonces (aunque el observador de la sesión no lo haya visto) y lo del aparato ya puede ser suyo.
 */
internal data class Confirmation(
    val account: String,
    val generation: Long,
)

/**
 * Borrar la cuenta (Google Play la exige dentro de la app). El `DELETE` sale solo para la cuenta que abrió la pantalla
 * ([owner]) y solo de un toque; con uno en curso los siguientes no hacen nada, y nunca se repite solo.
 *
 * El resultado se aplica a esa cuenta aunque la sesión haya cambiado mientras tanto: solo un 204 suelta lo local de
 * ella ([DeletedAccountCleanup]); si otra cuenta entró, no se toca nada suyo y la pantalla se cierra sin decir
 * «borrada». Un 401 no prueba que se borró (una cuenta viva cuyo refresco falló también lo recibe): se cierra la sesión
 * como ante cualquier 401, se conservan el intento de pedido y la bolsa, y se dice que no se pudo confirmar. Un corte o
 * un timeout tampoco prueban nada: se dice que no se pudo y se puede reintentar.
 *
 * «Nadie más entró» no se deduce de lo que vio el observador de la sesión (un `StateFlow` se salta estados): se
 * compara la [SessionStore.signInGeneration] de la [Confirmation] con la vigente, en el momento de decidir.
 */
@HiltViewModel
internal class DeleteAccountViewModel
    @Inject
    constructor(
        private val deleter: AccountDeleter,
        private val cleanup: DeletedAccountCleanup,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val _state = MutableStateFlow(DeleteAccountUiState())
        val state: StateFlow<DeleteAccountUiState> = _state.asStateFlow()

        // La primera cuenta con sesión que ve la pantalla: la única que se puede borrar desde aquí, y la generación con
        // la que se la vio.
        @Volatile private var owner: String? = null

        @Volatile private var ownerGeneration = 0L

        // Se vio con sesión una cuenta distinta de [owner]: lo que haya en el aparato desde entonces puede ser suyo.
        @Volatile private var otherAccountSeen = false

        private var work: Job? = null

        init {
            adoptOwnerIfSignedIn()
            viewModelScope.launch { sessionStore.state.collect(::onSession) }
        }

        fun onTyped(text: String) {
            if (_state.value.phase != DeletePhase.Ready) return
            _state.update { if (it.phase == DeletePhase.Ready) it.copy(typed = text, notice = null) else it }
        }

        /** «Borrar mi cuenta definitivamente». */
        fun delete() {
            val account = owner
            if (!_state.value.canDelete || work?.isActive == true || account == null) return
            val confirmation = Confirmation(account, ownerGeneration)
            if (!isOwnerSignedIn(confirmation)) {
                _state.update { it.copy(phase = DeletePhase.Left) }
                return
            }
            _state.update { it.copy(phase = DeletePhase.Deleting, notice = null) }
            work = viewModelScope.launch { settle(confirmation, deleter.delete(account)) }
        }

        // Primero la generación y luego el estado (ver SessionStore.signInGeneration).
        private fun adoptOwnerIfSignedIn() {
            if (owner != null) return
            val generation = sessionStore.signInGeneration.value
            val current = sessionStore.state.value as? SessionState.SignedIn ?: return
            ownerGeneration = generation
            owner = current.userId
        }

        private fun onSession(session: SessionState) {
            when (session) {
                SessionState.Unknown -> {
                    return
                }

                is SessionState.SignedIn -> {
                    adoptOwnerIfSignedIn()
                    if (session.userId != owner) otherAccountSeen = true
                }

                SessionState.SignedOut -> {
                    Unit
                }
            }
            // Con un borrado en curso, lo decide su resultado; sin él, una sesión que terminó cierra la pantalla.
            // «No pudimos confirmar» es para la cuenta que confirmó: si entra otra, la pantalla se cierra sin decirlo.
            val ended = session is SessionState.SignedOut || otherAccountSeen
            _state.update {
                val leaves =
                    (ended && it.phase == DeletePhase.Ready) || (otherAccountSeen && it.phase == DeletePhase.Unconfirmed)
                if (leaves) it.copy(phase = DeletePhase.Left, notice = null) else it
            }
        }

        private suspend fun settle(
            confirmation: Confirmation,
            result: ApiResult<Unit>,
        ) {
            val error = (result as? ApiResult.Failure)?.error
            if (error == null) {
                // 204: la cuenta ya no existe. Soltar lo local no se corta a medias.
                val account = confirmation.account
                val mine = withContext(NonCancellable) { cleanup.clean(account) { isStillOwners(confirmation) } }
                _state.update { it.copy(typed = "", phase = if (mine) DeletePhase.Deleted else DeletePhase.Left) }
                return
            }
            if (error.isUnauthorized()) {
                unconfirmed(confirmation)
                return
            }
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            _state.update {
                if (isOwnerSignedIn(confirmation)) {
                    it.copy(phase = DeletePhase.Ready, notice = error.toNotice())
                } else {
                    // La sesión ya no es la de la cuenta que confirmó: el aviso no es para quien está ahora.
                    it.copy(phase = DeletePhase.Left, notice = null)
                }
            }
        }

        // Un 401 sin confirmación: el cierre de sesión de siempre (si sigue la de esa cuenta; si el refresco falló, el
        // almacén ya la cerró) y nada más. El libro de intentos y la bolsa se quedan: si la cuenta sigue viva, al volver
        // a entrar el checkout aún puede reconciliar un pedido incierto.
        private suspend fun unconfirmed(confirmation: Confirmation) {
            if (isOwnerSignedIn(confirmation)) withContext(NonCancellable) { sessionStore.signOut() }
            _state.update {
                if (isStillOwners(confirmation)) {
                    it.copy(typed = "", phase = DeletePhase.Unconfirmed, notice = DeleteNotice.Unconfirmed)
                } else {
                    it.copy(phase = DeletePhase.Left, notice = null)
                }
            }
        }

        // La sesión vigente es la de quien confirmó y nadie entró desde entonces.
        private fun isOwnerSignedIn(confirmation: Confirmation): Boolean {
            val generation = sessionStore.signInGeneration.value
            val session = sessionStore.state.value
            return !otherAccountSeen &&
                generation == confirmation.generation &&
                (session as? SessionState.SignedIn)?.userId == confirmation.account
        }

        // Lo del aparato sigue siendo de quien confirmó: nadie entró desde entonces (ni otra cuenta ni la misma otra
        // vez). Cerrada (por el 401 o por la limpieza) también vale. Se evalúa en el momento de decidir, también DENTRO
        // de la escritura de la bolsa.
        private fun isStillOwners(confirmation: Confirmation): Boolean {
            val generation = sessionStore.signInGeneration.value
            val session = sessionStore.state.value
            val current =
                session is SessionState.SignedOut || (session as? SessionState.SignedIn)?.userId == confirmation.account
            return !otherAccountSeen && generation == confirmation.generation && current
        }
    }

private fun AppError.isUnauthorized(): Boolean =
    this is AppError.Known && (code == ApiErrorCode.Unauthorized || status == HTTP_UNAUTHORIZED)

private fun AppError.toNotice(): DeleteNotice =
    when {
        this is AppError.Known && status == HTTP_CONFLICT -> DeleteNotice.Blocked(detail, showOrders = true)
        this is AppError.Known && status == HTTP_FORBIDDEN -> DeleteNotice.Blocked(detail, showOrders = false)
        else -> DeleteNotice.Failed
    }
