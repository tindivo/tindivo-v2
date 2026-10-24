package com.tindivo.customer.di

import android.os.Build
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

/** El `Build.VERSION.SDK_INT` del dispositivo: se inyecta para poder probar sin Robolectric. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class DeviceSdkInt

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
    @DeviceSdkInt
    fun provideDeviceSdkInt(): Int = Build.VERSION.SDK_INT

    @Provides
    @Singleton
    @ApplicationScope
    fun provideApplicationScope(
        @DefaultDispatcher dispatcher: CoroutineDispatcher,
    ): CoroutineScope = CoroutineScope(SupervisorJob() + dispatcher)
}
