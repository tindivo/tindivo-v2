package com.tindivo.customer.di

import com.tindivo.core.network.ApiResult
import com.tindivo.core.network.CustomerRepository
import com.tindivo.customer.navigation.DeepLinkInbox
import com.tindivo.customer.navigation.OrderLookup
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** Los avisos tocados (KT-11): el buzón entre la actividad y la navegación, y la búsqueda del pedido por su código. */
@Module
@InstallIn(SingletonComponent::class)
object DeepLinkModule {
    @Provides
    @Singleton
    fun provideDeepLinkInbox(): DeepLinkInbox = DeepLinkInbox()

    /** La primera página de «Mis pedidos», atada a la cuenta: un aviso es de un pedido reciente. */
    @Provides
    fun provideOrderLookup(customer: CustomerRepository): OrderLookup =
        OrderLookup { shortId, accountId ->
            when (val page = customer.orders(cursor = null, accountId = accountId)) {
                is ApiResult.Success -> page.data.items.firstOrNull { it.shortId.equals(shortId, ignoreCase = true) }
                is ApiResult.Failure -> null
            }?.id?.toString()
        }
}
