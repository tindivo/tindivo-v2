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
    func setQuantity(signature: String, quantity: Int) async throws(CartError)
    func remove(signature: String) async throws(CartError)
    func clear() async throws(CartError)
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

    func setQuantity(signature: String, quantity: Int) throws(CartError) {
        guard let cart = current() else { return }
        try write(cart.settingQuantity(of: signature, to: quantity))
    }

    func remove(signature: String) throws(CartError) {
        guard let cart = current() else { return }
        try write(cart.removingLine(signature))
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
    /// `saveFailed` y la bolsa anterior queda como estaba.
    private func write(_ cart: Cart?) throws(CartError) {
        do {
            if let snapshot = cart?.snapshot() {
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
