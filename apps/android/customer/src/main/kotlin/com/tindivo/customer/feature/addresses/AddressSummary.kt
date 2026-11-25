package com.tindivo.customer.feature.addresses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.GoogleMapOptions
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.rememberCameraPositionState
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R

private const val MINI_MAP_HEIGHT = 120

/**
 * El punto confirmado en el paso de los datos: un mini-mapa quieto (modo «lite» de Google Maps, 120 dp, zoom 17) con
 * el sello «Ubicación confirmada» y «Cambiar» de 48 dp para volver al mapa. Fuera de la zona, en lugar del sello dice
 * que la ubicación no está en la zona de reparto.
 */
@Composable
internal fun PointSummary(
    point: GeoPoint?,
    outside: Boolean,
    onChange: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(modifier = Modifier.fillMaxWidth().height(MINI_MAP_HEIGHT.dp).clip(RoundedCornerShape(12.dp))) {
            if (point != null) {
                MiniMap(point, Modifier.matchParentSize().clearAndSetSemantics { })
            }
            Surface(
                shape = CircleShape,
                color = if (outside) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp,
                modifier = Modifier.align(Alignment.BottomStart).padding(8.dp),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (!outside) Icon(TindivoIcons.Check, contentDescription = null, tint = TindivoColors.success)
                    Text(
                        text =
                            stringResource(
                                if (outside) R.string.address_form_outside_zone else R.string.address_summary_confirmed,
                            ),
                        style = MaterialTheme.typography.labelLarge,
                        color =
                            if (outside) {
                                MaterialTheme.colorScheme.onErrorContainer
                            } else {
                                MaterialTheme.colorScheme.onSurface
                            },
                    )
                }
            }
            FilledTonalButton(
                onClick = onChange,
                modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).heightIn(min = 48.dp),
            ) {
                Text(text = stringResource(R.string.address_step_change_point))
            }
        }
    }
}

/** Un mapa en modo «lite»: una imagen que se pide una vez, sin gestos, con el punto marcado en el centro. */
@Composable
private fun MiniMap(
    point: GeoPoint,
    modifier: Modifier,
) {
    val camera =
        rememberCameraPositionState(key = "${point.lat},${point.lng}") {
            position = CameraPosition.fromLatLngZoom(LatLng(point.lat, point.lng), SUMMARY_ZOOM)
        }
    Box(modifier = modifier) {
        GoogleMap(
            modifier = Modifier.matchParentSize(),
            cameraPositionState = camera,
            googleMapOptionsFactory = { GoogleMapOptions().liteMode(true) },
            // Sin esto, tocar un mapa «lite» abre la app de Google Maps.
            onMapClick = {},
            uiSettings =
                MapUiSettings(
                    zoomControlsEnabled = false,
                    myLocationButtonEnabled = false,
                    mapToolbarEnabled = false,
                    scrollGesturesEnabled = false,
                    zoomGesturesEnabled = false,
                ),
        )
        Pin(moving = false, outside = false, modifier = Modifier.align(Alignment.Center))
    }
}
