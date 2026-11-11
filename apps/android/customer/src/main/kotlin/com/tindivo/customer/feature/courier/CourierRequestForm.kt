package com.tindivo.customer.feature.courier

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.tooling.preview.Preview
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import com.tindivo.customer.feature.checkout.ChoiceRow
import java.math.BigDecimal

/** Lo que el formulario le pide al ViewModel. Se separa para poder pintar la pantalla sin él (vista previa). */
internal class CourierFormActions(
    val onRetry: () -> Unit,
    val onOpenSheet: (CourierSheet) -> Unit,
    val onReference: (CourierEnd, String) -> Unit,
    val onPhone: (CourierEnd, String) -> Unit,
    val onName: (CourierEnd, String) -> Unit,
    val onToggleMe: (CourierEnd) -> Unit,
    val onItem: (String) -> Unit,
    val onPayer: (CourierPayer) -> Unit,
    val onNote: (String) -> Unit,
    val onReadyAndPaid: (Boolean) -> Unit,
    val onSubmit: () -> Unit,
) {
    companion object {
        fun of(viewModel: CourierRequestViewModel) =
            CourierFormActions(
                onRetry = viewModel::retry,
                onOpenSheet = viewModel::openSheet,
                onReference = viewModel::setReference,
                onPhone = viewModel::setPhone,
                onName = viewModel::setName,
                onToggleMe = viewModel::toggleMe,
                onItem = viewModel::setItem,
                onPayer = viewModel::setPayer,
                onNote = viewModel::setNote,
                onReadyAndPaid = viewModel::setReadyAndPaid,
                onSubmit = viewModel::submit,
            )
    }
}

/** Las categorías de la web: solo llenan «¿Qué llevamos?» si está vacío (el contrato no tiene categoría). */
private val CATEGORIES =
    listOf(
        R.string.courier_category_documents,
        R.string.courier_category_food,
        R.string.courier_category_medicine,
        R.string.courier_category_clothes,
    )

/**
 * El formulario, en el orden de la web: de dónde, a dónde, qué llevamos, quién paga, indicaciones y la casilla de
 * «listo y pagado». Lo que falta para pedir se dice sobre el botón; dirección, celular y nombre se resuelven en hojas
 * encima, sin ir a «Mi cuenta».
 */
@Composable
internal fun CourierRequestForm(
    state: CourierRequestUiState,
    onBack: () -> Unit,
    form: CourierFormActions,
    openSheet: (CourierSheet) -> Unit,
) {
    Scaffold(
        topBar = { CourierTopBar(title = stringResource(R.string.courier_request_title), onBack = onBack) },
        bottomBar = { SubmitBar(state = state, form = form, openSheet = openSheet) },
    ) { padding ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.section),
        ) {
            CourierEnd.entries.forEach { end -> PointSection(state, end, form, openSheet) }
            ItemSection(state.draft.item, form.onItem)
            PayerSection(state, form.onPayer)
            OutlinedTextField(
                value = state.draft.note,
                onValueChange = form.onNote,
                label = { Text(stringResource(R.string.courier_note_label)) },
                placeholder = { Text(stringResource(R.string.courier_note_hint)) },
                modifier = Modifier.fillMaxWidth(),
            )
            ReadyAndPaid(checked = state.draft.readyAndPaid, onChange = form.onReadyAndPaid)
        }
    }
}

/** Un extremo: dónde (elegido en una hoja) y cómo llegar, y quién (celular obligatorio, nombre opcional, «Soy yo»). */
@Composable
private fun PointSection(
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
private fun ItemSection(
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
private fun PayerSection(
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
private fun ReadyAndPaid(
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

/**
 * Lo que falta (o lo que respondió el servidor) y el botón. Sin el celular verificado, el botón para verificarlo abre
 * la hoja del SMS. Un toque mientras se envía no hace nada: el botón queda cargando.
 */
@Composable
private fun SubmitBar(
    state: CourierRequestUiState,
    form: CourierFormActions,
    openSheet: (CourierSheet) -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLowest, shadowElevation = TindivoSpacing.hairline) {
        Column(
            modifier = Modifier.navigationBarsPadding().padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
        ) {
            val missing = state.missing
            val message = state.message
            when {
                message != null -> {
                    Text(text = sendMessageText(message), color = MaterialTheme.colorScheme.error)
                }

                missing != null -> {
                    Text(
                        text = stringResource(missing.textRes()),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (missing == CourierMissing.RequesterPhone) {
                TindivoSecondaryButton(
                    text = stringResource(R.string.courier_verify_phone),
                    onClick = { openSheet(CourierSheet.VerifyPhone) },
                    enabled = !state.sending,
                )
            }
            TindivoPrimaryButton(
                text = stringResource(R.string.courier_submit, state.service?.priceText.orEmpty()),
                onClick = form.onSubmit,
                enabled = missing == null,
                loading = state.sending,
            )
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFFFAF6F1)
@Composable
private fun CourierRequestFormPreview() {
    val noop: (CourierEnd, String) -> Unit = { _, _ -> }
    TindivoTheme {
        CourierRequestForm(
            state =
                CourierRequestUiState(
                    phase = RequestPhase.Form,
                    service = CourierServiceUi(true, true, "S/ 3.00", "18:00", "23:00", null),
                    requester = CourierRequester("Ana", "+51987654321", phoneVerified = true),
                    draft =
                        CourierDraft(
                            origin =
                                CourierPointDraft(BigDecimal("-9.1"), BigDecimal("-78.1"), "Puerta azul frente al mercado"),
                        ),
                ),
            onBack = {},
            form = CourierFormActions({}, {}, noop, noop, noop, {}, {}, {}, {}, {}, {}),
            openSheet = {},
        )
    }
}
