# Apps nativas: cómo está construida la app cliente y cómo se construye la de iOS

> Verificado: 2026-11-17 · entorno: develop@0d0f7486 (código de `apps/android/`, solo lectura; no se compiló ni se ejecutó nada)
> Describe lo que **hay** en Android hoy. La parte de iOS es una **propuesta** (§10): no hay código iOS en el repo.
> **Decisión de Jesús, 2026-11-17: Android e iOS se lanzan juntos, en la misma fecha.** La paridad se asegura con vectores de conformidad JSON compartidos (§8), que hay que crear. Recortes del lanzamiento: Store, promociones y traslado de celular.
> Reglas de código por lenguaje: `estandares/kotlin.md` y `estandares/swift.md`. Qué hace cada pantalla:
> `Docs/planes/app-cliente/`. Contrato de red: `Docs/planes/movil/contrato-rest.md` y `packages/contracts/openapi/v1.json`.

## 1. Idea en cinco líneas

1. La app nativa **no tiene lógica de servidor**: todo importe, plazo y permiso lo decide la API; la app muestra, valida
   lo barato en el cliente para no mandar basura y **nunca contradice al servidor** (DES-5).
2. El **contrato** es `packages/contracts/openapi/v1.json`; cada app lo copia (`scripts/sync-openapi.sh`) y **genera**
   su cliente. No hay DTOs escritos a mano (CLI-1).
3. Cada **pantalla** es: una vista sin lógica + un modelo de estado (ViewModel) + reglas puras que se prueban sin
   Android/iOS.
4. Hay **una carpeta por área de requisito** (`feature/<área>`), con el mismo nombre de área que la spec (§9).
5. iOS se construye con **la misma forma**: lo que cambia es el lenguaje y el framework, no la estructura (§10, §11). No va «después»: sale con Android, el mismo día.

## 2. Módulos

`apps/android/settings.gradle.kts` incluye tres módulos Gradle:

| Módulo | Tipo | Responsabilidad | No hace |
|---|---|---|---|
| `:customer` | aplicación Android (`com.tindivo.customer`; sabores `dev` y `prod`) | Actividad única, navegación, sesión, features, inyección (Hilt), configuración remota | No habla HTTP directamente: usa los repositorios de `:core:network` |
| `:core:network` | módulo Kotlin/JVM puro (sin Android) | Cliente generado del OpenAPI, repositorios por área, interceptores, traducción de errores (`AppError`) | No conoce la sesión ni el SDK de Auth: recibe un `AccessTokenSource` |
| `:core:designsystem` | librería Android | Tema Material 3 de Tindivo, tipografía, formas, espaciados, componentes y estados de pantalla | No contiene pantallas ni lógica de negocio |

Versiones exactas en `apps/android/gradle/libs.versions.toml` (única fuente; cambiarlas es un cambio aparte, KT-16):
Kotlin 2.4.20, AGP 9.4.1, Compose BOM 2026.09.00, Navigation Compose, Hilt, OkHttp 5.5.0, Coil 3, kotlinx.serialization,
DataStore y Tink. `minSdk` 26, `targetSdk` 36 (`apps/android/customer/build.gradle.kts`).

**Frontera de dependencias** (DES-1, DES-2): `:customer` depende de `:core:network` y `:core:designsystem`; ninguno de
los dos depende de `:customer`. El SDK de un proveedor (Auth, mapa, ubicación) solo se importa dentro de la pieza que lo
envuelve (§6 para la sesión).

## 3. Capas dentro de una feature

Cada carpeta `customer/src/main/kotlin/com/tindivo/customer/feature/<área>/` repite las mismas capas. Ejemplo,
`feature/checkout` (confirmar el pedido):

