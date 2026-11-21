package com.tindivo.customer.feature.catalog.home

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

/** La puerta a Tindivo Store en el Inicio: fondo `primaryContainer`. Hoy no se muestra (ver [serviceCards]). */
@Composable
internal fun StoreEntryCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ServiceTile(
        title = stringResource(R.string.store_entry_title),
        tagline = stringResource(R.string.home_store_tagline),
        icon = TindivoIcons.ShoppingBag,
        accent = false,
        onClick = onClick,
        modifier = modifier,
    )
}

@Preview(showBackground = true, backgroundColor = 0xFFF7F8FA)
@Composable
private fun StoreEntryCardPreview() {
    TindivoTheme { StoreEntryCard(onClick = {}) }
}
