package com.tindivo.customer.feature.catalog.business

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.plus
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R
import java.math.BigDecimal

/** Etiquetas de pruebas de la carta y del selector pegado. */
internal const val MENU_LIST_TAG = "business_menu_list"
internal const val PINNED_CHIPS_TAG = "business_pinned_chips"

/** La barra empieza a ganar color cuando la portada ya subió esto, y llega a sólida [BAR_RAMP] después. */
private val BAR_RAMP_START = 60.dp
private val BAR_RAMP = 50.dp

/** Progreso de la barra superior (0 = transparente, 1 = sólida) según cuánto subió la portada. */
internal fun barProgressOf(
    listState: LazyListState,
    density: Density,
): Float {
    if (listState.firstVisibleItemIndex > 0) return 1f
    val start = with(density) { BAR_RAMP_START.toPx() }
    val range = with(density) { BAR_RAMP.toPx() }
    return ((listState.firstVisibleItemScrollOffset - start) / range).coerceIn(0f, 1f)
}

@Composable
internal fun MenuList(
    rows: List<MenuRow>,
    listState: LazyListState,
    spy: SectionSpy,
    onDishClick: ((MenuItemUi) -> Unit)?,
    closed: Boolean,
    topBar: @Composable BoxScope.() -> Unit,
) {
    // La barra superior flota: el contenido empieza bajo ella. La portada sube ese mismo alto para quedar detrás de
    // la barra, desde el borde de la pantalla.
    val barHeight = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + TOP_BAR_HEIGHT
    val sections = rows.filterIsInstance<MenuRow.Sections>().firstOrNull()
    val sectionsIndex = rows.indexOfFirst { it is MenuRow.Sections }
    // El selector se pega bajo la barra con una copia: un `stickyHeader` se pegaría al borde de la pantalla, detrás
    // de ella. La copia aparece cuando la fila real ya llegó arriba del contenido y ocupa justo su lugar.
    val pinned by remember(sectionsIndex, listState) {
        derivedStateOf { sectionsIndex >= 0 && listState.firstVisibleItemIndex >= sectionsIndex }
    }
    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().testTag(MENU_LIST_TAG),
            state = listState,
            contentPadding = PaddingValues(top = barHeight, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            rows.forEach { row ->
                item(key = row.key) { MenuRowContent(row, barHeight, spy, onDishClick, closed) }
            }
        }
        if (pinned && sections != null) {
            SectionChips(
                categories = sections.categories,
                spy = spy,
                modifier = Modifier.align(Alignment.TopStart).padding(top = barHeight).testTag(PINNED_CHIPS_TAG),
            )
        }
        topBar()
    }
}

@Composable
private fun MenuRowContent(
    row: MenuRow,
    barHeight: Dp,
    spy: SectionSpy,
    onDishClick: ((MenuItemUi) -> Unit)?,
    closed: Boolean,
) {
    when (row) {
        is MenuRow.Banner -> {
            BusinessBanner(row.url, row.name, modifier = Modifier.pullUp(barHeight))
        }

        is MenuRow.Header -> {
            BusinessHeader(row.business, closed = closed)
        }

        is MenuRow.Sections -> {
            SectionChips(categories = row.categories, spy = spy)
        }

        is MenuRow.Category -> {
            CategoryHeader(row.category)
        }

        is MenuRow.Carousel -> {
            FeaturedCarousel(items = row.items, onDishClick = onDishClick)
        }

        is MenuRow.Dish -> {
            MenuItemRow(row.item, onClick = onDishClick?.let { click -> { click(row.item) } })
        }
    }
}
