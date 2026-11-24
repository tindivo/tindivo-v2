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

    /** La portada; [url] `null` pinta el placeholder de marca, en el mismo alto. */
    data class Banner(
        val url: String?,
        val name: String,
    ) : MenuRow {
        override val key = "banner"
    }

    data class Header(
        val business: BusinessDetailUi,
    ) : MenuRow {
        override val key = "header"
    }

    /** El selector de secciones: va bajo la cabecera y, al bajar, se pega bajo la barra superior. */
    data class Sections(
        val categories: List<MenuCategoryUi>,
    ) : MenuRow {
        override val key = "sections"
    }

    /** Los platos de «Destacados» en un carrusel: una sola fila, no una por plato. */
    data class Carousel(
        val items: List<MenuItemUi>,
    ) : MenuRow {
        override val key = "carousel"
    }

    data class Category(
        val category: MenuCategoryUi,
    ) : MenuRow {
        override val key = "category-${category.id}"
    }

    /** [sectionId] va en la clave porque un plato destacado sale dos veces: en «Destacados» y en su sección. */
    data class Dish(
        val item: MenuItemUi,
        val sectionId: String,
    ) : MenuRow {
        override val key = "$sectionId-${item.id}"
    }
}

/**
 * Portada (con o sin foto), cabecera del negocio, selector de secciones si hay dos o más y, por cada categoría, su
 * cabecera seguida de sus platos.
 */
internal fun menuRows(business: BusinessDetailUi): List<MenuRow> =
    buildList {
        add(MenuRow.Banner(business.bannerUrl, business.name))
        add(MenuRow.Header(business))
        if (business.sections.size >= 2) add(MenuRow.Sections(business.sections))
        business.featured?.let { featured ->
            add(MenuRow.Category(featured))
            add(MenuRow.Carousel(featured.items))
        }
        business.categories.forEach { category ->
            add(MenuRow.Category(category))
            category.items.forEach { add(MenuRow.Dish(it, category.id)) }
        }
    }

/** Índice de la cabecera de cada categoría dentro de [rows], en el orden de la carta. */
internal fun categoryHeaderIndices(rows: List<MenuRow>): List<Int> =
    rows.indices.filter { rows[it] is MenuRow.Category }

/**
 * Categoría que se está leyendo: la última cuya cabecera ya pasó o está arriba del todo. Mientras se ve la portada
 * (todavía no llegó la primera cabecera) vale la primera. Con [lookahead], la cabecera que sigue a la primera fila
 * visible también cuenta: es la que queda justo bajo el selector pegado, que tapa lo que queda de esa fila.
 */
internal fun activeCategoryIndex(
    headerIndices: List<Int>,
    firstVisibleIndex: Int,
    lookahead: Boolean = false,
): Int = headerIndices.indexOfLast { it <= firstVisibleIndex + if (lookahead) 1 else 0 }.coerceAtLeast(0)

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
