package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.customer.R

/** Desde cuántas categorías aparece el botón del índice (D-61). */
private const val INDEX_MIN_CATEGORIES = 5

/** Fila de chips que sigue a la sección visible, con el botón del índice a la derecha desde 5 categorías. */
@Composable
internal fun SectionChips(
    categories: List<MenuCategoryUi>,
    spy: SectionSpy,
    modifier: Modifier = Modifier,
) {
    val rowState = rememberLazyListState()
    var showIndex by remember { mutableStateOf(false) }
    val selected = spy.selected.coerceIn(0, categories.lastIndex)

    // El chip activo se centra solo; si aún no se ve, se lleva al borde y el resto se ajusta al dibujarse.
    LaunchedEffect(selected) {
        val info = rowState.layoutInfo
        val item = info.visibleItemsInfo.firstOrNull { it.index == selected }
        val offset = if (item != null) -(info.viewportSize.width - item.size) / 2 else 0
        rowState.animateScrollToItem(selected, offset)
    }

    // Fondo sólido: al fijarse bajo la barra, la carta que pasa por detrás no debe verse entre los chips.
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surfaceContainerLowest)
                .onSizeChanged { spy.stickyHeightPx = it.height },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LazyRow(
            modifier = Modifier.weight(1f),
            state = rowState,
            contentPadding = PaddingValues(horizontal = 12.dp),
        ) {
            itemsIndexed(categories, key = { _, category -> category.id }) { index, category ->
                SectionChip(
                    name = category.name,
                    selected = index == selected,
                    onClick = { spy.jumpTo(index) },
                )
            }
        }
        if (categories.size >= INDEX_MIN_CATEGORIES) {
            IndexButton(count = categories.size, onClick = { showIndex = true })
        }
    }
    if (showIndex) {
        SectionIndexSheet(
            categories = categories,
            onSelect = { index ->
                showIndex = false
                spy.jumpTo(index)
            },
            onDismiss = { showIndex = false },
        )
    }
}

/**
 * Píldora de sección (tablero «Negocio y carta»): 40 dp dentro de un área de 48. La activa va en tinta con texto
 * blanco; las demás, blancas con borde `outline`.
 */
@Composable
private fun SectionChip(
    name: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier =
            Modifier
                .heightIn(min = TindivoSpacing.touchTarget)
                .selectable(selected = selected, onClick = onClick, role = Role.Tab)
                .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier =
                Modifier
                    .heightIn(min = 40.dp)
                    .background(if (selected) scheme.onSurface else scheme.surfaceContainerLowest, CircleShape)
                    .then(if (selected) Modifier else Modifier.border(1.dp, scheme.outline, CircleShape))
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (selected) scheme.surfaceContainerLowest else scheme.onSurface,
                maxLines = 1,
            )
        }
    }
}

/** El índice de secciones: botón redondo de 48 dp con la cuadrícula y el total en una insignia. */
@Composable
private fun IndexButton(
    count: Int,
    onClick: () -> Unit,
) {
    val description = stringResource(R.string.business_sections_open, count)
    val scheme = MaterialTheme.colorScheme
    Box(modifier = Modifier.padding(start = 4.dp, end = 12.dp)) {
        Surface(
            onClick = onClick,
            shape = CircleShape,
            color = scheme.surfaceContainerLowest,
            border = BorderStroke(1.dp, scheme.outline),
            modifier = Modifier.size(TindivoSpacing.touchTarget).semantics { contentDescription = description },
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(imageVector = TindivoIcons.GridView, contentDescription = null, modifier = Modifier.size(20.dp))
            }
        }
        Box(
            modifier =
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 4.dp, y = (-2).dp)
                    .sizeIn(minWidth = 20.dp, minHeight = 20.dp)
                    .background(scheme.onSurface, CircleShape)
                    .padding(horizontal = 5.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = scheme.surfaceContainerLowest,
            )
        }
    }
}
