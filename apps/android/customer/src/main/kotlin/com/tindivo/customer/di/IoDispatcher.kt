package com.tindivo.customer.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import javax.inject.Qualifier

/** El dispatcher de las llamadas bloqueantes (KT-4): se inyecta con este calificador, nunca va fijo en una clase. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

/** El dispatcher del trabajo que no bloquea (KT-4): también se inyecta. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class DefaultDispatcher

@Module
@InstallIn(SingletonComponent::class)
object DispatchersModule {
    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = Dispatchers.IO

    @Provides
    @DefaultDispatcher
    fun provideDefaultDispatcher(): CoroutineDispatcher = Dispatchers.Default
}
