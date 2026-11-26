package com.tindivo.customer.feature.checkout

internal const val BAG_ITEM_KEY = "bag"
internal const val DELIVERY_ITEM_KEY = "delivery"
internal const val PAYMENT_ITEM_KEY = "payment"
internal const val TOTALS_ITEM_KEY = "totals"

/** Las secciones del formulario en el orden en que `CheckoutForm` las añade a la lista; cada una es un solo ítem. */
internal val CHECKOUT_ITEM_KEYS = listOf(BAG_ITEM_KEY, DELIVERY_ITEM_KEY, PAYMENT_ITEM_KEY, TOTALS_ITEM_KEY)

/** La posición de la sección con esa [key] en la lista del formulario, o null si no existe. */
internal fun checkoutItemIndex(key: String): Int? = CHECKOUT_ITEM_KEYS.indexOf(key).takeIf { it >= 0 }
