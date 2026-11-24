package com.tindivo.customer.feature.addresses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R
import kotlinx.coroutines.delay

private const val PILL_MS = 4_000L
private const val PANEL_MAX_DP = 380

/**
 * Paso 1: el mapa en una columna (el mapa ocupa lo que sobra y el panel va debajo, así el pin queda al centro de lo
 * que se ve). Sin punto, el panel es la tarjeta de bienvenida; después dice, según el mapa se mueva, esté quieto dentro
 * o fuera de la zona, qué hacer, y el botón solo se enciende con el mapa quieto y dentro de la zona.
 */
@Composable
internal fun MapStep(
    state: AddressFormState,
    actions: AddressFormActions,
    modifier: Modifier,
    showClose: Boolean,
    onConfirm: () -> Unit,
) {
    val requester =
        rememberLocationRequester(
            state = state,
            onPermission = actions.onLocationPermission,
            onLeave = actions.onStopLocating,
            onForegroundChanged = actions.onForegroundChanged,
        )
    var started by rememberSaveable { mutableStateOf(false) }
    var satellite by rememberSaveable { mutableStateOf(false) }
    var autoTried by rememberSaveable { mutableStateOf(false) }
    var moving by remember { mutableStateOf(false) }
    // D-E: con el permiso YA concedido, al abrir el mapa sin punto se lee el GPS solo; sin él, nunca se pide solo.
    LaunchedEffect(Unit) {
        if (!autoTried) {
            autoTried = true
            if (state.point == null && requester.available && requester.canReadSilently()) {
                started = true
                requester.request()
            }
        }
    }
    val panel = mapPanel(state.point, moving, state.area)
    val showWelcome = state.point == null && !started && !moving
    val mapDescription = stringResource(R.string.address_form_map_description)
    Column(modifier = modifier.fillMaxSize()) {
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            AddressMap(
                area = state.area,
                point = state.point,
                located = state.locate.located,
                satellite = satellite,
                onPointChosen = actions.onPointChosen,
                onMotion = { isMoving, byGesture ->
                    moving = isMoving
                    if (byGesture) started = true
                },
                modifier = Modifier.fillMaxSize().semantics { contentDescription = mapDescription },
            )
            MapTopBar(showClose, !state.busy, actions.onCancel, satellite) { satellite = it }
            if (started && state.point == null) HintPill(Modifier.align(Alignment.TopCenter).padding(top = 64.dp))
            if (requester.available) {
                LocateFab(
                    locating = state.locate.locating,
                    enabled = !state.locate.locating && !state.busy,
                    onClick = {
                        started = true
                        requester.request()
                    },
                    modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
                )
            }
        }
        BottomPanel(
            state = state,
            panel = panel,
            showWelcome = showWelcome,
            canLocate = requester.available,
            onUseLocation = {
                started = true
                requester.request()
            },
            onMarkOnMap = { started = true },
            onConfirm = onConfirm,
        )
    }
}

@Composable
private fun MapTopBar(
    showClose: Boolean,
    closeEnabled: Boolean,
    onClose: () -> Unit,
    satellite: Boolean,
    onSatellite: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        if (showClose) {
            Surface(shape = CircleShape, shadowElevation = 4.dp) {
                IconButton(onClick = onClose, enabled = closeEnabled, modifier = Modifier.size(48.dp)) {
                    Icon(TindivoIcons.Close, contentDescription = stringResource(R.string.address_form_close))
                }
            }
        } else {
            Box(modifier = Modifier.size(1.dp))
        }
        Surface(shape = CircleShape, shadowElevation = 4.dp) {
            SingleChoiceSegmentedButtonRow {
                SegmentedButton(
                    selected = !satellite,
                    onClick = { onSatellite(false) },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(text = stringResource(R.string.address_map_type_map))
                }
                SegmentedButton(
                    selected = satellite,
                    onClick = { onSatellite(true) },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(text = stringResource(R.string.address_map_type_satellite))
                }
            }
        }
    }
}

/** «Mueve el mapa. El pin se queda quieto.»: 4 s después de empezar, una sola vez. */
@Composable
private fun HintPill(modifier: Modifier) {
    var done by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(PILL_MS)
        done = true
    }
    if (done) return
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.inverseSurface,
        contentColor = MaterialTheme.colorScheme.inverseOnSurface,
        modifier = modifier,
    ) {
        Text(
            text = stringResource(R.string.address_map_pill),
            style = MaterialTheme.typography.labelLarge,
            modifier =
                Modifier.padding(horizontal = 16.dp, vertical = 10.dp).semantics {
                    liveRegion =
                        LiveRegionMode.Polite
                },
        )
    }
}

