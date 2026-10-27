package com.tindivo.customer.feature.catalog.business

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.customer.R
import com.tindivo.customer.feature.cart.CartLine
import com.tindivo.customer.feature.cart.MAX_LINES
import com.tindivo.customer.feature.cart.MAX_QUANTITY
import kotlinx.coroutines.launch

/** Une los ViewModels con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
fun BusinessDestination(
    onBack: () -> Unit,
    onOpenCart: () -> Unit,
    viewModel: BusinessViewModel = hiltViewModel(),
    cartViewModel: BusinessCartViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val now = viewModel.now.collectAsStateWithLifecycle().value
    val cart = cartViewModel.cart.collectAsStateWithLifecycle().value
    val outcome = cartViewModel.outcome.collectAsStateWithLifecycle().value
    val visible = remember(state, now) { state.visibleAt(now) }
    val business = (visible as? BusinessUiState.Loaded)?.business
    val bag =
        remember(cart, outcome, business?.id) {
            BusinessCartState(business?.let { cartBarFor(cart, it.id) }, outcome)
        }
    BusinessScreen(
        state = visible,
        onRefresh = viewModel::refresh,
        onBack = onBack,
        cart = bag,
        cartActions =
            BusinessCartActions(
                onAdd = { line -> business?.let { cartViewModel.add(it.id, it.name, line) } },
                onReplace = cartViewModel::replaceWithPending,
                onConsumeOutcome = cartViewModel::consumeOutcome,
                onOpenCart = onOpenCart,
            ),
    )
}

/** Lo que la pantalla de la carta sabe de la bolsa: la barra de este negocio y el resultado del último «Agregar». */
internal data class BusinessCartState(
    val bar: CartBarUi? = null,
    val outcome: AddOutcome? = null,
)

internal data class BusinessCartActions(
    val onAdd: (CartLine) -> Unit,
    val onReplace: () -> Unit,
    val onConsumeOutcome: () -> Unit,
    val onOpenCart: () -> Unit,
)

internal fun BusinessDetailUi?.findDish(id: String?): MenuItemUi? =
    if (this == null ||
        id == null
    ) {
        null
    } else {
        categories.firstNotNullOfOrNull { c -> c.items.firstOrNull { it.id == id } }
    }

/**
 * Lo que pasa después de «Agregar»: el aviso de «Añadido a tu bolsa» (y cerrar la ficha), el error de guardado, o la
 * pregunta de vaciar la bolsa de otro restaurante.
 */
@Composable
internal fun BagFeedback(
    outcome: AddOutcome?,
    snackbarHostState: SnackbarHostState,
    onAdded: () -> Unit,
    actions: BusinessCartActions,
) {
    val scope = rememberCoroutineScope()
    val added = stringResource(R.string.dish_added)
    val capped = stringResource(R.string.dish_added_capped, MAX_QUANTITY)
    val failed = stringResource(R.string.dish_save_failed)
    val full = stringResource(R.string.dish_bag_full, MAX_LINES)
    LaunchedEffect(outcome) {
        val message =
            when (outcome) {
                is AddOutcome.Added -> if (outcome.capped) capped else added
                AddOutcome.Full -> full
                AddOutcome.Failed -> failed
                else -> null
            }
        if (message != null) {
            if (outcome is AddOutcome.Added) onAdded()
            actions.onConsumeOutcome()
            // Fuera del efecto: al consumir el resultado la clave cambia y el efecto se cancelaría con el aviso a medias.
            scope.launch { snackbarHostState.showSnackbar(message) }
        }
    }
    if (outcome is AddOutcome.OtherBusiness) {
        NewBagDialog(
            currentBusinessName = outcome.currentBusinessName,
            newBusinessName = outcome.newBusinessName,
            onKeep = actions.onConsumeOutcome,
            onReplace = actions.onReplace,
        )
    }
}
