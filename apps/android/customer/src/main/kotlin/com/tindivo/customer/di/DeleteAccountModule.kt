package com.tindivo.customer.di

import android.content.Context
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.core.network.CustomerRepository
import com.tindivo.customer.feature.deleteaccount.AccountDeleter
import com.tindivo.customer.feature.deleteaccount.DataStorePendingCleanupJournal
import com.tindivo.customer.feature.deleteaccount.PendingCleanupJournal
import com.tindivo.customer.feature.deleteaccount.PendingCleanupSerializer
import com.tindivo.customer.feature.deleteaccount.PendingCleanupSnapshot
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import java.io.File
import javax.inject.Singleton

private const val PENDING_CLEANUP_FILE = "tindivo_deleted_accounts.json"

@Module
@InstallIn(SingletonComponent::class)
object DeleteAccountModule {
    /** El borrado real: atado a la cuenta y sin reintentos (ver `CustomerRepository.deleteAccount`). */
    @Provides
    fun provideAccountDeleter(customer: CustomerRepository): AccountDeleter = AccountDeleter(customer::deleteAccount)

    /** Un archivo ilegible se reemplaza por «nada pendiente» (ver `PendingCleanupSerializer`). */
    @Provides
    @Singleton
    fun providePendingCleanupJournal(
        @ApplicationContext context: Context,
        @IoDispatcher io: CoroutineDispatcher,
    ): PendingCleanupJournal =
        DataStorePendingCleanupJournal(
            DataStoreFactory.create(
                serializer = PendingCleanupSerializer,
                corruptionHandler =
                    ReplaceFileCorruptionHandler<PendingCleanupSnapshot>(
                        produceNewData = { PendingCleanupSnapshot() },
                    ),
                scope = CoroutineScope(io + SupervisorJob()),
                produceFile = { File(context.filesDir, PENDING_CLEANUP_FILE) },
            ),
        )
}