/** «Mi ubicación»: botón circular de 56 dp con la mira, sobre el mapa. Buscando, gira un indicador en su lugar. */
@Composable
private fun LocateFab(
    locating: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    val label = stringResource(if (locating) R.string.address_form_locating else R.string.address_map_my_location)
    FloatingActionButton(
        onClick = { if (enabled) onClick() },
        shape = CircleShape,
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = TindivoColors.brandText,
        modifier = modifier.size(TindivoSpacing.primaryButtonHeight).semantics { contentDescription = label },
    ) {
        if (locating) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
        } else {
            Icon(imageVector = LocateCrosshair, contentDescription = null)
        }
    }
}

/** El panel de abajo: la bienvenida, o los avisos y la pregunta del estado del mapa con su botón. */
@Composable
private fun BottomPanel(
    state: AddressFormState,
    panel: MapPanel,
    showWelcome: Boolean,
    canLocate: Boolean,
    onUseLocation: () -> Unit,
    onMarkOnMap: () -> Unit,
    onConfirm: () -> Unit,
) {
    val context = LocalContext.current
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 8.dp, modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier =
                Modifier
                    .heightIn(max = PANEL_MAX_DP.dp)
                    .verticalScroll(rememberScrollState())
                    .navigationBarsPadding()
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            state.locate.notice?.let { PermissionNotice(it) { openAppSettings(context) } }
            if (showWelcome) {
                Welcome(canLocate, onUseLocation, onMarkOnMap)
            } else {
                Question(state, panel, onConfirm)
            }
        }
    }
}

@Composable
private fun Welcome(
    canLocate: Boolean,
    onUseLocation: () -> Unit,
    onMarkOnMap: () -> Unit,
) {
    Text(
        text = stringResource(R.string.address_map_title),
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.semantics { heading() },
    )
    Text(
        text = stringResource(R.string.address_map_subtitle),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    if (canLocate) {
        TindivoPrimaryButton(text = stringResource(R.string.address_form_use_location), onClick = onUseLocation)
        TindivoSecondaryButton(text = stringResource(R.string.address_map_mark), onClick = onMarkOnMap)
    } else {
        TindivoPrimaryButton(text = stringResource(R.string.address_map_mark), onClick = onMarkOnMap)
    }
}

@Composable
private fun Question(
    state: AddressFormState,
    panel: MapPanel,
    onConfirm: () -> Unit,
) {
    val imprecise = state.imprecise && panel == MapPanel.Settled
    if (state.locate.locating) LocatingLine()
    if (imprecise) ImpreciseNotice(state.accuracyM)
    val text =
        when (panel) {
            MapPanel.Idle -> R.string.address_step_map_hint
            MapPanel.Moving -> R.string.address_map_moving
            MapPanel.Settled -> R.string.address_map_settled
            MapPanel.Outside -> R.string.address_form_outside_zone
        }
    Text(
        text = stringResource(text),
        style = MaterialTheme.typography.titleMedium,
        color = if (panel == MapPanel.Outside) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.semantics { if (panel == MapPanel.Outside) liveRegion = LiveRegionMode.Polite },
    )
    val button =
        when {
            panel == MapPanel.Idle -> R.string.address_map_idle_button
            panel == MapPanel.Outside -> R.string.address_map_move_inside
            imprecise -> R.string.address_map_review
            else -> R.string.address_map_confirm
        }
    TindivoPrimaryButton(text = stringResource(button), onClick = onConfirm, enabled = panel.canConfirm && !state.busy)
}

/** «Buscando tu ubicación…» a la vista mientras el GPS lee. */
@Composable
private fun LocatingLine() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        Text(
            text = stringResource(R.string.address_form_locating),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

/** El aviso de que la ubicación no se pudo leer, en una tarjeta neutra (no es un error de la persona). */
@Composable
private fun PermissionNotice(
    notice: LocateNotice,
    onOpenSettings: () -> Unit,
) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant,
        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = stringResource(notice.messageRes()),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            // «Abrir Ajustes» solo cuando Android ya no volverá a preguntar.
            if (notice == LocateNotice.DeniedForever) {
                TextButton(onClick = onOpenSettings, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = stringResource(R.string.address_form_locate_settings))
                }
            }
        }
    }
}

/** El GPS dio una lectura peor que el umbral: aviso ámbar (no es un error), y el botón pasa a «Revisa y confirma». */
@Composable
private fun ImpreciseNotice(accuracyM: Float?) {
    val meters = (accuracyM ?: 0f).let { kotlin.math.ceil(it.toDouble()).toInt() }
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = TindivoColors.warningContainer,
        contentColor = TindivoColors.onWarningContainer,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = stringResource(R.string.address_map_imprecise, meters),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp).semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}
