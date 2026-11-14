package com.tindivo.customer.feature.addresses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.AccountMismatchException
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.generated.model.CreateCustomerAddressRequest
import com.tindivo.core.network.generated.model.CreateOrderRequestCoordinates
import com.tindivo.core.network.generated.model.ListCustomerAddresses200ResponseDataItemsInner
import com.tindivo.core.network.generated.model.UpdateCustomerAddressRequest
import com.tindivo.core.network.generated.model.UpdateCustomerAddressRequestCoordinates
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.SheetClose
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SessionWatch
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID

/** Cómo terminó el formulario; la pantalla vuelve atrás al verlo. */
internal sealed interface FormOutcome {
    /** Guardó. [id] es el de la dirección que devolvió el servidor: la nueva, en un alta. */
    data class Saved(
        val id: String,
    ) : FormOutcome

    data object Deleted : FormOutcome

    data object LoggedOut : FormOutcome
}

internal data class AddressFormState(
    val loading: Boolean = true,
    val loadError: AppError? = null,
    /** Nulo = alta. */
    val editingId: UUID? = null,
    val label: String = ADDRESS_LABELS.first(),
    val line: String = "",
    val reference: String = "",
    /** El punto elegido en el mapa. Nulo = nadie lo ha marcado (o la dirección vieja nunca tuvo uno confirmado). */
    val point: GeoPoint? = null,
    val makeDefault: Boolean = false,
    /** Ya es la predeterminada, o es la primera dirección: el servidor la deja predeterminada y no hay interruptor. */
    val hideDefaultSwitch: Boolean = false,
    val area: CoverageArea = CoverageArea.Fallback,
    val saving: Boolean = false,
    val confirmingDelete: Boolean = false,
    val deleting: Boolean = false,
    val saveError: AppError? = null,
    val outcome: FormOutcome? = null,
    /** El [outcome] de un guardado o un borrado ya se entregó a la hoja del checkout ([AddressFormViewModel.takeResult]). */
    val delivered: Boolean = false,
    /** «Usar mi ubicación»: si hay GPS, si está buscando y qué pasó la última vez. */
    val locate: LocateState = LocateState(),
) {
    val missing: MissingField? get() = missingField(point, line, reference, area)
    val busy: Boolean get() = saving || deleting
    val canSave: Boolean get() = !loading && loadError == null && !busy && missing == null
}

/**
 * El formulario de alta y edición. El servidor decide la predeterminada; aquí solo se le pide `isDefault: true`.
 * Qué dirección se edita llega al crearlo ([Factory]): la ruta de Mi cuenta y la hoja del checkout pasan el mismo dato.
 */
