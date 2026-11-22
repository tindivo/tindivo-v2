package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R

/** «Entrega»: delivery o recojo, la dirección (o el punto de recojo), el contacto y la nota para el motorizado. */
internal fun LazyListScope.deliverySection(
    state: CheckoutUiState,
    form: CheckoutFormActions,
    openSheet: (CheckoutSheet) -> Unit,
) {
    item(key = "delivery") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionTitle(stringResource(R.string.checkout_delivery_title))
            if (state.acceptsPickup && state.acceptsDelivery) MethodSwitch(state, form)
            if (state.isPickup) PickupQuestion(state, form)
            // Tablero «Checkout»: dirección, contacto y nota en una sola tarjeta, cada fila con su icono y separadas
            // por una línea.
            TindivoCard(modifier = Modifier.fillMaxWidth()) {
                if (state.isPickup) PickupPoint(state.businessName) else AddressBlock(state, openSheet)
                RowDivider()
                ContactBlock(state, form, openSheet)
                if (!state.isPickup) {
                    RowDivider()
                    DriverNote(state, form)
                }
            }
        }
    }
}

@Composable
internal fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleLarge,
        modifier = Modifier.padding(start = 4.dp, top = 4.dp).semantics { heading() },
    )
}

/**
 * Delivery o recojo: dos baldosas con su icono. La elegida va sobre crema, con borde naranja y el visto, para que se
 * note cuál es sin leer el color de un chip. Para TalkBack son botones de radio de un mismo grupo.
 */
@Composable
private fun MethodSwitch(
    state: CheckoutUiState,
    form: CheckoutFormActions,
) {
    Row(
        modifier = Modifier.fillMaxWidth().selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MethodTile(
            selected = !state.isPickup,
            icon = TindivoIcons.LocalShipping,
            text = stringResource(R.string.checkout_method_delivery),
            onClick = { form.onSetMethod(DeliveryChoice.Delivery) },
        )
        MethodTile(
            selected = state.isPickup,
            icon = TindivoIcons.Storefront,
            text = stringResource(R.string.checkout_method_pickup),
            onClick = { form.onSetMethod(DeliveryChoice.Pickup) },
        )
    }
}

