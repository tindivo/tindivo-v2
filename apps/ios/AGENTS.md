# apps/ios — app iOS del cliente (Swift 6, SwiftUI, iOS 17)

Se suma al `AGENTS.md` raíz. La norma es `Docs/arquitectura/estandares/swift.md` (SW-*) y las reglas CLI-* de
`Docs/arquitectura/estandares/README.md`; la paridad se mide contra `apps/android`. Solo se compila en macOS.

- **Nada generado se versiona.** El `.xcodeproj`, el `Info.plist`, el cliente de la API y los tokens se rehacen con
  `pnpm ios:gen` (`scripts/gen.sh`). Se edita `project.yml`, nunca el proyecto en Xcode: lo que cambies en la
  interfaz de Xcode se pierde en la siguiente generación. Del `.xcodeproj` solo se versiona su `Package.resolved`.
- **Comandos:** `pnpm ios:gen`, `pnpm ios:build`, `pnpm ios:test` (los dos últimos regeneran antes). Simulador sin
  firma; otro destino con `IOS_DESTINATION`. Herramientas fijadas (XcodeGen y SwiftLint con sha256, swift-openapi-generator
  con versión exacta en `Tools/Package.swift`) en `~/Library/Caches/tindivo-ios`, compartida entre worktrees.
- **Estilo (SW-14):** `pnpm ios:lint` corre SwiftLint (`.swiftlint.yml`, sobre las carpetas de `included`, también lo no
  versionado; falla con errores) y `swift format lint --strict` (`.swift-format`, solo lo versionado y no generado; falla si
  el formato no es el suyo); `pnpm ios:format` aplica `swift-format` y reescribe archivos.
  swift-format decide largo de línea y comas finales: por eso SwiftLint tiene apagados `line_length` y `trailing_comma`.
- **Build (SW-15):** `IOS_BUILD_NUMBER` (la CI pasa `github.run_number`) fija `CURRENT_PROJECT_VERSION`. Ese número es
  por workflow y empieza en 1: el workflow que suba a TestFlight tiene que usar una base mayor que el último build subido.
- **Recursos:** `Resources/Assets.xcassets` lleva `AppIcon` (versionado; `scripts/ios-appicon.swift` lo rehace desde el
  icono adaptativo de Android) y, generados desde `packages/design-tokens` por `gen.sh`, `AccentColor` (`primary`) y
  `LaunchBackground` (`background`). `PrivacyInfo.xcprivacy`: sin rastreo, sin datos recogidos y sin APIs de razón
  obligatoria; si el código pasa a usar una (UserDefaults, fechas de archivo, espacio en disco, tiempo de arranque) o a
  enviar datos personales, se declara ahí.
- **El contrato:** `Packages/TindivoAPI/openapi/v1.json` es una copia fiel (`scripts/sync-openapi.sh`). El generador
  lee un documento tolerante que deriva `scripts/ios-openapi-tolerant.mjs` (abre objetos y enums de las respuestas):
  sin ese paso, un campo o valor nuevo del backend tumba la decodificación (CLI-2). Lo cubre
  `SystemRepositoryTests` («CLI-2: un campo nuevo…»).
- **Los tipos generados (`Operations.*`, `Client`) no salen de `TindivoAPI`** (el generador los emite `package`; la app
  recibe `TindivoAPIServices`): cada repositorio los traduce a modelos propios.
  Los errores no se traducen por operación: `ProblemMiddleware` convierte todo no-2xx en `AppError` y `apiCall`
  deja `AppError` como único error.
- **En un `.xcconfig`, `//` abre comentario:** las URL se escriben `https:/$()/host`.
- **Red (CLI-10):** `TindivoHTTP` (30 s por intento, sin seguir redirecciones), `DeadlineMiddleware` (30 s para la
  llamada completa, reintentos y esperas incluidos: el `callTimeout` de Android; al vencer devuelve `AppError.network`)
  y `RetryMiddleware` (mismas reglas de qué reintentar, cuántas veces y `Retry-After` que `RetryInterceptor.kt`; la
  espera va dentro del plazo total). El plazo total cubre hasta recibir las cabeceras; el cuerpo de la respuesta lo acota
  `timeoutIntervalForResource` (30 s) del último intento, no `DeadlineMiddleware`. Desviación: `URLSession` no tiene plazo solo para conectar; los 10 s de CLI-10
  quedan dentro de los 30 s del intento. Fechas `date-time` con `FlexibleISO8601` (con o sin fracción de segundo).
- **Actualización obligatoria (CLI-4):** `ConfigService` (`Services/Config`) lee `/config` al abrir y al pasar de
  segundo plano a `.active`; todo 426 llega por `ProblemMiddleware` → `ConfigService` y la raíz muestra `UpdateView`.
  `/config` se pide por una sesión que ignora la `URLCache`. **Antes de publicar** hay que poner el id de la ficha en
  `APP_STORE_ID` (`Dev.xcconfig`/`Prod.xcconfig`): vacío, la pantalla dice «Búscala en la App Store» y el build Prod
  avisa con un `warning:` (cuando exista el id, subirlo a `error:` en el script «Comprobar APP_STORE_ID» de `project.yml`).
  Ganchos DEBUG: `-tindivo-force-upgrade` y `-tindivo-fake-catalog` (con configuración fija).
- **Dinero heredado:** los campos `legacyMoney` del contrato (número JSON) llegan como `ExactMoney` (`Decimal`), por
  `typeOverrides`; los campos nuevos (texto, D-39) se leen con `Money.parse`. Nunca `Double` (SW-8).
- **Textos:** catálogo `Localizable.xcstrings` en la app y en cada paquete con UI; en un paquete, `Text(…, bundle: .module)`.
- **Geist** se registra en código (`TindivoFonts.register()`, en la raíz de la app): `UIAppFonts` no ve recursos de
  un paquete SwiftPM. Tema solo claro (`UIUserInterfaceStyle: Light`).
