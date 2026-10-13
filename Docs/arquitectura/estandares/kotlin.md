# Estándares · Kotlin (app de clientes para Android)

> Verificado: 2026-10-12 · entorno: `develop@591ec569` · Parte de `Docs/arquitectura/estandares/` (niveles y excepciones: `README.md`)

Aplica a `apps/customer-android/`. Las reglas comunes a iOS y Android (CLI) y las transversales están en `README.md`. Plan del producto: `Docs/planes/movil/`.

## Reglas

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| KT-1 | **Plataforma**: Kotlin y Jetpack Compose; `minSdk` 26, Android 8 (D-47); `targetSdk` el que exija Google Play: desde el 31-08-2026, API 36 para apps nuevas y actualizaciones; `compileSdk` igual o superior. Gradle con Kotlin DSL y catálogo de versiones (`gradle/libs.versions.toml`) | OBLIGATORIA | Configuración + CI |
| KT-2 | **Estructura**: módulos `:app`, `:core:network` (cliente generado e interceptores) y `:core:designsystem`. Las funcionalidades viven en paquetes `<paquete raíz>.feature.<funcionalidad>` dentro de `:app` (paquete raíz según DA-12); se extraen a módulo cuando el tiempo de compilación lo pida | OBLIGATORIA | Revisión |
| KT-3 | **Pantallas**: una sola actividad; Navigation Compose con rutas tipadas; un `ViewModel` por pantalla que expone `StateFlow<UiState>` inmutable (`data class` o `sealed interface`) y recibe eventos. Los composables no guardan estado, salvo el de UI local (`remember`) | OBLIGATORIA | Revisión + tests del ViewModel |
| KT-4 | **Dependencias con Hilt**: constructores con `@Inject`; los dispatchers se inyectan (`@IoDispatcher`), nunca `Dispatchers.IO` fijo dentro de una clase | OBLIGATORIA | Revisión |
| KT-5 | **Corrutinas**: `viewModelScope` o el alcance que corresponda; prohibidos `GlobalScope` y `runBlocking` fuera de tests; `runCatching` no se usa en código con corrutinas sin relanzar `CancellationException`; Flow para flujos de datos | OBLIGATORIA | detekt + revisión |
| KT-6 | **Errores**: `sealed interface AppError` traduce los `code` de RFC 9457 conocidos y tiene `Unknown(code, detail)` (CLI-2). Prohibidos `!!` y `lateinit` en ViewModels; prohibido capturar `Exception` sin manejarla | OBLIGATORIA | detekt (`!!` como error) |
| KT-7 | **Cliente HTTP**: OpenAPI Generator (generador `kotlin`, librería por defecto `jvm-okhttp4`) con su plugin de Gradle en `:core:network`, `serializationLibrary=kotlinx_serialization` y `enumUnknownDefaultCase=true`. Según la documentación del generador, con kotlinx.serialization el caso de reserva cubre los enums de texto (los nuestros) y solo Moshi cubre todos: CLI-2 se da por cumplida cuando su test pasa. `Json { ignoreUnknownKeys = true }`. Las cabeceras de CLI-3, el token y la `Idempotency-Key` van en interceptores de OkHttp, nunca en cada llamada | OBLIGATORIA | CI en cada PR (D-48): `sync-openapi.sh --check`, generación y test de CLI-2 |
| KT-8 | **Dinero**: `BigDecimal(String)`; formato con `NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-PE"))`; nunca `Double` | OBLIGATORIA | detekt + test |
| KT-9 | **Datos locales**: preferencias en DataStore; tokens cifrados con Tink (AEAD) y la clave en el Android Keystore. `EncryptedSharedPreferences` no se usa: todo `androidx.security:security-crypto` quedó deprecado en la versión 1.1.0. Carrito y clave de idempotencia (CLI-6) en DataStore; el catálogo, con la caché HTTP de OkHttp | OBLIGATORIA | Revisión |
| KT-10 | **Push**: el SDK de Firebase Messaging solo en `PushService`. Canales `orders` (importancia alta) y `offers` (importancia por defecto), creados al arrancar, con identificadores estables que no se renombran: una vez creado un canal, su importancia la controla el usuario. `POST_NOTIFICATIONS` según CLI-11. Token registrado con la ruta de dispositivos que fije el contrato (paso 5; hoy solo existe el registro de Web Push) | OBLIGATORIA | Revisión + test |
| KT-11 | **Deep links**: App Links verificados (`/.well-known/assetlinks.json` en el dominio de DA-11); un único `DeepLinkRouter` para enlaces y payloads de push | OBLIGATORIA | Test del router |
| KT-12 | **UI**: solo Compose; tema Material 3 de `:core:designsystem`; textos en `res/values/strings.xml`, en español como idioma por defecto; `contentDescription` en imágenes con significado; `@Preview` en cada componente del sistema de diseño | OBLIGATORIA | Android Lint |
| KT-13 | **Pruebas**: JUnit con `kotlinx-coroutines-test` para ViewModels y repositorios; decodificación con los fixtures de `packages/contracts/fixtures/` (por crear); pruebas de UI de Compose para el flujo crítico (TST-6) | OBLIGATORIA | CI |
| KT-14 | **Estilo**: ktlint con el estilo `ktlint_official`; detekt con umbrales alineados con TS-3 (archivo 300 líneas, función 80, complejidad 15, como alerta) y `!!` como error; Android Lint con línea base solo para lo existente: nada nuevo entra en la línea base | OBLIGATORIA | CI |
| KT-15 | **Configuración**: tipos de compilación `debug` y `release`; sabores `dev` y `prod` (URL base de la API en `BuildConfig`); ningún secreto en el APK; `versionCode` creciente, lo pone la CI; `versionName` semántica; R8 activado en `release`; firma con Play App Signing | OBLIGATORIA | Revisión |
| KT-16 | **Dependencias**: cada librería de terceros se pide en `Docs/trabajo/decisiones-abiertas.md` y Jesús la aprueba antes de añadirla. Lista inicial: Compose (BOM), Navigation Compose, Hilt, OkHttp, kotlinx.serialization, DataStore, Tink, Firebase Messaging, la herramienta de *crashes* (DA-08) y el SDK de Supabase para Kotlin (solo Auth, si DA-01 lo confirma) | OBLIGATORIA | Revisión de `libs.versions.toml` |