| Capa | Qué es | Ejemplos en `feature/checkout` | ¿Se prueba sin Android? |
|---|---|---|---|
| **Screen** | `@Composable` que **solo lee** el estado y **envía acciones**; sin reglas de negocio | `CheckoutScreen`, `CheckoutDeliverySection`, `CheckoutPaymentSection`, `CheckoutTotalsSection`, `CheckoutBottomBar`, `CheckoutSheets` | Con pruebas de UI de Compose (hojas y CTA) |
| **Destination** | Enlaza Screen con su ViewModel y con la navegación; recibe las salidas como lambdas | `CheckoutDestination`, `CheckoutActions` (qué pasa al volver, abrir pedido, iniciar sesión) | — |
| **ViewModel + UiState** | `@HiltViewModel` que expone `StateFlow<CheckoutUiState>` inmutable y recibe eventos | `CheckoutViewModel`, `CheckoutUiState` (`CheckoutPhase`, `QuoteStatus`, `CheckoutMessage`) | Sí (JUnit + `kotlinx-coroutines-test`) |
| **Reducers** | Funciones puras `UiState → UiState` que aplican un resultado (una cotización, un cambio de pago) | `CheckoutReducers.kt` (`withQuote`, conciliación del método de pago) | Sí |
| **Reglas puras** | Cálculo y validación sin estado ni Android | `CashRules.kt` (`cashRulesOrNull`, `parseCashInput`, `checkCash`), `PaymentChoice.kt` | Sí (`CashRulesTest`, `PaymentChoiceTest`) |
| **Loader / Gateway** | Carga lo que la pantalla necesita y lo junta (direcciones, perfil, opciones de pago) | `CheckoutLoader`, `ApiAttemptLookup` | Sí, con dobles |
| **Repository** (en `:core:network`) | Una llamada de contrato → `ApiResult<T>`; nunca lanza | `CheckoutRepository.quote`, `.paymentOptions`, `.createOrder` | Sí (MockWebServer) |
| **Textos** | Todo texto visible sale de `res/values/strings.xml`; una función traduce el estado a texto | `CheckoutText.kt` (`CheckoutMessage.text()`, `Cta.label()`) | Sí (`CheckoutUiStateTextTest`) |

Reglas que se cumplen en el código y que iOS debe respetar:

- El ViewModel **no importa nada de Compose**; la Screen **no guarda estado** salvo el local de UI (`remember`) (KT-3).
- Un mismo flujo con riesgo (crear un pedido) se aísla en un objeto con nombre propio, no en el ViewModel:
  `OrderAttemptLedger` decide si se envía, con qué `Idempotency-Key` y cuándo hay que mandar a la persona a «Mis pedidos»
  (persistencia en `LedgerDataStore`).
- Las **cotizaciones se piden con debounce inyectado** (`QuoteDebounce`) y cada resultado se descarta si la cuenta o la
  generación cambiaron mientras tanto: ningún resultado de otra cuenta llega a pantalla.
- Una feature **no importa de otra**: lo común sube a `:core:*` o a `customer/.../feature/` raíz (`SheetClose.kt`).
  (Verificado en la estructura; no se hizo un barrido de imports: **(sin verificar)**.)
- Los dispatchers se inyectan (`@IoDispatcher`, módulo `di/IoDispatcher.kt`); nunca `Dispatchers.IO` fijo (KT-4).

Las features que existen hoy en `customer/.../feature/`: `account`, `addresses`, `cart`, `catalog` (`home`, `business`),
`checkout`, `courier`, `deleteaccount`, `diagnostics` (solo debug), `orders`, `phone`, `profile`, `reviews`, `signin`,
`store`, `update`. No hay `feature/` de notificaciones ni push todavía.

## 4. Navegación

- **Una sola actividad** (`MainActivity`) con **un solo `NavHost`** (`navigation/AppNavHost.kt`) de Navigation Compose
  con **rutas tipadas** (`@Serializable data object CheckoutRoute`, `data class BusinessRoute(id)`).
- El grafo se arma por trozos privados (`catalogGraph`, `accountGraph`, `addressesGraph`, `ordersGraph`) más
  `CourierNavigation.kt` y `StoreNavigation.kt`. Cada `Destination` recibe **lambdas de salida** (`onBack`,
  `onOpenOrder`, `onCheckout`), no el `NavController`: la feature no sabe adónde va.
