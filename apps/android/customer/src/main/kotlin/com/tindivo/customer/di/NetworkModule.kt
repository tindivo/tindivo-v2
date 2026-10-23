package com.tindivo.customer.di

import com.tindivo.core.network.ClientInfo
import com.tindivo.core.network.SystemRepository
import com.tindivo.core.network.createOkHttpClient
import com.tindivo.customer.BuildConfig
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
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
    fun provideOkHttpClient(clientInfo: ClientInfo): OkHttpClient = createOkHttpClient(clientInfo)

    @Provides
    @Singleton
    fun provideSystemRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): SystemRepository = SystemRepository(BuildConfig.API_BASE_URL, client, io)
}
