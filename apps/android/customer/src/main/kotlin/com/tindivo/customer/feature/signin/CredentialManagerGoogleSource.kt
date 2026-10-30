package com.tindivo.customer.feature.signin

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

/**
 * Credential Manager con la opción «Iniciar sesión con Google». Necesita el contexto de la actividad: el selector se
 * dibuja encima de ella.
 */
class CredentialManagerGoogleSource(
    private val context: Context,
    private val serverClientId: String,
) : GoogleIdSource {
    override suspend fun idToken(hashedNonce: String): GoogleIdResult {
        val option = GetSignInWithGoogleOption.Builder(serverClientId).setNonce(hashedNonce).build()
        val request = GetCredentialRequest(listOf(option))
        return try {
            val credential = CredentialManager.create(context).getCredential(context, request).credential
            if (credential is CustomCredential && credential.type in GOOGLE_TYPES) {
                GoogleIdResult.Token(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else {
                GoogleIdResult.Failed
            }
        } catch (_: GetCredentialCancellationException) {
            GoogleIdResult.Cancelled
        } catch (_: GetCredentialException) {
            GoogleIdResult.Failed
        } catch (_: GoogleIdTokenParsingException) {
            GoogleIdResult.Failed
        }
    }

    private companion object {
        val GOOGLE_TYPES =
            setOf(
                GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL,
                GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_SIWG_CREDENTIAL,
            )
    }
}
