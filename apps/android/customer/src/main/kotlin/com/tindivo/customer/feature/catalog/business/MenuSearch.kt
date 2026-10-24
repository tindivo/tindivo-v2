package com.tindivo.customer.feature.catalog.business

import java.text.Normalizer
import java.util.Locale

/** Mismo mínimo que `search_catalog`: por debajo, todo casa con todo. */
internal const val MIN_QUERY_CHARS = 2

/** Tope de términos, como el `limit 5` del servidor. */
private const val MAX_TERMS = 5

private val STOPWORDS =
    setOf(
        "a",
        "al",
        "con",
        "de",
        "del",
        "el",
        "en",
        "la",
        "las",
        "lo",
        "los",
        "para",
        "por",
        "sin",
        "un",
        "una",
        "y",
    )

private val COMBINING_MARKS = Regex("[̀-ͯ]")
private val TERM_SEPARATORS = Regex("[^\\p{L}\\p{N}]+")
private val WORD_CHAR = Regex("[\\p{L}\\p{N}]")

// `\s` a secas es solo ASCII en la JVM y Unicode en Android (ICU); con `\p{Z}` los dos entienden lo mismo.
private val SPACES = Regex("[\\s\\p{Z}]+")

/** Tramo `[start, end)` del texto ORIGINAL que casó con un término. */
data class MatchRange(
    val start: Int,
    val end: Int,
)

data class MenuHit(
    val item: MenuItemUi,
    val categoryId: String,
    val categoryName: String,
    /** Para resaltar en la fila; ya vienen fusionados y ordenados. */
    val nameRanges: List<MatchRange>,
    val descriptionRanges: List<MatchRange>,
)

/**
 * Normaliza un carácter **conservando su longitud en UTF-16**, que es la de un `String` de Kotlin.
 *
 * De esa invariante depende el resaltado: se busca en el texto plegado y se pinta sobre el original con los mismos
 * índices. Si el plegado cambia el tamaño (como «İ»), se devuelve el original: mejor no encontrar esa palabra que
 * resaltar donde no es.
 */
private fun foldCodePoint(ch: String): String {
    val folded = COMBINING_MARKS.replace(Normalizer.normalize(ch, Normalizer.Form.NFD), "").lowercase(Locale.ROOT)
    if (folded.length == ch.length) return folded
    val lower = ch.lowercase(Locale.ROOT)
    return if (lower.length == ch.length) lower else ch
}

/** Minúsculas y sin tildes, con la misma longitud que la entrada. */
internal fun fold(text: String): String =
    buildString(text.length) {
        var index = 0
        while (index < text.length) {
            val next = index + Character.charCount(text.codePointAt(index))
            append(foldCodePoint(text.substring(index, next)))
            index = next
        }
    }

/** Términos buscables de la consulta. Vacía cuando no hay nada accionable: la señal de «no busques todavía». */
internal fun parseTerms(query: String): List<String> {
    val all = fold(query).split(TERM_SEPARATORS).filter { it.length >= MIN_QUERY_CHARS }.distinct()
    val meaningful = all.filterNot { it in STOPWORDS }
    return meaningful.ifEmpty { all }.take(MAX_TERMS)
}

private fun mergeRanges(ranges: List<MatchRange>): List<MatchRange> {
    if (ranges.size < 2) return ranges
    val merged = mutableListOf<MatchRange>()
    for (range in ranges.sortedWith(compareBy({ it.start }, { it.end }))) {
        val last = merged.lastOrNull()
        if (last != null && range.start <= last.end) {
            merged[merged.lastIndex] = last.copy(end = maxOf(last.end, range.end))
        } else {
            merged += range
        }
    }
    return merged
}

/** Todas las apariciones de cada término, fusionadas si se solapan. */
private fun rangesFor(
    text: String?,
    terms: List<String>,
): List<MatchRange> {
    if (text == null) return emptyList()
    val hay = fold(text)
    val ranges = mutableListOf<MatchRange>()
    for (term in terms) {
        var from = 0
        while (from <= hay.length - term.length) {
            val at = hay.indexOf(term, from)
            if (at == -1) break
            ranges += MatchRange(at, at + term.length)
            from = at + term.length
        }
    }
    return mergeRanges(ranges)
}

/** ¿Empieza alguna PALABRA de [hay] por [prefix]? («napo» → «Pizza Napolitana»). */
private fun wordStartsWith(
    hay: String,
    prefix: String,
): Boolean {
    var at = hay.indexOf(prefix)
    while (at > 0) {
        if (!WORD_CHAR.matches(hay[at - 1].toString())) return true
        at = hay.indexOf(prefix, at + 1)
    }
    return at == 0
}

/** Menor es mejor: con 75 platos, que «pizza americana» salga antes que «gaseosa (va con pizza)» es lo que importa. */
@Suppress("MagicNumber") // Los rangos de relevancia son la propia regla, como en la web.
private fun scoreName(
    foldedName: String,
    phrase: String,
    terms: List<String>,
): Int =
    when {
        foldedName == phrase -> 0
        foldedName.startsWith(phrase) -> 1
        wordStartsWith(foldedName, phrase) -> 2
        foldedName.contains(phrase) -> 3
        terms.all { foldedName.contains(it) } -> 4
        else -> 5 // solo casó por descripción o por el nombre de la categoría
    }

/**
 * Búsqueda dentro de la carta de UN negocio, la misma que `searchMenu` de
 * `apps/customer/features/catalog/lib/menu-search.ts`. Si cambia allí, cambia aquí y en sus pruebas.
 *
 * Devuelve los platos de [categories] que casan con [query], del más relevante al menos. A igualdad de relevancia
 * manda el orden de la carta, que es el que decidió el negocio. Se le pasa la carta que se ve (ya filtrada por
 * franja): no se puede encontrar un plato que no se muestra.
 *
 * No habla con la API: la carta entera ya llegó con `GET /public/businesses/{id}`, así que filtrar en el teléfono
 * no tiene latencia y sigue funcionando con mala señal. Sin tildes ni mayúsculas, términos de 2 o más caracteres
 * unidos por AND y en cualquier orden («pollo brasa» encuentra «Pollo a la brasa»). Las preposiciones no son
 * obligatorias si queda algo con lo que buscar.
 *
 * A diferencia de la web, no hay umbral para ofrecer el buscador: en la app es una lupa en la barra fija (D-61), que
 * no le quita altura a una carta corta.
 */
internal fun searchMenu(
    categories: List<MenuCategoryUi>,
    query: String,
): List<MenuHit> {
    val terms = parseTerms(query)
    if (terms.isEmpty()) return emptyList()
    val phrase = SPACES.replace(fold(query).trim(), " ")

    val scored = mutableListOf<Pair<Int, MenuHit>>()
    for (category in categories) {
        val foldedCategory = fold(category.name)
        for (item in category.items) {
            val foldedName = fold(item.name)
            val haystack = "$foldedName ${item.description?.let(::fold).orEmpty()} $foldedCategory"
            if (!terms.all { haystack.contains(it) }) continue
            scored +=
                scoreName(foldedName, phrase, terms) to
                MenuHit(
                    item = item,
                    categoryId = category.id,
                    categoryName = category.name,
                    nameRanges = rangesFor(item.name, terms),
                    descriptionRanges = rangesFor(item.description, terms),
                )
        }
    }
    // `sortedBy` es estable: a igual puntaje se conserva el orden de la carta.
    return scored.sortedBy { it.first }.map { it.second }
}
