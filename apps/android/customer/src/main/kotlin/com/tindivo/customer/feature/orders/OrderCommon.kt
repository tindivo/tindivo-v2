package com.tindivo.customer.feature.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tindivo.core.network.AppError
import com.tindivo.customer.R

@Composable
internal fun OrdersLoading() {
    val description = stringResource(R.string.orders_loading)
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = description })
    }
}

/** El mensaje de error y, si [onRetry] no es `null`, el botón para volver a intentar. */
@Composable
internal fun OrdersFailure(
    error: AppError,
    onRetry: (() -> Unit)?,
) {
    val message =
        if (error is AppError.Network) {
            stringResource(
                R.string.error_network,
            )
        } else {
            stringResource(R.string.error_generic)
        }
    Column(modifier = Modifier.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = message, style = MaterialTheme.typography.bodyLarge)
        if (onRetry != null) {
            Button(
                onClick = onRetry,
                modifier = Modifier.heightIn(min = 48.dp),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
            ) {
                Text(text = stringResource(R.string.orders_retry))
            }
        }
    }
}

/** Hace cuánto se hizo un pedido, con los tramos de la web. */
@Composable
internal fun relativeDateText(date: RelativeDate): String =
    when (date) {
        RelativeDate.JustNow -> stringResource(R.string.order_ago_now)
        is RelativeDate.Minutes -> stringResource(R.string.order_ago_minutes, date.value)
        is RelativeDate.Hours -> stringResource(R.string.order_ago_hours, date.value)
        RelativeDate.Yesterday -> stringResource(R.string.order_ago_yesterday)
        is RelativeDate.Days -> pluralStringResource(R.plurals.order_ago_days, date.value.toInt(), date.value)
        is RelativeDate.OnDate -> shortDateText(date.date)
    }
