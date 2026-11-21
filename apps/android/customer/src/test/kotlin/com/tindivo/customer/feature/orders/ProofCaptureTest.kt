package com.tindivo.customer.feature.orders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.Random
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam

/**
 * CUS-PAY-003 / CA-PAY-08 en la parte que corre en la JVM: tamaño final, calidad, tope de peso, orientación del EXIF
 * y detección de HEIC. La recodificación con `Bitmap` no corre aquí (no hay Robolectric): la cubre
 * `ProofImageEncoderDeviceTest` en un aparato.
 */
class ProofCaptureTest {
    @Test
    fun `CA-PAY-08 una captura de 1080x2400 conserva 1080 de ancho y no baja a 720`() {
        assertEquals(PixelSize(1080, 2400), proofTargetSize(1080, 2400))
        assertEquals(PixelSize(1080, 2400), proofTargetSize(1080, 2400).let { proofTargetSize(it.width, it.height) })
        assertTrue(finishProofJpeg(jpeg(1080, 2400)) is EncodedProof.Ready)
    }

    @Test
    fun `CA-PAY-08 una imagen de 900 de ancho no se agranda`() {
        assertEquals(PixelSize(900, 1600), proofTargetSize(900, 1600))
        assertEquals(PixelSize(900, 2000), proofTargetSize(900, 2000))
    }

    @Test
    fun `una foto de 4000x3000 sale con el lado mayor en 2200`() {
        assertEquals(PixelSize(2200, 1650), proofTargetSize(4000, 3000))
        assertEquals(PixelSize(1650, 2200), proofTargetSize(3000, 4000))
    }

    @Test
    fun `una captura muy alta y angosta se reduce hasta el ancho minimo, no mas`() {
        assertEquals(PixelSize(1080, 2880), proofTargetSize(1500, 4000))
    }

    @Test
    fun `la calidad es 85 y baja por pasos si la foto pasa del tope`() {
        assertEquals(85, PROOF_JPEG_QUALITY)
        assertEquals(listOf(85, 75, 65, 55, 45), PROOF_QUALITY_STEPS)
        assertEquals(1_500_000L, MAX_PROOF_BYTES)
    }

    @Test
    fun `tope de peso - si a 85 pasa del tope se baja la calidad hasta que cabe`() {
        val noisy = noise(600, 600)
        val sizes = PROOF_QUALITY_STEPS.associateWith { jpeg(noisy, it).size }
        assertTrue(
            "el peso baja con la calidad: $sizes",
            sizes.getValue(85) > sizes.getValue(75) && sizes.getValue(75) > sizes.getValue(65),
        )
        val asked = mutableListOf<Int>()

        val result =
            fitProofUnderCap(maxBytes = sizes.getValue(65).toLong()) { quality ->
                asked += quality
                jpeg(noisy, quality)
            }

        assertEquals(listOf(85, 75, 65), asked)
        assertEquals(sizes[65], (result as EncodedProof.Ready).jpeg.size)
    }

    @Test
    fun `tope de peso - si ni a la calidad mas baja cabe, es demasiado pesada`() {
        val noisy = noise(600, 600)

        val result = fitProofUnderCap(maxBytes = 1_000L) { jpeg(noisy, it) }

        assertEquals(EncodedProof.TooLarge, result)
    }

    @Test
    fun `tope de peso - a calidad 85 un JPEG que cabe se sube sin bajarla`() {
        val asked = mutableListOf<Int>()

        val result =
            fitProofUnderCap {
                asked += it
                jpeg(1080, 2400)
            }

        assertEquals(listOf(85), asked)
        assertTrue(result is EncodedProof.Ready)
    }

    @Test
    fun `si no se pudo escribir el JPEG no se sube nada`() {
        assertEquals(EncodedProof.Unreadable, fitProofUnderCap { null })
    }

    @Test
    fun `rotacion EXIF - cada valor de Orientation da su giro y espejo`() {
        assertEquals(ProofOrientation(0, false), proofOrientationOf(1))
        assertEquals(ProofOrientation(0, true), proofOrientationOf(2))
        assertEquals(ProofOrientation(180, false), proofOrientationOf(3))
        assertEquals(ProofOrientation(180, true), proofOrientationOf(4))
        assertEquals(ProofOrientation(270, true), proofOrientationOf(5))
        assertEquals(ProofOrientation(90, false), proofOrientationOf(6))
        assertEquals(ProofOrientation(90, true), proofOrientationOf(7))
        assertEquals(ProofOrientation(270, false), proofOrientationOf(8))
        assertTrue(proofOrientationOf(0).isIdentity)
        assertTrue(proofOrientationOf(9).isIdentity)
        assertTrue(proofOrientationOf(6).swapsSides)
        assertFalse(proofOrientationOf(3).swapsSides)
    }

