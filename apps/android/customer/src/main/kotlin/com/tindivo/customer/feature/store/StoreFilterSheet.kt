package com.tindivo.customer.feature.store

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R

/**
 * Hoja de filtros (como la web): Condición y Orden, «Limpiar» arriba y un botón que dice cuántas piezas vas a ver. El
 * borrador no cambia la lista hasta tocar ese botón; cerrar la hoja lo descarta.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun StoreFilterSheetView(
    sheet: StoreFilterSheet,
    actions: StoreFilterSheetActions,
) {
    ModalBottomSheet(onDismissRequest = actions.onDismiss) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.store_filters),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                TindivoTextButton(text = stringResource(R.string.store_filters_reset), onClick = actions.onReset)
            }
            SectionLabel(R.string.store_filter_condition)
            Row(horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.tight)) {
                StoreConditionFilter.entries.forEach { condition ->
                    FilterChip(
                        selected = sheet.condition == condition,
                        onClick = { actions.onCondition(condition) },
                        label = { Text(stringResource(condition.label())) },
                        modifier = Modifier.heightIn(min = TindivoSpacing.touchTarget),
                    )
                }
            }
            SectionLabel(R.string.store_filter_order)
            Column(modifier = Modifier.selectableGroup()) {
                StoreOrder.entries.forEach { order ->
                    OrderOption(order = order, selected = sheet.order == order, onSelect = { actions.onOrder(order) })
                }
            }
            val count = sheet.count
            TindivoPrimaryButton(
                text =
                    if (count == null) {
                        stringResource(R.string.store_filters_see)
                    } else {
                        pluralStringResource(R.plurals.store_filters_see_count, count, count)
                    },
                onClick = actions.onApply,
                modifier = Modifier.padding(top = TindivoSpacing.tight, bottom = TindivoSpacing.section),
            )
        }
    }
}

@Composable
private fun SectionLabel(
    @StringRes text: Int,
) {
    Text(
        text = stringResource(text),
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(top = TindivoSpacing.tight).semantics { heading() },
    )
}

@Composable
private fun OrderOption(
    order: StoreOrder,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = TindivoSpacing.touchTarget)
                .selectable(selected = selected, onClick = onSelect, role = Role.RadioButton),
    ) {
        Text(text = stringResource(order.label()), modifier = Modifier.weight(1f))
        // La fila entera se toca; el botón solo dibuja la selección.
        RadioButton(selected = selected, onClick = null)
    }
}

@StringRes
private fun StoreConditionFilter.label(): Int =
    when (this) {
        StoreConditionFilter.All -> R.string.store_condition_all
        StoreConditionFilter.New -> R.string.store_condition_new
        StoreConditionFilter.Used -> R.string.store_condition_used
    }

@StringRes
private fun StoreOrder.label(): Int =
    when (this) {
        StoreOrder.Recent -> R.string.store_order_recent
        StoreOrder.PriceAsc -> R.string.store_order_price_asc
        StoreOrder.PriceDesc -> R.string.store_order_price_desc
    }
