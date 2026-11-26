# Estándares · Swift (app de clientes para iOS)

> Verificado: 2026-11-22 (SW-1, SW-3, SW-7, SW-10, SW-11, SW-13 a SW-16 y estructura; XcodeGen, MapKit, APNs directo), 2026-11-18 (ruta de iOS y SW-16) y 2026-10-12 (el resto) · entorno: `develop@591ec569` · Parte de `Docs/arquitectura/estandares/` (niveles y excepciones: `README.md`)

Aplica a `apps/ios/`. Las reglas comunes a iOS y Android (CLI) y las transversales están en `README.md`. Plan del producto: `Docs/planes/movil/`.

## Reglas

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| SW-1 | **Plataforma**: Swift 6 con comprobación estricta de concurrencia; SwiftUI; objetivo de despliegue iOS 17 (D-47). Se compila con **Xcode 27.2**, en la Mac y en la CI (runner `xcode-27`); el mínimo de App Store Connect es Xcode 26 y SDK de iOS 26 desde el 28-04-2026 | OBLIGATORIA | Configuración del proyecto + CI |
| SW-2 | **Estructura**: un target de app, `TindivoCustomer` (entrada, raíz de composición, configuración), y dos paquetes locales de Swift: `TindivoAPI` (cliente generado, transporte y middlewares) y `TindivoDesign` (sistema de diseño). Las funcionalidades viven en `Features/<Funcionalidad>/` dentro del target; se extraen a un paquete cuando el tiempo de compilación lo pida | OBLIGATORIA | Revisión |
| SW-3 | **Pantallas**: una vista SwiftUI sin lógica y un modelo de pantalla, marcado `@MainActor`, por pantalla (`CartScreenModel`): con `@Observable` (iOS 17, D-47). La vista solo lee estado y envía acciones; las reglas de negocio no viven en el cliente (DES-5). Los tipos generados (`Operations.*`, `Components.*`) no salen de `TindivoAPI`: los repositorios los traducen a modelos propios antes de llegar a un modelo de pantalla | OBLIGATORIA | Revisión + tests del modelo |
| SW-4 | **Dependencias** por inicializador, contra protocolos `Sendable` (`OrdersRepository`, `SessionStore`, `PushService`); una sola raíz de composición (`AppEnvironment.live`); nada de singletons globales fuera de ella; en tests, `AppEnvironment.test` con dobles | OBLIGATORIA | Revisión |
| SW-5 | **Concurrencia**: `async`/`await`; ni callbacks ni Combine en código nuevo; sin `DispatchQueue.main.async` (se usa `@MainActor`); `Task.detached` solo con una línea de porqué; toda tarea larga respeta la cancelación | OBLIGATORIA | Compilador (modo estricto) + revisión |
| SW-6 | **Errores**: `AppError` (enum) traduce los `code` de RFC 9457 conocidos y tiene `.unknown(code:detail:)` (CLI-2). Prohibidos `try!`, `as!` y el desempaquetado forzado `!` fuera de tests; `fatalError` solo para errores de programación en la raíz de composición | OBLIGATORIA | SwiftLint (`force_try`, `force_cast`, `force_unwrapping` como error) |
| SW-7 | **Cliente HTTP**: `swift-openapi-generator` (versión exacta en `apps/ios/Tools/Package.swift`) ejecutado como **CLI por `pnpm ios:gen`** (`apps/ios/scripts/gen.sh`), no como plugin; la salida va a `Packages/TindivoAPI/Sources/TindivoAPI/Generated/` y no se versiona. `scripts/sync-openapi.sh` copia el contrato a `Packages/TindivoAPI/openapi/v1.json`; `scripts/ios-openapi-tolerant.mjs` deriva de esa copia el documento que lee el generador: en las respuestas quita `additionalProperties: false` y abre los enums (`anyOf: [enum, string]`), porque con el contrato tal cual el cliente rechaza un campo o un valor nuevo (medido el 2026-11-22). Es un parche hasta que el contrato emita respuestas abiertas (DA-26). Runtime: `swift-openapi-runtime` y `swift-openapi-urlsession`. Las cabeceras de CLI-3, el token y la `Idempotency-Key` se inyectan con middlewares; `ProblemMiddleware` convierte toda respuesta no 2xx en `AppError`. CLI-2 se da por cumplida cuando su test pasa | OBLIGATORIA | CI: `sync-openapi.sh --check` en cada PR; `pnpm ios:test` (incluye el test de CLI-2) a diario en `ios.yml` (D-48) |
| SW-8 | **Dinero**: `Decimal(string:locale:)` con `Locale(identifier: "en_US_POSIX")` al parsear; formato con `.currency(code: "PEN")` y `Locale(identifier: "es_PE")`; nunca `Double`. El dinero heredado que la API manda como número JSON (`legacyMoney` del contrato) llega como `ExactMoney` (un `Decimal`): el documento que lee el generador apunta esos campos a `LegacyMoney` y `typeOverrides` lo sustituye; un tercer decimal se rechaza | OBLIGATORIA | Test |
| SW-9 | **Datos locales**: tokens en Keychain (`kSecClassGenericPassword`, accesibilidad `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`); preferencias no sensibles en `UserDefaults`; carrito y clave de idempotencia (CLI-6) en un archivo `Codable` en Application Support; el catálogo se cachea con la caché HTTP (ETag), sin base local en v1 | OBLIGATORIA | Revisión + test |
| SW-10 | **Push**: APNs nativo, sin Firebase (`send-push` envía a iOS directo por APNs, D-25). `PushService` pide el permiso con `UNUserNotificationCenter` según CLI-11 (el diálogo del sistema aparece una sola vez, así que antes va la pantalla propia), llama a `registerForRemoteNotifications()` y registra el token de APNs en hexadecimal con `PUT /push/devices/{installId}` (`platform: ios`; `environment: sandbox` en builds firmados para desarrollo, `production` en TestFlight y App Store) en cada arranque y cuando cambia | OBLIGATORIA | Revisión + test |
| SW-11 | **Navegación**: `NavigationStack` con rutas tipadas; un único `DeepLinkRouter` traduce las rutas relativas del payload de push (`deepLink` de `packages/contracts/src/native-push.ts`: hoy `/pedido/{shortId}`, `/entregas/{shortId}`, `/entrega/{id}`); una ruta desconocida abre inicio. Los Universal Links entran cuando se decida DA-11 y exista el esquema de deep links (CLI-8) | OBLIGATORIA | Test del router |
| SW-12 | **UI**: solo SwiftUI (UIKit solo envuelto y con porqué); colores, tipografía y espaciados de `TindivoDesign`; textos en el catálogo de cadenas (`Localizable.xcstrings`); `#Preview` en cada componente de `TindivoDesign` | OBLIGATORIA | Revisión |
| SW-13 | **Pruebas**: Swift Testing (`@Test`, `#expect`) para modelos de pantalla, repositorios y decodificación con los fixtures de `packages/contracts/fixtures/` (`vectores/` existe; `forward-compat/`, por crear); XCUITest para el flujo crítico (TST-6) | OBLIGATORIA | CI de Swift, a diario (D-48) |
| SW-14 | **Estilo**: SwiftLint con `force_unwrapping`, `force_try` y `force_cast` como error; `file_length` 300, `function_body_length` 80 y `cyclomatic_complexity` 15 como alerta (alineado con TS-3); formato con `swift-format`. SwiftLint como binario fijado con sha256 (`apps/ios/scripts/`, pendiente); `swift-format` es el del toolchain de Xcode (`xcrun swift-format`). Los nombres de reglas se verifican contra la versión instalada | OBLIGATORIA | CI de Swift (`ios.yml`), a diario (D-48): la dispara la definición de `main` y compila `develop` |
| SW-15 | **Configuración**: entornos `Dev` y `Prod` con archivos `.xcconfig` (URL base de la API, identificadores). Configuraciones `Debug-Dev`, `Release-Dev` y `Release-Prod` (no existe prod en debug, como KT-15); esquemas `TindivoCustomer-Dev` y `TindivoCustomer-Prod`. Bundle ID `com.tindivo.customer`, con `.dev` en Dev (DA-12, Jesús 2026-11-22). En un `.xcconfig` una URL se escribe `https:/$()/host`, porque `//` abre comentario. El proyecto se genera con XcodeGen (versión fijada en `apps/ios/scripts/tools.sh`) desde `apps/ios/project.yml`; el `.xcodeproj` no se versiona, salvo su `Package.resolved`. Ningún secreto en el binario: la clave publicable de Supabase no es secreta y la de servicio nunca sale del servidor. `MARKETING_VERSION` semántica; `CURRENT_PROJECT_VERSION` creciente, la pone la CI | OBLIGATORIA | Revisión |
| SW-16 | **Dependencias**: solo SwiftPM. Cada librería de terceros se pide en `Docs/trabajo/decisiones-abiertas.md` y Jesús la aprueba antes de añadirla. Lista inicial: `swift-openapi-runtime`, `swift-openapi-urlsession` y **GoogleSignIn** (SDK oficial; decisión de Jesús, 2026-11-18, conversación con Claude Code: `D-65` de `Docs/planes/movil/decisiones.md`). Herramientas de desarrollo, fuera del binario: `swift-openapi-generator`, XcodeGen (aprobado por Jesús, 2026-11-22) y SwiftLint. **Sin Firebase** (SW-10), **sin SDK de mapas** (MapKit, D-26) y sin rastreador de *crashes* por ahora (DA-08, Jesús 2026-11-22). **Sin SDK de Supabase**: la sesión habla con Auth por REST. Apple usa AuthenticationServices, del sistema | OBLIGATORIA | Revisión de `Package.resolved` |

