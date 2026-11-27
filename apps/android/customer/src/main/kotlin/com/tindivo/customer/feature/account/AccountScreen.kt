package com.tindivo.customer.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tindivo.core.designsystem.TindivoCard
import com.tindivo.core.designsystem.TindivoPrimaryButton
import com.tindivo.core.designsystem.TindivoSpacing
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R
import com.tindivo.customer.feature.addresses.AddressListUiState
import com.tindivo.customer.feature.addresses.AddressListViewModel
import com.tindivo.customer.push.NotificationsEffects
import com.tindivo.customer.push.NotificationsToggleRow
import com.tindivo.customer.push.NotificationsViewModel
import com.tindivo.customer.support.SUPPORT_FALLBACK_WHATSAPP
import com.tindivo.customer.support.SupportViewModel
import java.util.UUID

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
fun AccountDestination(
    onLeave: () -> Unit,
    onOpenAddresses: () -> Unit,
    onVerifyPhone: () -> Unit,
    phoneChanged: Boolean,
    onPhoneChangeHandled: () -> Unit,
    profile: ProfileLink,
    onDeleteAccount: () -> Unit,
    onAddAddress: () -> Unit,
    onEditAddress: (String) -> Unit,
    addressesChanged: Boolean,
    onAddressesChangeHandled: () -> Unit,
    onOpenDiagnostics: (() -> Unit)? = null,
    viewModel: AccountViewModel = hiltViewModel(),
    notifications: NotificationsViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val push = notifications.state.collectAsStateWithLifecycle().value
    NotificationsEffects(notifications)
    val addressList = hiltViewModel<AddressListViewModel>()
    val addresses = addressList.state.collectAsStateWithLifecycle().value
    // Volvió del formulario o de la libreta con algo cambiado: la lista que se tenía ya no es la del servidor.
    LaunchedEffect(addressesChanged) {
        if (addressesChanged) {
            addressList.refresh(quiet = true)
            onAddressesChangeHandled()
        }
    }
    val supportNumber = hiltViewModel<SupportViewModel>().number.collectAsStateWithLifecycle().value
    val nameEdit = viewModel.nameEdit.collectAsStateWithLifecycle().value
    // Volvió de «Completa tu perfil» con el perfil ya creado: se carga la cuenta.
    LaunchedEffect(profile.completed) {
        if (profile.completed) {
            viewModel.load()
            profile.onCompletedHandled()
        }
    }
    // Sin perfil, la primera vez se abre sola la pantalla del nombre, en vez de mostrar un error.
    LaunchedEffect(state) {
        if (state is AccountUiState.ProfileMissing && state.openNow) {
            viewModel.onProfilePromptOpened()
            profile.onOpen()
        }
    }
    // Volvió del flujo del teléfono: se pide el perfil otra vez para ver el número nuevo.
    LaunchedEffect(phoneChanged) {
        if (phoneChanged) {
            viewModel.load()
            onPhoneChangeHandled()
        }
    }
    LaunchedEffect(state) {
        if (state is AccountUiState.LoggedOut) onLeave()
    }
    AccountScreen(
        state = state,
        onRetry = viewModel::load,
        onOpenAddresses = onOpenAddresses,
        onVerifyPhone = onVerifyPhone,
        onSignOut = viewModel::signOut,
        onCompleteProfile = profile.onOpen,
        onDeleteAccount = onDeleteAccount,
        onOpenDiagnostics = onOpenDiagnostics,
        supportNumber = supportNumber,
        nameEdit = nameEdit,
        onSaveName = viewModel::saveName,
        onDismissNameEdit = viewModel::dismissNameEdit,
        notificationsToggle = {
            push.status?.let {
                TindivoCard(modifier = Modifier.fillMaxWidth()) {
                    Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                        NotificationsToggleRow(on = it.on, onToggle = notifications::toggle)
                    }
                }
            }
        },
        addresses = addresses,
        onAddAddress = onAddAddress,
        onEditAddress = { onEditAddress(it.toString()) },
        onRetryAddresses = { addressList.refresh() },
    )
}

