package com.tindivo.customer.feature.courier

/** Lo que el formulario le pide al ViewModel. Se separa para poder pintar la pantalla sin él (vista previa). */
internal class CourierFormActions(
    val onRetry: () -> Unit,
    val onOpenSheet: (CourierSheet) -> Unit,
    val onReference: (CourierEnd, String) -> Unit,
    val onPhone: (CourierEnd, String) -> Unit,
    val onName: (CourierEnd, String) -> Unit,
    val onToggleMe: (CourierEnd) -> Unit,
    val onItem: (String) -> Unit,
    val onPayer: (CourierPayer) -> Unit,
    val onNote: (String) -> Unit,
    val onReadyAndPaid: (Boolean) -> Unit,
    val onSubmit: () -> Unit,
) {
    companion object {
        fun of(viewModel: CourierRequestViewModel) =
            CourierFormActions(
                onRetry = viewModel::retry,
                onOpenSheet = viewModel::openSheet,
                onReference = viewModel::setReference,
                onPhone = viewModel::setPhone,
                onName = viewModel::setName,
                onToggleMe = viewModel::toggleMe,
                onItem = viewModel::setItem,
                onPayer = viewModel::setPayer,
                onNote = viewModel::setNote,
                onReadyAndPaid = viewModel::setReadyAndPaid,
                onSubmit = viewModel::submit,
            )
    }
}
