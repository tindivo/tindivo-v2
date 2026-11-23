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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
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
                // «Elige [grupo]»: lleva la vista al primer grupo que falta (la sacudida la pone el propio grupo).
                .onChange(of: model.attention) { _, attention in
                    guard let attention else { return }
                    if reduceMotion {
                        proxy.scrollTo(attention.groupID, anchor: .top)
                    } else {
                        withAnimation { proxy.scrollTo(attention.groupID, anchor: .top) }
                    }
                }
            }
            addBar
        }
        .background(Color.tindivo.background)
        .overlay(alignment: .topTrailing) { closeButton }
        .tindivoToast(model.notices.message)
        // El gesto de escape de VoiceOver (dos dedos en «Z») cierra la ficha, como el botón «Cerrar».
        .accessibilityAction(.escape, onClose)
        .alert(
            Text("¿Empezar una bolsa nueva?"),
            isPresented: Binding(get: { model.replacement != nil }, set: { _ in }),
            presenting: model.replacement
        ) { _ in
            Button("Mantener", role: .cancel) { model.keepCurrentBag() }
            Button("Vaciar y empezar") { model.confirmReplace() }
        } message: { names in
            Text("Tu bolsa tiene productos de \(names.current). Solo puedes pedir de un restaurante a la vez. Si continúas, vaciaremos tu bolsa para empezar en \(names.new).")
        }
        .onChange(of: model.outcome) { _, _ in
            if case let .added(capped) = model.resolveOutcome() { onAdded(capped) }
        }
    }

    // MARK: Piezas

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Con o sin foto el recuadro está: sin foto se ve el isotipo sobre `#FFF7ED` (CUS-CAT-007).
            TindivoAsyncImage(url: model.item.heroURL)
                .frame(maxWidth: .infinity)
                .frame(height: 220)
            Group {
                Text(model.item.name)
                    .tindivoText(TindivoTokens.Typography.titleScreen)
                    .foregroundStyle(Color.tindivo.ink)
                    .accessibilityAddTraits(.isHeader)
                if let description = model.item.description {
                    Text(description)
                        .tindivoText(TindivoTokens.Typography.body)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                }
                Text(model.item.priceText)
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .monospacedDigit()
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(Color.tindivo.ink)
                badges
                if let progress = model.progressText {
                    Text(progress)
                        .tindivoText(TindivoTokens.Typography.body)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.tindivo.ink)
                        .padding(.top, 4)
                        .accessibilityIdentifier("dish.progress")
                }
            }
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.top, 4)
        }
    }

    /// Las etiquetas del plato tal como las escribió el restaurante (formato por aprobar: la ficha no lo dibuja).
    @ViewBuilder private var badges: some View {
        if !model.item.badges.isEmpty {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: 8, alignment: .leading)], alignment: .leading, spacing: 8) {
                ForEach(model.item.badges, id: \.self) { TindivoChip($0) }
            }
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
            Text(model.noteCounter.text)
                .tindivoText(TindivoTokens.Typography.bodySecondary)
                .monospacedDigit()
                .foregroundStyle(Color.tindivo.inkSecondary)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .accessibilityLabel(model.noteCounter.spoken)
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
            // Apagado pero tocable: con algo obligatorio sin elegir, tocarlo lleva al grupo que falta (CA-CAT-P7).
            TindivoPrimaryButton(
                verbatim: model.ctaTitle, loading: model.isAdding, muted: model.ctaBlocked,
                hint: model.ctaBlocked ? "Te lleva al grupo que falta" : nil
            ) {
                Task { await model.tapAdd() }
            }
            .accessibilityIdentifier("dish.add")
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
