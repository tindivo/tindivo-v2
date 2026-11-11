package com.tindivo.customer.feature.orders

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * El recorrido del JPEG (CAX-004) sobre bytes armados a mano, segmento por segmento: así cada corte y cada metadato cae
 * exactamente donde dice la prueba. Estos JPEG tienen la estructura completa pero datos de escaneo de juguete (no se
 * decodifican a una imagen); los que sí se decodifican están en [ProofJpegStructureTest].
 */
class JpegStructureHandBuiltTest {
    @Test
    fun `un JPEG basico y uno progresivo bien formados se suben tal cual`() {
        for ((name, jpeg) in mapOf("básico" to baseline(), "progresivo" to progressive())) {
            assertArrayEquals(name, jpeg, stripJpegMetadata(jpeg))
            assertEquals(name, PixelSize(WIDTH, HEIGHT), jpegDimensions(jpeg))
            assertFalse(name, hasJpegMetadata(jpeg))
            assertArrayEquals(name, jpeg, (finishProofJpeg(jpeg) as EncodedProof.Ready).jpeg)
        }
    }

    @Test
    fun `un JPEG cortado tras el SOF, tras la cabecera SOS, en sus datos o sin EOI no se sube`() {
        val head = SOI + jfif() + dqt() + sof(BASELINE, 1)
        val scanHeader = head + dht() + sos(1)
        val whole = baseline()
        val named =
            mapOf(
                "dentro del SOF" to head.size - 2,
                "tras el SOF" to head.size,
                "tras el marcador SOS" to scanHeader.size - sos(1).size + 2,
                "dentro de la cabecera SOS" to scanHeader.size - 2,
                "tras la cabecera SOS, sin datos" to scanHeader.size,
                "en medio de los datos" to scanHeader.size + 1,
                "entre un FF y su 00 de relleno" to scanHeader.size + 2,
                "entre un FF y su RST" to scanHeader.size + 5,
                "sin EOI" to whole.size - 2,
                "con medio EOI" to whole.size - 1,
            )
        for ((name, cut) in named) assertRejected(name, whole.copyOf(cut))
        // Y la propiedad entera: ningún prefijo propio de un JPEG válido pasa, ni del básico ni del progresivo.
        for (jpeg in listOf(whole, progressive())) {
            for (cut in 0 until jpeg.size) assertRejected("corte en $cut", jpeg.copyOf(cut))
        }
    }

    @Test
    fun `un progresivo cortado en cualquiera de sus escaneos no se sube`() {
        val parts = progressiveParts()
        var offset = 0
        for ((index, part) in parts.withIndex()) {
            // Corte justo antes y en medio de cada parte, desde el segundo DHT (después del primer escaneo).
            if (index > PROGRESSIVE_FIRST_SCAN_END) {
                assertRejected("antes de la parte $index", parts.join().copyOf(offset))
                assertRejected("en medio de la parte $index", parts.join().copyOf(offset + part.size / 2))
            }
            offset += part.size
        }
    }

    @Test
    fun `un EXIF con GPS o un comentario tras el primer SOS de un progresivo se quitan`() {
        val clean = progressive()
        val parts = progressiveParts()
        val afterFirstScan = PROGRESSIVE_FIRST_SCAN_END + 1
        val afterSecondScan = afterFirstScan + 3
        val dirty =
            (
                parts.subList(0, afterFirstScan) + listOf(exif()) + parts.subList(afterFirstScan, afterSecondScan) +
                    listOf(comment()) + parts.subList(afterSecondScan, parts.size)
            ).join()
        assertTrue(dirty.containsAscii(GPS_MARK))
        assertTrue(hasJpegMetadata(dirty))

        assertArrayEquals(clean, stripJpegMetadata(dirty))
        val ready = finishProofJpeg(dirty) as EncodedProof.Ready
        assertArrayEquals(clean, ready.jpeg)
        assertFalse(ready.jpeg.containsAscii(GPS_MARK))
        assertFalse(ready.jpeg.containsAscii(COMMENT))
    }