/** El enlace de la cuenta con «Completa tu perfil»: abrirla y enterarse de que volvió con el perfil creado. */
class ProfileLink(
    val completed: Boolean,
    val onCompletedHandled: () -> Unit,
    val onOpen: () -> Unit,
)

@Composable
internal fun AccountScreen(
    state: AccountUiState,
    onRetry: () -> Unit,
    onOpenAddresses: () -> Unit,
    onVerifyPhone: () -> Unit,
    onSignOut: () -> Unit,
    onCompleteProfile: () -> Unit = {},
    onDeleteAccount: () -> Unit = {},
    onOpenDiagnostics: (() -> Unit)? = null,
    supportNumber: String = SUPPORT_FALLBACK_WHATSAPP,
    nameEdit: NameEditState = NameEditState.Idle,
    onSaveName: (String) -> Unit = {},
    onDismissNameEdit: () -> Unit = {},
    notificationsToggle: @Composable () -> Unit = {},
    addresses: AddressListUiState = AddressListUiState.Loading,
    onAddAddress: () -> Unit = {},
    onEditAddress: (UUID) -> Unit = {},
    onRetryAddresses: () -> Unit = {},
) {
    val addressesCard =
        AddressesCardModel(
            state = addresses,
            onOpenAll = onOpenAddresses,
            onAdd = onAddAddress,
            onEdit = onEditAddress,
            onRetry = onRetryAddresses,
        )
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp),
        ) {
            // Pestaña raíz (tablero «9 · Cuenta»): título de 26 sp y sin «Volver».
            Text(
                text = stringResource(R.string.account_title),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(start = 4.dp, top = 20.dp, bottom = 12.dp).semantics { heading() },
            )
            when (state) {
                AccountUiState.Loading, AccountUiState.LoggedOut -> {
                    Loading()
                }

                is AccountUiState.Failed -> {
                    Failure(error = state.error, onRetry = onRetry)
                }

                is AccountUiState.ProfileMissing -> {
                    ProfileMissing(
                        onCompleteProfile = onCompleteProfile,
                        addresses = addressesCard,
                        onSignOut = onSignOut,
                        onDeleteAccount = onDeleteAccount,
                        onOpenDiagnostics = onOpenDiagnostics,
                        supportNumber = supportNumber,
                        notificationsToggle = notificationsToggle,
                    )
                }

                is AccountUiState.Loaded -> {
                    Profile(
                        profile = state.profile,
                        addresses = addressesCard,
                        onVerifyPhone = onVerifyPhone,
                        onSignOut = onSignOut,
                        onDeleteAccount = onDeleteAccount,
                        onOpenDiagnostics = onOpenDiagnostics,
                        supportNumber = supportNumber,
                        nameEdit = nameEdit,
                        onSaveName = onSaveName,
                        onDismissNameEdit = onDismissNameEdit,
                        notificationsToggle = notificationsToggle,
                    )
                }
            }
        }
    }
}

@Composable
private fun Loading() {
    val description = stringResource(R.string.account_loading)
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = description })
    }
}

@Composable
private fun Failure(
    error: AppError,
    onRetry: () -> Unit,
) {
    val message =
        if (error is AppError.Network) {
            stringResource(
                R.string.error_network,
            )
        } else {
            stringResource(R.string.error_generic)
        }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = message, style = MaterialTheme.typography.bodyLarge)
        Button(
            onClick = onRetry,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.account_retry))
        }
    }
}

/**
 * El contenido de Cuenta desplaza; entre tarjetas, 24 dp como el tablero. Toma todo el alto que deja el título
 * (`weight(1f)`) y desplaza dentro de él: así, en una pantalla ancha o baja, «Borrar mi cuenta» queda al final del
 * recorrido y se alcanza con el dedo, sin quedar tapado.
 */
@Composable
private fun ColumnScope.AccountColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier =
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(top = 4.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(TindivoSpacing.section),
        content = content,
    )
}

