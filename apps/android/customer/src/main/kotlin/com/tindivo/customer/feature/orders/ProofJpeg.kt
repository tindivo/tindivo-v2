package com.tindivo.customer.feature.orders

/** El lado mayor de la foto que se sube (CUS-PAY-003): 2200 px. */
internal const val MAX_PROOF_SIDE = 2200

/**
 * El ancho mínimo (CUS-PAY-003): una captura de 1080×2400 se sube con 1080 de ancho aunque su lado mayor pase de
 * [MAX_PROOF_SIDE], para que el número de operación se lea. Es el lado MENOR: en una foto apaisada, el alto.
 */
internal const val MIN_PROOF_WIDTH = 1080

/** Calidad JPEG de la foto que se sube (CUS-PAY-003): 85. */
internal const val PROOF_JPEG_QUALITY = 85

/**
 * Si a calidad [PROOF_JPEG_QUALITY] la foto pasa de [MAX_PROOF_BYTES], se baja la calidad por estos pasos (de 10 en
 * 10) hasta que quepa. Si ni a la última cabe, es [EncodedProof.TooLarge]. El peso objetivo (150 a 500 KB) lo da la
 * calidad 85 en una captura de pantalla: no se fuerza hacia arriba ni hacia abajo.
 */
internal val PROOF_QUALITY_STEPS = listOf(PROOF_JPEG_QUALITY, 75, 65, 55, 45)

/** El tope del comprobante que sale de la app (CUS-PAY-003): 1,5 MB. El servidor admite hasta 15 MB (D-40). */
internal const val MAX_PROOF_BYTES = 1_500_000L

/** Ancho y alto en píxeles. */
internal data class PixelSize(
    val width: Int,
    val height: Int,
)

/**
 * El submuestreo (potencia de dos) con el que decodificar una foto de [width]×[height] sin pasar por debajo del
 * tamaño final de [proofTargetSize] en ningún lado: decodifica pocos píxeles de más y la reducción final la hace
 * [proofTargetSize].
 */
internal fun proofSampleSize(
    width: Int,
    height: Int,
): Int {
    if (width <= 0 || height <= 0) return 1
    val target = proofTargetSize(width, height)
    var sample = 1
    while (width / (sample * 2) >= target.width && height / (sample * 2) >= target.height) sample *= 2
    return sample
}

/**
 * El tamaño final: el lado mayor no pasa de [MAX_PROOF_SIDE], salvo que eso deje el lado menor por debajo de
 * [MIN_PROOF_WIDTH] (entonces manda el ancho mínimo). Se conserva la proporción y nunca se agranda.
 */
internal fun proofTargetSize(
    width: Int,
    height: Int,
): PixelSize {
    if (width <= 0 || height <= 0) return PixelSize(width.coerceAtLeast(1), height.coerceAtLeast(1))
    val longest = maxOf(width, height).toLong()
    val shortest = minOf(width, height).toLong()
    // La escala es max(MAX_PROOF_SIDE / longest, MIN_PROOF_WIDTH / shortest), como fracción: sin redondeos de coma
    // flotante que dejen un lado un píxel por encima o por debajo.
    val bySide = MAX_PROOF_SIDE * shortest >= MIN_PROOF_WIDTH * longest
    val num = if (bySide) MAX_PROOF_SIDE.toLong() else MIN_PROOF_WIDTH.toLong()
    val den = if (bySide) longest else shortest
    if (num >= den) return PixelSize(width, height)
    return PixelSize((width * num / den).toInt().coerceAtLeast(1), (height * num / den).toInt().coerceAtLeast(1))
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

    /** Un HEIC/HEIF en un Android sin decodificador (8): se le pide una captura de pantalla (CUS-PAY-003). */
    data object HeicUnsupported : EncodedProof

    /** Demasiado grande para decodificarla o, ya recodificada, para el tope de [MAX_PROOF_BYTES]. */
    data object TooLarge : EncodedProof
}

/**
 * El último paso antes de subir: [raw] (lo que escribió el codificador) sin metadatos, comprobado como JPEG completo
 * (de SOI a EOI, con sus escaneos) con el tamaño de [proofTargetSize] (lado mayor de hasta [MAX_PROOF_SIDE] o lado
 * menor de hasta [MIN_PROOF_WIDTH]) y que cabe en [MAX_PROOF_BYTES]. Cualquier otra cosa no se sube.
 */
internal fun finishProofJpeg(
    raw: ByteArray,
    maxBytes: Long = MAX_PROOF_BYTES,
): EncodedProof {
    val jpeg = stripJpegMetadata(raw) ?: return EncodedProof.Unreadable
    // Lo que se sube se vuelve a recorrer entero: tiene que ser un JPEG admitido y no quedarle ningún metadato.
    val size = jpegDimensions(jpeg)?.takeUnless { hasJpegMetadata(jpeg) } ?: return EncodedProof.Unreadable
    return when {
        maxOf(size.width, size.height) > MAX_PROOF_SIDE && minOf(size.width, size.height) > MIN_PROOF_WIDTH -> {
            EncodedProof.Unreadable
        }

        jpeg.size > maxBytes -> {
            EncodedProof.TooLarge
        }

        else -> {
            EncodedProof.Ready(jpeg)
        }
    }
}

/**
 * Comprime con cada calidad de [PROOF_QUALITY_STEPS] hasta que el resultado pasa [finishProofJpeg] dentro de
 * [MAX_PROOF_BYTES]. [compress] devuelve los bytes JPEG a esa calidad, o `null` si no pudo escribirlos.
 */
internal fun fitProofUnderCap(
    maxBytes: Long = MAX_PROOF_BYTES,
    compress: (quality: Int) -> ByteArray?,
): EncodedProof {
    for (quality in PROOF_QUALITY_STEPS) {
        val raw = compress(quality) ?: return EncodedProof.Unreadable
        val finished = finishProofJpeg(raw, maxBytes)
        if (finished != EncodedProof.TooLarge) return finished
    }
    return EncodedProof.TooLarge
}
