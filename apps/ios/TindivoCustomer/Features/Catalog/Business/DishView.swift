import SwiftUI
import TindivoDesign

/// La ficha de un plato, a pantalla completa (decisión de Jesús, 2026-11-19; Android usa una hoja). Es un
/// `fullScreenCover` que se presenta desde dos sitios, `BusinessView` (agregar) y `CartView` (editar una línea):
/// cambiarla a `sheet` es cambiar esas dos líneas.
struct DishView: View {
    @State private var model: DishScreenModel
    let onClose: () -> Void
    /// Se agregó: la carta cierra la ficha y enseña su aviso (con `capped`, el de «máximo por pedido»).
    let onAdded: (Bool) -> Void
    /// Solo al editar desde la bolsa: la línea ya no estaba; quien presenta cierra la ficha y avisa.
    let onLineGone: (() -> Void)?

    init(
        model: DishScreenModel, onClose: @escaping () -> Void, onAdded: @escaping (Bool) -> Void,
        onLineGone: (() -> Void)? = nil
    ) {
        self.onLineGone = onLineGone
        _model = State(initialValue: model)
        self.onClose = onClose
        self.onAdded = onAdded
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @AccessibilityFocusState private var focusedGroup: String?
    /// Cuánto se ha bajado la ficha, para volver sólida la barra de arriba (como `rememberBarProgress` de Android).
    @State private var scrolled: CGFloat = 0

    /// Alto de la foto, sin contar la barra de estado, que queda bajo ella (`DISH_PHOTO_HEIGHT` de Android).
    private static let photoHeight: CGFloat = 220
    private static let scrollSpace = "dish.scroll"

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                scroll
                DishTopBar(name: model.item.name, progress: barProgress, onBack: onClose)
                    .accessibilitySortPriority(1)
            }
            bottomBar
        }
        .background(Color.tindivo.background)
        .tindivoToast(model.notices.message)
        // El gesto de escape de VoiceOver (dos dedos en «Z») cierra la ficha, como el botón «Volver».
        .accessibilityAction(.escape, onClose)
        .replaceBagAlert(
            model.replacement, onKeep: model.keepCurrentBag, onReplace: { model.confirmReplace() }
        )
        .onChange(of: model.outcome) { _, _ in
            switch model.resolveOutcome() {
            case let .added(capped): onAdded(capped)
            case .lineGone: onLineGone?()
            case .stay: break
            }
        }
    }

    // MARK: Piezas

    /// 0 con la foto a la vista, 1 con la barra ya sólida: de 108 a 164 de scroll, como en Android.
    private var barProgress: Double {
        let end = Self.photoHeight - DishTopBar.height
        let range = DishTopBar.height
        return Double(min(max((scrolled - (end - range)) / range, 0), 1))
    }

    private var scroll: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    photo
                        .onGeometryChange(for: CGFloat.self) {
                            -$0.frame(in: .named(Self.scrollSpace)).minY
                        } action: {
                            scrolled = $0
                        }
                    VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceScreen) {
                        header
                        ForEach(model.item.dish.groups, id: \.id) { group in
                            DishGroupSection(group: group, model: model, focus: $focusedGroup)
                        }
                        DishNoteField(model: model)
                    }
                    .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
                    .padding(.bottom, TindivoTokens.Spacing.spaceScreen)
                }
            }
            // La foto llega hasta el borde de arriba, bajo la barra de estado.
            .ignoresSafeArea(edges: .top)
            .scrollDismissesKeyboard(.interactively)
            .coordinateSpace(name: Self.scrollSpace)
            // «Elige [grupo]»: lleva la vista al primer grupo que falta, justo bajo la barra de arriba: cada grupo
            // trae un marcador de alto cero puesto más arriba lo que mide la barra (el resaltado lo pone el grupo).
            .onChange(of: model.attention) { _, attention in
                guard let attention else { return }
                focusedGroup = attention.groupID
                if let message = model.attentionAnnouncement {
                    AccessibilityNotification.Announcement(message).post()
                }
                let target = DishGroupSection.anchorID(attention.groupID)
                if reduceMotion {
                    proxy.scrollTo(target, anchor: .top)
                } else {
                    withAnimation { proxy.scrollTo(target, anchor: .top) }
                }
            }
        }
    }

    /// Con o sin foto el recuadro está: sin foto se ve el isotipo sobre `#FFF7ED` (CUS-CAT-007). El velo de arriba
    /// deja ver los iconos de la barra de estado y el botón.
    private var photo: some View {
        let top = ScreenInsets.top
        return TindivoAsyncImage(url: model.item.heroURL)
            .frame(maxWidth: .infinity)
            .frame(height: Self.photoHeight + top)
            .overlay(alignment: .top) {
                // El velo solo va sobre una foto real: sobre el isotipo en crema ensuciaría la marca.
                if model.item.heroURL != nil {
                    LinearGradient(colors: [.black.opacity(0.35), .clear], startPoint: .top, endPoint: .bottom)
                        .frame(height: top + 24)
                        .allowsHitTesting(false)
                }
            }
            .clipped()
    }

    /// Nombre, descripción y precio en color de marca, con la píldora de avance de lo obligatorio.
    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(model.item.name)
                .tindivoText(TindivoTokens.Typography.titleScreen)
                .foregroundStyle(Color.tindivo.ink)
                .accessibilityAddTraits(.isHeader)
                .padding(.top, 16)
            if let description = model.item.description {
                Text(description)
                    .tindivoText(TypeToken.bodyLarge)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            priceAndProgress
                .padding(.top, 4)
            badges
        }
        .padding(.horizontal, 4)
    }

    /// El precio y «N de M listas» en una fila; con letra grande, uno sobre otro.
    private var priceAndProgress: some View {
        let price = Text(model.item.priceText.replacingOccurrences(of: "S/ ", with: "S/\u{00A0}"))
            .tindivoText(TypeToken.greeting)
            .monospacedDigit()
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(Color.tindivo.primaryText)
            .amountAccessibility(model.item.priceText)
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                price
                Spacer(minLength: 8)
                progressPill
            }
            VStack(alignment: .leading, spacing: 6) {
                price
                progressPill
            }
        }
    }

    @ViewBuilder private var progressPill: some View {
        if let progress = model.progressText {
            TindivoStatusPill(progress, tone: .brand)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("dish.progress")
        }
    }

    /// Las etiquetas del plato tal como las escribió el restaurante (formato por aprobar: la ficha no lo dibuja).
    @ViewBuilder private var badges: some View {
        if !model.item.badges.isEmpty {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 88), spacing: 8, alignment: .leading)], alignment: .leading,
                spacing: 8
            ) {
                ForEach(model.item.badges, id: \.self) { TindivoStatusPill($0) }
            }
            .padding(.top, 4)
        }
    }

    /// Abajo y fija: la cantidad en su píldora y el botón. Con letra de accesibilidad la píldora pasa sobre el botón
    /// (en una fila no caben), y la barra no crece más de `accessibility2` para no tapar media pantalla.
    @ViewBuilder private var bottomBar: some View {
        Group {
            if typeSize.isAccessibilitySize {
                TindivoBottomBar {
                    VStack(spacing: TindivoTokens.Spacing.spaceInner) {
                        stepper
                        addButton
                    }
                }
            } else {
                TindivoBottomBar(leading: { stepper }, content: { addButton })
            }
        }
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }

    private var stepper: some View {
        TindivoStepper(
            style: .filledPill,
            quantity: model.selection.quantity,
            label: String(localized: "Cantidad de \(model.item.name)"),
            canDecrease: model.canDecrease,
            canIncrease: model.canIncrease,
            decreaseLabel: String(localized: "Una menos"),
            increaseLabel: String(localized: "Una más"),
            onDecrease: { model.setQuantity(model.selection.quantity - 1) },
            onIncrease: { model.setQuantity(model.selection.quantity + 1) }
        )
    }

    private var addButton: some View {
        // Nunca en gris (decisión de Jesús, 2026-11-23): con algo obligatorio sin elegir dice qué falta y, tocado, lleva
        // al grupo (CA-CAT-P7).
        TindivoPrimaryButton(
            verbatim: model.ctaTitle, loading: model.isAdding,
            hint: model.ctaBlocked ? "Te lleva al grupo que falta" : nil
        ) {
            Task { await model.tapAdd() }
        }
        .disabled(model.ctaDisabled)
        .amountAccessibility(model.ctaTitle)
        .accessibilityIdentifier("dish.add")
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
