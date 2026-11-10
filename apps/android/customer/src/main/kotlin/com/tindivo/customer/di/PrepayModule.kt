package com.tindivo.customer.di

import com.tindivo.core.network.GeneratedJson
import com.tindivo.core.network.PrepayRepository
import com.tindivo.core.network.ProofUploader
import com.tindivo.core.network.createStorageUploadClient
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.feature.orders.AndroidProofImageEncoder
import com.tindivo.customer.feature.orders.ApiPrepayGateway
import com.tindivo.customer.feature.orders.PrepayGateway
import com.tindivo.customer.feature.orders.ProofImageEncoder
import com.tindivo.customer.feature.orders.StorageOrigin
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import javax.inject.Singleton

/** El comprobante de prepago: la API va por el cliente de la app; la subida a Storage, por uno propio y desnudo. */
@Module
@InstallIn(SingletonComponent::class)
internal object PrepayModule {
    @Provides
    @Singleton
    fun providePrepayRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): PrepayRepository {
        GeneratedJson.ensureConfigured()
        return PrepayRepository(BuildConfig.API_BASE_URL, client, io)
    }

    /** NUNCA el `OkHttpClient` de la app: ese pone el token y las cabeceras `X-Tindivo-*` (ver [ProofUploader]). */
    @Provides
    @Singleton
    fun provideProofUploader(
        @IoDispatcher io: CoroutineDispatcher,
    ): ProofUploader = ProofUploader(createStorageUploadClient(), io)

    /** El Supabase del entorno (el mismo de la sesión): las URL firmadas de subida tienen que ser suyas. */
    @Provides
    @StorageOrigin
    fun provideStorageOrigin(): HttpUrl = BuildConfig.SUPABASE_URL.toHttpUrl()
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class PrepayBindings {
    @Binds
    abstract fun bindPrepayGateway(gateway: ApiPrepayGateway): PrepayGateway

    @Binds
    abstract fun bindProofImageEncoder(encoder: AndroidProofImageEncoder): ProofImageEncoder
}
