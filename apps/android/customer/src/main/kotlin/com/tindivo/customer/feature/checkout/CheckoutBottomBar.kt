package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

/**
 * La barra fija: el aviso (si hay), el botón que dice qué falta o «Confirmar pedido · total» y una línea de apoyo.
 * Mientras se envía el botón sigue a la vista pero no responde: un segundo toque no crea un segundo pedido.
 */
@Composable
internal fun CheckoutBottomBar(
    state: CheckoutUiState,
    actions: CheckoutActions,
    form: CheckoutFormActions,
) {
    val cta = state.cta
    Surface(shadowElevation = 8.dp) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            state.message?.let {
                Text(
                    text = it.text(),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            Button(
                onClick = { onCta(cta, actions, form) },
                enabled = cta != Cta.Sending,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(text = cta.label())
            }
            supportLine(state)?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun onCta(
    cta: Cta,
    actions: CheckoutActions,
    form: CheckoutFormActions,
) {
    when {
        cta.canConfirm -> form.onConfirm()
        cta.opensAccount -> actions.onOpenAccount()
        cta == Cta.QuoteProblem -> form.onRetryQuote()
    }
}

@Composable
private fun supportLine(state: CheckoutUiState): String? =
    when {
        state.sending -> stringResource(R.string.checkout_cta_do_not_close)
        state.pay == PayMethod.Prepaid -> stringResource(R.string.checkout_sub_prepaid)
        state.pay == PayMethod.Cash || state.pay == PayMethod.Yape -> stringResource(R.string.checkout_sub_cash)
        else -> null
    }
