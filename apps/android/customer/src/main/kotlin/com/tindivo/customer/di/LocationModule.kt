package com.tindivo.customer.di

import com.tindivo.customer.feature.addresses.FusedLocationSource
import com.tindivo.customer.feature.addresses.GeocoderStreetSuggester
import com.tindivo.customer.feature.addresses.LocationSource
import com.tindivo.customer.feature.addresses.StreetSuggester
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** «Usar mi ubicación» del formulario de dirección: el Fused Location Provider detrás de una interfaz pequeña. */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class LocationModule {
    @Binds
    abstract fun bindLocationSource(source: FusedLocationSource): LocationSource

    /** La calle sugerida desde el mapa: el geocodificador del sistema, sin coste. */
    @Binds
    abstract fun bindStreetSuggester(suggester: GeocoderStreetSuggester): StreetSuggester
}
