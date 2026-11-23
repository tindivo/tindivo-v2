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
    private func launch(
        fakeCatalog: Bool, seedOtherBag: Bool = false, fastClock: Bool = false, largeType: Bool = false,
        now: String = "2026-07-07T20:00:00-05:00", nowFile: String? = nil
    ) {
        // El plazo de «Deshacer» se alarga (solo DEBUG) para que el toque no dependa de la velocidad del simulador.
        app.launchArguments = [
            "-tindivo-reset-cart", "-tindivo-now", now, "-tindivo-undo-seconds", "60",
        ]
        if let nowFile { app.launchArguments += ["-tindivo-now-file", nowFile] }
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
        // CUS-CAT-033 (texto por aprobar): el botón nombra el grupo que falta y, tocado, no agrega: lleva a él.
        XCTAssertEqual(add.label, "Elige Presa", "El botón debe nombrar el grupo obligatorio que falta")
        add.tap()
        XCTAssertTrue(element("dish.add").exists, "Tocar el botón con algo sin elegir no debe cerrar la ficha")
        XCTAssertEqual(element("dish.progress").label, "0 de 1 lista")
        app.staticTexts["Pecho"].firstMatch.tap()
        XCTAssertTrue(add.label.hasPrefix("Agregar"), "Con «Pecho» elegido debe poder agregarse: \(add.label)")
        XCTAssertEqual(element("dish.progress").label, "1 de 1 lista")
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
        XCTAssertTrue(bar.isHittable, "La barra «Ver mi bolsa» no se puede tocar")
        bar.tap()
        XCTAssertTrue(element("cart.line").waitForExistence(timeout: 10))
        attach("ax5-bolsa")
    }

    /// CUS-CAT-030 (★): la barra de Inicio tiene el logo y la bolsa, siempre visible, también vacía; sin sesión no hay
    /// chip «Entregar en»; tocar la bolsa abre la bolsa, y con una unidad en ella la insignia dice «1».
    func testHomeTopBarShowsTheLogoAndTheBagEvenWhenEmpty() throws {
        launch(fakeCatalog: true)
        XCTAssertTrue(app.staticTexts["¿Qué pedimos hoy?"].waitForExistence(timeout: 30), "Inicio no cargó")
        XCTAssertTrue(element("home.topBar").exists, "No está la barra superior")
        XCTAssertTrue(element("home.logo").exists, "No está el logo")
        let bag = element("home.bag")
        XCTAssertTrue(bag.exists, "La bolsa debe verse también vacía")
        XCTAssertEqual(bag.label, "Bolsa")
        XCTAssertFalse(element("home.bag.badge").exists, "Con la bolsa vacía no hay insignia")
        XCTAssertFalse(element("home.deliveryChip").exists, "Sin sesión ni dirección el chip no se muestra")
        attach("cus-cat-030-barra-vacia")
        bag.tap()
        XCTAssertTrue(app.staticTexts["Tu bolsa está vacía"].waitForExistence(timeout: 10), "Tocar la bolsa no abrió la bolsa")
        goBack()

        // Una unidad en la bolsa (el «+» de la tarjeta de «Chicha morada») y la insignia lo cuenta.
        openDonLucho()
        let plus = element("menu.add")
        XCTAssertTrue(plus.waitForExistence(timeout: 20), "No está el «+» de la tarjeta")
        plus.tap()
        XCTAssertTrue(element("menu.increase").waitForExistence(timeout: 10), "La tarjeta no pasó a «− 1 +»")
        goBack()
        XCTAssertTrue(element("home.bag.badge").waitForExistence(timeout: 10), "No apareció la insignia de la bolsa")
        XCTAssertEqual(element("home.bag").label, "Bolsa, 1 producto")
        attach("cus-cat-030-barra-con-bolsa")
    }

    /// CUS-CAT-027 y CA-CAT-P6: la fila «Información del negocio ›» abre la hoja con los siete días, hoy resaltado y
    /// «Cerrado» el día sin turno; sin contacto.
    func testBusinessInfoSheetListsTheWeek() throws {
        launch(fakeCatalog: true)
        openDonLucho()
        let row = element("business.infoRow")
        XCTAssertTrue(row.waitForExistence(timeout: 20), "No está la fila «Información del negocio»")
        row.tap()
        XCTAssertTrue(element("info.day.today").waitForExistence(timeout: 10), "La hoja no marca el día de hoy")
        XCTAssertEqual(query("info.day").count + query("info.day.today").count, 7)
        XCTAssertTrue(element("info.day.today").label.contains("Martes"), "El reloj fijado es martes")
        XCTAssertFalse(app.buttons["Llamar"].exists, "La hoja no lleva datos de contacto")
        // «Cómo pagas» con el texto fijo de la ficha.
        XCTAssertTrue(element("info.payments").exists, "Falta «Cómo pagas»")
        XCTAssertTrue(app.staticTexts["Pagas directo al negocio. Tindivo no retiene tu dinero"].exists)
        attach("info-del-negocio")
    }

    /// CUS-CAT-017 en la página del negocio: una fila informativa con los modos que acepta, sin selector.
    func testBusinessPageShowsTheDeliveryModesWithoutASelector() throws {
        launch(fakeCatalog: true)
        openDonLucho()
        let modes = element("business.modes")
        XCTAssertTrue(modes.waitForExistence(timeout: 20), "No está la fila de modos de entrega")
        XCTAssertTrue(modes.label.contains("Delivery · 25–40 min"), modes.label)
        XCTAssertTrue(modes.label.contains("Recojo · En el local"), modes.label)
        XCTAssertEqual(app.segmentedControls.count, 0, "No debe haber selector")
        XCTAssertFalse(app.buttons["Delivery"].exists)
        XCTAssertFalse(app.buttons["Recojo"].exists)
        attach("cus-cat-017-modos")
    }

    /// CA-CAT-P2: la tarjeta de un negocio cerrado dice «Cerrado · abre [día] [hora]» (con el horario de su carta).
    func testClosedCardSaysWhenItOpens() throws {
        launch(fakeCatalog: true)
        XCTAssertTrue(app.staticTexts["¿Qué pedimos hoy?"].waitForExistence(timeout: 30), "Inicio no cargó")
        let closed = element("home.business.closed")
        XCTAssertTrue(closed.waitForExistence(timeout: 20), "No hay tarjeta cerrada")
        let predicate = NSPredicate(format: "label CONTAINS %@", "Cerrado · abre mañana 12:00")
        expectation(for: predicate, evaluatedWith: closed)
        waitForExpectations(timeout: 20)
        attach("ca-cat-p2-tarjeta-cerrada")
    }

    /// «Elige [grupo]» (texto por aprobar): con letra grande el grupo que falta queda fuera de pantalla; al tocar el
    /// botón la vista lo trae y queda a la vista.
    func testTappingChooseBringsTheMissingGroupIntoView() throws {
        launch(fakeCatalog: true, largeType: true)
        openDonLucho()
        let dish = dishRow("1/4 de pollo")
        XCTAssertTrue(dish.waitForExistence(timeout: 30))
        dish.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10))
        let group = app.staticTexts["Presa"].firstMatch
        XCTAssertTrue(group.exists)
        XCTAssertFalse(group.isHittable, "Con letra grande «Presa» empieza fuera de pantalla")
        element("dish.add").tap()
        expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: group)
        waitForExpectations(timeout: 10)
        attach("ax5-elige-grupo-visible")
    }

    /// A8: «+» en la carta con la bolsa de otro restaurante pregunta ahí mismo.
    func testPlusWithAnotherBagAsksFromTheMenu() throws {
        launch(fakeCatalog: true, seedOtherBag: true)
        openDonLucho()
        let plus = element("menu.add")
        XCTAssertTrue(plus.waitForExistence(timeout: 30))
        plus.tap()
        let replace = app.alerts.buttons["Vaciar y empezar"]
        XCTAssertTrue(replace.waitForExistence(timeout: 10), "No apareció la pregunta de la bolsa nueva")
        XCTAssertFalse(element("dish.add").exists, "No debe abrir la ficha")
        replace.tap()
        XCTAssertTrue(element("business.cartBar").waitForExistence(timeout: 10), "No quedó el plato en la bolsa nueva")
    }

    /// Recorre Inicio, Negocio (con la hoja de información) y Plato y deja una captura de cada uno, en tamaño normal y en
    /// AX5, para revisarlas a ojo.
    func testCatalogScreens() throws {
        launch(fakeCatalog: true)
        try visitCatalogScreens(prefix: "normal")
    }

    func testCatalogScreensWithTheLargestType() throws {
        launch(fakeCatalog: true, largeType: true)
        try visitCatalogScreens(prefix: "ax5")
    }

    private func visitCatalogScreens(prefix: String) throws {
        XCTAssertTrue(app.staticTexts["¿Qué pedimos hoy?"].waitForExistence(timeout: 60), "Inicio no cargó")
        XCTAssertTrue(element("home.bag").waitForExistence(timeout: 10))
        attach("\(prefix)-1-inicio")
        let card = app.staticTexts["Pollería Don Lucho"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20))
        card.tap()
        let row = element("business.infoRow")
        XCTAssertTrue(row.waitForExistence(timeout: 30), "No está la fila de información")
        attach("\(prefix)-2-negocio")
        row.tap()
        XCTAssertTrue(element("info.day.today").waitForExistence(timeout: 10))
        attach("\(prefix)-3-informacion")
        let close = element("info.close")
        if close.waitForExistence(timeout: 5) { close.tap() }
        let dish = dishRow("1/4 de pollo")
        XCTAssertTrue(dish.waitForExistence(timeout: 20), "No está «1/4 de pollo»")
        dish.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10))
        attach("\(prefix)-4-plato-incompleto")
        element("dish.add").tap()
        attach("\(prefix)-5-plato-tras-tocar-el-boton")
        app.staticTexts["Pecho"].firstMatch.tap()
        attach("\(prefix)-6-plato-completo")
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
