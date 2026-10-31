package com.tindivo.customer.feature.reviews

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tindivo.customer.R

/** Las hojas de la reseña: nada, la pregunta de las cinco estrellas o el detalle. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReviewSheets(
    state: ReviewUiState,
    actions: ReviewActions,
) {
    val pending = state.pending
    if (pending == null || state.step == ReviewStep.Hidden) return
    // Mientras envía no se puede cerrar con un gesto: el cierre cuenta como «Ahora no». La prueba lee el valor vigente.
    val submitting = rememberUpdatedState(state.submitting)
    val sheetState =
        rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            confirmValueChange = { !submitting.value },
        )
    ModalBottomSheet(onDismissRequest = actions.onDismiss, sheetState = sheetState) {
        when (state.step) {
            ReviewStep.Prompt -> PromptContent(pending = pending, actions = actions)
            else -> FormContent(state = state, pending = pending, actions = actions)
        }
    }
}

@Composable
private fun PromptContent(
    pending: PendingReviewUi,
    actions: ReviewActions,
) {
    Column(
        modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.review_prompt_title),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.review_prompt_subtitle, pending.businessName),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        StarRow(rating = 0, enabled = true, onRating = actions.onRating)
        TextButton(onClick = actions.onDismiss, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(text = stringResource(R.string.review_not_now))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FormContent(
    state: ReviewUiState,
    pending: PendingReviewUi,
    actions: ReviewActions,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = stringResource(R.string.review_form_title, pending.businessName),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.review_privacy, pending.businessName),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            StarRow(rating = state.rating, enabled = !state.submitting, onRating = actions.onRating)
            ratingLabel(state.rating)?.let { label ->
                Text(
                    text = stringResource(label),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
        if (pending.tags.isNotEmpty()) {
            Text(text = stringResource(R.string.review_tags_title), style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pending.tags.forEach { tag ->
                    FilterChip(
                        selected = tag.id in state.selectedTags,
                        onClick = { actions.onTag(tag.id) },
                        enabled = !state.submitting,
                        label = { Text(text = tag.label) },
                    )
                }
            }
        }
        CommentField(state = state, onComment = actions.onComment)
        if (state.error != null) {
            Text(
                text = state.error.detail ?: stringResource(R.string.review_send_error),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            )
        }
        Button(
            onClick = actions.onSubmit,
            enabled = state.canSubmit,
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        ) {
            Text(text = stringResource(if (state.submitting) R.string.review_sending else R.string.review_send))
        }
    }
}

@Composable
private fun CommentField(
    state: ReviewUiState,
    onComment: (String) -> Unit,
) {
    OutlinedTextField(
        value = state.comment,
        onValueChange = onComment,
        enabled = !state.submitting,
        label = { Text(text = stringResource(R.string.review_comment_label)) },
        placeholder = { Text(text = stringResource(R.string.review_comment_placeholder)) },
        supportingText = {
            Text(text = stringResource(R.string.review_comment_count, state.comment.length, MAX_REVIEW_COMMENT))
        },
        minLines = 3,
        maxLines = 6,
        modifier = Modifier.fillMaxWidth(),
    )
}

/** Cinco estrellas tocables. Cada una dice su nota a TalkBack y si es la elegida. */
@Composable
private fun StarRow(
    rating: Int,
    enabled: Boolean,
    onRating: (Int) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (value in MIN_RATING..MAX_RATING) {
            val label = pluralStringResource(R.plurals.review_star_description, value, value)
            TextButton(
                onClick = { onRating(value) },
                enabled = enabled,
                modifier =
                    Modifier
                        .heightIn(min = 48.dp)
                        .semantics {
                            contentDescription = label
                            selected = value == rating
                        },
            ) {
                Text(
                    text = if (value <= rating) "★" else "☆",
                    style = MaterialTheme.typography.headlineMedium,
                )
            }
        }
    }
}

private val RATING_LABELS =
    listOf(
        R.string.review_rating_1,
        R.string.review_rating_2,
        R.string.review_rating_3,
        R.string.review_rating_4,
        R.string.review_rating_5,
    )

/** El texto de la nota puesta (Muy mal…Muy bien); sin nota no hay texto. */
@StringRes
private fun ratingLabel(rating: Int): Int? = RATING_LABELS.getOrNull(rating - 1)
