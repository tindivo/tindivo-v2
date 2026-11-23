import Foundation
import Testing
import TindivoAPI

@testable import TindivoCustomer

/// La caché de cartas compartida: la espera responde a la cancelación y una respuesta vieja no pisa una nueva.
@MainActor
@Suite("Caché de cartas")
struct BusinessMenuCacheTests {
    private let now = Fixture.tuesdayEvening
    private let menu = Fixture.menu([Fixture.category("c", [Fixture.item("i")])])

    private func fetch(_ cache: BusinessMenuCache, _ catalog: any CatalogRepository, at date: Date? = nil) async
        -> Result<BusinessMenu, AppError>
    {
        do throws(AppError) { return .success(try await cache.menu(id: "x", catalog: catalog, now: date ?? now)) } catch
        {
            return .failure(error)
        }
    }

    @Test("quien espera y se cancela vuelve al instante; si era el único, la petición se cancela")
    func cancellingTheOnlyWaiterCancelsTheRequest() async {
        let held = HeldMenus(businesses: [], menu: menu)
        let cache = BusinessMenuCache()
        let waiter = Task { await fetch(cache, held) }
        await eventually { held.waiting == 1 }
        waiter.cancel()
        let result = await waiter.value
        #expect(result == .failure(.cancelled))
        await eventually { held.cancelled == 1 }
        #expect(held.menuCalls == 1)
        // La petición cancelada no queda como «en curso»: el siguiente pedido sale de nuevo.
        let next = Task { await fetch(cache, held) }
        await eventually { held.waiting == 1 }
        held.releaseAll()
        #expect(await next.value == .success(menu))
        #expect(held.menuCalls == 2)
    }

    @Test("si uno de dos que esperan se cancela, la petición sigue y el otro recibe la carta")
    func cancellingOneOfTwoKeepsTheRequest() async {
        let held = HeldMenus(businesses: [], menu: menu)
        let cache = BusinessMenuCache()
        let first = Task { await fetch(cache, held) }
        await eventually { held.waiting == 1 }
        let second = Task { await fetch(cache, held) }
        for _ in 0..<10_000 where await cache.waiters(for: "x") < 2 { await Task.yield() }
        #expect(await cache.waiters(for: "x") == 2, "el segundo se unió a la misma petición")
        first.cancel()
        #expect(await first.value == .failure(.cancelled))
        #expect(held.cancelled == 0, "la petición sigue porque queda uno esperando")
        held.releaseAll()
        #expect(await second.value == .success(menu))
        #expect(held.menuCalls == 1)
    }

    @Test("store() no pisa una carta más nueva con una respuesta más vieja")
    func storeDoesNotOverwriteNewer() async {
        let newer = Fixture.menu([Fixture.category("n", [Fixture.item("nuevo")])])
        let older = Fixture.menu([Fixture.category("o", [Fixture.item("viejo")])])
        let cache = BusinessMenuCache()
        await cache.store(newer, id: "x", now: now.addingTimeInterval(10))
        await cache.store(older, id: "X", now: now)
        let result = await fetch(cache, StubCatalog(), at: now.addingTimeInterval(10))
        #expect(result == .success(newer))
        await cache.store(older, id: "x", now: now.addingTimeInterval(20))
        #expect(await fetch(cache, StubCatalog(), at: now.addingTimeInterval(20)) == .success(older))
    }
}
