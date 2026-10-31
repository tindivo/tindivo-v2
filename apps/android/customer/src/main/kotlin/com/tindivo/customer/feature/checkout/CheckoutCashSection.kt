package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R
import java.math.BigDecimal

/** «¿Con cuánto pagas?»: los montos rápidos de la cotización y «Otro». Las reglas salen de `payment.cash`. */
@Composable
internal fun CashSelector(
    total: BigDecimal,
    rules: CashRules,
    choice: CashChoice,
    onChoice: (CashChoice) -> Unit,
) {
    val check = checkCash(choice.payingWith(total), total, rules)
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = stringResource(R.string.checkout_cash_total, total.soles()),
                style = MaterialTheme.typography.titleSmall,
            )
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                cashChips(total, rules).forEach { chip -> CashChipView(chip, total, choice, onChoice) }
                FilterChip(
                    selected = choice is CashChoice.Other,
                    onClick = { onChoice(if (choice is CashChoice.Other) choice else CashChoice.Other("")) },
                    label = { Text(stringResource(R.string.checkout_cash_other)) },
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
            if (choice is CashChoice.Other) {
                OutlinedTextField(
                    value = choice.text,
                    onValueChange = { onChoice(CashChoice.Other(it)) },
                    label = { Text(stringResource(R.string.checkout_cash_input)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            CashFeedback(choice, check, total, rules)
        }
    }
}

@Composable
private fun CashChipView(
    chip: CashChip,
    total: BigDecimal,
    choice: CashChoice,
    onChoice: (CashChoice) -> Unit,
) {
    val selected =
        if (chip.exact) {
            choice == CashChoice.Exact
        } else {
            choice is CashChoice.Bill && choice.amount.compareTo(chip.amount) == 0
        }
    val sub =
        when {
            chip.exact -> stringResource(R.string.checkout_cash_no_change)
            !chip.enabled -> stringResource(R.string.checkout_cash_no_change_today)
            else -> stringResource(R.string.checkout_cash_change, (chip.amount - total).soles())
        }
    val title = if (chip.exact) stringResource(R.string.checkout_cash_exact) else chip.amount.soles()
    FilterChip(
        selected = selected,
        enabled = chip.enabled,
        onClick = { onChoice(if (chip.exact) CashChoice.Exact else CashChoice.Bill(chip.amount)) },
        label = {
            Column {
                Text(text = title)
                Text(text = sub, style = MaterialTheme.typography.labelSmall)
            }
        },
        modifier = Modifier.heightIn(min = 48.dp),
    )
}

@Composable
private fun CashFeedback(
    choice: CashChoice,
    check: CashCheck,
    total: BigDecimal,
    rules: CashRules,
) {
    val problem = check.problem(total)
    when {
        choice == CashChoice.None -> {
            Text(
                text = stringResource(R.string.checkout_cash_can_pay_up_to, maxDeclarable(total, rules).soles()),
                style = MaterialTheme.typography.bodySmall,
            )
        }

        problem != null -> {
            Text(text = problem, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }

        check is CashCheck.Ok -> {
            Text(text = okText(check, rules), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun okText(
    check: CashCheck.Ok,
    rules: CashRules,
): String =
    when {
        check.change.signum() > 0 -> stringResource(R.string.checkout_cash_ok_change, check.change.soles())
        rules.maxChange.signum() == 0 -> stringResource(R.string.checkout_cash_ok_no_change_tonight)
        else -> stringResource(R.string.checkout_cash_ok_exact)
    }
