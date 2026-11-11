package com.tindivo.customer.feature.courier

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R
import com.tindivo.customer.feature.checkout.ChoiceRow

/** Las categorías de la web: solo llenan «¿Qué llevamos?» si está vacío (el contrato no tiene categoría). */
private val CATEGORIES =
    listOf(
        R.string.courier_category_documents,
        R.string.courier_category_food,
        R.string.courier_category_medicine,
        R.string.courier_category_clothes,
    )

/** Un extremo: dónde (elegido en una hoja) y cómo llegar, y quién (celular obligatorio, nombre opcional, «Soy yo»). */
@Composable
internal fun PointSection(
    state: CourierRequestUiState,
    end: CourierEnd,
    form: CourierFormActions,
    openSheet: (CourierSheet) -> Unit,
) {
    val point = state.draft.point(end)
    val origin = end == CourierEnd.Origin
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(if (origin) R.string.courier_origin_title else R.string.courier_destination_title),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                if (point.located) {
                    TindivoTextButton(
                        text = stringResource(R.string.courier_change_place),
                        onClick = { openSheet(CourierSheet.ChoosePoint(end)) },
                    )
                }
            }
            if (point.located) {
                OutlinedTextField(
                    value = point.reference,
                    onValueChange = { form.onReference(end, it) },
                    label = { Text(stringResource(R.string.courier_reference_label)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                TindivoSecondaryButton(
                    text =
                        stringResource(if (origin) R.string.courier_choose_origin else R.string.courier_choose_destination),
                    onClick = { openSheet(CourierSheet.ChoosePoint(end)) },
                )
            }
            ContactFields(state, end, form)
        }
    }
}

@Composable
private fun ContactFields(
    state: CourierRequestUiState,
    end: CourierEnd,
    form: CourierFormActions,
) {
    val point = state.draft.point(end)
    OutlinedTextField(
        value = point.phone,
        onValueChange = { form.onPhone(end, it) },
        label = { Text(stringResource(R.string.courier_phone_label)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = point.name,
        onValueChange = { form.onName(end, it) },
        label = {
            Text(
                stringResource(
                    if (end == CourierEnd.Origin) R.string.courier_origin_name_hint else R.string.courier_destination_name_hint,
                ),
            )
        },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
    // «Soy yo» nunca se prende solo: quien pide puede no ser quien entrega ni quien recibe.
    if (state.requester?.phone != null) {
        FilterChip(
            selected = state.isMe(end),
            onClick = { form.onToggleMe(end) },
            label = { Text(stringResource(R.string.courier_me)) },
            modifier = Modifier.heightIn(min = TindivoSpacing.touchTarget),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ItemSection(
    item: String,
    onItem: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight)) {
        SectionTitle(stringResource(R.string.courier_item_title))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.tight)) {
            CATEGORIES.forEach { res ->
                val label = stringResource(res)
                FilterChip(
                    selected = item.trim() == label,
                    // Si ya escribió algo, la categoría no lo pisa (web).
                    onClick = { if (item.isBlank()) onItem(label) },
                    label = { Text(label) },
                    modifier = Modifier.heightIn(min = TindivoSpacing.touchTarget),
                )
            }
        }
        OutlinedTextField(
            value = item,
            onValueChange = onItem,
            placeholder = { Text(stringResource(R.string.courier_item_hint)) },
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = stringResource(R.string.courier_allowed_info),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
internal fun PayerSection(
    state: CourierRequestUiState,
    onPayer: (CourierPayer) -> Unit,
) {
    Column {
        SectionTitle(stringResource(R.string.courier_payer_title))
        ChoiceRow(
            selected = state.draft.payer == CourierPayer.Origin,
            enabled = true,
            title = stringResource(R.string.courier_payer_origin),
            hint = null,
            onClick = { onPayer(CourierPayer.Origin) },
        )
        ChoiceRow(
            selected = state.draft.payer == CourierPayer.Destination,
            enabled = true,
            title = stringResource(R.string.courier_payer_destination),
            hint = null,
            onClick = { onPayer(CourierPayer.Destination) },
        )
        state.service?.let {
            Text(
                text = stringResource(R.string.courier_payer_note, it.priceText),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = stringResource(R.string.courier_payer_info),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = TindivoSpacing.hairline),
        )
    }
}

@Composable
internal fun ReadyAndPaid(
    checked: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = TindivoSpacing.touchTarget)
                .toggleable(value = checked, role = Role.Checkbox, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
    ) {
        Checkbox(checked = checked, onCheckedChange = null)
        Text(text = stringResource(R.string.courier_ready_paid), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.semantics { heading() },
    )
}
