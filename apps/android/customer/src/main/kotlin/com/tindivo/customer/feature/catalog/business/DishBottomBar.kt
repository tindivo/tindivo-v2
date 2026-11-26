package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R
import com.tindivo.customer.feature.cart.MAX_QUANTITY

/** Etiqueta de pruebas del botón principal de la ficha. */
internal const val DISH_ADD_TAG = "dish_add"

/** La barra fija de abajo: la cantidad en una píldora y el botón principal, que dice qué falta o cuánto suma. */
@Composable
internal fun DishBottomBar(
    state: DishSheetState,
    onQuantity: (Int) -> Unit,
    onAdd: () -> Unit,
) {
    val label =
        when (val cta = state.cta) {
            is DishCta.Add -> {
                stringResource(R.string.dish_add_cta, cta.total)
            }

            is DishCta.Complete -> {
                val group = state.firstMissingGroup()
                when {
                    group == null -> stringResource(R.string.dish_review_cta)
                    group.choosesOne() -> stringResource(R.string.dish_choose_cta, group.chooseName())
                    else -> stringResource(R.string.dish_choose_many_cta, group.chooseName())
                }
            }
        }
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        shadowElevation = 12.dp,
        // Con el teclado abierto la barra sube con él (imePadding) y la nota queda visible encima, no tapada.
        modifier = Modifier.fillMaxWidth().imePadding(),
    ) {
        Row(
            modifier =
                Modifier
                    .navigationBarsPadding()
                    .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            QuantityStepper(quantity = state.quantity, onChange = onQuantity)
            TindivoPrimaryButton(
                text = label,
                onClick = onAdd,
                modifier = Modifier.weight(1f).testTag(DISH_ADD_TAG),
            )
        }
    }
}

@Composable
private fun QuantityStepper(
    quantity: Int,
    onChange: (Int) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Surface(
        shape = CircleShape,
        color = scheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, scheme.outline),
        modifier = Modifier.heightIn(min = TindivoSpacing.primaryButtonHeight),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = { onChange(quantity - 1) },
                enabled = quantity > 1,
                modifier = Modifier.size(TindivoSpacing.touchTarget),
                colors =
                    IconButtonDefaults.iconButtonColors(
                        containerColor = scheme.outlineVariant,
                        contentColor = scheme.onSurface,
                        // En cantidad 1 el «−» sigue legible (no se pierde en el fondo), solo que no hace nada.
                        disabledContainerColor = scheme.outlineVariant,
                        disabledContentColor = scheme.onSurfaceVariant,
                    ),
            ) {
                Icon(TindivoIcons.Remove, contentDescription = stringResource(R.string.dish_quantity_less))
            }
            Box(modifier = Modifier.widthIn(min = 32.dp), contentAlignment = Alignment.Center) {
                Text(text = quantity.toString(), style = MaterialTheme.typography.titleLarge)
            }
            IconButton(
                onClick = { onChange(quantity + 1) },
                enabled = quantity < MAX_QUANTITY,
                modifier = Modifier.size(TindivoSpacing.touchTarget),
                colors =
                    IconButtonDefaults.iconButtonColors(
                        containerColor = scheme.primaryContainer,
                        contentColor = TindivoColors.brandText,
                    ),
            ) {
                Icon(TindivoIcons.Add, contentDescription = stringResource(R.string.dish_quantity_more))
            }
        }
    }
}

/** Preguntar antes de vaciar la bolsa de otro restaurante para empezar una en [newBusinessName]. */
@Composable
internal fun NewBagDialog(
    currentBusinessName: String,
    newBusinessName: String,
    onKeep: () -> Unit,
    onReplace: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onKeep,
        title = { Text(stringResource(R.string.dish_new_bag_title)) },
        text = { Text(stringResource(R.string.dish_new_bag_text, currentBusinessName, newBusinessName)) },
        dismissButton = {
            TextButton(onClick = onKeep, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.dish_new_bag_keep))
            }
        },
        confirmButton = {
            TextButton(onClick = onReplace, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.dish_new_bag_replace))
            }
        },
    )
}
