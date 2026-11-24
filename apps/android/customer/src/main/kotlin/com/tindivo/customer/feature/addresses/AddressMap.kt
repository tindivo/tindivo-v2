package com.tindivo.customer.feature.addresses

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.CameraMoveStartedReason
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.GoogleMapComposable
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapType
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Polygon
import com.google.maps.android.compose.rememberCameraPositionState
import com.tindivo.core.designsystem.TindivoColors

private const val METERS_PER_KM = 1000.0
private const val ZONE_STROKE_ARGB = 0xFFF97316L
private const val ZONE_FILL_ARGB = 0x1AF97316L
private val ZONE_STROKE = Color(ZONE_STROKE_ARGB)
private val ZONE_FILL = Color(ZONE_FILL_ARGB)

/**
 * El mapa con el pin fijo al centro: la persona mueve el mapa y el punto es lo que queda bajo el pin. Solo un gesto
 * suyo cuenta, y solo si mueve el centro [MIN_MOVE_M] o más (un roce no fija nada). Sin [point] el pin no se dibuja,
 * salvo mientras la persona mueve el mapa: nadie ha marcado nada todavía. La cámara no sale del polígono de la zona
 * más un 25 % y su zoom va de [MIN_ZOOM] a [MAX_ZOOM].
 *
 * Con [ghostPin] el pin se dibuja atenuado aunque no haya punto (Entregas conserva ese comportamiento).
 *
 * [located] es la última lectura de «Usar mi ubicación»: al cambiar, la cámara va hasta ese punto con zoom [FIX_ZOOM].
 * [onMotion] avisa cuándo el mapa se mueve y si es por un gesto: el panel de abajo lo necesita para apagar el botón.
 *
 * Es lo único de la feature que toca el SDK de Maps, y solo se compone al abrir el formulario: es la carga diferida
 * de D-54. Sin clave de Google (la CI) el mapa sale vacío, y es lo esperado.
 */
@Composable
internal fun AddressMap(
    area: CoverageArea,
    point: GeoPoint?,
    located: Located?,
    satellite: Boolean = false,
    ghostPin: Boolean = false,
    onPointChosen: (GeoPoint) -> Unit,
    onMotion: (moving: Boolean, byGesture: Boolean) -> Unit = { _, _ -> },
    modifier: Modifier = Modifier,
) {
    val start = point ?: area.center
    val camera =
        rememberCameraPositionState {
            position =
                CameraPosition.fromLatLngZoom(LatLng(start.lat, start.lng), if (point != null) FIX_ZOOM else AREA_ZOOM)
        }
    val bounds = remember(area) { area.cameraBounds().toLatLngBounds() }
    val choose = rememberUpdatedState(onPointChosen)
    val motion = rememberUpdatedState(onMotion)
    var gesturing by remember { mutableStateOf(false) }
    // El GPS dio un punto: el mapa va hasta él. No es un gesto, así que no vuelve como elección; el punto ya lo tiene el
    // formulario y la persona puede seguir ajustándolo.
    LaunchedEffect(located) {
        val target = located?.point ?: return@LaunchedEffect
        camera.animate(CameraUpdateFactory.newLatLngZoom(LatLng(target.lat, target.lng), FIX_ZOOM))
    }
    LaunchedEffect(camera) { watchCamera(camera, start, choose, motion) { gesturing = it } }
    val outside = point != null && !area.contains(point)
    Box(modifier = modifier) {
        GoogleMap(
            modifier = Modifier.matchParentSize(),
            cameraPositionState = camera,
            properties =
                MapProperties(
                    mapType = if (satellite) MapType.HYBRID else MapType.NORMAL,
                    latLngBoundsForCameraTarget = bounds,
                    minZoomPreference = MIN_ZOOM,
                    maxZoomPreference = MAX_ZOOM,
                ),
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
        if (point != null || gesturing || ghostPin) {
            Pin(
                moving = camera.isMoving,
                outside = outside,
                modifier = Modifier.align(Alignment.Center).alpha(if (point != null || gesturing) 1f else GHOST_ALPHA),
            )
        }
    }
}

/**
 * Sigue a la cámara: avisa si se mueve y por qué, y al quedar quieta tras un gesto que movió el centro [MIN_MOVE_M] o
 * más respecto del último punto de reposo, lo da como elegido. Un movimiento que no es gesto (la animación al GPS) solo
 * actualiza el reposo.
 */
private suspend fun watchCamera(
    camera: CameraPositionState,
    initial: GeoPoint,
    choose: State<(GeoPoint) -> Unit>,
    motion: State<(Boolean, Boolean) -> Unit>,
    setGesturing: (Boolean) -> Unit,
) {
    var resting: GeoPoint? = initial
    snapshotFlow { camera.isMoving }.collect { moving ->
        val byGesture = camera.cameraMoveStartedReason == CameraMoveStartedReason.GESTURE
        setGesturing(moving && byGesture)
        motion.value(moving, byGesture)
        if (!moving) {
            val target = camera.position.target.let { GeoPoint(it.latitude, it.longitude) }
            if (byGesture) {
                if (movedEnough(resting, target)) {
                    resting = target
                    choose.value(target)
                }
            } else {
                resting = target
            }
        }
    }
}

private fun GeoBounds.toLatLngBounds() = LatLngBounds(LatLng(south, west), LatLng(north, east))

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

/** ¿El teléfono pide «reducir movimiento» (animaciones apagadas)? Entonces el pin no se eleva. */
@Composable
internal fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) { reduceMotion(context) }
}

