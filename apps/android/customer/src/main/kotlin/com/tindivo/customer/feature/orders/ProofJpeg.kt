package com.tindivo.customer.feature.orders

import java.io.ByteArrayOutputStream

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

private const val MARKER = 0xFF
private const val SOI = 0xD8
private const val EOI = 0xD9
private const val SOS = 0xDA
private const val TEM = 0x01
private const val RST_FIRST = 0xD0
private const val RST_LAST = 0xD7
private const val APP_FIRST_METADATA = 0xE1
private const val APP_LAST = 0xEF
private const val COM = 0xFE
private const val BYTE_MASK = 0xFF
private const val BITS_PER_BYTE = 8
private const val SEGMENT_HEADER = 4
private const val MIN_SEGMENT_LENGTH = 2

private const val SOF_FIRST = 0xC0
private const val SOF_LAST = 0xCF
private const val DHT = 0xC4
private const val JPG = 0xC8
private const val DAC = 0xCC

/** Los SOF que llevan dimensiones (todos los C0–CF salvo DHT C4, JPG C8 y DAC CC). */
private val FRAME_MARKERS = (SOF_FIRST..SOF_LAST).toSet() - setOf(DHT, JPG, DAC)

private fun ByteArray.u8(index: Int): Int = this[index].toInt() and BYTE_MASK

private fun ByteArray.u16(index: Int): Int = (u8(index) shl BITS_PER_BYTE) or u8(index + 1)

private fun ByteArray.startsAsJpeg(): Boolean = size >= SEGMENT_HEADER && u8(0) == MARKER && u8(1) == SOI

/**
 * Recorre los segmentos de cabecera de un JPEG hasta el inicio de los datos (SOS) y llama a [onSegment] con el marcador,
 * dónde empieza el segmento y cuánto mide entero. Devuelve dónde empieza el SOS, o `null` si no es un JPEG bien formado.
 */
private fun ByteArray.walkHeader(onSegment: (marker: Int, start: Int, length: Int) -> Unit): Int? {
    if (!startsAsJpeg()) return null
    var index = 2
    var sos: Int? = null
    while (sos == null && index + 1 < size && u8(index) == MARKER) {
        val marker = u8(index + 1)
        when {
            marker == MARKER -> {
                index++ // relleno entre segmentos
            }

            marker == TEM || marker in RST_FIRST..RST_LAST -> {
                index += 2
            }

            marker == SOS -> {
                sos = index
            }

            marker == EOI || marker == SOI || index + SEGMENT_HEADER > size -> {
                return null
            }

            else -> {
                val length = u16(index + 2)
                if (length < MIN_SEGMENT_LENGTH || index + 2 + length > size) return null
                onSegment(marker, index, 2 + length)
                index += 2 + length
            }
        }
    }
    return sos
}

/**
 * El mismo JPEG sin metadatos: quita todos los APP1–APP15 (EXIF con la ubicación GPS, XMP, ICC, miniaturas) y los
 * comentarios, y deja el APP0 (JFIF) y todo lo demás tal cual. Los datos de la imagen no se tocan. `null` si no es un
 * JPEG bien formado: quien llama no sube nada (falla cerrado).
 */
internal fun stripJpegMetadata(jpeg: ByteArray): ByteArray? {
    // Se valida antes de copiar nada: con menos de dos bytes, copiar el SOI lanzaría en vez de devolver `null`.
    if (!jpeg.startsAsJpeg()) return null
    val out = ByteArrayOutputStream(jpeg.size)
    out.write(jpeg, 0, 2)
    val sos =
        jpeg.walkHeader { marker, start, length ->
            if (marker !in APP_FIRST_METADATA..APP_LAST && marker != COM) out.write(jpeg, start, length)
        } ?: return null
    out.write(jpeg, sos, jpeg.size - sos)
    return out.toByteArray()
}

/** `true` si la cabecera de [jpeg] tiene algún segmento de metadatos (APP1–APP15 o comentario). */
internal fun hasJpegMetadata(jpeg: ByteArray): Boolean {
    var found = false
    jpeg.walkHeader { marker, _, _ -> if (marker in APP_FIRST_METADATA..APP_LAST || marker == COM) found = true }
    return found
}

/** Ancho y alto que declara el JPEG en su SOF, o `null` si no es un JPEG bien formado o no lo declara. */
internal fun jpegDimensions(jpeg: ByteArray): PixelSize? {
    var frame: PixelSize? = null
    val sos =
        jpeg.walkHeader { marker, start, length ->
            // SOF: longitud(2) precisión(1) alto(2) ancho(2)…; hacen falta al menos esos bytes dentro del segmento.
            if (frame == null && marker in FRAME_MARKERS && length >= SOF_MIN_LENGTH) {
                frame = PixelSize(width = jpeg.u16(start + SOF_WIDTH), height = jpeg.u16(start + SOF_HEIGHT))
            }
        }
    return frame?.takeIf { sos != null && it.width > 0 && it.height > 0 }
}

private const val SOF_HEIGHT = 5
private const val SOF_WIDTH = 7
private const val SOF_MIN_LENGTH = 9

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
 * El último paso antes de subir: [raw] (lo que escribió el codificador) sin metadatos, comprobado como JPEG cuyo lado
 * mayor no pasa de [MAX_PROOF_SIDE] y que cabe en [MAX_PROOF_BYTES]. Cualquier otra cosa no se sube.
 */
internal fun finishProofJpeg(raw: ByteArray): EncodedProof {
    val jpeg = stripJpegMetadata(raw) ?: return EncodedProof.Unreadable
    val size = jpegDimensions(jpeg) ?: return EncodedProof.Unreadable
    return when {
        maxOf(size.width, size.height) > MAX_PROOF_SIDE -> EncodedProof.Unreadable
        jpeg.size > MAX_PROOF_BYTES -> EncodedProof.TooLarge
        else -> EncodedProof.Ready(jpeg)
    }
}
