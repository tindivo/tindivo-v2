package com.tindivo.customer.di

import com.tindivo.core.network.BearerAuthInterceptor
import com.tindivo.core.network.CatalogRepository
import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.CustomerRepository
import com.tindivo.core.network.ReviewRepository
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.session.SessionStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun provideClientInfo(): ClientInfo =
        ClientInfo(
            app = "customer",
            appVersion = BuildConfig.VERSION_NAME,
            build = BuildConfig.VERSION_CODE.toString(),
        )

    @Provides
    @Singleton
    fun provideOkHttpClient(
        clientInfo: ClientInfo,
        sessionStore: SessionStore,
    ): OkHttpClient =
        // El token solo viaja al origen de la API; el cargador de imágenes (ImageModule) usa su propio cliente.
        createOkHttpClient(clientInfo, auth = BearerAuthInterceptor(BuildConfig.API_BASE_URL.toHttpUrl(), sessionStore))

    @Provides
    @Singleton
    fun provideSystemRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): SystemRepository = SystemRepository(BuildConfig.API_BASE_URL, client, io)

    @Provides
    @Singleton
    fun provideCatalogRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): CatalogRepository = CatalogRepository(BuildConfig.API_BASE_URL, client, io)

    @Provides
    @Singleton
    fun provideCustomerRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): CustomerRepository = CustomerRepository(BuildConfig.API_BASE_URL, client, io)

    @Provides
    @Singleton
    fun provideReviewRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): ReviewRepository = ReviewRepository(BuildConfig.API_BASE_URL, client, io)
}
