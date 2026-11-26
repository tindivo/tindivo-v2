package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoTextButton
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
                Text(text = stringResource(body), style = MaterialTheme.typography.bodyLarge)
                // «Sin conexión» solo aparece en el reintento: la primera vez no se sabe si es la red.
                if (sheet.afterRetry) {
                    Text(
                        text = stringResource(R.string.checkout_gps_after_retry),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                Column(modifier = Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Cada botón lleva su alto (56 dp) y la separación va en el Column, no en un padding que se lo coma.
                    TindivoPrimaryButton(
                        text = stringResource(R.string.checkout_gps_retry),
                        onClick = actions.onGpsRetry,
                    )
                    TindivoSecondaryButton(
                        text = stringResource(R.string.checkout_gps_prepay),
                        onClick = actions.onGpsPrepay,
                    )
                    TindivoTextButton(
                        text = stringResource(R.string.checkout_gps_continue),
                        onClick = actions.onGpsContinue,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}
