import Foundation
import Observation
import TindivoAPI

/// Una opción elegida de un plato, para enseñarla como «Grupo: Opción».
struct CartOptionText: Equatable, Identifiable {
    /// Identidad en la lista: dos grupos pueden tener una opción con el mismo nombre, pero no el mismo `optionId`.
    let id: String
    let group: String
    let option: String
}

/// Una línea de la bolsa, ya decidida: los importes son texto para mostrar, nunca para calcular.
struct CartLineRow: Equatable {
    let signature: String
    let name: String
    let options: [CartOptionText]
    let note: String?
    let quantity: Int
    let total: String
    /// Con 1 unidad el «−» quita la línea (CUS-CRT-003): no baja de 1.
    let decreaseRemoves: Bool
    let canIncrease: Bool
    /// Para VoiceOver: qué hace cada botón y cuántas unidades hay («2 unidades»), en las etiquetas de los botones.
    let decreaseLabel: String
    let increaseLabel: String
    /// Lo que la carta vigente dice de esta línea (CUS-CRT-005): vacío si se puede pedir.
    let issues: [String]
    /// «Editar» solo existe si el plato lleva opciones (CUS-CRT-014).
    let canEdit: Bool

    /// Identidad en la lista: unidades UTF-16 (como `CartLine.signatureKey`), no la igualdad canónica de `String`.
    var signatureKey: [UInt16] { Array(signature.utf16) }
}

/// Bolsa: las líneas de lo que se va a pedir, con su subtotal. La bolsa vive en `CartStore`; aquí solo se enseña y se
/// le mandan los cambios.
@MainActor
@Observable
final class CartScreenModel {
    struct Filled: Equatable {
        let businessId: String
        let businessName: String
        let lines: [CartLineRow]
        let subtotal: String
        /// Falso si el subtotal o el total de alguna línea es un importe que no se puede mostrar (dato roto): no se
        /// puede continuar con esa bolsa.
        let amountsAreValid: Bool
        let method: DeliveryMethod
        let validation: Validation
        /// «[n] productos» de la barra (unidades en total).
        let countLabel: String

        /// La etiqueta del método de entrega (CUS-CRT-007, CUS-CRT-010).
        var methodLabel: String {
            switch method {
            case .delivery: String(localized: "Delivery")
            case .pickup: String(localized: "Recojo")
            }
        }

        /// ¿Se puede avanzar con esta bolsa? Solo con la carta ya revisada, sin líneas con problema y con todos los
        /// importes mostrables. Con la carta caída no (CA-CRT-14): se reintenta.
        var allowsContinue: Bool {
            validation == .checked && amountsAreValid && lines.allSatisfy { $0.issues.isEmpty }
        }

        /// La fila del envío solo existe en delivery (CA-CRT-08).
        var showsShipping: Bool { method == .delivery }
    }

    /// Cómo va la revisión de la bolsa contra la carta vigente. No se guarda: se repite cada vez que se abre.
    enum Validation: Equatable {
        /// Esperando la carta; «Continuar» (cuando exista) dice «Cargando…».
        case validating
        /// La carta respondió: las líneas con problema llevan su aviso.
        case checked
        /// La carta no se pudo leer: la bolsa no se puede continuar hasta «Reintentar» (CA-CRT-14).
        case checkFailed
    }

    enum State: Equatable {
        /// Aún no se leyó lo guardado: no se enseña «vacía» por un instante.
        case loading
        case empty
        case filled(Filled)
    }

    private enum Menu {
        case pending
        case loaded(BusinessDetail)
        case failed
    }

    /// El plato que «Editar» abre: la línea y el plato de la carta vigente con sus opciones.
    struct EditTarget: Identifiable, Equatable {
        var id: String { line.signature }
        let item: MenuItem
        let line: CartLine
        let businessId: String
        let businessName: String
    }

    /// Cuánto dura «Deshacer» (CUS-CRT-013); lo decide Jesús, no se cambia.
    static let defaultUndoWindow: Duration = {
        #if DEBUG
        // Solo pruebas de interfaz: `-tindivo-undo-seconds 60` alarga el plazo para poder tocar «Deshacer» sin prisa.
        let arguments = ProcessInfo.processInfo.arguments
        if let flag = arguments.firstIndex(of: "-tindivo-undo-seconds"), arguments.indices.contains(flag + 1),
            let seconds = Double(arguments[flag + 1]), seconds > 0
        {
            return .seconds(seconds)
        }
        #endif
        return .seconds(5)
    }()

