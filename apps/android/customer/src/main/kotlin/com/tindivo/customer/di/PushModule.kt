package com.tindivo.customer.di

import android.content.Context
import android.os.Build
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.PushDeviceInfo
import com.tindivo.core.network.PushRepository
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.push.AndroidNotificationAccess
import com.tindivo.customer.push.DataStorePushInstallationStore
import com.tindivo.customer.push.DeviceDescription
import com.tindivo.customer.push.FirebaseConfig
import com.tindivo.customer.push.FirebasePushTokens
import com.tindivo.customer.push.NotificationAccess
import com.tindivo.customer.push.PushDevices
import com.tindivo.customer.push.PushInstallationSerializer
import com.tindivo.customer.push.PushInstallationSnapshot
import com.tindivo.customer.push.PushInstallationStore
import com.tindivo.customer.push.PushNotifier
import com.tindivo.customer.push.PushPermissionPrompt
import com.tindivo.customer.push.PushRegistrar
import com.tindivo.customer.push.PushSignOut
import com.tindivo.customer.push.PushTokens
import com.tindivo.customer.session.SessionStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient
import java.io.File
import java.time.ZoneId
import java.util.Locale
import java.util.UUID
import javax.inject.Singleton

/** En `noBackupFilesDir`: la identidad de la instalación nunca viaja a una copia ni a otro aparato. */
private const val PUSH_INSTALLATION_FILE = "tindivo_push_installation.json"
private const val MAX_DEVICE_MODEL = 128

@Module
@InstallIn(SingletonComponent::class)
object PushModule {
    @Provides
    fun provideFirebaseConfig(): FirebaseConfig =
        FirebaseConfig(
            apiKey = BuildConfig.FIREBASE_API_KEY,
            projectId = BuildConfig.FIREBASE_PROJECT_ID,
            senderId = BuildConfig.FIREBASE_SENDER_ID,
            appId = BuildConfig.FIREBASE_APP_ID,
        )

    @Provides
    @Singleton
    fun providePushTokens(
        @ApplicationContext context: Context,
    ): PushTokens = FirebasePushTokens(context)

    @Provides
    @Singleton
    fun provideNotificationAccess(
        @ApplicationContext context: Context,
        @DeviceSdkInt sdkInt: Int,
    ): NotificationAccess = AndroidNotificationAccess(context, sdkInt)

    @Provides
    @Singleton
    fun providePushNotifier(
        @ApplicationContext context: Context,
    ): PushNotifier = PushNotifier(context)

    /** Un archivo ilegible se reemplaza por «sin identidad»: se genera un `installId` nuevo (ver el serializador). */
    @Provides
    @Singleton
    fun providePushInstallationStore(
        @ApplicationContext context: Context,
        @IoDispatcher io: CoroutineDispatcher,
    ): PushInstallationStore =
        DataStorePushInstallationStore(
            DataStoreFactory.create(
                serializer = PushInstallationSerializer,
                corruptionHandler =
                    ReplaceFileCorruptionHandler<PushInstallationSnapshot>(
                        produceNewData = { PushInstallationSnapshot() },
                    ),
                scope = CoroutineScope(io + SupervisorJob()),
                produceFile = { File(context.noBackupFilesDir, PUSH_INSTALLATION_FILE) },
            ),
        )

    @Provides
    @Singleton
    fun providePushDevices(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): PushDevices {
        val repository = PushRepository(BuildConfig.API_BASE_URL, client, io)
        return object : PushDevices {
            override suspend fun register(
                installId: UUID,
                device: PushDeviceInfo,
                accountId: String,
            ): ApiResult<Unit> = repository.register(installId, device, accountId)

            override suspend fun unregister(
                installId: UUID,
                accountId: String,
            ): ApiResult<Unit> = repository.unregister(installId, accountId)
        }
    }

    /** Sin datos personales: versión, Android, modelo, idioma y zona horaria. */
    @Provides
    fun provideDeviceDescription(access: NotificationAccess): DeviceDescription =
        DeviceDescription { token ->
            PushDeviceInfo(
                token = token,
                appVersion = BuildConfig.VERSION_NAME,
                notificationsEnabled = access.notificationsEnabled(),
                osVersion = Build.VERSION.RELEASE?.takeIf { it.isNotBlank() },
                deviceModel =
                    Build.MODEL
                        ?.trim()
                        ?.take(MAX_DEVICE_MODEL)
                        ?.takeIf { it.isNotBlank() },
                locale = Locale.getDefault().toLanguageTag(),
                timezone = ZoneId.systemDefault().id,
            )
        }

    @Provides
    @Singleton
    fun providePushRegistrar(
        sessionStore: SessionStore,
        installations: PushInstallationStore,
        tokens: PushTokens,
        access: NotificationAccess,
        devices: PushDevices,
        description: DeviceDescription,
        @ApplicationScope scope: CoroutineScope,
    ): PushRegistrar = PushRegistrar(sessionStore, installations, tokens, access, devices, description, scope)

    @Provides
    fun providePushSignOut(registrar: PushRegistrar): PushSignOut = registrar

    @Provides
    @Singleton
    fun providePushPermissionPrompt(
        access: NotificationAccess,
        tokens: PushTokens,
        registrar: PushRegistrar,
        @DeviceSdkInt sdkInt: Int,
    ): PushPermissionPrompt = PushPermissionPrompt(access, tokens, registrar::refresh, sdkInt)
}
