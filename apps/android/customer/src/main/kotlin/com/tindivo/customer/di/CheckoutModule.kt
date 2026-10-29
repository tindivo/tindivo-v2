package com.tindivo.customer.di

import android.content.Context
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.CheckoutRepository
import com.tindivo.core.network.GeneratedJson
import com.tindivo.core.network.PhoneRepository
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.feature.checkout.DataStorePendingAttemptStore
import com.tindivo.customer.feature.checkout.IdempotencyKeys
import com.tindivo.customer.feature.checkout.PendingAttemptSerializer
import com.tindivo.customer.feature.checkout.PendingAttemptSnapshot
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
import javax.inject.Singleton

private const val ATTEMPT_FILE = "tindivo_checkout_attempt.json"

@Module
@InstallIn(SingletonComponent::class)
object CheckoutModule {
    @Provides
    @Singleton
    fun provideCheckoutRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): CheckoutRepository {
        GeneratedJson.ensureConfigured()
        return CheckoutRepository(BuildConfig.API_BASE_URL, client, io)
    }

    @Provides
    @Singleton
    fun provideAddressRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): AddressRepository {
        GeneratedJson.ensureConfigured()
        return AddressRepository(BuildConfig.API_BASE_URL, client, io)
    }

    @Provides
    @Singleton
    fun providePhoneRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): PhoneRepository {
        GeneratedJson.ensureConfigured()
        return PhoneRepository(BuildConfig.API_BASE_URL, client, io)
    }

    /** Un archivo ilegible se reemplaza por «sin intento»: la siguiente clave será nueva. */
    @Provides
    @Singleton
    fun provideIdempotencyKeys(
        @ApplicationContext context: Context,
        @IoDispatcher io: CoroutineDispatcher,
    ): IdempotencyKeys =
        IdempotencyKeys(
            DataStorePendingAttemptStore(
                DataStoreFactory.create(
                    serializer = PendingAttemptSerializer,
                    corruptionHandler =
                        ReplaceFileCorruptionHandler<PendingAttemptSnapshot?>(
                            produceNewData = { null },
                        ),
                    scope = CoroutineScope(io + SupervisorJob()),
                    produceFile = { File(context.filesDir, ATTEMPT_FILE) },
                ),
            ),
        )
}