    @Test
    fun `cualquier APPn o comentario detras de un escaneo se quita, tambien justo antes del EOI`() {
        val clean = baseline()
        val beforeEoi = clean.size - 2
        for (marker in (APP0..APP15) + COM) {
            val dirty = clean.copyOfRange(0, beforeEoi) + segment(marker, "$GPS_MARK -9.12".toByteArray()) + EOI
            val label = "%02X".format(marker)
            assertTrue(label, hasJpegMetadata(dirty))
            assertArrayEquals(label, clean, stripJpegMetadata(dirty))
            assertArrayEquals(label, clean, (finishProofJpeg(dirty) as EncodedProof.Ready).jpeg)
        }
    }

    @Test
    fun `el relleno FF y los RST dentro de los datos no cortan el recorrido`() {
        val clean = baseline()
        // Todos los RST, cada uno tras datos con un FF 00 de relleno.
        val restarts = (RST0..RST7).flatMap { listOf(0x5A, 0xFF, 0x00, 0xFF, it) }.toIntArray()
        val withRestarts = head() + bytes(*restarts) + bytes(0x11) + EOI
        assertArrayEquals(withRestarts, stripJpegMetadata(withRestarts))
        assertTrue(finishProofJpeg(withRestarts) is EncodedProof.Ready)

        // FF de relleno antes del marcador que cierra los datos y antes de los segmentos: se aceptan y no se suben.
        val padded = head() + SCAN_DATA + bytes(0xFF, 0xFF, 0xFF) + EOI
        assertArrayEquals(clean, stripJpegMetadata(padded))
        val paddedSegments = SOI + bytes(0xFF, 0xFF) + clean.copyOfRange(2, clean.size)
        assertArrayEquals(clean, stripJpegMetadata(paddedSegments))
    }

    @Test
    fun `un FF dentro de los datos que no es relleno, RST ni marcador valido no se sube`() {
        val invalid =
            mapOf(
                "FF FF 00" to head() + bytes(0x12, 0xFF, 0xFF, 0x00, 0x34) + EOI,
                "TEM" to head() + bytes(0x12, 0xFF, 0x01, 0x34) + EOI,
                "SOI" to head() + bytes(0x12, 0xFF, 0xD8, 0x34) + EOI,
                "EOI en medio" to head() + bytes(0x12) + EOI + bytes(0x34) + EOI,
                "escaneo vacío" to head() + EOI,
                "SOS antes del SOF" to SOI + dht() + sos(1) + SCAN_DATA + EOI,
            )
        for ((name, jpeg) in invalid) assertRejected(name, jpeg)
    }

    @Test
    fun `un DRI incompleto o con largo distinto de 4 no se sube`() {
        // El contraejemplo de la auditoría: FF DD 00 02 justo después del SOI de un JPEG válido.
        assertRejected("DRI de largo 2", afterSoi(bytes(0xFF, DRI, 0x00, 0x02)))
        assertRejected("DRI de largo 3", afterSoi(bytes(0xFF, DRI, 0x00, 0x03, 0x10)))
        assertRejected("DRI de largo 5", afterSoi(bytes(0xFF, DRI, 0x00, 0x05, 0x00, 0x10, 0x00)))
        // También entre escaneos de un progresivo.
        val parts = progressiveParts()
        val afterFirstScan = PROGRESSIVE_FIRST_SCAN_END + 1
        val incomplete = listOf(bytes(0xFF, DRI, 0x00, 0x02))
        val dirty = (parts.subList(0, afterFirstScan) + incomplete + parts.subList(afterFirstScan, parts.size)).join()
        assertRejected("DRI de largo 2 entre escaneos", dirty)
    }

    @Test
    fun `un DRI valido se conserva tal cual`() {
        val jpeg = afterSoi(bytes(0xFF, DRI, 0x00, 0x04, 0x00, 0x10))
        assertAccepted("DRI 16", jpeg)
        assertAccepted("DRI 0", afterSoi(bytes(0xFF, DRI, 0x00, 0x04, 0x00, 0x00)))
    }

