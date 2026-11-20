package com.tindivo.customer.di

import com.tindivo.customer.feature.checkout.CheckoutGps
import com.tindivo.customer.feature.checkout.LiveCheckoutGps
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** La lectura de la ubicación del checkout (CUS-CHK-009): la real, con el GPS del teléfono y la configuración. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class CheckoutGpsModule {
    @Binds
    abstract fun bindCheckoutGps(gps: LiveCheckoutGps): CheckoutGps
}
