import Testing
@testable import TindivoCustomer

@MainActor
@Suite("Navegación")
struct AppNavigatorTests {
    @Test("abrir un negocio y la bolsa apila")
    func pushes() {
        let navigator = AppNavigator()
        navigator.openBusiness("a")
        navigator.openCart()
        #expect(navigator.path == [.business(id: "a"), .cart])
    }

    @Test("+ Agregar más con la carta en la pila cierra la bolsa y vuelve a ella")
    func addMorePopsToBusiness() {
        let navigator = AppNavigator()
        navigator.openBusiness("a")
        navigator.openCart()
        navigator.addMore(to: "a")
        #expect(navigator.path == [.business(id: "a")])
    }

    @Test("+ Agregar más compara el negocio sin distinguir mayúsculas, como Postgres con los uuid")
    func addMoreIgnoresCase() {
        let navigator = AppNavigator()
        navigator.openBusiness("ABC")
        navigator.openCart()
        navigator.addMore(to: "abc")
        #expect(navigator.path == [.business(id: "ABC")])
    }

    @Test("+ Agregar más sin la carta en la pila la empuja")
    func addMorePushesWhenMissing() {
        let navigator = AppNavigator()
        navigator.openBusiness("otro")
        navigator.openCart()
        navigator.addMore(to: "a")
        #expect(navigator.path == [.business(id: "otro"), .cart, .business(id: "a")])
    }

    @Test("con dos veces la misma carta vuelve a la más reciente")
    func addMoreUsesLatest() {
        let navigator = AppNavigator()
        navigator.openBusiness("a")
        navigator.openBusiness("b")
        navigator.openBusiness("a")
        navigator.openCart()
        navigator.addMore(to: "a")
        #expect(navigator.path == [.business(id: "a"), .business(id: "b"), .business(id: "a")])
    }

    @Test("Ver negocios vuelve a Inicio")
    func seeBusinesses() {
        let navigator = AppNavigator()
        navigator.openBusiness("a")
        navigator.openCart()
        navigator.seeBusinesses()
        #expect(navigator.path.isEmpty)
    }

    @Test("la app arranca en Inicio; el banner «Entregas» abre la pestaña Entregas y «Ver negocios» vuelve a Inicio")
    func tabs() {
        let navigator = AppNavigator()
        #expect(navigator.tab == .home)
        navigator.openCourier()
        #expect(navigator.tab == .courier)
        navigator.seeBusinesses()
        #expect(navigator.tab == .home)
    }

    @Test("un negocio abierto por slug y pedido por id es el mismo: «+ Agregar más» no lo apila dos veces")
    func addMoreMatchesSlugAndId() {
        let navigator = AppNavigator()
        navigator.openBusiness("Chifa-Lung-Fung")
        navigator.learn(routeId: "Chifa-Lung-Fung", businessId: "9F1C0A52-0000-4000-8000-000000000002")
        navigator.openCart()
        navigator.addMore(to: "9f1c0a52-0000-4000-8000-000000000002")
        #expect(navigator.path == [.business(id: "Chifa-Lung-Fung")])
    }

    @Test("sin haber aprendido el slug, un slug y un id distintos no se confunden")
    func unknownSlugIsNotMatched() {
        let navigator = AppNavigator()
        navigator.openBusiness("chifa-lung-fung")
        navigator.openCart()
        navigator.addMore(to: "9f1c0a52-0000-4000-8000-000000000002")
        #expect(navigator.path.count == 3)
    }

    @Test("abrir el negocio que ya está arriba, por id o por slug, no lo apila otra vez")
    func openingTheVisibleBusinessDoesNothing() {
        let navigator = AppNavigator()
        navigator.openBusiness("slug-a")
        navigator.learn(routeId: "slug-a", businessId: "ID-A")
        navigator.openBusiness("id-a")
        navigator.openBusiness(" SLUG-A ")
        #expect(navigator.path == [.business(id: "slug-a")])
    }
}
