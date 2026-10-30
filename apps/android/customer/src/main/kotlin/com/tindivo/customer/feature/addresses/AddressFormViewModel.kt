package com.tindivo.customer.feature.addresses

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.generated.model.CreateCustomerAddressRequest
import com.tindivo.core.network.generated.model.CreateOrderRequestCoordinates
import com.tindivo.core.network.generated.model.UpdateCustomerAddressRequest
import com.tindivo.core.network.generated.model.UpdateCustomerAddressRequestCoordinates
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject

/** Cómo terminó el formulario; la pantalla vuelve atrás al verlo. */
internal enum class FormOutcome { Saved, Deleted, LoggedOut }

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
) {
    val missing: MissingField? get() = missingField(point, line, reference, area)
    val busy: Boolean get() = saving || deleting
    val canSave: Boolean get() = !loading && loadError == null && !busy && missing == null
}

/** El formulario de alta y edición. El servidor decide la predeterminada; aquí solo se le pide `isDefault: true`. */
@HiltViewModel
internal class AddressFormViewModel
    @Inject
    constructor(
        savedState: SavedStateHandle,
        private val addresses: AddressRepository,
        private val catalog: CatalogRepository,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val editingId: UUID? =
            savedState.get<String>("id")?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        private val _state = MutableStateFlow(AddressFormState(editingId = editingId))
        val state: StateFlow<AddressFormState> = _state.asStateFlow()

        private var job: Job? = null

        /** El punto con el que se abrió: solo si cambia (o no estaba confirmado) viaja al guardar. */
        private var originalPoint: GeoPoint? = null
        private var originalConfirmed = false

        init {
            viewModelScope.launch {
                sessionStore.state.collect {
                    if (it is SessionState.SignedOut) {
                        job?.cancel()
                        _state.update { s -> s.copy(outcome = FormOutcome.LoggedOut) }
                    }
                }
            }
            load()
        }

        fun load() {
            if (job?.isActive == true) return
            _state.update { it.copy(loading = true, loadError = null) }
            job = viewModelScope.launch { loadAll() }
        }

        fun onLabel(value: String) = edit { it.copy(label = value) }

        fun onLine(value: String) = edit { it.copy(line = value.take(ADDRESS_LINE_MAX)) }

        fun onReference(value: String) = edit { it.copy(reference = value.take(ADDRESS_REFERENCE_MAX)) }

        fun onMakeDefault(value: Boolean) = edit { it.copy(makeDefault = value) }

        /** El mapa dejó de moverse por un gesto de la persona: ese es el punto que eligió. */
        fun onPointChosen(point: GeoPoint) = edit { it.copy(point = point) }

        fun askDelete() = edit { if (it.editingId != null) it.copy(confirmingDelete = true) else it }

        fun cancelDelete() = edit { it.copy(confirmingDelete = false) }

        private fun edit(change: (AddressFormState) -> AddressFormState) {
            _state.update { if (it.busy) it else change(it).copy(saveError = null) }
        }

        /** Guarda. Con un guardado en curso, o con algo por completar, no hace nada: un doble toque manda una sola vez. */
        fun save() {
            val s = _state.value
            val point = s.point
            if (!s.canSave || point == null || job?.isActive == true) return
            _state.update { it.copy(saving = true, saveError = null) }
            job =
                viewModelScope.launch {
                    val result = if (editingId == null) create(s, point) else update(editingId, s, point)
                    when (result) {
                        is ApiResult.Success -> _state.update { it.copy(saving = false, outcome = FormOutcome.Saved) }
                        is ApiResult.Failure -> onActionFailure(result.error)
                    }
                }
        }

        /** Borra la dirección que se está editando, ya confirmado en la propia pantalla. */
        fun confirmDelete() {
            val id = editingId ?: return
            if (!_state.value.confirmingDelete || job?.isActive == true) return
            _state.update { it.copy(deleting = true, saveError = null) }
            job =
                viewModelScope.launch {
                    when (val result = addresses.delete(id)) {
                        is ApiResult.Success -> {
                            _state.update { it.copy(deleting = false, outcome = FormOutcome.Deleted) }
                        }

                        // Si ya no existe (la borraron en otro teléfono) el resultado es el que se quería.
                        is ApiResult.Failure -> {
                            if (result.error.isNotFound()) {
                                _state.update { it.copy(deleting = false, outcome = FormOutcome.Deleted) }
                            } else {
                                onActionFailure(result.error)
                            }
                        }
                    }
                }
        }

        private suspend fun create(
            s: AddressFormState,
            point: GeoPoint,
        ): ApiResult<*> =
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
            )

        private suspend fun update(
            id: UUID,
            s: AddressFormState,
            point: GeoPoint,
        ): ApiResult<*> {
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
            )
        }

        private suspend fun loadAll() {
            // Sin la zona de la configuración se usa la de respaldo (la misma que la web).
            val area = CoverageArea.from((catalog.publicConfig() as? ApiResult.Success)?.data)
            when (val result = addresses.list()) {
                is ApiResult.Failure -> {
                    onLoadFailure(result.error)
                }

                is ApiResult.Success -> {
                    val items = result.data.items.map { it.toUi() }
                    val current = editingId?.let { id -> items.firstOrNull { it.id == id } }
                    if (editingId != null && current == null) {
                        // La borraron en otro teléfono: se muestra como no encontrada.
                        onLoadFailure(AppError.Unknown(code = "not_found", detail = null))
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
            _state.update {
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

        private suspend fun onLoadFailure(error: AppError) {
            if (handleSession(error)) return
            _state.update { it.copy(loading = false, loadError = error) }
        }

        private suspend fun onActionFailure(error: AppError) {
            if (handleSession(error)) return
            _state.update { it.copy(saving = false, deleting = false, confirmingDelete = false, saveError = error) }
        }

        /** Avisa de un 426 y cierra la sesión ante un 401. Devuelve `true` si la sesión terminó. */
        private suspend fun handleSession(error: AppError): Boolean {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (!error.isUnauthorized()) return false
            withContext(NonCancellable) { sessionStore.signOut() }
            _state.update { it.copy(saving = false, deleting = false, outcome = FormOutcome.LoggedOut) }
            return true
        }
    }