@Composable
private fun RowScope.MethodTile(
    selected: Boolean,
    icon: ImageVector,
    text: String,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(18.dp)
    Row(
        modifier =
            Modifier
                .weight(1f)
                .heightIn(min = 56.dp)
                .clip(shape)
                .background(if (selected) scheme.primaryContainer else scheme.surfaceContainerLowest)
                .border(if (selected) 2.dp else 1.dp, if (selected) scheme.primary else scheme.outlineVariant, shape)
                .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
                .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (selected) TindivoColors.brandText else scheme.onSurfaceVariant,
            modifier = Modifier.size(22.dp),
        )
        Text(
            text = text,
            style = MaterialTheme.typography.titleMedium,
            color = if (selected) scheme.onPrimaryContainer else scheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        if (selected) {
            Box(
                modifier = Modifier.size(22.dp).background(scheme.primary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    TindivoIcons.Check,
                    contentDescription = null,
                    tint = scheme.onPrimary,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun PickupQuestion(
    state: CheckoutUiState,
    form: CheckoutFormActions,
) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = stringResource(R.string.checkout_pickup_question), style = MaterialTheme.typography.titleSmall)
            ChoiceRow(
                selected = state.pickupWhen == PickupWhen.Now,
                enabled = true,
                title = stringResource(R.string.checkout_pickup_now),
                hint = stringResource(R.string.checkout_pickup_now_hint),
                onClick = { form.onPickupWhen(PickupWhen.Now) },
            )
            ChoiceRow(
                selected = state.pickupWhen == PickupWhen.Later,
                enabled = true,
                title = stringResource(R.string.checkout_pickup_later),
                hint = stringResource(R.string.checkout_pickup_later_hint),
                onClick = { form.onPickupWhen(PickupWhen.Later) },
            )
        }
    }
}

@Composable
private fun PickupPoint(businessName: String) {
    IconRow(icon = TindivoIcons.Storefront) {
        Text(text = businessName, style = MaterialTheme.typography.titleMedium)
        Muted(stringResource(R.string.checkout_pickup_at))
    }
}

@Composable
private fun AddressBlock(
    state: CheckoutUiState,
    openSheet: (CheckoutSheet) -> Unit,
) {
    val selected = state.selectedAddress
    if (selected == null) {
        IconRow(
            icon = TindivoIcons.Place,
            trailing = stringResource(R.string.checkout_address_add),
            onClick = { openSheet(CheckoutSheet.AddAddress) },
        ) {
            Text(text = stringResource(R.string.checkout_address_title), style = MaterialTheme.typography.titleMedium)
            Muted(stringResource(R.string.checkout_address_add_hint))
        }
        return
    }
    // Con una sola dirección también: desde la lista se agrega otra sin salir del checkout.
    IconRow(
        icon = TindivoIcons.Place,
        trailing = stringResource(R.string.checkout_address_change),
        onClick = { openSheet(CheckoutSheet.ChooseAddress) },
    ) {
        val title =
            selected.line?.let { stringResource(R.string.checkout_address_line_label, it, selected.label) }
                ?: selected.label
        Text(text = title, style = MaterialTheme.typography.titleMedium)
        if (selected.reference.isNotBlank()) Muted(selected.reference)
        if (selected.isDefault) Muted(stringResource(R.string.checkout_address_default))
    }
    AddressWarnings(selected, onFix = { openSheet(CheckoutSheet.EditAddress(selected.id)) })
}

/** Lo que le falta a la dirección elegida, debajo de su fila y alineado con el texto (no con el icono). */
@Composable
private fun AddressWarnings(
    address: AddressUi,
    onFix: () -> Unit,
) {
    val noStreet = stringResource(R.string.checkout_address_no_street)
    val noReference = stringResource(R.string.checkout_address_no_reference)
    val noLocation = stringResource(R.string.checkout_address_no_location)
    val unconfirmed = stringResource(R.string.checkout_address_unconfirmed)
    val warnings =
        listOfNotNull(
            noStreet.takeIf { !address.lineOk },
            noReference.takeIf { !address.referenceOk },
            noLocation.takeIf { !address.hasLocation },
            unconfirmed.takeIf { address.hasLocation && !address.locationConfirmed },
        )
    if (warnings.isEmpty()) return
    Column(
        modifier = Modifier.padding(start = TEXT_INSET, end = 16.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        warnings.forEach {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        if (!address.lineOk) {
            Text(
                text = stringResource(R.string.checkout_address_no_street_hint),
                style = MaterialTheme.typography.bodySmall,
            )
        }
        TextButton(onClick = onFix, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(text = stringResource(R.string.checkout_address_fix))
        }
    }
}

@Composable
private fun ContactBlock(
    state: CheckoutUiState,
    form: CheckoutFormActions,
    openSheet: (CheckoutSheet) -> Unit,
) {
    val phone = state.phone
    if (state.phoneVerified && phone != null) {
        IconRow(icon = TindivoIcons.Phone) {
            Text(text = stringResource(R.string.checkout_contact_title), style = MaterialTheme.typography.titleMedium)
            Muted(stringResource(R.string.checkout_phone, phone))
        }
    } else {
        IconRow(
            icon = TindivoIcons.Phone,
            trailing = stringResource(R.string.checkout_phone_verify),
            onClick = { openSheet(CheckoutSheet.VerifyPhone) },
        ) {
            Text(text = stringResource(R.string.checkout_contact_title), style = MaterialTheme.typography.titleMedium)
            Text(
                text = stringResource(R.string.checkout_phone_missing),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
    OutlinedTextField(
        value = state.name,
        onValueChange = form.onName,
        label = { Text(stringResource(R.string.checkout_name_label)) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(start = TEXT_INSET, end = 16.dp, bottom = 12.dp),
    )
}

@Composable
private fun DriverNote(
    state: CheckoutUiState,
    form: CheckoutFormActions,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconTile(icon = TindivoIcons.Chat, modifier = Modifier.padding(top = 8.dp))
        OutlinedTextField(
            value = state.note,
            onValueChange = form.onNote,
            label = { Text(stringResource(R.string.checkout_note_label)) },
            placeholder = { Text(stringResource(R.string.checkout_note_hint)) },
            supportingText = { Text(stringResource(R.string.checkout_note_support)) },
            modifier = Modifier.weight(1f),
        )
    }
}

/**
 * Una fila del tablero: icono en un cuadro crema de 40 dp, el texto, y a la derecha la acción en naranja con su
 * chevron. Con [onClick] la fila entera es el botón (48 dp o más), así «Cambiar» no queda suelto con sangría propia.
 */
@Composable
private fun IconRow(
    icon: ImageVector,
    trailing: String? = null,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val clickable = if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .then(clickable)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        IconTile(icon = icon)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) { content() }
        if (trailing != null) {
            Text(
                text = trailing,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = TindivoColors.brandText,
            )
            Icon(
                TindivoIcons.ChevronRight,
                contentDescription = null,
                tint = TindivoColors.brandText,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun IconTile(
    icon: ImageVector,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier =
            modifier
                .size(40.dp)
                .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(14.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = TindivoColors.brandText, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun Muted(text: String) {
    Text(text = text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun RowDivider() {
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)
}

/** Donde empieza el texto de una fila: 16 de margen, 40 del icono y 12 de separación. */
private val TEXT_INSET = 68.dp
