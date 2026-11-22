import SwiftUI
import TindivoDesign

struct CartView: View {
    let model: CartScreenModel
    /// «+ Agregar más»: vuelve a la carta del negocio de la bolsa.
    let onAddMore: (String) -> Void
    let onSeeBusinesses: () -> Void

    @State private var confirmingClear = false

    var body: some View {
        Group {
            switch model.state {
            case .loading:
                Color.clear
            case .empty:
                emptyBag
            case let .filled(filled):
                bag(filled)
            }
        }
        .background(Color.tindivo.background)
        .navigationTitle("Mi bolsa")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if case .filled = model.state {
                ToolbarItem(placement: .topBarTrailing) {
                    TindivoTextButton("Vaciar") { confirmingClear = true }
                        .accessibilityIdentifier("cart.clear")
                }
            }
        }
        .alert("¿Vaciar tu bolsa?", isPresented: $confirmingClear) {
            Button("Cancelar", role: .cancel) {}
            Button("Vaciar", role: .destructive) { Task { await model.clear() } }
        }
        .task { await model.observe() }
    }

    // MARK: Vacía

    private var emptyBag: some View {
        VStack(spacing: TindivoTokens.Spacing.spaceScreen) {
            Text("Tu bolsa está vacía")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.ink)
            TindivoPrimaryButton("Ver negocios", action: onSeeBusinesses)
                .frame(maxWidth: 280)
        }
        .padding(TindivoTokens.Spacing.spaceScreen)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Con platos

    private func bag(_ filled: CartScreenModel.Filled) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
                Text(filled.businessName)
                    .tindivoText(TindivoTokens.Typography.titleScreen)
                    .foregroundStyle(Color.tindivo.ink)
                    .accessibilityAddTraits(.isHeader)
                ForEach(filled.lines, id: \.signatureKey) { line in
                    CartLineView(
                        line: line,
                        onChange: { delta in Task { await model.changeQuantity(signature: line.signature, by: delta) } },
                        onRemove: { Task { await model.remove(signature: line.signature) } }
                    )
                    Divider().overlay(Color.tindivo.outlineVariant)
                }
                ViewThatFits(in: .horizontal) {
                    HStack { subtotalLabel; Spacer(); subtotalAmount(filled.subtotal) }
                    VStack(alignment: .leading, spacing: 2) { subtotalLabel; subtotalAmount(filled.subtotal) }
                }
                .foregroundStyle(Color.tindivo.ink)
                .accessibilityElement(children: .combine)
                Text("El envío y el total final se calculan al confirmar el pedido.")
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                TindivoSecondaryButton("+ Agregar más") { onAddMore(filled.businessId) }
                    .accessibilityIdentifier("cart.addMore")
            }
            .padding(TindivoTokens.Spacing.spaceScreen)
        }
        // Fase 2: checkout. Hasta que exista, la bolsa no enseña «Continuar»: un botón que no hace nada engaña.
    }
}

extension CartView {
    fileprivate var subtotalLabel: some View {
        Text("Subtotal")
            .tindivoText(TindivoTokens.Typography.titleSection)
            .lineLimit(1)
            .fixedSize()
    }

    fileprivate func subtotalAmount(_ text: String) -> some View {
        Text(text)
            .tindivoText(TindivoTokens.Typography.titleSection)
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize()
            .accessibilityIdentifier("cart.subtotal")
    }
}

/// Una línea de la bolsa: nombre y total, sus opciones y su nota, y los controles de cantidad.
private struct CartLineView: View {
    let line: CartLineRow
    let onChange: (Int) -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: TindivoTokens.Spacing.spaceInner) {
                Text(line.name)
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(Color.tindivo.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(line.total)
                    .tindivoText(TindivoTokens.Typography.body)
                    .monospacedDigit()
                    .lineLimit(1)
                    .fixedSize()
                    .foregroundStyle(Color.tindivo.ink)
            }
            ForEach(line.options) { option in
                Text("\(option.group): \(option.option)")
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            if let note = line.note {
                Text("Nota: \(note)")
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            HStack {
                TindivoStepper(
                    quantity: line.quantity,
                    canDecrease: true,
                    canIncrease: line.canIncrease,
                    decreaseLabel: line.decreaseRemoves
                        ? String(localized: "Quitar \(line.name)")
                        : String(localized: "Quitar una unidad de \(line.name)"),
                    increaseLabel: String(localized: "Agregar una unidad de \(line.name)"),
                    onDecrease: { onChange(-1) },
                    onIncrease: { onChange(1) }
                )
                Spacer()
                TindivoTextButton("Quitar", action: onRemove)
                    .accessibilityLabel(Text("Quitar \(line.name)"))
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("cart.line")
    }
}

#if DEBUG
#Preview("Bolsa") {
    let store = FileCartStore.preview()
    CartPreviewHost(store: store)
}

#Preview("Bolsa vacía") {
    NavigationStack {
        CartView(model: CartScreenModel(store: FileCartStore.preview()), onAddMore: { _ in }, onSeeBusinesses: {})
    }
    .onAppear { TindivoFonts.register() }
}

private struct CartPreviewHost: View {
    let store: FileCartStore

    var body: some View {
        NavigationStack {
            CartView(model: CartScreenModel(store: store), onAddMore: { _ in }, onSeeBusinesses: {})
        }
        .task {
            let line = CartLine(
                itemId: "i1", name: "Pollo a la brasa",
                basePrice: PreviewData.price,
                modifiers: [CartModifier(optionId: "o1", groupName: "Tamaño", optionName: "1/4", price: 0)],
                note: "sin ají", quantity: 2, imageURL: nil
            )
            _ = try? await store.add(businessId: "n1", businessName: "Pollería Don Lucho", line: line)
        }
        .onAppear { TindivoFonts.register() }
    }
}
#endif
