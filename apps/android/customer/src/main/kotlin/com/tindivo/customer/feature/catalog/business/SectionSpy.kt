package com.tindivo.customer.feature.catalog.business

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * La categoría marcada en los chips: sigue a la carta al hacer scroll y salta a una sección al tocar un chip.
 *
 * Mientras dura el salto la carta pasa por las categorías del medio; si el spy las siguiera, el chip tocado
 * parpadearía por todas. Por eso hay un contador de saltos en curso (y no un booleano: un segundo toque cancela el
 * primer desplazamiento y no debe reabrir el spy mientras el segundo sigue).
 */
@Stable
internal class SectionSpy(
    private val listState: LazyListState,
    private val headerIndices: List<Int>,
    private val scope: CoroutineScope,
) {
    var selected by mutableIntStateOf(0)
        private set

    private var jumps = 0

    /** Alto en píxeles del selector pegado bajo la barra: lo que tapa de la carta, y por tanto cuánto se deja libre al saltar. */
    var stickyHeightPx by mutableIntStateOf(0)

    /** Corre mientras la pantalla esté; se lanza con `LaunchedEffect`. */
    suspend fun follow() {
        snapshotFlow { activeIndex() }.collect {
            if (jumps == 0) selected = it
        }
    }

    private fun activeIndex(): Int {
        val first = listState.firstVisibleItemIndex
        val info = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == first }
        // Lo que se ve de la primera fila cabe bajo el selector pegado: la fila que cuenta es la siguiente.
        val hidden =
            info != null && stickyHeightPx > 0 && info.size - listState.firstVisibleItemScrollOffset <= stickyHeightPx
        return activeCategoryIndex(headerIndices, first, lookahead = hidden)
    }

    /**
     * Salta a [category]. Corre en el scope de la pantalla y no en el del chip: la fila de chips de la carta sale de
     * pantalla en cuanto el salto la hace subir, y su scope cancelaría el desplazamiento a medias.
     */
    fun jumpTo(category: Int) {
        scope.launch { scrollTo(category) }
    }

    private suspend fun scrollTo(category: Int) {
        val header = headerIndices.getOrNull(category) ?: return
        selected = category
        jumps++
        try {
            listState.animateScrollToItem(header, -stickyHeightPx)
        } finally {
            jumps--
        }
    }
}