- La pantalla de inicio es `CatalogHomeRoute` y siempre está debajo en la pila; varios flujos vuelven a ella con
  `popBackStack<CatalogHomeRoute>(inclusive = false)`.
- **Resultado entre pantallas** por `savedStateHandle` con **una clave booleana** (`PROFILE_COMPLETED_KEY`,
  `PHONE_CHANGED_KEY`, `ADDRESSES_CHANGED_KEY`): nada sensible viaja así.
- **Actualización obligatoria (426):** `AppViewModel` observa `ConfigService`; ante `UpgradeRequired` vacía la pila y
  navega a `UpdateRoute` sin vuelta atrás (CLI-4).
- Lo que falta para pedir (dirección, celular, nombre) se resuelve en **hojas dentro del checkout**, no saliendo a otra
  pantalla (`CheckoutSheets.kt`).
- **No hay barra inferior de pestañas** (Inicio, Entregas, Pedidos, Cuenta) hoy: el inicio abre Entregas, Store y
  Cuenta por tarjetas y botones. La barra la pide `Docs/negocio/diseno.md` §Táctil; es trabajo pendiente.
- **No hay `DeepLinkRouter`** todavía (KT-11 lo exige para enlaces y push): **(sin verificar)** más allá de no
  encontrarlo en `navigation/`.

## 5. Estado, datos locales y configuración

| Qué | Dónde | Cómo |
|---|---|---|
| Bolsa | `feature/cart` (`CartStore`, `CartSerializer`, `CartSnapshot`) | `DataStore<CartSnapshot?>`; una bolsa, de un solo restaurante; con «huella» (`fingerprint`) para saber si cambió |
| Intento de pedido (clave de idempotencia) | `feature/checkout` (`OrderAttemptLedger`, `LedgerDataStore`) | Disco, con el intento hasta una respuesta definitiva (CLI-6) |
| Configuración remota | `config/ConfigService`, `AppVersion` | Se refresca en `Lifecycle.State.STARTED`; de ahí salen el 426 y el aviso de Android antiguo |
| Imágenes | `di/ImageModule`, Coil 3 con OkHttp | Caché HTTP; respaldo propio cuando falta la foto |
| Texto | `customer/src/main/res/values/strings.xml` | Español peruano; nada de textos en el código |
| Dinero | `feature/cart/Money.kt` | `BigDecimal` desde la cadena de la API, formato `es-PE`, **nunca `Double`** (KT-8, CLI-5) |

## 6. Sesión y token

La sesión vive **detrás de una interfaz propia** (CLI-7): `session/SessionStore` (`StateFlow<SessionState>` con
`Unknown`, `SignedOut`, `SignedIn(userId)`; `signInGeneration`; `signInWithGoogle`, `signOut`, `signOutIf`,
`signOutLocally`). Es también la fuente del token del cliente HTTP (`AccessTokenSource`).

| Pieza | Archivo | Papel |
|---|---|---|
| Interfaz de Auth sin tipos del SDK | `session/AuthBackend.kt` | `restore`, `signInWithGoogle`, `refresh`, `signOut`, `clear`; el store se prueba sin red |
| Implementación sobre la API REST de Auth | `session/GoTrueAuthBackend.kt` | Usa el OkHttp de la app; sin el SDK de Supabase (decisión D-54, opción REST) |
| Lógica de sesión | `session/SupabaseSessionStore.kt` | **Un único `Mutex`** serializa restaurar, entrar, refrescar y salir (Auth rota el refresh token); refresco proactivo si quedan menos de 60 s |
| Cifrado | `session/SessionAead.kt`, `EncryptedSessionFile.kt` | AES-256-GCM con Tink; clave maestra en el Android Keystore. Si el Keystore falla, la sesión no se guarda: **nunca en claro** |
| Entrada con Google | `feature/signin` (`CredentialManagerGoogleSource`, `GoogleNonce`) | Credential Manager; el nonce en crudo se queda en la app |

