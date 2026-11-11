package com.tindivo.customer.feature.courier

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.tindivo.core.designsystem.EmptyState
import com.tindivo.core.designsystem.ErrorState
import com.tindivo.core.designsystem.LoadingState
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoSecondaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTextButton
import com.tindivo.customer.R

/** «Mis entregas» dentro de la lista de la portada: cargando, vacía, con fallo o de 20 en 20 con «Ver más». */
internal fun LazyListScope.myDeliveries(
    list: CourierListState,
    onOpen: (CourierCardUi) -> Unit,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
) {
    when (list) {
        CourierListState.Hidden -> {
            Unit
        }

        CourierListState.Loading -> {
            item { LoadingState(label = stringResource(R.string.courier_loading_list)) }
        }

        CourierListState.Empty -> {
            item {
                EmptyState(
                    title = stringResource(R.string.courier_my_empty),
                    body = stringResource(R.string.courier_my_empty_body),
                )
            }
        }

        is CourierListState.Failed -> {
            item {
                ErrorState(
                    title = stringResource(R.string.courier_list_failed),
                    body = stringResource(errorBodyRes(list.error)),
                    retryLabel = stringResource(R.string.courier_retry),
                    onRetry = onRetry,
                )
            }
        }

        is CourierListState.Loaded -> {
            items(list.items, key = { it.id.toString() }) { card -> CourierCard(card) { onOpen(card) } }
            if (list.canLoadMore) item { LoadMore(list, onLoadMore) }
        }
    }
}

@Composable
private fun LoadMore(
    list: CourierListState.Loaded,
    onLoadMore: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        when {
            list.loadingMore -> {
                CircularProgressIndicator()
            }

            list.loadMoreFailed -> {
                TindivoTextButton(text = stringResource(R.string.courier_load_more_failed), onClick = onLoadMore)
            }

            else -> {
                TindivoSecondaryButton(text = stringResource(R.string.courier_load_more), onClick = onLoadMore)
            }
        }
    }
}

/** Una entrega: de dónde a dónde, qué se lleva, el código, cómo va y cuánto (o «Sin cobro»). */
@Composable
private fun CourierCard(
    card: CourierCardUi,
    onClick: () -> Unit,
) {
    TindivoCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(TindivoSpacing.screen),
            verticalArrangement = Arrangement.spacedBy(TindivoSpacing.hairline),
        ) {
            Text(
                text = stringResource(R.string.courier_route, card.originLabel, card.destinationLabel),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = card.itemDescription,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val fee = if (card.phase.wasFree()) stringResource(R.string.courier_free) else card.feeText
            Text(
                text = stringResource(R.string.courier_card_meta, card.shortId, stringResource(card.phase.labelRes()), fee),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
