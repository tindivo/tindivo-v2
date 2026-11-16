package com.tindivo.customer

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import com.tindivo.customer.di.ApplicationScope
import com.tindivo.customer.feature.deleteaccount.DeletedAccountCleanup
import com.tindivo.customer.push.FirebaseConfig
import com.tindivo.customer.push.PushChannels
import com.tindivo.customer.push.PushRegistrar
import com.tindivo.customer.push.TrackingReconciler
import com.tindivo.customer.push.initializeFirebase
import dagger.Lazy
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import javax.inject.Inject

@HiltAndroidApp
class TindivoApp :
    Application(),
    SingletonImageLoader.Factory {
    // Lazy: Coil pide el cargador la primera vez que pinta una imagen, ya con Hilt inyectado.
    @Inject lateinit var imageLoader: Lazy<ImageLoader>

    // Retoma la limpieza local de una cuenta borrada que no terminó (un fallo de disco, o el proceso que murió a mitad).
    @Inject lateinit var deletedAccountCleanup: DeletedAccountCleanup

    // Avisos (KT-10): el canal se crea al arrancar; Firebase solo se inicia si esta compilación trae su configuración.
    @Inject lateinit var firebaseConfig: FirebaseConfig

    @Inject lateinit var pushRegistrar: PushRegistrar

    // Atiende los avisos que no se pudieron ordenar: lee REST de ese seguimiento (CAX-003).
    @Inject lateinit var trackingReconciler: TrackingReconciler

    @Inject @field:ApplicationScope
    lateinit var appScope: CoroutineScope

    override fun onCreate() {
        super.onCreate()
        deletedAccountCleanup.start()
        PushChannels.create(this)
        initializeFirebase(this, firebaseConfig)
        pushRegistrar.start()
        trackingReconciler.start(appScope)
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader = imageLoader.get()
}
