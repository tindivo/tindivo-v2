# Estándares · Swift (app de clientes para iOS)

> Verificado: 2026-10-12 · entorno: `develop@591ec569` · Parte de `Docs/arquitectura/estandares/` (niveles y excepciones: `README.md`)

Aplica a `apps/customer-ios/`. Las reglas comunes a iOS y Android (CLI) y las transversales están en `README.md`. Plan del producto: `Docs/planes/movil/`.

## Reglas

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| SW-1 | **Plataforma**: Swift 6 con comprobación estricta de concurrencia; SwiftUI; objetivo de despliegue iOS 17 (D-47). Se compila con la versión de Xcode y el SDK que exija App Store Connect: desde el 28-04-2026, Xcode 26 y SDK de iOS 26 | OBLIGATORIA | Configuración del proyecto + CI |
| SW-2 | **Estructura**: un target de app, `TindivoCustomer` (entrada, raíz de composición, configuración), y dos paquetes locales de Swift: `TindivoAPI` (cliente generado, transporte y middlewares) y `TindivoDesign` (sistema de diseño). Las funcionalidades viven en `Features/<Funcionalidad>/` dentro del target; se extraen a un paquete cuando el tiempo de compilación lo pida | OBLIGATORIA | Revisión |
| SW-3 | **Pantallas**: una vista SwiftUI sin lógica y un modelo de pantalla, marcado `@MainActor`, por pantalla (`CartScreenModel`): con `@Observable` (iOS 17, D-47). La vista solo lee estado y envía acciones; las reglas de negocio no viven en el cliente (DES-5) | OBLIGATORIA | Revisión + tests del modelo |
| SW-4 | **Dependencias** por inicializador, contra protocolos `Sendable` (`OrdersRepository`, `SessionStore`, `PushService`); una sola raíz de composición (`AppEnvironment.live`); nada de singletons globales fuera de ella; en tests, `AppEnvironment.test` con dobles | OBLIGATORIA | Revisión |
| SW-5 | **Concurrencia**: `async`/`await`; ni callbacks ni Combine en código nuevo; sin `DispatchQueue.main.async` (se usa `@MainActor`); `Task.detached` solo con una línea de porqué; toda tarea larga respeta la cancelación | OBLIGATORIA | Compilador (modo estricto) + revisión |
| SW-6 | **Errores**: `AppError` (enum) traduce los `code` de RFC 9457 conocidos y tiene `.unknown(code:detail:)` (CLI-2). Prohibidos `try!`, `as!` y el desempaquetado forzado `!` fuera de tests; `fatalError` solo para errores de programación en la raíz de composición | OBLIGATORIA | SwiftLint (`force_try`, `force_cast`, `force_unwrapping` como error) |
| SW-7 | **Cliente HTTP**: `swift-openapi-generator` como plugin de SwiftPM en `TindivoAPI`, con `swift-openapi-runtime` y `swift-openapi-urlsession`. El documento lo copia `scripts/sync-openapi.sh` (nombres de archivo según la documentación del generador; verificar al montarlo). Las cabeceras de CLI-3, el token y la `Idempotency-Key` se inyectan con middlewares del cliente, nunca en cada llamada. CLI-2 se da por cumplida cuando su test pasa: hay que comprobar cómo decodifica el generador un enum desconocido | OBLIGATORIA | CI: `sync-openapi.sh --check` en cada PR; compilación y test de CLI-2 a diario (D-48) |
| SW-8 | **Dinero**: `Decimal(string:locale:)` con `Locale(identifier: "en_US_POSIX")` al parsear; formato con `.currency(code: "PEN")` y `Locale(identifier: "es_PE")`; nunca `Double` | OBLIGATORIA | Test |
| SW-9 | **Datos locales**: tokens en Keychain (`kSecClassGenericPassword`, accesibilidad `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`); preferencias no sensibles en `UserDefaults`; carrito y clave de idempotencia (CLI-6) en un archivo `Codable` en Application Support; el catálogo se cachea con la caché HTTP (ETag), sin base local en v1 | OBLIGATORIA | Revisión + test |
| SW-10 | **Push**: el SDK de Firebase Messaging solo dentro de `PushService`. El permiso se pide con `UNUserNotificationCenter` según CLI-11: el diálogo del sistema aparece una sola vez, así que antes va la pantalla propia. El token se registra con la ruta de dispositivos que fije el contrato (paso 5; hoy solo existe el registro de Web Push) en cada arranque y cuando cambia | OBLIGATORIA | Revisión + test |
| SW-11 | **Navegación**: `NavigationStack` con rutas tipadas; un único `DeepLinkRouter` traduce las rutas de `packages/contracts/deeplinks` (por crear) (Universal Links y payload de push) | OBLIGATORIA | Test del router |
| SW-12 | **UI**: solo SwiftUI (UIKit solo envuelto y con porqué); colores, tipografía y espaciados de `TindivoDesign`; textos en el catálogo de cadenas (`Localizable.xcstrings`); `#Preview` en cada componente de `TindivoDesign` | OBLIGATORIA | Revisión |
| SW-13 | **Pruebas**: Swift Testing (`@Test`, `#expect`) para modelos de pantalla, repositorios y decodificación con los fixtures de `packages/contracts/fixtures/` (por crear); XCUITest para el flujo crítico (TST-6) | OBLIGATORIA | CI de Swift, a diario (D-48) |
| SW-14 | **Estilo**: SwiftLint con `force_unwrapping`, `force_try` y `force_cast` como error; `file_length` 300, `function_body_length` 80 y `cyclomatic_complexity` 15 como alerta (alineado con TS-3); formato con `swift-format`. Los nombres de reglas se verifican contra la versión instalada | OBLIGATORIA | CI de Swift, a diario (D-48) |
| SW-15 | **Configuración**: entornos `Dev` y `Prod` con archivos `.xcconfig` (URL base de la API, identificadores); ningún secreto en el binario: la clave publicable de Supabase no es secreta y la de servicio nunca sale del servidor. `MARKETING_VERSION` semántica; `CURRENT_PROJECT_VERSION` creciente, la pone la CI | OBLIGATORIA | Revisión |
| SW-16 | **Dependencias**: solo SwiftPM. Cada librería de terceros se pide en `Docs/trabajo/decisiones-abiertas.md` y Jesús la aprueba antes de añadirla. Lista inicial: `swift-openapi-generator`, `swift-openapi-runtime`, `swift-openapi-urlsession`, Firebase Messaging, la herramienta de *crashes* (DA-08) y el SDK de Supabase para Swift (solo Auth, si DA-01 lo confirma) | OBLIGATORIA | Revisión de `Package.resolved` |

## Estructura

```
apps/customer-ios/
├── AGENTS.md
├── TindivoCustomer.xcodeproj
├── TindivoCustomer/
│   ├── App/            # @main, AppEnvironment (raíz de composición), DeepLinkRouter
│   ├── Features/
│   │   ├── Home/       # HomeView + HomeScreenModel (contenido servido por la API, DES-8)
│   │   ├── Catalog/
│   │   ├── Cart/
│   │   ├── Checkout/   # los tres pasos (spec §4)
│   │   ├── Orders/
│   │   ├── Account/    # direcciones, consentimientos, borrado de cuenta
│   │   └── Update/     # actualización obligatoria (CLI-4)
│   ├── Services/       # SessionStore, PushService, ConfigService: protocolo + implementación
│   ├── Resources/      # Localizable.xcstrings, Assets.xcassets
│   └── Config/         # Dev.xcconfig, Prod.xcconfig
├── Packages/
│   ├── TindivoAPI/     # plugin del generador, contrato copiado, middlewares
│   └── TindivoDesign/
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
  - Packages/TindivoAPI/.build
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
