package com.tindivo.customer.feature.catalog.business

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
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

/** La barra empieza a ganar color cuando la portada ya subió esto, y llega a sólida [BAR_RAMP] después. */
private val BAR_RAMP_START = 60.dp
private val BAR_RAMP = 50.dp

@Composable
internal fun BusinessScreen(
    state: BusinessUiState,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
    cart: BusinessCartState = BusinessCartState(),
    cartActions: BusinessCartActions = BusinessCartActions({}, {}, {}, {}),
    ordering: OrderingMode = OrderingMode.Open,
) {
    // La posición de la carta vive aquí y no en MenuList: al buscar, la lista se reemplaza por los resultados y, al
    // salir, tiene que reaparecer donde estaba.
    val listState = rememberLazyListState()
    // `null` = no se busca; un texto, aunque vacío, es el modo búsqueda. Es estado de UI: el ViewModel no lo conoce.
    var query by rememberSaveable { mutableStateOf<String?>(null) }
    val business = (state as? BusinessUiState.Loaded)?.business
    val rows = remember(business) { business?.let(::menuRows).orEmpty() }
    val headerIndices = remember(rows) { categoryHeaderIndices(rows) }
    val spy = remember(listState, headerIndices) { SectionSpy(listState, headerIndices) }
    LaunchedEffect(spy) { spy.follow() }
    // 0 con la portada a la vista, 1 con la barra ya sólida: crece mientras la portada sube bajo la barra.
    val density = LocalDensity.current
    val barProgress = remember(listState, density) { { barProgressOf(listState, density) } }
    val searching = query != null && business != null
    BackHandler(enabled = searching) { query = null }
    // La ficha abierta se recuerda por id: sobrevive a girar la pantalla y se cierra sola si el plato sale de la carta.
    var openDishId by rememberSaveable { mutableStateOf<String?>(null) }
    val openDish = remember(business, openDishId) { business.findDish(openDishId) }
    val snackbarHostState = remember { SnackbarHostState() }
    // Cerrado o en modo catálogo la carta se ve, pero no se abre la ficha para agregar (CUS-CAT-012, CUS-CAT-015).
    val onDishClick = dishClickFor(ordering) { openDishId = it.id }
    // Va después del de la búsqueda: con la ficha abierta, «Atrás» la cierra a ella primero y la carta queda como estaba.
    BackHandler(enabled = openDish != null) { openDishId = null }
    BagFeedback(
        outcome = cart.outcome,
        snackbarHostState = snackbarHostState,
        onAdded = { openDishId = null },
        actions = cartActions,
    )

    // La ficha del plato es una capa a pantalla completa sobre la carta, que sigue debajo y conserva su scroll.
    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            // Con la ficha encima, la carta no existe para el lector de pantalla.
            modifier = if (openDish != null) Modifier.clearAndSetSemantics { } else Modifier,
            snackbarHost = { SnackbarHost(snackbarHostState) },
            bottomBar = { OrderingBottomBar(ordering, cart.bar, cartActions.onOpenCart) },
            // La barra superior flota sobre la portada y pone ella misma la barra de estado: el contenido sube hasta arriba.
            contentWindowInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom),
        ) { innerPadding ->
            Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                when {
                    searching && business != null -> {
                        SearchResultsPane(business = business, query = query.orEmpty(), onQueryChange = {
                            query = it
                        }, onDishClick = onDishClick)
                    }

                    state is BusinessUiState.Loaded -> {
                        MenuList(
                            rows = rows,
                            listState = listState,
                            spy = spy,
                            onDishClick = onDishClick,
                            closed = ordering is OrderingMode.Closed,
                        )
                        BusinessTopBar(
                            business = business,
                            progress = barProgress,
                            onSearch = { query = "" },
                            onBack = onBack,
                            modifier = Modifier.align(Alignment.TopStart),
                        )
                    }

                    else -> {
                        PendingContent(state = state, onRefresh = onRefresh, onBack = onBack)
                    }
                }
            }
        }
        DishPageHost(item = openDish, onDismiss = { openDishId = null }, onAdd = cartActions.onAdd)
    }
}

/** Progreso de la barra superior (0 = transparente, 1 = sólida) según cuánto subió la portada. */
private fun barProgressOf(
    listState: LazyListState,
    density: Density,
): Float {
    if (listState.firstVisibleItemIndex > 0) return 1f
    val start = with(density) { BAR_RAMP_START.toPx() }
    val range = with(density) { BAR_RAMP.toPx() }
    return ((listState.firstVisibleItemScrollOffset - start) / range).coerceIn(0f, 1f)
}

