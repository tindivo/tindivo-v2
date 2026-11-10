package com.tindivo.customer.feature.orders

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi
import com.tindivo.customer.di.IoDispatcher
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.IOException
import javax.inject.Inject

/** Convierte la foto elegida ([photo] es su `Uri` en texto) en el JPEG que se sube. */
internal fun interface ProofImageEncoder {
    suspend fun encode(photo: String): EncodedProof
}

/**
 * Recodifica la foto a JPEG con el lado mayor en [MAX_PROOF_SIDE] y calidad [PROOF_JPEG_QUALITY]. Volver a codificar
 * desde los píxeles deja fuera el EXIF (con la ubicación GPS de la foto), y además [stripJpegMetadata] quita del
 * resultado cualquier segmento de metadatos ([finishProofJpeg]).
 *
 * Desde Android 9 decodifica con [ImageDecoder], que aplica la orientación del EXIF y lee HEIC. En Android 8 usa
 * [BitmapFactory], que no la aplica: una foto de cámara girada se sube girada (una captura de pantalla no tiene ese
 * problema). Todo corre en [io], nunca en el hilo principal.
 */
internal class AndroidProofImageEncoder
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        @IoDispatcher private val io: CoroutineDispatcher,
    ) : ProofImageEncoder {
        override suspend fun encode(photo: String): EncodedProof =
            withContext(io) {
                try {
                    val bitmap = decode(Uri.parse(photo))
                    if (bitmap == null) EncodedProof.Unreadable else compress(bitmap)
                } catch (_: IOException) {
                    EncodedProof.Unreadable
                } catch (_: SecurityException) {
                    // El permiso temporal sobre la foto ya no vale (por ejemplo, tras matar el proceso).
                    EncodedProof.Unreadable
                } catch (_: OutOfMemoryError) {
                    EncodedProof.TooLarge
                }
            }

        private fun decode(uri: Uri): Bitmap? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) decodeModern(uri) else decodeLegacy(uri)

        @RequiresApi(Build.VERSION_CODES.P)
        private fun decodeModern(uri: Uri): Bitmap {
            val source = ImageDecoder.createSource(context.contentResolver, uri)
            return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                // Software: un bitmap de hardware no se deja recodificar.
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.setTargetSampleSize(proofSampleSize(info.size.width, info.size.height))
            }
        }

        private fun decodeLegacy(uri: Uri): Bitmap? {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            val sample = proofSampleSize(bounds.outWidth, bounds.outHeight)
            val options = BitmapFactory.Options().apply { inSampleSize = sample }
            return context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
        }

        private fun compress(decoded: Bitmap): EncodedProof {
            val target = proofTargetSize(decoded.width, decoded.height)
            val scaled =
                if (target.width == decoded.width && target.height == decoded.height) {
                    decoded
                } else {
                    Bitmap.createScaledBitmap(decoded, target.width, target.height, true)
                }
            val out = ByteArrayOutputStream()
            val written = scaled.compress(Bitmap.CompressFormat.JPEG, PROOF_JPEG_QUALITY, out)
            if (scaled !== decoded) scaled.recycle()
            decoded.recycle()
            return if (written) finishProofJpeg(out.toByteArray()) else EncodedProof.Unreadable
        }
    }
