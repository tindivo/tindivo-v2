package com.tindivo.customer.di

import com.tindivo.core.network.CustomerRepository
import com.tindivo.customer.feature.deleteaccount.AccountDeleter
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
object DeleteAccountModule {
    /** El borrado real: atado a la cuenta y sin reintentos (ver `CustomerRepository.deleteAccount`). */
    @Provides
    fun provideAccountDeleter(customer: CustomerRepository): AccountDeleter = AccountDeleter(customer::deleteAccount)
}
