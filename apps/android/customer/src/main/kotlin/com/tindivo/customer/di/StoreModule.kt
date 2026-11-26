package com.tindivo.customer.di

import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.StoreRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.feature.store.RepositoryStoreGateway
import com.tindivo.customer.feature.store.StoreEventSender
import com.tindivo.customer.feature.store.StoreGateway
import com.tindivo.customer.feature.store.StoreWebBaseUrl
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object StoreModule {
    /**
     * Store es anónima: su cliente HTTP es el de la API (cabeceras de cliente, plazos y reintentos de CLI-10) pero SIN
     * el interceptor del token, así que nunca manda la sesión de la cuenta aunque la haya.
     */
    @Provides
    @Singleton
    fun provideStoreRepository(
        clientInfo: ClientInfo,
        @IoDispatcher io: CoroutineDispatcher,
    ): StoreRepository = StoreRepository(BuildConfig.API_BASE_URL, createOkHttpClient(clientInfo), io)

    @Provides
    fun provideStoreEventSender(repository: StoreRepository): StoreEventSender = StoreEventSender(repository::track)

    @Provides
    @StoreWebBaseUrl
    fun provideStoreWebBaseUrl(): String = BuildConfig.WEB_BASE_URL
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class StoreBindings {
    @Binds
    abstract fun bindStoreGateway(gateway: RepositoryStoreGateway): StoreGateway
}
