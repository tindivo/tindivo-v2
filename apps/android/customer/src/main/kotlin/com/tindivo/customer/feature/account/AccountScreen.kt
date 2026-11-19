package com.tindivo.customer.feature.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.core.network.AppError
import com.tindivo.customer.R

/** Une el ViewModel con la pantalla; es lo único de este archivo que conoce Hilt. */
@Composable
fun AccountDestination(
    onLeave: () -> Unit,
    onOpenOrders: () -> Unit,
    onOpenAddresses: () -> Unit,
    onVerifyPhone: () -> Unit,
    phoneChanged: Boolean,
    onPhoneChangeHandled: () -> Unit,
    profile: ProfileLink,
    onDeleteAccount: () -> Unit,
    viewModel: AccountViewModel = hiltViewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
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
        onOpenOrders = onOpenOrders,
        onOpenAddresses = onOpenAddresses,
        onVerifyPhone = onVerifyPhone,
        onSignOut = viewModel::signOut,
        onBack = onLeave,
        onCompleteProfile = profile.onOpen,
        onDeleteAccount = onDeleteAccount,
        nameEdit = nameEdit,
        onSaveName = viewModel::saveName,
        onDismissNameEdit = viewModel::dismissNameEdit,
    )
}

/** El enlace de la cuenta con «Completa tu perfil»: abrirla y enterarse de que volvió con el perfil creado. */
class ProfileLink(
    val completed: Boolean,
    val onCompletedHandled: () -> Unit,
    val onOpen: () -> Unit,
)

@Composable
fun AccountScreen(
    state: AccountUiState,
    onRetry: () -> Unit,
    onOpenOrders: () -> Unit,
    onOpenAddresses: () -> Unit,
    onVerifyPhone: () -> Unit,
    onSignOut: () -> Unit,
    onBack: () -> Unit,
    onCompleteProfile: () -> Unit = {},
    onDeleteAccount: () -> Unit = {},
    nameEdit: NameEditState = NameEditState.Idle,
    onSaveName: (String) -> Unit = {},
    onDismissNameEdit: () -> Unit = {},
) {
    Scaffold { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = stringResource(R.string.account_back))
            }
            Text(
                text = stringResource(R.string.account_title),
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
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
                        onSignOut = onSignOut,
                        onDeleteAccount = onDeleteAccount,
                    )
                }

                is AccountUiState.Loaded -> {
                    Profile(
                        profile = state.profile,
                        onOpenOrders = onOpenOrders,
                        onOpenAddresses = onOpenAddresses,
                        onVerifyPhone = onVerifyPhone,
                        onSignOut = onSignOut,
                        onDeleteAccount = onDeleteAccount,
                        nameEdit = nameEdit,
                        onSaveName = onSaveName,
                        onDismissNameEdit = onDismissNameEdit,
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

@Composable
private fun ProfileMissing(
    onCompleteProfile: () -> Unit,
    onSignOut: () -> Unit,
    onDeleteAccount: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(text = stringResource(R.string.account_profile_missing_title), style = MaterialTheme.typography.titleLarge)
        Text(
            text = stringResource(R.string.account_profile_missing_message),
            style = MaterialTheme.typography.bodyLarge,
        )
        Button(
            onClick = onCompleteProfile,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.profile_complete))
        }
        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.account_sign_out))
        }
        // También sin perfil: Google Play exige poder borrar la cuenta desde la app, haya o no un nombre guardado.
        DeleteAccountButton(onDeleteAccount = onDeleteAccount)
    }
}

@Composable
private fun Profile(
    profile: AccountProfileUi,
    onOpenOrders: () -> Unit,
    onOpenAddresses: () -> Unit,
    onVerifyPhone: () -> Unit,
    onSignOut: () -> Unit,
    onDeleteAccount: () -> Unit,
    nameEdit: NameEditState,
    onSaveName: (String) -> Unit,
    onDismissNameEdit: () -> Unit,
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
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(text = profile.fullName, style = MaterialTheme.typography.titleLarge)
        TextButton(onClick = { editing = true }, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(text = stringResource(R.string.account_name_edit))
        }
        Text(
            text =
                stringResource(
                    if (profile.phoneVerified) R.string.account_phone_verified else R.string.account_phone_missing,
                ),
            style = MaterialTheme.typography.bodyLarge,
        )
        if (profile.phoneVerified && profile.phone != null) {
            Text(text = profile.phone, style = MaterialTheme.typography.bodyLarge)
        }
        OutlinedButton(
            onClick = onVerifyPhone,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(
                text =
                    stringResource(
                        if (profile.phoneVerified) R.string.account_phone_change else R.string.account_phone_verify,
                    ),
            )
        }
        Button(
            onClick = onOpenOrders,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.account_orders))
        }
        OutlinedButton(
            onClick = onOpenAddresses,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.account_addresses))
        }
        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.heightIn(min = 48.dp),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 12.dp),
        ) {
            Text(text = stringResource(R.string.account_sign_out))
        }
        DeleteAccountButton(onDeleteAccount = onDeleteAccount)
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

/** Discreto a propósito, pero siempre a la vista: Google Play exige poder borrar la cuenta dentro de la app. */
@Composable
private fun DeleteAccountButton(onDeleteAccount: () -> Unit) {
    TextButton(onClick = onDeleteAccount, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(text = stringResource(R.string.account_delete), color = MaterialTheme.colorScheme.error)
    }
}

@Preview(showBackground = true)
@Composable
private fun AccountPreview() {
    TindivoTheme {
        AccountScreen(
            state = AccountUiState.Loaded(AccountProfileUi("Rosa Quispe", phoneVerified = false)),
            onRetry = {},
            onOpenOrders = {},
            onOpenAddresses = {},
            onVerifyPhone = {},
            onSignOut = {},
            onBack = {},
        )
    }
}
