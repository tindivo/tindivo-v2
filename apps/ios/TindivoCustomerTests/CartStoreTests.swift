import Foundation
import Testing
@testable import TindivoCustomer

/// `CartStoreTest.kt`: la bolsa en un archivo `Codable` (SW-9), con la ruta inyectada.
@Suite("Almacén de la bolsa")
struct CartStoreTests {
    private func makeStore() -> (store: FileCartStore, file: URL) {
        let directory = FileManager.default.temporaryDirectory.appending(path: "tindivo-cart-\(UUID().uuidString)")
        let file = directory.appending(path: "tindivo_cart.json")
        return (FileCartStore(fileURL: file), file)
    }

    private func line(
        _ itemId: String = "plato", price: String = "12.50", quantity: Int = 1, modifiers: [CartModifier] = []
    ) -> CartLine {
        CartLine(itemId: itemId, name: "Lomo", basePrice: dec(price), modifiers: modifiers, note: nil, quantity: quantity, imageURL: nil)
    }

    @Test("sin nada guardado no hay bolsa")
    func empty() async {
        #expect(await makeStore().store.current() == nil)
    }

    @Test("agregar escribe los importes del archivo como cadena")
    func writesStrings() async throws {
        let (store, file) = makeStore()
        let result = try await store.add(businessId: "n", businessName: "Pollería", line: line(quantity: 2))
        guard case .added = result else {
            Issue.record("debía agregarse: \(result)")
            return
        }
        let text = try String(contentsOf: file, encoding: .utf8)
        #expect(text.contains("\"basePrice\":\"12.50\""), "\(text)")
        #expect(text.contains("\"version\":1"))
    }