**Reglas que viajan a iOS:** un solo candado para toda mutación de sesión; el refresco es transparente y único
(`TokenRefreshGate`: varias peticiones con 401 hacen **un** refresco); un 401 de una llamada cierra la sesión **solo si
sigue siendo la de esa cuenta** (`signOutIf`); un cambio de cuenta a mitad de una petición no la deja salir (§7).

## 7. Cómo se consume la API

`:core:network` (`apps/android/core/network/src/main/kotlin/com/tindivo/core/network/`):

- **Cliente generado**: `build.gradle.kts` genera Kotlin (`jvm-okhttp4`, `kotlinx_serialization`,
  `enumUnknownDefaultCase`) desde `core/network/openapi/v1.json`, copia del contrato. Los modelos no muestran sus campos
  en `toString` (plantilla propia `openapi-templates/data_class.mustache`: llevan nombres, celulares y coordenadas).
- **Un repositorio por área** (`CheckoutRepository`, `CatalogRepository`, `AddressRepository`, `CourierRepository`,
  `StoreRepository`, `PhoneRepository`, `PrepayRepository`, `ReviewRepository`, `SystemRepository`…). Todos devuelven
  `ApiResult<T>` (éxito o `AppError`); **ningún error de red o de lectura sale como excepción**.
- **Interceptores, en este orden** (`TindivoHttp.kt`):
  1. `ClientHeadersInterceptor`: `X-Tindivo-Platform`, `-App`, `-App-Version`, `-Build` y un `X-Request-Id` por
     petición (CLI-3).
  2. `BearerAuthInterceptor`: pone `Authorization`; ante un 401 pide **un** token nuevo y reintenta una vez
     (`TokenRefreshGate`).
  3. `RetryInterceptor`: reintenta `GET` y `POST` con `Idempotency-Key` ante error de red, 5xx o 429, con espera
     exponencial aleatoria y respetando `Retry-After`; **un `POST` sin clave no se reintenta nunca** (CLI-10).
  4. De red: `RetryAfterShieldInterceptor`; y `boundTo(accountId)` → `ExpectedAccountInterceptor`, que comprueba en
     **cada intento real** que el `sub` del token es la cuenta esperada; si no, lanza `AccountMismatchException` sin
     tocar la red.
- **Plazos**: 10 s conectar, 30 s leer/escribir, 30 s por petición lógica; sin redirecciones; sin reintentos propios
  de OkHttp (CLI-10).
- **Errores (Problem Details, RFC 9457)**: `ErrorMapping.kt` traduce a `sealed interface AppError`:
  `UpgradeRequired` (426), `Network`, `Known(code, status, detail, transfer?, fieldMessage?)` y `Unknown`. Los `code`
  conocidos están en el enum `ApiErrorCode` (`validation_error`, `unauthorized`, `idempotency_conflict`,
  `rate_limited`, `business_blocked`, `payment_required`, `client_upgrade_required`…), escrito a mano porque el OpenAPI
  solo los declara como valores conocidos. Un `code` nuevo llega como `Unknown`: la app muestra un mensaje genérico y
  **nunca se cae** (CLI-2).
- **Idempotencia** (CLI-6): la `Idempotency-Key` se crea al pulsar «Confirmar pedido», se guarda en disco y se reutiliza
  hasta una respuesta definitiva. `OrderAttemptLedger` clasifica cada resultado (`AttemptOutcome`: `Created`,
  `Rejected`, `KeyConflict`, `Unknown`) y, ante `Unknown`, **consulta `GET /customer/orders/attempts/{key}` antes de
  reenviar** (`ApiAttemptLookup`). `not_found` no prueba que el pedido no exista; `unknown` nunca se trata como
  `not_found`.
- **Dinero y fechas**: importes como cadena decimal (`"12.50"`) → `BigDecimal(String)`; `cashPayingWith` heredado
  como `number` se construye desde cadena, jamás desde `Double`. Instantes en UTC (API-8, TS-11).

## 8. Reglas puras compartidas y vectores de conformidad

