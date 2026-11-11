package com.tindivo.customer.feature.orders

/** El lado mayor de la foto que se sube: una captura de Yape se lee de sobra y pesa poco por datos móviles. */
internal const val MAX_PROOF_SIDE = 1600

/** Calidad JPEG de la foto que se sube. */
internal const val PROOF_JPEG_QUALITY = 80

/** El tope del bucket `payment-proofs` (0254, D-40): 15 MB. La foto recodificada queda muy por debajo. */
internal const val MAX_PROOF_BYTES = 15L * 1024 * 1024

/** Ancho y alto en píxeles. */
internal data class PixelSize(
    val width: Int,
    val height: Int,
)

/**
 * El submuestreo (potencia de dos) con el que decodificar una foto de [width]×[height] sin pasar por debajo de
 * [maxSide] en el lado mayor: decodifica pocos píxeles de más y la reducción final la hace [proofTargetSize].
 */
internal fun proofSampleSize(
    width: Int,
    height: Int,
    maxSide: Int = MAX_PROOF_SIDE,
): Int {
    val longest = maxOf(width, height)
    if (width <= 0 || height <= 0 || maxSide <= 0) return 1
    var sample = 1
    while (longest / (sample * 2) >= maxSide) sample *= 2
    return sample
}

/** El tamaño final: el lado mayor no pasa de [maxSide], se conserva la proporción y nunca se agranda. */
internal fun proofTargetSize(
    width: Int,
    height: Int,
    maxSide: Int = MAX_PROOF_SIDE,
): PixelSize {
    val longest = maxOf(width, height)
    if (width <= 0 || height <= 0 || longest <= maxSide) {
        return PixelSize(width.coerceAtLeast(1), height.coerceAtLeast(1))
    }
    // Aritmética entera: sin redondeos de coma flotante que dejen un lado en maxSide + 1.
    val scaledWidth = (width.toLong() * maxSide / longest).toInt().coerceIn(1, maxSide)
    val scaledHeight = (height.toLong() * maxSide / longest).toInt().coerceIn(1, maxSide)
    return PixelSize(scaledWidth, scaledHeight)
}

/** Lo que sale de preparar la foto elegida. [Ready.jpeg] no se muestra en `toString`: es la foto de un pago. */
internal sealed interface EncodedProof {
    class Ready(
        val jpeg: ByteArray,
    ) : EncodedProof {
        override fun toString(): String = "Ready(${jpeg.size} bytes)"
    }

    /** No se pudo leer como imagen (formato que el aparato no decodifica, archivo roto o sin permiso). */
    data object Unreadable : EncodedProof

    /** Demasiado grande para decodificarla o, ya recodificada, para el tope del bucket. */
    data object TooLarge : EncodedProof
}

/**
 * El último paso antes de subir: [raw] (lo que escribió el codificador) sin metadatos, comprobado como JPEG completo
 * (de SOI a EOI, con sus escaneos) cuyo lado mayor no pasa de [MAX_PROOF_SIDE] y que cabe en [MAX_PROOF_BYTES].
 * Cualquier otra cosa no se sube.
 */
internal fun finishProofJpeg(raw: ByteArray): EncodedProof {
    val jpeg = stripJpegMetadata(raw) ?: return EncodedProof.Unreadable
    // Lo que se sube se vuelve a recorrer entero: tiene que ser un JPEG admitido y no quedarle ningún metadato.
    val size = jpegDimensions(jpeg)?.takeUnless { hasJpegMetadata(jpeg) } ?: return EncodedProof.Unreadable
    return when {
        maxOf(size.width, size.height) > MAX_PROOF_SIDE -> EncodedProof.Unreadable
        jpeg.size > MAX_PROOF_BYTES -> EncodedProof.TooLarge
        else -> EncodedProof.Ready(jpeg)
    }
}
