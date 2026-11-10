package com.tindivo.customer.feature.orders

import android.content.ClipData
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.customer.R
import kotlinx.coroutines.launch

/** Cuánto pagar ([amount], el total del servidor ya con «S/») y a quién. */
@Composable
internal fun PrepayPayeeCard(
    amount: String,
    payee: PrepayPayee?,
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column {
                Text(
                    text = stringResource(R.string.prepay_amount_label),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(text = amount, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            }
            if (payee == null) {
                Text(text = stringResource(R.string.prepay_no_account), style = MaterialTheme.typography.bodyMedium)
            } else {
                PayeeDetails(payee = payee)
            }
        }
    }
}

@Composable
private fun PayeeDetails(payee: PrepayPayee) {
    val walletName = stringResource(payee.wallet.nameRes())
    Text(
        text = stringResource(R.string.prepay_wallet_of_business, walletName),
        style = MaterialTheme.typography.titleSmall,
    )
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = payee.accountNumber, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            payee.accountName?.let {
                Text(text = it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        CopyNumberButton(number = payee.accountNumber)
    }
    val qr = payee.qrUrl
    if (qr == null) {
        Text(text = stringResource(R.string.prepay_no_qr, walletName), style = MaterialTheme.typography.bodyMedium)
    } else {
        QrPreview(url = qr, walletName = walletName)
    }
}

@Composable
private fun CopyNumberButton(number: String) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copied by remember(number) { mutableStateOf(false) }
    val description = stringResource(R.string.prepay_copy_description, number)
    val copiedText = stringResource(R.string.prepay_copied)
    FilledTonalButton(
        onClick = {
            scope.launch { clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(number, number))) }
            copied = true
        },
        modifier =
            Modifier
                .heightIn(min = 48.dp)
                .semantics {
                    contentDescription = if (copied) copiedText else description
                    liveRegion = LiveRegionMode.Polite
                },
    ) {
        Text(text = if (copied) copiedText else stringResource(R.string.prepay_copy))
    }
}

@Composable
private fun QrPreview(
    url: String,
    walletName: String,
) {
    var zoomed by rememberSaveable { mutableStateOf(false) }
    val description = stringResource(R.string.prepay_qr_description, walletName)
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        AsyncImage(
            model = url,
            contentDescription = description,
            contentScale = ContentScale.Fit,
            modifier =
                Modifier
                    .size(160.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(role = Role.Button) { zoomed = true },
        )
        Text(
            text = stringResource(R.string.prepay_qr_hint, walletName),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    if (zoomed) {
        AlertDialog(
            onDismissRequest = { zoomed = false },
            confirmButton = {
                TextButton(onClick = { zoomed = false }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = stringResource(R.string.prepay_close))
                }
            },
            text = {
                AsyncImage(
                    model = url,
                    contentDescription = description,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 280.dp),
                )
            },
        )
    }
}

private fun PayWallet?.nameRes(): Int =
    when (this) {
        PayWallet.Yape -> R.string.prepay_wallet_yape
        PayWallet.Plin -> R.string.prepay_wallet_plin
        PayWallet.Other, null -> R.string.prepay_wallet_any
    }
