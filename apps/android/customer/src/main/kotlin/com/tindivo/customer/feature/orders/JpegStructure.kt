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

private const val NIBBLE_BITS = 4
private const val NIBBLE_MASK = 0x0F

/** Identificador de una tabla de cuantización o de Huffman (Tq, Th, Td, Ta): de 0 a 3 (ITU T.81, B.2–B.3). */
private const val MAX_TABLE_ID = 3

// DRI (T.81 B.2.4.4): FF DD, longitud(2) = 4 y el intervalo de reinicio(2). Nada más.
private const val DRI_SEGMENT = 6

// DQT (T.81 B.2.4.1): por tabla, Pq/Tq(1) y 64 valores de 1 byte (Pq = 0) o de 2 (Pq = 1).
private const val QUANT_VALUES = 64
private const val MAX_QUANT_PRECISION = 1

// DHT (T.81 B.2.4.2): por tabla, Tc/Th(1), 16 cuentas de códigos por largo y tantos símbolos como sumen (≤ 256).
private const val HUFFMAN_LENGTHS = 16
private const val MAX_HUFFMAN_SYMBOLS = 256
private const val MAX_HUFFMAN_CLASS = 1

// SOF: FF Cn, longitud(2), precisión(1), alto(2), ancho(2), componentes(1) y 3 bytes por componente: id, H/V y Tq.
private const val SOF_PRECISION = 4
private const val SOF_HEIGHT = 5
private const val SOF_WIDTH = 7
private const val SOF_COMPONENTS = 9
private const val SOF_FIXED = 10
private const val SOF_PER_COMPONENT = 3
private const val ADMITTED_PRECISION = 8
private const val MAX_SAMPLING = 4
private val SAMPLING_FACTORS = 1..MAX_SAMPLING

// SOS: FF DA, longitud(2), componentes(1), 2 bytes por componente (id, Td/Ta) y 3 de selección espectral (Ss, Se) y
// aproximación (Ah/Al).
private const val SOS_COMPONENTS = 4
private const val SOS_FIRST_COMPONENT = 5
private const val SOS_FIXED = 8
private const val SOS_PER_COMPONENT = 2
private const val MAX_COMPONENTS = 4
private val COMPONENT_COUNTS = 1..MAX_COMPONENTS
private const val MAX_SPECTRAL = 63
private const val MAX_APPROXIMATION = 13

// APP0 JFIF (JFIF 1.02): FF E0, longitud(2) = 16, "JFIF\0"(5), versión(2), unidades(1), densidad X e Y(2 + 2) y el
// tamaño de la miniatura(1 + 1), que tiene que ser 0×0: no se sube ninguna imagen escondida en la cabecera.
private const val JFIF_SEGMENT = 18
private val JFIF_ID = "JFIF\u0000".toByteArray(Charsets.US_ASCII)
private const val JFIF_VERSION = 9
private const val JFIF_MAJOR = 1
private const val JFIF_MAX_MINOR = 2
private const val JFIF_UNITS = 11
private const val JFIF_MAX_UNITS = 2
private const val JFIF_X_DENSITY = 12
private const val JFIF_Y_DENSITY = 14
private const val JFIF_THUMBNAIL = 16

private fun ByteArray.u8(index: Int): Int = this[index].toInt() and BYTE_MASK

private fun ByteArray.u16(index: Int): Int = (u8(index) shl BITS_PER_BYTE) or u8(index + 1)

private fun ByteArray.high(index: Int): Int = u8(index) shr NIBBLE_BITS

private fun ByteArray.low(index: Int): Int = u8(index) and NIBBLE_MASK

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
    val progressive: Boolean,
)

