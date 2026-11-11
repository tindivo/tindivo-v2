package com.tindivo.customer.feature.courier

import com.tindivo.customer.feature.addresses.CoverageArea
import com.tindivo.customer.feature.checkout.AddressUi

/** En qué punto está «Pedir una entrega». */
internal enum class RequestPhase {
    Loading,

    /** Sin sesión: Entregas pide la cuenta al principio, no al tocar «Pedir» (como la web, `open-flow.ts`). */
    SignInRequired,

    /** La cuenta aún no tiene perfil: falta el nombre. */
    ProfileRequired,

    /** No se pudo leer el estado del servicio, el perfil o las direcciones. */
    LoadFailed,

    /** El servicio está apagado o fuera de horario: se dice y no se deja pedir. */
    Closed,

    Form,

    /** La entrega existe: la pantalla abre su seguimiento. */
    Created,

    /** Un envío anterior con la misma clave ya creó una entrega: la persona la ve en «Mis entregas». */
    AlreadyCreated,

    /** No consta si un envío anterior creó una entrega: primero se revisa «Mis entregas». */
    Review,
}

/** Una hoja abierta encima del formulario: nada saca a la persona a «Mi cuenta». */
internal sealed interface CourierSheet {
    /** Elegir dónde recogemos o entregamos: direcciones guardadas y sitios anteriores. */
    data class ChoosePoint(
        val end: CourierEnd,
    ) : CourierSheet

    /** Agregar una dirección (la hoja del checkout); al guardarla queda elegida para [end]. */
    data class AddAddress(
        val end: CourierEnd,
    ) : CourierSheet

    /** Marcar el punto en el mapa, con el pin fijo al centro, y escribir cómo llegar (web: el `pin-drop`). */
    data class PinOnMap(
        val end: CourierEnd,
    ) : CourierSheet

    data object VerifyPhone : CourierSheet

    data object CompleteProfile : CourierSheet
}

/** Lo que se le dice a la persona bajo el botón tras un intento que no creó nada. */
internal sealed interface CourierMessage {
    /** El texto que mandó el servidor (`detail`), tal cual: «Atendemos de 6 a 11 pm…», «Ya tienes una entrega…». */
    data class Server(
        val text: String,
    ) : CourierMessage

    data object Network : CourierMessage

    data object Generic : CourierMessage

    /** Otro envío de esta entrega sigue en curso. */
    data object StillProcessing : CourierMessage
}

internal data class CourierRequestUiState(
    val phase: RequestPhase = RequestPhase.Loading,
    val service: CourierServiceUi? = null,
    val draft: CourierDraft = CourierDraft(),
    val requester: CourierRequester? = null,
    val addresses: List<AddressUi> = emptyList(),
    val contacts: List<CourierContactUi> = emptyList(),
    /** La zona donde se puede marcar un punto; el servidor la vuelve a validar al crear. */
    val area: CoverageArea = CoverageArea.Fallback,
    val sheet: CourierSheet? = null,
    val sending: Boolean = false,
    val message: CourierMessage? = null,
    val created: CreatedCourier? = null,
    /** La persona ya abrió «Mis entregas» desde la revisión: puede confirmar y volver a pedir. */
    val reviewSeen: Boolean = false,
) {
    val phoneVerified: Boolean get() = requester?.phoneVerified == true

    /** Lo primero que falta, o `null` si se puede pedir. */
    val missing: CourierMissing? get() = draft.firstMissing(phoneVerified)

    /** «Soy yo» está prendido en [end]: su celular y su nombre son los de quien pide (web `SoyYo`). */
    fun isMe(end: CourierEnd): Boolean {
        val me = requester ?: return false
        val point = draft.point(end)
        val myPhone = me.phone?.let(::normalizePePhoneInput).orEmpty()
        return myPhone.isNotEmpty() && point.phone == myPhone && point.name.trim() == me.fullName.trim()
    }

    /** Sin el borrador, las direcciones ni los contactos: son datos personales y un log no los lleva. */
    override fun toString(): String = "CourierRequestUiState(phase=$phase, sheet=$sheet, sending=$sending)"
}