    @Test
    fun `una DQT cuyo largo no cuadra con sus tablas o con Pq o Tq fuera de rango no se sube`() {
        val invalid =
            mapOf(
                "un byte de más" to segment(DQT, bytes(0x00) + ByteArray(QUANT_VALUES + 1) { 1 }),
                "un byte de menos" to segment(DQT, bytes(0x00) + ByteArray(QUANT_VALUES - 1) { 1 }),
                "16 bits con el largo de 8" to segment(DQT, bytes(0x10) + ByteArray(QUANT_VALUES) { 1 }),
                "Pq = 2" to segment(DQT, bytes(0x20) + ByteArray(QUANT_VALUES * 3) { 1 }),
                "Tq = 4" to segment(DQT, bytes(0x04) + ByteArray(QUANT_VALUES) { 1 }),
                "vacía" to segment(DQT, ByteArray(0)),
                "segunda tabla cortada" to segment(DQT, dqtTable(0) + bytes(0x01) + ByteArray(10) { 1 }),
            )
        for ((name, table) in invalid) assertRejected(name, afterSoi(table))
        // Controles: una tabla de 16 bits y dos tablas en un mismo segmento sí cuadran.
        assertAccepted("16 bits", afterSoi(segment(DQT, bytes(0x11) + ByteArray(QUANT_VALUES * 2) { 1 })))
        assertAccepted("dos tablas", afterSoi(segment(DQT, dqtTable(1) + dqtTable(2))))
    }

    @Test
    fun `una DHT cuyas cuentas no cuadran o con Tc o Th fuera de rango no se sube`() {
        val lengths = ByteArray(HUFFMAN_LENGTHS - 1)
        val invalid =
            mapOf(
                "cuentas que suman más que los símbolos" to
                    segment(DHT, bytes(0x00, 0, 2) + ByteArray(HUFFMAN_LENGTHS - 2) + bytes(0x00)),
                "un símbolo de más" to segment(DHT, bytes(0x00, 1) + lengths + bytes(0x00, 0x01)),
                "Tc = 2" to segment(DHT, bytes(0x20, 1) + lengths + bytes(0x00)),
                "Th = 4" to segment(DHT, bytes(0x04, 1) + lengths + bytes(0x00)),
                "más de 256 símbolos" to
                    segment(DHT, bytes(0x00) + ByteArray(HUFFMAN_LENGTHS) { 17 } + ByteArray(17 * HUFFMAN_LENGTHS)),
                "cortada en sus cuentas" to segment(DHT, bytes(0x00, 1, 0, 0)),
                "vacía" to segment(DHT, ByteArray(0)),
            )
        for ((name, table) in invalid) assertRejected(name, afterSoi(table))
        // Control: DC y AC en un mismo segmento.
        assertAccepted("DC y AC", afterSoi(segment(DHT, dhtTable(0x00) + dhtTable(0x13))))
    }

    @Test
    fun `una DHT que no cabe en un codigo de Huffman o con simbolos que no existen no se sube`() {
        val lengths = ByteArray(HUFFMAN_LENGTHS - 1)
        val invalid =
            mapOf(
                // El control de 256 símbolos de la R3 (CAX-004): 16 códigos de un bit, y solo existen 0 y 1.
                "16 códigos de 1 bit" to
                    segment(
                        DHT,
                        bytes(0x10) + ByteArray(HUFFMAN_LENGTHS) { 16 } + ByteArray(MAX_SYMBOLS) { it.toByte() },
                    ),
                "dos códigos de 1 bit (gasta el de todo unos)" to segment(DHT, bytes(0x00, 2) + lengths + bytes(0, 1)),
                "cinco códigos de 2 bits" to
                    segment(DHT, bytes(0x00, 0, 5) + ByteArray(HUFFMAN_LENGTHS - 2) + bytes(0, 1, 2, 3, 4)),
                "DC con categoría 12" to segment(DHT, bytes(0x00, 1) + lengths + bytes(12)),
                "AC con tamaño 11" to segment(DHT, bytes(0x10, 1) + lengths + bytes(0x0B)),
            )
        for ((name, table) in invalid) assertRejected(name, afterSoi(table))
        // Controles: las tablas de luminancia del anexo K de T.81 (las de los codificadores) y tres códigos de 2 bits.
        assertAccepted(
            "DC del anexo K",
            afterSoi(
                segment(
                    DHT,
                    bytes(0x00) + ANNEX_K_DC_COUNTS + ByteArray(12) { it.toByte() },
                ),
            ),
        )
        val acSymbols = bytes(0x00, 0xF0) + ByteArray(16 * 10) { (((it / 10) shl 4) or (it % 10 + 1)).toByte() }
        assertAccepted(
            "AC del anexo K, 162 símbolos",
            afterSoi(segment(DHT, bytes(0x10) + ANNEX_K_AC_COUNTS + acSymbols)),
        )
        assertAccepted(
            "tres códigos de 2 bits",
            afterSoi(
                segment(
                    DHT,
                    bytes(0x00, 0, 3) + ByteArray(14) + bytes(0, 1, 2),
                ),
            ),
        )
    }

