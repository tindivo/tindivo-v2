package com.tindivo.customer.di

import android.content.Context
import com.tindivo.customer.BuildConfig
import com.tindivo.customer.session.EncryptedSessionFile
import com.tindivo.customer.session.LazyAead
import com.tindivo.customer.session.SessionFile
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.createSessionAead
import com.tindivo.customer.session.createSupabaseSessionStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import java.io.File
import java.time.Clock
import javax.inject.Singleton

/** El archivo de la sesión vive en `noBackupFilesDir`: Android no lo copia a la nube ni a otro aparato. */
private const val SESSION_FILE_NAME = "tindivo_session.bin"

@Module
@InstallIn(SingletonComponent::class)
object SessionModule {
    @Provides
    @Singleton
    fun provideSessionFile(
        @ApplicationContext context: Context,
    ): SessionFile =
        EncryptedSessionFile(
            file = File(context.noBackupFilesDir, SESSION_FILE_NAME),
            aead = LazyAead { createSessionAead(context) },
        )

    @Provides
    @Singleton
    fun provideSessionStore(
        file: SessionFile,
        clock: Clock,
        @ApplicationScope scope: CoroutineScope,
        @IoDispatcher io: CoroutineDispatcher,
    ): SessionStore =
        createSupabaseSessionStore(
            url = BuildConfig.SUPABASE_URL,
            publishableKey = BuildConfig.SUPABASE_PUBLISHABLE_KEY,
            file = file,
            clock = clock,
            scope = scope,
            io = io,
        )
}
