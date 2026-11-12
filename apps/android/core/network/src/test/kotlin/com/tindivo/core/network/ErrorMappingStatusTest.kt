package com.tindivo.core.network

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * CAX-003 de la R2 de Entregas: una respuesta de error cuyo cuerpo no es un `ProblemDetails` (un proxy que devuelve
 * HTML, o un cuerpo vacío) llega como [AppError.Unknown], pero conserva su estado HTTP. Sin él, un 409 ilegible al
 * cancelar no se distinguía de cualquier otro fallo y se podía volver a enviar la cancelación.
 */
class ErrorMappingStatusTest {
    @Test
    fun `un 409 con HTML conserva el estado`() {
        assertEquals(
            AppError.Unknown(code = null, detail = "HTTP 409", status = 409),
            toAppError(409, emptyMap(), "<html><body>Conflict</body></html>"),
        )
    }

    @Test
    fun `un 409 sin cuerpo o con el cuerpo vacio conserva el estado`() {
        assertEquals(409, (toAppError(409, emptyMap(), null) as AppError.Unknown).status)
        assertEquals(409, (toAppError(409, emptyMap(), "") as AppError.Unknown).status)
    }

    @Test
    fun `un code desconocido conserva el estado junto a su code y su detail`() {
        val body = """{"type":"about:blank","title":"x","status":409,"code":"codigo_nuevo","detail":"algo pasó"}"""

        assertEquals(
            AppError.Unknown(code = "codigo_nuevo", detail = "algo pasó", status = 409),
            toAppError(409, emptyMap(), body),
        )
    }

    @Test
    fun `un 500 ilegible lleva su propio estado`() {
        assertEquals(500, (toAppError(500, emptyMap(), "<html>") as AppError.Unknown).status)
    }
}
