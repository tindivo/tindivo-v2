package com.tindivo.customer.feature.checkout

import androidx.compose.runtime.Composable
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import com.tindivo.customer.feature.addresses.AddressFormViewModel
import com.tindivo.customer.feature.phone.PhoneVerifyViewModel
import com.tindivo.customer.feature.profile.ProfileViewModel
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SignInResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/** Una sesión abierta con [userId] que la prueba no cambia. */
internal class SheetTestSession(
    userId: String,
) : SessionStore {
    private val mutable = MutableStateFlow<SessionState>(SessionState.SignedIn(userId))
    override val state: StateFlow<SessionState> = mutable.asStateFlow()

    override suspend fun accessToken(): String? = null

    override suspend fun refresh(): String? = null

    override suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
    ): SignInResult = SignInResult.Failed

    override suspend fun signOut() {
        mutable.value = SessionState.SignedOut
    }

    override suspend fun signOutIf(accountId: String): Boolean {
        if ((mutable.value as? SessionState.SignedIn)?.userId != accountId) return false
        signOut()
        return true
    }
}

/** El libro de intentos en memoria: las hojas no envían pedidos, pero el checkout real lo necesita. */
internal class SheetTestLedgerStore : LedgerStore {
    @Volatile private var ledger = Ledger()

    override suspend fun read() = ledger

    override suspend fun write(ledger: Ledger) {
        this.ledger = ledger
    }
}

internal object NoAttempts : AttemptLookup {
    override suspend fun lookup(
        key: UUID,
        accountId: String,
    ): LookupResult = LookupResult.NotFound
}

/**
 * El ciclo de vida que ven las hojas (`collectAsStateWithLifecycle`). Bajarlo a `CREATED` congela lo que la hoja
 * compuso: el ViewModel sigue trabajando, pero su efecto no ve el resultado hasta volver a `RESUMED`. Así la prueba
 * deja el éxito publicado y aún sin entregar, el hueco de CAX-005, todo lo que haga falta. Solo en el hilo principal.
 */
internal class SheetTestLifecycle : LifecycleOwner {
    private val registry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = registry

    fun moveTo(state: Lifecycle.State) {
        registry.currentState = state
    }
}

/**
 * Los ViewModels de las hojas, armados a mano y guardados con la clave de la apertura en el `ViewModelStore` de la
 * actividad (como Hilt los guarda en el de la navegación): sobreviven a recrear la actividad. [created] dice cuántos
 * se construyeron; [served] qué clave y qué instancia recibió cada composición.
 */
internal class ManualSheetModels(
    private val newAddress: (editingId: String?) -> AddressFormViewModel,
    private val newPhone: () -> PhoneVerifyViewModel,
    private val newProfile: () -> ProfileViewModel,
) : CheckoutSheetModels {
    val created = CopyOnWriteArrayList<ViewModel>()
    val served = CopyOnWriteArrayList<Pair<String, ViewModel>>()

    @Composable
    override fun address(
        key: String,
        editingId: String?,
    ): AddressFormViewModel =
        viewModel(key = key) { newAddress(editingId).also { created += it } }.also { served += key to it }

    @Composable
    override fun phone(key: String): PhoneVerifyViewModel =
        viewModel(key = key) { newPhone().also { created += it } }.also { served += key to it }

    @Composable
    override fun profile(key: String): ProfileViewModel =
        viewModel(key = key) { newProfile().also { created += it } }.also { served += key to it }
}