@Composable
private fun ColumnScope.ProfileMissing(
    onCompleteProfile: () -> Unit,
    addresses: AddressesCardModel,
    onSignOut: () -> Unit,
    onDeleteAccount: () -> Unit,
    onOpenDiagnostics: (() -> Unit)?,
    supportNumber: String,
    notificationsToggle: @Composable () -> Unit = {},
) {
    AccountColumn {
        TindivoCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(TindivoSpacing.screen),
                verticalArrangement = Arrangement.spacedBy(TindivoSpacing.tight),
            ) {
                Text(
                    text = stringResource(R.string.account_profile_missing_title),
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = stringResource(R.string.account_profile_missing_message),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TindivoPrimaryButton(
                    text = stringResource(R.string.profile_complete),
                    onClick = onCompleteProfile,
                    modifier = Modifier.padding(top = TindivoSpacing.tight),
                )
            }
        }
        AddressesCard(addresses)
        SettingsCard(supportNumber = supportNumber)
        notificationsToggle()
        SignOutCard(onSignOut = onSignOut)
        // También sin perfil: Google Play exige poder borrar la cuenta desde la app, haya o no un nombre guardado.
        AccountFooter(onDeleteAccount = onDeleteAccount, onOpenDiagnostics = onOpenDiagnostics)
    }
}

@Composable
private fun ColumnScope.Profile(
    profile: AccountProfileUi,
    addresses: AddressesCardModel,
    onVerifyPhone: () -> Unit,
    onSignOut: () -> Unit,
    onDeleteAccount: () -> Unit,
    onOpenDiagnostics: (() -> Unit)?,
    supportNumber: String,
    nameEdit: NameEditState,
    onSaveName: (String) -> Unit,
    onDismissNameEdit: () -> Unit,
    notificationsToggle: @Composable () -> Unit = {},
) {
    var editing by remember { mutableStateOf(false) }
    LaunchedEffect(nameEdit) {
        if (nameEdit == NameEditState.Done) {
            editing = false
            onDismissNameEdit()
        }
    }
    if (editing) {
        NameEditDialog(
            current = profile.fullName,
            state = nameEdit,
            onSave = onSaveName,
            onCancel = {
                editing = false
                onDismissNameEdit()
            },
        )
    }
    AccountColumn {
        ProfileCard(profile = profile, onEditName = { editing = true }, onVerifyPhone = onVerifyPhone)
        AddressesCard(addresses)
        SettingsCard(supportNumber = supportNumber)
        notificationsToggle()
        SignOutCard(onSignOut = onSignOut)
        AccountFooter(onDeleteAccount = onDeleteAccount, onOpenDiagnostics = onOpenDiagnostics)
    }
}

/** Cambiar el nombre del perfil sin salir de Cuenta (CUS-AUT-014): el mismo largo y los mismos caracteres que el servidor. */
@Composable
private fun NameEditDialog(
    current: String,
    state: NameEditState,
    onSave: (String) -> Unit,
    onCancel: () -> Unit,
) {
    var text by remember { mutableStateOf(current) }
    val saving = state == NameEditState.Saving
    AlertDialog(
        onDismissRequest = { if (!saving) onCancel() },
        title = { Text(text = stringResource(R.string.account_name_edit_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text(text = stringResource(R.string.profile_name_label)) },
                    singleLine = true,
                    enabled = !saving,
                    isError = state == NameEditState.Invalid,
                    modifier = Modifier.fillMaxWidth(),
                )
                when (state) {
                    NameEditState.Invalid -> NameEditError(R.string.profile_name_error)
                    NameEditState.Failed -> NameEditError(R.string.profile_error_generic)
                    else -> Unit
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(text) },
                enabled = !saving,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(text = stringResource(if (saving) R.string.profile_saving else R.string.account_name_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel, enabled = !saving, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.account_name_cancel))
            }
        },
    )
}

@Composable
private fun NameEditError(message: Int) {
    Text(
        text = stringResource(message),
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodyMedium,
    )
}

@Preview(showBackground = true)
@Composable
private fun AccountPreview() {
    TindivoTheme {
        AccountScreen(
            state = AccountUiState.Loaded(AccountProfileUi("Rosa Quispe", phoneVerified = false)),
            onRetry = {},
            onOpenAddresses = {},
            onVerifyPhone = {},
            onSignOut = {},
        )
    }
}
