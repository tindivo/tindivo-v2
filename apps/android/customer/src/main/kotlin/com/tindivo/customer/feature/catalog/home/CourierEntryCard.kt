package com.tindivo.customer.feature.catalog.home

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

/** La puerta a Tindivo Entregas en el Inicio: degradado naranja. Los datos del servicio los dice su portada. */
@Composable
internal fun CourierEntryCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ServiceTile(
        title = stringResource(R.string.home_courier_title),
        tagline = stringResource(R.string.home_courier_tagline),
        style = ServiceTileStyle.Courier,
        onClick = onClick,
        modifier = modifier,
    )
}

@Preview(showBackground = true, backgroundColor = 0xFFF7F8FA)
@Composable
private fun CourierEntryCardPreview() {
    TindivoTheme { CourierEntryCard(onClick = {}) }
}
