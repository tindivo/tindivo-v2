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
    private func launch(fakeCatalog: Bool, seedOtherBag: Bool = false, fastClock: Bool = false, largeType: Bool = false) {
        // El plazo de «Deshacer» se alarga (solo DEBUG) para que el toque no dependa de la velocidad del simulador.
        app.launchArguments = [
            "-tindivo-reset-cart", "-tindivo-now", "2026-07-07T20:00:00-05:00", "-tindivo-undo-seconds", "60",
        ]
        if largeType {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        }
        if fastClock { app.launchArguments.append("-tindivo-clock-fast") }
        if seedOtherBag { app.launchArguments.append("-tindivo-seed-other-bag") }
        if fakeCatalog { app.launchArguments.append("-tindivo-fake-catalog") }
        app.launch()
    }

    func testAddADishWithTheFakeCatalog() throws {
        launch(fakeCatalog: true)
        try runFlow()
    }

    /// Flujo A: un plato con grupo obligatorio («Presa») → elegir «Pecho» → Agregar → la bolsa lo muestra.
    func testRequiredOptionFlowWithTheFakeCatalog() throws {
        launch(fakeCatalog: true)
        openDonLucho()
        let dish = dishRow("1/4 de pollo")
        XCTAssertTrue(dish.waitForExistence(timeout: 20), "No está «1/4 de pollo»")
        dish.tap()
        let add = element("dish.add")
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        XCTAssertFalse(add.isEnabled, "Con la presa sin elegir no se puede agregar")
        app.staticTexts["Pecho"].firstMatch.tap()
        XCTAssertTrue(add.isEnabled, "Con «Pecho» elegido debe poder agregarse")
        add.tap()
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "No apareció «Ver mi bolsa»")
        bar.tap()
        XCTAssertTrue(element("cart.line").waitForExistence(timeout: 10), "La línea no apareció en la bolsa")
        XCTAssertTrue(app.staticTexts["Presa: Pecho"].exists, "La línea no muestra «Presa: Pecho»")
    }

    /// Flujo B: la bolsa es de otro negocio; «Vaciar y empezar» debe dejar la línea nueva en una bolsa de Don Lucho.
    func testReplaceTheBagOfAnotherBusinessWithTheFakeCatalog() throws {
        launch(fakeCatalog: true, seedOtherBag: true)
        openDonLucho()
        let dish = dishRow("Chicha morada")
        XCTAssertTrue(dish.waitForExistence(timeout: 20), "No está «Chicha morada»")
        dish.tap()
        let add = element("dish.add")
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        add.tap()
        let replace = app.alerts.buttons["Vaciar y empezar"]
        XCTAssertTrue(replace.waitForExistence(timeout: 5), "No apareció la pregunta de vaciar la bolsa")
        replace.tap()
        XCTAssertTrue(element("dish.add").waitForNonExistence(timeout: 10), "La ficha no se cerró")
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "No apareció «Ver mi bolsa»")
        bar.tap()
        XCTAssertTrue(element("cart.line").waitForExistence(timeout: 10), "La línea no apareció en la bolsa")
        XCTAssertTrue(app.staticTexts["Pollería Don Lucho"].exists, "La bolsa no es de Pollería Don Lucho")
        XCTAssertTrue(app.staticTexts["Chicha morada"].exists, "La línea no es «Chicha morada»")
        XCTAssertFalse(app.staticTexts["Arroz chaufa"].exists, "Sigue el plato del otro negocio")
    }

    /// Un plato con franja hasta las 20:20: con la ficha abierta entre 20:00 y 20:20 (reloj acelerado, un minuto por segundo),
    /// al salir de la franja la ficha se cierra sola y la carta ya no deja abrirlo.
    func testTheDishClosesItselfWhenItsWindowEnds() throws {
        launch(fakeCatalog: true, fastClock: true)
        openDonLucho()
        let dish = dishRow("Chicha de la noche")
        XCTAssertTrue(dish.waitForExistence(timeout: 20), "No está «Chicha de la noche» a las 20:00")
        dish.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 5))
        XCTAssertTrue(element("dish.add").waitForNonExistence(timeout: 30), "La ficha siguió abierta pasada su franja")
    }

    /// Con la letra más grande (AX5): el flujo se recorre igual y las pantallas quedan adjuntas para revisarlas a ojo.
    func testTheFlowWithTheLargestType() throws {
        launch(fakeCatalog: true, largeType: true)
        openDonLucho()
        let dish = dishRow("1/4 de pollo")
        XCTAssertTrue(dish.waitForExistence(timeout: 20))
        dish.tap()
        let add = element("dish.add")
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        attach("ax5-plato-incompleto")
        app.staticTexts["Pecho"].firstMatch.tap()
        attach("ax5-plato-completo")
        add.tap()
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10))
        attach("ax5-negocio-con-bolsa")
        XCTAssertTrue(bar.isHittable, "La barra «Ver mi bolsa» no se puede tocar")
        bar.tap()
        XCTAssertTrue(element("cart.line").waitForExistence(timeout: 10))
        attach("ax5-bolsa")
    }

    /// La bolsa con la letra más grande (AX5): «−» con 1 unidad quita el plato, «Deshacer» lo devuelve a su sitio y
    /// «Editar» (solo en el plato con opciones) abre la ficha con lo elegido. Las pantallas quedan adjuntas.
    func testRemoveUndoAndEditInTheBagWithTheLargestType() throws {
        launch(fakeCatalog: true, largeType: true)
        openDonLucho()
        let pollo = dishRow("1/4 de pollo")
        XCTAssertTrue(pollo.waitForExistence(timeout: 20))
        pollo.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 5))
        app.staticTexts["Pecho"].firstMatch.tap()
        element("dish.add").tap()
        let chicha = dishRow("Chicha morada")
        XCTAssertTrue(chicha.waitForExistence(timeout: 10))
        chicha.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 5))
        element("dish.add").tap()
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10))
        bar.tap()
        XCTAssertTrue(element("cart.line").waitForExistence(timeout: 10))
        XCTAssertEqual(query("cart.line").count, 2, "La bolsa debía tener dos platos")
        attach("ax5-bolsa-dos-platos")

        // Con 1 unidad, «−» quita el plato y aparece «Deshacer».
        // Los botones de cantidad llevan el identificador «cart.stepper» (primero «−», luego «+» de cada línea): el «−»
        // de la segunda línea es el tercero. «Quitar» (texto) es otro botón, «cart.remove».
        app.buttons.matching(identifier: "cart.stepper").element(boundBy: 2).tap()
        XCTAssertTrue(element("cart.undo").waitForExistence(timeout: 5), "No apareció «Deshacer»")
        XCTAssertEqual(query("cart.line").count, 1)
        attach("ax5-bolsa-deshacer")
        element("cart.undo").tap()
        XCTAssertTrue(element("cart.undo").waitForNonExistence(timeout: 5))
        XCTAssertEqual(query("cart.line").count, 2, "«Deshacer» no devolvió el plato")

        // «Editar» solo en el plato con opciones: abre la ficha.
        XCTAssertEqual(query("cart.edit").count, 1)
        element("cart.edit").tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10), "«Editar» no abrió el plato")
        attach("ax5-bolsa-editar")
        element("dish.close").tap()
        XCTAssertTrue(element("cart.line").waitForExistence(timeout: 5))
        attach("ax5-bolsa-despues-de-editar")
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

    private func dishRow(_ name: String) -> XCUIElement {
        query("menu.dish").containing(.staticText, identifier: name).firstMatch
    }

    private func openDonLucho() {
        XCTAssertTrue(app.staticTexts["¿Qué pedimos hoy?"].waitForExistence(timeout: 30), "Inicio no cargó")
        let card = app.staticTexts["Pollería Don Lucho"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20), "No está Pollería Don Lucho en Inicio")
        card.tap()
    }

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
