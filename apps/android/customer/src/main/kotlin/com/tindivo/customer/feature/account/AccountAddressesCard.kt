package com.tindivo.customer.feature.account

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoColors
import com.tindivo.core.designsystem.TindivoIcons
import com.tindivo.customer.R
import com.tindivo.customer.feature.addresses.AddressListUiState
import com.tindivo.customer.feature.addresses.AddressUi
import java.util.UUID

/** Cuántas direcciones se ven en Cuenta; el resto se abre con «Ver todas». */
internal const val ACCOUNT_ADDRESSES_PREVIEW = 3

/** Lo que la tarjeta necesita de la libreta: su estado y qué hacer al tocar cada cosa. */
internal class AddressesCardModel(
    val state: AddressListUiState,
    val onOpenAll: () -> Unit,
    val onAdd: () -> Unit,
    val onEdit: (UUID) -> Unit,
    val onRetry: () -> Unit,
)

private const val SKELETON_ROWS = 2
private val ROW_ICON = 24.dp
private val SKELETON_SHAPE = RoundedCornerShape(6.dp)

/**
 * «Mis direcciones» en Cuenta (CUS-DIR): hasta tres direcciones guardadas en corto, cada una abre su edición; «Ver todas»
 * lleva a la libreta completa. Lee la misma libreta que la pantalla de direcciones (`AddressListViewModel`), sin
 * endpoints ni reglas propias.
 */
@Composable
internal fun AddressesCard(model: AddressesCardModel) {
    TindivoCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = stringResource(R.string.account_addresses),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp).semantics { heading() },
        )
        when (val state = model.state) {
            AddressListUiState.Loading, AddressListUiState.LoggedOut -> AddressesSkeleton()
            AddressListUiState.Empty -> AddressesEmpty(model.onAdd)
            is AddressListUiState.Failed -> AddressesError(model.onRetry)
            is AddressListUiState.Loaded -> AddressesLoaded(state.items, model)
        }
    }
}

@Composable
private fun AddressesLoaded(
    items: List<AddressUi>,
    model: AddressesCardModel,
) {
    items.take(ACCOUNT_ADDRESSES_PREVIEW).forEachIndexed { index, address ->
        if (index > 0) HorizontalDivider(color = TindivoColors.border, modifier = Modifier.padding(start = 56.dp))
        AddressRow(address = address, onClick = { model.onEdit(address.id) })
    }
    HorizontalDivider(color = TindivoColors.border)
    if (items.size > ACCOUNT_ADDRESSES_PREVIEW) {
        FooterButton(stringResource(R.string.account_addresses_see_all, items.size), model.onOpenAll)
    }
    FooterButton(stringResource(R.string.account_addresses_add), model.onAdd)
}

@Composable
private fun AddressRow(
    address: AddressUi,
    onClick: () -> Unit,
) {
    val editLabel = stringResource(R.string.account_addresses_edit)
    val place = address.line ?: address.reference.ifBlank { stringResource(R.string.addresses_no_line) }
    val description =
        stringResource(
            if (address.isDefault) R.string.account_addresses_row_default else R.string.account_addresses_row,
            address.label,
            place,
        )
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clickable(onClickLabel = editLabel, onClick = onClick)
                .semantics(mergeDescendants = true) {
                    contentDescription = description
                    role = Role.Button
                }.padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(
            imageVector = labelIcon(address.label),
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(ROW_ICON),
        )
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = address.label,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (address.isDefault) {
                    Text(
                        text = stringResource(R.string.addresses_default_badge),
                        style = MaterialTheme.typography.labelMedium,
                        color = TindivoColors.brandText,
                        maxLines = 1,
                    )
                }
            }
            Text(
                text = place,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            imageVector = TindivoIcons.ChevronRight,
            contentDescription = null,
            tint = TindivoColors.textMuted,
            modifier = Modifier.size(18.dp),
        )
    }
}

/** El ícono sale de la etiqueta que escribió la persona: «Casa», «Trabajo» u otra. */
internal fun labelIcon(label: String): ImageVector =
    when (label.trim().lowercase()) {
        "casa" -> TindivoIcons.Home
        "trabajo" -> TindivoIcons.Work
        else -> TindivoIcons.Place
    }

@Composable
private fun FooterButton(
    text: String,
    onClick: () -> Unit,
) {
    TextButton(onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(horizontal = 8.dp)) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun AddressesEmpty(onAdd: () -> Unit) {
    Text(
        text = stringResource(R.string.account_addresses_empty),
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
    FooterButton(stringResource(R.string.account_addresses_add_first), onAdd)
}

@Composable
private fun AddressesError(onRetry: () -> Unit) {
    Text(
        text = stringResource(R.string.account_addresses_error),
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
    FooterButton(stringResource(R.string.account_addresses_retry), onRetry)
}

/** Dos filas de relleno mientras llega la libreta; el lector de pantalla oye solo «Cargando tus direcciones». */
@Composable
private fun AddressesSkeleton() {
    val loading = stringResource(R.string.account_addresses_loading)
    Column(
        modifier = Modifier.padding(16.dp).semantics(mergeDescendants = true) { contentDescription = loading },
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        repeat(SKELETON_ROWS) {
            Row(
                modifier = Modifier.clearAndSetSemantics { },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Box(modifier = Modifier.size(ROW_ICON).clip(SKELETON_SHAPE).background(TindivoColors.border))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(
                        modifier =
                            Modifier
                                .size(
                                    width = 80.dp,
                                    height = 14.dp,
                                ).clip(SKELETON_SHAPE)
                                .background(TindivoColors.border),
                    )
                    Box(
                        modifier =
                            Modifier
                                .size(
                                    width = 180.dp,
                                    height = 12.dp,
                                ).clip(SKELETON_SHAPE)
                                .background(TindivoColors.border),
                    )
                }
            }
        }
    }
}
