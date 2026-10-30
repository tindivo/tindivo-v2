package com.tindivo.customer.feature.checkout

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Las reglas del efectivo de un pedido, tal como las manda la cotización (`payment.cash`). No son la autoridad:
 * `create_customer_order` vuelve a mirar el billete máximo y el vuelto de la noche al crear el pedido. Su trabajo es
 * no contradecir al servidor, así que se leen de la cotización más reciente y nunca se inventan.
 *
 * @param maxBill billete más grande con el que se puede pagar.
 * @param maxChange vuelto que el negocio tiene esta noche; `0.00` = solo pago exacto.
 * @param step múltiplo en que se declara el billete (`0.50`). El pago exacto no tiene por qué serlo.
 */
data class CashRules(
    val maxBill: BigDecimal,
    val maxChange: BigDecimal,
    val step: BigDecimal,
)

/** Un importe de la API: texto con dos decimales (`"12.50"`, D-39) que cabe en `numeric(10,2)`. Si no, `null`. */
fun parseApiAmount(text: String): BigDecimal? = if (API_AMOUNT.matches(text)) BigDecimal(text) else null

/**
 * Las reglas de `payment.cash`, o `null` si algún importe no tiene la forma del contrato o no tiene sentido (billete o
 * múltiplo en cero). Con `null` la app no ofrece efectivo: es lo que haría el servidor con ajustes dudosos.
 */
fun cashRulesOrNull(
    maxBill: String,
    maxChange: String,
    step: String,
): CashRules? {
    val bill = parseApiAmount(maxBill)
    val change = parseApiAmount(maxChange)
    val multiple = parseApiAmount(step)
    val sane = bill != null && change != null && multiple != null && bill.signum() > 0 && multiple.signum() > 0
    return if (sane) CashRules(checkNotNull(bill), checkNotNull(change), checkNotNull(multiple)) else null
}

/**
 * Lo que la persona escribe en «Otro»: cifras con punto o coma y hasta dos decimales (`50`, `50.5`, `50,50`). Fuera de
 * eso, `null`. Nunca redondea: un monto que no es el que se escribió no se manda.
 */
fun parseCashInput(text: String): BigDecimal? {
    val normalized = text.trim().replace(',', '.')
    if (!CASH_INPUT.matches(normalized)) return null
    return BigDecimal(normalized).setScale(CENTS, RoundingMode.UNNECESSARY)
}

/** Por qué un monto vale o no. El orden de [checkCash] es la precedencia, igual que en `cash.ts` de la web. */
sealed interface CashCheck {
    data class Ok(
        val payingWith: BigDecimal,
        val change: BigDecimal,
    ) : CashCheck

    /** No hay monto, o es cero. */
    data class Missing(
        val maxDeclarable: BigDecimal,
    ) : CashCheck

    data class BelowTotal(
        val total: BigDecimal,
    ) : CashCheck

    data class AboveMaxBill(
        val maxBill: BigDecimal,
    ) : CashCheck

    /** Ni es el total exacto ni un múltiplo de [step]. */
    data class NotMultiple(
        val step: BigDecimal,
    ) : CashCheck

    /** Esta noche no hay vuelto: solo vale el total exacto. */
    data class NoChangeTonight(
        val total: BigDecimal,
    ) : CashCheck

    /** El vuelto pasa del de esta noche; [highest] es el mayor monto que sí vale. */
    data class ChangeTooHigh(
        val change: BigDecimal,
        val maxChange: BigDecimal,
        val highest: BigDecimal,
    ) : CashCheck
}

/** El billete más grande que se puede declarar hoy: el menor entre el tope y lo que alcanza el vuelto. */
fun maxDeclarable(
    total: BigDecimal,
    rules: CashRules,
): BigDecimal = rules.maxBill.min(total + rules.maxChange)

/**
 * Comprueba [paying] contra [total] (envío incluido, el de la cotización) y [rules]. El total exacto siempre se acepta
 * si cabe en el billete máximo; cualquier otro monto tiene que ser múltiplo de [CashRules.step].
 */
fun checkCash(
    paying: BigDecimal?,
    total: BigDecimal,
    rules: CashRules,
): CashCheck {
    val outcome =
        when {
            paying == null || paying.signum() <= 0 -> CashCheck.Missing(maxDeclarable(total, rules))

            paying < total -> CashCheck.BelowTotal(total)

            paying > rules.maxBill -> CashCheck.AboveMaxBill(rules.maxBill)

            paying.compareTo(
                total,
            ) != 0 && paying.remainder(rules.step).signum() != 0 -> CashCheck.NotMultiple(rules.step)

            else -> null
        }
    return outcome ?: changeCheck(checkNotNull(paying), total, rules)
}

private fun changeCheck(
    paying: BigDecimal,
    total: BigDecimal,
    rules: CashRules,
): CashCheck {
    val change = paying - total
    if (change <= rules.maxChange) return CashCheck.Ok(paying, change)
    if (rules.maxChange.signum() <= 0) return CashCheck.NoChangeTonight(total)
    return CashCheck.ChangeTooHigh(change, rules.maxChange, highestPayable(total, rules))
}

/**
 * El mayor monto válido con vuelto: el mayor múltiplo de [CashRules.step] que no deja más vuelto que el de la noche
 * ni pasa del billete máximo. Redondea HACIA ABAJO a propósito: un céntimo de más lo rechazaría el servidor. Si ningún
 * múltiplo cubre el total, el único que vale es el total exacto.
 */
fun highestPayable(
    total: BigDecimal,
    rules: CashRules,
): BigDecimal {
    val ceiling = maxDeclarable(total, rules)
    val multiple = ceiling.divide(rules.step, 0, RoundingMode.FLOOR).multiply(rules.step).setScale(CENTS)
    return if (multiple >= total) multiple else total
}

/** Un botón de monto rápido: «Exacto» o un billete. */
data class CashChip(
    val amount: BigDecimal,
    val exact: Boolean,
    val check: CashCheck,
) {
    val enabled: Boolean get() = check is CashCheck.Ok
}

/**
 * Los montos rápidos: «Exacto» y los billetes de [QUICK_BILLS] que pasan del total, cada uno con su comprobación para
 * que la UI los apague con su motivo («sin vuelto hoy») en vez de esconderlos.
 */
fun cashChips(
    total: BigDecimal,
    rules: CashRules,
): List<CashChip> {
    val exact = CashChip(total, exact = true, check = checkCash(total, total, rules))
    val bills =
        QUICK_BILLS.filter { it > total }.map {
            CashChip(
                it,
                exact = false,
                check = checkCash(it, total, rules),
            )
        }
    return listOf(exact) + bills
}

private const val CENTS = 2
private val API_AMOUNT = Regex("""\d{1,8}\.\d{2}""")

/** Hasta 9999.99: el contrato admite como mucho 1000 (`cashPayingWith`) y [checkCash] lo acota con el billete. */
private val CASH_INPUT = Regex("""\d{1,4}(\.\d{1,2})?""")
private val QUICK_BILLS = listOf("20.00", "50.00", "100.00").map(::BigDecimal)