## Estructura

```
apps/ios/
├── AGENTS.md
├── project.yml         # definición de XcodeGen; el .xcodeproj generado no se versiona (salvo su Package.resolved)
├── scripts/            # gen.sh (pnpm ios:gen), tools.sh (herramientas fijadas), xcodebuild.sh (build y test)
├── Tools/              # Package.swift y Package.resolved de swift-openapi-generator
├── TindivoCustomer/
│   ├── App/            # @main, AppEnvironment (raíz de composición), AppConfig; DeepLinkRouter por llegar
│   ├── Features/
│   │   ├── Diagnostics/ # pantalla del esqueleto: llama a la API de staging
│   │   ├── Home/       # HomeView + HomeScreenModel (contenido servido por la API, DES-8)
│   │   ├── Catalog/
│   │   ├── Cart/
│   │   ├── Checkout/   # confirmar el pedido
│   │   ├── Orders/
│   │   ├── Account/    # direcciones, consentimientos, borrado de cuenta
│   │   └── Update/     # actualización obligatoria (CLI-4)
│   ├── Services/       # SessionStore, PushService, ConfigService: protocolo + implementación (por llegar)
│   ├── Resources/      # Localizable.xcstrings, Assets.xcassets
│   └── Config/         # Dev.xcconfig, Prod.xcconfig
├── Packages/
│   ├── TindivoAPI/     # openapi/v1.json (copia del contrato), Generated/ (no versionado), middlewares y repositorios
│   └── TindivoDesign/  # componentes, estilos, fuente Geist; Generated/ (no versionado)
├── TindivoCustomerTests/
└── TindivoCustomerUITests/
```