## Estructura

```
apps/customer-android/
├── AGENTS.md
├── settings.gradle.kts
├── gradle/libs.versions.toml
├── app/src/main/kotlin/<paquete raíz>/
│   ├── TindivoApp.kt          # @HiltAndroidApp; crea los canales de notificación (KT-10)
│   ├── MainActivity.kt        # una actividad, NavHost
│   ├── navigation/            # rutas tipadas, DeepLinkRouter
│   ├── feature/
│   │   ├── home/              # contenido servido por la API (DES-8)
│   │   ├── catalog/
│   │   ├── cart/
│   │   ├── checkout/          # confirmar el pedido
│   │   ├── orders/
│   │   ├── account/           # direcciones, consentimientos, borrado de cuenta
│   │   └── update/            # actualización obligatoria (CLI-4)
│   ├── session/               # SessionStore
│   ├── push/                  # PushService
│   └── config/                # ConfigService
├── core/network/              # contrato copiado, generador, interceptores
└── core/designsystem/
```

## Ejemplo: ViewModel (KT-3, KT-5, KT-6)

Ilustrativo.

```kotlin
sealed interface CheckoutUiState {
    data object Idle : CheckoutUiState
    data object Submitting : CheckoutUiState
    data class Placed(val orderId: String) : CheckoutUiState
    data class Failed(val error: AppError) : CheckoutUiState
}

@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val orders: OrdersRepository, // gestiona la Idempotency-Key de la intención (CLI-6)
) : ViewModel() {
    private val _state = MutableStateFlow<CheckoutUiState>(CheckoutUiState.Idle)
    val state: StateFlow<CheckoutUiState> = _state.asStateFlow()

    fun confirm(cart: Cart) {
        if (_state.value is CheckoutUiState.Submitting) return
        viewModelScope.launch {
            _state.value = CheckoutUiState.Submitting
            _state.value = when (val result = orders.place(cart)) {
                is PlaceOrderResult.Placed -> CheckoutUiState.Placed(result.orderId)
                is PlaceOrderResult.Failed -> CheckoutUiState.Failed(result.error)
            }
        }
    }
}
```

## Ejemplo: canales de notificación (KT-10)

```kotlin
object NotificationChannels {
    const val ORDERS = "orders" // estable: no se renombra
    const val OFFERS = "offers" // estable: no se renombra

    fun create(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(ORDERS, context.getString(R.string.channel_orders), NotificationManager.IMPORTANCE_HIGH),
                NotificationChannel(OFFERS, context.getString(R.string.channel_offers), NotificationManager.IMPORTANCE_DEFAULT),
            ),
        )
    }
}
```
