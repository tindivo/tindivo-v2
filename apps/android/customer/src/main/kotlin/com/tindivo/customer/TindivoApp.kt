package com.tindivo.customer

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import dagger.Lazy
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class TindivoApp :
    Application(),
    SingletonImageLoader.Factory {
    // Lazy: Coil pide el cargador la primera vez que pinta una imagen, ya con Hilt inyectado.
    @Inject lateinit var imageLoader: Lazy<ImageLoader>

    override fun newImageLoader(context: PlatformContext): ImageLoader = imageLoader.get()
}
