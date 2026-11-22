# apps/ios — app iOS del cliente (Swift 6, SwiftUI, iOS 17)

Se suma al `AGENTS.md` raíz. La norma es `Docs/arquitectura/estandares/swift.md` (SW-*) y las reglas CLI-* de
`Docs/arquitectura/estandares/README.md`; la paridad se mide contra `apps/android`. Solo se compila en macOS.

- **Nada generado se versiona.** El `.xcodeproj`, el `Info.plist`, el cliente de la API y los tokens se rehacen con
  `pnpm ios:gen` (`scripts/gen.sh`). Se edita `project.yml`, nunca el proyecto en Xcode: lo que cambies en la
  interfaz de Xcode se pierde en la siguiente generación. Del `.xcodeproj` solo se versiona su `Package.resolved`.
- **Comandos:** `pnpm ios:gen`, `pnpm ios:build`, `pnpm ios:test` (los dos últimos regeneran antes). Simulador sin
  firma; otro destino con `IOS_DESTINATION`. Herramientas fijadas (XcodeGen con sha256, swift-openapi-generator con
  versión exacta en `Tools/Package.swift`) en `~/Library/Caches/tindivo-ios`, compartida entre worktrees.
- **El contrato:** `Packages/TindivoAPI/openapi/v1.json` es una copia fiel (`scripts/sync-openapi.sh`). El generador
  lee un documento tolerante que deriva `scripts/ios-openapi-tolerant.mjs` (abre objetos y enums de las respuestas):
  sin ese paso, un campo o valor nuevo del backend tumba la decodificación (CLI-2). Lo cubre
  `SystemRepositoryTests` («CLI-2: un campo nuevo…»).
- **Los tipos generados (`Operations.*`) no salen de `TindivoAPI`:** cada repositorio los traduce a modelos propios.
  Los errores no se traducen por operación: `ProblemMiddleware` convierte todo no-2xx en `AppError` y `apiCall`
  deja `AppError` como único error.
- **En un `.xcconfig`, `//` abre comentario:** las URL se escriben `https:/$()/host`.
- **Red (CLI-10):** `TindivoHTTP` (30 s por intento, sin seguir redirecciones) y `RetryMiddleware` (misma política que
  `RetryInterceptor.kt`). Desviación: `URLSession` no tiene plazo solo para conectar; los 10 s de CLI-10 quedan dentro
  de los 30 s del intento. Fechas `date-time` con `FlexibleISO8601` (con o sin fracción de segundo).
- **Dinero heredado:** los campos `legacyMoney` del contrato (número JSON) llegan como `ExactMoney` (`Decimal`), por
  `typeOverrides`; los campos nuevos (texto, D-39) se leen con `Money.parse`. Nunca `Double` (SW-8).
- **Textos:** catálogo `Localizable.xcstrings` en la app y en cada paquete con UI; en un paquete, `Text(…, bundle: .module)`.
- **Geist** se registra en código (`TindivoFonts.register()`, en la raíz de la app): `UIAppFonts` no ve recursos de
  un paquete SwiftPM. Tema solo claro (`UIUserInterfaceStyle: Light`).
