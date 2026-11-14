package com.tindivo.customer.feature.checkout

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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
            if (state.isPickup) {
                PickupQuestion(state, form)
                PickupPoint(state.businessName)
            } else {
                AddressCard(state, openSheet)
            }
            ContactCard(state, form, openSheet)
            if (!state.isPickup) DriverNote(state, form)
        }
    }
}

@Composable
internal fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.semantics { heading() },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MethodSwitch(
    state: CheckoutUiState,
    form: CheckoutFormActions,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(
            selected = !state.isPickup,
            onClick = { form.onSetMethod(DeliveryChoice.Delivery) },
            label = { Text(stringResource(R.string.checkout_method_delivery)) },
            modifier = Modifier.heightIn(min = 48.dp),
        )
        FilterChip(
            selected = state.isPickup,
            onClick = { form.onSetMethod(DeliveryChoice.Pickup) },
            label = { Text(stringResource(R.string.checkout_method_pickup)) },
            modifier = Modifier.heightIn(min = 48.dp),
        )
    }
}

@Composable
private fun PickupQuestion(
    state: CheckoutUiState,
    form: CheckoutFormActions,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
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
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = stringResource(R.string.checkout_pickup_point), style = MaterialTheme.typography.titleSmall)
            Text(text = businessName, style = MaterialTheme.typography.bodyLarge)
            Text(
                text = stringResource(R.string.checkout_pickup_at),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun AddressCard(
    state: CheckoutUiState,
    openSheet: (CheckoutSheet) -> Unit,
) {
    val selected = state.selectedAddress
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text = stringResource(R.string.checkout_address_title), style = MaterialTheme.typography.titleSmall)
            if (selected == null) {
                Text(
                    text = stringResource(R.string.checkout_address_add_hint),
                    style = MaterialTheme.typography.bodyMedium,
                )
                TextButton(
                    onClick = { openSheet(CheckoutSheet.AddAddress) },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(text = stringResource(R.string.checkout_address_add))
                }
            } else {
                AddressSummary(selected, onFix = { openSheet(CheckoutSheet.EditAddress(selected.id)) })
                // Con una sola dirección también: desde la lista se agrega otra sin salir del checkout.
                TextButton(
                    onClick = { openSheet(CheckoutSheet.ChooseAddress) },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(text = stringResource(R.string.checkout_address_change))
                }
            }
        }
    }
}

@Composable
private fun AddressSummary(
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
    Text(text = address.label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
    address.line?.let { Text(text = it, style = MaterialTheme.typography.bodyMedium) }
    if (address.reference.isNotBlank()) {
        Text(text = address.reference, style = MaterialTheme.typography.bodySmall)
    }
    if (address.isDefault) {
        Text(text = stringResource(R.string.checkout_address_default), style = MaterialTheme.typography.labelSmall)
    }
    warnings.forEach {
        Text(text = it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
    }
    if (!address.lineOk) {
        Text(
            text = stringResource(R.string.checkout_address_no_street_hint),
            style = MaterialTheme.typography.bodySmall,
        )
    }
    if (warnings.isNotEmpty()) {
        TextButton(onClick = onFix, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(text = stringResource(R.string.checkout_address_fix))
        }
    }
}

@Composable
private fun ContactCard(
    state: CheckoutUiState,
    form: CheckoutFormActions,
    openSheet: (CheckoutSheet) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = stringResource(R.string.checkout_contact_title), style = MaterialTheme.typography.titleSmall)
            OutlinedTextField(
                value = state.name,
                onValueChange = form.onName,
                label = { Text(stringResource(R.string.checkout_name_label)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            val phone = state.phone
            if (state.phoneVerified && phone != null) {
                Text(text = stringResource(R.string.checkout_phone, phone), style = MaterialTheme.typography.bodyMedium)
            } else {
                Text(
                    text = stringResource(R.string.checkout_phone_missing),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
                TextButton(
                    onClick = { openSheet(CheckoutSheet.VerifyPhone) },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(text = stringResource(R.string.checkout_phone_verify))
                }
            }
        }
    }
}

@Composable
private fun DriverNote(
    state: CheckoutUiState,
    form: CheckoutFormActions,
) {
    OutlinedTextField(
        value = state.note,
        onValueChange = form.onNote,
        label = { Text(stringResource(R.string.checkout_note_label)) },
        placeholder = { Text(stringResource(R.string.checkout_note_hint)) },
        supportingText = { Text(stringResource(R.string.checkout_note_support)) },
        modifier = Modifier.fillMaxWidth(),
    )
}