@HiltViewModel(assistedFactory = AddressFormViewModel.Factory::class)
internal class AddressFormViewModel
    @AssistedInject
    constructor(
        /** El uuid de la dirección que se edita; nulo = alta. */
        @Assisted editingAddressId: String?,
        private val addresses: AddressRepository,
        private val catalog: CatalogRepository,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
        private val locations: LocationSource,
    ) : ViewModel() {
        @AssistedFactory
        interface Factory {
            fun create(editingAddressId: String?): AddressFormViewModel
        }

        private val editingId: UUID? =
            editingAddressId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        private val _state =
            MutableStateFlow(
                AddressFormState(editingId = editingId, locate = LocateState(available = locations.isAvailable())),
            )
        val state: StateFlow<AddressFormState> = _state.asStateFlow()

        private var job: Job? = null
        private var locateJob: Job? = null

        /**
         * El formulario está a la vista (la app en primer plano). Fuera de ella no se empieza ni se aplica ninguna
         * lectura del GPS: la ubicación solo se pide con la persona mirando el formulario (CAX-001).
         */
        private var foreground = true

        /** La cuenta con la que se abrió la pantalla: cada llamada va atada a ella y, sin cuenta, no se llama. */
        private val accountId: String? = (sessionStore.state.value as? SessionState.SignedIn)?.userId

        private val loggedOut get() = _state.value.outcome == FormOutcome.LoggedOut

        // Irreversible: la hoja del checkout se cerró con el formulario libre; desde ahí no se guarda ni se borra.
        private var released = false

        /** El punto con el que se abrió: solo si cambia (o no estaba confirmado) viaja al guardar. */
        private var originalPoint: GeoPoint? = null
        private var originalConfirmed = false

        init {
            val watch = SessionWatch()
            viewModelScope.launch {
                sessionStore.state.collect {
                    if (watch.ended(it)) {
                        job?.cancel()
                        locateJob?.cancel()
                        _state.update { s -> s.copy(outcome = FormOutcome.LoggedOut) }
                    }
                }
            }
            load()
        }

        /** Carga (o reintenta cargar) el formulario. Con la hoja del checkout ya cerrada no llama (CAX-005). */
        fun load() {
            if (released || job?.isActive == true || loggedOut) return
            val account = accountId ?: return endSession()
            _state.update { it.copy(loading = true, loadError = null) }
            job = viewModelScope.launch { loadAll(account) }
        }

        fun onLabel(value: String) = edit { it.copy(label = value) }

        fun onLine(value: String) = edit { it.copy(line = value.take(ADDRESS_LINE_MAX)) }

        fun onReference(value: String) = edit { it.copy(reference = value.take(ADDRESS_REFERENCE_MAX)) }

        fun onMakeDefault(value: Boolean) = edit { it.copy(makeDefault = value) }

        /**
         * El mapa dejó de moverse por un gesto de la persona: ese es el punto que eligió. Manda sobre el GPS: una lectura
         * que aún estaba en curso se cancela y no lo pisa.
         */
        fun onPointChosen(point: GeoPoint) {
            if (_state.value.busy) return
            stopLocating()
            edit { it.copy(point = point, locate = it.locate.copy(notice = null, located = null)) }
        }

        /**
         * «Usar mi ubicación», ya resuelto el permiso por la pantalla. Con permiso (preciso o aproximado) se pide UNA
         * lectura; sin él, se dice y la persona sigue a mano. El permiso solo se pide al tocar el botón.
         */
        fun onLocationPermission(result: LocationPermission) {
            val s = _state.value
            if (!foreground || loggedOut || s.busy || !s.locate.available) return
            when (result) {
                LocationPermission.Granted -> locate()
                LocationPermission.Denied -> showLocateNotice(LocateNotice.Denied)
                LocationPermission.DeniedForever -> showLocateNotice(LocateNotice.DeniedForever)
            }
        }

        /** La persona salió del formulario (o cerró la hoja): la lectura en curso se cancela. */
        fun stopLocating() {
            locateJob?.cancel()
            locateJob = null
            _state.update { if (it.locate.locating) it.copy(locate = it.locate.copy(locating = false)) else it }
        }

        /**
         * La app pasó a segundo plano ([visible] = `false`: Inicio, pantalla bloqueada, otra app encima) o volvió
         * ([visible] = `true`). Al salir, la lectura en curso se cancela aunque el formulario siga compuesto y este
         * ViewModel vivo; al volver no se pide nada: hace falta un toque nuevo en «Usar mi ubicación» (CAX-001).
         */
        fun onForegroundChanged(visible: Boolean) {
            foreground = visible
            if (!visible) stopLocating()
        }

        private fun locate() {
            if (locateJob?.isActive == true) return
            _state.update { it.copy(locate = it.locate.copy(locating = true, notice = null)) }
            locateJob =
                viewModelScope.launch {
                    // Si el GPS no contesta ni con su propio plazo, se deja de esperar: la persona sigue a mano.
                    val reading = withTimeoutOrNull(LOCATE_GIVE_UP_MS) { locations.current() } ?: LocationReading.NoFix
                    // Una lectura que llega a la vez que la app sale a segundo plano (o ya cancelada) no se aplica.
                    if (!foreground || !isActive) return@launch
                    settle { it.withReading(reading) }
                }
        }

        private fun showLocateNotice(notice: LocateNotice) =
            _state.update { it.copy(locate = it.locate.copy(notice = notice)) }

        fun askDelete() = edit { if (it.editingId != null) it.copy(confirmingDelete = true) else it }

        fun cancelDelete() = edit { it.copy(confirmingDelete = false) }

        private fun edit(change: (AddressFormState) -> AddressFormState) {
            _state.update { if (it.busy) it else change(it).copy(saveError = null) }
        }

        /** Guarda. Con un guardado en curso, o con algo por completar, no hace nada: un doble toque manda una sola vez. */
        fun save() {
            if (released) return
            val s = _state.value
            val point = s.point
            if (!s.canSave || point == null || job?.isActive == true || loggedOut) return
            val account = accountId ?: return endSession()
            // Lo que se guarda es el punto de ahora: una lectura del GPS que llegue después no lo cambia.
            stopLocating()
            _state.update { it.copy(saving = true, saveError = null) }
            job =
                viewModelScope.launch {
                    val result =
                        if (editingId == null) create(s, point, account) else update(editingId, s, point, account)
                    when (result) {
                        is ApiResult.Success -> {
                            val saved = FormOutcome.Saved(result.data.id.toString())
                            settle { it.copy(saving = false, outcome = saved) }
                        }

                        is ApiResult.Failure -> {
                            onActionFailure(result.error, account)
                        }
                    }
                }
        }

        /** Borra la dirección que se está editando, ya confirmado en la propia pantalla. */
        fun confirmDelete() {
            val id = editingId ?: return
            if (released) return
            if (!_state.value.confirmingDelete || job?.isActive == true || loggedOut) return
            val account = accountId ?: return endSession()
            _state.update { it.copy(deleting = true, saveError = null) }
            job =
                viewModelScope.launch {
                    when (val result = addresses.delete(id, account)) {
                        is ApiResult.Success -> {
                            settle { it.copy(deleting = false, outcome = FormOutcome.Deleted) }
                        }

                        // Si ya no existe (la borraron en otro teléfono) el resultado es el que se quería.
                        is ApiResult.Failure -> {
                            if (result.error.isNotFound()) {
                                settle { it.copy(deleting = false, outcome = FormOutcome.Deleted) }
                            } else {
                                onActionFailure(result.error, account)
                            }
                        }
                    }
                }
        }

        /**
         * La hoja del checkout pide cerrarse (ya escondida, o con su «Cancelar»): se cierra solo si no hay un guardado
         * ni un borrado en curso, leído ahora en el estado y no en la última recomposición de la hoja. Si se cierra,
         * esta apertura ya no empieza ninguna llamada: un toque que llegue tarde no manda nada cuyo resultado ya no
         * llegaría al checkout. Y si un guardado o un borrado ya terminó sin que nadie lo entregara, va en
         * [SheetClose.Close.pending], para que la hoja lo entregue antes de retirarse (CAX-005).
         */
        fun closeIfIdle(): SheetClose<FormOutcome> {
            if (_state.value.busy) return SheetClose.Busy
            released = true
            return SheetClose.Close(takeResult())
        }

        /**
         * El guardado ([FormOutcome.Saved]) o el borrado ([FormOutcome.Deleted]) terminado, una sola vez: lo recibe
         * quien lo pida primero (el efecto de la hoja o su cierre) y queda marcado como entregado en el mismo cambio de
         * estado. Cualquier otro caso devuelve `null`. Si entrega algo, esta apertura ya no empieza ninguna llamada, como
         * tras [closeIfIdle]: un toque tardío en «Guardar» o en «Borrar», o un reintento de la carga, no sale a la red
         * aunque la hoja aún no se haya retirado (CAX-005).
         */
        fun takeResult(): FormOutcome? {
            var taken: FormOutcome? = null
            _state.update {
                val outcome = it.outcome
                taken = outcome.takeIf { o -> !it.delivered && (o is FormOutcome.Saved || o == FormOutcome.Deleted) }
                if (taken == null) it else it.copy(delivered = true)
            }
            if (taken != null) released = true
            return taken
        }

        private suspend fun create(
            s: AddressFormState,
            point: GeoPoint,
            account: String,
        ): ApiResult<ListCustomerAddresses200ResponseDataItemsInner> =
            addresses.create(
                CreateCustomerAddressRequest(
                    reference = s.reference.trim(),
                    label = s.label,
                    line = s.line.trim(),
                    coordinates =
                        CreateOrderRequestCoordinates(
                            point.lat.toWireCoordinate(),
                            point.lng.toWireCoordinate(),
                        ),
                    // Solo si la persona lo prendió: sin `isDefault` decide el servidor (la primera queda predeterminada).
                    isDefault = if (s.makeDefault) true else null,
                ),
                account,
            )

        private suspend fun update(
            id: UUID,
            s: AddressFormState,
            point: GeoPoint,
            account: String,
        ): ApiResult<ListCustomerAddresses200ResponseDataItemsInner> {
            val lat = point.lat.toWireCoordinate()
            val lng = point.lng.toWireCoordinate()
            val before = originalPoint
            val moved =
                !originalConfirmed || before == null || before.lat.toWireCoordinate() != lat ||
                    before.lng.toWireCoordinate() != lng
            return addresses.update(
                id,
                UpdateCustomerAddressRequest(
                    label = s.label,
                    line = s.line.trim(),
                    reference = s.reference.trim(),
                    // El sello del punto lo mueve el punto: si no cambió, no se manda y el servidor conserva el suyo.
                    coordinates = if (moved) UpdateCustomerAddressRequestCoordinates(lat, lng) else null,
                    isDefault = if (s.makeDefault) true else null,
                ),
                account,
            )
        }

        private suspend fun loadAll(account: String) {
            // Sin la zona de la configuración se usa la de respaldo (la misma que la web).
            val area = CoverageArea.from((catalog.publicConfig() as? ApiResult.Success)?.data)
            when (val result = addresses.list(account)) {
                is ApiResult.Failure -> {
                    onLoadFailure(result.error, account)
                }

                is ApiResult.Success -> {
                    val items = result.data.items.map { it.toUi() }
                    val current = editingId?.let { id -> items.firstOrNull { it.id == id } }
                    if (editingId != null && current == null) {
                        // La borraron en otro teléfono: se muestra como no encontrada.
                        onLoadFailure(AppError.Unknown(code = "not_found", detail = null), account)
                    } else {
                        applyLoaded(area, items.isEmpty(), current)
                    }
                }
            }
        }

        private fun applyLoaded(
            area: CoverageArea,
            noAddresses: Boolean,
            current: AddressUi?,
        ) {
            originalPoint = current?.point
            originalConfirmed = current?.confirmed == true
            settle {
                it.copy(
                    loading = false,
                    loadError = null,
                    area = area,
                    hideDefaultSwitch = noAddresses || current?.isDefault == true,
                    label = current?.label?.takeIf { l -> l in ADDRESS_LABELS } ?: it.label,
                    line = current?.line.orEmpty(),
                    reference = current?.reference.orEmpty(),
                    // Un punto sin confirmar no se sella como real: el mapa abre sin pin hasta que la persona lo mueva.
                    point = current?.point?.takeIf { current.confirmed },
                )
            }
        }

        private suspend fun onLoadFailure(
            error: AppError,
            account: String,
        ) {
            if (handleSession(error, account)) return
            settle { it.copy(loading = false, loadError = error) }
        }

        private suspend fun onActionFailure(
            error: AppError,
            account: String,
        ) {
            if (handleSession(error, account)) return
            settle { it.copy(saving = false, deleting = false, confirmingDelete = false, saveError = error) }
        }

        /** Una respuesta que llega después de cerrar la sesión (o de cambiar de cuenta) no deshace el cierre. */
        private fun settle(change: (AddressFormState) -> AddressFormState) {
            _state.update { if (it.outcome == FormOutcome.LoggedOut) it else change(it) }
        }

        /** No hay cuenta con la que hablar con el servidor: el formulario se cierra como si la sesión hubiera terminado. */
        private fun endSession() {
            _state.update { it.copy(saving = false, deleting = false, outcome = FormOutcome.LoggedOut) }
        }

        /**
         * Avisa de un 426 y, ante un 401 de una llamada de [account], cierra la sesión solo si sigue siendo la de esa
         * cuenta: si ya es de otra, esa no se toca. Devuelve `true` si la sesión de esta pantalla terminó.
         */
        private suspend fun handleSession(
            error: AppError,
            account: String,
        ): Boolean {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (error is AppError.Network && error.cause is AccountMismatchException) {
                // La sesión ya es de otra cuenta: no salió nada. Se cierra sin cerrar la sesión nueva.
                endSession()
                return true
            }
            if (!error.isUnauthorized()) return false
            withContext(NonCancellable) { sessionStore.signOutIf(account) }
            _state.update { it.copy(saving = false, deleting = false, outcome = FormOutcome.LoggedOut) }
            return true
        }
    }
