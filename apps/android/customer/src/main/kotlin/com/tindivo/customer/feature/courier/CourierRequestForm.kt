package com.tindivo.customer.feature.courier

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import java.math.BigDecimal

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
                                CourierPointDraft(
                                    BigDecimal("-9.1"),
                                    BigDecimal("-78.1"),
                                    "Puerta azul frente al mercado",
                                ),
                        ),
                ),
            onBack = {},
            form = CourierFormActions({}, {}, noop, noop, noop, {}, {}, {}, {}, {}, {}),
            openSheet = {},
        )
    }
}