@Composable
private fun MenuList(
    rows: List<MenuRow>,
    listState: LazyListState,
    spy: SectionSpy,
    onDishClick: ((MenuItemUi) -> Unit)?,
    closed: Boolean = false,
) {
    // La barra superior flota: el contenido empieza bajo ella y las secciones se pegan justo ahí. La portada sube
    // ese mismo alto para quedar detrás de la barra, desde el borde de la pantalla.
    val barHeight = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + TOP_BAR_HEIGHT
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        contentPadding = PaddingValues(top = barHeight, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        rows.forEach { row ->
            when (row) {
                is MenuRow.Sections -> {
                    stickyHeader(key = row.key) { SectionChips(categories = row.categories, spy = spy) }
                }

                else -> {
                    item(key = row.key) { MenuRowContent(row, barHeight, onDishClick, closed) }
                }
            }
        }
    }
}

@Composable
private fun MenuRowContent(
    row: MenuRow,
    barHeight: Dp,
    onDishClick: ((MenuItemUi) -> Unit)?,
    closed: Boolean,
) {
    when (row) {
        is MenuRow.Banner -> {
            BusinessBanner(row.url, row.name, modifier = Modifier.pullUp(barHeight))
        }

        is MenuRow.Header -> {
            // La hoja de la cabecera sube sobre la portada: 28 dp del tablero más el espacio entre filas.
            BusinessHeader(row.business, closed = closed, overlap = 40.dp)
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

        is MenuRow.Sections -> {
            Unit
        }
    }
}

/** El modo búsqueda: barra sólida con el campo y, debajo, los resultados. */
@Composable
private fun SearchResultsPane(
    business: BusinessDetailUi,
    query: String,
    onQueryChange: (String?) -> Unit,
    onDishClick: ((MenuItemUi) -> Unit)?,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        SearchTopBar(businessName = business.name, query = query, onQueryChange = onQueryChange)
        Box(modifier = Modifier.weight(1f)) {
            if (parseTerms(query).isNotEmpty()) {
                MenuSearchResults(business = business, query = query, onDishClick = onDishClick)
            }
        }
    }
}

/** Carga o error: la misma portada de marca arriba y, sobre ella, solo «Atrás». */
@Composable
private fun PendingContent(
    state: BusinessUiState,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            BusinessBanner(url = null, name = "")
            Box(modifier = Modifier.weight(1f)) {
                when (state) {
                    is BusinessUiState.Failed -> ErrorContent(error = state.error, onRetry = onRefresh)
                    else -> LoadingIndicator()
                }
            }
        }
        BusinessTopBar(
            business = null,
            progress = { 0f },
            onSearch = {},
            onBack = onBack,
            modifier = Modifier.align(Alignment.TopStart),
        )
    }
}

@Composable
private fun LoadingIndicator() {
    val description = stringResource(R.string.business_loading)
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = description })
    }
}

@Composable
private fun ErrorContent(
    error: AppError,
    onRetry: () -> Unit,
) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = errorMessage(error), style = MaterialTheme.typography.bodyLarge)
        Button(
            onClick = onRetry,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.business_retry))
        }
    }
}

@Composable
private fun errorMessage(error: AppError): String =
    when (error) {
        is AppError.Network -> stringResource(R.string.error_network)
        else -> stringResource(R.string.error_generic)
    }

@Preview(showBackground = true)
@Composable
private fun BusinessPreview() {
    val pollo =
        MenuItemUi(
            "1",
            "1/4 de pollo",
            "Con papas y ensalada",
            "S/ 12.50",
            BigDecimal("12.50"),
            emptyList(),
            null,
            true,
            DishWindow(null, null, null),
        )
    TindivoTheme {
        BusinessScreen(
            state =
                BusinessUiState.Loaded(
                    BusinessDetailUi(
                        id = "negocio",
                        name = "Pollería Don Lucho",
                        tagline = "Pollo a la brasa",
                        logoUrl = null,
                        bannerUrl = null,
                        accent = 0xFFF97316,
                        categories =
                            listOf(
                                MenuCategoryUi(
                                    id = "c1",
                                    name = "Pollos",
                                    blurb = "Todos con papas",
                                    items = listOf(pollo, pollo.copy(id = "2", name = "Gaseosa", available = false)),
                                ),
                            ),
                    ),
                ),
            onRefresh = {},
            onBack = {},
        )
    }
}
