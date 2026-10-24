package com.tindivo.customer.feature.catalog.business

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString

/**
 * Una fila de la carta, en el orden exacto en que la pantalla la pinta.
 *
 * Es la única fuente de ese orden: `MenuList` emite estas filas y el scroll-spy y los saltos de los chips leen los
 * índices de ellas. Si cada uno contara por su lado (banner opcional, cabecera, platos), un cambio en uno desfasaría
 * los chips del contenido.
 */
internal sealed interface MenuRow {
    val key: String

    data class Banner(
        val url: String,
    ) : MenuRow {
        override val key = "banner"
    }

    data class Header(
        val business: BusinessDetailUi,
    ) : MenuRow {
        override val key = "header"
    }

    data class Category(
        val category: MenuCategoryUi,
    ) : MenuRow {
        override val key = "category-${category.id}"
    }

    data class Dish(
        val item: MenuItemUi,
    ) : MenuRow {
        override val key = item.id
    }
}

/** Banner si hay, cabecera del negocio y, por cada categoría, su cabecera seguida de sus platos. */
internal fun menuRows(business: BusinessDetailUi): List<MenuRow> =
    buildList {
        business.bannerUrl?.let { add(MenuRow.Banner(it)) }
        add(MenuRow.Header(business))
        business.categories.forEach { category ->
            add(MenuRow.Category(category))
            category.items.forEach { add(MenuRow.Dish(it)) }
        }
    }

/** Índice de la cabecera de cada categoría dentro de [rows], en el orden de la carta. */
internal fun categoryHeaderIndices(rows: List<MenuRow>): List<Int> =
    rows.indices.filter { rows[it] is MenuRow.Category }

/** Índice de la cabecera del negocio: lo que queda por encima es la portada. */
internal fun businessHeaderIndex(rows: List<MenuRow>): Int = rows.indexOfFirst { it is MenuRow.Header }.coerceAtLeast(0)

/**
 * Categoría que se está leyendo: la última cuya cabecera ya pasó o está arriba del todo. Mientras se ve la portada
 * (todavía no llegó la primera cabecera) vale la primera.
 */
internal fun activeCategoryIndex(
    headerIndices: List<Int>,
    firstVisibleIndex: Int,
): Int = headerIndices.indexOfLast { it <= firstVisibleIndex }.coerceAtLeast(0)

/**
 * [text] con [style] sobre los tramos de [ranges] (índices del texto original, como los entrega `searchMenu`).
 * Un tramo fuera de rango se recorta y uno vacío o invertido se descarta, en vez de lanzar: pintar de menos es mejor
 * que cerrar la app por un índice mal calculado.
 */
internal fun highlightedText(
    text: String,
    ranges: List<MatchRange>,
    style: SpanStyle,
): AnnotatedString =
    buildAnnotatedString {
        append(text)
        for (range in ranges) {
            val start = range.start.coerceIn(0, text.length)
            val end = range.end.coerceIn(0, text.length)
            if (start < end) addStyle(style, start, end)
        }
    }
