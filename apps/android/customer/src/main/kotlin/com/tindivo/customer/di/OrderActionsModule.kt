package com.tindivo.customer.di

import com.tindivo.customer.feature.orders.ApiOrderCanceller
import com.tindivo.customer.feature.orders.OrderCanceller
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** Lo que el cliente hace con un pedido ya creado (cancelarlo) va por la API, atado a la cuenta. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class OrderActionsModule {
    @Binds
    abstract fun bindOrderCanceller(canceller: ApiOrderCanceller): OrderCanceller
}
