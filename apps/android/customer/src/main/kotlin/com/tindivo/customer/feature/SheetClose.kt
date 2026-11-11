package com.tindivo.customer.feature

/**
 * La respuesta del ViewModel de una hoja cuando la hoja pide cerrarse (CAX-005). Lo común a las hojas del checkout
 * (dirección, celular y nombre), que reusan los ViewModels de Mi cuenta.
 */
internal sealed interface SheetClose<out T : Any> {
    /** Hay un guardado, un borrado o un envío en curso: la hoja se queda (o vuelve a mostrarse) y su resultado llega. */
    data object Busy : SheetClose<Nothing>

    /**
     * La hoja se puede retirar y esa apertura queda liberada. [pending] es el éxito que terminó y que nadie había
     * entregado todavía (ya no se entregará otra vez): quien cierra lo entrega ANTES de retirar la hoja.
     */
    data class Close<out T : Any>(
        val pending: T?,
    ) : SheetClose<T>
}
