package com.tindivo.customer.feature.cart

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla. [onAddMore] vuelve a la carta del negocio de la bolsa. */
@Composable
fun CartDestination(
    onBack: () -> Unit,
    onAddMore: (businessId: String) -> Unit,
    onSeeBusinesses: () -> Unit,
    onCheckout: () -> Unit,
    viewModel: CartViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    CartScreen(
        state = state,
        actions =
            CartActions(
                onBack = onBack,
                onAddMore = onAddMore,
                onSeeBusinesses = onSeeBusinesses,
                onCheckout = onCheckout,
                onChangeQuantity = viewModel::changeQuantity,
                onRemove = viewModel::remove,
                onClear = viewModel::clear,
            ),
    )
}

class CartActions(
    val onBack: () -> Unit,
    val onAddMore: (String) -> Unit,
    val onSeeBusinesses: () -> Unit,
    val onChangeQuantity: (signature: String, delta: Int) -> Unit,
    val onRemove: (String) -> Unit,
    val onClear: () -> Unit,
    val onCheckout: () -> Unit,
)

/**
 * La bolsa (tablero «Bolsa»): barra blanca con «Vaciar» en rojo, el negocio arriba, los platos en una tarjeta con
 * su miniatura, «Agregar más» como píldora, el subtotal en su tarjeta y, fija abajo, la píldora «Continuar» con el
 * subtotal. Las acciones son las mismas de siempre: aquí solo cambia cómo se ve.
 */
@Composable
fun CartScreen(
    state: CartUiState,
    actions: CartActions,
) {
    var confirmingClear by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            CartTopBar(
                units = (state as? CartUiState.Filled)?.lines?.sumOf { it.quantity },
                onBack = actions.onBack,
                onClear = { confirmingClear = true },
            )
        },
        bottomBar = {
            if (state is CartUiState.Filled) {
                ContinueBar(subtotal = state.subtotal, onClick = actions.onCheckout)
            }
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when (state) {
                CartUiState.Loading -> Unit
                CartUiState.Empty -> EmptyBag(onSeeBusinesses = actions.onSeeBusinesses)
                is CartUiState.Filled -> FilledBag(state = state, actions = actions)
            }
        }
    }
    if (confirmingClear) {
        ClearDialog(
            onCancel = { confirmingClear = false },
            onConfirm = {
                confirmingClear = false
                actions.onClear()
            },
        )
    }
}

/** [units] es `null` con la bolsa vacía: entonces no hay contador ni «Vaciar». */
@Composable
private fun CartTopBar(
    units: Int?,
    onBack: () -> Unit,
    onClear: () -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLowest, shadowElevation = 4.dp) {
        Row(
            modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            IconButton(onClick = onBack, modifier = Modifier.size(TindivoSpacing.touchTarget)) {
                Icon(imageVector = TindivoIcons.ArrowBack, contentDescription = stringResource(R.string.business_back))
            }
            Text(
                text = stringResource(R.string.cart_title),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.semantics { heading() },
            )
            units?.let {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.padding(start = 4.dp),
                ) {
                    Text(
                        text = pluralStringResource(R.plurals.cart_units, it, it),
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp),
                    )
                }
            }
            Spacer(modifier = Modifier.weight(1f))
            if (units != null) {
                TextButton(
                    onClick = onClear,
                    modifier = Modifier.heightIn(min = TindivoSpacing.touchTarget),
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) {
                    Text(text = stringResource(R.string.cart_clear), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

/** La píldora de abajo: «Continuar →» y el subtotal en su cápsula oscura, sobre una barra blanca redondeada. */
@Composable
private fun ContinueBar(
    subtotal: String,
    onClick: () -> Unit,
) {
    val label = stringResource(R.string.cart_continue)
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        shadowElevation = 12.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Surface(
            onClick = onClick,
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            modifier =
                Modifier
                    .navigationBarsPadding()
                    .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 16.dp)
                    .fillMaxWidth()
                    .heightIn(min = TindivoSpacing.primaryButtonHeight)
                    .clearAndSetSemantics {
                        contentDescription = "$label, $subtotal"
                        role = Role.Button
                    },
        ) {
            Row(
                modifier = Modifier.padding(start = 24.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = label, style = MaterialTheme.typography.titleLarge)
                Icon(
                    imageVector = TindivoIcons.ArrowForward,
                    contentDescription = null,
                    modifier = Modifier.padding(start = 8.dp).size(20.dp),
                )
                Spacer(modifier = Modifier.weight(1f))
                Box(
                    modifier =
                        Modifier
                            .height(40.dp)
                            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.28f), CircleShape)
                            .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = subtotal, style = MaterialTheme.typography.titleLarge)
                }
            }
        }
    }
}

@Composable
private fun EmptyBag(onSeeBusinesses: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(TindivoSpacing.screen),
        verticalArrangement = Arrangement.spacedBy(TindivoSpacing.screen, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier.size(96.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = TindivoIcons.ShoppingBag,
                contentDescription = null,
                tint = TindivoColors.brandText,
                modifier = Modifier.size(44.dp),
            )
        }
        Text(text = stringResource(R.string.cart_empty), style = MaterialTheme.typography.titleLarge)
        TindivoPrimaryButton(text = stringResource(R.string.cart_see_businesses), onClick = onSeeBusinesses)
    }
}

