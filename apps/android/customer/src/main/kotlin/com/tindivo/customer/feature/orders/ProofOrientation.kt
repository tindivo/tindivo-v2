package com.tindivo.customer.feature.orders

private const val MARKER = 0xFF
private const val SOI = 0xD8
private const val EOI = 0xD9
private const val SOS = 0xDA
private const val APP1 = 0xE1
private const val BYTE_MASK = 0xFF
private const val BITS = 8
private const val SEGMENT_HEADER = 4
private const val MIN_SEGMENT_LENGTH = 2
private const val EXIF_HEADER_LENGTH = 6
private const val TIFF_MAGIC = 42
private const val TIFF_MAGIC_OFFSET = 2
private const val TIFF_IFD_OFFSET = 4
private const val IFD_ENTRY_LENGTH = 12
private const val ORIENTATION_TAG = 0x0112
private const val SHORT_TYPE = 3
private const val ORIENTATION_NORMAL = 1
private const val ORIENTATION_MAX = 8
private const val ROTATE_90 = 90
private const val ROTATE_180 = 180
private const val ROTATE_270 = 270
private const val HEIC_HEAD_LENGTH = 12
private const val HEIC_BOX_OFFSET = 4
private const val HEIC_BRAND_OFFSET = 8
private const val FOUR_CC = 4

/** Cuántos bytes del principio del archivo bastan para encontrar el APP1 del EXIF y para reconocer un HEIC. */
internal const val PROOF_HEAD_BYTES = 64 * 1024

/** Lo que hay que hacerle a los píxeles para que la foto se vea derecha: espejar (si [mirror]) y girar [degrees]. */
internal data class ProofOrientation(
    val degrees: Int,
    val mirror: Boolean,
) {
    val isIdentity: Boolean get() = degrees == 0 && !mirror

    /** Con 90 o 270 grados el ancho y el alto se intercambian. */
    val swapsSides: Boolean get() = degrees == ROTATE_90 || degrees == ROTATE_270

    companion object {
        val NONE = ProofOrientation(0, false)
    }
}

/**
 * La transformación del valor 1–8 de la etiqueta Orientation del EXIF (CIPA DC-008). Cualquier otro valor es «tal
 * cual». El EXIF se lee ANTES de quitarlo: la foto sale derecha y sin la etiqueta (CUS-PAY-003).
 */
internal fun proofOrientationOf(exifValue: Int): ProofOrientation =
    when (exifValue) {
        2 -> ProofOrientation(0, true)
        3 -> ProofOrientation(ROTATE_180, false)
        4 -> ProofOrientation(ROTATE_180, true)
        5 -> ProofOrientation(ROTATE_270, true)
        6 -> ProofOrientation(ROTATE_90, false)
        7 -> ProofOrientation(ROTATE_90, true)
        8 -> ProofOrientation(ROTATE_270, false)
        else -> ProofOrientation.NONE
    }

/** El valor de Orientation (1 a 8) del EXIF de un JPEG, o 1 si no hay, no se lee o no es un JPEG. Nunca lanza. */
internal fun jpegExifOrientation(head: ByteArray): Int =
    try {
        readExifOrientation(head)
    } catch (_: IndexOutOfBoundsException) {
        ORIENTATION_NORMAL
    }

private fun ByteArray.u8(index: Int): Int = this[index].toInt() and BYTE_MASK

private fun readExifOrientation(head: ByteArray): Int {
    if (head.size < SEGMENT_HEADER || head.u8(0) != MARKER || head.u8(1) != SOI) return ORIENTATION_NORMAL
    var at = 2
    while (at + SEGMENT_HEADER <= head.size && head.u8(at) == MARKER) {
        val marker = head.u8(at + 1)
        if (marker == SOS || marker == EOI) return ORIENTATION_NORMAL
        val length = (head.u8(at + 2) shl BITS) or head.u8(at + 3)
        if (length < MIN_SEGMENT_LENGTH) return ORIENTATION_NORMAL
        if (marker == APP1 && isExif(head, at + SEGMENT_HEADER)) {
            return tiffOrientation(head, at + SEGMENT_HEADER + EXIF_HEADER_LENGTH)
        }
        at += MIN_SEGMENT_LENGTH + length
    }
    return ORIENTATION_NORMAL
}

private fun isExif(
    bytes: ByteArray,
    at: Int,
): Boolean =
    at + EXIF_HEADER_LENGTH <= bytes.size &&
        String(bytes, at, FOUR_CC, Charsets.ISO_8859_1) == "Exif" &&
        bytes[at + FOUR_CC] == 0.toByte() &&
        bytes[at + FOUR_CC + 1] == 0.toByte()

private fun tiffOrientation(
    bytes: ByteArray,
    tiff: Int,
): Int {
    val little =
        when (String(bytes, tiff, MIN_SEGMENT_LENGTH, Charsets.ISO_8859_1)) {
            "II" -> true
            "MM" -> false
            else -> return ORIENTATION_NORMAL
        }

    fun u16(at: Int): Int =
        if (little) bytes.u8(at) or (bytes.u8(at + 1) shl BITS) else (bytes.u8(at) shl BITS) or bytes.u8(at + 1)

    if (u16(tiff + TIFF_MAGIC_OFFSET) != TIFF_MAGIC) return ORIENTATION_NORMAL
    // Un desplazamiento de 4 bytes; en un archivo real cabe en 16 bits (el EXIF mide menos de 64 KB).
    val high = if (little) u16(tiff + TIFF_IFD_OFFSET + 2) else u16(tiff + TIFF_IFD_OFFSET)
    if (high != 0) return ORIENTATION_NORMAL
    val ifd = tiff + if (little) u16(tiff + TIFF_IFD_OFFSET) else u16(tiff + TIFF_IFD_OFFSET + 2)
    val count = u16(ifd)
    for (i in 0 until count) {
        val entry = ifd + 2 + i * IFD_ENTRY_LENGTH
        if (u16(entry) == ORIENTATION_TAG && u16(entry + 2) == SHORT_TYPE) {
            return u16(entry + 8).takeIf { it in ORIENTATION_NORMAL..ORIENTATION_MAX } ?: ORIENTATION_NORMAL
        }
    }
    return ORIENTATION_NORMAL
}

/**
 * Si los primeros bytes de un archivo son de un HEIC/HEIF (caja `ftyp` con marca `heic`, `heix`, `hevc`, `hevx`,
 * `heim`, `heis`, `mif1` o `msf1`). Se usa en Android 8, que no lo decodifica, para pedir una captura de pantalla.
 */
internal fun looksLikeHeic(head: ByteArray): Boolean {
    if (head.size < HEIC_HEAD_LENGTH) return false
    val box = String(head, HEIC_BOX_OFFSET, FOUR_CC, Charsets.ISO_8859_1)
    val brand = String(head, HEIC_BRAND_OFFSET, FOUR_CC, Charsets.ISO_8859_1)
    return box == "ftyp" && brand in HEIC_BRANDS
}

private val HEIC_BRANDS = setOf("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1")
