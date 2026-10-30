package com.tindivo.customer.feature.addresses

import java.math.BigDecimal
import java.math.RoundingMode

/** Límites de `packages/contracts/src/primitives.ts` (fuente única de la web y del servidor). */
internal const val ADDRESS_LINE_MIN = 5
internal const val ADDRESS_LINE_MAX = 200
internal const val ADDRESS_REFERENCE_MIN = 5
internal const val ADDRESS_REFERENCE_MAX = 140

private const val MIN_PATTERN_LENGTH = 4

/** La base guarda `numeric(10,7)`: más decimales no caben. */
private const val COORDINATE_SCALE = 7

/** Las tres etiquetas del contrato (`AddressLabelSchema`), tal como viajan. */
internal val ADDRESS_LABELS = listOf("Casa", "Trabajo", "Otro")

private val repeatedChar = Regex("(.)\1{3,}", RegexOption.IGNORE_CASE)
private val repeatedPattern = Regex("^(.{2,})\1+$")

/** Texto basura que el servidor rechaza (`isGarbageText`): solo dígitos, 4 letras iguales seguidas o un patrón repetido. */
internal fun isGarbageText(value: String): Boolean {
    val cleaned = value.trim().lowercase()
    if (cleaned.isNotEmpty() && cleaned.all { it.isDigit() }) return true
    if (repeatedChar.containsMatchIn(cleaned)) return true
    val compact = cleaned.filterNot { it.isWhitespace() }
    return compact.length >= MIN_PATTERN_LENGTH && repeatedPattern.matches(compact)
}

internal fun isLineOk(line: String): Boolean {
    val cleaned = line.trim()
    return cleaned.length in ADDRESS_LINE_MIN..ADDRESS_LINE_MAX && !isGarbageText(cleaned)
}

internal fun isReferenceOk(reference: String): Boolean {
    val cleaned = reference.trim()
    return cleaned.length in ADDRESS_REFERENCE_MIN..ADDRESS_REFERENCE_MAX && !isGarbageText(cleaned)
}

/** Lo primero que falta para poder guardar, en el orden de la reparación (la ubicación primero), como la web. */
internal enum class MissingField { Location, OutsideZone, Line, Reference }

internal fun missingField(
    point: GeoPoint?,
    line: String,
    reference: String,
    area: CoverageArea,
): MissingField? =
    when {
        point == null -> MissingField.Location
        !area.contains(point) -> MissingField.OutsideZone
        !isLineOk(line) -> MissingField.Line
        !isReferenceOk(reference) -> MissingField.Reference
        else -> null
    }

/** Una coordenada para el cuerpo del PATCH/POST: como mucho 7 decimales, como `numeric(10,7)`. */
internal fun Double.toWireCoordinate(): BigDecimal =
    BigDecimal.valueOf(this).setScale(COORDINATE_SCALE, RoundingMode.HALF_UP)