@Composable
private fun FilledBag(
    state: CartUiState.Filled,
    actions: CartActions,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(TindivoSpacing.screen),
        verticalArrangement = Arrangement.spacedBy(TindivoSpacing.screen),
    ) {
        item { BusinessLine(name = state.businessName) }
        item {
            TindivoCard(modifier = Modifier.fillMaxWidth()) {
                // Una sola tarjeta, como el tablero; `key` da a cada plato su identidad (la de `items(key = …)`), así
                // que quitar uno no le pasa su estado al siguiente.
                state.lines.forEachIndexed { index, line ->
                    key(line.signature) {
                        if (index > 0) {
                            HorizontalDivider(
                                modifier = Modifier.padding(horizontal = 14.dp),
                                color = MaterialTheme.colorScheme.outlineVariant,
                            )
                        }
                        CartLineRow(line = line, actions = actions)
                    }
                }
            }
        }
        item { AddMorePill(businessName = state.businessName, onClick = { actions.onAddMore(state.businessId) }) }
        item { TotalsCard(subtotal = state.subtotal) }
    }
}

@Composable
private fun BusinessLine(name: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
    ) {
        RoundIcon(TindivoIcons.ShoppingBag, size = 44.dp)
        Text(
            text = name,
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.semantics { heading() },
        )
    }
}

@Composable
private fun RoundIcon(
    icon: ImageVector,
    size: Dp = 40.dp,
) {
    Box(
        modifier = Modifier.size(size).background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = TindivoColors.brandText,
            modifier = Modifier.size(20.dp),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CartLineRow(
    line: CartLineUi,
    actions: CartActions,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(14.dp),
        horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
    ) {
        // La bolsa guardada no trae la foto del plato: va el isotipo sobre crema, como en el tablero.
        Box(
            modifier =
                Modifier
                    .size(72.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                bitmap = ImageBitmap.imageResource(R.drawable.ic_tindivo_isotipo),
                contentDescription = null,
                modifier = Modifier.width(40.dp),
                contentScale = ContentScale.Fit,
            )
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = line.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                Text(text = line.total, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
            }
            if (line.options.isNotEmpty() || line.note != null) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    line.options.forEach {
                        Chip(
                            text = stringResource(R.string.cart_option, it.group, it.option),
                            container = TindivoColors.border.copy(alpha = 0.5f),
                            content = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    line.note?.let {
                        Chip(
                            text = stringResource(R.string.cart_line_note, it),
                            container = MaterialTheme.colorScheme.primaryContainer,
                            content = MaterialTheme.colorScheme.onPrimaryContainer,
                        )
                    }
                }
            }
            QuantityControls(line = line, actions = actions)
        }
    }
}

@Composable
private fun Chip(
    text: String,
    container: Color,
    content: Color,
) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.SemiBold,
        color = content,
        modifier = Modifier.background(container, CircleShape).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun QuantityControls(
    line: CartLineUi,
    actions: CartActions,
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(
            modifier =
                Modifier
                    .height(TindivoSpacing.touchTarget)
                    .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = { actions.onChangeQuantity(line.signature, -1) },
                enabled = line.canDecrease,
                modifier = Modifier.size(TindivoSpacing.touchTarget),
            ) {
                Icon(TindivoIcons.Remove, contentDescription = stringResource(R.string.cart_line_less, line.name))
            }
            Text(text = line.quantity.toString(), style = MaterialTheme.typography.titleMedium)
            IconButton(
                onClick = { actions.onChangeQuantity(line.signature, 1) },
                enabled = line.canIncrease,
                modifier = Modifier.size(TindivoSpacing.touchTarget),
            ) {
                Icon(TindivoIcons.Add, contentDescription = stringResource(R.string.cart_line_more, line.name))
            }
        }
        Spacer(modifier = Modifier.weight(1f))
        TextButton(onClick = {
            actions.onRemove(line.signature)
        }, modifier = Modifier.heightIn(min = TindivoSpacing.touchTarget)) {
            Text(text = stringResource(R.string.cart_remove), fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun AddMorePill(
    businessName: String,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        Row(
            modifier = Modifier.padding(start = 6.dp, end = 16.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
        ) {
            RoundIcon(TindivoIcons.Add)
            Text(
                text = stringResource(R.string.cart_add_more_from, businessName),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Icon(TindivoIcons.ChevronRight, contentDescription = null)
        }
    }
}

@Composable
private fun TotalsCard(subtotal: String) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(TindivoSpacing.screen), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
            ) {
                RoundIcon(TindivoIcons.Receipt)
                Text(
                    text = stringResource(R.string.cart_subtotal),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Text(text = subtotal, style = MaterialTheme.typography.titleLarge)
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(TindivoSpacing.item),
            ) {
                RoundIcon(TindivoIcons.LocalShipping)
                Text(
                    text = stringResource(R.string.cart_shipping_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun ClearDialog(
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.cart_clear_title)) },
        dismissButton = {
            TextButton(onClick = onCancel, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.cart_clear_cancel))
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirm, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.cart_clear_confirm))
            }
        },
    )
}

@Preview(showBackground = true)
@Composable
private fun CartPreview() {
    val line =
        CartLineUi(
            signature = "a",
            name = "Pollo a la brasa",
            options = listOf(CartOptionUi("Tamaño", "1/4")),
            note = "sin ají",
            quantity = 2,
            total = "S/ 25.00",
            canDecrease = true,
            canIncrease = true,
        )
    TindivoTheme {
        CartScreen(
            state = CartUiState.Filled("n", "Pollería Don Lucho", listOf(line), "S/ 25.00"),
            actions = CartActions({}, {}, {}, { _, _ -> }, {}, {}, {}),
        )
    }
}
