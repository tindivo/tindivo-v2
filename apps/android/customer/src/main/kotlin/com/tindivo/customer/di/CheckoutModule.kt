package com.tindivo.customer.di

import android.content.Context
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.core.network.AddressRepository
import com.tindivo.core.network.CheckoutRepository
import com.tindivo.core.network.GeneratedJson
import com.tindivo.core.network.PhoneRepository
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.feature.checkout.ApiAttemptLookup
import com.tindivo.customer.feature.checkout.DataStoreLedgerStore
import com.tindivo.customer.feature.checkout.LedgerSerializer
import com.tindivo.customer.feature.checkout.LedgerSnapshot
import com.tindivo.customer.feature.checkout.LostLedgerSnapshot
import com.tindivo.customer.feature.checkout.OrderAttemptLedger
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
import java.time.Clock
import javax.inject.Singleton

private const val LEDGER_FILE = "tindivo_checkout_ledger.json"

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

    /**
     * Un archivo ilegible NO se reemplaza por «vacío»: se marca como perdido (`LostLedgerSnapshot`) y [OrderAttemptLedger]
     * no envía nada hasta que la persona confirme tras ver «Mis pedidos». El `AttemptLookup` es [ApiAttemptLookup]:
     * pregunta al servidor y, ante cualquier duda, responde `unknown` (lo seguro: no reenviar).
     */
    @Provides
    @Singleton
    fun provideOrderAttemptLedger(
        @ApplicationContext context: Context,
        @IoDispatcher io: CoroutineDispatcher,
        clock: Clock,
        checkout: CheckoutRepository,
    ): OrderAttemptLedger =
        OrderAttemptLedger(
            store =
                DataStoreLedgerStore(
                    DataStoreFactory.create(
                        serializer = LedgerSerializer,
                        corruptionHandler =
                            ReplaceFileCorruptionHandler<LedgerSnapshot>(
                                produceNewData = { LostLedgerSnapshot },
                            ),
                        scope = CoroutineScope(io + SupervisorJob()),
                        produceFile = { File(context.filesDir, LEDGER_FILE) },
                    ),
                ),
            lookup = ApiAttemptLookup(checkout),
            clock = { clock.millis() },
        )
}
