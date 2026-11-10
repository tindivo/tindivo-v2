package com.tindivo.customer.feature.profile

import com.tindivo.customer.feature.signin.GoogleIdResult
import com.tindivo.customer.session.FakeSessionStore
import com.tindivo.customer.session.SessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/** El nombre de Google como sugerencia: en memoria, atado a la cuenta que entró, y borrado al usarse o al salir. */
@OptIn(ExperimentalCoroutinesApi::class)
class GoogleNameHintTest {
    private val dispatcher = StandardTestDispatcher()
    private val store = FakeSessionStore(SessionState.SignedIn(ACCOUNT))

    private fun TestScope.hint(): GoogleNameHint {
        val hint = GoogleNameHint(store, backgroundScope)
        runCurrent()
        return hint
    }

    @Test
    fun `se entrega una sola vez a la cuenta que entro`() =
        runTest(dispatcher) {
            val hint = hint()
            hint.offer(ACCOUNT, "Rosa Quispe")

            assertEquals("Rosa Quispe", hint.take(ACCOUNT))
            assertNull(hint.take(ACCOUNT))
        }

    @Test
    fun `otra cuenta no la recibe y queda borrada`() =
        runTest(dispatcher) {
            val hint = hint()
            hint.offer(ACCOUNT, "Rosa Quispe")

            assertNull(hint.take(OTHER_ACCOUNT))
            assertNull(hint.take(ACCOUNT))
        }

    @Test
    fun `no se guarda para una cuenta que no es la de la sesion, ni en blanco`() =
        runTest(dispatcher) {
            val hint = hint()
            hint.offer(OTHER_ACCOUNT, "Rosa Quispe")
            assertNull(hint.take(OTHER_ACCOUNT))

            hint.offer(ACCOUNT, "   ")
            assertNull(hint.take(ACCOUNT))
            hint.offer(ACCOUNT, null)
            assertNull(hint.take(ACCOUNT))
        }

    @Test
    fun `cerrar la sesion la borra aunque la misma cuenta vuelva a entrar`() =
        runTest(dispatcher) {
            val hint = hint()
            hint.offer(ACCOUNT, "Rosa Quispe")

            store.signOut()
            runCurrent()
            store.switchTo(ACCOUNT)
            runCurrent()

            assertNull(hint.take(ACCOUNT))
        }

    @Test
    fun `cambiar de cuenta la borra`() =
        runTest(dispatcher) {
            val hint = hint()
            hint.offer(ACCOUNT, "Rosa Quispe")

            store.switchTo(OTHER_ACCOUNT)
            runCurrent()
            store.switchTo(ACCOUNT)
            runCurrent()

            assertNull(hint.take(ACCOUNT))
        }

    @Test
    fun `con la sesion ya en otra cuenta no se entrega aunque el colector no haya corrido`() =
        runTest(dispatcher) {
            val hint = hint()
            hint.offer(ACCOUNT, "Rosa Quispe")

            store.switchTo(OTHER_ACCOUNT)

            assertNull(hint.take(ACCOUNT))
        }

    @Test
    fun `clear la borra sin usarla`() =
        runTest(dispatcher) {
            val hint = hint()
            hint.offer(ACCOUNT, "Rosa Quispe")

            hint.clear()

            assertNull(hint.take(ACCOUNT))
        }

    @Test
    fun `el nombre no sale en ningun toString`() =
        runTest(dispatcher) {
            val hint = hint()
            hint.offer(ACCOUNT, "Rosa Quispe")

            assertFalse(hint.toString().contains("Rosa"))
            assertFalse(GoogleIdResult.Token("id-token", "Rosa Quispe").toString().contains("Rosa"))
            assertFalse(GoogleIdResult.Token("id-token", "Rosa Quispe").toString().contains("id-token"))
        }

    private companion object {
        const val ACCOUNT = "user-1"
        const val OTHER_ACCOUNT = "user-2"
    }
}
