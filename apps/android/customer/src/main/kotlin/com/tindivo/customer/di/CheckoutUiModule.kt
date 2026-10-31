package com.tindivo.customer.di

import com.tindivo.customer.feature.checkout.QuoteDebounce
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.delay

private const val QUOTE_DEBOUNCE_MILLIS = 350L

@Module
@InstallIn(SingletonComponent::class)
object CheckoutUiModule {
    /** Espera antes de recotizar tras un cambio, para no pedir una cotización por cada toque seguido. */
    @Provides
    fun provideQuoteDebounce(): QuoteDebounce = QuoteDebounce { delay(QUOTE_DEBOUNCE_MILLIS) }
}
