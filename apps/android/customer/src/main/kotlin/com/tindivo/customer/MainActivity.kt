package com.tindivo.customer

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.tindivo.core.designsystem.TindivoTheme
import com.tindivo.customer.config.ConfigService
import com.tindivo.customer.navigation.AppNavHost
import com.tindivo.customer.navigation.DeepLinkInbox
import com.tindivo.customer.navigation.pushTargetFrom
import com.tindivo.customer.push.PUSH_EXTRA_KEYS
import com.tindivo.customer.push.PUSH_EXTRA_KEYS_TO_CLEAR
import com.tindivo.customer.push.TrackingReconciler
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject
    lateinit var configService: ConfigService

    @Inject
    lateinit var deepLinks: DeepLinkInbox

    @Inject
    lateinit var trackingReconciler: TrackingReconciler

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Abierta desde un aviso. Al recrearse (girar, volver tras morir el proceso) el intent es el mismo: no se repite.
        if (savedInstanceState == null) handlePushIntent(intent)
        // La app solo tiene tema claro: iconos oscuros en las dos barras aunque el teléfono esté en modo oscuro (por
        // defecto enableEdgeToEdge los pone claros y desaparecen sobre el crema).
        val lightBars = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = lightBars, navigationBarStyle = lightBars)
        // CLI-4: STARTED = la app en primer plano; cubre abrirla y volver a ella. Ahí también se ponen al día las
        // notificaciones fijas del seguimiento (un aviso que no llegó, p. ej. en Xiaomi con ahorro de batería).
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { trackingReconciler.reconcile() }
                configService.refresh()
            }
        }
        setContent {
            TindivoTheme {
                AppNavHost()
            }
        }
    }

    // Un aviso tocado con la app abierta (el que pinta la app llega con SINGLE_TOP).
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handlePushIntent(intent)
    }

    /**
     * Lee SOLO las claves del payload v1 (las mismas venga el aviso del sistema o de la app) y las quita del intent para
     * no atenderlas dos veces. Lo que no es un payload válido no abre nada. Abrir desde «Recientes» reentrega el intent
     * viejo: ese no cuenta.
     */
    private fun handlePushIntent(intent: Intent?) {
        if (intent == null || (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return
        val data =
            try {
                val extras = intent.extras ?: return
                PUSH_EXTRA_KEYS.mapNotNull { key -> extras.getString(key)?.let { key to it } }.toMap()
            } catch (_: RuntimeException) {
                // La actividad es el lanzador (exportada): otra app puede mandarle extras que no se pueden leer
                // (BadParcelableException). Eso no abre nada ni tumba la app.
                return
            }
        if (data.isEmpty()) return
        PUSH_EXTRA_KEYS_TO_CLEAR.forEach(intent::removeExtra)
        pushTargetFrom(data)?.let(deepLinks::offer)
    }
}
