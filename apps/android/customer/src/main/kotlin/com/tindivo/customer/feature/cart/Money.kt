package com.tindivo.customer.feature.cart

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale

/** `numeric(10,2)`: dos decimales y diez cifras en total, como `menu_items.base_price` y `additional_price`. */
private const val PRICE_SCALE = 2
private val MAX_MENU_PRICE = BigDecimal("99999999.99")

/** Tope de magnitud de un importe calculado (subtotal): muy por encima de cualquier bolsa real. */
private val MAX_AMOUNT = BigDecimal("1e12")

/**
 * El precio de carta [amount] con exactamente dos decimales, o `null` si no es un precio que se pueda mostrar tal
 * cual: negativo, más de ocho cifras enteras o más de dos decimales. Nunca redondea.
 *
 * La magnitud va primero y con `compareTo`, que no cambia la escala: con un exponente extremo (`1e2147483647`)
 * `setScale` lanzaría ArithmeticException. Ya acotado, el cambio de escala es pequeño y exacto.
 */
fun menuPriceOrNull(amount: BigDecimal): BigDecimal? {
    if (amount.signum() < 0 || amount > MAX_MENU_PRICE) return null
    return exactCents(amount)
}

/**
 * Un importe calculado (un subtotal, el total de una línea) listo para mostrar: `S/ 299.97`. Solo para mostrar
 * (KT-8): nunca se usa para calcular. A diferencia de un precio de carta no tiene el tope de `numeric(10,2)`, pero
 * sigue sin redondear: `null` si es negativo, es desmesurado o tiene más de dos decimales.
 */
fun formatAmount(amount: BigDecimal): String? {
    if (amount.signum() < 0 || amount > MAX_AMOUNT) return null
    return exactCents(amount)?.let(::formatSoles)
}

/** `S/ 12.50` en soles de Perú. [exact] ya tiene dos decimales: `UNNECESSARY` no redondea nunca. */
fun formatSoles(exact: BigDecimal): String =
    NumberFormat
        .getCurrencyInstance(Locale.forLanguageTag("es-PE"))
        .apply { roundingMode = RoundingMode.UNNECESSARY }
        .format(exact)

private fun exactCents(amount: BigDecimal): BigDecimal? =
    amount
        .stripTrailingZeros()
        .takeIf { it.scale() <= PRICE_SCALE }
        ?.setScale(PRICE_SCALE, RoundingMode.UNNECESSARY)