    /// El aviso «Quitaste "[plato]"» con su «Deshacer»; `token` cambia con cada quitada.
    struct UndoOffer: Equatable {
        let message: String
        let token: Int
    }

    private(set) var state: State = .loading
    /// Hay algo que deshacer; `nil` pasado el plazo.
    private(set) var undoOffer: UndoOffer?
    var undoMessage: String? { undoOffer?.message }
    /// Lo que dura la raya que se vacía.
    let undoWindow: Duration
    /// Los avisos de error («No se pudo guardar tu bolsa»).
    let notices: TimedNotice

    /// El plato que está abierto para editar; la pantalla lo presenta.
    private(set) var editing: EditTarget?

    private let store: any CartStore
    private let catalog: any CatalogRepository
    private let clock: AppClock
    private var lastRemoved: RemovedLine?
    private var undoTask: Task<Void, Never>?
    private var undoCounter = 0
    /// ¿Está encendido VoiceOver? Lo dice la vista (`accessibilityVoiceOverEnabled`) con `setVoiceOver`: el modelo no
    /// conoce UIKit. Con VoiceOver el aviso «Deshacer» no se cierra solo.
    private(set) var voiceOverRunning: Bool
    /// El aviso actual se cierra solo a los 5 s; con VoiceOver no (decisión de Jesús, 2026-11-22).
    private(set) var undoAutoDismisses = true
    private var isUndoing = false
    /// Se está abriendo «Editar» (esperando la carta): los botones «Editar» esperan y no se abre dos veces.
    private(set) var isOpeningEdit = false
    private var cart: Cart?
    private var hasCart = false
    private var menu: Menu = .pending
    /// Cuántas veces la carta ha fallado en esta pantalla: sube con cada fallo, y la vista anuncia el aviso otra vez.
    private(set) var checkFailures = 0
    /// Hay un «Reintentar» en curso: el aviso de carta caída sigue a la vista (sin que VoiceOver pierda el foco) y dos
    /// toques seguidos no lanzan dos peticiones.
    private(set) var isRetryingCheck = false

    init(
        store: any CartStore, catalog: any CatalogRepository, clock: AppClock,
        undoWindow: Duration = CartScreenModel.defaultUndoWindow,
        voiceOverRunning: Bool = false
    ) {
        self.voiceOverRunning = voiceOverRunning
        self.store = store
        self.catalog = catalog
        self.clock = clock
        self.undoWindow = undoWindow
        notices = TimedNotice(clock: clock)
    }

    /// La bolsa vigente ahora y después cada vez que cambia. Se lanza con `.task`.
    func observe() async {
        for await cart in await store.updates() {
            self.cart = cart
            hasCart = true
            rebuild()
        }
    }

    /// Revisa la bolsa contra la carta vigente del negocio (CUS-CRT-005). Se lanza con `.task` al abrir la pantalla.
    /// Si la carta no carga, la bolsa queda en `checkFailed` y no se puede continuar (CA-CRT-14). Quitar o editar
    /// líneas después se revisa de nuevo con la misma carta, sin pedirla otra vez.
    func validate() async {
        // Un «Reintentar» ya está pidiendo la carta: no se pide dos veces. Se mira otra vez después de leer la bolsa,
        // porque «Reintentar» pudo empezar durante esa espera.
        guard !isRetryingCheck, let cart = await store.current(), !cart.isEmpty, !isRetryingCheck else { return }
        // Ya cargada la carta de este negocio (por ejemplo tras cerrar «Editar»): no se vuelve a pedir.
        if case let .loaded(known) = menu, known.id.caseInsensitiveCompare(cart.businessId) == .orderedSame { return }
        await fetchMenu(for: cart)
    }

    /// «Reintentar» (CA-CRT-14): vuelve a pedir la carta del negocio de la bolsa aunque `validate()` ya la pidiera.
    /// Mientras llega la bolsa está «validando»; termina en `checked` o, si falla otra vez, en `checkFailed` con
    /// `checkFailures` más alto. Dos toques seguidos no lanzan dos peticiones.
    func retryCheck() async {
        guard !isRetryingCheck, case .failed = menu else { return }
        isRetryingCheck = true
        defer { isRetryingCheck = false }
        // Si mientras se leía la bolsa `validate()` ya pidió la carta, no se pide otra vez.
        guard let cart = await store.current(), !cart.isEmpty, case .failed = menu else { return }
        await fetchMenu(for: cart)
    }

