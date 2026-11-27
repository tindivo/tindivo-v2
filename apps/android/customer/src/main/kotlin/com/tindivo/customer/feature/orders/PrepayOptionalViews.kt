package com.tindivo.customer.feature.orders

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R

/**
 * El contenido de la tarjeta de pago único (captura opcional, CUS-PAY-014): sin plazo ni «confirmó tu pedido». Lo que se
 * ve lo manda `prepay-info`: pago confirmado, captura en revisión, o la cuenta con el selector. «Pagaré al motorizado al
 * llegar» es solo una elección de pantalla (no llama a la API): oculta el selector hasta que se deshace.
 */
@Composable
internal fun OptionalContent(
    state: PrepayUiState,
    details: PrepayDetails,
    amount: String,
    actions: PrepayActions,
) {
    if (details.paymentConfirmed) {
        Text(
            text = stringResource(R.string.prepay_verified),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        return
    }
    if (details.proofInReview || state.send is SendState.Sent) {
        SentNotice()
        return
    }
    if (details.lastTry) LastTryNotice()
    PrepayPayeeCard(amount = amount, payee = details.payee)
    if (details.canUpload && state.showsProofPicker) {
        var atDoor by rememberSaveable { mutableStateOf(false) }
        if (atDoor) {
            Text(text = stringResource(R.string.prepay_pay_at_door_chosen), style = MaterialTheme.typography.bodyLarge)
            TindivoTextButton(text = stringResource(R.string.prepay_upload), onClick = { atDoor = false })
        } else {
            ProofPicker(state = state, actions = actions)
            TindivoTextButton(text = stringResource(R.string.prepay_pay_at_door), onClick = { atDoor = true })
        }
    }
}
