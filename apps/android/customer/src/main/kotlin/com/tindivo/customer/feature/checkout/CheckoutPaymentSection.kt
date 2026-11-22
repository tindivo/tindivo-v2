package com.tindivo.customer.feature.checkout

import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.customer.R
import com.tindivo.customer.support.SupportViewModel
import com.tindivo.customer.support.accountErrorHelpLink
import com.tindivo.customer.support.openSafely

/** «¿Cómo pagas?»: las opciones de la cotización, en su orden, agrupadas por momento. */
internal fun LazyListScope.paymentSection(
    state: CheckoutUiState,
    form: CheckoutFormActions,
) {
    item(key = "payment") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionTitle(stringResource(R.string.checkout_pay_title))
            val quote = state.quote
            if (quote == null) {
                Text(
                    text = stringResource(R.string.checkout_totals_loading),
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                PayGroup(
                    R.string.checkout_pay_group_receive,
                    quote.options.filter {
                        it.method != PayMethod.Prepaid
                    },
                    state,
                    quote,
                    form,
                )
                PayGroup(
                    R.string.checkout_pay_group_before,
                    quote.options.filter {
                        it.method == PayMethod.Prepaid
                    },
                    state,
                    quote,
                    form,
                )
                if (quote.options.any { it.unavailableReason == PREPAY_REQUIRED }) PrepayErrorHelp()
                if (state.pay == PayMethod.Prepaid) PrepayExplainer(state.businessName)
                val rules = quote.cash
                if (state.pay == PayMethod.Cash && !state.isPickup && rules != null) {
                    CashSelector(total = quote.total, rules = rules, choice = state.cash, onChoice = form.onSelectCash)
                }
            }
        }
    }
}

@Composable
private fun PayGroup(
    @StringRes titleRes: Int,
    options: List<PayOption>,
    state: CheckoutUiState,
    quote: QuoteView,
    form: CheckoutFormActions,
) {
    if (options.isEmpty()) return
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = stringResource(titleRes), style = MaterialTheme.typography.titleSmall)
            options.forEach { option ->
                ChoiceRow(
                    selected = state.pay == option.method,
                    enabled = option.available,
                    title = payTitle(option.method),
                    hint = if (option.available) payHint(option.method) else unavailableText(option, quote),
                    onClick = { form.onSelectPay(option.method) },
                    leading = { PayArt(method = option.method, enabled = option.available) },
                )
            }
        }
    }
}

/**
 * El dibujo de cada medio (tablero «Checkout»): el billete para efectivo y los logos de Yape y Plin para lo que se paga
 * con el celular. Decorativo: el título ya nombra el medio. Apagado, a media opacidad.
 */
@Composable
private fun PayArt(
    method: PayMethod,
    enabled: Boolean,
) {
    val alpha = if (enabled) 1f else DISABLED_ALPHA
    if (method == PayMethod.Cash) {
        Image(
            bitmap = ImageBitmap.imageResource(R.drawable.img_pay_cash),
            contentDescription = null,
            alpha = alpha,
            modifier = Modifier.size(40.dp),
        )
        return
    }
    Row(modifier = Modifier.width(40.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        listOf(R.drawable.img_pay_yape, R.drawable.img_pay_plin).forEach {
            Image(
                bitmap = ImageBitmap.imageResource(it),
                contentDescription = null,
                alpha = alpha,
                modifier = Modifier.size(19.dp).clip(RoundedCornerShape(5.dp)),
            )
        }
    }
}

private const val DISABLED_ALPHA = 0.5f

@Composable
private fun payTitle(method: PayMethod): String =
    stringResource(
        when (method) {
            PayMethod.Cash -> R.string.checkout_pay_cash
            PayMethod.Yape -> R.string.checkout_pay_yape
            PayMethod.Prepaid -> R.string.checkout_pay_prepaid
        },
    )

@Composable
private fun payHint(method: PayMethod): String =
    stringResource(
        when (method) {
            PayMethod.Cash -> R.string.checkout_pay_cash_hint
            PayMethod.Yape -> R.string.checkout_pay_yape_hint
            PayMethod.Prepaid -> R.string.checkout_pay_prepaid_hint
        },
    )

private const val PREPAY_REQUIRED = "prepay_required"

/** «Si crees que hubo un error…» (CUS-SUP-005): el botón a WhatsApp de soporte, sin formulario de apelación. */
@Composable
private fun PrepayErrorHelp(supportViewModel: SupportViewModel = hiltViewModel()) {
    val number = supportViewModel.number.collectAsStateWithLifecycle().value
    val uriHandler = LocalUriHandler.current
    TextButton(
        onClick = { uriHandler.openSafely(accountErrorHelpLink(number)) },
        modifier = Modifier.heightIn(min = 48.dp),
    ) {
        Text(text = stringResource(R.string.checkout_blocked_whatsapp))
    }
}

/** Por qué una opción no está disponible, con las palabras de la web (el motivo viene del servidor). */
@Composable
private fun unavailableText(
    option: PayOption,
    quote: QuoteView,
): String =
    when (option.unavailableReason) {
        "exceeds_threshold" -> stringResource(R.string.checkout_pay_reason_threshold, quote.prepayThreshold.soles())
        PREPAY_REQUIRED -> stringResource(R.string.checkout_pay_reason_required)
        else -> stringResource(R.string.checkout_pay_reason_other)
    }

@Composable
private fun PrepayExplainer(businessName: String) {
    var open by rememberSaveable { mutableStateOf(true) }
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = { open = !open }, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.checkout_prepay_how))
            }
            if (open) {
                Text(
                    text = "1. " + stringResource(R.string.checkout_prepay_step1),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = "2. " + stringResource(R.string.checkout_prepay_step2),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = "3. " + stringResource(R.string.checkout_prepay_step3),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = stringResource(R.string.checkout_prepay_direct, businessName),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