Hay reglas de negocio **que corren en el cliente para no contradecir al servidor** y que la web también implementa.
Hoy están **duplicadas a mano** en cada plataforma:

| Regla | Android | Web (referencia) | Autoridad |
|---|---|---|---|
| Efectivo: billete máximo, vuelto, múltiplo | `feature/checkout/CashRules.kt` (`checkCash`; «igual que en `cash.ts` de la web») | `apps/customer/features/checkout/lib/cash.ts` | `create_customer_order` en la base (vuelve a mirar al crear) |
| Dirección: largos, texto basura, redondeo a `numeric(10,7)` | `feature/addresses/AddressRules.kt` | `packages/contracts/src/primitives.ts` | El servidor (`isGarbageText`) |
| Cobertura: punto dentro del polígono (par-impar) o radio | `feature/addresses/Coverage.kt` (`isInsideCoverage`) | (sin verificar) | `app_settings` y la API |
| Elección de pago según confianza | `feature/checkout/PaymentChoice.kt` | (sin verificar) | `GET /customer/payment-options` y la cotización |

**Vectores de conformidad: no existen.** Se buscó `vectores`, `conformance`, `golden` y `fixtures` en el repo
(develop@0d0f7486): no hay `packages/contracts/fixtures/` (los estándares KT-13 y SW-13 lo dan «por crear»), ni
carpeta de vectores en `Docs/`. Lo que hay hoy es:

- Pruebas unitarias de Android por regla (`CashRulesTest`, `AddressRulesTest`, `CoverageTest`, `PaymentChoiceTest`) con
  casos escritos dentro del propio test.
- `apps/api/lib/__tests__/openapi-conformance.integration.test.ts`: comprueba que **la API** responde como su OpenAPI;
  no comprueba cálculos de cliente.

**Consecuencia:** hoy nada garantiza que iOS calcule lo mismo que Android. Como las dos apps salen juntas (decisión de Jesús, 2026-11-17), **los vectores de conformidad JSON compartidos son el mecanismo de paridad y hay que crearlos antes del lanzamiento**. La regla (en lo ya decidido; el reparto de quién escribe cada vector sigue por fijar):

1. Cada regla pura compartida tiene un archivo de **vectores** en `packages/contracts/fixtures/<regla>.json`:
   lista de `{ nombre, entrada, salida esperada }` con importes como cadena, coordenadas con 7 decimales y los casos
   límite (billete exacto, vuelto 0.00, punto sobre el borde, texto repetido).
2. Cada plataforma tiene **una prueba que lee ese archivo** y falla si su implementación difiere (Kotlin: JUnit;
   Swift: Swift Testing). El mismo archivo lo puede ejecutar la web (Vitest) y comprobar contra `cash.ts`.
3. Un cambio en una regla cambia el vector **en el mismo PR**; sin eso, no pasa la CI.
4. Mientras no existan los vectores, el PR que toque una regla pura cita los casos que comprobó en ambas plataformas.
5. Los vectores se escriben **desde las decisiones aprobadas y el contrato REST v1**, no ejecutando el código que se quiere comprobar. Los mantiene quien cambia la regla; un responsable del contrato revisa su coherencia. Regla de PR: todo cambio de regla actualiza los vectores y verifica su cumplimiento en servidor, Android e iOS.
6. Cobertura mínima propuesta por la junta (17-nov, B, punto 15): pagos y recojo (S/ 80, faltas), cancelación (antes de aceptar y 2 min), proyección `CUS-TRK-002` por servicio y modalidad, sanciones (en revisión, confirmada, anulada), validaciones (referencia con `trim`, prefijo `#TDV-`, 5 kg), orden de pendientes, aceptación de términos, acceso a un pedido ajeno, celular ocupado, textos críticos (≤ 40 caracteres de `validando`), y desconexión, reintentos y eventos fuera de orden. No se congela `app_settings` como valores inmutables, sí su significado y compatibilidad.

## 9. Design system en Compose

Resumen; los valores, la tabla de tokens y las diferencias con lo aprobado están en `Docs/negocio/diseno.md`.

