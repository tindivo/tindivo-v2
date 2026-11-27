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
    /// Solo en DEBUG: una pulsación larga en el isotipo abre Diagnóstico. `nil` en las demás compilaciones.
    var onOpenDiagnostics: (() -> Void)?

    var body: some View {
        HStack(spacing: TindivoTokens.Spacing.spaceInner) {
            TindivoLogo()
                .accessibilityIdentifier("home.logo")
                .onLongPressGesture(minimumDuration: 1) { onOpenDiagnostics?() }
            if let address {
                deliveryChip(address)
            }
            Spacer(minLength: 0)
            bag
        }
        .padding(.leading, TindivoTokens.Spacing.spaceScreen)
        .padding(.trailing, 4)
        .frame(minHeight: 56)
        .background(Color.tindivo.surface.shadow(.drop(color: Color.tindivo.ink.opacity(0.14), radius: 2, y: 1)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.topBar")
    }

    private func deliveryChip(_ address: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Entregar en")
                .tindivoText(TypeToken.labelSmall)
                .foregroundStyle(Color.tindivo.inkSecondary)
            Text(address)
                .tindivoText(TypeToken.labelLarge)
                .fontWeight(.semibold)
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
                .font(.system(size: 24))
                .foregroundStyle(Color.tindivo.ink)
                .frame(minWidth: TindivoTokens.Spacing.touchTarget, minHeight: TindivoTokens.Spacing.touchTarget)
                .overlay(alignment: .topTrailing) { badge }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(bagLabel)
        .accessibilityIdentifier("home.bag")
    }

    /// `primaryText` (`#C2410C`, el `primary` de Android; 5,2:1 con blanco) y negrita: la insignia es texto sobre un fondo de
    /// la marca. Sin interlineado extra para que la cápsula no crezca. Sale 8 a la derecha y 6 arriba del icono.
    @ViewBuilder private var badge: some View {
        if let bagBadge {
            Text(verbatim: bagBadge)
                .font(.tindivo(TindivoTokens.Typography.bodySecondary))
                .fontWeight(.bold)
                .monospacedDigit()
                .foregroundStyle(Color.tindivo.onPrimary)
                .padding(.horizontal, 4)
                .frame(minWidth: 20, minHeight: 20)
                .background(Color.tindivo.primaryText, in: Capsule())
                .offset(x: 8, y: -6)
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
