package com.tindivo.customer.push

import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

// KT-10: el SDK de Firebase solo vive en este archivo. El resto de la app habla con PushTokens y PushRegistrar.

/**
 * La configuración de Firebase de esta compilación. Sale de `BuildConfig` (ver `customer/build.gradle.kts`): el repo es
 * público y `google-services.json` nunca entra en él. Sin todos los campos (la CI), los avisos quedan apagados.
 */
class FirebaseConfig(
    val apiKey: String,
    val projectId: String,
    val senderId: String,
    val appId: String,
) {
    val complete: Boolean
        get() = listOf(apiKey, projectId, senderId, appId).all { it.isNotBlank() }

    override fun toString(): String = "FirebaseConfig(projectId=$projectId, complete=$complete)"
}

/**
 * Inicia Firebase a mano (el `FirebaseInitProvider` automático está quitado del manifiesto) solo si [config] está
 * completa. Devuelve si quedó iniciada. Se llama una vez, en `TindivoApp.onCreate`, antes de que nada use FCM.
 */
fun initializeFirebase(
    context: Context,
    config: FirebaseConfig,
): Boolean {
    if (!config.complete) return false
    if (FirebaseApp.getApps(context).isNotEmpty()) return true
    val options =
        FirebaseOptions
            .Builder()
            .setApiKey(config.apiKey)
            .setProjectId(config.projectId)
            .setGcmSenderId(config.senderId)
            .setApplicationId(config.appId)
            .build()
    return try {
        FirebaseApp.initializeApp(context, options)
        true
    } catch (_: IllegalStateException) {
        // Opciones que Firebase rechaza: sin avisos, pero la app sigue.
        false
    }
}

/** [PushTokens] sobre FCM. Sin Firebase iniciada, [enabled] es `false` y nada toca el SDK. */
class FirebasePushTokens(
    private val context: Context,
) : PushTokens {
    override val enabled: Boolean
        get() = FirebaseApp.getApps(context).isNotEmpty()

    override suspend fun token(): String? {
        if (!enabled) return null
        return try {
            FirebaseMessaging
                .getInstance()
                .token
                .await()
                ?.takeIf { it.isNotBlank() }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Sin red o sin Google Play Services: se intenta de nuevo la próxima vez. El detalle no sale a un log.
            null
        }
    }

    override suspend fun delete(): Boolean {
        if (!enabled) return true
        return try {
            FirebaseMessaging.getInstance().deleteToken().await()
            true
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Se reintenta (la limpieza queda pendiente en `PushInstallationStore`); el detalle no sale a un log.
            false
        }
    }
}

/**
 * El servicio de FCM. `onNewToken` vuelve a registrar la cuenta vigente; `onMessageReceived` valida el payload v1 y lo
 * muestra. Los avisos de seguimiento (pedido y Entregas) llegan solo-datos y pasan siempre por aquí, con la app en
 * primer o en segundo plano; los demás, solo con la app en primer plano (en segundo plano los pinta el sistema con el
 * bloque `notification`). Un payload que no se entiende se descarta sin mostrar nada.
 */
@AndroidEntryPoint
class PushService : FirebaseMessagingService() {
    @Inject lateinit var registrar: PushRegistrar

    @Inject lateinit var presenter: TrackingPresenter

    override fun onNewToken(token: String) {
        // El token no se guarda ni se registra desde aquí: el registro lo vuelve a pedir, atado a la cuenta vigente.
        registrar.refresh()
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val payload = NativePushPayload.decode(message.data) ?: return
        // Este hilo es del servicio de FCM (no el principal) y el trabajo es corto: se espera a la puerta de los avisos,
        // que solo pinta lo que es de la sesión actual (`TrackingPresenter.onPush`).
        runBlocking { presenter.onPush(payload) }
    }
}

private suspend fun <T> Task<T>.await(): T =
    suspendCancellableCoroutine { continuation ->
        addOnCompleteListener { task ->
            val error = task.exception
            when {
                error != null -> continuation.resumeWithException(error)
                task.isCanceled -> continuation.cancel()
                else -> continuation.resume(task.result)
            }
        }
    }
