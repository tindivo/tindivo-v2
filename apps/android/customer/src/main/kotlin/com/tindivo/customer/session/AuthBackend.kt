package com.tindivo.customer.session

/**
 * El token vigente y de quién es. [toString] no lo incluye: un token nunca sale en un log ni en un mensaje.
 */
internal class TokenSnapshot(
    val accessToken: String,
    val userId: String,
    val expiresAtEpochSeconds: Long,
) {
    override fun toString(): String = "TokenSnapshot(userId=$userId)"
}

/**
 * Lo que [SupabaseSessionStore] necesita de Auth, sin tipos del SDK (DES-2): así su lógica se prueba sin red. Toda
 * función lanza si falla; el store decide qué hacer.
 */
internal interface AuthBackend {
    /** La sesión guardada en el aparato, sin refrescarla; `null` si no hay. */
    suspend fun restore(): TokenSnapshot?

    suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
    ): TokenSnapshot

    /** Pide un token nuevo con el refresh token de la sesión actual y guarda el resultado. */
    suspend fun refresh(): TokenSnapshot

    /** Revoca la sesión en el servidor. */
    suspend fun signOut()

    /** Borra la sesión del aparato. */
    suspend fun clear()

    /** Anota que cerrar la sesión no pudo borrar lo guardado (ver [SessionFile.markClosePending]); lanza si falla. */
    suspend fun markClosePending() = Unit

    /** `true` si quedó un cierre pendiente: lo guardado no se restaura hasta poder borrarlo. */
    suspend fun closePending(): Boolean = false
}
