package com.tindivo.customer.feature.deleteaccount

import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.customer.R

/** «Tu cuenta fue borrada», sobre la portada, hasta que la persona lo cierra. [handle] es el de la portada. */
@Composable
fun AccountDeletedNotice(handle: SavedStateHandle) {
    val visible = handle.getStateFlow(ACCOUNT_DELETED_KEY, false).collectAsStateWithLifecycle().value
    if (!visible) return
    val dismiss = { handle[ACCOUNT_DELETED_KEY] = false }
    AlertDialog(
        onDismissRequest = dismiss,
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
            TextButton(onClick = dismiss, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.delete_account_done_ok))
            }
        },
    )
}