    @Test
    fun `un SOF con muestreo, tabla o componentes incoherentes no se sube`() {
        val invalid =
            mapOf(
                "H = 0" to frame(1, listOf(1, 0x01, 0)),
                "V = 0" to frame(1, listOf(1, 0x10, 0)),
                "H = 5" to frame(1, listOf(1, 0x51, 0)),
                "V = 5" to frame(1, listOf(1, 0x15, 0)),
                "Tq = 4" to frame(1, listOf(1, 0x11, 4)),
                "Nf = 2 con un solo componente" to frame(2, listOf(1, 0x11, 0)),
                "Nf = 1 con dos componentes" to frame(1, listOf(1, 0x11, 0, 2, 0x11, 0)),
                "Nf = 0" to frame(0, emptyList()),
            )
        for ((name, sof) in invalid) assertRejected(name, withFrame(sof))
        // Control: muestreo 2×2 en el primero y 1×1 en los demás, con tablas 0 y 1.
        val yuv = frame(3, listOf(1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1))
        assertAccepted("4:2:0", SOI + jfif() + dqt() + yuv + dht() + sos(1, 2, 3) + SCAN_DATA + EOI)
    }

    @Test
    fun `un SOS con componentes, tablas o seleccion espectral incoherentes no se sube`() {
        val invalid =
            mapOf(
                "Td = 4" to scan(1, listOf(1, 0x40), FULL_SPECTRUM),
                "Ta = 4" to scan(1, listOf(1, 0x04), FULL_SPECTRUM),
                "Ns = 0" to scan(0, emptyList(), FULL_SPECTRUM),
                "Ns = 2 con un solo componente" to scan(2, listOf(1, 0x00), FULL_SPECTRUM),
                "Ns = 1 con dos componentes" to scan(1, listOf(1, 0x00, 1, 0x00), FULL_SPECTRUM),
                "componente que el SOF no tiene" to scan(1, listOf(9, 0x00), FULL_SPECTRUM),
                "básico con Ss = 1" to scan(1, listOf(1, 0x00), listOf(1, 63, 0)),
                "básico con Se = 62" to scan(1, listOf(1, 0x00), listOf(0, 62, 0)),
                "básico con Al = 1" to scan(1, listOf(1, 0x00), listOf(0, 63, 0x01)),
            )
        for ((name, header) in invalid) assertRejected(name, withScan(header))
        val progressiveInvalid =
            mapOf(
                "Se = 64" to scan(1, listOf(1, 0x00), listOf(1, 64, 0)),
                "Ss mayor que Se" to scan(1, listOf(1, 0x00), listOf(5, 4, 0)),
                "DC con AC (Ss = 0, Se = 63)" to scan(1, listOf(1, 0x00), FULL_SPECTRUM),
                "AC de dos componentes" to scan(2, listOf(1, 0x00, 2, 0x00), AC_SCAN),
                "Ah = 14" to scan(1, listOf(1, 0x00), listOf(1, 63, 0xE0)),
                "Al = 14" to scan(1, listOf(1, 0x00), listOf(1, 63, 0x0E)),
            )
        for ((name, header) in progressiveInvalid) assertRejected("progresivo, $name", withProgressiveScan(header))
        // Controles: un básico con las tablas 1 y un AC progresivo de aproximación sucesiva (Ah = 1, Al = 0).
        assertAccepted("básico, tablas 1", withScan(scan(1, listOf(1, 0x11), FULL_SPECTRUM)))
        assertAccepted("progresivo AC", withProgressiveScan(scan(1, listOf(1, 0x11), listOf(1, 63, 0x10))))
    }

