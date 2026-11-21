package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
fun CatalogHomeDestination(
    onOpenBusiness: (id: String) -> Unit,
    onOpenCart: () -> Unit,
    onOpenCourier: () -> Unit,
    onOpenStore: () -> Unit,
    viewModel: CatalogHomeViewModel = hiltViewModel(),
    bag: HomeBagViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val bagCount = bag.count.collectAsStateWithLifecycle().value
    CatalogHomeScreen(
        state = state,
        onRefresh = viewModel::refresh,
        onOpenBusiness = onOpenBusiness,
        bagCount = bagCount,
        onOpenCart = onOpenCart,
        onOpenCourier = onOpenCourier,
        onOpenStore = onOpenStore,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogHomeScreen(
    state: CatalogHomeUiState,
    onRefresh: () -> Unit,
    onOpenBusiness: (id: String) -> Unit,
    bagCount: Int = 0,
    onOpenCart: () -> Unit = {},
    onOpenCourier: () -> Unit = {},
    onOpenStore: () -> Unit = {},
) {
    Scaffold(topBar = { HomeTopBar(bagCount = bagCount, onOpenBag = onOpenCart) }) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when (state) {
                CatalogHomeUiState.Loading -> {
                    LoadingIndicator()
                }

                is CatalogHomeUiState.Failed -> {
                    ErrorContent(error = state.error, onRetry = onRefresh)
                }

                is CatalogHomeUiState.Loaded -> {
                    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = onRefresh) {
                        BusinessList(
                            state = state,
                            onOpenBusiness = onOpenBusiness,
                            onOpenCourier = onOpenCourier,
                            onOpenStore = onOpenStore,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun BusinessList(
    state: CatalogHomeUiState.Loaded,
    onOpenBusiness: (id: String) -> Unit,
    onOpenCourier: () -> Unit,
    onOpenStore: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                text = stringResource(R.string.catalog_home_title),
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.fillMaxWidth().semantics { heading() },
            )
        }
        // Primero qué se quiere hacer (llevar algo de un lugar a otro), después dónde comer (como la web).
        // La tarjeta de Store no está mientras Store esté fuera del lanzamiento (CUS-CAT-032).
        item { ServiceGrid(cards = serviceCards(), onOpenCourier = onOpenCourier, onOpenStore = onOpenStore) }
        item {
            // Como el tablero: 22 dp sobre el encabezado y el conteo de abiertos alineado a la derecha.
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = stringResource(R.string.catalog_home_restaurants),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.semantics { heading() },
                )
                if (state.openNowCount > 0) OpenNowChip(count = state.openNowCount)
            }
        }
        state.refreshFailed?.let { error ->
            item { Text(text = errorMessage(error), color = MaterialTheme.colorScheme.error) }
        }
        if (state.restaurants.isEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.catalog_home_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                )
            }
        }
        items(state.restaurants, key = { it.id }) { business ->
            BusinessCard(business = business, whatsapp = false, onClick = { onOpenBusiness(business.id) })
        }
        if (state.whatsapp.isNotEmpty()) {
            item {
                Column(modifier = Modifier.padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = stringResource(R.string.catalog_home_whatsapp_title),
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(
                        text = stringResource(R.string.catalog_home_whatsapp_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
            items(state.whatsapp, key = { it.id }) { business ->
                BusinessCard(business = business, whatsapp = true, onClick = { onOpenBusiness(business.id) })
            }
        }
    }
}

/** Entregas y Store lado a lado, cada una de la mitad; si solo hay una, ocupa todo el ancho. */
@Composable
private fun ServiceGrid(
    cards: List<ServiceCard>,
    onOpenCourier: () -> Unit,
    onOpenStore: () -> Unit,
) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        cards.forEach { card ->
            val tile = Modifier.weight(1f)
            when (card) {
                ServiceCard.Courier -> CourierEntryCard(onClick = onOpenCourier, modifier = tile)
                ServiceCard.Store -> StoreEntryCard(onClick = onOpenStore, modifier = tile)
            }
        }
    }
}

/** El chip verde «N abiertos ahora»: texto y color dicen lo mismo. */
@Composable
private fun OpenNowChip(count: Int) {
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.tertiaryContainer,
        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
    ) {
        Text(
            text = pluralStringResource(R.plurals.home_open_now, count, count),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun LoadingIndicator() {
    val description = stringResource(R.string.catalog_loading)
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
            Text(text = stringResource(R.string.catalog_retry))
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
private fun CatalogHomePreview() {
    val open = BusinessCardUi("1", "Pollería Don Lucho", "Pollo a la brasa", null, 0xFFF97316, false, 25, 40)
    TindivoTheme {
        CatalogHomeScreen(
            state =
                CatalogHomeUiState.Loaded(
                    restaurants = listOf(open, open.copy(id = "2", name = "Chifa Lung Fung", closed = true)),
                    whatsapp = listOf(open.copy(id = "3", name = "Juguería Rosita", accent = null)),
                ),
            onRefresh = {},
            onOpenBusiness = {},
        )
    }
}
