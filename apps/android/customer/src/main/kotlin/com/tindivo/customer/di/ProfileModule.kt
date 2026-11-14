package com.tindivo.customer.di

import com.tindivo.customer.feature.profile.ProfileGateway
import com.tindivo.customer.feature.profile.RepositoryProfileGateway
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
object ProfileModule {
    /** Perfil y términos por el repositorio del cliente, cada llamada atada a su cuenta. */
    @Provides
    fun provideProfileGateway(gateway: RepositoryProfileGateway): ProfileGateway = gateway
}
