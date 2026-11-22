import XCTest

/// El flujo crítico del cliente como invitado (SW-13, TST-6): Inicio → un negocio abierto con platos → un plato que se
/// pueda pedir → Agregar → «Ver mi bolsa» → la línea aparece en la bolsa.
///
/// Dos variantes:
/// - Contra staging: depende de lo que haya allí; si no hay ningún negocio abierto con un plato pedible, se SALTA y
///   dice por qué, no falla por datos que no controla.
/// - Con la carta de las vistas previas (`-tindivo-fake-catalog`, solo DEBUG): no depende de la red ni de staging, así
///   que no se salta nunca. Es la que garantiza que Plato y Bolsa se recorren en cada corrida.
@MainActor
final class CatalogFlowUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
    }

    /// La bolsa de una corrida anterior (de otro negocio) abriría la pregunta de vaciarla. El reloj de la app se fija
    /// en un martes a las 20:00 de Lima: el horario nocturno no depende de cuándo corra.
    private func launch(fakeCatalog: Bool) {
        app.launchArguments = ["-tindivo-reset-cart", "-tindivo-now", "2026-07-07T20:00:00-05:00"]
        if fakeCatalog { app.launchArguments.append("-tindivo-fake-catalog") }
        app.launch()
    }

    func testAddADishWithTheFakeCatalog() throws {
        launch(fakeCatalog: true)
        try runFlow()
    }

    func testAddADishFromTheFirstOpenBusiness() throws {
        launch(fakeCatalog: false)
        try runFlow()
    }

    private func runFlow() throws {
        // Inicio
        XCTAssertTrue(app.staticTexts["¿Qué pedimos hoy?"].waitForExistence(timeout: 30), "Inicio no cargó")
        // Se prefieren los que el servidor dice abiertos; si ahora no hay ninguno (de día), sirve cualquier restaurante,
        // porque la carta decide con el reloj fijado.
        var openCards = query("home.business.open")
        if !openCards.firstMatch.waitForExistence(timeout: 20) { openCards = query("home.business.closed") }
        guard openCards.firstMatch.waitForExistence(timeout: 20) else {
            attach("01-inicio-sin-negocios-abiertos")
            throw XCTSkip("Staging no tiene ningún negocio abierto ahora mismo (o la lista no cargó): no hay flujo que probar.")
        }
        attach("01-inicio")

        // Negocio: se prueban hasta 3 abiertos, por si el primero no tiene platos pedibles.
        let candidates = min(openCards.count, 3)
        var dishName: String?
        for index in 0..<candidates {
            if index > 0 { openCards.element(boundBy: index).tap() } else { openCards.firstMatch.tap() }
            dishName = addFirstOrderableDish()
            if dishName != nil { break }
            goBack()
            XCTAssertTrue(openCards.firstMatch.waitForExistence(timeout: 10))
        }
        guard dishName != nil else {
            throw XCTSkip("Ninguno de los primeros negocios abiertos de staging tiene un plato que se pueda agregar sin opciones obligatorias.")
        }

        // «Ver mi bolsa»
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "No apareció «Ver mi bolsa»")
        attach("04-negocio-con-bolsa")
        bar.tap()

        // Bolsa
        let line = element("cart.line")
        XCTAssertTrue(line.waitForExistence(timeout: 10), "La línea no apareció en la bolsa")
        XCTAssertTrue(app.staticTexts[dishName ?? ""].exists, "La línea no es el plato que se agregó")
        attach("05-bolsa")
    }

    // MARK: Pasos

    /// Dentro de un negocio: abre el primer plato que no pida elegir opciones obligatorias y lo agrega. Devuelve su
    /// nombre, o `nil` si no encontró ninguno.
    private func addFirstOrderableDish() -> String? {
        let dishes = query("menu.dish")
        guard dishes.firstMatch.waitForExistence(timeout: 20) else {
            attach("02-negocio-sin-platos-pedibles")
            return nil
        }
        attach("02-negocio")
        for index in 0..<min(dishes.count, 8) {
            let dish = dishes.element(boundBy: index)
            if !dish.isHittable { app.swipeUp() }
            guard dish.isHittable else { continue }
            let name = dish.staticTexts.firstMatch.label
            dish.tap()
            let add = element("dish.add")
            guard add.waitForExistence(timeout: 5) else { continue }
            attach(index == 0 ? "03-plato" : "03-plato-\(index)")
            if add.isEnabled {
                add.tap()
                return name
            }
            // Pide opciones obligatorias: se cierra y se prueba el siguiente.
            element("dish.close").tap()
            _ = dishes.firstMatch.waitForExistence(timeout: 5)
        }
        return nil
    }

    private func goBack() {
        app.navigationBars.buttons.firstMatch.tap()
    }

    private func query(_ identifier: String) -> XCUIElementQuery {
        app.descendants(matching: .any).matching(identifier: identifier)
    }

    private func element(_ identifier: String) -> XCUIElement {
        query(identifier).firstMatch
    }

    private func attach(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
