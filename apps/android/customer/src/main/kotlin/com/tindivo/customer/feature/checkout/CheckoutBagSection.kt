package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

/** «Tu pedido»: la bolsa en un acordeón. Los importes por línea salen de la cotización, no de los precios de la carta. */
internal fun LazyListScope.bagSection(
    state: CheckoutUiState,
    onEditBag: () -> Unit,
) {
    item(key = "bag") { BagCard(state, onEditBag) }
}

@Composable
private fun BagCard(
    state: CheckoutUiState,
    onEditBag: () -> Unit,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val units = state.lines.sumOf { it.quantity }
    val hint = stringResource(if (open) R.string.checkout_bag_close else R.string.checkout_bag_open)
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .semantics { stateDescription = hint }
                        .clickable { open = !open },
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.checkout_bag_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = pluralStringResource(R.plurals.checkout_products, units, units),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Text(
                    text =
                        state.quote
                            ?.subtotal
                            ?.soles()
                            .orEmpty(),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            Text(
                text = hint,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (open) {
                state.lines.forEachIndexed { index, line ->
                    BagLine(
                        line = line,
                        total =
                            state.quote
                                ?.lineTotals
                                ?.getOrNull(index)
                                ?.soles(),
                    )
                }
                TextButton(onClick = onEditBag, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = stringResource(R.string.checkout_bag_edit))
                }
            }
        }
    }
}

@Composable
private fun BagLine(
    line: BagLineUi,
    total: String?,
) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = stringResource(R.string.checkout_bag_line, line.quantity, line.name),
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyLarge,
            )
            total?.let { Text(text = it, style = MaterialTheme.typography.bodyLarge) }
        }
        line.options.forEach {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        line.note?.let {
            Text(
                text = stringResource(R.string.cart_line_note, it),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
