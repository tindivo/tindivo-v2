package com.tindivo.customer.feature.catalog.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.layout.ContentScale
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
import com.tindivo.customer.feature.account.AccountEntryViewModel

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
fun CatalogHomeDestination(
    onOpenBusiness: (id: String) -> Unit,
    onOpenDiagnostics: (() -> Unit)?,
    onOpenAccount: (signedIn: Boolean) -> Unit,
    viewModel: CatalogHomeViewModel = hiltViewModel(),
    accountEntry: AccountEntryViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val signedIn = accountEntry.signedIn.collectAsStateWithLifecycle().value
    CatalogHomeScreen(
        state = state,
        onRefresh = viewModel::refresh,
        onOpenBusiness = onOpenBusiness,
        onOpenDiagnostics = onOpenDiagnostics,
        signedIn = signedIn,
        onOpenAccount = { onOpenAccount(signedIn) },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogHomeScreen(
    state: CatalogHomeUiState,
    onRefresh: () -> Unit,
    onOpenBusiness: (id: String) -> Unit,
    onOpenDiagnostics: (() -> Unit)? = null,
    signedIn: Boolean = false,
    onOpenAccount: () -> Unit = {},
) {
    Scaffold { innerPadding ->
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
                            onOpenDiagnostics = onOpenDiagnostics,
                            signedIn = signedIn,
                            onOpenAccount = onOpenAccount,
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
    onOpenDiagnostics: (() -> Unit)?,
    signedIn: Boolean,
    onOpenAccount: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(R.string.catalog_home_title),
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                onOpenDiagnostics?.let {
                    TextButton(onClick = it, modifier = Modifier.heightIn(min = 48.dp)) {
                        Text(text = stringResource(R.string.diagnostics_title))
                    }
                }
                TextButton(onClick = onOpenAccount, modifier = Modifier.heightIn(min = 48.dp)) {
                    Text(text = stringResource(if (signedIn) R.string.account_entry else R.string.signin_entry))
                }
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

private val LOGO_SIZE = 72.dp
private val LOGO_SHAPE = RoundedCornerShape(16.dp)
private const val CLOSED_ALPHA = 0.45f

/** Gris para el logo de un negocio cerrado: es la señal grande de «hoy no»; el chip la confirma. */
private val Grayscale = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })

@Composable
private fun BusinessCard(
    business: BusinessCardUi,
    whatsapp: Boolean,
    onClick: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BusinessLogo(business)
            Column(
                modifier = Modifier.weight(1f).heightIn(min = LOGO_SIZE),
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = business.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                business.tagline?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Row(
                    modifier = Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (business.closed) Chip(stringResource(R.string.catalog_closed_now), warning = true)
                    when {
                        whatsapp -> {
                            Chip(stringResource(R.string.catalog_whatsapp_orders), warning = false)
                        }

                        // El tiempo estimado solo cuando se puede cumplir: un negocio cerrado no dice cuánto tarda.
                        !business.closed -> {
                            MetaText(stringResource(R.string.catalog_eta, business.etaMin, business.etaMax))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BusinessLogo(business: BusinessCardUi) {
    val tone = if (business.closed) Modifier.alpha(CLOSED_ALPHA) else Modifier
    val logoModifier = Modifier.size(LOGO_SIZE).clip(LOGO_SHAPE).then(tone)
    if (business.logoUrl != null) {
        // Decorativo a propósito: el nombre está al lado, y un contentDescription lo haría sonar dos veces.
        AsyncImage(
            model = business.logoUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            colorFilter = if (business.closed) Grayscale else null,
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
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun Chip(
    text: String,
    warning: Boolean,
) {
    Surface(
        shape = RoundedCornerShape(50),
        color =
            if (warning) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.secondaryContainer,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun MetaText(text: String) {
    Text(text = text, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
