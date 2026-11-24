package com.tindivo.customer.feature.catalog.business

import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R
import com.tindivo.customer.feature.cart.CartLine
import kotlinx.coroutines.launch

/** Alto de la foto de la página del plato, sin contar la barra de estado, que queda bajo ella (a sangre). */
internal val DISH_PHOTO_HEIGHT = 220.dp

/** Etiqueta de pruebas de la página del plato. */
internal const val DISH_PAGE_TAG = "dish_page"

private const val ENTER_MILLIS = 220
private const val EXIT_MILLIS = 180

/**
 * Pone [DishPage] sobre la carta a pantalla completa: entra deslizando desde abajo con fundido (220 ms) y sale en
 * 180 ms. Con las animaciones del sistema desactivadas aparece y desaparece sin movimiento. La carta queda debajo, sin
 * recomponerse de cero, así que conserva su posición de scroll. [item] `null` = cerrada.
 */
@Composable
internal fun DishPageHost(
    item: MenuItemUi?,
    onDismiss: () -> Unit,
    onAdd: (CartLine) -> Unit,
) {
    val context = LocalContext.current
    val animate =
        remember(context) {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f
        }
    AnimatedContent(
        targetState = item,
        modifier = Modifier.fillMaxSize(),
        contentKey = { it?.id },
        transitionSpec = {
            val enter =
                if (animate) {
                    slideInVertically(tween(ENTER_MILLIS)) { it } + fadeIn(tween(ENTER_MILLIS))
                } else {
                    EnterTransition.None
                }
            val exit =
                if (animate) {
                    slideOutVertically(tween(EXIT_MILLIS)) { it } + fadeOut(tween(EXIT_MILLIS))
                } else {
                    ExitTransition.None
                }
            (enter togetherWith exit).using(null)
        },
        label = "dish-page",
    ) { dish ->
        if (dish != null) DishPage(item = dish, onClose = onDismiss, onAdd = onAdd)
    }
}

/**
 * La página de un plato (tablero «Plato»): la foto a sangre que se colapsa al bajar, con «Volver a la carta» encima;
 * nombre, precio, grupos de opciones y nota en el scroll, y abajo y fija la cantidad con el botón que lo agrega. Todo
 * lo que se elige vive en [DishSheetState]; aquí solo se dibuja y se avisa con [onAdd].
 */
