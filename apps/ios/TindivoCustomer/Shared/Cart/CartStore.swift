import Foundation

/// La bolsa del cliente, guardada en el teléfono (SW-9). Los métodos de escritura lanzan solo `CartError`; leer nunca
/// lanza: lo guardado que no cuadra con las reglas de la bolsa se trata como «sin bolsa».
protocol CartStore: Sendable {
    /// La bolsa vigente, o `nil` si no hay ninguna.
    func current() async -> Cart?
    /// La bolsa vigente ahora y después cada vez que cambia.
    func updates() async -> AsyncStream<Cart?>
    func add(businessId: String, businessName: String, line: CartLine) async throws(CartError) -> AddResult
    /// Empieza una bolsa nueva con `line`: solo después de que la persona aceptó vaciar la del otro negocio.
    func replace(businessId: String, businessName: String, line: CartLine) async throws(CartError)
    /// Suma `delta` unidades a la cantidad que la línea tiene en el momento de escribir (1...`maxQuantity`): leer y
    /// escribir son una sola operación, así que dos toques seguidos suman los dos.
    func changeQuantity(signature: String, by delta: Int) async throws(CartError)
    /// «Editar»: cambia la línea `signature` por `line` en su sitio, o la fusiona con otra idéntica (CUS-CRT-014).
    func replaceLine(signature: String, with line: CartLine) async throws(CartError) -> LineEditResult
    /// Quita la línea y devuelve lo necesario para deshacerlo; `nil` si ya no estaba.
    @discardableResult func remove(signature: String) async throws(CartError) -> RemovedLine?
    /// Devuelve una línea quitada a su sitio (o la fusiona con una igual); ver `RestoreResult`.
    func restore(_ removed: RemovedLine) async throws(CartError) -> RestoreResult
    func clear() async throws(CartError)
}

enum LineEditResult: Sendable, Equatable {
    /// `capped`: se fusionó con otra línea y la suma no cabía: se quedó en `maxQuantity`.
    case replaced(capped: Bool)
    /// La línea ya no estaba en la bolsa: no se escribió nada.
    case notFound
}

/// La bolsa en un archivo `Codable` (`tindivo_cart.json` en Application Support). Es un `actor`: leer, cambiar y
/// escribir de una operación no se intercalan con los de otra. La ruta se inyecta (los tests usan una temporal).
actor FileCartStore: CartStore {
    /// `Application Support/tindivo_cart.json`.
    static var defaultFileURL: URL {
        URL.applicationSupportDirectory.appending(path: "tindivo_cart.json")
    }

    private let fileURL: URL
    private var continuations: [UUID: AsyncStream<Cart?>.Continuation] = [:]

    init(fileURL: URL = FileCartStore.defaultFileURL) {
        self.fileURL = fileURL
    }

    func current() -> Cart? {
        readSnapshot().flatMap { Cart(snapshot: $0) }
    }

    func updates() -> AsyncStream<Cart?> {
        let (stream, continuation) = AsyncStream.makeStream(of: Cart?.self, bufferingPolicy: .bufferingNewest(1))
        let id = UUID()
        continuations[id] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeContinuation(id) }
        }
        continuation.yield(current())
        return stream
    }

    func add(businessId: String, businessName: String, line: CartLine) throws(CartError) -> AddResult {
        let result = try addToCart(current(), businessId: businessId, businessName: businessName, line: line)
        if case let .added(cart, _) = result { try write(cart) }
        return result
    }

    func replace(businessId: String, businessName: String, line: CartLine) throws(CartError) {
        try write(replacedWith(businessId: businessId, businessName: businessName, line: line))
    }

    func replaceLine(signature: String, with line: CartLine) throws(CartError) -> LineEditResult {
        try requireValidQuantity(line)
        guard let cart = current(), let edited = cart.replacing(signature, with: line) else { return .notFound }
        try write(edited.cart)
        return .replaced(capped: edited.capped)
    }

    func changeQuantity(signature: String, by delta: Int) throws(CartError) {
        guard let cart = current() else { return }
        try write(cart.changingQuantity(of: signature, by: delta))
    }

    func remove(signature: String) throws(CartError) -> RemovedLine? {
        guard let cart = current(), let removed = cart.removal(of: signature) else { return nil }
        try write(cart.removingLine(signature))
        return removed
    }

    func restore(_ removed: RemovedLine) throws(CartError) -> RestoreResult {
        guard let cart = current(), !cart.isEmpty else { return .noBag }
        let restored = cart.restoring(removed)
        if restored.result != .full { try write(restored.cart) }
        return restored.result
    }

    func clear() throws(CartError) {
        try write(nil)
    }

    // MARK: Disco

    /// El snapshot guardado, o `nil` si no hay archivo o no se puede leer (corrupto, otra forma): nunca lanza.
    private func readSnapshot() -> CartSnapshot? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? CartSnapshotCodec.decode(data)
    }

    /// Escribe `cart` (`nil` o vacía = borrar el archivo) y avisa a quien observa. Si no se puede escribir lanza
    /// `saveFailed` y la bolsa anterior queda como estaba. Una bolsa que al releerla se descartaría (`Cart(snapshot:)`
    /// la rechaza) no se escribe: lanza sin tocar el disco, para no perder la anterior por otra que «desaparece».
    private func write(_ cart: Cart?) throws(CartError) {
        let snapshot = cart?.snapshot()
        if let snapshot, Cart(snapshot: snapshot) == nil { throw .saveFailed }
        do {
            if let snapshot {
                try FileManager.default.createDirectory(
                    at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true
                )
                try CartSnapshotCodec.encode(snapshot).write(to: fileURL, options: .atomic)
            } else if FileManager.default.fileExists(atPath: fileURL.path) {
                try FileManager.default.removeItem(at: fileURL)
            }
        } catch {
            throw .saveFailed
        }
        let now = current()
        for continuation in continuations.values { continuation.yield(now) }
    }

    private func removeContinuation(_ id: UUID) {
        continuations[id] = nil
    }
}
