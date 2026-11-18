package com.tindivo.customer.feature.cart

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R

@Composable
internal fun CartLineRow(
    line: CartLineUi,
    actions: CartActions,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = line.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Text(text = line.total, style = MaterialTheme.typography.titleMedium)
        }
        line.options.forEach {
            Text(
                text = stringResource(R.string.cart_option, it.group, it.option),
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
        QuantityControls(line = line, actions = actions)
    }
}

@Composable
private fun QuantityControls(
    line: CartLineUi,
    actions: CartActions,
) {
    val less = stringResource(R.string.cart_line_less, line.name)
    val more = stringResource(R.string.cart_line_more, line.name)
    val lessLabel = if (line.decreaseRemoves) stringResource(R.string.cart_line_remove, line.name) else less
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedButton(
            onClick = { actions.onChangeQuantity(line.signature, -1) },
            modifier = Modifier.size(48.dp).semantics { contentDescription = lessLabel },
            contentPadding = PaddingValues(0.dp),
        ) {
            if (line.decreaseRemoves) {
                Icon(
                    imageVector = TindivoIcons.Delete,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                )
            } else {
                Text(text = "−")
            }
        }
        Text(text = line.quantity.toString(), style = MaterialTheme.typography.titleMedium)
        OutlinedButton(
            onClick = { actions.onChangeQuantity(line.signature, 1) },
            enabled = line.canIncrease,
            modifier = Modifier.size(48.dp).semantics { contentDescription = more },
            contentPadding = PaddingValues(0.dp),
        ) {
            Text(text = "+")
        }
    }
}
