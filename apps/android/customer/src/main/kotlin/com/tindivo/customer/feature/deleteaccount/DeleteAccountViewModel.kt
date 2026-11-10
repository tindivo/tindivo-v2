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
 * Borrar la cuenta (Google Play la exige dentro de la app). El `DELETE` sale solo para la cuenta que abrió la pantalla
 * ([owner]) y solo de un toque; con uno en curso los siguientes no hacen nada, y nunca se repite solo.
 *
 * El resultado se aplica a esa cuenta aunque la sesión haya cambiado mientras tanto: 204 o 401 (la identidad ya no
 * existe) sueltan lo local de ella ([DeletedAccountCleanup]); si otra cuenta entró, no se toca nada suyo y la pantalla
 * se cierra sin decir «borrada». Un corte o un timeout no prueban nada: se dice que no se pudo y, al reintentar, un 401
 * significa que el primer intento sí la borró.
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

        // La primera cuenta con sesión que ve la pantalla: la única que se puede borrar desde aquí.
        @Volatile private var owner: String? = null

        // Se vio con sesión una cuenta distinta de [owner]: lo que haya en el aparato desde entonces puede ser suyo.
        @Volatile private var otherAccountSeen = false

        private var work: Job? = null

        init {
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
            if (!isOwnerSignedIn(account)) {
                _state.update { it.copy(phase = DeletePhase.Left) }
                return
            }
            _state.update { it.copy(phase = DeletePhase.Deleting, notice = null) }
            work = viewModelScope.launch { settle(account, deleter.delete(account)) }
        }

        private fun onSession(session: SessionState) {
            when (session) {
                SessionState.Unknown -> {
                    return
                }

                is SessionState.SignedIn -> {
                    if (owner == null) owner = session.userId
                    if (session.userId != owner) otherAccountSeen = true
                }

                SessionState.SignedOut -> {
                    Unit
                }
            }
            // Con un borrado en curso, lo decide su resultado; sin él, una sesión que terminó cierra la pantalla.
            val ended = session is SessionState.SignedOut || otherAccountSeen
            if (ended) _state.update { if (it.phase == DeletePhase.Ready) it.copy(phase = DeletePhase.Left) else it }
        }

        private suspend fun settle(
            account: String,
            result: ApiResult<Unit>,
        ) {
            val error = (result as? ApiResult.Failure)?.error
            if (error == null || error.isUnauthorized()) {
                // 204, o 401 tras el refresco: la cuenta ya no existe. Soltar lo local no se corta a medias.
                val mine = withContext(NonCancellable) { cleanup.clean(account) { isStillOwners(account) } }
                _state.update { it.copy(typed = "", phase = if (mine) DeletePhase.Deleted else DeletePhase.Left) }
                return
            }
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            _state.update {
                if (isOwnerSignedIn(account)) {
                    it.copy(phase = DeletePhase.Ready, notice = error.toNotice())
                } else {
                    // La sesión ya no es la de la cuenta que confirmó: el aviso no es para quien está ahora.
                    it.copy(phase = DeletePhase.Left, notice = null)
                }
            }
        }

        private fun isOwnerSignedIn(account: String): Boolean =
            !otherAccountSeen && (sessionStore.state.value as? SessionState.SignedIn)?.userId == account

        // Lo del aparato sigue siendo de [account]: nadie más entró. Cerrada (por el 401 o por la limpieza) también vale.
        private fun isStillOwners(account: String): Boolean {
            val session = sessionStore.state.value
            val current = session is SessionState.SignedOut || (session as? SessionState.SignedIn)?.userId == account
            return current && !otherAccountSeen
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