`:core:designsystem` (`apps/android/core/designsystem/src/main/kotlin/com/tindivo/core/designsystem/`):

| Archivo | Contenido |
|---|---|
| `TindivoColors.kt` | `Palette` (interna) → `TindivoLightColors` (Material 3 `lightColorScheme`) y `TindivoColors` (`brandText`, pares de aviso, `border`) |
| `TindivoTheme.kt` | `TindivoTheme`, `TindivoShapes` (8/12/16/20/28), `TindivoSpacing` (4/8/12/16/24/32, `touchTarget` 48, `primaryButtonHeight` 52) |
| `TindivoType.kt` | `TindivoTypography` con Geist (TTF variable en `res/font/geist.ttf`), nombres de Material 3 |
| `TindivoButtons.kt` | `TindivoPrimaryButton` (con `loading`), `TindivoSecondaryButton`, `TindivoTextButton` |
| `TindivoCard.kt` | `TindivoCard` (estática y clicable): blanca, borde 1 dp, sin sombra |
| `ScreenStates.kt` | `LoadingState`, `EmptyState`, `ErrorState` |
| `StatusRow.kt`, `TindivoIcons.kt` | fila clave-valor; 6 íconos vectoriales |

- **Solo tema claro.** Una pantalla usa `MaterialTheme.colorScheme`, `typography`, `shapes` y `TindivoSpacing`; un
  `dp`, `sp` o `Color(` suelto en una pantalla es una señal de que falta un nombre en el design system.
- Algunas pantallas aún arman a mano piezas que ya existen o deberían existir (p. ej. `Surface(shadowElevation = 8.dp)`
  en `CheckoutBottomBar`, `CartBar`, `StoreDetailScreen`): es trabajo pendiente, no una excepción aprobada.

## 10. Equivalencia propuesta para iOS (SwiftUI) — PROPUESTA, no aprobada

> iOS sale a la vez que Android (decisión de Jesús, 2026-11-17): lo que sigue sigue siendo propuesta de estructura, pero el calendario ya no es «después».

Parte de `estandares/swift.md` (SW-2 a SW-16, ya aprobados) y la completa con la correspondencia 1 a 1 con Android.
Lo marcado como propuesta se aprueba al aprobar el plan `Docs/planes/app-cliente/`.

| Android | iOS (propuesta) |
|---|---|
| `:customer` | target `TindivoCustomer` |
| `:core:network` | paquete local `TindivoAPI` (`swift-openapi-generator`, middlewares) |
| `:core:designsystem` | paquete local `TindivoDesign` |
| `feature/<área>/` | `Features/<Área>/` (nombres: tabla de §11) |
| `…Screen` (Composable) | `…View` (SwiftUI), sin lógica |
| `…ViewModel` + `UiState` (`StateFlow`) | `…ScreenModel` (`@MainActor @Observable`) + `…State` (struct/enum inmutable) |
| Reducers y reglas puras | funciones libres o `struct` sin estado en el mismo `Features/<Área>/`; sin importar SwiftUI |
| `…Repository` → `ApiResult<T>` | protocolo `…Repository: Sendable` → `Result<T, AppError>` o `throws(AppError)` |
| `sealed interface AppError` | `enum AppError` con `.unknown(code:detail:)` |
| `AppNavHost` + rutas `@Serializable` | `NavigationStack` con rutas tipadas (`Hashable`) en un `Router` |
| Lambdas de salida de `Destination` | cierres o acciones pasadas a la vista, igual |
| `SessionStore` (Tink + Keystore) | `SessionStore` (protocolo) sobre Keychain `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` |
| `@HiltViewModel`, módulos `di/` | `AppEnvironment.live` / `.test` (una raíz de composición, SW-4) |
| `DataStore` | archivo `Codable` en Application Support (SW-9) |
| `strings.xml` | `Localizable.xcstrings` |
| `BigDecimal` | `Decimal(string:locale: en_US_POSIX)` (SW-8) |
| `MaterialTheme` + `TindivoSpacing` | `Tindivo.colors`, `Tindivo.typography`, `Tindivo.spacing`: **mismo nombre de token** que en Android |

