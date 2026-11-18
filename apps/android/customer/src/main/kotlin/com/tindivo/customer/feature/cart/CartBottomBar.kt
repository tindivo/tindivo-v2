package com.tindivo.customer.feature.cart

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

/** «Continuar» con la píldora del total; si no se puede tocar, el motivo va encima, a la vista (CUS-CRT-009). */
@Composable
internal fun CartBottomBar(
    cta: ContinueUi,
    onContinue: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        cta.blocked?.let {
            Text(
                text = stringResource(it.reasonRes()),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        Button(
            onClick = onContinue,
            enabled = cta.blocked == null,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(text = stringResource(R.string.cart_continue))
                Surface(shape = RoundedCornerShape(percent = 50), color = MaterialTheme.colorScheme.onPrimary) {
                    Text(
                        text = cta.amount,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 2.dp),
                    )
                }
            }
        }
    }
}

private fun ContinueBlock.reasonRes(): Int =
    when (this) {
        ContinueBlock.Checking -> R.string.cart_continue_checking
        ContinueBlock.CheckFailed -> R.string.cart_continue_check_failed
        ContinueBlock.Closed -> R.string.cart_continue_closed
        ContinueBlock.InvalidLines -> R.string.cart_continue_invalid
    }
