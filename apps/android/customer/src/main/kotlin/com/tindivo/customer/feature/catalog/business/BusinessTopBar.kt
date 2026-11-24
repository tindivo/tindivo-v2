package com.tindivo.customer.feature.catalog.business

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.Window
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import kotlinx.coroutines.launch
import java.math.BigDecimal

/** Etiqueta de pruebas de la barra superior. */
internal const val TOP_BAR_TAG = "business_top_bar"

/** Los botones de la barra miden 40 dp; el toque, 48. */
private val ROUND_BUTTON = 40.dp

/** Blanco con el que los botones se ven sobre cualquier foto. */
private const val BUTTON_ALPHA = 0.92f

/**
 * Barra superior de la carta, encima de la portada: transparente al inicio, con «Atrás» y «Buscar» en círculos
 * blancos; al salir la portada se vuelve sólida y muestra el nombre. [progress] va de 0 (portada) a 1 (barra sólida) y
 * se lee solo al dibujar, así que el scroll no recompone nada. [business] es `null` sin la carta cargada: entonces
 * solo hay «Atrás».
 */
@Composable
internal fun BusinessTopBar(
    business: BusinessDetailUi?,
    progress: () -> Float,
    onSearch: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val surface = MaterialTheme.colorScheme.surfaceContainerLowest
    val divider = MaterialTheme.colorScheme.outlineVariant
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                // Lo primero que se lee: la barra va encima en pantalla pero después en la composición.
                .testTag(TOP_BAR_TAG)
                // La barra es opaca al bajar: se come los toques para que no lleguen a lo que hay detrás.
                .pointerInput(Unit) { detectTapGestures { } }
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
            description = stringResource(R.string.business_back),
            progress = progress,
            onClick = onBack,
        )
        Text(
            text = business?.name.orEmpty(),
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier =
                Modifier
                    .weight(1f)
                    .padding(horizontal = 8.dp)
                    .graphicsLayer { alpha = progress() }
                    // El nombre ya se lee como título en la cabecera: aquí es solo visual y, con la portada, invisible.
                    .clearAndSetSemantics { },
        )
        if (business != null) {
            RoundBarButton(
                icon = TindivoIcons.Search,
                description = stringResource(R.string.business_search_open),
                progress = progress,
                onClick = onSearch,
            )
        }
    }
}

/** Círculo de 40 dp en un toque de 48: blanco con sombra sobre la portada, que se funde con la barra al volverse sólida. */
@Composable
private fun RoundBarButton(
    icon: ImageVector,
    description: String,
    progress: () -> Float,
    onClick: () -> Unit,
) {
    IconButton(onClick = onClick, modifier = Modifier.size(TindivoSpacing.touchTarget)) {
        Box(
            modifier =
                Modifier
                    .size(ROUND_BUTTON)
                    .graphicsLayer {
                        shadowElevation = (1f - progress()) * 4.dp.toPx()
                        shape = CircleShape
                        clip = false
                    }.drawBehind { drawCircle(Color.White.copy(alpha = BUTTON_ALPHA * (1f - progress()))) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = description, tint = MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun TopBarOverBannerPreview() {
    TindivoTheme {
        Box {
            BannerPlaceholder(name = "Pizza Priamo", modifier = Modifier.height(BANNER_HEIGHT))
            BusinessTopBar(business = null, progress = { 0f }, onSearch = {}, onBack = {})
        }
    }
}

/**
 * Iconos de la barra de estado claros mientras [overBanner] (la portada, con su velo oscuro, está debajo) y oscuros
 * con la barra sólida. Al salir devuelve el estilo que tenía la ventana, para no afectar a las demás pantallas.
 */
@Composable
internal fun StatusBarIconsOverBanner(overBanner: () -> Boolean) {
    val view = LocalView.current
    val window = view.context.findWindow() ?: return
    DisposableEffect(window) {
        val controller = WindowCompat.getInsetsController(window, view)
        val original = controller.isAppearanceLightStatusBars
        onDispose { controller.isAppearanceLightStatusBars = original }
    }
    LaunchedEffect(window) {
        val controller = WindowCompat.getInsetsController(window, view)
        snapshotFlow(overBanner).collect { controller.isAppearanceLightStatusBars = !it }
    }
}

private tailrec fun Context.findWindow(): Window? =
    when (this) {
        is Activity -> window
        is ContextWrapper -> baseContext.findWindow()
        else -> null
    }
