import XCTest

/// El flujo crítico del cliente como invitado (SW-13, TST-6): Inicio → un negocio abierto con platos → un plato que se
/// pueda pedir → Agregar → «Ver bolsa» → la línea aparece en la bolsa.
///
/// Dos variantes:
/// - Contra staging: depende de lo que haya allí; si no hay ningún negocio abierto con un plato pedible, se SALTA y
///   dice por qué, no falla por datos que no controla.
/// - Con la carta de las vistas previas (`-tindivo-fake-catalog`, solo DEBUG): no depende de la red ni de staging, así
///   que no se salta nunca. Es la que garantiza que Plato y Bolsa se recorren en cada corrida.
@MainActor
final class CatalogFlowUITests: CatalogUITestCase {
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
        // CA-CAT-P7: el botón dice «Elige tu [grupo]» y, tocado, no agrega: lleva al grupo que falta.
        XCTAssertEqual(add.label, "Elige tu presa", "El botón debe nombrar el grupo obligatorio que falta")
        add.tap()
        XCTAssertTrue(element("dish.add").exists, "Tocar el botón con algo sin elegir no debe cerrar la ficha")
        XCTAssertEqual(element("dish.progress").label, "0 de 1 lista")
        let missing = element("dish.group.missing")
        XCTAssertTrue(missing.waitForExistence(timeout: 5), "No apareció «Falta elegir aquí»")
        XCTAssertEqual(missing.label, "Falta elegir aquí")
        app.staticTexts["Pecho"].firstMatch.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: missing)
        waitForExpectations(timeout: 10)
        XCTAssertTrue(add.label.hasPrefix("Agregar"), "Con «Pecho» elegido debe poder agregarse: \(add.label)")
        XCTAssertEqual(element("dish.progress").label, "1 de 1 lista")
        add.tap()
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "No apareció «Ver bolsa»")
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
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "No apareció «Ver bolsa»")
        bar.tap()
        XCTAssertTrue(element("cart.line").waitForExistence(timeout: 10), "La línea no apareció en la bolsa")
        XCTAssertTrue(app.staticTexts["Pollería Don Lucho"].exists, "La bolsa no es de Pollería Don Lucho")
        XCTAssertTrue(app.staticTexts["Chicha morada"].exists, "La línea no es «Chicha morada»")
        XCTAssertFalse(app.staticTexts["Arroz chaufa"].exists, "Sigue el plato del otro negocio")
    }

    /// Un plato con franja hasta las 20:20: con la ficha abierta, al pasar el reloj de la app de las 20:20 la ficha se
    /// cierra sola. El reloj lo mueve la prueba (`-tindivo-now-file`): no depende de la velocidad del simulador.
    func testTheDishClosesItselfWhenItsWindowEnds() throws {
        let clockFile = NSTemporaryDirectory() + "tindivo-now-\(UUID().uuidString).txt"
        try "2026-07-07T19:30:00-05:00".write(toFile: clockFile, atomically: true, encoding: .utf8)
        launch(fakeCatalog: true, nowFile: clockFile)
        openDonLucho()
        let dish = dishRow("Chicha de la noche")
        XCTAssertTrue(dish.waitForExistence(timeout: 30), "No está «Chicha de la noche» a las 19:30")
        dish.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10))
        try "2026-07-07T20:21:00-05:00".write(toFile: clockFile, atomically: true, encoding: .utf8)
        XCTAssertTrue(element("dish.add").waitForNonExistence(timeout: 20), "La ficha siguió abierta pasada su franja")
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
        XCTAssertTrue(bar.isHittable, "La barra «Ver bolsa» no se puede tocar")
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
        // Cada botón de cantidad lleva su identificador: el «−» (tacho con 1 unidad) de la segunda línea es el segundo
        // «cart.decrease». «Quitar» (texto) es otro botón, «cart.remove».
        let decrease = app.buttons.matching(identifier: "cart.decrease").element(boundBy: 1)
        XCTAssertTrue(decrease.waitForExistence(timeout: 5), "No está el «−» de la segunda línea")
        // Con letra grande la segunda línea queda cortada por el borde: se sube la lista para tocar su centro.
        app.swipeUp()
        XCTAssertTrue(decrease.isHittable, "El «−» de la segunda línea no se puede tocar")
        XCTAssertEqual(decrease.label, "Quitar Chicha morada")
        decrease.tap()
        XCTAssertTrue(element("cart.undo").waitForExistence(timeout: 5), "No apareció «Deshacer»")
        XCTAssertTrue(element("cart.undo.progress").exists, "Sin VoiceOver el aviso lleva la raya de su plazo")
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
            throw XCTSkip(
                "Staging no tiene ningún negocio abierto ahora mismo (o la lista no cargó): no hay flujo que probar.")
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
            throw XCTSkip(
                "Ninguno de los primeros negocios abiertos de staging tiene un plato que se pueda agregar sin opciones obligatorias."
            )
        }

        // «Ver bolsa»
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "No apareció «Ver bolsa»")
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
            // Con algo obligatorio sin elegir el botón dice «Elige …» (y, tocado, solo lleva al grupo).
            if add.label.hasPrefix("Agregar") {
                add.tap()
                return name
            }
            // Pide opciones obligatorias: se cierra y se prueba el siguiente.
            element("dish.close").tap()
            _ = dishes.firstMatch.waitForExistence(timeout: 5)
        }
        return nil
    }

}
