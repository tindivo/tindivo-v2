import SwiftUI
import TindivoDesign

struct CartView: View {
    let model: CartScreenModel
    /// «+ Agregar más»: vuelve a la carta del negocio de la bolsa.
    let onAddMore: (String) -> Void
    let onSeeBusinesses: () -> Void
    /// «Continuar»: el checkout (en iOS, hoy, «Próximamente»).
    let onContinue: () -> Void

    @State private var confirmingClear = false
    @Environment(\.dismiss) private var dismiss
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
        // La bolsa dibuja su barra (blanca, con sombra): la de navegación se oculta, y con ella el título que el sistema
        // le daría a VoiceOver, que se deja puesto. El gesto de volver deslizando lo devuelve `InteractivePopGesture`.
        .toolbar(.hidden, for: .navigationBar)
        .background { InteractivePopGesture(enabled: true).frame(width: 0, height: 0) }
        .navigationTitle("Tu bolsa")
        .safeAreaInset(edge: .top, spacing: 0) {
            CartTopBar(countLabel: filledState?.countLabel, onBack: { dismiss() })
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
        // El aviso de error va encima de las barras de abajo (reservan su sitio abajo del todo).
        .tindivoToast(model.notices.message)
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomBars }
        // 200 ms con la curva del tablero «4 · Bolsa»; con «reducir movimiento», al instante.
        .animation(reduceMotion ? nil : .timingCurve(0.2, 0.8, 0.2, 1, duration: 0.2), value: model.undoOffer?.token)
        // Al quitar, VoiceOver solo lleva el foco al botón «Quitaste X. Deshacer»: sin un anuncio aparte que lo pise.
        .onChange(of: voiceOver, initial: true) { _, running in model.setVoiceOver(running || Self.forcesVoiceOver) }
        .task { await model.observe() }
        .task { await model.validate() }
        .task { await model.runClock() }
        .onDisappear { model.leave() }
    }

    private var filledState: CartScreenModel.Filled? {
        if case let .filled(filled) = model.state { filled } else { nil }
    }

    // MARK: Abajo: «Deshacer» y «Continuar»

    @ViewBuilder private var bottomBars: some View {
        VStack(spacing: 0) {
            undoBar
            if let filled = filledState {
                CartContinueBar(
                    // Durante «Reintentar» la bolsa vuelve a «validando», pero el botón se queda (apagado): si no, el
                    // botón tocado desaparece y VoiceOver pierde el foco.
                    state: model.isRetryingCheck ? .retry : filled.continueState, subtotal: filled.subtotal,
                    retrying: model.isRetryingCheck, onContinue: onContinue,
                    onRetry: { Task { await model.retryCheck() } }
                )
            }
        }
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
            TindivoRoundIcon(.bag, size: 96)
            Text("Tu bolsa está vacía")
                .tindivoText(TindivoTokens.Typography.titleSection)
                .foregroundStyle(Color.tindivo.ink)
            TindivoPrimaryButton("Ver negocios", action: onSeeBusinesses)
                .frame(maxWidth: 280)
        }
        .padding(TindivoTokens.Spacing.spaceScreen)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Carta caída (CA-CRT-14)

    /// «No pudimos revisar la carta. Toca Reintentar.»: el botón es el de abajo. VoiceOver lo anuncia al aparecer y otra
    /// vez si el reintento vuelve a fallar: `checkFailures` sube con cada fallo y reinicia la tarea.
    private var checkFailedNotice: some View {
        Text("No pudimos revisar la carta. Toca Reintentar.")
            .tindivoText(TindivoTokens.Typography.bodySecondary)
            .foregroundStyle(Color.tindivo.error)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 4)
            .accessibilityIdentifier("cart.unchecked")
            .task(id: model.checkFailures) {
                AccessibilityNotification.Announcement(
                    String(localized: "No pudimos revisar la carta. Toca Reintentar.")
                )
                .post()
            }
    }

    // MARK: Con platos

    private func bag(_ filled: CartScreenModel.Filled) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceScreen) {
                CartBusinessRow(name: filled.businessName, methodLabel: filled.methodLabel)
                // Durante «Reintentar» la bolsa vuelve a «validando», pero el aviso se queda.
                if filled.validation == .checkFailed || model.isRetryingCheck {
                    checkFailedNotice
                }
                linesCard(filled)
                CartAddMoreRow(businessName: filled.businessName) { onAddMore(filled.businessId) }
                CartTotalsCard(subtotal: filled.subtotal, showsShipping: filled.showsShipping)
                if let notice = filled.amountNotice {
                    Text(notice)
                        .tindivoText(TindivoTokens.Typography.bodySecondary)
                        .foregroundStyle(Color.tindivo.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 4)
                        .accessibilityIdentifier("cart.subtotalNotice")
                }
                // Destructivo y poco frecuente: al final, como texto, y con confirmación antes de vaciar.
                Button {
                    confirmingClear = true
                } label: {
                    Text("Vaciar")
                        .tindivoText(TindivoTokens.Typography.chip)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.tindivo.error)
                        .frame(maxWidth: .infinity, minHeight: TindivoTokens.Spacing.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("cart.clear")
            }
            .padding(TindivoTokens.Spacing.spaceScreen)
        }
    }

    /// Todas las líneas en una tarjeta, con un divisor entre una y otra.
    private func linesCard(_ filled: CartScreenModel.Filled) -> some View {
        TindivoCard {
            VStack(spacing: 0) {
                ForEach(Array(filled.lines.enumerated()), id: \.element.signatureKey) { index, line in
                    if index > 0 {
                        Divider().overlay(Color.tindivo.outlineVariant).padding(.horizontal, 14)
                    }
                    CartLineView(
                        line: line,
                        onChange: { delta in
                            Task { await model.changeQuantity(signature: line.signature, by: delta) }
                        },
                        editDisabled: model.isOpeningEdit,
                        onEdit: { Task { await model.startEditing(signature: line.signature) } },
                        onRemove: { Task { await model.remove(signature: line.signature) } }
                    )
                }
            }
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
            onAddMore: { _ in }, onSeeBusinesses: {}, onContinue: {})
    }
    .onAppear { TindivoFonts.register() }
}

private struct CartPreviewHost: View {
    let store: FileCartStore

    var body: some View {
        NavigationStack {
            CartView(
                model: CartScreenModel(store: store, catalog: PreviewCatalog(), clock: .live), onAddMore: { _ in },
                onSeeBusinesses: {}, onContinue: {})
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
