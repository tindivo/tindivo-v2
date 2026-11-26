package com.tindivo.customer.feature.courier

import com.tindivo.core.network.GeneratedJson
import com.tindivo.core.network.generated.model.CreateCourierOrderRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.math.BigDecimal

/** El cuerpo de `POST /customer/courier-orders` que arma la app: qué pide y qué nunca lleva. */
class CourierRequestStateTest {
    private val requester = CourierRequester(fullName = "Rosa Quispe", phone = "+51987654321", phoneVerified = true)

    private fun point(phone: String) =
        CourierPointDraft(
            lat = BigDecimal("-9.1"),
            lng = BigDecimal("-78.1"),
            reference = "Puerta azul frente al mercado",
            phone = phone,
        )

    private val complete =
        CourierDraft(
            origin = point("912000111"),
            destination = point("912345678"),
            item = "Documentos",
            prepaidConfirmed = true,
            weightConfirmed = true,
        )

    @Test
    fun `CA-ENT-01 · cada casilla manda su propio valor y con una en false no hay cuerpo`() {
        val request = complete.toRequest(requester)
        assertNotNull(request)
        assertEquals(true, request?.prepaidConfirmed)
        assertEquals(true, request?.weightConfirmed)

        assertNull(complete.copy(weightConfirmed = false).toRequest(requester))
        assertNull(complete.copy(prepaidConfirmed = false).toRequest(requester))
        assertEquals(CourierMissing.Allowed, complete.copy(weightConfirmed = false).firstMissing(true))
        assertEquals(CourierMissing.Prepaid, complete.copy(prepaidConfirmed = false).firstMissing(true))
    }

    @Test
    fun `CA-ENT-05 · el cuerpo serializado no lleva precio, tarifa ni importe`() {
        val request = requireNotNull(complete.toRequest(requester))

        val json = GeneratedJson.json.encodeToString(CreateCourierOrderRequest.serializer(), request)

        val importes = Regex(""""[A-Za-z_]*(price|fee|amount)[A-Za-z_]*"\s*:""", RegexOption.IGNORE_CASE)
        assertFalse("el cuerpo lleva un importe: $json", importes.containsMatchIn(json))
    }
}
