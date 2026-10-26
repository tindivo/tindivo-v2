package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R
import kotlinx.coroutines.launch
import java.math.BigDecimal

/** Desde cuántas categorías aparece el botón del índice (D-61). */
private const val INDEX_MIN_CATEGORIES = 5

/**
 * Barra fija de la carta (D-61): volver, el nombre del negocio una vez que la portada salió de pantalla y la lupa; con
 * la lupa abierta, el campo de búsqueda. Debajo, los chips de categorías.
 *
 * [query] es `null` mientras no se busca; un texto (aun vacío) es el modo búsqueda. [onQueryChange] con `""` abre la
 * búsqueda, con `null` la cierra y con cualquier otro texto la actualiza. [business] es `null` sin la carta
 * cargada: entonces no hay título, ni lupa, ni chips.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MenuTopBar(
    business: BusinessDetailUi?,
    showTitle: Boolean,
    query: String?,
    spy: SectionSpy,
    onQueryChange: (String?) -> Unit,
    onBack: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        if (query != null && business != null) {
            TopAppBar(
                title = { SearchField(businessName = business.name, query = query, onQueryChange = onQueryChange) },
                navigationIcon = { BackButton(onClick = { onQueryChange(null) }) },
            )
        } else {
            TopAppBar(
                title = {
                    if (showTitle && business != null) {
                        Text(text = business.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                },
                navigationIcon = { BackButton(onClick = onBack) },
                actions = {
                    if (business != null) {
                        IconButton(onClick = { onQueryChange("") }) {
                            Icon(
                                imageVector = TindivoIcons.Search,
                                contentDescription = stringResource(R.string.business_search_open),
                            )
                        }
                    }
                },
            )
        }
        if (business != null && query == null && business.categories.size >= 2) {
            SectionChips(categories = business.categories, spy = spy)
        }
    }
}

@Composable
private fun BackButton(onClick: () -> Unit) {
    IconButton(onClick = onClick) {
        Icon(imageVector = TindivoIcons.ArrowBack, contentDescription = stringResource(R.string.business_back))
    }
}

@Composable
private fun SearchField(
    businessName: String,
    query: String,
    onQueryChange: (String) -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    // Foco al abrir: con él llega el teclado, que es lo que se espera de tocar la lupa.
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier = Modifier.weight(1f).focusRequester(focusRequester),
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) {
                        Text(
                            text = stringResource(R.string.business_search_placeholder, businessName),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    inner()
                }
            },
        )
        if (query.isNotEmpty()) {
            IconButton(onClick = { onQueryChange("") }) {
                Icon(
                    imageVector = TindivoIcons.Close,
                    contentDescription = stringResource(R.string.business_search_clear),
                )
            }
        }
    }
}

/** Fila de chips que sigue a la sección visible, con el botón del índice a la derecha desde 5 categorías. */
@Composable
private fun SectionChips(
    categories: List<MenuCategoryUi>,
    spy: SectionSpy,
) {
    val scope = rememberCoroutineScope()
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

    Row(verticalAlignment = Alignment.CenterVertically) {
        LazyRow(modifier = Modifier.weight(1f), state = rowState) {
            itemsIndexed(categories, key = { _, category -> category.id }) { index, category ->
                SectionChip(
                    name = category.name,
                    selected = index == selected,
                    onClick = { scope.launch { spy.jumpTo(index) } },
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
                scope.launch { spy.jumpTo(index) }
            },
            onDismiss = { showIndex = false },
        )
    }
}

/** Activo = negrita y subrayado en el color del texto (no pastilla). */
@Composable
private fun SectionChip(
    name: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val underline = MaterialTheme.colorScheme.onSurface
    Column(
        modifier =
            Modifier
                .heightIn(min = 48.dp)
                .selectable(selected = selected, onClick = onClick, role = Role.Tab)
                .drawBehind {
                    if (selected) {
                        val thickness = 2.dp.toPx()
                        val y = size.height - thickness / 2
                        drawLine(underline, Offset(0f, y), Offset(size.width, y), strokeWidth = thickness)
                    }
                }.padding(horizontal = 12.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = name,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1,
        )
    }
}

@Composable
private fun IndexButton(
    count: Int,
    onClick: () -> Unit,
) {
    val description = stringResource(R.string.business_sections_open, count)
    TextButton(
        onClick = onClick,
        modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = description },
    ) {
        Icon(imageVector = TindivoIcons.GridView, contentDescription = null)
        Text(text = count.toString(), modifier = Modifier.padding(start = 4.dp))
    }
}

@Preview(showBackground = true)
@Composable
private fun SearchBarPreview() {
    val dish =
        MenuItemUi(
            "1",
            "Pizza americana",
            null,
            "S/ 30.00",
            BigDecimal("30.00"),
            emptyList(),
            null,
            true,
            DishWindow(null, null, null),
        )
    val business =
        BusinessDetailUi(
            name = "Pizza Priamo",
            tagline = null,
            logoUrl = null,
            bannerUrl = null,
            accent = null,
            categories = listOf(MenuCategoryUi("c1", "Pizzas", null, listOf(dish))),
        )
    TindivoTheme {
        MenuTopBar(
            business = business,
            showTitle = true,
            query = "pizza",
            spy = SectionSpy(rememberLazyListState(), listOf(1)),
            onQueryChange = {},
            onBack = {},
        )
    }
}