/**
 * Recorre un JPEG ENTERO, de SOI a EOI, y a la vez escribe su copia sin metadatos (CAX-004). Exige: un solo SOF
 * admitido ([ADMITTED_FRAMES], 8 bits, de 1 a 4 componentes distintos, alto y ancho mayores que cero) antes del primer
 * escaneo; cada SOS con su cabecera completa (longitud acorde a sus componentes, todos del SOF) seguido de datos de
 * escaneo no vacíos que terminan en un marcador; y el EOI como lo último del archivo, sin nada detrás. Entre escaneos
 * solo admite tablas (DQT, DHT, DRI), otro SOS o metadatos. Los APP1–APP15 y los comentarios se quitan donde estén,
 * también entre escaneos; el APP0 (JFIF) se conserva solo antes del primer escaneo. Cualquier otro marcador, un largo
 * que se sale del archivo o un corte en cualquier punto lanza [MalformedJpeg]. [sawMetadata] dice si quitó algo,
 * aunque luego falle.
 *
 * Todo segmento que se conserva (y por tanto se sube) se valida con su estructura propia de ITU T.81, no solo con su
 * largo genérico (CAX-004 de la ronda 2): SOF ([readFrame]), SOS ([readScan]), DQT ([readQuantization]), DHT
 * ([readHuffman]), DRI ([readRestartInterval]) y el APP0 de cabecera ([readJfif]). Lo que no cuadra es un JPEG mal
 * formado.
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

            marker == DQT -> readQuantization()

            marker == DHT -> readHuffman()

            marker == DRI -> readRestartInterval()

            marker == APP0 && scans == 0 -> readJfif()

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

    /** DRI: largo exactamente 4 (T.81 B.2.4.4); el intervalo puede ser cualquiera, también 0 (sin reinicios). */
    private fun readRestartInterval() {
        val length = segmentLength()
        ensure(length == DRI_SEGMENT)
        keep(length)
    }

    /**
     * DQT: una o más tablas, cada una con Pq de 0 o 1 (valores de 8 o 16 bits) y Tq de 0 a 3; el largo es exactamente
     * 2 + Σ(1 + 64·(Pq + 1)), sin bytes de más ni de menos (T.81 B.2.4.1).
     */
    private fun readQuantization() {
        val length = segmentLength()
        val end = index + length
        var at = index + SEGMENT_HEADER
        ensure(at < end)
        while (at < end) {
            val precision = bytes.high(at)
            ensure(precision <= MAX_QUANT_PRECISION && bytes.low(at) <= MAX_TABLE_ID)
            at += 1 + QUANT_VALUES * (precision + 1)
        }
        ensure(at == end)
        keep(length)
    }

    /**
     * DHT: una o más tablas, cada una con Tc de 0 o 1 (DC o AC), Th de 0 a 3, sus 16 cuentas y tantos símbolos como
     * sumen, como mucho 256; el largo es exactamente 2 + Σ(1 + 16 + Σcuentas) (T.81 B.2.4.2).
     */
    private fun readHuffman() {
        val length = segmentLength()
        val end = index + length
        var at = index + SEGMENT_HEADER
        ensure(at < end)
        while (at < end) {
            ensure(at + 1 + HUFFMAN_LENGTHS <= end)
            ensure(bytes.high(at) <= MAX_HUFFMAN_CLASS && bytes.low(at) <= MAX_TABLE_ID)
            val symbols = (1..HUFFMAN_LENGTHS).sumOf { bytes.u8(at + it) }
            ensure(symbols <= MAX_HUFFMAN_SYMBOLS)
            at += 1 + HUFFMAN_LENGTHS + symbols
        }
        ensure(at == end)
        keep(length)
    }

    /**
     * El APP0 de cabecera, que se sube: tiene que ser un JFIF completo y sin miniatura ([JFIF_SEGMENT]): versión 1.00 a
     * 1.02, unidades de 0 a 2 y densidades mayores que cero. Otro APP0 en la cabecera no es un formato admitido.
     */
    private fun readJfif() {
        val length = segmentLength()
        ensure(length == JFIF_SEGMENT)
        ensure(JFIF_ID.indices.all { bytes[index + SEGMENT_HEADER + it] == JFIF_ID[it] })
        ensure(bytes.u8(index + JFIF_VERSION) == JFIF_MAJOR && bytes.u8(index + JFIF_VERSION + 1) <= JFIF_MAX_MINOR)
        ensure(bytes.u8(index + JFIF_UNITS) <= JFIF_MAX_UNITS)
        ensure(bytes.u16(index + JFIF_X_DENSITY) > 0 && bytes.u16(index + JFIF_Y_DENSITY) > 0)
        ensure(bytes.u16(index + JFIF_THUMBNAIL) == 0)
        keep(length)
    }

    /**
     * SOF admitido: 8 bits, alto y ancho mayores que cero, de 1 a 4 componentes distintos y largo 8 + 3·Nf; cada
     * componente con H y V de 1 a 4 y Tq de 0 a 3 (T.81 B.2.2).
     */
    private fun readFrame() {
        val length = segmentLength()
        ensure(frame == null && length >= SOF_FIXED)
        val count = bytes.u8(index + SOF_COMPONENTS)
        ensure(count in COMPONENT_COUNTS && length == SOF_FIXED + SOF_PER_COMPONENT * count)
        ensure(bytes.u8(index + SOF_PRECISION) == ADMITTED_PRECISION)
        val size = PixelSize(width = bytes.u16(index + SOF_WIDTH), height = bytes.u16(index + SOF_HEIGHT))
        ensure(size.width > 0 && size.height > 0)
        val starts = (0 until count).map { index + SOF_FIXED + SOF_PER_COMPONENT * it }
        ensure(starts.all { bytes.high(it + 1) in SAMPLING_FACTORS && bytes.low(it + 1) in SAMPLING_FACTORS })
        ensure(starts.all { bytes.u8(it + 2) <= MAX_TABLE_ID })
        val ids = starts.map { bytes.u8(it) }.toSet()
        ensure(ids.size == count)
        frame = JpegFrame(size, ids, progressive = bytes.u8(index + 1) == SOF_PROGRESSIVE)
        keep(length)
    }

    /**
     * Ss, Se y Ah/Al del SOS que empiezan en [at], para un escaneo de [count] componentes (T.81 B.2.3 y G.1.1). En un
     * SOF secuencial (C0, C1): Ss = 0, Se = 63 y Ah = Al = 0. En el progresivo (C2): Ss ≤ Se ≤ 63 y Ah, Al ≤ 13; un
     * escaneo DC (Ss = 0) no lleva AC (Se = 0) y uno AC (Ss > 0) es de un solo componente.
     */
    private fun checkSpectralSelection(
        at: Int,
        count: Int,
    ) {
        val first = bytes.u8(at)
        val last = bytes.u8(at + 1)
        val high = bytes.high(at + 2)
        val low = bytes.low(at + 2)
        if ((frame ?: malformed()).progressive) {
            ensure(first <= last && last <= MAX_SPECTRAL && high <= MAX_APPROXIMATION && low <= MAX_APPROXIMATION)
            ensure(if (first == 0) last == 0 else count == 1)
        } else {
            ensure(first == 0 && last == MAX_SPECTRAL && high == 0 && low == 0)
        }
    }

    /**
     * SOS: de 1 a 4 componentes distintos, todos del SOF, con largo 6 + 2·Ns; cada uno con Td y Ta de 0 a 3; la
     * selección espectral según el SOF ([checkSpectralSelection]) (T.81 B.2.3). Detrás, los datos del escaneo hasta
     * el siguiente marcador.
     */
    private fun readScan() {
        val components = (frame ?: malformed()).components
        val length = segmentLength()
        ensure(length > SOS_COMPONENTS)
        val count = bytes.u8(index + SOS_COMPONENTS)
        ensure(count in COMPONENT_COUNTS && length == SOS_FIXED + SOS_PER_COMPONENT * count)
        val starts = (0 until count).map { index + SOS_FIRST_COMPONENT + SOS_PER_COMPONENT * it }
        val selected = starts.map { bytes.u8(it) }
        ensure(selected.all { it in components } && selected.toSet().size == count)
        ensure(starts.all { bytes.high(it + 1) <= MAX_TABLE_ID && bytes.low(it + 1) <= MAX_TABLE_ID })
        checkSpectralSelection(index + SOS_FIRST_COMPONENT + SOS_PER_COMPONENT * count, count)
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
