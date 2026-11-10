package com.tindivo.customer.feature.profile

/**
 * La versión de los Términos y la Política de privacidad que la persona acepta al completar su perfil. Es la MISMA que
 * manda la web (`TERMS_VERSION` de `apps/customer/components/auth-onboarding/persistence.ts`): si la web la cambia,
 * cambia aquí. El servidor no publica la vigente en ninguna ruta, por eso va fija.
 */
internal const val TERMS_VERSION = "2026-05"

/** Largo máximo del nombre, el mismo del servidor (`UpdateCustomerProfileRequestSchema`). */
internal const val NAME_MAX = 40

private const val NAME_MIN = 2

/**
 * Los espacios que cuentan para el servidor: `\s` y `String.prototype.trim` de JavaScript, que no son los de Java
 * (`\s` de Java solo ve los ASCII). Sin esta lista, un nombre con un espacio duro pasaría aquí y no allá.
 */
private const val JS_WHITESPACE =
    "\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"

/** La regla del servidor, `^[\p{L}\s'.-]+$` con la bandera `u`: letras de cualquier idioma, espacios, `'`, `.` y `-`. */
private val NAME_PATTERN = Regex("^[\\p{L}$JS_WHITESPACE'.-]+$")
private val EDGE_SPACES = Regex("^[$JS_WHITESPACE]+|[$JS_WHITESPACE]+$")

/** Por qué un nombre no se puede guardar. */
internal enum class NameProblem {
    /** Vacío o de una sola letra. */
    TooShort,
    TooLong,

    /** Tiene algo que no es letra, espacio, `'`, `.` o `-` (dígitos, emoji…). */
    InvalidCharacters,
}

/** El nombre tal como lo guarda el servidor: sin espacios alrededor (`trim` de JavaScript). */
internal fun cleanName(raw: String): String = raw.replace(EDGE_SPACES, "")

/** La misma validación que el servidor, sobre el nombre ya recortado; `null` si se puede guardar. */
internal fun nameProblem(raw: String): NameProblem? {
    val name = cleanName(raw)
    return when {
        name.isNotEmpty() && !NAME_PATTERN.matches(name) -> NameProblem.InvalidCharacters
        name.length < NAME_MIN -> NameProblem.TooShort
        name.length > NAME_MAX -> NameProblem.TooLong
        else -> null
    }
}
