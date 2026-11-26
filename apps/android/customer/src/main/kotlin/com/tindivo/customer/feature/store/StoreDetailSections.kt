package com.tindivo.customer.feature.store

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

private const val SCORE_STEPS = 10
private const val SCORE_TOP = 10
private const val SCORE_VERY_GOOD = 8
private const val SCORE_GOOD = 6

/** Título y precio como protagonistas, con «Pieza única» y, si aplica, «Acepta ofertas». */
@Composable
internal fun StoreDetailHeader(detail: StoreDetailUi) {
    val sold = detail.status == StoreStatusUi.Sold
    Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight)) {
        Text(
            text = detail.title,
            style = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.semantics { heading() },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.tight), verticalAlignment = Alignment.Bottom) {
            Text(
                text = detail.priceText,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = if (sold) MaterialTheme.colorScheme.onSurfaceVariant else TindivoColors.brandText,
            )
            detail.previousPriceText?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyLarge,
                    textDecoration = TextDecoration.LineThrough,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.tight)) {
            Tag(R.string.store_detail_unique)
            if (detail.negotiable) Tag(R.string.store_detail_negotiable)
        }
    }
}

@Composable
private fun Tag(
    @StringRes text: Int,
) {
    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.secondaryContainer) {
        Text(
            text = stringResource(text),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = TindivoSpacing.item, vertical = TindivoSpacing.hairline),
        )
    }
}

/** El aviso de una pieza reservada o vendida; nada si está disponible. */
@Composable
internal fun StoreStatusNote(status: StoreStatusUi) {
    val (title, body) =
        when (status) {
            StoreStatusUi.Available -> return
            StoreStatusUi.Reserved -> R.string.store_detail_reserved_title to R.string.store_detail_reserved_body
            StoreStatusUi.Sold -> R.string.store_detail_sold_title to R.string.store_detail_sold_body
        }
    val titleText = stringResource(title)
    val bodyText = stringResource(body)
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = TindivoColors.warningContainer,
        contentColor = TindivoColors.onWarningContainer,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text =
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(titleText) }
                    append(" ")
                    append(bodyText)
                },
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(TindivoSpacing.item),
        )
    }
}

/** La ficha compacta: condición · talla · público, y la escala del 1 al 10 si es usada. */
@Composable
internal fun StoreFicha(detail: StoreDetailUi) {
    val parts =
        listOfNotNull(
            stringResource(detail.condition.label()),
            detail.sizeLabel?.let { if (detail.sized) stringResource(R.string.store_size, it) else it },
            detail.audience?.let { stringResource(it.label()) },
        )
    Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight)) {
        Text(text = parts.joinToString(" · "), style = MaterialTheme.typography.bodyLarge)
        detail.conditionScore?.let { ScoreMeter(it) }
    }
}

@Composable
private fun ScoreMeter(score: Int) {
    val title = stringResource(R.string.store_score_title, score, stringResource(scoreLabel(score)))
    Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.hairline)) {
        Text(text = title, style = MaterialTheme.typography.labelLarge)
        // La barra repite el texto de arriba: TalkBack no la lee.
        Row(
            horizontalArrangement = Arrangement.spacedBy(3.dp),
            modifier = Modifier.fillMaxWidth().clearAndSetSemantics {},
        ) {
            repeat(SCORE_STEPS) { step ->
                Box(
                    modifier =
                        Modifier
                            .weight(1f)
                            .height(6.dp)
                            .clip(CircleShape)
                            .background(
                                if (step < score) TindivoColors.brandText else MaterialTheme.colorScheme.surfaceVariant,
                            ),
                )
            }
        }
    }
}

/** El envío: desde cuánto y, debajo, el rango o el texto que escribió Jesús. */
@Composable
internal fun StoreDelivery(settings: StoreSettingsUi) {
    Column(verticalArrangement = Arrangement.spacedBy(TindivoSpacing.hairline)) {
        Text(
            text = stringResource(R.string.store_delivery_title, settings.deliveryMinText),
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            text =
                settings.deliveryText
                    ?: stringResource(R.string.store_delivery_body, settings.deliveryMinText, settings.deliveryMaxText),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@StringRes
private fun scoreLabel(score: Int): Int =
    when {
        score >= SCORE_TOP -> R.string.store_score_10
        score >= SCORE_VERY_GOOD -> R.string.store_score_8
        score >= SCORE_GOOD -> R.string.store_score_6
        else -> R.string.store_score_low
    }

@StringRes
private fun StoreConditionUi.label(): Int =
    when (this) {
        StoreConditionUi.NewWithTag -> R.string.store_condition_new_with_tag
        StoreConditionUi.NewUnused -> R.string.store_condition_new_unused
        StoreConditionUi.Used -> R.string.store_condition_used_label
    }

@StringRes
private fun StoreAudienceUi.label(): Int =
    when (this) {
        StoreAudienceUi.Women -> R.string.store_audience_women
        StoreAudienceUi.Men -> R.string.store_audience_men
        StoreAudienceUi.Kids -> R.string.store_audience_kids
        StoreAudienceUi.Unisex -> R.string.store_audience_unisex
    }
