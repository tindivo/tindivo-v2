package com.tindivo.customer.feature.deleteaccount

import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.tindivo.customer.R
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

/** Qué hacer con un aviso «Tu cuenta fue borrada» guardado en la portada. */
internal enum class DeletedNoticeVisibility {
    /** Nadie entró desde que se borró y no hay sesión: se muestra. */
    Show,

    /** Entró alguien (otra cuenta o la misma otra vez): ya no es para quien tiene el aparato; se descarta. */
    Stale,

    /** Aún no se leyó la sesión guardada (tras reabrir la app): ni se muestra ni se descarta. */
    Wait,
}

/**
 * Si el aviso guardado con la generación [stored] sigue siendo para quien tiene el aparato: la generación vigente es la
 * misma (nadie entró desde la limpieza) y la sesión sigue cerrada.
 */
internal fun deletedNoticeVisibility(
    stored: Long,
    generation: Long,
    session: SessionState,
): DeletedNoticeVisibility =
    when {
        session is SessionState.Unknown -> DeletedNoticeVisibility.Wait
        stored == generation && session is SessionState.SignedOut -> DeletedNoticeVisibility.Show
        else -> DeletedNoticeVisibility.Stale
    }

/** Lo que necesita [AccountDeletedNotice] de la sesión, sin que la pantalla conozca el almacén. */
@HiltViewModel
internal class AccountDeletedNoticeViewModel
    @Inject
    constructor(
        private val sessionStore: SessionStore,
    ) : ViewModel() {
        /** Cambia cuando cambia la sesión o alguien entra: solo sirve para volver a decidir. */
        val changes: StateFlow<Pair<Long, SessionState>> =
            combine(sessionStore.signInGeneration, sessionStore.state) { generation, session -> generation to session }
                .stateIn(viewModelScope, SharingStarted.Eagerly, current())

        /** Decide con los valores vigentes del almacén, no con los de [changes], que pueden ir atrasados. */
        fun visibility(stored: Long): DeletedNoticeVisibility {
            val (generation, session) = current()
            return deletedNoticeVisibility(stored, generation, session)
        }

        // Primero la generación y luego el estado (ver SessionStore.signInGeneration).
        private fun current(): Pair<Long, SessionState> {
            val generation = sessionStore.signInGeneration.value
            return generation to sessionStore.state.value
        }
    }

/**
 * «Tu cuenta fue borrada», sobre la portada, hasta que la persona lo cierra. [handle] es el de la portada y guarda la
 * generación de la sesión de quien borró: si alguien entra antes de que se cierre el aviso, se descarta sin mostrarse.
 */
@Composable
internal fun AccountDeletedNotice(
    handle: SavedStateHandle,
    viewModel: AccountDeletedNoticeViewModel = hiltViewModel(),
) {
    val stored = handle.getStateFlow<Long?>(ACCOUNT_DELETED_KEY, null).collectAsStateWithLifecycle().value ?: return
    val changes = viewModel.changes.collectAsStateWithLifecycle().value
    val dismiss = { handle[ACCOUNT_DELETED_KEY] = null }
    AccountDeletedNoticeContent(
        stored = stored,
        changes = changes,
        visibility = { viewModel.visibility(stored) },
        onStale = dismiss,
        onDismiss = dismiss,
    )
}

/**
 * [AccountDeletedNotice] sin estado. [changes] (lo último observado de la sesión, que puede ir atrasado) solo sirve para
 * volver a componer y para volver a lanzar el descarte; la decisión se pide a [visibility] en CADA composición y nunca
 * se recuerda: un [changes] atrasado no puede reutilizar un «mostrar» ya decidido (CAX-003). Si es
 * [DeletedNoticeVisibility.Stale], llama a [onStale].
 */
@Composable
internal fun AccountDeletedNoticeContent(
    stored: Long,
    changes: Any?,
    visibility: () -> DeletedNoticeVisibility,
    onStale: () -> Unit,
    onDismiss: () -> Unit,
) {
    val decision = visibility()
    val currentOnStale by rememberUpdatedState(onStale)
    LaunchedEffect(stored, decision, changes) {
        if (decision == DeletedNoticeVisibility.Stale) currentOnStale()
    }
    if (decision != DeletedNoticeVisibility.Show) return
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = stringResource(R.string.delete_account_done_title),
                modifier = Modifier.semantics { heading() },
            )
        },
        text = {
            Text(
                text = stringResource(R.string.delete_account_done_message),
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        },
        confirmButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.delete_account_done_ok))
            }
        },
    )
}
