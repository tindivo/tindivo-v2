package com.tindivo.customer.di

import android.content.Context
import coil3.ImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object ImageModule {
    /**
     * El cargador de imágenes de Coil (D-54). Usa un cliente HTTP propio y no el de la API: las fotos vienen del
     * almacenamiento público, no de la API, y no deben llevar las cabeceras `X-Tindivo-*` ni, cuando haya sesión, el
     * token del usuario.
     */
    @Provides
    @Singleton
    fun provideImageLoader(
        @ApplicationContext context: Context,
    ): ImageLoader =
        ImageLoader
            .Builder(context)
            .components { add(OkHttpNetworkFetcherFactory(callFactory = { imageHttpClient() })) }
            .crossfade(true)
            .build()

    private fun imageHttpClient(): OkHttpClient =
        OkHttpClient
            .Builder()
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(IO_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()

    private const val CONNECT_TIMEOUT_SECONDS = 10L
    private const val IO_TIMEOUT_SECONDS = 20L
    private const val CALL_TIMEOUT_SECONDS = 30L
}