## 11. Una carpeta por área de requisito

La spec de la app cliente (`Docs/planes/app-cliente/`) usa **un código de área** que es el mismo en requisitos,
pantallas, carpeta de código y pruebas. Toda feature nueva nace en la carpeta de su área:

| Área | Requisitos | Pantallas | Android `feature/` | iOS `Features/` |
|---|---|---|---|---|
| AUT | `requisitos/AUT.md` | `AUT-*` | `signin`, `profile`, `phone` | `Auth` |
| CAT | `CAT.md` | `CAT-*` | `catalog` | `Catalog` |
| CRT | `CRT.md` | `CRT-*` | `cart` | `Cart` |
| ADR | `ADR.md` | `ADR-*` | `addresses` | `Addresses` |
| CHK | `CHK.md` | `CHK-*` | `checkout` | `Checkout` |
| PAY | `PAY.md` | `PAY-*` | `orders` (pago) | `Payment` |
| TRK | `TRK.md` | `TRK-*` | `orders` (seguimiento) | `Tracking` |
| ORD | `ORD.md` | `ORD-*` | `orders` | `Orders` |
| REV | `REV.md` | `REV-*` | `reviews` | `Reviews` |
| ACC | `ACC.md` | `ACC-*` | `account`, `deleteaccount` | `Account` |
| NOT | `NOT.md` | `NOT-*` | (por crear) | `Notifications` |
| SUP | `SUP.md` | `SUP-*` | `account` | `Support` |
| ENT | `ENT.md` | `ENT-*` | `courier` | `Courier` |
| STO | `STO.md` | `STO-*` | `store` | `Store` |

Android tiene hoy carpetas que mezclan áreas (`orders` cubre PAY, TRK y ORD): no se renombran por esta tabla; se anota y
se decide aparte. En iOS **sí** nacen separadas.

## 12. Qué se mantiene igual entre plataformas y qué se adapta

| Se mantiene igual (no se negocia) | Se adapta a la plataforma |
|---|---|
| Contrato REST, códigos de error, cabeceras de cliente, idempotencia | Lenguaje, UI toolkit, ciclo de vida |
| Reglas de negocio y sus límites (vía vectores, §8) | Navegación (pila de Compose vs `NavigationStack`) y gesto «atrás» |
| Nombre y significado de cada área, pantalla y requisito | Almacenamiento seguro (Keystore + Tink vs Keychain) |
| Nombre y valor de cada token de diseño (`Docs/negocio/diseno.md`) | Tipografía del sistema para accesibilidad (Dynamic Type vs `fontScale`), hojas y selectores nativos |
| Textos de interfaz, tal como los fija la spec | Permisos y diálogos del sistema (cuándo, no qué) |
| Máquina de estados del pedido: la define `packages/contracts`, no la app | Notificaciones (FCM vs APNs) y enlaces (App Links vs Universal Links) |
| Una sola fuente de la verdad de cada importe: el servidor | Formateo de moneda: `es-PE`, pero con la API de cada plataforma |

Una diferencia entre plataformas que **cambia lo que la persona ve o puede hacer** se anota en la spec
(`Docs/planes/app-cliente/`) con su motivo; no se deja a criterio de quien programa.

## Pendientes

- No existen vectores de conformidad (§8): hay que crearlos en `packages/contracts/fixtures/` antes del lanzamiento conjunto
  (decisión de Jesús, 2026-11-17); falta fijar quién escribe el primero (`CashRules`).
- Falta la barra inferior de pestañas, el `DeepLinkRouter` y el módulo de notificaciones (§4); el design system
  tiene piezas por crear y tokens que difieren de lo aprobado (`Docs/negocio/diseno.md`, «Diferencias con el código de
  Android»).
- `apps/android/AGENTS.md` no existe (medido): `estandares/kotlin.md` lo da «por crear».