private fun reduceMotion(context: Context): Boolean =
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

private const val GHOST_ALPHA = 0.45f
private const val PIN_WIDTH = 40
private const val PIN_HEIGHT = 52
private const val PIN_LIFT = 8
private const val PIN_BELLY = 0.6f
private const val PIN_HOLE = 0.16f
private const val PIN_HOLE_Y = 0.34f
private const val ANCHOR_DOT = 8
private const val SHADOW_ALPHA = 0.28f

/**
 * El pin dibujado de 40×52 dp: la punta queda justo en el centro del mapa, donde un punto oscuro marca el anclaje y
 * la sombra se queda quieta en el suelo. Al mover el mapa el pin sube 8 dp (sin subir con «reducir movimiento»). Rojo
 * si el punto cae fuera de la zona de reparto.
 */
@Composable
internal fun Pin(
    moving: Boolean,
    outside: Boolean,
    modifier: Modifier = Modifier,
) {
    val still = rememberReduceMotion()
    val lift: Dp by animateDpAsState(if (moving && !still) PIN_LIFT.dp else 0.dp, label = "pin-lift")
    val body = if (outside) MaterialTheme.colorScheme.error else TindivoColors.brandText
    Box(modifier = modifier) {
        Canvas(modifier = Modifier.align(Alignment.Center).size(ANCHOR_DOT.dp)) {
            drawOval(Color.Black.copy(alpha = SHADOW_ALPHA), Offset.Zero, Size(size.width, size.height))
            drawCircle(Color.White, radius = size.width / 4f)
        }
        Canvas(
            modifier =
                Modifier
                    .align(Alignment.Center)
                    .offset(y = -(PIN_HEIGHT / 2).dp - lift)
                    .size(PIN_WIDTH.dp, PIN_HEIGHT.dp),
        ) {
            val w = size.width
            val h = size.height
            val path =
                Path().apply {
                    moveTo(w / 2f, h)
                    cubicTo(0f, h * PIN_BELLY, 0f, 0f, w / 2f, 0f)
                    cubicTo(w, 0f, w, h * PIN_BELLY, w / 2f, h)
                    close()
                }
            drawPath(path, body)
            drawCircle(Color.White, radius = w * PIN_HOLE, center = Offset(w / 2f, h * PIN_HOLE_Y))
        }
    }
}
