package com.tindivo.customer.feature.addresses

import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import org.junit.Assert.assertEquals
import org.junit.Test

/** El observador que ata «Usar mi ubicación» a la vista del formulario (CAX-001), con un dueño de ciclo de vida falso. */
internal class LocateForegroundObserverTest {
    private val owner =
        object : LifecycleOwner {
            override val lifecycle: Lifecycle get() = error("El observador no consulta el ciclo de vida del dueño")
        }
    private val seen = mutableListOf<Boolean>()
    private var rotating = false
    private val observer = LocateForegroundObserver({ rotating }, { seen += it })

    @Test
    fun `al dejar de verse la app sin girar avisa que salio a segundo plano`() {
        observer.onStateChanged(owner, Lifecycle.Event.ON_STOP)

        assertEquals(listOf(false), seen)
    }

    @Test
    fun `al girar la pantalla no cuenta como salir`() {
        rotating = true

        observer.onStateChanged(owner, Lifecycle.Event.ON_STOP)

        assertEquals(emptyList<Boolean>(), seen)
    }

    @Test
    fun `al volver a verse avisa que esta en primer plano`() {
        observer.onStateChanged(owner, Lifecycle.Event.ON_START)

        assertEquals(listOf(true), seen)
    }

    @Test
    fun `los demas eventos no avisan nada`() {
        listOf(Lifecycle.Event.ON_CREATE, Lifecycle.Event.ON_RESUME, Lifecycle.Event.ON_PAUSE).forEach {
            observer.onStateChanged(owner, it)
        }

        assertEquals(emptyList<Boolean>(), seen)
    }
}
