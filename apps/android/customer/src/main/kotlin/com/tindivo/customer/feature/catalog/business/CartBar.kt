package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

/**
 * La barra «Ver mi bolsa» (tablero «Negocio y carta»): una píldora de 56 dp que flota sobre un degradado del fondo,
 * con el subtotal y las unidades en un círculo blanco. TalkBack la lee entera: «Ver mi bolsa, 2 unidades · S/ 30.00».
 */
@Composable
internal fun CartBar(
    bar: CartBarUi,
    onClick: () -> Unit,
) {
    val label = stringResource(R.string.cart_bar_label)
    val summary =
        stringResource(
            R.string.cart_bar_summary,
            pluralStringResource(R.plurals.cart_units, bar.count, bar.count),
            bar.subtotal,
        )
    val background = MaterialTheme.colorScheme.background
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(0f to Color.Transparent, 0.45f to background))
                .navigationBarsPadding()
                .padding(start = TindivoSpacing.screen, end = TindivoSpacing.screen, top = 24.dp, bottom = 16.dp),
    ) {
        Surface(
            onClick = onClick,
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            shadowElevation = 6.dp,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = TindivoSpacing.primaryButtonHeight)
                    .clearAndSetSemantics {
                        contentDescription = "$label, $summary"
                        role = Role.Button
                    },
        ) {
            Row(
                modifier = Modifier.padding(start = 24.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(text = label, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                Text(text = bar.subtotal, style = MaterialTheme.typography.titleLarge)
                Box(
                    modifier =
                        Modifier
                            .sizeIn(minWidth = 40.dp, minHeight = 40.dp)
                            .background(Color.White, CircleShape)
                            .padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = bar.count.toString(),
                        style = MaterialTheme.typography.titleLarge,
                        color = TindivoColors.brandText,
                    )
                }
            }
        }
    }
}
