package com.tindivo.customer.di

import android.content.Context
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.core.network.CourierRepository
import com.tindivo.core.network.GeneratedJson
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.feature.checkout.DataStoreLedgerStore
import com.tindivo.customer.feature.checkout.LedgerSerializer
import com.tindivo.customer.feature.checkout.LedgerSnapshot
import com.tindivo.customer.feature.checkout.LostLedgerSnapshot
import com.tindivo.customer.feature.courier.CourierAttempts
import com.tindivo.customer.feature.courier.CourierGateway
import com.tindivo.customer.feature.courier.RepositoryCourierGateway
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

/** El archivo propio de Entregas: no comparte clave ni registro con el del checkout. */
private const val COURIER_LEDGER_FILE = "tindivo_courier_ledger.json"

@Module
@InstallIn(SingletonComponent::class)
internal object CourierModule {
    @Provides
    @Singleton
    fun provideCourierRepository(
        client: OkHttpClient,
        @IoDispatcher io: CoroutineDispatcher,
    ): CourierRepository {
        GeneratedJson.ensureConfigured()
        return CourierRepository(BuildConfig.API_BASE_URL, client, io)
    }

    @Provides
    fun provideCourierGateway(gateway: RepositoryCourierGateway): CourierGateway = gateway

    /**
     * Una sola instancia para toda la app: el candado por cuenta tiene que ser el mismo para todas las pantallas. Un
     * archivo ilegible no se reemplaza por «vacío»: se marca como perdido y [CourierAttempts] no envía hasta que la
     * persona revise «Mis entregas».
     */
    @Provides
    @Singleton
    fun provideCourierAttempts(
        @ApplicationContext context: Context,
        @IoDispatcher io: CoroutineDispatcher,
        clock: Clock,
    ): CourierAttempts =
        CourierAttempts(
            store =
                DataStoreLedgerStore(
                    DataStoreFactory.create(
                        serializer = LedgerSerializer,
                        corruptionHandler =
                            ReplaceFileCorruptionHandler<LedgerSnapshot>(produceNewData = { LostLedgerSnapshot }),
                        scope = CoroutineScope(io + SupervisorJob()),
                        produceFile = { File(context.filesDir, COURIER_LEDGER_FILE) },
                    ),
                ),
            clock = { clock.millis() },
        )
}
