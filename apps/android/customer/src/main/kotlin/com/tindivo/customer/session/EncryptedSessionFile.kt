package com.tindivo.customer.session

import com.google.crypto.tink.Aead
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.GeneralSecurityException

/** Dónde se guarda la sesión del aparato, como texto. Pequeña a propósito: se prueba con un `Aead` sin Keystore. */
interface SessionFile {
    /** Lo guardado, o `null` si no hay nada o no se pudo leer (en ese caso ya se borró). */
    fun read(): String?

    fun write(plain: String)

    /** Borra lo guardado; si no lo puede borrar, lo vacía (vale como sin sesión); si tampoco, lanza [IOException]. */
    fun delete()

    /**
     * Deja anotado, FUERA del archivo cifrado y de sus claves, que cerrar la sesión no pudo borrarlos: mientras la nota
     * exista no se restaura nada guardado. Lanza [IOException] si ni la nota se puede escribir. [write] y un [delete]
     * que llega al final la quitan.
     */
    fun markClosePending() = Unit

    /** `true` si hay una nota de cierre pendiente. */
    fun closePending(): Boolean = false
}

private const val ASSOCIATED_DATA = "tindivo-session-v1"

/** Destruye las claves con que se cifró la sesión: lo que quede en disco ya no se descifra. */
fun interface SessionKeys {
    fun destroy()
}

/**
 * La sesión en un archivo cifrado con Tink AEAD (AES256-GCM, KT-9). Nunca queda texto claro en el disco. Si lo
 * guardado no se descifra (clave nueva, archivo corrupto o cortado), se borra y vale como sin sesión.
 */
class EncryptedSessionFile(
    private val file: File,
    private val aead: Aead,
    private val keys: SessionKeys,
) : SessionFile {
    private val associatedData = ASSOCIATED_DATA.toByteArray(Charsets.UTF_8)

    override fun read(): String? {
        if (!file.exists()) return null
        if (file.length() == 0L) {
            delete()
            return null
        }
        return try {
            String(aead.decrypt(file.readBytes(), associatedData), Charsets.UTF_8)
        } catch (_: GeneralSecurityException) {
            delete()
            null
        } catch (_: IOException) {
            delete()
            null
        }
    }

    // La nota de cierre pendiente es un archivo vacío al lado del cifrado: no lleva nada de la cuenta, y si el disco deja
    // escribir una nota de cero bytes pero no borrar el archivo, esa nota es lo que evita restaurar la sesión.
    private val closeMarker = File(file.parentFile, "${file.name}.closing")

    // Segunda barrera, no una garantía: se escribe la nota y, escriba o no, se intenta destruir la clave por su alias
    // (sin tocar el archivo): sin clave, lo guardado no se descifra. Si falla también esto (más el borrado y el
    // vaciado de antes), queda un riesgo residual: nadie puede garantizar nada con un disco que no responde.
    override fun markClosePending() {
        val noteFailure =
            try {
                closeMarker.writeBytes(ByteArray(0))
                null
            } catch (e: IOException) {
                e
            }
        try {
            keys.destroy()
        } catch (_: IOException) {
            // Se decide con lo de arriba: si la nota tampoco se escribió, se avisa.
        } catch (_: GeneralSecurityException) {
            // Igual.
        }
        if (noteFailure != null) throw noteFailure
    }

    override fun closePending(): Boolean = closeMarker.exists()

    override fun write(plain: String) {
        val encrypted = aead.encrypt(plain.toByteArray(Charsets.UTF_8), associatedData)
        // Se escribe en un temporal y se renombra: un corte a medias no deja un archivo cortado en lugar del bueno.
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeBytes(encrypted)
        Files.move(temp.toPath(), file.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        // La sesión nueva reemplazó a la que quedó pendiente de cerrar: ya no hay nada que esa nota proteja. Si la
        // nota no se puede quitar el fallo sube: no se da por buena una entrada que el próximo arranque descartaría.
        Files.deleteIfExists(closeMarker.toPath())
    }

    override fun delete() {
        val fileFailure =
            try {
                remove(file)
                remove(File(file.parentFile, "${file.name}.tmp"))
                null
            } catch (e: IOException) {
                e
            }
        // Siempre se destruyen las claves: aunque el archivo sobreviva, ya no se descifra.
        val keysDestroyed =
            try {
                keys.destroy()
                true
            } catch (_: IOException) {
                false
            } catch (_: GeneralSecurityException) {
                false
            }
        if (fileFailure != null && !keysDestroyed) throw IOException("no se pudo invalidar la sesión guardada")
        // Si la nota no se puede quitar, el fallo sube: la memoria y el disco no se desincronizan.
        Files.deleteIfExists(closeMarker.toPath())
    }

    // Si no se puede borrar, se vacía: un archivo de 0 bytes no se restaura y vale como sin sesión. Si ni eso, se avisa.
    private fun remove(target: File) {
        if (!target.exists()) return
        target.delete()
        if (!target.exists()) return
        try {
            target.writeBytes(ByteArray(0))
        } catch (_: IOException) {
            // Se decide abajo con lo que quedó en disco.
        }
        if (target.exists() && target.length() != 0L) throw IOException("no se pudo borrar la sesión guardada")
    }
}
