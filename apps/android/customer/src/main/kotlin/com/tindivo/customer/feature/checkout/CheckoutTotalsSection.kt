package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

/** Subtotal, delivery y total: todo viene de la cotización del servidor; la app no suma nada. */
internal fun LazyListScope.totalsSection(state: CheckoutUiState) {
    item(key = "totals") {
        val quote = state.quote
        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (quote == null) {
                Text(
                    text = stringResource(R.string.checkout_totals_loading),
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                TotalsRows(quote = quote, pickup = state.isPickup)
            }
        }
    }
}

@Composable
private fun TotalsRows(
    quote: QuoteView,
    pickup: Boolean,
) {
    AmountRow(stringResource(R.string.checkout_totals_subtotal), quote.subtotal.soles())
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        val far = if (quote.far && !pickup) " " + stringResource(R.string.checkout_totals_far) else ""
        Text(text = stringResource(R.string.checkout_totals_delivery) + far)
        if (quote.freeDelivery && !pickup) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(text = quote.nominalDeliveryFee.soles(), textDecoration = TextDecoration.LineThrough)
                Text(text = stringResource(R.string.checkout_totals_free), fontWeight = FontWeight.Bold)
            }
        } else {
            Text(text = quote.deliveryFee.soles())
        }
    }
    if (quote.freeDelivery && !pickup) {
        Text(
            text =
                stringResource(
                    if (quote.freeReason ==
                        "dish"
                    ) {
                        R.string.checkout_promo_dish
                    } else {
                        R.string.checkout_promo_launch
                    },
                ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            text = stringResource(R.string.checkout_totals_total),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(text = quote.total.soles(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun AmountRow(
    label: String,
    amount: String,
) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(text = label)
        Text(text = amount)
    }
}
