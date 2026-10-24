package com.tindivo.customer.config

private val VERSION_PATTERN = Regex("""(\d{1,9})(?:\.(\d{1,9}))?(?:\.(\d{1,9}))?""")

/**
 * Versión `mayor.menor.parche`, con la misma gramática que `parseVersion` de `packages/contracts/src/client-compat.ts`
 * (CLI-4): `1`, `1.2` o `1.2.3`, cada parte de 1 a 9 dígitos; el sufijo desde el primer `-` o `+` se ignora.
 */
data class AppVersion(
    val major: Int,
    val minor: Int,
    val patch: Int,
) : Comparable<AppVersion> {
    override fun compareTo(other: AppVersion): Int =
        compareValuesBy(this, other, AppVersion::major, AppVersion::minor, AppVersion::patch)

    companion object {
        /** `null` si el texto no cumple la gramática: una versión ilegible nunca bloquea a nadie. */
        fun parse(raw: String): AppVersion? {
            val trimmed = raw.trim()
            val end = trimmed.indexOfFirst { it == '-' || it == '+' }
            val core = if (end < 0) trimmed else trimmed.substring(0, end)
            val parts = VERSION_PATTERN.matchEntire(core)?.groupValues ?: return null
            return AppVersion(
                major = parts[1].toInt(),
                minor = parts[2].ifEmpty { "0" }.toInt(),
                patch = parts[3].ifEmpty { "0" }.toInt(),
            )
        }
    }
}