    @Test
    fun `rotacion EXIF - se lee la orientacion de un JPEG de camara en ambos ordenes de bytes`() {
        for (little in listOf(true, false)) {
            for (value in 1..8) {
                val withExif = insertAfterSoi(jpeg(40, 30), exif(value, little))
                assertEquals("little=$little valor=$value", value, jpegExifOrientation(withExif))
            }
        }
    }

    @Test
    fun `rotacion EXIF - sin EXIF, con EXIF roto o sin ser JPEG la orientacion es la normal`() {
        assertEquals(1, jpegExifOrientation(jpeg(40, 30)))
        assertEquals(1, jpegExifOrientation(ByteArray(0)))
        assertEquals(1, jpegExifOrientation(byteArrayOf(-119, 80, 78, 71)))
        // Cortado en cualquier punto no lanza: o aun no llego a la etiqueta (1) o ya la leyo (6).
        val whole = insertAfterSoi(jpeg(40, 30), exif(6, true))
        for (cut in 0..whole.size) {
            assertTrue("corte en $cut", jpegExifOrientation(whole.copyOf(cut)) in listOf(1, 6))
        }
    }

    @Test
    fun `sin EXIF a la salida - la orientacion se lee antes y el resultado no conserva la etiqueta`() {
        val withExif = insertAfterSoi(jpeg(1200, 800), exif(6, true))
        assertEquals(6, jpegExifOrientation(withExif))

        val ready = finishProofJpeg(withExif) as EncodedProof.Ready

        assertFalse(hasJpegMetadata(ready.jpeg))
        assertEquals(1, jpegExifOrientation(ready.jpeg))
    }

    @Test
    fun `Android 8 - un HEIC se reconoce por su caja ftyp y no por la extension`() {
        for (brand in listOf("heic", "heix", "mif1", "msf1", "hevc")) {
            assertTrue(brand, looksLikeHeic(ftyp(brand)))
        }
        assertFalse(looksLikeHeic(ftyp("mp42")))
        assertFalse(looksLikeHeic(jpeg(40, 30)))
        assertFalse(looksLikeHeic(ByteArray(0)))
        assertFalse(looksLikeHeic(ByteArray(11)))
    }

    private fun ftyp(brand: String): ByteArray =
        byteArrayOf(0, 0, 0, 0x18) +
            "ftyp".toByteArray(Charsets.ISO_8859_1) +
            brand.toByteArray(Charsets.ISO_8859_1) +
            ByteArray(12)

    /** Un APP1 EXIF con la etiqueta Orientation, en el orden de bytes pedido. */
    private fun exif(
        orientation: Int,
        little: Boolean,
    ): ByteArray {
        fun u16(v: Int): ByteArray =
            if (little) byteArrayOf(v.toByte(), (v shr 8).toByte()) else byteArrayOf((v shr 8).toByte(), v.toByte())

        fun u32(v: Int): ByteArray = if (little) u16(v) + u16(0) else u16(0) + u16(v)

        val tiff =
            (if (little) "II" else "MM").toByteArray() + u16(42) + u32(8) +
                u16(1) + u16(0x0112) + u16(3) + u32(1) + u16(orientation) + u16(0) + u32(0)
        val payload = "Exif".toByteArray() + byteArrayOf(0, 0) + tiff
        val length = payload.size + 2
        return byteArrayOf(0xFF.toByte(), 0xE1.toByte(), (length shr 8).toByte(), length.toByte()) + payload
    }

    private fun insertAfterSoi(
        jpeg: ByteArray,
        segment: ByteArray,
    ): ByteArray = jpeg.copyOfRange(0, 2) + segment + jpeg.copyOfRange(2, jpeg.size)

    private fun jpeg(
        width: Int,
        height: Int,
    ): ByteArray = jpeg(BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), 85)

    private fun jpeg(
        image: BufferedImage,
        quality: Int,
    ): ByteArray {
        val writer = ImageIO.getImageWritersByFormatName("jpg").next()
        val param =
            writer.defaultWriteParam.apply {
                compressionMode = ImageWriteParam.MODE_EXPLICIT
                compressionQuality = quality / 100f
            }
        val out = ByteArrayOutputStream()
        ImageIO.createImageOutputStream(out).use { stream ->
            writer.output = stream
            writer.write(null, IIOImage(image, null, null), param)
        }
        writer.dispose()
        return out.toByteArray()
    }

    private fun noise(
        width: Int,
        height: Int,
    ): BufferedImage {
        val random = Random(7)
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        for (x in 0 until width) for (y in 0 until height) image.setRGB(x, y, random.nextInt(0x1000000))
        return image
    }
}