    /// Pide la carta del negocio de la bolsa (pasa por «validando») y termina en `checked` o en `checkFailed`.
    private func fetchMenu(for cart: Cart) async {
        menu = .pending
        rebuild()
        do throws(AppError) {
            menu = .loaded(try await loadMenu(of: cart.businessId))
        } catch {
            // Un `.cancelled` que no viene de cerrar la pantalla es un fallo de la red: carta caída.
            if case .cancelled = error, Task.isCancelled { return }
            // Si mientras tanto «Editar» ya cargó la carta de este negocio, no se baja a fallo.
            if case let .loaded(known) = menu, known.id.caseInsensitiveCompare(cart.businessId) == .orderedSame {
                return rebuild()
            }
            menu = .failed
            checkFailures += 1
        }
        rebuild()
    }

    /// Reevalúa cada minuto las franjas de los platos con la pantalla abierta: un plato que se apaga a las 15:00 se
    /// avisa sin volver a entrar. Se lanza con `.task`.
    func runClock() async {
        while !Task.isCancelled {
            do { try await clock.sleep(.seconds(60)) } catch { return }
            rebuild()
        }
    }

    /// «Continuar» (todavía no existe en iOS: llega con el checkout) solo podrá avanzar con la bolsa ya revisada y
    /// sin líneas con problema. Con la carta caída (`checkFailed`) tampoco (CA-CRT-14).
    var canContinue: Bool {
        guard case let .filled(filled) = state else { return false }
        return filled.allowsContinue
    }

    private func rebuild() {
        guard hasCart else { return }
        guard let cart, !cart.isEmpty else {
            state = .empty
            return
        }
        switch menu {
        case let .loaded(detail) where detail.id.caseInsensitiveCompare(cart.businessId) == .orderedSame:
            state = Self.state(
                for: cart, validation: .checked,
                issues: CartValidation.issues(of: cart, against: detail, now: clock.now()),
                menu: detail
            )
        case .failed:
            state = Self.state(for: cart, validation: .checkFailed)
        case .pending, .loaded:
            state = Self.state(for: cart, validation: .validating)
        }
    }

    /// Suma o resta una unidad a la línea; se queda dentro de 1...50. La suma la hace la bolsa sobre lo guardado (una
    /// sola operación): dos toques seguidos, antes de que la pantalla se actualice, suman dos veces. Con 1 unidad,
    /// restar quita la línea (CUS-CRT-003); lo que decide eso es la fila que se ve, y si estaba desfasada la bolsa
    /// nunca baja de 1 por restar.
    func changeQuantity(signature: String, by delta: Int) async {
        if delta < 0, displayedQuantity(of: signature) == 1 {
            await remove(signature: signature)
            return
        }
        // Con VoiceOver, otro cambio en la bolsa cierra el aviso: ya no habría qué deshacer.
        if voiceOverRunning { forgetUndo() }
        await write { store async throws(CartError) in try await store.changeQuantity(signature: signature, by: delta) }
    }

    /// La vista avisa de si VoiceOver está encendido. Si se apaga con un aviso abierto que no se cerraba solo, el plazo
    /// de 5 s arranca ahora.
    func setVoiceOver(_ running: Bool) {
        voiceOverRunning = running
        if !running, !undoAutoDismisses, let offer = undoOffer {
            undoAutoDismisses = true
            scheduleUndoDismissal(token: offer.token)
        }
    }

    /// Se sale de la bolsa: si el aviso «Deshacer» no se cierra solo (se abrió con VoiceOver), se va; si tiene plazo,
    /// sigue su plazo. Abrir «Editar» (una ficha a pantalla completa) también hace desaparecer la bolsa, pero no es
    /// salir de ella: con la ficha abierta o abriéndose no se hace nada.
    func leave() {
        guard editing == nil, !isOpeningEdit else { return }
        if !undoAutoDismisses { forgetUndo() }
    }

    /// Quita la línea. Si queda alguna otra, ofrece «Deshacer» durante 5 s; si era la última, la bolsa pasa a vacía
    /// sin aviso (CUS-CRT-003).
    func remove(signature: String) async {
        let removed: RemovedLine?
        do throws(CartError) {
            removed = try await store.remove(signature: signature)
        } catch {
            showSaveFailed()
            return
        }
        // Un segundo toque a la misma línea ya no la encuentra: no toca el aviso de la primera quitada.
        guard let removed else { return }
        if removed.wasLast {
            forgetUndo()
            return
        }
        lastRemoved = removed
        undoCounter += 1
        let token = undoCounter
        undoOffer = UndoOffer(message: String(localized: "Quitaste \"\(removed.line.name)\""), token: token)
        undoTask?.cancel()
        // Con VoiceOver el aviso espera: se va al tocar «Deshacer», con otro cambio o al salir de la bolsa. Quien usa
        // VoiceOver no alcanza a oír y tocar «Deshacer» en 5 s.
        undoAutoDismisses = !voiceOverRunning
        if undoAutoDismisses { scheduleUndoDismissal(token: token) }
    }

