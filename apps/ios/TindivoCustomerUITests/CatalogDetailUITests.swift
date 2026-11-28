import XCTest

/// Las pantallas del catálogo con su detalle: la barra de Inicio, la cabecera de la carta sin información ni modos, las
/// tarjetas cerradas, «Elige tu [grupo]», el «+» de «Destacados» y «Editar» con VoiceOver. El flujo crítico está en
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

        // Una unidad en la bolsa (el «+» de «Destacados» abre la ficha de «Chicha morada»; «Agregar» la guarda) y la
        // insignia lo cuenta.
        openDonLucho()
        let plus = app.buttons["Agregar Chicha morada"]
        XCTAssertTrue(plus.waitForExistence(timeout: 20), "No está el «+» de «Destacados»")
        plus.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10), "El «+» no abrió la ficha")
        element("dish.add").tap()
        XCTAssertTrue(element("business.cartBar").waitForExistence(timeout: 10), "No apareció «Ver bolsa»")
        goBack()
        XCTAssertTrue(element("home.bag.badge").waitForExistence(timeout: 10), "No apareció la insignia de la bolsa")
        XCTAssertEqual(element("home.bag").label, "Bolsa, 1 producto")
        attach("cus-cat-030-barra-con-bolsa")
    }

    /// CUS-CAT-017, CUS-CAT-027 y CUS-CAT-029: la cabecera de la carta no lleva «Información del negocio ›» ni los modos
    /// de entrega, y las filas de plato no llevan control: el «+» solo está en «Destacados».
    func testBusinessPageHasNoInfoRowNoModesAndNoRowControls() throws {
        launch(fakeCatalog: true)
        openDonLucho()
        XCTAssertTrue(dishRow("Chicha morada").waitForExistence(timeout: 20), "La carta no cargó")
        XCTAssertTrue(element("business.status").exists, "Falta el estado bajo el nombre")
        XCTAssertFalse(element("business.infoRow").exists, "Sobra la fila «Información del negocio»")
        XCTAssertFalse(element("business.modes").exists, "Sobran las líneas de modos de entrega")
        XCTAssertEqual(app.segmentedControls.count, 0, "No debe haber selector")
        XCTAssertFalse(app.buttons["Delivery"].exists)
        XCTAssertFalse(app.buttons["Recojo"].exists)
        for identifier in ["menu.choose", "menu.edit", "menu.increase", "menu.decrease"] {
            XCTAssertFalse(element(identifier).exists, "Sobra el control de fila \(identifier)")
        }
        XCTAssertEqual(query("menu.add").count, 2, "Solo «Destacados» (2 platos) lleva «+»")
        attach("cus-cat-017-029-cabecera-y-filas")
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

    /// CUS-CAT-012, como `ClosedBar` de Android: la carta de un negocio cerrado lleva «Cerrado ahora» bajo el nombre y,
    /// abajo, la barra que dice cuándo abre.
    func testClosedBusinessShowsThePillAndWhenItOpens() throws {
        launch(fakeCatalog: true)
        XCTAssertTrue(app.staticTexts["¿Qué pedimos hoy?"].waitForExistence(timeout: 30), "Inicio no cargó")
        let card = element("home.business.closed")
        XCTAssertTrue(card.waitForExistence(timeout: 20), "No hay tarjeta cerrada")
        card.tap()
        let pill = element("business.status")
        XCTAssertTrue(pill.waitForExistence(timeout: 20), "Falta la píldora de cerrado")
        XCTAssertEqual(pill.label, "Cerrado ahora")
        let bar = element("business.closedBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "Falta la barra de cerrado")
        XCTAssertTrue(bar.label.contains("Cerrado ahora"), "La barra dice: \(bar.label)")
        XCTAssertTrue(bar.label.contains("Abre mañana a las 12:00"), "La barra dice: \(bar.label)")
    }

    /// CUS-CRT-009 y CUS-CRT-015: con la bolsa revisada «Continuar» lleva el mismo monto que el subtotal, se puede tocar
    /// y, como iOS aún no tiene checkout, lleva a «Próximamente».
    func testContinueFromTheBagLeadsToComingSoon() throws {
        launch(fakeCatalog: true)
        openDonLucho()
        app.buttons["Agregar Chicha morada"].tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10), "No se abrió el plato")
        element("dish.add").tap()
        let bar = element("business.cartBar")
        XCTAssertTrue(bar.waitForExistence(timeout: 10), "No apareció «Ver bolsa»")
        bar.tap()
        let next = element("cart.continue")
        XCTAssertTrue(next.waitForExistence(timeout: 10), "Falta «Continuar»")
        expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: next)
        waitForExpectations(timeout: 20)
        XCTAssertTrue(next.label.hasPrefix("Continuar"), "«Continuar» dice: \(next.label)")
        // El formato de Perú separa «S/» del monto con un espacio que no se parte (U+00A0).
        let spoken = next.label.replacingOccurrences(of: "\u{00A0}", with: " ")
        XCTAssertTrue(spoken.contains("S/ 5.00"), "El monto no es el del subtotal: \(next.label)")
        next.tap()
        XCTAssertTrue(element("comingSoon.checkout").waitForExistence(timeout: 10), "No llegó a «Próximamente»")
    }

    /// El gesto de volver desde el borde funciona sin la barra del sistema, pero no mientras se busca: ahí «Volver»
    /// cierra primero la búsqueda (`BackHandler(enabled = searching)` de Android).
    func testEdgeSwipeGoesBackExceptWhileSearching() throws {
        launch(fakeCatalog: true)
        openDonLucho()
        XCTAssertTrue(dishRow("Chicha morada").waitForExistence(timeout: 20), "La carta no cargó")
        element("menu.searchButton").tap()
        XCTAssertTrue(element("menu.searchField").waitForExistence(timeout: 10), "No se abrió la búsqueda")
        swipeFromLeftEdge()
        XCTAssertTrue(element("menu.searchField").waitForExistence(timeout: 3), "El gesto cerró la carta buscando")
        app.buttons["Volver"].firstMatch.tap()
        XCTAssertTrue(dishRow("Chicha morada").waitForExistence(timeout: 10), "No volvió a la carta")
        swipeFromLeftEdge()
        XCTAssertTrue(app.staticTexts["¿Qué pedimos hoy?"].waitForExistence(timeout: 10), "El gesto no volvió a Inicio")
    }

    private func swipeFromLeftEdge() {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5)))
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

    /// CA-CRT-14: con la carta caída la bolsa avisa «No pudimos revisar la carta. Toca Reintentar.»; un reintento que
    /// vuelve a fallar (el gancho cuenta un intento más) deja el aviso, y uno que funciona lo quita sin perder la línea.
    /// «Continuar» pasa a «Reintentar»; que no avance con la carta sin revisar lo prueba `CartContinueTests`.
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
        attach("ca-crt-14-reintentar")

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

    /// A8: el «+» de «Destacados» con la bolsa de otro restaurante abre la ficha, y es «Agregar» quien pregunta.
    func testFeaturedPlusWithAnotherBagAsksFromTheDish() throws {
        launch(fakeCatalog: true, seedOtherBag: true)
        openDonLucho()
        let plus = app.buttons["Agregar Chicha morada"]
        XCTAssertTrue(plus.waitForExistence(timeout: 30))
        plus.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10), "El «+» debe abrir la ficha")
        XCTAssertFalse(app.alerts.buttons["Vaciar y empezar"].exists, "Pregunta antes de «Agregar»")
        element("dish.add").tap()
        let replace = app.alerts.buttons["Vaciar y empezar"]
        XCTAssertTrue(replace.waitForExistence(timeout: 10), "No apareció la pregunta de la bolsa nueva")
        replace.tap()
        XCTAssertTrue(element("business.cartBar").waitForExistence(timeout: 10), "No quedó el plato en la bolsa nueva")
    }

    /// Recorre Inicio, Negocio y Plato y deja una captura de cada uno, en tamaño normal y en
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
        openDonLucho()
        let dish = dishRow("1/4 de pollo")
        XCTAssertTrue(dish.waitForExistence(timeout: 30), "No está «1/4 de pollo»")
        attach("\(prefix)-2-negocio")
        dish.tap()
        XCTAssertTrue(element("dish.add").waitForExistence(timeout: 10))
        attach("\(prefix)-3-plato-incompleto")
        element("dish.add").tap()
        attach("\(prefix)-4-plato-tras-tocar-el-boton")
        app.staticTexts["Pecho"].firstMatch.tap()
        attach("\(prefix)-5-plato-completo")
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
