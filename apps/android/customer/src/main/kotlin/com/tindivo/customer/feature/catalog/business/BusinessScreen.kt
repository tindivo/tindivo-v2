package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
fun BusinessDestination(
    onBack: () -> Unit,
    viewModel: BusinessViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    BusinessScreen(state = state, onRefresh = viewModel::refresh, onBack = onBack)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BusinessScreen(
    state: BusinessUiState,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = (state as? BusinessUiState.Loaded)?.business?.name.orEmpty(),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(text = stringResource(R.string.business_back))
                    }
                },
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
                    MenuList(business = state.business)
                }
            }
        }
    }
}

@Composable
private fun MenuList(business: BusinessDetailUi) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        business.bannerUrl?.let { banner ->
            item(key = "banner") {
                AsyncImage(
                    model = banner,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(160.dp),
                )
            }
        }
        item(key = "header") { BusinessHeader(business) }
        business.categories.forEach { category ->
            item(key = "category-${category.id}") { CategoryHeader(category) }
            items(category.items, key = { it.id }) { menuItem -> MenuItemRow(menuItem) }
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
private fun MenuItemRow(menuItem: MenuItemUi) {
    val dim = if (menuItem.available) Modifier else Modifier.alpha(0.5f)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).then(dim),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = menuItem.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            menuItem.description?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = menuItem.price,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
            if (!menuItem.available) {
                Text(
                    text = stringResource(R.string.business_item_unavailable),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        DishImage(menuItem.imageUrl)
    }
}

/**
 * El recuadro de 92 dp está siempre, con o sin foto, para que las filas queden alineadas. El isotipo va debajo:
 * mientras la foto carga, o si falla, es lo que se ve.
 */
@Composable
private fun DishImage(imageUrl: String?) {
    val dark = isSystemInDarkTheme()
    val background = if (dark) MaterialTheme.colorScheme.surfaceVariant else Color(0xFFF4F4F2)
    val tint = if (dark) MaterialTheme.colorScheme.onSurfaceVariant else Color(0xFF2E3236)
    Box(
        modifier = Modifier.size(92.dp).clip(RoundedCornerShape(12.dp)).background(background),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painter = painterResource(R.drawable.ic_tindivo_mark),
            contentDescription = null,
            modifier = Modifier.size(40.dp),
            colorFilter = ColorFilter.tint(tint),
            alpha = 0.35f,
        )
        if (imageUrl != null) {
            AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
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
        MenuItemUi("1", "1/4 de pollo", "Con papas y ensalada", "S/ 12.50", null, true, DishWindow(null, null, null))
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
