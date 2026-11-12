package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

/**
 * La puerta a Tindivo Entregas en la portada: primero qué se quiere hacer, después dónde (como el home de la web). Toda
 * la tarjeta se toca; el horario, el precio y si hoy se puede pedir los dice la portada de Entregas.
 */
@Composable
internal fun CourierEntryCard(onClick: () -> Unit) {
    TindivoCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.hairline),
        ) {
            Text(
                text = stringResource(R.string.courier_entry_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = TindivoColors.brandText,
            )
            Text(
                text = stringResource(R.string.courier_entry_card_cta),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun CourierEntryCardPreview() {
    TindivoTheme { CourierEntryCard(onClick = {}) }
}
