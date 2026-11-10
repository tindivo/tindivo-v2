package com.tindivo.customer.feature.checkout

/** Lo que el formulario del checkout le pide al [CheckoutViewModel]. En las pruebas de pantalla se arma a mano. */
class CheckoutFormActions(
    val onSetMethod: (DeliveryChoice) -> Unit,
    val onPickupWhen: (PickupWhen) -> Unit,
    val onSelectAddress: (String) -> Unit,
    val onName: (String) -> Unit,
    val onNote: (String) -> Unit,
    val onSelectPay: (PayMethod) -> Unit,
    val onSelectCash: (CashChoice) -> Unit,
    val onRetryQuote: () -> Unit,
    val onRetryLoad: () -> Unit,
    val onConfirm: () -> Unit,
    val onOrdersOpened: () -> Unit,
    val onAcknowledge: () -> Unit,
    val sheets: CheckoutSheetActions,
) {
    companion object {
        fun of(viewModel: CheckoutViewModel) =
            CheckoutFormActions(
                onSetMethod = viewModel::setMethod,
                onPickupWhen = viewModel::setPickupWhen,
                onSelectAddress = viewModel::selectAddress,
                onName = viewModel::setName,
                onNote = viewModel::setNote,
                onSelectPay = viewModel::selectPay,
                onSelectCash = viewModel::selectCash,
                onRetryQuote = viewModel::retryQuote,
                onRetryLoad = viewModel::retryLoad,
                onConfirm = viewModel::confirm,
                onOrdersOpened = viewModel::ordersOpened,
                onAcknowledge = viewModel::acknowledgeAndRetry,
                sheets = CheckoutSheetActions.of(viewModel),
            )
    }
}

/** Abrir y cerrar las hojas del checkout, y lo que cada una devuelve al terminar. */
class CheckoutSheetActions(
    val onOpen: (CheckoutSheet) -> Unit,
    val onClose: () -> Unit,
    val onPickAddress: (String) -> Unit,
    val onAddressSaved: (String) -> Unit,
    val onAddressDeleted: () -> Unit,
    val onPhoneVerified: () -> Unit,
    val onProfileCompleted: () -> Unit,
) {
    companion object {
        fun of(viewModel: CheckoutViewModel) =
            CheckoutSheetActions(
                onOpen = viewModel::openSheet,
                onClose = viewModel::closeSheet,
                onPickAddress = viewModel::pickAddress,
                onAddressSaved = viewModel::onAddressSaved,
                onAddressDeleted = viewModel::onAddressDeleted,
                onPhoneVerified = viewModel::onPhoneVerified,
                onProfileCompleted = viewModel::onProfileCompleted,
            )
    }
}
