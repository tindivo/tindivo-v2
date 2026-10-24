package com.tindivo.customer.di

import com.tindivo.customer.BuildConfig
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import javax.inject.Qualifier
import javax.inject.Singleton

/** La `versionName` de esta app (la que se compara con el mínimo de `/config`). */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AppVersionName

/** El alcance que vive lo que el proceso: para trabajo que no pertenece a ninguna pantalla. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ApplicationScope

@Module
@InstallIn(SingletonComponent::class)
object ConfigModule {
    @Provides
    @AppVersionName
    fun provideAppVersionName(): String = BuildConfig.VERSION_NAME

    @Provides
    @Singleton
    @ApplicationScope
    fun provideApplicationScope(
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ): CoroutineScope = CoroutineScope(SupervisorJob() + dispatcher)
}
