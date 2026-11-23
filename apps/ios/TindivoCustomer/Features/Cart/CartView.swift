import SwiftUI
import TindivoDesign

struct CartView: View {
    let model: CartScreenModel
    /// «+ Agregar más»: vuelve a la carta del negocio de la bolsa.
    let onAddMore: (String) -> Void
    let onSeeBusinesses: () -> Void

    @State private var confirmingClear = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

    /// Solo pruebas de interfaz (DEBUG): `-tindivo-voiceover` hace como si VoiceOver estuviera encendido.
    private static var forcesVoiceOver: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-tindivo-voiceover")
        #else
        false
        #endif
    }

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
        .navigationTitle("Tu bolsa")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if case let .filled(filled) = model.state {
                ToolbarItem(placement: .principal) {
                    VStack(spacing: 0) {
                        Text("Tu bolsa").tindivoText(TindivoTokens.Typography.titleSection)
                            .foregroundStyle(Color.tindivo.ink)
                        Text(filled.countLabel).tindivoText(TindivoTokens.Typography.bodySecondary)
                            .foregroundStyle(Color.tindivo.inkSecondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                }
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
        .fullScreenCover(item: Binding(get: { model.editing }, set: { if $0 == nil { model.cancelEditing() } })) {
            target in
            DishView(
                model: model.dishModel(for: target),
                onClose: { model.cancelEditing() },
                onAdded: { model.finishEditing(capped: $0) },
                onLineGone: { model.lineGone() }
            )
        }
        // El aviso de error va encima de la barra de «Deshacer» (la barra reserva su sitio abajo del todo).
        .tindivoToast(model.notices.message)
        .safeAreaInset(edge: .bottom, spacing: 0) { undoBar }
        // 200 ms con la curva del tablero «4 · Bolsa»; con «reducir movimiento», al instante.
        .animation(reduceMotion ? nil : .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.2), value: model.undoOffer?.token)
        // Al quitar, VoiceOver solo lleva el foco al botón «Quitaste X. Deshacer»: sin un anuncio aparte que lo pise.
        .onChange(of: voiceOver, initial: true) { _, running in model.setVoiceOver(running || Self.forcesVoiceOver) }
        .task { await model.observe() }
        .task { await model.validate() }
        .task { await model.runClock() }
        .onDisappear { model.leave() }
    }

    // MARK: Deshacer

    /// «Quitaste "[plato]"» · «Deshacer», con una raya que se vacía en el plazo (con «reducir movimiento» no hay raya).
    @ViewBuilder private var undoBar: some View {
        if let offer = model.undoOffer {
            UndoBar(
                offer: offer, window: model.undoWindow, expires: model.undoAutoDismisses,
                onUndo: { Task { await model.undo() } }
            )
            .id(offer.token)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
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
                Text(filled.methodLabel)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .accessibilityIdentifier("cart.method")
                if filled.validation == .unchecked {
                    Text("No pudimos revisar tu bolsa con la carta. Lo confirmaremos al hacer el pedido.")
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                        .accessibilityIdentifier("cart.unchecked")
                }
                ForEach(filled.lines, id: \.signatureKey) { line in
                    CartLineView(
                        line: line,
                        onChange: { delta in Task { await model.changeQuantity(signature: line.signature, by: delta) }
                        },
                        editDisabled: model.isOpeningEdit,
                        onEdit: { Task { await model.startEditing(signature: line.signature) } },
                        onRemove: { Task { await model.remove(signature: line.signature) } }
                    )
                    Divider().overlay(Color.tindivo.outlineVariant)
                }
                ViewThatFits(in: .horizontal) {
                    HStack {
                        subtotalLabel; Spacer(); subtotalAmount(filled.subtotal)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        subtotalLabel; subtotalAmount(filled.subtotal)
                    }
                }
                .foregroundStyle(Color.tindivo.ink)
                .accessibilityElement(children: .combine)
                if let notice = filled.subtotalNotice {
                    Text(notice)
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.error)
                        .accessibilityIdentifier("cart.subtotalNotice")
                }
                if filled.showsShipping {
                    Text("Delivery · Se calcula con tu dirección")
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                        .accessibilityIdentifier("cart.shipping")
                }
                TindivoSecondaryButton("Agregar más de \(filled.businessName)") { onAddMore(filled.businessId) }
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
            .amountAccessibility(text)
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
    /// Mientras se abre otra ficha de «Editar» (esperando la carta) el botón espera.
    let editDisabled: Bool
    let onEdit: () -> Void
    let onRemove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: TindivoTokens.Spacing.spaceInner) {
                Text(line.name)
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(Color.tindivo.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(line.total)
                    .amountAccessibility(line.total)
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
            ForEach(Array(line.issues.enumerated()), id: \.offset) { _, issue in
                Text(issue)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.error)
                    .accessibilityIdentifier("cart.issue")
            }
            ViewThatFits(in: .horizontal) {
                HStack {
                    stepper; Spacer(); actions
                }
                VStack(alignment: .leading, spacing: 4) {
                    stepper; actions
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("cart.line")
    }

    private var stepper: some View {
        TindivoStepper(
            quantity: line.quantity,
            label: String(localized: "Cantidad de \(line.name)"),
            identifier: "cart",
            canDecrease: true,
            canIncrease: line.canIncrease,
            decreaseRemoves: line.decreaseRemoves,
            decreaseLabel: line.decreaseLabel,
            increaseLabel: line.increaseLabel,
            onDecrease: { onChange(-1) },
            onIncrease: { onChange(1) }
        )
    }

    private var actions: some View {
        HStack(spacing: TindivoTokens.Spacing.spaceInner) {
            if line.canEdit {
                TindivoTextButton("Editar", action: onEdit)
                    .accessibilityLabel(Text("Editar \(line.name)"))
                    .disabled(editDisabled)
                    .accessibilityIdentifier("cart.edit")
            }
            TindivoTextButton("Quitar", action: onRemove)
                .accessibilityLabel(Text("Quitar \(line.name)"))
                .accessibilityIdentifier("cart.remove")
        }
    }
}

/// El aviso de «Deshacer». Cada quitada es otra vista (`.id(token)`): la raya y el foco de VoiceOver arrancan de nuevo.
private struct UndoBar: View {
    let offer: CartScreenModel.UndoOffer
    let window: Duration
    /// Con VoiceOver el aviso no se cierra solo: no hay raya que se vacíe.
    let expires: Bool
    let onUndo: () -> Void

    @State private var start = Date()
    @AccessibilityFocusState private var focused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: TindivoTokens.Spacing.spaceInner) {
                    message.lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                    button
                }
                VStack(alignment: .leading, spacing: 0) {
                    message
                    button
                }
            }
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.vertical, 4)
            if !reduceMotion, expires { bar }
        }
        .background(Color.tindivo.secondary, in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField))
        .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField))
        .padding(TindivoTokens.Spacing.spaceScreen)
        .onAppear { focused = true }
    }

    private var message: some View {
        Text(offer.message)
            .tindivoText(TindivoTokens.Typography.body)
            .foregroundStyle(Color.tindivo.onSecondary)
            // Lo lee el botón («Quitaste X. Deshacer»): el texto suelto sonaría dos veces.
            .accessibilityHidden(true)
    }

    private var button: some View {
        Button(action: onUndo) {
            Text("Deshacer")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.onSecondary)
                .lineLimit(1)
                .fixedSize()
                .frame(minWidth: TindivoTokens.Spacing.touchTarget, minHeight: TindivoTokens.Spacing.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text("\(offer.message). Deshacer"))
        .accessibilityFocused($focused)
        .accessibilityIdentifier("cart.undo")
    }

    /// La raya se vacía a lo largo del plazo; se calcula del instante en que apareció, no de un estado animado.
    private var bar: some View {
        let total = Double(window.components.seconds) + Double(window.components.attoseconds) / 1e18
        return TimelineView(.animation) { context in
            let left = max(0, 1 - context.date.timeIntervalSince(start) / max(total, 0.001))
            Rectangle()
                .fill(Color.tindivo.onSecondary.opacity(0.6))
                .frame(height: 3)
                .scaleEffect(x: left, anchor: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

#if DEBUG
#Preview("Bolsa") {
    let store = FileCartStore.preview()
    CartPreviewHost(store: store)
}

#Preview("Bolsa vacía") {
    NavigationStack {
        CartView(
            model: CartScreenModel(store: FileCartStore.preview(), catalog: PreviewCatalog(), clock: .live),
            onAddMore: { _ in }, onSeeBusinesses: {})
    }
    .onAppear { TindivoFonts.register() }
}

private struct CartPreviewHost: View {
    let store: FileCartStore

    var body: some View {
        NavigationStack {
            CartView(
                model: CartScreenModel(store: store, catalog: PreviewCatalog(), clock: .live), onAddMore: { _ in },
                onSeeBusinesses: {})
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
