package com.tindivo.customer

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import com.tindivo.customer.feature.deleteaccount.DeletedAccountCleanup
import dagger.Lazy
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class TindivoApp :
    Application(),
    SingletonImageLoader.Factory {
    // Lazy: Coil pide el cargador la primera vez que pinta una imagen, ya con Hilt inyectado.
    @Inject lateinit var imageLoader: Lazy<ImageLoader>

    // Retoma la limpieza local de una cuenta borrada que no terminó (un fallo de disco, o el proceso que murió a mitad).
    @Inject lateinit var deletedAccountCleanup: DeletedAccountCleanup

    override fun onCreate() {
        super.onCreate()
        deletedAccountCleanup.start()
    }

    override fun newImageLoader(context: PlatformContext): ImageLoader = imageLoader.get()
}
