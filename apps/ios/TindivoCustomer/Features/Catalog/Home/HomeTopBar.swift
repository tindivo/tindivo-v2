import SwiftUI
import TindivoDesign

/// La barra superior fija de Inicio (CUS-CAT-030 ★): el logo, el chip de dos líneas «Entregar en» / [dirección] y la
/// bolsa con su contador, siempre visible, también vacía. Sin sesión o sin dirección el chip no se muestra (ficha de
/// Inicio): `address` es `nil` y no se dibuja nada en su lugar. Tocar la bolsa abre la bolsa.
struct HomeTopBar: View {
    /// La dirección de entrega elegida; `nil` = no hay (el chip no se muestra).
    let address: String?
    /// El número de la insignia de la bolsa («3», «99+»); `nil` con la bolsa vacía.
    let bagBadge: String?
    let bagLabel: String
    let onOpenBag: () -> Void

    var body: some View {
        HStack(spacing: TindivoTokens.Spacing.spaceInner) {
            TindivoLogo()
                .accessibilityIdentifier("home.logo")
            if let address {
                deliveryChip(address)
            }
            Spacer(minLength: 0)
            bag
        }
        .padding(.leading, TindivoTokens.Spacing.spaceScreen)
        .padding(.trailing, 4)
        .frame(minHeight: 56)
        .background(Color.tindivo.surface)
        .tindivoElevation(TindivoTokens.Elevation.elevation1)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.topBar")
    }

    private func deliveryChip(_ address: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Entregar en")
                .tindivoText(TindivoTokens.Typography.bodySecondary)
                .foregroundStyle(Color.tindivo.inkSecondary)
            Text(address)
                .tindivoText(TindivoTokens.Typography.chip)
                .foregroundStyle(Color.tindivo.ink)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("home.deliveryChip")
    }

    private var bag: some View {
        Button(action: onOpenBag) {
            Image(tindivo: .bag)
                .accessibilityHidden(true)
                .font(.title3)
                .foregroundStyle(Color.tindivo.ink)
                .frame(minWidth: TindivoTokens.Spacing.touchTarget, minHeight: TindivoTokens.Spacing.touchTarget)
                .overlay(alignment: .topTrailing) { badge }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(bagLabel)
        .accessibilityIdentifier("home.bag")
    }

    /// `primaryText` (`#C2410C`, 5,2:1 con blanco) y negrita: la insignia es texto sobre un fondo de la marca.
    @ViewBuilder private var badge: some View {
        if let bagBadge {
            Text(verbatim: bagBadge)
                .tindivoText(TindivoTokens.Typography.bodySecondary)
                .fontWeight(.bold)
                .monospacedDigit()
                .foregroundStyle(Color.tindivo.onPrimary)
                .padding(.horizontal, 6)
                .frame(minWidth: 20, minHeight: 20)
                .background(Color.tindivo.primaryText, in: Capsule())
                .offset(x: -2, y: 4)
                .accessibilityIdentifier("home.bag.badge")
        }
    }
}

#if DEBUG
#Preview("Barra de Inicio") {
    VStack(spacing: TindivoTokens.Spacing.spaceGroup) {
        HomeTopBar(address: nil, bagBadge: nil, bagLabel: "Bolsa", onOpenBag: {})
        HomeTopBar(address: nil, bagBadge: "2", bagLabel: "Bolsa, 2 productos", onOpenBag: {})
        HomeTopBar(address: "Jr. Bolognesi 123", bagBadge: "99+", bagLabel: "Bolsa", onOpenBag: {})
        Spacer()
    }
    .background(Color.tindivo.background)
    .onAppear { TindivoFonts.register() }
}
#endif