@Composable
internal fun DishPage(
    item: MenuItemUi,
    onClose: () -> Unit,
    onAdd: (CartLine) -> Unit,
) {
    var state by rememberSaveable(item.id, stateSaver = DishSheetState.saver(item)) {
        mutableStateOf(DishSheetState(item))
    }
    // El grupo que se resalta tras tocar el botón sin haber elegido lo obligatorio, y a dónde se baja a verlo.
    var highlightId by remember { mutableStateOf<String?>(null) }
    val requesters = remember(item.id) { item.modifierGroups.associate { it.id to BringIntoViewRequester() } }
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    val density = LocalDensity.current
    val statusBar = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val hasPhoto = item.imageUrl != null
    // 0 con la foto a la vista, 1 con la barra ya sólida; sin foto la barra es sólida desde el inicio.
    val barProgress =
        remember(scroll, density, hasPhoto, statusBar) {
            {
                if (hasPhoto) {
                    val end = with(density) { (DISH_PHOTO_HEIGHT - TOP_BAR_HEIGHT).toPx() }
                    val range = with(density) { TOP_BAR_HEIGHT.toPx() }
                    ((scroll.value - (end - range)) / range).coerceIn(0f, 1f)
                } else {
                    1f
                }
            }
        }
    // Iconos de la barra de estado claros sobre la foto y oscuros con la barra sólida; al salir se restauran.
    StatusBarIconsOverBanner { barProgress() < 0.5f }
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .testTag(DISH_PAGE_TAG)
                .background(MaterialTheme.colorScheme.background)
                // Nada de lo que hay debajo (la carta) recibe toques mientras la página está encima.
                .pointerInput(Unit) { detectTapGestures { } },
    ) {
        Box(modifier = Modifier.weight(1f)) {
            Column(modifier = Modifier.fillMaxSize().verticalScroll(scroll)) {
                if (hasPhoto) {
                    DishPhotoBlock(item.imageUrl, statusBar)
                } else {
                    Spacer(modifier = Modifier.height(statusBar + TOP_BAR_HEIGHT))
                }
                Column(
                    modifier = Modifier.padding(horizontal = TindivoSpacing.screen),
                    verticalArrangement = Arrangement.spacedBy(TindivoSpacing.screen),
                ) {
                    DishHeader(item, state.requiredProgress())
                    item.modifierGroups.forEach { group ->
                        ModifierGroupSection(
                            group = group,
                            state = state,
                            onToggle = { state = state.toggle(group, it) },
                            highlighted = highlightId == group.id && (state.isMissing(group) || !state.isValid),
                            modifier = requesters[group.id]?.let { Modifier.bringIntoViewRequester(it) } ?: Modifier,
                        )
                    }
                    NoteCard(note = state.note, onChange = { state = state.withNote(it) })
                }
            }
            DishTopBar(
                name = item.name,
                progress = barProgress,
                onClose = onClose,
                modifier = Modifier.align(Alignment.TopStart),
            )
        }
        DishBottomBar(
            state = state,
            onQuantity = { state = state.withQuantity(it) },
            onAdd = {
                if (state.isValid) {
                    onAdd(state.toLine())
                } else {
                    // El botón no se apaga: lleva al primer grupo con problema (obligatorio sin elegir, o pasado de
                    // opciones) y lo resalta. Nunca llama a `toLine()` con una selección inválida.
                    val problem = state.firstProblemGroup()
                    highlightId = problem?.id
                    problem?.let { scope.launch { requesters[it.id]?.bringIntoView() } }
                }
            },
        )
    }
}

/**
 * La barra de arriba: «Volver a la carta» en un círculo (el mismo botón de la portada del negocio) y, al colapsar la
 * foto, un fondo sólido de 56 dp con el nombre del plato en una línea. [progress] se lee solo al dibujar.
 */
@Composable
private fun DishTopBar(
    name: String,
    progress: () -> Float,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val surface = MaterialTheme.colorScheme.surfaceContainerLowest
    val divider = MaterialTheme.colorScheme.outlineVariant
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                // Lo primero que se lee: la barra va encima en pantalla pero después en la composición.
                .semantics {
                    isTraversalGroup = true
                    traversalIndex = -1f
                }.drawBehind {
                    val p = progress()
                    drawRect(surface.copy(alpha = p))
                    drawRect(
                        divider.copy(alpha = p),
                        topLeft = Offset(0f, size.height - 1.dp.toPx()),
                        size = Size(size.width, 1.dp.toPx()),
                    )
                }.windowInsetsPadding(WindowInsets.statusBars)
                .height(TOP_BAR_HEIGHT)
                .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundBarButton(
            icon = TindivoIcons.ArrowBack,
            description = stringResource(R.string.dish_back),
            progress = progress,
            onClick = onClose,
        )
        // El nombre ya se lee como encabezado en la página: aquí es solo el título visual de la barra.
        Text(
            text = name,
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier =
                Modifier
                    .weight(1f)
                    .padding(horizontal = 8.dp)
                    .graphicsLayer { alpha = progress() }
                    .clearAndSetSemantics { },
        )
    }
}

/** La foto a sangre, bajo la barra de estado, con un velo oscuro arriba para que los iconos y el botón se lean. */
@Composable
private fun DishPhotoBlock(
    imageUrl: String?,
    statusBar: Dp,
) {
    // Decorativa a propósito: el nombre del plato está justo debajo.
    Box(modifier = Modifier.fillMaxWidth().height(DISH_PHOTO_HEIGHT + statusBar)) {
        DishPhoto(imageUrl = imageUrl, shape = RectangleShape, markWidth = 72.dp, modifier = Modifier.fillMaxSize())
        Box(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .height(statusBar + 24.dp)
                    .background(
                        Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.35f), Color.Transparent)),
                    ),
        )
    }
}
