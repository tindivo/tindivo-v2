import XCTest

/// Lo común de las pruebas de interfaz del catálogo: arrancar la app con sus ganchos DEBUG y los atajos para
/// encontrar elementos por identificador.
@MainActor
class CatalogUITestCase: XCTestCase {
    let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
    }

    /// La bolsa de una corrida anterior (de otro negocio) abriría la pregunta de vaciarla. El reloj de la app se fija
    /// en un martes a las 20:00 de Lima: el horario nocturno no depende de cuándo corra.
    func launch(
        fakeCatalog: Bool, seedOtherBag: Bool = false, fastClock: Bool = false, largeType: Bool = false,
        now: String = "2026-07-07T20:00:00-05:00", nowFile: String? = nil, failMenuFile: String? = nil,
        voiceOver: Bool = false
    ) {
        // El plazo de «Deshacer» se alarga (solo DEBUG) para que el toque no dependa de la velocidad del simulador.
        app.launchArguments = [
            "-tindivo-reset-cart", "-tindivo-now", now, "-tindivo-undo-seconds", "60",
        ]
        if let nowFile { app.launchArguments += ["-tindivo-now-file", nowFile] }
        if let failMenuFile { app.launchArguments += ["-tindivo-fail-menu-file", failMenuFile] }
        // Solo DEBUG: la bolsa se comporta como con VoiceOver encendido (el aviso «Deshacer» no se cierra solo).
        if voiceOver { app.launchArguments.append("-tindivo-voiceover") }
        if largeType {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        }
        if fastClock { app.launchArguments.append("-tindivo-clock-fast") }
        if seedOtherBag { app.launchArguments.append("-tindivo-seed-other-bag") }
        if fakeCatalog { app.launchArguments.append("-tindivo-fake-catalog") }
        app.launch()
    }

    func dishRow(_ name: String) -> XCUIElement {
        query("menu.dish").containing(.staticText, identifier: name).firstMatch
    }

    func openDonLucho() {
        XCTAssertTrue(app.staticTexts["¿Qué pedimos hoy?"].waitForExistence(timeout: 30), "Inicio no cargó")
        let card = app.staticTexts["Pollería Don Lucho"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20), "No está Pollería Don Lucho en Inicio")
        // La barra de pestañas tapa el final de la lista: con letra grande la tarjeta queda debajo de ella y, aunque
        // XCUITest la da por tocable, el toque cae en la barra. Se sube la lista hasta que quede encima.
        let bar = element("tab.bar")
        var swipes = 0
        while bar.exists, card.frame.midY > bar.frame.minY - 24, swipes < 8 {
            app.swipeUp(velocity: .slow)
            swipes += 1
        }
        card.tap()
    }

    func goBack() {
        app.navigationBars.buttons.firstMatch.tap()
    }

    func query(_ identifier: String) -> XCUIElementQuery {
        app.descendants(matching: .any).matching(identifier: identifier)
    }

    func element(_ identifier: String) -> XCUIElement {
        query(identifier).firstMatch
    }

    func attach(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
