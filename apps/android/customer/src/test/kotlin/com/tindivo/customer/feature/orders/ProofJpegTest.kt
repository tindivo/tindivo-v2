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
import javax.imageio.ImageIO

/**
 * La parte pura de la foto que se sube. Los JPEG de prueba son reales (los escribe `javax.imageio` del JDK) y se les
 * inserta a mano un EXIF con coordenadas GPS, como el que trae una foto de cámara.
 *
 * Límite: la recodificación con `Bitmap` de Android no corre en la JVM (no hay Robolectric); aquí se prueba lo que
 * decide qué se sube: el tamaño, la limpieza de metadatos y la comprobación final ([finishProofJpeg]).
 */
class ProofJpegTest {
    @Test
    fun `el submuestreo no baja el lado mayor de 1600`() {
        assertEquals(2, proofSampleSize(4000, 3000))
        assertEquals(2, proofSampleSize(3000, 4000))
        assertEquals(8, proofSampleSize(12800, 100))
        assertEquals(1, proofSampleSize(3199, 100))
        assertEquals(1, proofSampleSize(1000, 800))
        assertEquals(1, proofSampleSize(0, 800))
        assertEquals(1, proofSampleSize(-5, -5))
    }

    @Test
    fun `el tamano final respeta el lado maximo y la proporcion sin agrandar`() {
        assertEquals(PixelSize(1600, 1200), proofTargetSize(4000, 3000))
        assertEquals(PixelSize(1200, 1600), proofTargetSize(3000, 4000))
        assertEquals(PixelSize(1600, 900), proofTargetSize(1600, 900))
        assertEquals(PixelSize(800, 600), proofTargetSize(800, 600))
        assertEquals(PixelSize(1600, 1), proofTargetSize(20000, 1))
        for (width in listOf(1601, 1999, 2047, 3001, 4032, 9999)) {
            for (height in listOf(1, 7, 1600, 3024, 4000)) {
                val size = proofTargetSize(width, height)
                assertTrue("$width×$height dio $size", maxOf(size.width, size.height) <= MAX_PROOF_SIDE)
                assertTrue(size.width >= 1 && size.height >= 1)
            }
        }
    }

    @Test
    fun `quitar metadatos elimina el EXIF con GPS y deja la imagen intacta`() {
        val clean = jpeg(1200, 800)
        val withExif = insertAfterSoi(clean, exifSegment(), commentSegment())
        assertTrue(hasJpegMetadata(withExif))
        assertTrue(withExif.containsAscii(GPS_MARK))

        val stripped = checkNotNull(stripJpegMetadata(withExif))

        assertFalse(hasJpegMetadata(stripped))
        assertFalse(stripped.containsAscii(GPS_MARK))
        assertFalse(stripped.containsAscii("Exif"))
        // Lo que queda es exactamente el JPEG original: no se tocó ningún dato de la imagen.
        assertArrayEquals(clean, stripped)
        val decoded = ImageIO.read(ByteArrayInputStream(stripped))
        assertEquals(1200, decoded.width)
        assertEquals(800, decoded.height)
    }

    @Test
    fun `las dimensiones se leen del SOF del JPEG`() {
        assertEquals(PixelSize(1200, 800), jpegDimensions(jpeg(1200, 800)))
        assertEquals(PixelSize(31, 1600), jpegDimensions(insertAfterSoi(jpeg(31, 1600), exifSegment())))
    }

