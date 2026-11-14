package com.tindivo.customer.feature.orders

import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.random.Random

/**
 * Lo que de verdad escribe el codificador del aparato: `Bitmap.compress` tiene que dar un JPEG que el validador admite
 * (APP0 JFIF 1.00–1.02 sin miniatura y tablas válidas). Si no, toda foto saldría «ilegible» en el teléfono aunque las
 * pruebas en la JVM pasen.
 */
@RunWith(AndroidJUnit4::class)
class ProofImageEncoderDeviceTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun unaFotoGrande_saleComoJpegAdmitidoYAchicada() {
        val proof = encode(width = 3000, height = 2000)
        assertTrue("se esperaba Ready y salió $proof", proof is EncodedProof.Ready)
        val jpeg = (proof as EncodedProof.Ready).jpeg
        assertEquals(PixelSize(MAX_PROOF_SIDE, MAX_PROOF_SIDE * 2 / 3), jpegDimensions(jpeg))
        assertFalse(hasJpegMetadata(jpeg))
    }

    @Test
    fun unaFotoChica_saleComoJpegAdmitidoSinCambiarDeTamano() {
        val proof = encode(width = 800, height = 600)
        assertTrue("se esperaba Ready y salió $proof", proof is EncodedProof.Ready)
        assertEquals(PixelSize(800, 600), jpegDimensions((proof as EncodedProof.Ready).jpeg))
    }

    @Test
    fun loQueEscribeBitmapCompress_esJfifSinMiniatura() {
        val out = ByteArrayOutputStream()
        bitmap(width = 1200, height = 900).compress(Bitmap.CompressFormat.JPEG, PROOF_JPEG_QUALITY, out)
        val raw = out.toByteArray()
        // SOI y luego APP0 "JFIF\0": versión en los bytes 11 y 12, miniatura en los bytes 18 y 19.
        val header = raw.copyOfRange(0, 20).joinToString(" ") { "%02X".format(it) }
        Log.i(TAG, "cabecera de Bitmap.compress: $header")
        assertEquals(0xFF, raw[0].toInt() and 0xFF)
        assertEquals(0xD8, raw[1].toInt() and 0xFF)
        assertEquals(0xE0, raw[3].toInt() and 0xFF)
        assertEquals("JFIF", String(raw, 6, 4, Charsets.US_ASCII))
        val major = raw[11].toInt()
        val minor = raw[12].toInt()
        Log.i(TAG, "JFIF $major.0$minor · miniatura ${raw[18]}x${raw[19]}")
        assertEquals(1, major)
        assertTrue("versión menor $minor fuera de 0..2", minor in 0..2)
        assertEquals(0, raw[18].toInt())
        assertEquals(0, raw[19].toInt())
        assertNotNull("el validador rechaza lo que escribe el aparato", stripJpegMetadata(raw))
    }

    private fun encode(
        width: Int,
        height: Int,
    ): EncodedProof {
        val file = File(context.cacheDir, "prueba-comprobante-${width}x$height.png")
        file.outputStream().use { bitmap(width, height).compress(Bitmap.CompressFormat.PNG, 100, it) }
        try {
            val encoder = AndroidProofImageEncoder(context, Dispatchers.IO)
            return runBlocking { encoder.encode(Uri.fromFile(file).toString()) }
        } finally {
            file.delete()
        }
    }

    // Degradado con ruido: se parece más a una foto que un color plano (tablas de Huffman con muchos símbolos).
    private fun bitmap(
        width: Int,
        height: Int,
    ): Bitmap {
        val random = Random(SEED)
        val pixels =
            IntArray(width * height) { i ->
                val x = i % width
                val y = i / width
                val noise = random.nextInt(NOISE)
                Color.rgb((x * 255 / width + noise) % 256, (y * 255 / height + noise) % 256, (x + y + noise) % 256)
            }
        return Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    }

    private companion object {
        const val TAG = "ProofEncoderDevice"
        const val SEED = 42
        const val NOISE = 40
    }
}
