package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

/**
 * La barra fija: el aviso (si hay), el botón que dice qué falta o «Confirmar pedido · total» y una línea de apoyo.
 * Mientras se envía el botón sigue a la vista pero no responde: un segundo toque no crea un segundo pedido.
 */
@Composable
internal fun CheckoutBottomBar(
    state: CheckoutUiState,
    form: CheckoutFormActions,
    openSheet: (CheckoutSheet) -> Unit,
    goToPayment: () -> Unit,
) {
    val cta = state.cta
    val confirm = rememberConfirmWithLocation(state, form.onConfirm)
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        shadowElevation = 12.dp,
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp),
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
            val onClick = { onCta(cta, state.selectedAddressId, confirm, form, openSheet, goToPayment) }
            if (cta is Cta.Ready) {
                ConfirmPill(label = cta.label(), total = cta.total.soles(), onClick = onClick)
            } else {
                TindivoPrimaryButton(
                    text = cta.label(),
                    onClick = onClick,
                    enabled = cta != Cta.Sending && cta != Cta.Locating,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            supportLine(state)?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/** Lo que falta se resuelve en su hoja ([sheet]); el resto del botón confirma o vuelve a cotizar. */
private fun onCta(
    cta: Cta,
    selectedAddressId: String?,
    confirm: () -> Unit,
    form: CheckoutFormActions,
    openSheet: (CheckoutSheet) -> Unit,
    goToPayment: () -> Unit,
) {
    val sheet = cta.sheet(selectedAddressId)
    when {
        cta.canConfirm -> confirm()
        cta.goesToPayment -> goToPayment()
        sheet != null -> openSheet(sheet)
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

/** «Confirmar pedido» y el total en su cápsula; TalkBack lee la frase entera del botón. */
@Composable
private fun ConfirmPill(
    label: String,
    total: String,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = TindivoSpacing.primaryButtonHeight)
                .clearAndSetSemantics {
                    contentDescription = label
                    role = Role.Button
                },
    ) {
        Row(modifier = Modifier.padding(start = 24.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.checkout_cta_confirm_short),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier =
                    Modifier
                        .height(40.dp)
                        .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.28f), CircleShape)
                        .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(text = total, style = MaterialTheme.typography.titleLarge)
            }
        }
    }
}
