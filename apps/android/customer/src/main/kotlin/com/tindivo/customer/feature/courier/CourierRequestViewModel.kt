package com.tindivo.customer.feature.courier

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tindivo.core.network.ApiErrorCode
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.AppError
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.feature.addresses.GeoPoint
import com.tindivo.customer.feature.addresses.toWireCoordinate
import com.tindivo.customer.feature.orders.isUnauthorized
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
import javax.inject.Inject

/**
 * «Pedir una entrega» (Tindivo Entregas, D-62). La tarifa la pone el servidor; la app solo muestra el precio base del
 * estado del servicio. La entrega sale por [CourierAttempts], que decide con qué clave: un reintento nunca crea dos.
 *
 * Todo va atado a la cuenta con la que se empezó: la carga, las hojas y el envío anotan la cuenta y la generación y,
 * antes de publicar un resultado, comprueban que siguen siendo las vigentes ([isCurrent]). El envío no se cancela al
 * cambiar de cuenta: si el POST ya salió, la entrega existe y su clave se cierra en el registro de esa cuenta.
 */
@HiltViewModel
internal class CourierRequestViewModel
    @Inject
    constructor(
        private val gateway: CourierGateway,
        private val attempts: CourierAttempts,
        private val sessionStore: SessionStore,
        private val configService: ConfigService,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(CourierRequestUiState())
        val state: StateFlow<CourierRequestUiState> = mutableState.asStateFlow()

        private var accountId: String? = null

        /** Cambia con cada cierre o cambio de cuenta: lo que se empezó con otra generación no se publica. */
        @Volatile private var generation = 0
        private var loadJob: Job? = null
        private var refreshJob: Job? = null
        private var sheetOwner: String? = null
        private var sheetGeneration = -1

        init {
            viewModelScope.launch { sessionStore.state.collect(::onSession) }
        }

        private fun onSession(session: SessionState) {
            when (session) {
                SessionState.Unknown -> {
                    Unit
                }

                SessionState.SignedOut -> {
                    accountId = null
                    reset(RequestPhase.SignInRequired)
                }

                is SessionState.SignedIn -> {
                    val previous = accountId
                    if (previous == session.userId) return
                    accountId = session.userId
                    reset(RequestPhase.Loading)
                    load(session.userId)
                }
            }
        }

        /** Lo de la cuenta anterior no se queda ni se publica: borrador, perfil, direcciones y contactos son suyos. */
        private fun reset(phase: RequestPhase) {
            generation++
            loadJob?.cancel()
            refreshJob?.cancel()
            mutableState.value = CourierRequestUiState(phase = phase)
        }

        private fun isCurrent(
            started: Int,
            account: String,
        ) = started == generation && (sessionStore.state.value as? SessionState.SignedIn)?.userId == account

        /** Vuelve a cargar todo (después de un fallo, o al completar el perfil). */
        fun retry() {
            val account = accountId ?: return
            if (mutableState.value.sending) return
            mutableState.update { it.copy(phase = RequestPhase.Loading, sheet = null) }
            load(account)
        }

        private fun load(account: String) {
            val started = generation
            loadJob?.cancel()
            loadJob =
                viewModelScope.launch {
                    val outcome = gateway.loadForRequest(account)
                    if (!isCurrent(started, account)) return@launch
                    when (outcome) {
                        is CourierLoadResult.Ready -> {
                            mutableState.update { it.loaded(outcome) }
                        }

                        is CourierLoadResult.Failed -> {
                            onLoadFailed(outcome.error, started, account)
                        }

                        CourierLoadResult.ProfileMissing -> {
                            mutableState.update {
                                it.copy(
                                    phase = RequestPhase.ProfileRequired,
                                )
                            }
                        }
                    }
                }
        }

        private suspend fun onLoadFailed(
            error: AppError,
            started: Int,
            account: String,
        ) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (error.isUnauthorized()) {
                signOut(started, account)
            } else {
                mutableState.update { it.copy(phase = RequestPhase.LoadFailed) }
            }
        }

        /**
         * Pasó por el refresco y el servidor sigue sin reconocer la sesión de [account]: se cierra, si aún es la suya. La
         * comprobación y el cierre van de una vez en el almacén ([SessionStore.signOutIf]): un 401 de A no cierra la
         * sesión de B aunque B esté entrando en ese momento. El colector deja la pantalla en «inicia sesión».
         */
        private suspend fun signOut(
            started: Int,
            account: String,
        ) {
            if (isCurrent(started, account)) withContext(NonCancellable) { sessionStore.signOutIf(account) }
        }

        // --- Edición del borrador: mientras se envía, lo que sale es lo que se ve. ---

        private inline fun edit(change: CourierDraft.() -> CourierDraft) {
            mutableState.update {
                if (it.sending ||
                    it.phase != RequestPhase.Form
                ) {
                    it
                } else {
                    it.copy(draft = it.draft.change(), message = null)
                }
            }
        }

        private inline fun editPoint(
            end: CourierEnd,
            crossinline change: CourierPointDraft.() -> CourierPointDraft,
        ) = edit { withPoint(end, point(end).change()) }

        fun setItem(text: String) = edit { copy(item = text.take(COURIER_ITEM_MAX)) }

        fun setPayer(payer: CourierPayer) = edit { copy(payer = payer) }

        fun setNote(text: String) = edit { copy(note = text.take(COURIER_NOTE_MAX)) }

        fun setReadyAndPaid(checked: Boolean) = edit { copy(readyAndPaid = checked) }

        fun setPhone(
            end: CourierEnd,
            text: String,
        ) = editPoint(end) { copy(phone = normalizePePhoneInput(text)) }

        fun setName(
            end: CourierEnd,
            text: String,
        ) = editPoint(end) { copy(name = text.take(COURIER_NAME_MAX)) }

        fun setReference(
            end: CourierEnd,
            text: String,
        ) = editPoint(end) { copy(reference = text.take(COURIER_REFERENCE_MAX)) }

        /**
         * «Soy yo»: llena celular y nombre con los de quien pide; tocarlo otra vez deja los dos vacíos. Nunca se rellena
         * solo (web): quien pide puede ser quien entrega, quien recibe o ninguno de los dos.
         */
        fun toggleMe(end: CourierEnd) {
            val current = mutableState.value
            val me = current.requester ?: return
            if (current.isMe(end)) {
                editPoint(end) { copy(phone = "", name = "") }
            } else {
                editPoint(
                    end,
                ) { copy(phone = me.phone?.let(::normalizePePhoneInput).orEmpty(), name = me.fullName.trim()) }
            }
        }

        // --- Hojas ---

        fun openSheet(sheet: CourierSheet) {
            val current = mutableState.value
            val account = accountId
            val allowed = if (sheet == CourierSheet.CompleteProfile) RequestPhase.ProfileRequired else RequestPhase.Form
            if (account == null || current.sending || current.phase != allowed) return
            sheetOwner = account
            sheetGeneration = generation
            mutableState.update { it.copy(sheet = sheet) }
        }

        fun closeSheet() = mutableState.update { it.copy(sheet = null) }

        /**
         * Cierra la hoja abierta y dice si su resultado se aplica: tiene que ser la esperada y la sesión seguir siendo la
         * cuenta que la abrió. Si cambió, la hoja se cierra igual y no se aplica nada a la cuenta nueva.
         */
        private fun takeSheet(expected: (CourierSheet) -> Boolean): CourierSheet? {
            val before = mutableState.value
            val open = before.sheet ?: return null
            val owner = sheetOwner
            mutableState.update { it.copy(sheet = null) }
            val sameAccount = owner != null && isCurrent(sheetGeneration, owner)
            return open.takeIf { expected(it) && sameAccount && !before.sending }
        }

        /** Un toque en una dirección guardada de la hoja «¿Dónde…?». Sin ubicación no se elige. */
        fun pickAddress(
            end: CourierEnd,
            addressId: String,
        ) {
            if (takeSheet { it == CourierSheet.ChoosePoint(end) } == null) return
            applyAddress(end, addressId)
        }

        private fun applyAddress(
            end: CourierEnd,
            addressId: String,
        ) {
            val address = mutableState.value.addresses.firstOrNull { it.id == addressId } ?: return
            val point = address.toPoint(mutableState.value.draft.point(end)) ?: return
            edit { withPoint(end, point) }
        }

        /**
         * El punto marcado en el mapa y cómo llegar. Fuera de la zona no se elige (web: «Estás fuera de San Jacinto»); la
         * coordenada viaja con 7 decimales, como en las direcciones. Celular y nombre del extremo se conservan.
         */
        fun pickPin(
            end: CourierEnd,
            point: GeoPoint,
            reference: String,
        ) {
            val area = mutableState.value.area
            if (!area.contains(point) ||
                reference.trim().length !in COURIER_REFERENCE_MIN..COURIER_REFERENCE_MAX
            ) {
                return
            }
            if (takeSheet { it == CourierSheet.PinOnMap(end) } == null) return
            editPoint(end) {
                copy(
                    lat = point.lat.toWireCoordinate(),
                    lng = point.lng.toWireCoordinate(),
                    reference = reference.trim(),
                )
            }
        }

        /** Un toque en un sitio anterior: su lugar, su celular y su nombre. */
        fun pickContact(
            end: CourierEnd,
            index: Int,
        ) {
            if (takeSheet { it == CourierSheet.ChoosePoint(end) } == null) return
            val contact = mutableState.value.contacts.getOrNull(index) ?: return
            edit { withPoint(end, contact.toPoint()) }
        }

        /** La hoja guardó la dirección [id]: se releen las direcciones y queda elegida para el extremo que la pidió. */
        fun onAddressSaved(id: String) {
            val sheet = takeSheet { it is CourierSheet.AddAddress } as? CourierSheet.AddAddress ?: return
            refresh { account, started ->
                val fresh = (gateway.addresses(account) as? ApiResult.Success)?.data ?: return@refresh
                if (!isCurrent(started, account)) return@refresh
                mutableState.update { it.copy(addresses = fresh) }
                applyAddress(sheet.end, id)
            }
        }

        /** La hoja verificó el celular: se relee el perfil para que el botón avance. */
        fun onPhoneVerified() {
            if (takeSheet { it == CourierSheet.VerifyPhone } == null) return
            refresh { account, started ->
                val fresh = (gateway.requester(account) as? ApiResult.Success)?.data ?: return@refresh
                if (isCurrent(started, account)) mutableState.update { it.copy(requester = fresh) }
            }
        }

        /** La hoja creó el perfil: se carga el formulario. */
        fun onProfileCompleted() {
            if (takeSheet { it == CourierSheet.CompleteProfile } != null) retry()
        }

        private fun refresh(block: suspend (account: String, started: Int) -> Unit) {
            val account = accountId ?: return
            val started = generation
            refreshJob?.cancel()
            refreshJob = viewModelScope.launch { block(account, started) }
        }

        // --- Envío ---

        /** «Pedir entrega». Un segundo toque mientras se envía no hace nada (además del `Busy` del registro). */
        fun submit() {
            val current = mutableState.value
            val account = accountId
            val open = current.phase == RequestPhase.Form && !current.sending && current.service?.canRequest == true
            // El cuerpo se arma UNA vez aquí: es el que sale, aunque la persona siga tocando.
            val request = current.requester?.takeIf { open }?.let { current.draft.toRequest(it) }
            if (account == null || request == null) return
            val started = generation
            mutableState.update { it.copy(sending = true, message = null) }
            viewModelScope.launch {
                val result = attempts.send(account) { key -> gateway.create(request, key, account) }
                if (isCurrent(started, account)) onSent(result, started, account)
            }
        }

        private suspend fun onSent(
            result: CourierSendResult<CreatedCourier>,
            started: Int,
            account: String,
        ) {
            val next = mutableState.value.afterSent(result)
            if (next != null) {
                mutableState.value = next
            } else if (result is CourierSendResult.Failed) {
                onRejected(result.error, started, account)
            }
        }

        private suspend fun onRejected(
            error: AppError,
            started: Int,
            account: String,
        ) {
            if (error is AppError.UpgradeRequired) configService.reportUpgradeRequired(error.minVersion)
            if (error.isUnauthorized()) {
                signOut(started, account)
                return
            }
            val forbidden = error is AppError.Known && error.code == ApiErrorCode.Forbidden
            mutableState.update {
                it.copy(
                    sending = false,
                    message = error.toMessage(),
                    // 403 `courier_phone_not_verified`: el celular dejó de estar verificado (D-63, otro aparato).
                    requester = if (forbidden) it.requester?.copy(phoneVerified = false) else it.requester,
                )
            }
        }

        /** La persona abrió «Mis entregas» desde la revisión. */
        fun reviewOpened() = mutableState.update { it.copy(reviewSeen = true) }

        /** «Ya revisé, pedir»: olvida el intento anterior y vuelve al formulario para pedir de nuevo. */
        fun acknowledgeReview() {
            val account = accountId ?: return
            val current = mutableState.value
            if (current.phase != RequestPhase.Review || !current.reviewSeen || current.sending) return
            val started = generation
            viewModelScope.launch {
                attempts.acknowledge(account)
                if (isCurrent(started, account)) mutableState.update { it.copy(phase = RequestPhase.Form) }
            }
        }
    }
