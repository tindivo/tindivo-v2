package com.tindivo.customer.feature.orders

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
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
 * Recodifica la foto a JPEG (CUS-PAY-003): lado mayor de hasta [MAX_PROOF_SIDE] con ancho mínimo [MIN_PROOF_WIDTH]
 * (sin agrandar), calidad [PROOF_JPEG_QUALITY] y, si pasa de [MAX_PROOF_BYTES], calidad más baja por pasos
 * ([fitProofUnderCap]). Volver a codificar desde los píxeles deja fuera el EXIF (con la ubicación GPS de la foto), y
 * además [stripJpegMetadata] quita del resultado cualquier segmento de metadatos ([finishProofJpeg]).
 *
 * La orientación del EXIF se aplica ANTES de quitarlo: desde Android 9 la aplica [ImageDecoder] (que también lee
 * HEIC); en Android 8 se lee del JPEG ([jpegExifOrientation]) y se gira el mapa de bits con una [Matrix]. Android 8 no
 * decodifica HEIC: si el archivo lo es, el resultado es [EncodedProof.HeicUnsupported] y se pide una captura de
 * pantalla. Todo corre en [io], nunca en el hilo principal.
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
                    val uri = Uri.parse(photo)
                    val bitmap = decode(uri)
                    when {
                        bitmap != null -> {
                            compress(bitmap)
                        }

                        Build.VERSION.SDK_INT < Build.VERSION_CODES.P && looksLikeHeic(head(uri)) -> {
                            EncodedProof.HeicUnsupported
                        }

                        else -> {
                            EncodedProof.Unreadable
                        }
                    }
                } catch (_: IOException) {
                    EncodedProof.Unreadable
                } catch (_: SecurityException) {
                    // El permiso temporal sobre la foto ya no vale (por ejemplo, tras matar el proceso).
                    EncodedProof.Unreadable
                } catch (_: OutOfMemoryError) {
                    EncodedProof.TooLarge
                }
            }

        private fun head(uri: Uri): ByteArray =
            context.contentResolver.openInputStream(uri)?.use { input ->
                val buffer = ByteArray(PROOF_HEAD_BYTES)
                var filled = 0
                while (filled < buffer.size) {
                    val read = input.read(buffer, filled, buffer.size - filled)
                    if (read < 0) break
                    filled += read
                }
                buffer.copyOf(filled)
            } ?: ByteArray(0)

        private fun decode(uri: Uri): Bitmap? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) decodeModern(uri) else decodeLegacy(uri)

        @RequiresApi(Build.VERSION_CODES.P)
        private fun decodeModern(uri: Uri): Bitmap {
            val source = ImageDecoder.createSource(context.contentResolver, uri)
            return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                // Software: un bitmap de hardware no se deja recodificar. ImageDecoder aplica la orientación del EXIF.
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
            val decoded =
                context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
                    ?: return null
            // BitmapFactory no aplica el EXIF: se lee del JPEG (si lo es) y se gira aquí, antes de descartarlo.
            val orientation = proofOrientationOf(jpegExifOrientation(head(uri)))
            return if (orientation.isIdentity) decoded else orient(decoded, orientation)
        }

        private fun orient(
            source: Bitmap,
            orientation: ProofOrientation,
        ): Bitmap {
            val matrix = Matrix()
            if (orientation.mirror) matrix.postScale(-1f, 1f)
            matrix.postRotate(orientation.degrees.toFloat())
            val turned = Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
            if (turned !== source) source.recycle()
            return turned
        }

        private fun compress(decoded: Bitmap): EncodedProof {
            val target = proofTargetSize(decoded.width, decoded.height)
            val scaled =
                if (target.width == decoded.width && target.height == decoded.height) {
                    decoded
                } else {
                    Bitmap.createScaledBitmap(decoded, target.width, target.height, true)
                }
            val result =
                fitProofUnderCap { quality ->
                    val out = ByteArrayOutputStream()
                    if (scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)) out.toByteArray() else null
                }
            if (scaled !== decoded) scaled.recycle()
            decoded.recycle()
            return result
        }
    }
