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
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R
import com.tindivo.customer.ui.NumberedStep
import kotlinx.coroutines.launch

/**
 * Los pasos 1 y 2 del pago: «Copia el número» y «Paga S/ X en Yape». [amount] es el total del servidor ya con «S/»;
 * el monto también se copia, para no teclearlo. El QR queda plegado tras «Ver QR».
 */
@Composable
internal fun PrepayPayeeCard(
    amount: String,
    payee: PrepayPayee?,
) {
    if (payee == null) {
        Surface(
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = stringResource(R.string.prepay_amount_label),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(text = amount, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text(text = stringResource(R.string.prepay_no_account), style = MaterialTheme.typography.bodyMedium)
            }
        }
        return
    }
    val walletName = stringResource(payee.wallet.nameRes())
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        NumberedStep(number = 1) {
            Text(text = stringResource(R.string.prepay_step_copy), style = MaterialTheme.typography.titleMedium)
            AccountBox(payee = payee, walletName = walletName)
        }
        NumberedStep(number = 2) {
            Text(
                text = stringResource(R.string.prepay_step_pay, amount, walletName),
                style = MaterialTheme.typography.titleMedium,
            )
            AmountBox(amount = amount)
            QrToggle(qr = payee.qrUrl, walletName = walletName)
        }
    }
}

@Composable
private fun AccountBox(
    payee: PrepayPayee,
    walletName: String,
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.prepay_wallet_of_business, walletName),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = payee.accountNumber,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                payee.accountName?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            CopyButton(
                text = payee.accountNumber,
                description = stringResource(R.string.prepay_copy_description, payee.accountNumber),
            )
        }
    }
}

@Composable
private fun AmountBox(amount: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.prepay_amount_label),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(text = amount, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            }
            CopyButton(
                text = amountToCopy(amount),
                description = stringResource(R.string.prepay_copy_amount_description, amount),
            )
        }
    }
}

/** Copia [text] al portapapeles y dice «Copiado»; [description] es lo que lee TalkBack antes de copiar. */
@Composable
private fun CopyButton(
    text: String,
    description: String,
) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copied by remember(text) { mutableStateOf(false) }
    val copiedText = stringResource(R.string.prepay_copied)
    FilledTonalButton(
        onClick = {
            scope.launch { clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(text, text))) }
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

/** «Ver QR» despliega el código; plegado no ocupa media pantalla. Sin QR, dice desde dónde transferir. */
@Composable
private fun QrToggle(
    qr: String?,
    walletName: String,
) {
    if (qr == null) {
        Text(text = stringResource(R.string.prepay_no_qr, walletName), style = MaterialTheme.typography.bodyMedium)
        return
    }
    var shown by rememberSaveable { mutableStateOf(false) }
    TindivoTextButton(
        text = stringResource(if (shown) R.string.prepay_hide_qr else R.string.prepay_show_qr),
        onClick = { shown = !shown },
    )
    if (shown) QrPreview(url = qr, walletName = walletName)
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
            style = MaterialTheme.typography.bodyMedium,
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