    private func scheduleUndoDismissal(token: Int) {
        undoTask?.cancel()
        undoTask = Task { [clock, undoWindow] in
            do { try await clock.sleep(undoWindow) } catch { return }
            if undoOffer?.token == token { forgetUndo() }
        }
    }

    /// «Deshacer»: devuelve la línea quitada a su sitio con su cantidad (o la suma a una igual). No hace nada pasados
    /// los 5 s. Si no cabe (50 platos distintos) avisa; si no se puede guardar, avisa y sigue ofreciendo «Deshacer».
    @discardableResult
    func undo() async -> Bool {
        guard undoOffer != nil, let removed = lastRemoved, !isUndoing else { return false }
        isUndoing = true
        defer { isUndoing = false }
        let result: RestoreResult
        do throws(CartError) {
            result = try await store.restore(removed)
        } catch {
            showSaveFailed()
            return false
        }
        switch result {
        case .restored:
            forgetUndo()
            return true
        case let .merged(capped):
            forgetUndo()
            if capped { notices.show(DishScreenModel.addedMessage(capped: true)) }
            return true
        case .full:
            forgetUndo()
            notices.show(
                String(localized: "Tu bolsa ya tiene \(CartLimits.maxLines) platos distintos: es el máximo por pedido"))
            return false
        case .noBag:
            forgetUndo()
            return false
        }
    }

    // MARK: Editar (CUS-CRT-014)

    /// Abre el plato de una línea con lo elegido. Pide la carta vigente: sus opciones son las de hoy, no las de cuando
    /// se agregó. Si el plato ya no se puede pedir o no se puede leer la carta, avisa y no abre nada.
    func startEditing(signature: String) async {
        // La marca va antes del primer `await`: dos toques rápidos no abren dos veces.
        guard editing == nil, !isOpeningEdit else { return }
        isOpeningEdit = true
        defer { isOpeningEdit = false }
        guard let cart = await store.current(),
            let line = cart.lines.first(where: { $0.signatureKey == Array(signature.utf16) })
        else { return }
        let detail: BusinessDetail
        do throws(AppError) {
            if case let .loaded(known) = menu, known.id.caseInsensitiveCompare(cart.businessId) == .orderedSame {
                detail = known
            } else {
                detail = try await loadMenu(of: cart.businessId)
                // La carta que se bajó para «Editar» se guarda: la bolsa se revisa con ella sin pedirla otra vez.
                menu = .loaded(detail)
                rebuild()
            }
        } catch {
            notices.show(ErrorText.message(for: error))
            return
        }
        let wanted = line.itemId.lowercased()
        guard
            let item = detail.atInstant(clock.now()).categories.lazy.flatMap(\.items)
                .first(where: { $0.id.lowercased() == wanted && $0.orderable })
        else {
            notices.show(String(localized: "Este producto ya no está disponible"))
            return
        }
        editing = EditTarget(item: item, line: line, businessId: cart.businessId, businessName: cart.businessName)
    }

    /// El plato que se editaba ya no está en la bolsa: la ficha se cierra y avisa.
    func lineGone() {
        editing = nil
        notices.show(String(localized: "Este plato ya no está en tu bolsa"))
    }

    /// La ficha se cerró SIN guardar (Cerrar, el gesto de escape o deslizarla): la bolsa no cambió, así que el aviso de
    /// «Deshacer» sigue donde estaba.
    func cancelEditing() {
        editing = nil
    }

    /// La ficha guardó un cambio en la bolsa. Con VoiceOver un cambio real cierra el aviso de «Deshacer». `capped`: al
    /// fusionarse con otra línea llegó al máximo.
    func finishEditing(capped: Bool = false) {
        if voiceOverRunning { forgetUndo() }
        editing = nil
        if capped { notices.show(DishScreenModel.addedMessage(capped: true)) }
    }

    /// El modelo de la ficha del plato para editar `target`: guarda en la misma bolsa que esta pantalla.
    func dishModel(for target: EditTarget) -> DishScreenModel {
        DishScreenModel(
            item: target.item, businessId: target.businessId, businessName: target.businessName, cartStore: store,
            clock: clock, editing: target.line
        )
    }

