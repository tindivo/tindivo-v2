package com.tindivo.customer.feature.orders

import java.io.ByteArrayOutputStream

private const val MARKER = 0xFF
private const val STUFFED = 0x00
private const val SOI = 0xD8
private const val EOI = 0xD9
private const val SOS = 0xDA
private const val DQT = 0xDB
private const val DRI = 0xDD
private const val DHT = 0xC4
private const val RST_FIRST = 0xD0
private const val RST_LAST = 0xD7
private const val APP0 = 0xE0
private const val APP_LAST = 0xEF
private const val COM = 0xFE
private const val BYTE_MASK = 0xFF
private const val BITS_PER_BYTE = 8
private const val SEGMENT_HEADER = 4
private const val MIN_SEGMENT_LENGTH = 2

private const val SOF_BASELINE = 0xC0
private const val SOF_EXTENDED = 0xC1
private const val SOF_PROGRESSIVE = 0xC2

/**
 * Los únicos SOF admitidos: secuencial básico (C0), secuencial extendido (C1) y progresivo (C2), con Huffman. El
 * codificador de Android escribe C0. Los demás (sin pérdida, jerárquicos, aritméticos) no se suben.
 */
private val ADMITTED_FRAMES = setOf(SOF_BASELINE, SOF_EXTENDED, SOF_PROGRESSIVE)

/** Tablas y ajustes que se conservan tal cual, antes o entre escaneos. */
private val KEPT_TABLES = setOf(DQT, DHT, DRI)

// SOF: FF Cn, longitud(2), precisión(1), alto(2), ancho(2), componentes(1) y 3 bytes por componente.
private const val SOF_PRECISION = 4
private const val SOF_HEIGHT = 5
private const val SOF_WIDTH = 7
private const val SOF_COMPONENTS = 9
private const val SOF_FIXED = 10
private const val SOF_PER_COMPONENT = 3
private const val ADMITTED_PRECISION = 8

// SOS: FF DA, longitud(2), componentes(1), 2 bytes por componente y 3 de selección espectral y aproximación.
private const val SOS_COMPONENTS = 4
private const val SOS_FIRST_COMPONENT = 5
private const val SOS_FIXED = 8
private const val SOS_PER_COMPONENT = 2
private const val MAX_COMPONENTS = 4
private val COMPONENT_COUNTS = 1..MAX_COMPONENTS

private fun ByteArray.u8(index: Int): Int = this[index].toInt() and BYTE_MASK

private fun ByteArray.u16(index: Int): Int = (u8(index) shl BITS_PER_BYTE) or u8(index + 1)

private fun ByteArray.startsAsJpeg(): Boolean = size >= SEGMENT_HEADER && u8(0) == MARKER && u8(1) == SOI

/** Un JPEG fuera de la estructura admitida: se corta el recorrido y no se sube nada. */
private class MalformedJpeg : Exception()

private fun malformed(): Nothing = throw MalformedJpeg()

private fun ensure(condition: Boolean) {
    if (!condition) malformed()
}

/** El JPEG recorrido entero: [clean] sin metadatos y el tamaño que declara su SOF. */
private class JpegParts(
    val clean: ByteArray,
    val size: PixelSize,
)

private class JpegFrame(
    val size: PixelSize,
    val components: Set<Int>,
)

/**
 * Recorre un JPEG ENTERO, de SOI a EOI, y a la vez escribe su copia sin metadatos (CAX-004). Exige: un solo SOF
 * admitido ([ADMITTED_FRAMES], 8 bits, de 1 a 4 componentes distintos, alto y ancho mayores que cero) antes del primer
 * escaneo; cada SOS con su cabecera completa (longitud acorde a sus componentes, todos del SOF) seguido de datos de
 * escaneo no vacíos que terminan en un marcador; y el EOI como lo último del archivo, sin nada detrás. Entre escaneos
 * solo admite tablas ([KEPT_TABLES]), otro SOS o metadatos. Los APP1–APP15 y los comentarios se quitan donde estén,
 * también entre escaneos; el APP0 (JFIF) se conserva solo antes del primer escaneo. Cualquier otro marcador, un largo
 * que se sale del archivo o un corte en cualquier punto lanza [MalformedJpeg]. [sawMetadata] dice si quitó algo,
 * aunque luego falle.
 */
