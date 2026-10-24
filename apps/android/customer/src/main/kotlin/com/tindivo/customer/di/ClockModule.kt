package com.tindivo.customer.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.time.Clock

@Module
@InstallIn(SingletonComponent::class)
object ClockModule {
    // La zona da igual: `DishWindow` convierte el instante a hora de Lima.
    @Provides
    fun provideClock(): Clock = Clock.systemUTC()
}