    @Test
    fun `un APP0 de cabecera que no es un JFIF completo y sin miniatura no se sube`() {
        val invalid =
            mapOf(
                "otro identificador" to app0("JFXX", 1, 1, 0, 1, 1, 0, 0),
                "versión 2" to app0("JFIF", 2, 1, 0, 1, 1, 0, 0),
                "versión 1.03" to app0("JFIF", 1, 3, 0, 1, 1, 0, 0),
                "unidades 3" to app0("JFIF", 1, 1, 3, 1, 1, 0, 0),
                "densidad X cero" to app0("JFIF", 1, 1, 0, 0, 1, 0, 0),
                "densidad Y cero" to app0("JFIF", 1, 1, 0, 1, 0, 0, 0),
                "miniatura 1×1" to app0("JFIF", 1, 1, 0, 1, 1, 1, 1, bytes(0x10, 0x20, 0x30)),
                "un byte de más" to app0("JFIF", 1, 1, 0, 1, 1, 0, 0, bytes(0x00)),
                "cortado" to segment(APP0, "JFIF\u0000".toByteArray() + bytes(0x01, 0x01, 0x00)),
            )
        for ((name, header) in invalid) {
            assertRejected(name, SOI + header + dqt() + sof(BASELINE, 1) + dht() + sos(1) + SCAN_DATA + EOI)
        }
        // Control: JFIF 1.02 en puntos por pulgada (72×72).
        val dpi = app0("JFIF", 1, 2, 1, 72, 72, 0, 0)
        assertAccepted("JFIF 1.02", SOI + dpi + dqt() + sof(BASELINE, 1) + dht() + sos(1) + SCAN_DATA + EOI)
    }

    @Test(timeout = LINEAR_TIMEOUT_MS)
    fun `el recorrido de datos grandes es lineal`() {
        // 8 MB de datos con relleno y RST: un recorrido cuadrático no terminaría a tiempo.
        val pattern = bytes(0x12, 0xFF, 0x00, 0xFF, 0xD3, 0x34, 0x56, 0x78)
        val data = ByteArray(BIG_DATA) { pattern[it % pattern.size] }
        val jpeg = head() + data + EOI

        assertArrayEquals(jpeg, (finishProofJpeg(jpeg) as EncodedProof.Ready).jpeg)
    }

    private fun assertRejected(
        name: String,
        jpeg: ByteArray,
    ) {
        assertNull(name, stripJpegMetadata(jpeg))
        assertNull(name, jpegDimensions(jpeg))
        assertEquals(name, EncodedProof.Unreadable, finishProofJpeg(jpeg))
    }

    /** [jpeg] pasa entero, sin metadatos que quitar: se sube exactamente tal cual. */
    private fun assertAccepted(
        name: String,
        jpeg: ByteArray,
    ) {
        assertArrayEquals(name, jpeg, stripJpegMetadata(jpeg))
        assertEquals(name, PixelSize(WIDTH, HEIGHT), jpegDimensions(jpeg))
        assertArrayEquals(name, jpeg, (finishProofJpeg(jpeg) as? EncodedProof.Ready)?.jpeg)
    }

    /** El JPEG básico con [segments] metidos justo después del SOI. */
    private fun afterSoi(vararg segments: ByteArray): ByteArray {
        val whole = baseline()
        return SOI + segments.toList().join() + whole.copyOfRange(2, whole.size)
    }

