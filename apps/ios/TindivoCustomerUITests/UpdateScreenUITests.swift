import XCTest

/// La actualización obligatoria (CLI-4): con `-tindivo-force-upgrade` (solo DEBUG) la app arranca ya en ese estado, sin
/// red ni staging. La pantalla ocupa todo, no tiene botón de volver y no se puede dejar.
@MainActor
final class UpdateScreenUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments = ["-tindivo-reset-cart", "-tindivo-force-upgrade"]
        app.launch()
    }

    func testTheUpdateScreenReplacesTheAppAndHasNoWayBack() {
        let screen = app.descendants(matching: .any).matching(identifier: "update-required").firstMatch
        XCTAssertTrue(screen.waitForExistence(timeout: 30), "No apareció la pantalla de actualización")
        XCTAssertTrue(app.staticTexts["Actualiza la app"].exists)
        XCTAssertTrue(app.staticTexts["Versión mínima: 9.9.9"].exists)

        // Sin id de la App Store el texto indica qué hacer; con id, hay un botón a la tienda.
        XCTAssertTrue(
            app.staticTexts["Búscala en la App Store"].exists || app.buttons["Ir a la App Store"].exists,
            "Debe haber el texto o el botón hacia la tienda"
        )

        // No hay barra de navegación ni botón de volver, y Inicio no está detrás.
        XCTAssertEqual(app.navigationBars.count, 0, "No debe haber barra de navegación")
        XCTAssertFalse(app.staticTexts["¿Qué pedimos hoy?"].exists, "Inicio no debe estar accesible")

        // Los gestos de salida (volver con el borde izquierdo, bajar la hoja) no la quitan.
        app.swipeRight()
        app.swipeDown()
        XCTAssertTrue(screen.exists)
        XCTAssertTrue(app.staticTexts["Actualiza la app"].exists)
    }
}
