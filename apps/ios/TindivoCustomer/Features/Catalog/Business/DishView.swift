import SwiftUI
import TindivoDesign

/// La ficha de un plato, a pantalla completa (decisión de Jesús, 2026-11-19; Android usa una hoja). Es un
/// `fullScreenCover` que se presenta en UN solo sitio, `BusinessView`: cambiarla a `sheet` es cambiar esa línea.
struct DishView: View {
    @State private var model: DishScreenModel
    let onClose: () -> Void
    /// Se agregó: la carta cierra la ficha y enseña su aviso (con `capped`, el de «máximo por pedido»).
    let onAdded: (Bool) -> Void

    init(model: DishScreenModel, onClose: @escaping () -> Void, onAdded: @escaping (Bool) -> Void) {
        _model = State(initialValue: model)
        self.onClose = onClose
        self.onAdded = onAdded
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    ForEach(model.item.dish.groups, id: \.id) { group in
                        DishGroupSection(group: group, model: model)
                    }
                    note
                    quantity
                }
                .padding(.bottom, TindivoTokens.Spacing.spaceScreen)
            }
            .scrollDismissesKeyboard(.interactively)
            addBar
        }
        .background(Color.tindivo.background)
        .overlay(alignment: .topTrailing) { closeButton }
        .tindivoToast(model.notices.message)
        .alert(
            Text("¿Empezar una bolsa nueva?"),
            isPresented: Binding(get: { otherBusiness != nil }, set: { _ in }),
            presenting: otherBusiness
        ) { _ in
            Button("Mantener", role: .cancel) { model.keepCurrentBag() }
            Button("Vaciar y empezar") { model.confirmReplace() }
        } message: { names in
            Text("Tu bolsa tiene productos de \(names.current). Solo puedes pedir de un restaurante a la vez. Si continúas, vaciaremos tu bolsa para empezar en \(names.new).")
        }
        .onChange(of: model.outcome) { _, outcome in react(to: outcome) }
    }

    private var otherBusiness: (current: String, new: String)? {
        if case let .otherBusiness(current, new) = model.outcome { (current, new) } else { nil }
    }

    private func react(to outcome: DishScreenModel.Outcome?) {
        guard let outcome else { return }
        switch outcome {
        case let .added(capped):
            model.consumeOutcome()
            onAdded(capped)
        case .full, .failed:
            model.showNotice(for: outcome)
            model.consumeOutcome()
        case .otherBusiness:
            break
        }
    }

    // MARK: Piezas

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let hero = model.item.heroURL {
                TindivoAsyncImage(url: hero)
                    .frame(maxWidth: .infinity)
                    .frame(height: 220)
            }
            Group {
                Text(model.item.name)
                    .tindivoText(TindivoTokens.Typography.titleScreen)
                    .foregroundStyle(Color.tindivo.ink)
                    .accessibilityAddTraits(.isHeader)
                    // Sin foto, la X cae sobre el título: se le deja su hueco a la derecha.
                    .padding(.trailing, model.item.heroURL == nil ? TindivoTokens.Spacing.touchTarget : 0)
                if let description = model.item.description {
                    Text(description)
                        .tindivoText(TindivoTokens.Typography.body)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                }
                Text(model.item.priceText)
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .monospacedDigit()
                    .lineLimit(1)
                    .fixedSize()
                    .foregroundStyle(Color.tindivo.ink)
            }
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.top, 4)
        }
    }

    private var note: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Nota (opcional)")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.ink)
            TextField(
                "",
                text: Binding(get: { model.selection.note }, set: { model.setNote($0) }),
                prompt: Text("Ej. sin cebolla, bien cocido, tocar timbre 2 veces…"),
                axis: .vertical
            )
            .lineLimit(2...4)
            .tindivoText(TindivoTokens.Typography.body)
            .padding(TindivoTokens.Spacing.spaceInner)
            .background(Color.tindivo.surfaceSunken, in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField))
            .accessibilityLabel(Text("Nota (opcional)"))
            .accessibilityIdentifier("dish.note")
            Text("\(model.selection.note.utf16.count)/\(CartLimits.maxNoteLength)")
                .tindivoText(TindivoTokens.Typography.bodySecondary)
                .foregroundStyle(Color.tindivo.inkSecondary)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .padding(.top, TindivoTokens.Spacing.spaceGroup)
    }

    private var quantity: some View {
        HStack {
            Text("Cantidad")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            TindivoStepper(
                quantity: model.selection.quantity,
                canDecrease: model.canDecrease,
                canIncrease: model.canIncrease,
                decreaseLabel: String(localized: "Una menos"),
                increaseLabel: String(localized: "Una más"),
                onDecrease: { model.setQuantity(model.selection.quantity - 1) },
                onIncrease: { model.setQuantity(model.selection.quantity + 1) }
            )
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .padding(.top, TindivoTokens.Spacing.spaceGroup)
    }

    private var addBar: some View {
        TindivoBottomBar {
            TindivoPrimaryButton(verbatim: ctaTitle, loading: model.isAdding) {
                Task { await model.add() }
            }
            .disabled(!model.canAdd)
            .accessibilityIdentifier("dish.add")
        }
    }

    private var ctaTitle: String {
        switch model.selection.cta {
        case let .add(total): String(localized: "Agregar · \(total)")
        case let .complete(missing):
            missing == 1 ? String(localized: "Completa \(missing) opción") : String(localized: "Completa \(missing) opciones")
        }
    }

    private var closeButton: some View {
        TindivoIconButton(.close, label: "Cerrar", action: onClose)
            .background(Color.tindivo.surface.opacity(0.92), in: Circle())
            .tindivoElevation(TindivoTokens.Elevation.elevation1)
            .padding(TindivoTokens.Spacing.spaceInner)
            .accessibilityIdentifier("dish.close")
    }
}

#if DEBUG
#Preview("Plato") {
    let environment = AppEnvironment.preview()
    let item = (BusinessDetailPreview.detail?.categories.first?.items.first)
    if let item {
        DishView(
            model: DishScreenModel(
                item: item, businessId: "n1", businessName: "Pollería Don Lucho",
                cartStore: environment.cartStore, clock: environment.clock
            ),
            onClose: {}, onAdded: { _ in }
        )
        .onAppear { TindivoFonts.register() }
    }
}

enum BusinessDetailPreview {
    static let detail = MenuMapping.detail(from: PreviewData.menu)
}
#endif