private class JpegReader(
    private val bytes: ByteArray,
) {
    private val out = ByteArrayOutputStream(bytes.size)
    private var index = 0
    private var frame: JpegFrame? = null
    private var scans = 0

    var sawMetadata = false
        private set

    fun read(): JpegParts {
        ensure(bytes.startsAsJpeg())
        out.write(bytes, 0, 2)
        index = 2
        var marker = nextMarker()
        while (marker != EOI) {
            readSegment(marker)
            marker = nextMarker()
        }
        // El EOI cierra el archivo: nada escondido detrás, y al menos un escaneo antes.
        ensure(scans > 0 && index + 2 == bytes.size)
        out.write(bytes, index, 2)
        return JpegParts(out.toByteArray(), (frame ?: malformed()).size)
    }

    /** El marcador que empieza en [index], saltando el relleno (`FF` repetidos) que puede ir delante. */
    private fun nextMarker(): Int {
        ensure(index < bytes.size && bytes.u8(index) == MARKER)
        while (index + 1 < bytes.size && bytes.u8(index + 1) == MARKER) index++
        ensure(index + 1 < bytes.size)
        return bytes.u8(index + 1)
    }

    private fun readSegment(marker: Int) {
        when {
            marker == SOS -> readScan()

            marker in ADMITTED_FRAMES -> readFrame()

            marker in KEPT_TABLES -> keep(segmentLength())

            marker == APP0 && scans == 0 -> keep(segmentLength())

            marker in APP0..APP_LAST || marker == COM -> drop(segmentLength())

            // SOF no admitido, SOI, RST o TEM fuera de un escaneo, DNL, DAC, JPGn, DHP, EXP o reservados.
            else -> malformed()
        }
    }

    /** Lo que mide el segmento de [index] contando su marcador; si se sale del archivo, no vale. */
    private fun segmentLength(): Int {
        ensure(index + SEGMENT_HEADER <= bytes.size)
        val length = bytes.u16(index + 2)
        ensure(length >= MIN_SEGMENT_LENGTH && index + 2 + length <= bytes.size)
        return 2 + length
    }

    private fun keep(length: Int) {
        out.write(bytes, index, length)
        index += length
    }

    private fun drop(length: Int) {
        sawMetadata = true
        index += length
    }

    private fun readFrame() {
        val length = segmentLength()
        ensure(frame == null && length >= SOF_FIXED)
        val count = bytes.u8(index + SOF_COMPONENTS)
        ensure(count in COMPONENT_COUNTS && length == SOF_FIXED + SOF_PER_COMPONENT * count)
        ensure(bytes.u8(index + SOF_PRECISION) == ADMITTED_PRECISION)
        val size = PixelSize(width = bytes.u16(index + SOF_WIDTH), height = bytes.u16(index + SOF_HEIGHT))
        ensure(size.width > 0 && size.height > 0)
        val ids = (0 until count).map { bytes.u8(index + SOF_FIXED + SOF_PER_COMPONENT * it) }.toSet()
        ensure(ids.size == count)
        frame = JpegFrame(size, ids)
        keep(length)
    }

    private fun readScan() {
        val components = (frame ?: malformed()).components
        val length = segmentLength()
        ensure(length > SOS_COMPONENTS)
        val count = bytes.u8(index + SOS_COMPONENTS)
        ensure(count in COMPONENT_COUNTS && length == SOS_FIXED + SOS_PER_COMPONENT * count)
        val selected = (0 until count).map { bytes.u8(index + SOS_FIRST_COMPONENT + SOS_PER_COMPONENT * it) }
        ensure(selected.all { it in components } && selected.toSet().size == count)
        keep(length)
        val dataStart = index
        while (!endsScan(index)) index += if (bytes.u8(index) == MARKER) 2 else 1
        // Un escaneo sin datos no lo escribe ningún codificador.
        ensure(index > dataStart)
        out.write(bytes, dataStart, index - dataStart)
        scans++
    }

    /**
     * `true` si en [at] empieza el marcador que cierra los datos del escaneo. Dentro de los datos, un `FF` solo va
     * seguido de `00` (relleno de bytes) o de un RST; si se acaba el archivo antes del marcador, está cortado.
     */
    private fun endsScan(at: Int): Boolean {
        ensure(at < bytes.size)
        if (bytes.u8(at) != MARKER) return false
        ensure(at + 1 < bytes.size)
        val next = bytes.u8(at + 1)
        return next != STUFFED && next !in RST_FIRST..RST_LAST
    }
}

/** [jpeg] recorrido entero, o `null` si no es un JPEG con la estructura admitida ([JpegReader]). */
private fun readJpeg(jpeg: ByteArray): JpegParts? =
    try {
        JpegReader(jpeg).read()
    } catch (_: MalformedJpeg) {
        null
    }

/**
 * El mismo JPEG sin metadatos: quita todos los APP1–APP15 (EXIF con la ubicación GPS, XMP, ICC, miniaturas) y los
 * comentarios en cualquier punto del archivo, también entre escaneos, y deja el APP0 (JFIF) de la cabecera y todo lo
 * demás tal cual. Los datos de la imagen no se tocan. `null` si no es un JPEG completo y bien formado, de SOI a EOI,
 * en un formato admitido ([JpegReader]): quien llama no sube nada (falla cerrado).
 */
internal fun stripJpegMetadata(jpeg: ByteArray): ByteArray? = readJpeg(jpeg)?.clean

/** `true` si [jpeg] tiene algún metadato (APP1–APP15, comentario o un APP0 tras un escaneo) en cualquier punto. */
internal fun hasJpegMetadata(jpeg: ByteArray): Boolean {
    val reader = JpegReader(jpeg)
    try {
        reader.read()
    } catch (_: MalformedJpeg) {
        // Lo que se vio hasta el corte cuenta igual.
    }
    return reader.sawMetadata
}

/** Ancho y alto que declara el JPEG en su SOF, o `null` si no es un JPEG completo, bien formado y admitido. */
internal fun jpegDimensions(jpeg: ByteArray): PixelSize? = readJpeg(jpeg)?.size
