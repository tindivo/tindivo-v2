package com.tindivo.customer.feature.checkout

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R

/** El WhatsApp de soporte de Tindivo (el mismo de la web, `TINDIVO_SUPPORT_WHATSAPP`). */
internal const val SUPPORT_WHATSAPP_URL = "https://wa.me/51906550166"

@Composable
internal fun SignInRequiredView(actions: CheckoutActions) {
    CheckoutFrame(actions.onBack) {
        Text(stringResource(R.string.checkout_sign_in_title), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.checkout_sign_in_message))
        BigButton(R.string.checkout_sign_in, actions.onSignIn)
    }
}

@Composable
internal fun LoadFailedView(
    actions: CheckoutActions,
    onRetry: () -> Unit,
) {
    CheckoutFrame(actions.onBack) {
        Text(stringResource(R.string.checkout_load_failed))
        BigButton(R.string.checkout_retry, onRetry)
    }
}

@Composable
internal fun ProfileRequiredView(
    actions: CheckoutActions,
    onComplete: () -> Unit,
) {
    CheckoutFrame(actions.onBack) {
        Text(stringResource(R.string.checkout_profile_title), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.checkout_profile_message))
        BigButton(R.string.profile_complete, onComplete)
    }
}

@Composable
internal fun EmptyBagView(actions: CheckoutActions) {
    CheckoutFrame(actions.onBack) {
        Text(stringResource(R.string.cart_empty), style = MaterialTheme.typography.titleMedium)
        BigButton(R.string.cart_see_businesses, actions.onSeeBusinesses)
    }
}

/** «Cuenta en pausa»: el bloqueo es del servidor; aquí solo se explica y se da la salida por WhatsApp. */
@Composable
internal fun BlockedView(
    reason: String?,
    actions: CheckoutActions,
) {
    val uriHandler = LocalUriHandler.current
    CheckoutFrame(actions.onBack) {
        Text(stringResource(R.string.checkout_blocked_title), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.checkout_blocked_message))
        reason?.let { Text(it) }
        BigButton(R.string.checkout_blocked_whatsapp) { uriHandler.openUri(SUPPORT_WHATSAPP_URL) }
        TindivoTextButton(text = stringResource(R.string.checkout_blocked_home), onClick = actions.onSeeBusinesses)
    }
}

/**
 * No consta si el pedido anterior llegó. «Ya revisé» solo se habilita después de abrir «Mis pedidos»: el libro exige
 * que la persona lo vea antes de poder enviar con una clave nueva.
 */
@Composable
internal fun ReconcileView(
    state: CheckoutUiState,
    actions: CheckoutActions,
    form: CheckoutFormActions,
) {
    CheckoutFrame(actions.onBack) {
        Text(stringResource(R.string.checkout_reconcile_title), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.checkout_reconcile_message))
        TindivoSecondaryButton(text = stringResource(R.string.checkout_reconcile_orders), onClick = {
            form.onOrdersOpened()
            actions.onOpenOrders()
        })
        TindivoPrimaryButton(
            text = stringResource(R.string.checkout_reconcile_continue),
            onClick = form.onAcknowledge,
            enabled =
                state.reconcileSeen && !state.sending,
        )
    }
}

@Composable
private fun BigButton(
    @StringRes textRes: Int,
    onClick: () -> Unit,
) {
    TindivoPrimaryButton(text = stringResource(textRes), onClick = onClick)
}
