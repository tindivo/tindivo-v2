package com.tindivo.customer.di

import com.tindivo.customer.feature.orders.PollingDelay
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.delay

@Module
@InstallIn(SingletonComponent::class)
object PollingModule {
    @Provides
    fun providePollingDelay(): PollingDelay = PollingDelay { delay(it) }
}