    /** Una tabla de cuantización de 8 bits con el id [id]. */
    private fun dqtTable(id: Int): ByteArray = bytes(id) + ByteArray(QUANT_VALUES) { 1 }

    /** Una tabla Huffman [classAndId] (Tc/Th) con un solo código de 1 bit. */
    private fun dhtTable(classAndId: Int): ByteArray =
        bytes(classAndId, 1) + ByteArray(HUFFMAN_LENGTHS - 1) + bytes(0x00)

    /** Un SOF básico de 8 bits que declara [declared] componentes y lleva los bytes [components] (id, H/V, Tq…). */
    private fun frame(
        declared: Int,
        components: List<Int>,
    ): ByteArray {
        val header = bytes(8, HEIGHT shr 8, HEIGHT and 0xFF, WIDTH shr 8, WIDTH and 0xFF, declared)
        return segment(BASELINE, header + components.toByteArrayOfInts())
    }

    private fun withFrame(sof: ByteArray): ByteArray = SOI + jfif() + dqt() + sof + dht() + sos(1) + SCAN_DATA + EOI

    /** Una cabecera SOS que declara [declared] componentes, con los bytes [components] (id, Td/Ta…) y [spectral]. */
    private fun scan(
        declared: Int,
        components: List<Int>,
        spectral: List<Int>,
    ): ByteArray = segment(SOS, bytes(declared) + components.toByteArrayOfInts() + spectral.toByteArrayOfInts())

    private fun withScan(header: ByteArray): ByteArray =
        SOI + jfif() + dqt() + sof(BASELINE, 1) + dht() + header + SCAN_DATA + EOI

    /** Un progresivo de 3 componentes: su escaneo DC y luego [header] con sus datos. */
    private fun withProgressiveScan(header: ByteArray): ByteArray =
        SOI + jfif() + dqt() + sof(PROGRESSIVE, 3) + dht() + sos(1, 2, 3, spectral = DC_SCAN) + SCAN_DATA + header +
            SCAN_DATA + EOI

    /** Un APP0 con [id] de 4 letras y su `\0`, versión, unidades, densidades, miniatura y [extra] detrás. */
    @Suppress("LongParameterList")
    private fun app0(
        id: String,
        major: Int,
        minor: Int,
        units: Int,
        xDensity: Int,
        yDensity: Int,
        thumbWidth: Int,
        thumbHeight: Int,
        extra: ByteArray = ByteArray(0),
    ): ByteArray {
        val fields = bytes(major, minor, units, 0, xDensity, 0, yDensity, thumbWidth, thumbHeight)
        return segment(APP0, "$id\u0000".toByteArray() + fields + extra)
    }

    /** SOI, JFIF, tablas, SOF básico de un componente y la cabecera de su único escaneo. */
    private fun head(): ByteArray = SOI + jfif() + dqt() + sof(BASELINE, 1) + dht() + sos(1)

    private fun baseline(): ByteArray = head() + SCAN_DATA + EOI

    /** El progresivo por partes: cabecera, un escaneo DC de los tres componentes y tres escaneos AC de uno. */
    private fun progressiveParts(): List<ByteArray> =
        listOf(SOI, jfif(), dqt(), sof(PROGRESSIVE, 3), dht(), sos(1, 2, 3, spectral = DC_SCAN), SCAN_DATA) +
            listOf(dht(), sos(1, spectral = AC_SCAN), SCAN_DATA, sos(2, spectral = AC_SCAN), SCAN_DATA) +
            listOf(sos(3, spectral = AC_SCAN), SCAN_DATA, EOI)

    private fun progressive(): ByteArray = progressiveParts().join()

    private fun List<ByteArray>.join(): ByteArray = fold(ByteArray(0)) { acc, part -> acc + part }

    private fun jfif(): ByteArray =
        segment(APP0, "JFIF\u0000".toByteArray() + bytes(0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00))

    private fun dqt(): ByteArray = segment(DQT, ByteArray(DQT_PAYLOAD) { if (it == 0) 0 else 1 })

