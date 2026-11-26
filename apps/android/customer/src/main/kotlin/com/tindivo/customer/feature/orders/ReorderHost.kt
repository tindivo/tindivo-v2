package com.tindivo.customer.feature.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R
import com.tindivo.customer.feature.catalog.business.NewBagDialog

/**
 * Lo que sigue a «Volver a pedir» (CUS-CRT-012). Sin cambios, va directo a la bolsa repuesta; con cambios, antes los
 * dice; con la bolsa de otro negocio, pregunta antes de vaciarla (CUS-CRT-001), como al agregar un plato.
 */
@Composable
internal fun ReorderHost(
    outcome: ReorderOutcome?,
    onOpenCart: () -> Unit,
    onConsume: () -> Unit,
    onReplace: () -> Unit,
) {
    val cleanReady = outcome is ReorderOutcome.Ready && outcome.changes.isEmpty()
    LaunchedEffect(cleanReady) {
        if (cleanReady) {
            onConsume()
            onOpenCart()
        }
    }
    when (outcome) {
        is ReorderOutcome.Ready -> {
            if (outcome.changes.isNotEmpty()) {
                ChangesDialog(
                    title = R.string.reorder_changes_title,
                    changes = outcome.changes,
                    confirm = R.string.reorder_changes_open,
                    onConfirm = {
                        onConsume()
                        onOpenCart()
                    },
                )
            }
        }

        is ReorderOutcome.OtherBusiness -> {
            NewBagDialog(
                currentBusinessName = outcome.currentBusinessName,
                newBusinessName = outcome.newBusinessName,
                onKeep = onConsume,
                onReplace = onReplace,
            )
        }

        is ReorderOutcome.NothingAvailable -> {
            ChangesDialog(
                title = R.string.reorder_nothing_title,
                intro = R.string.reorder_nothing_text,
                changes = outcome.changes,
                confirm = R.string.reorder_ok,
                onConfirm = onConsume,
            )
        }

        is ReorderOutcome.Failed -> {
            AlertDialog(
                onDismissRequest = onConsume,
                title = { Text(stringResource(R.string.reorder_failed_title)) },
                text = { Text(stringResource(R.string.reorder_failed_text)) },
                confirmButton = {
                    TextButton(onClick = onConsume, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(stringResource(R.string.reorder_ok))
                    }
                },
            )
        }

        null -> {
            Unit
        }
    }
}

@Composable
private fun ChangesDialog(
    title: Int,
    changes: List<ReorderChangeUi>,
    confirm: Int,
    onConfirm: () -> Unit,
    intro: Int? = null,
) {
    AlertDialog(
        onDismissRequest = onConfirm,
        title = { Text(stringResource(title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                intro?.let { Text(stringResource(it)) }
                changes.forEach { Text(it.text()) }
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(confirm))
            }
        },
    )
}

@Composable
private fun ReorderChangeUi.text(): String =
    when (kind) {
        ReorderChangeKind.Removed -> {
            stringResource(R.string.reorder_change_removed, itemName)
        }

        ReorderChangeKind.Unavailable -> {
            stringResource(R.string.reorder_change_unavailable, itemName)
        }

        ReorderChangeKind.ChooseAgain -> {
            stringResource(R.string.reorder_change_choose_again, itemName)
        }

        ReorderChangeKind.Unknown -> {
            stringResource(R.string.reorder_change_unknown, itemName)
        }

        ReorderChangeKind.PriceChanged -> {
            val was = before?.let(::apiMoneyTextOrNull)
            val now = after?.let(::apiMoneyTextOrNull)
            if (was != null && now != null) {
                stringResource(R.string.reorder_change_price, itemName, was, now)
            } else {
                stringResource(R.string.reorder_change_unknown, itemName)
            }
        }
    }
