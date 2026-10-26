package com.tindivo.customer.feature.catalog.business

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R
import java.math.BigDecimal

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
fun BusinessDestination(
    onBack: () -> Unit,
    viewModel: BusinessViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val now = viewModel.now.collectAsStateWithLifecycle().value
    val visible = remember(state, now) { state.visibleAt(now) }
    BusinessScreen(state = visible, onRefresh = viewModel::refresh, onBack = onBack)
}

@Composable
fun BusinessScreen(
    state: BusinessUiState,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
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
    val showTitle by remember(rows) {
        derivedStateOf { listState.firstVisibleItemIndex > businessHeaderIndex(rows) }
    }
    val searching = query != null && business != null
    BackHandler(enabled = searching) { query = null }

    Scaffold(
        topBar = {
            MenuTopBar(
                business = business,
                showTitle = showTitle,
                query = query,
                spy = spy,
                onQueryChange = { query = it },
                onBack = onBack,
            )
        },
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when (state) {
                BusinessUiState.Loading -> {
                    LoadingIndicator()
                }

                is BusinessUiState.Failed -> {
                    ErrorContent(error = state.error, onRetry = onRefresh)
                }

                is BusinessUiState.Loaded -> {
                    val text = query.orEmpty()
                    if (parseTerms(text).isNotEmpty()) {
                        MenuSearchResults(business = state.business, query = text)
                    } else {
                        MenuList(rows = rows, listState = listState)
                    }
                }
            }
        }
    }
}

@Composable
private fun MenuList(
    rows: List<MenuRow>,
    listState: LazyListState,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
        contentPadding = PaddingValues(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(rows, key = { it.key }) { row ->
            when (row) {
                is MenuRow.Banner -> {
                    AsyncImage(
                        model = row.url,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxWidth().height(160.dp),
                    )
                }

                is MenuRow.Header -> {
                    BusinessHeader(row.business)
                }

                is MenuRow.Category -> {
                    CategoryHeader(row.category)
                }

                is MenuRow.Dish -> {
                    MenuItemRow(row.item)
                }
            }
        }
    }
}

@Composable
private fun BusinessHeader(business: BusinessDetailUi) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BusinessLogo(business)
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = business.name,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            business.tagline?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun BusinessLogo(business: BusinessDetailUi) {
    val logoModifier = Modifier.size(56.dp).clip(RoundedCornerShape(12.dp))
    if (business.logoUrl != null) {
        // Decorativo a propósito: el nombre está al lado, y un contentDescription lo haría sonar dos veces.
        AsyncImage(
            model = business.logoUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = logoModifier,
        )
    } else {
        val accent = business.accent?.let { Color(it) } ?: MaterialTheme.colorScheme.primary
        Box(modifier = logoModifier.background(accent), contentAlignment = Alignment.Center) {
            Text(
                text =
                    business.name
                        .trim()
                        .firstOrNull()
                        ?.uppercase() ?: "T",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun CategoryHeader(category: MenuCategoryUi) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = category.name,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { heading() },
        )
        category.blurb?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
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
