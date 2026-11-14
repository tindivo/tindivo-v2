package com.tindivo.customer.di

import android.content.Context
import com.tindivo.customer.push.PushInstallationStore
import com.tindivo.customer.push.PushNotifier
import com.tindivo.customer.push.SharedPrefsTrackingMarkStore
import com.tindivo.customer.push.TrackingLedger
import com.tindivo.customer.push.TrackingPresenter
import com.tindivo.customer.session.SessionPublishLock
import com.tindivo.customer.session.SessionStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** La puerta única de los avisos de seguimiento: solo se pinta lo de la sesión actual y lo más nuevo. */
@Module
@InstallIn(SingletonComponent::class)
object TrackingModule {
    /** Las marcas del seguimiento (versión del estado y si terminó) sobreviven al proceso. */
    @Provides
    @Singleton
    fun provideTrackingLedger(
        @ApplicationContext context: Context,
    ): TrackingLedger = TrackingLedger(SharedPrefsTrackingMarkStore(context))

    /** La única puerta por la que se pinta o se quita algo de la bandeja: solo avisos de la sesión actual. */
    @Provides
    @Singleton
    fun provideTrackingPresenter(
        sessionStore: SessionStore,
        installations: PushInstallationStore,
        ledger: TrackingLedger,
        notifier: PushNotifier,
        publishLock: SessionPublishLock,
    ): TrackingPresenter = TrackingPresenter(sessionStore, installations, ledger, notifier, publishLock)
}
