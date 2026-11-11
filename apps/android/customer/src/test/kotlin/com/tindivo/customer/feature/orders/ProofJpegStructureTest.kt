package com.tindivo.customer.feature.orders

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam

/**
 * La comprobación final recorre el JPEG ENTERO antes de subirlo (CAX-004): cabecera de cada escaneo, datos y EOI, y
 * quita los metadatos también entre escaneos. Los JPEG de prueba son reales (los escribe `javax.imageio` del JDK,
 * básicos y progresivos); los defectos se les hacen a mano: cortes, bytes detrás del EOI y marcadores no admitidos.
 */
class ProofJpegStructureTest {
    @Test
    fun `un JPEG cortado en cualquier punto del SOS, de sus datos o del EOI no se sube`() {
        val whole = jpeg(200, 100)
        val sos = markers(whole, SOS).first()
        // Desde justo después de los dos bytes del marcador SOS (el contraejemplo de la auditoría) hasta quitar el
        // último byte del EOI: ningún corte pasa.
        for (cut in sos + 2 until whole.size) {
            val truncated = whole.copyOf(cut)
            assertNull("corte en $cut", stripJpegMetadata(truncated))
            assertNull("corte en $cut", jpegDimensions(truncated))
            assertEquals("corte en $cut", EncodedProof.Unreadable, finishProofJpeg(truncated))
        }
    }

    @Test
    fun `un JPEG progresivo cortado en sus escaneos o sin EOI no se sube`() {
        val whole = progressiveJpeg(320, 240)
        val scans = markers(whole, SOS)
        assertTrue("el JPEG progresivo de prueba debe tener varios escaneos", scans.size > 1)
        val cuts = scans.flatMap { listOf(it + 2, it + 5, it + 20) } + listOf(whole.size - 2, whole.size - 1)
        for (cut in cuts) {
            assertEquals("corte en $cut", EncodedProof.Unreadable, finishProofJpeg(whole.copyOf(cut)))
        }
    }

    @Test
    fun `lo que va detras del EOI no se sube`() {
        val whole = jpeg(200, 100)
        val trailers =
            listOf(
                "$GPS_MARK -9.1234567 -78.5432100".toByteArray(),
                byteArrayOf(0),
                whole,
            )
        for (trailer in trailers) {
            assertEquals(EncodedProof.Unreadable, finishProofJpeg(whole + trailer))
            assertNull(stripJpegMetadata(whole + trailer))
        }
    }

    @Test
    fun `los metadatos entre escaneos de un JPEG progresivo se quitan y la imagen sigue intacta`() {
        val clean = progressiveJpeg(320, 240)
        val second = markers(clean, SOS)[1]
        val dirty =
            clean.copyOfRange(
                0,
                second,
            ) + exifSegment() + commentSegment() + segment(APP0, "JFIF\u0000".toByteArray()) +
                clean.copyOfRange(second, clean.size)
        assertTrue(hasJpegMetadata(dirty))
        assertTrue(dirty.containsAscii(GPS_MARK))

        val stripped = checkNotNull(stripJpegMetadata(dirty))

        assertArrayEquals(clean, stripped)
        assertFalse(hasJpegMetadata(stripped))
        val ready = finishProofJpeg(dirty) as EncodedProof.Ready
        assertArrayEquals(clean, ready.jpeg)
        assertFalse(ready.jpeg.containsAscii(GPS_MARK))
        val decoded = ImageIO.read(ByteArrayInputStream(ready.jpeg))
        assertEquals(320, decoded.width)
        assertEquals(240, decoded.height)
    }

    @Test
    fun `un JPEG de un formato o una estructura no admitidos no se sube`() {
        val base = jpeg(200, 100)
        val sof = markers(base, 0xC0).first()
        val sos = markers(base, SOS).first()
        val sofSegment = base.copyOfRange(sof, sof + 2 + u16(base, sof + 2))
        val rejected =
            mapOf(
                "sin pérdida (C3)" to base.patched(sof + 1, 0xC3),
                "jerárquico (C5)" to base.patched(sof + 1, 0xC5),
                "aritmético (C9)" to base.patched(sof + 1, 0xC9),
                "progresivo aritmético (CA)" to base.patched(sof + 1, 0xCA),
                "precisión de 12 bits" to base.patched(sof + 4, 12),
                "alto cero" to base.patched(sof + 5, 0).patched(sof + 6, 0),
                "SOS con un componente que el SOF no tiene" to base.patched(sos + 5, 0x7F),
                "SOS con una longitud que no cuadra" to base.patched(sos + 3, u16(base, sos + 2) + 2),
                "dos SOF" to base.copyOfRange(0, sof) + sofSegment + base.copyOfRange(sof, base.size),
                "un RST fuera de un escaneo" to
                    base.copyOfRange(0, 2) + bytes(0xFF, 0xD0) + base.copyOfRange(2, base.size),
                "un DNL tras el escaneo" to
                    base.copyOfRange(0, base.size - 2) + bytes(0xFF, 0xDC, 0x00, 0x04, 0x00, 0x64) + bytes(0xFF, EOI),
                "un SOI en medio" to base.copyOfRange(0, 2) + bytes(0xFF, 0xD8) + base.copyOfRange(2, base.size),
                "sin escaneo" to base.copyOfRange(0, sos) + bytes(0xFF, EOI),
            )
        for ((name, bytes) in rejected) {
            assertNull(name, stripJpegMetadata(bytes))
            assertNull(name, jpegDimensions(bytes))
            assertEquals(name, EncodedProof.Unreadable, finishProofJpeg(bytes))
        }
    }

