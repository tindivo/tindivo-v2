package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

/**
 * La hoja que sale al confirmar un pedido a domicilio que se paga al recibir cuando no hay ubicación (sin permiso o
 * sin señal), como la `GeoBlockSheet` de la web más una salida que la web no tiene: «Intentar de nuevo» (primero, no le
 * cuesta nada), «Cambiar a pago por adelantado» y «Continuar sin ubicación». Negar el GPS nunca impide pedir
 * (CA-CHK-10): el pedido sale igual y decide el servidor.
 */
@Composable
internal fun GpsBlockSheet(
    sheet: CheckoutSheet.GpsBlock,
    actions: CheckoutSheetActions,
) {
    SheetFrame(title = stringResource(R.string.checkout_gps_title), onClose = actions.onClose) {
        ScrollingBody {
            Column(modifier = Modifier.fillMaxWidth()) {
                val body =
                    if (sheet.noPermission) R.string.checkout_gps_body_permission else R.string.checkout_gps_body_signal
                Text(text = stringResource(body), style = MaterialTheme.typography.bodyMedium)
                // «Sin conexión» solo aparece en el reintento: la primera vez no se sabe si es la red.
                if (sheet.afterRetry) {
                    Text(
                        text = stringResource(R.string.checkout_gps_after_retry),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                Button(
                    onClick = actions.onGpsRetry,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(top = 16.dp),
                ) {
                    Text(text = stringResource(R.string.checkout_gps_retry))
                }
                OutlinedButton(
                    onClick = actions.onGpsPrepay,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(top = 8.dp),
                ) {
                    Text(text = stringResource(R.string.checkout_gps_prepay))
                }
                TextButton(
                    onClick = actions.onGpsContinue,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(top = 8.dp),
                ) {
                    Text(text = stringResource(R.string.checkout_gps_continue))
                }
            }
        }
    }
}
