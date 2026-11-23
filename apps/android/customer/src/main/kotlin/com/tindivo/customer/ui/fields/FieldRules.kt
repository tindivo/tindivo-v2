package com.tindivo.customer.ui.fields

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import java.math.BigDecimal

/** Un celular de Perú tiene 9 dígitos y empieza en 9. */
internal const val PE_PHONE_DIGITS = 9
private const val PE_COUNTRY_CODE = "51"
private const val PHONE_GROUP = 3
private val PE_PHONE = Regex("""^9\d{8}$""")

/** Solo los 9 dígitos locales, sin `+51`/`51` (el campo ya pinta su `+51`). */
internal fun localPePhone(phone: String): String {
    val digits = phone.filter(Char::isDigit)
    return if (digits.length > PE_PHONE_DIGITS && digits.startsWith(PE_COUNTRY_CODE)) digits.drop(2) else digits
}

internal fun isValidPePhone(phone: String): Boolean = PE_PHONE.matches(localPePhone(phone))

/** Lo que queda en el campo «Celular» tras cada tecla o pegado: solo dígitos y nunca más de 9. */
internal fun normalizePePhoneInput(value: String): String = localPePhone(value).take(PE_PHONE_DIGITS)

/** «987654321» se ve «987 654 321»; el valor guardado nunca lleva espacios. */
internal fun formatPePhone(digits: String): String = digits.chunked(PHONE_GROUP).joinToString(" ")

/** El mapeo del cursor entre los dígitos guardados y su forma con espacios (uno cada tres). */
internal object PePhoneOffsets : OffsetMapping {
    override fun originalToTransformed(offset: Int): Int = offset + (offset - 1).coerceAtLeast(0) / PHONE_GROUP

    override fun transformedToOriginal(offset: Int): Int = offset - offset / (PHONE_GROUP + 1)
}

internal object PePhoneVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText =
        TransformedText(AnnotatedString(formatPePhone(text.text)), PePhoneOffsets)
}

private const val MONEY_DECIMALS = 2
private const val MONEY_MAX_INTEGER_DIGITS = 6

/**
 * Lo que queda en un campo de monto: cadena decimal (nunca `Double`), con punto, dos decimales como mucho y sin ceros
 * a la izquierda. La coma del teclado cuenta como punto.
 */
internal fun normalizeMoneyInput(raw: String): String {
    val cleaned = raw.replace(',', '.').filter { it.isDigit() || it == '.' }
    val dot = cleaned.indexOf('.')
    val integer = (if (dot < 0) cleaned else cleaned.substring(0, dot)).trimStart('0').take(MONEY_MAX_INTEGER_DIGITS)
    if (dot < 0) return integer
    val decimals = cleaned.substring(dot + 1).takeWhile(Char::isDigit).take(MONEY_DECIMALS)
    return "${integer.ifEmpty { "0" }}.$decimals"
}

internal fun isValidMoney(text: String): Boolean = text.toBigDecimalOrNull()?.let { it > BigDecimal.ZERO } == true

private const val COUNTER_NUMERATOR = 4
private const val COUNTER_DENOMINATOR = 5

/** El contador de caracteres solo aparece desde el 80 % del límite. */
internal fun showsCounter(
    length: Int,
    max: Int,
): Boolean = length > 0 && length * COUNTER_DENOMINATOR >= max * COUNTER_NUMERATOR

/** El error de validación sale al perder el foco o al intentar enviar; nunca mientras se escribe. */
internal fun shouldShowError(
    error: String?,
    touched: Boolean,
    submitted: Boolean,
): Boolean = error != null && (touched || submitted)
