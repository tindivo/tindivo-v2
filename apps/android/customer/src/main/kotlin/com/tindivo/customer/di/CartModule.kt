package com.tindivo.customer.di

import android.content.Context
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import com.tindivo.customer.feature.cart.CartSerializer
import com.tindivo.customer.feature.cart.CartSnapshot
import com.tindivo.customer.feature.cart.CartStore
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

private const val CART_FILE = "tindivo_cart.json"

@Module
@InstallIn(SingletonComponent::class)
object CartModule {
    /** Un archivo ilegible se reemplaza por «sin bolsa»: la persona vuelve a elegir, no se queda con la app rota. */
    @Provides
    @Singleton
    fun provideCartStore(
        @ApplicationContext context: Context,
        @IoDispatcher io: CoroutineDispatcher,
    ): CartStore =
        CartStore(
            DataStoreFactory.create(
                serializer = CartSerializer,
                corruptionHandler = ReplaceFileCorruptionHandler<CartSnapshot?>(produceNewData = { null }),
                scope = CoroutineScope(io + SupervisorJob()),
                produceFile = { File(context.filesDir, CART_FILE) },
            ),
        )
}
