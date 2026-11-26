import XCTest

/// Las pantallas del catálogo con su detalle: la barra de Inicio, la hoja de información, los modos de entrega, las
/// tarjetas cerradas, «Elige tu [grupo]», el «+» de la carta y «Editar» con VoiceOver. El flujo crítico está en
/// `CatalogFlowUITests`.
@MainActor
final class CatalogDetailUITests: CatalogUITestCase {
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
        XCTAssertTrue(
            app.staticTexts["Tu bolsa está vacía"].waitForExistence(timeout: 10), "Tocar la bolsa no abrió la bolsa")
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

    /// CA-CAT-P7, «Elige tu [grupo]»: con letra grande el grupo que falta queda fuera de pantalla; al tocar el
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

    /// CA-CRT-05b: con la carta caída la bolsa avisa «No pudimos revisar la carta. Toca Reintentar.»; un reintento que
    /// vuelve a fallar (el gancho cuenta un intento más) deja el aviso, y uno que funciona lo quita sin perder la línea.
    /// Que «Continuar» no avance con la carta sin revisar se prueba solo en el modelo: ese botón aún no existe en iOS.
    func testBagWithTheMenuDownOffersRetryAndRecovers() throws {
        let failFile = NSTemporaryDirectory() + "tindivo-fail-menu-\(UUID().uuidString).txt"
        defer { try? FileManager.default.removeItem(atPath: failFile) }
        launch(fakeCatalog: true, failMenuFile: failFile)
        openDonLucho()
        let dish = dishRow("Chicha morada")
        XCTAssertTrue(dish.waitForExistence(timeout: 20), "No está «Chicha morada»")
        dish.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 5))
        element("dish.add").tap()
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "No apareció «Ver bolsa»")

        // La carta cae justo antes de abrir la bolsa.
        FileManager.default.createFile(atPath: failFile, contents: Data())
        bar.tap()
        let notice = element("cart.unchecked")
        XCTAssertTrue(notice.waitForExistence(timeout: 20), "No apareció el aviso de la carta caída")
        XCTAssertEqual(notice.label, "No pudimos revisar la carta. Toca Reintentar.")
        let retry = element("cart.retry")
        XCTAssertTrue(retry.exists, "Falta «Reintentar»")
        attach("ca-crt-05b-reintentar")

        // Reintento con la carta aún caída: el gancho suma un byte por cada intento fallido, así que el toque tiene que
        // subir la cuenta (si no hiciera nada, la prueba falla aquí) y el aviso sigue.
        let attempts = { (try? FileManager.default.attributesOfItem(atPath: failFile)[.size] as? Int) ?? 0 }
        let before = attempts()
        XCTAssertGreaterThan(before, 0, "La bolsa debió pedir la carta al abrirse")
        retry.tap()
        expectation(for: NSPredicate { _, _ in attempts() > before }, evaluatedWith: nil)
        waitForExpectations(timeout: 10)
        XCTAssertTrue(notice.exists, "El aviso debe seguir tras un reintento fallido")
        XCTAssertTrue(retry.exists, "«Reintentar» debe seguir tras un reintento fallido")

        // La carta vuelve. La app no vuelve a pedirla sola: el aviso sigue hasta que se toca «Reintentar» (guarda contra
        // una recarga automática que haría verde este paso sin el botón).
        try FileManager.default.removeItem(atPath: failFile)
        XCTAssertTrue(notice.waitForNonExistence(timeout: 2) == false, "El aviso se quitó solo, sin tocar «Reintentar»")
        retry.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: notice)
        waitForExpectations(timeout: 20)
        XCTAssertTrue(element("cart.line").exists, "La línea de la bolsa debe seguir a la vista")
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

    /// Con VoiceOver, abrir «Editar» (una ficha a pantalla completa) y cerrarla sin guardar NO borra el aviso de
    /// «Deshacer»: abrir la ficha no es salir de la bolsa y cerrarla sin guardar no cambió nada.
    func testClosingEditWithoutSavingKeepsTheUndoWithVoiceOver() throws {
        launch(fakeCatalog: true, voiceOver: true)
        openDonLucho()
        let pollo = dishRow("1/4 de pollo")
        XCTAssertTrue(pollo.waitForExistence(timeout: 30))
        pollo.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10))
        app.staticTexts["Pecho"].firstMatch.tap()
        element("dish.add").tap()
        let chicha = dishRow("Chicha morada")
        XCTAssertTrue(chicha.waitForExistence(timeout: 10))
        chicha.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10))
        element("dish.add").tap()
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10))
        bar.tap()
        XCTAssertTrue(element("cart.line").waitForExistence(timeout: 10))
        let decrease = app.buttons.matching(identifier: "cart.decrease").element(boundBy: 1)
        XCTAssertTrue(decrease.waitForExistence(timeout: 5))
        decrease.tap()
        XCTAssertTrue(element("cart.undo").waitForExistence(timeout: 5), "No apareció «Deshacer»")
        // Solo con VoiceOver el aviso no se cierra solo y no lleva la raya que se vacía: si el gancho
        // `-tindivo-voiceover` no estuviera activo, la raya estaría (en las pruebas sin el gancho sí está).
        XCTAssertFalse(
            element("cart.undo.progress").exists, "El gancho -tindivo-voiceover no está activo: hay raya de plazo")
        element("cart.edit").tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10), "«Editar» no abrió el plato")
        element("dish.close").tap()
        XCTAssertTrue(element("dish.add").waitForNonExistence(timeout: 10))
        XCTAssertTrue(element("cart.undo").exists, "Cerrar «Editar» sin guardar no debe borrar «Deshacer»")
        attach("voiceover-editar-cerrar-deshacer")
    }
}