    /** SOF de 8 bits y [components] componentes (1, 2, 3…), con muestreo 1×1 y la tabla 0. */
    private fun sof(
        marker: Int,
        components: Int,
    ): ByteArray {
        val header = bytes(8, HEIGHT shr 8, HEIGHT and 0xFF, WIDTH shr 8, WIDTH and 0xFF, components)
        return segment(marker, header + (1..components).flatMap { listOf(it, 0x11, 0) }.toByteArrayOfInts())
    }

    /** Una tabla Huffman DC 0 con un solo código de 1 bit. */
    private fun dht(): ByteArray = segment(DHT, bytes(0x00, 1) + ByteArray(HUFFMAN_LENGTHS - 1) + bytes(0x00))

    /** Cabecera SOS de [components] con las tablas 0 y la selección [spectral] (Ss, Se, Ah/Al). */
    private fun sos(
        vararg components: Int,
        spectral: List<Int> = FULL_SPECTRUM,
    ): ByteArray {
        val selectors = components.flatMap { listOf(it, 0x00) }.toByteArrayOfInts()
        return segment(SOS, bytes(components.size) + selectors + spectral.toByteArrayOfInts())
    }

    private fun exif(): ByteArray =
        segment(0xE1, "Exif\u0000\u0000MM\u0000*$GPS_MARK -9.1234567 -78.5432100".toByteArray(Charsets.ISO_8859_1))

    private fun comment(): ByteArray = segment(COM, COMMENT.toByteArray())

    private fun segment(
        marker: Int,
        payload: ByteArray,
    ): ByteArray {
        val length = payload.size + 2
        return bytes(0xFF, marker, length shr 8, length and 0xFF) + payload
    }

    private fun List<Int>.toByteArrayOfInts(): ByteArray = ByteArray(size) { this[it].toByte() }

    private fun ByteArray.containsAscii(text: String): Boolean = String(this, Charsets.ISO_8859_1).contains(text)

    private companion object {
        const val WIDTH = 16
        const val HEIGHT = 8
        const val BASELINE = 0xC0
        const val PROGRESSIVE = 0xC2
        const val DHT = 0xC4
        const val DQT = 0xDB
        const val DRI = 0xDD
        const val SOS = 0xDA
        const val QUANT_VALUES = 64
        const val MAX_SYMBOLS = 256
        val FULL_SPECTRUM = listOf(0x00, 0x3F, 0x00)

        /** Progresivo: primer escaneo DC (Ss = Se = 0, Al = 1) y escaneo AC (Ss = 1, Se = 63). */
        val DC_SCAN = listOf(0x00, 0x00, 0x01)
        val AC_SCAN = listOf(0x01, 0x3F, 0x00)
        const val APP0 = 0xE0
        const val APP15 = 0xEF
        const val COM = 0xFE
        const val RST0 = 0xD0
        const val RST7 = 0xD7
        const val DQT_PAYLOAD = 65
        const val HUFFMAN_LENGTHS = 16
        const val GPS_MARK = "GPSLatitude"
        const val COMMENT = "tomada en San Jacinto"

        /** Índice, en [progressiveParts], de los datos del primer escaneo. */
        const val PROGRESSIVE_FIRST_SCAN_END = 6
        const val BIG_DATA = 8 * 1024 * 1024
        const val LINEAR_TIMEOUT_MS = 10_000L

        fun bytes(vararg values: Int): ByteArray = ByteArray(values.size) { values[it].toByte() }

        /** Cuentas por largo de las tablas de luminancia de T.81 anexo K (K.3): DC con 12 símbolos y AC con 162. */
        val ANNEX_K_DC_COUNTS = bytes(0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0)
        val ANNEX_K_AC_COUNTS = bytes(0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7D)

        val SOI = bytes(0xFF, 0xD8)
        val EOI = bytes(0xFF, 0xD9)

        /** Datos de juguete con un FF 00 de relleno y un RST en medio. */
        val SCAN_DATA = bytes(0x12, 0xFF, 0x00, 0x34, 0xFF, 0xD0, 0x56, 0x78)
    }
}