## Ejemplo: modelo de pantalla (SW-3, SW-4, SW-6)

Ilustrativo (iOS 17, D-47).

```swift
protocol OrdersRepository: Sendable {
    /// Crea el pedido. Gestiona la Idempotency-Key de la intención (CLI-6).
    func place(_ cart: Cart) async throws(AppError) -> PlacedOrder
}

@MainActor
@Observable
final class CheckoutScreenModel {
    enum State: Equatable {
        case idle
        case submitting
        case placed(orderId: String)
        case failed(AppError)
    }

    private(set) var state: State = .idle
    private let orders: any OrdersRepository

    init(orders: any OrdersRepository) {
        self.orders = orders
    }

    func confirm(_ cart: Cart) async {
        guard state != .submitting else { return }
        state = .submitting
        do {
            let order = try await orders.place(cart)
            state = .placed(orderId: order.id)
        } catch {
            state = .failed(error)
        }
    }
}
```

## Ejemplo: `.swiftlint.yml` de partida (SW-14)

Verificar los nombres de reglas contra la versión instalada antes de activarlo en CI.

```yaml
included:
  - TindivoCustomer
  - Packages
excluded:
  - Packages/TindivoAPI/Sources/TindivoAPI/Generated
  - Packages/TindivoDesign/Sources/TindivoDesign/Generated
  - build
opt_in_rules:
  - force_unwrapping
force_cast: error
force_try: error
force_unwrapping: error
file_length:
  warning: 300
function_body_length:
  warning: 80
cyclomatic_complexity:
  warning: 15
```
