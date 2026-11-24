package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import kotlinx.coroutines.launch
import java.math.BigDecimal

/** Desde cuántas categorías aparece el botón del índice (D-61). */
private const val INDEX_MIN_CATEGORIES = 5

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
                    .graphicsLayer { alpha = progress() },
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

/** Barra sólida del modo búsqueda: volver cierra la búsqueda y el campo ocupa el resto. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SearchTopBar(
    businessName: String,
    query: String,
    onQueryChange: (String?) -> Unit,
) {
    TopAppBar(
        title = { SearchField(businessName = businessName, query = query, onQueryChange = onQueryChange) },
        navigationIcon = { BackButton(onClick = { onQueryChange(null) }) },
    )
}

@Composable
private fun BackButton(onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Icon(imageVector = TindivoIcons.ArrowBack, contentDescription = stringResource(R.string.business_back))
    }
}

@Composable
private fun SearchField(
    businessName: String,
    query: String,
    onQueryChange: (String) -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    // Foco al abrir: con él llega el teclado, que es lo que se espera de tocar la lupa.
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.weight(1f).focusRequester(focusRequester),
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) {
                        Text(
                            text = stringResource(R.string.business_search_placeholder, businessName),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    inner()
                }
            },
        )
        if (query.isNotEmpty()) {
            IconButton(onClick = { onQueryChange("") }) {
                Icon(
                    imageVector = TindivoIcons.Close,
                    contentDescription = stringResource(R.string.business_search_clear),
                )
            }
        }
    }
}

/** Fila de chips que sigue a la sección visible, con el botón del índice a la derecha desde 5 categorías. */
@Composable
internal fun SectionChips(
    categories: List<MenuCategoryUi>,
    spy: SectionSpy,
) {
    val scope = rememberCoroutineScope()
    val rowState = rememberLazyListState()
    var showIndex by remember { mutableStateOf(false) }
    val selected = spy.selected.coerceIn(0, categories.lastIndex)

    // El chip activo se centra solo; si aún no se ve, se lleva al borde y el resto se ajusta al dibujarse.
    LaunchedEffect(selected) {
        val info = rowState.layoutInfo
        val item = info.visibleItemsInfo.firstOrNull { it.index == selected }
        val offset = if (item != null) -(info.viewportSize.width - item.size) / 2 else 0
        rowState.animateScrollToItem(selected, offset)
    }

    // Fondo sólido: al fijarse bajo la barra, la carta que pasa por detrás no debe verse entre los chips.
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerLowest)
                .onSizeChanged { spy.stickyHeightPx = it.height },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LazyRow(
            modifier = Modifier.weight(1f),
            state = rowState,
            contentPadding = PaddingValues(horizontal = 12.dp),
        ) {
            itemsIndexed(categories, key = { _, category -> category.id }) { index, category ->
                SectionChip(
                    name = category.name,
                    selected = index == selected,
                    onClick = { scope.launch { spy.jumpTo(index) } },
                )
            }
        }
        if (categories.size >= INDEX_MIN_CATEGORIES) {
            IndexButton(count = categories.size, onClick = { showIndex = true })
        }
    }
    if (showIndex) {
        SectionIndexSheet(
            categories = categories,
            onSelect = { index ->
                showIndex = false
                scope.launch { spy.jumpTo(index) }
            },
            onDismiss = { showIndex = false },
        )
    }
}

/**
 * Píldora de sección (tablero «Negocio y carta»): 40 dp dentro de un área de 48. La activa va en tinta con texto
 * blanco; las demás, blancas con borde `outline`.
 */
@Composable
private fun SectionChip(
    name: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier =
            Modifier
                .heightIn(min = TindivoSpacing.touchTarget)
                .selectable(selected = selected, onClick = onClick, role = Role.Tab)
                .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier =
                Modifier
                    .height(40.dp)
                    .background(if (selected) scheme.onSurface else scheme.surfaceContainerLowest, CircleShape)
                    .then(if (selected) Modifier else Modifier.border(1.dp, scheme.outline, CircleShape))
                    .padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (selected) scheme.surfaceContainerLowest else scheme.onSurface,
                maxLines = 1,
            )
        }
    }
}

/** El índice de secciones: botón redondo de 48 dp con la cuadrícula y el total en una insignia. */
@Composable
private fun IndexButton(
    count: Int,
    onClick: () -> Unit,
) {
    val description = stringResource(R.string.business_sections_open, count)
    val scheme = MaterialTheme.colorScheme
    Box(modifier = Modifier.padding(start = 4.dp, end = 12.dp)) {
        Surface(
            onClick = onClick,
            shape = CircleShape,
            color = scheme.surfaceContainerLowest,
            border = BorderStroke(1.dp, scheme.outline),
            modifier = Modifier.size(TindivoSpacing.touchTarget).semantics { contentDescription = description },
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(imageVector = TindivoIcons.GridView, contentDescription = null, modifier = Modifier.size(20.dp))
            }
        }
        Box(
            modifier =
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 4.dp, y = (-2).dp)
                    .sizeIn(minWidth = 20.dp, minHeight = 20.dp)
                    .background(scheme.onSurface, CircleShape)
                    .padding(horizontal = 5.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = scheme.surfaceContainerLowest,
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun SearchBarPreview() {
    TindivoTheme {
        SearchTopBar(businessName = "Pizza Priamo", query = "pizza", onQueryChange = {})
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