    @Test
    fun `los JPEG reales que escribe un codificador siguen pasando y se decodifican`() {
        val samples =
            listOf(
                jpeg(1, 1),
                jpeg(31, 1600),
                jpeg(1600, 1200),
                jpeg(800, 600, BufferedImage.TYPE_BYTE_GRAY),
                progressiveJpeg(1200, 900),
            )
        for (sample in samples) {
            val ready = finishProofJpeg(sample) as EncodedProof.Ready
            // Sin metadatos que quitar, lo que se sube es exactamente lo que escribió el codificador.
            assertArrayEquals(sample, ready.jpeg)
            val decoded = ImageIO.read(ByteArrayInputStream(ready.jpeg))
            assertEquals(jpegDimensions(sample), PixelSize(decoded.width, decoded.height))
        }
    }

    @Test
    fun `el relleno entre segmentos se acepta y no llega a lo que se sube`() {
        val clean = jpeg(200, 100)
        val sof = markers(clean, 0xC0).first()
        val padded = clean.copyOfRange(0, sof) + bytes(0xFF, 0xFF) + clean.copyOfRange(sof, clean.size)

        assertArrayEquals(clean, stripJpegMetadata(padded))
    }

    private fun jpeg(
        width: Int,
        height: Int,
        type: Int = BufferedImage.TYPE_INT_RGB,
    ): ByteArray {
        val out = ByteArrayOutputStream()
        check(ImageIO.write(image(width, height, type), "jpg", out))
        return out.toByteArray()
    }

    private fun progressiveJpeg(
        width: Int,
        height: Int,
    ): ByteArray {
        val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
        val param = writer.defaultWriteParam.apply { progressiveMode = ImageWriteParam.MODE_DEFAULT }
        val out = ByteArrayOutputStream()
        ImageIO.createImageOutputStream(out).use { stream ->
            writer.output = stream
            writer.write(null, IIOImage(image(width, height, BufferedImage.TYPE_INT_RGB), null, null), param)
        }
        writer.dispose()
        return out.toByteArray()
    }

    private fun image(
        width: Int,
        height: Int,
        type: Int,
    ): BufferedImage {
        val image = BufferedImage(width, height, type)
        for (x in 0 until width step 7) image.setRGB(x, (x * 3) % height, 0x2266AA)
        return image
    }

    /**
     * Dónde empieza cada marcador `FF <marker>` del archivo. Sirve para SOS y SOF: dentro de los datos de un escaneo
     * un `FF` siempre va seguido de `00` o de un RST, así que no da falsos positivos.
     */
    private fun markers(
        jpeg: ByteArray,
        marker: Int,
    ): List<Int> =
        (0 until jpeg.size - 1).filter {
            (jpeg[it].toInt() and 0xFF) == 0xFF && (jpeg[it + 1].toInt() and 0xFF) == marker
        }

    private fun u16(
        jpeg: ByteArray,
        at: Int,
    ): Int = ((jpeg[at].toInt() and 0xFF) shl 8) or (jpeg[at + 1].toInt() and 0xFF)

    private fun ByteArray.patched(
        at: Int,
        value: Int,
    ): ByteArray = copyOf().also { it[at] = value.toByte() }

    private fun exifSegment(): ByteArray =
        segment(0xE1, "Exif\u0000\u0000MM\u0000*$GPS_MARK -9.1234567 -78.5432100".toByteArray(Charsets.ISO_8859_1))

    private fun commentSegment(): ByteArray = segment(0xFE, "tomada en San Jacinto".toByteArray())

    private fun segment(
        marker: Int,
        payload: ByteArray,
    ): ByteArray {
        val length = payload.size + 2
        return byteArrayOf(0xFF.toByte(), marker.toByte(), (length shr 8).toByte(), length.toByte()) + payload
    }

    private fun bytes(vararg values: Int): ByteArray = ByteArray(values.size) { values[it].toByte() }

    private fun ByteArray.containsAscii(text: String): Boolean = String(this, Charsets.ISO_8859_1).contains(text)

    private companion object {
        const val GPS_MARK = "GPSLatitude"
        const val SOS = 0xDA
        const val EOI = 0xD9
        const val APP0 = 0xE0
    }
}
