package com.tindivo.customer.feature.deleteaccount

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tindivo.customer.R
import com.tindivo.customer.session.SessionState
import com.tindivo.customer.session.SessionStore
import com.tindivo.customer.session.SignInResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

private const val B = "cuenta-b"

/**
 * CAX-003: el aviso «Tu cuenta fue borrada» ya decidió mostrarse; entra B (o entra y sale) mientras lo observado de la
 * sesión (`changes`) sigue atrasado. Si el composable se vuelve a componer en ese hueco, consulta la sesión vigente y el
 * diálogo desaparece: no reutiliza el «mostrar» de antes.
 *
 * Con [AccountDeletedNoticeContent] y el [AccountDeletedNoticeViewModel] reales sobre un doble de la sesión. `changes`
 * se pasa FIJO (el valor de antes de que entre B) y la recomposición se fuerza con un estado aparte ([force]) que lee
 * la decisión: así se recompone el composable sin que `changes` cambie.
 */
@RunWith(AndroidJUnit4::class)
class AccountDeletedNoticeContentTest {
    @get:Rule
    val compose = createComposeRule()

    private val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val session = NoticeTestSession()
    private val models = ViewModelStore()
    private val force = mutableIntStateOf(0)

    /** Con qué valor de [force] se pidió cada decisión. */
    private val decisions = CopyOnWriteArrayList<Int>()
    private val staleCalls = AtomicInteger()
    private lateinit var notice: AccountDeletedNoticeViewModel

    private val title get() = text(R.string.delete_account_done_title)

    @After
    fun tearDown() {
        compose.runOnIdle { models.clear() }
    }

    @Test
    fun entraB_conChangesAtrasado_alRecomponerNoHayAviso() = hiddenAfter { session.switchTo(B) }

    @Test
    fun entraYSaleB_conChangesAtrasado_alRecomponerNoHayAviso() =
        hiddenAfter {
            session.switchTo(B)
            session.switchToSignedOut()
        }

    private fun hiddenAfter(signInMeanwhile: () -> Unit) {
        val stored = session.signInGeneration.value
        val factory = viewModelFactory { initializer { AccountDeletedNoticeViewModel(session) } }
        compose.runOnIdle { notice = ViewModelProvider(models, factory)[AccountDeletedNoticeViewModel::class.java] }
        // Lo observado antes de que entre B; no se actualiza en toda la prueba.
        val behind = notice.changes.value
        compose.setContent {
            AccountDeletedNoticeContent(
                stored = stored,
                changes = behind,
                visibility = {
                    decisions += force.intValue
                    notice.visibility(stored)
                },
                onStale = { staleCalls.incrementAndGet() },
                onDismiss = {},
            )
        }

        // 1. Sin nadie que entre: se muestra.
        compose.onNodeWithText(title).assertIsDisplayed()
        assertEquals(0, staleCalls.get())

        // 2. Entra B (o entra y sale) sin que `changes` cambie; se fuerza la recomposición.
        signInMeanwhile()
        compose.runOnIdle { force.intValue++ }
        compose.waitForIdle()

        // 3. El diálogo ya no está, y la decisión se volvió a pedir en esa recomposición.
        compose.onNodeWithText(title).assertDoesNotExist()
        assertTrue(decisions.toString(), decisions.contains(1))
        assertEquals(1, staleCalls.get())
    }

    private fun text(
        @StringRes id: Int,
    ): String = context.getString(id)
}

/**
 * Una sesión que la prueba cambia a mano. Como el almacén real: una entrada muestra la cuenta y después sube la
 * generación.
 */
private class NoticeTestSession : SessionStore {
    private val mutableState = MutableStateFlow<SessionState>(SessionState.SignedOut)
    override val state: StateFlow<SessionState> = mutableState.asStateFlow()
    private val signIns = MutableStateFlow(0L)
    override val signInGeneration: StateFlow<Long> = signIns.asStateFlow()

    fun switchTo(userId: String) {
        mutableState.value = SessionState.SignedIn(userId)
        signIns.value += 1
    }

    fun switchToSignedOut() {
        mutableState.value = SessionState.SignedOut
    }

    override suspend fun accessToken(): String? = null

    override suspend fun refresh(): String? = null

    override suspend fun signInWithGoogle(
        idToken: String,
        rawNonce: String,
    ): SignInResult = SignInResult.Failed

    override suspend fun signOut() {
        switchToSignedOut()
    }

    override suspend fun signOutIf(accountId: String): Boolean {
        if ((mutableState.value as? SessionState.SignedIn)?.userId != accountId) return false
        switchToSignedOut()
        return true
    }

    override suspend fun signOutLocally(accountId: String): Boolean = signOutIf(accountId)
}
