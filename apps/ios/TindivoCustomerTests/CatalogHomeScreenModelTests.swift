import Foundation
import Testing
import TindivoAPI
@testable import TindivoCustomer

@MainActor
@Suite("Inicio")
struct CatalogHomeScreenModelTests {
    @Test("carga, separa los de WhatsApp y marca los cerrados")
    func loads() async {
        let catalog = StubCatalog(
            businesses: Script(just: [
                summary("a"), summary("b", open: false), summary("c", capability: .catalogOnly),
            ]))
        let model = CatalogHomeScreenModel(catalog: catalog)
        #expect(model.state == .idle)
        await model.load()
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded: \(model.state)")
            return
        }
        #expect(loaded.listing.restaurants.map(\.id) == ["a", "b"])
        #expect(loaded.listing.restaurants.map(\.closed) == [false, true])
        #expect(loaded.listing.whatsapp.map(\.id) == ["c"])
        #expect(!loaded.refreshing)
        #expect(loaded.refreshFailed == nil)
    }

    @Test("una lista vacía es un estado cargado, no un error")
    func empty() async {
        let model = CatalogHomeScreenModel(catalog: StubCatalog(businesses: Script(just: [])))
        await model.load()
        #expect(model.state == .loaded(.init(listing: HomeListing(restaurants: [], whatsapp: []))))
    }

    @Test("sin red la primera carga queda en error")
    func firstLoadFails() async {
        let model = CatalogHomeScreenModel(catalog: StubCatalog(businesses: Script(failing: .network)))
        await model.load()
        #expect(model.state == .failed(.network))
    }

    @Test("Reintentar tras un error vuelve a pedir y carga")
    func retryAfterFailure() async {
        let catalog = StubCatalog(businesses: Script([.failure(.network), .success([summary("a")])]))
        let model = CatalogHomeScreenModel(catalog: catalog)
        await model.load()
        #expect(model.state == .failed(.network))
        await model.refresh()
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded: \(model.state)")
            return
        }
        #expect(loaded.listing.restaurants.map(\.id) == ["a"])
    }

    @Test("una recarga que falla conserva la lista y marca el error")
    func refreshFailureKeepsList() async {
        let catalog = StubCatalog(businesses: Script([.success([summary("a")]), .failure(.network)]))
        let model = CatalogHomeScreenModel(catalog: catalog)
        await model.load()
        await model.refresh()
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded: \(model.state)")
            return
        }
        #expect(loaded.listing.restaurants.map(\.id) == ["a"])
        #expect(loaded.refreshFailed == .network)
        #expect(!loaded.refreshing)
    }

    @Test("una recarga que sale bien borra el aviso de la anterior")
    func refreshSuccessClearsNotice() async {
        let catalog = StubCatalog(
            businesses: Script([
                .success([summary("a")]), .failure(.network), .success([summary("a"), summary("b")]),
            ]))
        let model = CatalogHomeScreenModel(catalog: catalog)
        await model.load()
        await model.refresh()
        await model.refresh()
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded: \(model.state)")
            return
        }
        #expect(loaded.listing.restaurants.count == 2)
        #expect(loaded.refreshFailed == nil)
    }

    @Test("volver a la pantalla con la lista cargada no la vuelve a pedir")
    func loadIsOnlyTheFirstTime() async {
        let businesses = Script(just: [summary("a")])
        let model = CatalogHomeScreenModel(catalog: StubCatalog(businesses: businesses))
        await model.load()
        await model.load()
        #expect(businesses.calls == 1)
    }

    @Test("una carga en curso no deja lanzar otra")
    func noSecondLoadWhileInFlight() async {
        let gate = Gate()
        let businesses = Script(just: [summary("a")])
        let model = CatalogHomeScreenModel(catalog: StubCatalog(businesses: businesses, gate: gate))
        let first = Task { await model.refresh() }
        await eventually { model.state == .loading }
        await model.refresh()
        #expect(businesses.calls == 1)
        gate.open()
        await first.value
        #expect(businesses.calls == 1)
    }

    @Test("se muestra la lista mientras recarga")
    func listStaysWhileRefreshing() async {
        let gate = Gate()
        let businesses = Script(just: [summary("a")])
        let model = CatalogHomeScreenModel(catalog: StubCatalog(businesses: businesses, gate: gate))
        gate.open()
        await model.load()
        let second = Task { await model.refresh() }
        await eventually { if case .loaded(let l) = model.state { l.refreshing } else { false } }
        gate.open()
        await second.value
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded: \(model.state)")
            return
        }
        #expect(!loaded.refreshing)
    }

    @Test("426: la carga queda en error; la pantalla de actualización la decide la raíz (ConfigService), no el modelo")
    func upgradeRequired() async {
        let model = CatalogHomeScreenModel(
            catalog: StubCatalog(businesses: Script(failing: .upgradeRequired(minVersion: "1.2.0")))
        )
        await model.load()
        #expect(model.state == .failed(.upgradeRequired(minVersion: "1.2.0")))
    }

    @Test("un 426 en una recarga conserva la lista")
    func upgradeRequiredOnRefresh() async {
        let catalog = StubCatalog(
            businesses: Script([.success([summary("a")]), .failure(.upgradeRequired(minVersion: nil))]))
        let model = CatalogHomeScreenModel(catalog: catalog)
        await model.load()
        await model.refresh()
        guard case let .loaded(loaded) = model.state else {
            Issue.record("se esperaba .loaded: \(model.state)")
            return
        }
        #expect(loaded.listing.restaurants.count == 1)
    }

    @Test("una cancelación no se muestra como error y deja volver a cargar")
    func cancelled() async {
        let catalog = StubCatalog(businesses: Script([.failure(.cancelled), .success([summary("a")])]))
        let model = CatalogHomeScreenModel(catalog: catalog)
        await model.load()
        #expect(model.state == .idle)
        await model.load()
        #expect(model.state != .idle)
    }

    @Test("una cancelación a media recarga deja la lista como estaba")
    func cancelledRefreshKeepsList() async {
        let catalog = StubCatalog(businesses: Script([.success([summary("a")]), .failure(.cancelled)]))
        let model = CatalogHomeScreenModel(catalog: catalog)
        await model.load()
        await model.refresh()
        #expect(model.state == .loaded(.init(listing: HomeMapping.listing(from: [summary("a")]))))
    }
}

@Suite("Mensaje de error")
struct ErrorTextTests {
    @Test("sin conexión se dice; todo lo demás es genérico")
    func messages() {
        #expect(ErrorText.message(for: .network) == "Sin conexión. Revisa tu internet e inténtalo de nuevo.")
        #expect(
            ErrorText.message(for: .unknown(code: "x", detail: nil, status: 500))
                == "Algo salió mal. Inténtalo de nuevo.")
        #expect(
            ErrorText.message(for: .known(code: .internalError, status: 500, detail: nil, fieldMessage: nil))
                == "Algo salió mal. Inténtalo de nuevo.")
    }
}
