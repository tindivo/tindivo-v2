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
}
