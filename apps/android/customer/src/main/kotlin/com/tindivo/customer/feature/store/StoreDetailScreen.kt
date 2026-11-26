package com.tindivo.customer.feature.store

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.EmptyState
import com.tindivo.core.designsystem.ErrorState
import com.tindivo.core.designsystem.LoadingState
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
internal fun StoreDetailDestination(
    nav: StoreDetailNav,
    viewModel: StoreDetailViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val context = LocalContext.current
    StoreDetailScreen(
        state = state,
        nav = nav,
        onRetry = viewModel::retry,
        onBuy = { action ->
            when (action) {
                is StoreBuyAction.Want -> {
                    action.whatsappUrl?.let {
                        viewModel.onWant()
                        openStoreWhatsapp(context, it)
                    }
                }

                is StoreBuyAction.NotifyWhenFree -> {
                    action.whatsappUrl?.let {
                        viewModel.onNotify()
                        openStoreWhatsapp(context, it)
                    }
                }

                is StoreBuyAction.SeeSimilar -> {
                    nav.onSeeSimilar(action.categorySlug)
                }
            }
        },
    )
}

@Composable
internal fun StoreDetailScreen(
    state: StoreDetailUiState,
    nav: StoreDetailNav,
    onRetry: () -> Unit,
    onBuy: (StoreBuyAction) -> Unit,
) {
    val loaded = state as? StoreDetailUiState.Loaded
    Scaffold(
        topBar = { StoreTopBar(title = stringResource(R.string.store_title), onBack = nav.onBack) },
        bottomBar = { loaded?.let { StoreBuyBar(it.detail.buyAction, onBuy) } },
    ) { padding ->
        val modifier = Modifier.fillMaxSize().padding(padding)
        when (state) {
            StoreDetailUiState.Loading -> {
                LoadingState(label = stringResource(R.string.store_detail_loading), modifier = modifier)
            }

            StoreDetailUiState.NotFound -> {
                EmptyState(
                    title = stringResource(R.string.store_not_found_title),
                    body = stringResource(R.string.store_not_found_body),
                    actionLabel = stringResource(R.string.store_not_found_back),
                    onAction = nav.onBack,
                    modifier = modifier,
                )
            }

            is StoreDetailUiState.Failed -> {
                ErrorState(
                    title = stringResource(R.string.store_detail_error_title),
                    body = stringResource(R.string.store_error_body),
                    retryLabel = stringResource(R.string.store_retry),
                    onRetry = onRetry,
                    modifier = modifier,
                )
            }

            is StoreDetailUiState.Loaded -> {
                StoreDetailBody(state.detail, nav.onOpenProduct, modifier)
            }
        }
    }
}

@Composable
private fun StoreDetailBody(
    detail: StoreDetailUi,
    onOpenProduct: (String) -> Unit,
    modifier: Modifier,
) {
    LazyColumn(modifier = modifier, contentPadding = PaddingValues(bottom = TindivoSpacing.section)) {
        item { StoreGallery(images = detail.images, title = detail.title, badge = detail.badge) }
        item {
            Column(
                modifier = Modifier.padding(TindivoSpacing.screen),
                verticalArrangement = Arrangement.spacedBy(TindivoSpacing.screen),
            ) {
                StoreDetailHeader(detail)
                StoreStatusNote(detail.status)
                StoreFicha(detail)
                detail.description?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }
                StoreDelivery(detail.settings)
            }
        }
        if (detail.related.isNotEmpty()) {
            item {
                Column(modifier = Modifier.padding(horizontal = TindivoSpacing.screen)) {
                    StoreSectionTitle(stringResource(R.string.store_related))
                }
            }
            item {
                LazyRow(
                    contentPadding = PaddingValues(TindivoSpacing.screen),
                    horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
                ) {
                    items(detail.related, key = { it.id }) { card ->
                        StoreProductCard(
                            card = card,
                            onClick = { onOpenProduct(card.slug) },
                            modifier = Modifier.width(150.dp),
                        )
                    }
                }
            }
        }
        item {
            Text(
                text = stringResource(R.string.store_ref, detail.code),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = TindivoSpacing.screen),
            )
        }
    }
}

/**
 * El pie fijo según el estado (como la web): disponible → pedir por WhatsApp; reservada → «RESERVADO» y «Avísame si se
 * libera»; vendida → «VENDIDO» y «Ver parecidos». Sin número de WhatsApp, un texto en lugar de esos botones.
 */
@Composable
private fun StoreBuyBar(
    action: StoreBuyAction,
    onBuy: (StoreBuyAction) -> Unit,
) {
    Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when (action) {
                is StoreBuyAction.Want -> {
                    if (action.whatsappUrl == null) {
                        StoreWhatsappMissing()
                    } else {
                        TindivoPrimaryButton(text = stringResource(R.string.store_want), onClick = { onBuy(action) })
                        Text(
                            text = stringResource(R.string.store_want_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }

                is StoreBuyAction.NotifyWhenFree -> {
                    LabeledAction(R.string.store_reserved_label) {
                        if (action.whatsappUrl == null) {
                            StoreWhatsappMissing()
                        } else {
                            TindivoSecondaryButton(
                                text = stringResource(R.string.store_notify),
                                onClick = { onBuy(action) },
                            )
                        }
                    }
                }

                is StoreBuyAction.SeeSimilar -> {
                    LabeledAction(R.string.store_sold_label) {
                        TindivoPrimaryButton(
                            text = stringResource(R.string.store_see_similar),
                            onClick = { onBuy(action) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LabeledAction(
    @StringRes label: Int,
    content: @Composable () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
    ) {
        Text(
            text = stringResource(label),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            color = TindivoColors.onWarningContainer,
        )
        Column(modifier = Modifier.weight(1f)) { content() }
    }
}
