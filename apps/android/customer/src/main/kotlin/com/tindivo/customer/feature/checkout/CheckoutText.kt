package com.tindivo.customer.feature.checkout

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tindivo.customer.R
import com.tindivo.customer.feature.cart.formatSoles
import java.math.BigDecimal

/** Los importes ya pasaron por [parseApiAmount]: tienen dos decimales y [formatSoles] no redondea. */
internal fun BigDecimal.soles(): String = formatSoles(this)

@Composable
internal fun CheckoutMessage.text(): String =
    when (this) {
        is CheckoutMessage.Server -> detail.ifBlank { stringResource(R.string.checkout_msg_generic) }
        CheckoutMessage.Generic -> stringResource(R.string.checkout_msg_generic)
        CheckoutMessage.Offline -> stringResource(R.string.checkout_msg_offline)
        CheckoutMessage.QuoteFailed -> stringResource(R.string.checkout_msg_quote_failed)
        CheckoutMessage.StillProcessing -> stringResource(R.string.checkout_msg_still_processing)
        is CheckoutMessage.TotalChanged -> stringResource(R.string.checkout_msg_total_changed, total.soles())
        CheckoutMessage.OptionsChanged -> stringResource(R.string.checkout_msg_options_changed)
    }

@Composable
internal fun Cta.label(): String =
    when (this) {
        Cta.Sending -> stringResource(R.string.checkout_cta_sending)
        Cta.Calculating -> stringResource(R.string.checkout_cta_calculating)
        Cta.QuoteProblem -> stringResource(R.string.checkout_cta_quote_problem)
        Cta.NeedName -> stringResource(R.string.checkout_cta_name)
        Cta.NeedPickupAnswer -> stringResource(R.string.checkout_cta_pickup_answer)
        Cta.NeedAddress -> stringResource(R.string.checkout_cta_address)
        Cta.NeedFixAddress -> stringResource(R.string.checkout_cta_fix_address)
        Cta.NeedReference -> stringResource(R.string.checkout_cta_reference)
        Cta.NeedPin -> stringResource(R.string.checkout_cta_pin)
        Cta.NeedPhone -> stringResource(R.string.checkout_cta_phone)
        Cta.NeedPay -> stringResource(R.string.checkout_cta_pay)
        Cta.NeedCash -> stringResource(R.string.checkout_cta_cash)
        is Cta.Ready -> stringResource(R.string.checkout_cta_confirm, total.soles())
    }

/** El texto de por qué un monto de efectivo no vale; `null` si vale. [total] es el de la cotización. */
@Composable
internal fun CashCheck.problem(total: BigDecimal): String? =
    when (this) {
        is CashCheck.Ok -> {
            null
        }

        is CashCheck.Missing -> {
            stringResource(R.string.checkout_cash_missing, maxDeclarable.soles())
        }

        is CashCheck.BelowTotal -> {
            stringResource(R.string.checkout_cash_below_total, total.soles())
        }

        is CashCheck.AboveMaxBill -> {
            stringResource(R.string.checkout_cash_above_max, maxBill.soles())
        }

        is CashCheck.NotMultiple -> {
            stringResource(R.string.checkout_cash_not_multiple, step.soles())
        }

        is CashCheck.NoChangeTonight -> {
            stringResource(R.string.checkout_cash_no_change_tonight, total.soles())
        }

        is CashCheck.ChangeTooHigh -> {
            stringResource(
                R.string.checkout_cash_change_too_high,
                (total + change).soles(),
                change.soles(),
                maxChange.soles(),
                highest.soles(),
            )
        }
    }