    private func loadMenu(of businessId: String) async throws(AppError) -> BusinessDetail {
        let menu = try await catalog.getBusiness(id: businessId)
        guard let detail = MenuMapping.detail(from: menu) else {
            throw .unknown(code: nil, detail: MenuMapping.invalidMenuDetail, status: nil)
        }
        return detail
    }

    func clear() async {
        forgetUndo()
        await write { store async throws(CartError) in try await store.clear() }
    }

    private func forgetUndo() {
        lastRemoved = nil
        undoTask?.cancel()
        undoOffer = nil
    }

    private func showSaveFailed() {
        notices.show(String(localized: "No se pudo guardar tu bolsa. Inténtalo de nuevo."))
    }

    private func displayedQuantity(of signature: String) -> Int? {
        guard case let .filled(filled) = state else { return nil }
        return filled.lines.first { $0.signatureKey == Array(signature.utf16) }?.quantity
    }

    /// Si no se puede escribir en el teléfono, la bolsa se queda como estaba y la pantalla sigue mostrándola.
    private func write<Output>(_ change: (any CartStore) async throws(CartError) -> Output) async {
        do throws(CartError) {
            _ = try await change(store)
        } catch {
            // La bolsa que se ve es la que está guardada; solo se avisa de que el cambio no quedó.
            showSaveFailed()
        }
    }
}

// MARK: Filas de la pantalla

extension CartScreenModel {
    /// `issues` va en el orden de las líneas; sin ella, ninguna línea tiene avisos.
    /// `menu`: la carta ya cargada del negocio. «Editar» sale si el PLATO tiene opciones en esa carta, aunque la línea no
    /// tenga ninguna elegida (extras opcionales sin elegir); si no hay carta o el plato no está, cae al criterio de la
    /// línea (tiene opciones elegidas).
    static func state(
        for cart: Cart?, validation: Validation = .validating, issues: [[CartLineIssue]] = [],
        menu: BusinessDetail? = nil
    ) -> State {
        guard let cart, !cart.isEmpty else { return .empty }
        return .filled(
            Filled(
                businessId: cart.businessId,
                businessName: cart.businessName,
                lines: cart.lines.enumerated().map { index, line in
                    CartLineRow(
                        signature: line.signature,
                        name: line.name,
                        options: line.modifiers.map {
                            CartOptionText(id: $0.optionId, group: $0.groupName, option: $0.optionName)
                        },
                        note: line.note,
                        quantity: line.quantity,
                        total: displayAmount(line.total),
                        decreaseRemoves: line.quantity == 1,
                        canIncrease: line.quantity < CartLimits.maxQuantity,
                        decreaseLabel: line.quantity == 1
                            ? String(localized: "Quitar \(line.name)")
                            : String(
                                localized: "Quitar una unidad de \(line.name). Llevas \(Self.unitsText(line.quantity))"),
                        increaseLabel: String(
                            localized: "Agregar una unidad de \(line.name). Llevas \(Self.unitsText(line.quantity))"),
                        issues: (issues.indices.contains(index) ? Self.messages(issues[index]) : [])
                            + (formatAmount(line.total) == nil
                                ? [String(localized: "No podemos mostrar el precio por ahora")] : []),
                        canEdit: dishHasOptions(line, in: menu) ?? !line.modifiers.isEmpty
                    )
                },
                subtotal: displayAmount(cart.subtotal),
                amountsAreValid: formatAmount(cart.subtotal) != nil
                    && cart.lines.allSatisfy { formatAmount($0.total) != nil },
                method: cart.method,
                validation: validation,
                countLabel: String(localized: "\(cart.count) productos")
            ))
    }

    /// Los avisos de una línea, sin repetir: dos opciones que cambian de precio dicen una sola vez «El precio cambió…».
    nonisolated static func messages(_ issues: [CartLineIssue]) -> [String] {
        var seen = Set<String>()
        return issues.map(\.message).filter { seen.insert($0).inserted }
    }

    /// ¿El plato de la línea tiene grupos de opciones en la carta vigente? `nil` si no hay carta o el plato no está.
    private static func dishHasOptions(_ line: CartLine, in menu: BusinessDetail?) -> Bool? {
        let wanted = line.itemId.lowercased()
        return menu?.categories.lazy.flatMap(\.items).first { $0.id.lowercased() == wanted }.map(\.isConfigurable)
    }

    /// «1 unidad», «2 unidades» (plural en el catálogo de textos).
    private static func unitsText(_ quantity: Int) -> String {
        String(localized: "\(quantity) unidades")
    }
}
