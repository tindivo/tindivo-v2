package com.tindivo.customer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.navigation.AppNavHost
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject
    lateinit var configService: ConfigService

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // CLI-4: STARTED = la app en primer plano; cubre abrirla y volver a ella.
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) { configService.refresh() }
        }
        setContent {
            TindivoTheme {
                AppNavHost()
            }
        }
    }
}