    @Test
    fun `lo que no es un JPEG bien formado no se sube`() {
        val truncated = jpeg(200, 100).copyOf(40)
        val png = byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte(), 0, 0, 0, 0)
        val badLength = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE1.toByte(), 0x7F, 0x7F, 0, 0)

        for (bytes in listOf(ByteArray(0), truncated, png, badLength)) {
            assertNull(stripJpegMetadata(bytes))
            assertNull(jpegDimensions(bytes))
            assertEquals(EncodedProof.Unreadable, finishProofJpeg(bytes))
        }
    }

    @Test
    fun `de 0 a 3 bytes nada lanza y nada se sube`() {
        val tiny =
            listOf(
                ByteArray(0),
                bytes(0xFF),
                bytes(0xFF, 0xD8),
                bytes(0xFF, 0xD8, 0xFF),
                bytes(0x00),
                bytes(0xD8, 0xFF, 0xD8),
            )

        for (input in tiny) {
            val label = input.joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }
            assertNull(label, stripJpegMetadata(input))
            assertNull(label, jpegDimensions(input))
            assertFalse(label, hasJpegMetadata(input))
            assertEquals(label, EncodedProof.Unreadable, finishProofJpeg(input))
        }
    }

    @Test
    fun `una cabecera de 4 bytes sin SOF no se sube`() {
        // SOI + SOS sin dimensiones, SOI + EOI, y un SOF cortado justo tras el marcador.
        val headers =
            listOf(bytes(0xFF, 0xD8, 0xFF, 0xDA), bytes(0xFF, 0xD8, 0xFF, 0xD9), bytes(0xFF, 0xD8, 0xFF, 0xC0))
        for (input in headers) {
            assertNull(jpegDimensions(input))
            assertEquals(EncodedProof.Unreadable, finishProofJpeg(input))
        }
    }

    @Test
    fun `la comprobacion final entrega un JPEG sin metadatos de hasta 1600 px`() {
        val ok = finishProofJpeg(insertAfterSoi(jpeg(1600, 1200), exifSegment()))

        val jpeg = (ok as EncodedProof.Ready).jpeg
        assertEquals(0xFF, jpeg[0].toInt() and 0xFF)
        assertEquals(0xD8, jpeg[1].toInt() and 0xFF)
        assertFalse(hasJpegMetadata(jpeg))
        assertFalse(jpeg.containsAscii(GPS_MARK))
        assertEquals(PixelSize(1600, 1200), jpegDimensions(jpeg))
    }

    @Test
    fun `un JPEG con el lado mayor por encima de 1600 no se sube`() {
        assertEquals(EncodedProof.Unreadable, finishProofJpeg(jpeg(1601, 10)))
        assertEquals(EncodedProof.Unreadable, finishProofJpeg(jpeg(10, 2400)))
    }

    @Test
    fun `los bytes de la foto no salen en toString`() {
        assertEquals("Ready(3 bytes)", EncodedProof.Ready(byteArrayOf(1, 2, 3)).toString())
    }

    private fun jpeg(
        width: Int,
        height: Int,
    ): ByteArray {
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        for (x in 0 until width step 7) image.setRGB(x, (x * 3) % height, 0x2266AA)
        val out = ByteArrayOutputStream()
        check(ImageIO.write(image, "jpg", out))
        return out.toByteArray()
    }

    /** Un APP1 EXIF de juguete con una «latitud» reconocible: lo que nunca debe llegar al servidor. */
    private fun exifSegment(): ByteArray {
        val payload = "Exif\u0000\u0000MM\u0000*$GPS_MARK -9.1234567 -78.5432100".toByteArray(Charsets.ISO_8859_1)
        return segment(0xE1, payload)
    }

    private fun commentSegment(): ByteArray = segment(0xFE, "tomada en San Jacinto".toByteArray())

    private fun segment(
        marker: Int,
        payload: ByteArray,
    ): ByteArray {
        val length = payload.size + 2
        return byteArrayOf(0xFF.toByte(), marker.toByte(), (length shr 8).toByte(), length.toByte()) + payload
    }

    private fun insertAfterSoi(
        jpeg: ByteArray,
        vararg segments: ByteArray,
    ): ByteArray =
        jpeg.copyOfRange(0, 2) + segments.fold(ByteArray(0)) { acc, s -> acc + s } + jpeg.copyOfRange(2, jpeg.size)

    private fun bytes(vararg values: Int): ByteArray = ByteArray(values.size) { values[it].toByte() }

    private fun ByteArray.containsAscii(text: String): Boolean = String(this, Charsets.ISO_8859_1).contains(text)

    private companion object {
        const val GPS_MARK = "GPSLatitude"
    }
}
