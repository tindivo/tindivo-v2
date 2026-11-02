package com.tindivo.customer.feature.addresses

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.CameraMoveStartedReason
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.GoogleMapComposable
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Polygon
import com.google.maps.android.compose.rememberCameraPositionState

private const val POINT_ZOOM = 17f
private const val AREA_ZOOM = 15f
private const val METERS_PER_KM = 1000.0
private const val ZONE_STROKE_ARGB = 0xFFF97316L
private const val ZONE_FILL_ARGB = 0x1AF97316L
private val ZONE_STROKE = Color(ZONE_STROKE_ARGB)
private val ZONE_FILL = Color(ZONE_FILL_ARGB)

/**
 * El mapa con el pin fijo al centro: la persona mueve el mapa y el punto es lo que queda bajo el pin. Solo un gesto
 * suyo cuenta (cuando el mapa se mueve por otra causa no se toma como elección). Sin [point] el pin sale atenuado:
 * nadie ha marcado nada todavía.
 *
 * Es lo único de la feature que toca el SDK de Maps, y solo se compone al abrir el formulario: es la carga diferida
 * de D-54. Sin clave de Google (la CI) el mapa sale vacío, y es lo esperado.
 */
@Composable
internal fun AddressMap(
    area: CoverageArea,
    point: GeoPoint?,
    onPointChosen: (GeoPoint) -> Unit,
    modifier: Modifier = Modifier,
) {
    val start = point ?: area.center
    val camera =
        rememberCameraPositionState {
            position =
                CameraPosition.fromLatLngZoom(
                    LatLng(start.lat, start.lng),
                    if (point !=
                        null
                    ) {
                        POINT_ZOOM
                    } else {
                        AREA_ZOOM
                    },
                )
        }
    LaunchedEffect(camera) {
        snapshotFlow { camera.isMoving }.collect { moving ->
            if (!moving && camera.cameraMoveStartedReason == CameraMoveStartedReason.GESTURE) {
                val target = camera.position.target
                onPointChosen(GeoPoint(target.latitude, target.longitude))
            }
        }
    }
    Box(modifier = modifier) {
        GoogleMap(
            modifier = Modifier.matchParentSize(),
            cameraPositionState = camera,
            uiSettings =
                MapUiSettings(
                    zoomControlsEnabled = false,
                    myLocationButtonEnabled = false,
                    mapToolbarEnabled = false,
                    rotationGesturesEnabled = false,
                    tiltGesturesEnabled = false,
                ),
        ) {
            ZoneOutline(area)
        }
        Pin(modifier = Modifier.align(Alignment.Center).alpha(if (point != null) 1f else 0.45f))
    }
}

@Composable
@GoogleMapComposable
private fun ZoneOutline(area: CoverageArea) {
    when (area) {
        is CoverageArea.Polygon -> {
            Polygon(
                points = area.vertices.map { LatLng(it.lat, it.lng) },
                strokeColor = ZONE_STROKE,
                strokeWidth = 4f,
                fillColor = ZONE_FILL,
            )
        }

        is CoverageArea.Circle -> {
            Circle(
                center = LatLng(area.center.lat, area.center.lng),
                radius = area.radiusKm * METERS_PER_KM,
                strokeColor = ZONE_STROKE,
                strokeWidth = 4f,
                fillColor = ZONE_FILL,
            )
        }
    }
}

/** Un pin dibujado: la punta queda justo en el centro del mapa (el pin sube la mitad de su alto). */
@Composable
private fun Pin(modifier: Modifier = Modifier) {
    Box(modifier = modifier.padding(bottom = PIN_HEIGHT.dp)) {
        Canvas(modifier = Modifier.size(PIN_WIDTH.dp, PIN_HEIGHT.dp)) {
            val w = size.width
            val h = size.height
            val path =
                Path().apply {
                    moveTo(w / 2f, h)
                    cubicTo(0f, h * PIN_BELLY, 0f, 0f, w / 2f, 0f)
                    cubicTo(w, 0f, w, h * PIN_BELLY, w / 2f, h)
                    close()
                }
            drawPath(path, ZONE_STROKE)
            drawCircle(Color.White, radius = w * PIN_HOLE, center = Offset(w / 2f, h * PIN_HOLE_Y))
        }
    }
}

private const val PIN_WIDTH = 32
private const val PIN_HEIGHT = 44
private const val PIN_BELLY = 0.6f
private const val PIN_HOLE = 0.16f
private const val PIN_HOLE_Y = 0.34f