    @Test("la misma firma suma y un plato de otro negocio no toca la bolsa")
    func mergesAndRejectsOther() async throws {
        let (store, _) = makeStore()
        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line(quantity: 2))
        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line(quantity: 3))
        let other = try await store.add(businessId: "m", businessName: "Chifa", line: line("arroz"))
        #expect(other == .otherBusiness(currentBusinessName: "Pollería"))
        let cart = try #require(await store.current())
        #expect(cart.count == 5)
        #expect(cart.businessId == "n")
    }

    @Test("replace empieza una bolsa nueva del otro negocio")
    func replace() async throws {
        let (store, _) = makeStore()
        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line())
        try await store.replace(businessId: "m", businessName: "Chifa", line: line("arroz"))
        let cart = try #require(await store.current())
        #expect(cart.businessName == "Chifa")
        #expect(cart.lines.map(\.itemId) == ["arroz"])
    }

    @Test("cambiar la cantidad, quitar y vaciar")
    func editAndClear() async throws {
        let (store, file) = makeStore()
        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line("a"))
        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line("b"))
        let signature = try #require(await store.current()?.lines.first?.signature)

        try await store.setQuantity(signature: signature, quantity: 4)
        #expect(await store.current()?.count == 5)

        try await store.remove(signature: signature)
        #expect(await store.current()?.lines.map(\.itemId) == ["b"])

        let last = try #require(await store.current()?.lines.first?.signature)
        try await store.remove(signature: last)
        #expect(await store.current() == nil)

        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line())
        try await store.clear()
        #expect(await store.current() == nil)
        #expect(!FileManager.default.fileExists(atPath: file.path))
    }

    @Test("dos agregados a la vez no se pisan")
    func concurrentAdds() async throws {
        let (store, _) = makeStore()
        try await withThrowingTaskGroup(of: Void.self) { group in
            for _ in 0..<10 {
                group.addTask { _ = try await store.add(businessId: "n", businessName: "Pollería", line: line()) }
            }
            try await group.waitForAll()
        }
        #expect(await store.current()?.count == 10)
    }

    @Test("un archivo corrupto se lee como sin bolsa y la siguiente escritura lo reemplaza")
    func corruptFile() async throws {
        let (store, file) = makeStore()
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{ esto no es json".utf8).write(to: file)
        #expect(await store.current() == nil)
        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line())
        #expect(await store.current()?.count == 1)
    }

    @Test("un archivo de otra versión se lee como sin bolsa, sin lanzar")
    func otherVersion() async throws {
        let (store, file) = makeStore()
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let json = "{\"version\":2,\"businessId\":\"n\",\"businessName\":\"N\",\"lines\":[{\"itemId\":\"a\",\"name\":\"A\",\"basePrice\":\"1.00\",\"modifiers\":[],\"note\":null,\"quantity\":1,\"imageURL\":null}]}"
        try Data(json.utf8).write(to: file)
        #expect(await store.current() == nil)
    }

    @Test("una bolsa guardada que rompe las reglas se lee como sin bolsa y se reemplaza al escribir")
    func invalidSaved() async throws {
        let (store, file) = makeStore()
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let json = "{\"version\":1,\"businessId\":\"n\",\"businessName\":\"N\",\"lines\":[{\"itemId\":\"a\",\"name\":\"A\",\"basePrice\":\"1.005\",\"modifiers\":[],\"note\":null,\"quantity\":1,\"imageURL\":null}]}"
        try Data(json.utf8).write(to: file)
        #expect(await store.current() == nil)
        _ = try await store.add(businessId: "m", businessName: "Chifa", line: line())
        #expect(await store.current()?.businessId == "m")
    }

    @Test("la bolsa más cara admitida se guarda, se lee exacta y se muestra entera")
    func mostExpensiveCart() async throws {
        let (store, _) = makeStore()
        let top = "99999999.99"
        let options = (0..<CartLimits.maxModifiers).map {
            CartModifier(optionId: "o\($0)", groupName: "Extras", optionName: "Opción \($0)", price: dec(top))
        }
        for index in 0..<CartLimits.maxLines {
            _ = try await store.add(
                businessId: "n", businessName: "Pollería",
                line: line("p\(index)", price: top, quantity: CartLimits.maxQuantity, modifiers: options)
            )
        }
        #expect(try await store.add(businessId: "n", businessName: "Pollería", line: line("otro")) == .full)
        let cart = try #require(await store.current())
        #expect(cart.lines.count == CartLimits.maxLines)
        #expect(cart.subtotal == dec("5249999999475.00"))
        #expect(formatAmount(cart.subtotal).plain == "S/ 5,249,999,999,475.00")
        #expect(formatAmount(cart.lines[0].total).plain == "S/ 104,999,999,989.50")
    }

    @Test("un archivo con una opción repetida se lee como sin bolsa aunque las otras líneas valgan")
    func repeatedOptionOnDisk() async throws {
        let (store, file) = makeStore()
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let queso = CartModifierSnapshot(optionId: "queso", groupName: "Extras", optionName: "Queso", price: "2.50")
        var upper = queso
        upper.optionId = "QUESO"
        let good = CartLineSnapshot(itemId: "a", name: "Lomo", basePrice: "10.00", modifiers: [], note: nil, quantity: 1, imageURL: nil)
        let bad = CartLineSnapshot(itemId: "b", name: "Lomo", basePrice: "10.00", modifiers: [queso, upper], note: nil, quantity: 1, imageURL: nil)
        let snapshot = CartSnapshot(businessId: "n", businessName: "Pollería", lines: [good, bad])
        try CartSnapshotCodec.encode(snapshot).write(to: file)
        #expect(await store.current() == nil)
    }

    @Test("updates entrega la bolsa vigente y cada cambio")
    func updates() async throws {
        let (store, _) = makeStore()
        var iterator = await store.updates().makeAsyncIterator()
        #expect(await iterator.next() == .some(nil))
        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line(quantity: 2))
        #expect(await iterator.next()??.count == 2)
        try await store.clear()
        #expect(await iterator.next() == .some(nil))
    }

    @Test("si no se puede escribir, el error es saveFailed y no se pierde la bolsa anterior")
    func saveFailure() async throws {
        let (store, file) = makeStore()
        let directory = file.deletingLastPathComponent()
        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line("a"))
        let before = try #require(await store.current())
        let bytesBefore = try Data(contentsOf: file)

        // Directorio de solo lectura: no se puede crear el archivo temporal ni borrar el vigente.
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: directory.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path) }

        await #expect(throws: CartError.saveFailed) {
            _ = try await store.add(businessId: "n", businessName: "Pollería", line: line("b"))
        }
        #expect(await store.current() == before)
        #expect(try Data(contentsOf: file) == bytesBefore)
    }

    @Test("sin poder crear el directorio tampoco hay bolsa y el error es saveFailed")
    func saveFailureWithoutDirectory() async throws {
        let blocker = FileManager.default.temporaryDirectory.appending(path: "tindivo-blocker-\(UUID().uuidString)")
        try Data().write(to: blocker)
        // El «directorio» padre es un archivo: no se puede crear el de la bolsa.
        let store = FileCartStore(fileURL: blocker.appending(path: "dentro/tindivo_cart.json"))
        await #expect(throws: CartError.saveFailed) {
            _ = try await store.add(businessId: "n", businessName: "Pollería", line: line())
        }
        #expect(await store.current() == nil)
    }

    @Test("una bolsa que no se podría releer no se escribe: lanza y deja la anterior intacta")
    func unreadableCartIsNotWritten() async throws {
        let (store, file) = makeStore()
        _ = try await store.add(businessId: "n", businessName: "Pollería", line: line("a"))
        let bytesBefore = try Data(contentsOf: file)
        // Veintiuna opciones: más de las que admite el pedido, así que al releerla se descartaría entera.
        let options = (0...CartLimits.maxModifiers).map {
            CartModifier(optionId: "o\($0)", groupName: "Extras", optionName: "Opción \($0)", price: dec("1.00"))
        }
        await #expect(throws: CartError.saveFailed) {
            try await store.replace(businessId: "m", businessName: "Chifa", line: line("arroz", modifiers: options))
        }
        #expect(await store.current()?.businessId == "n")
        #expect(try Data(contentsOf: file) == bytesBefore)
    }
}
