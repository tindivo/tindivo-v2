import SwiftUI
import TindivoDesign

/// La puerta a Tindivo Entregas en Inicio (`CourierEntryCard.kt`): banner compacto de alto mínimo 96 con el degradado
/// de marca, el título y la línea en blanco, la píldora blanca «Pedir una entrega →» y la moto. Toda la tarjeta se toca.
struct CourierEntryCard: View {
    let onTap: () -> Void

    private static let motoWidth: CGFloat = 84
    private static let motoRatio: CGFloat = 400.0 / 362.0

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Entregas")
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(.white)
                Text("De A a B, ya pagado")
                    .tindivoText(TypeToken.bodyMedium)
                    .fontWeight(.medium)
                    .foregroundStyle(.white)
                HStack(spacing: 4) {
                    Text("Pedir una entrega")
                        .tindivoText(TypeToken.labelLarge)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Image(tindivo: .arrowForward)
                        .font(.system(size: 13, weight: .bold))
                        .accessibilityHidden(true)
                }
                .foregroundStyle(Color.tindivo.primaryText)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 12)
                .padding(.trailing, 8)
                .frame(minHeight: 28)
                .background(.white, in: Capsule())
                .padding(.top, 6)
            }
            .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
            .padding(.vertical, TindivoTokens.Spacing.spaceInner)
            .padding(.trailing, Self.motoWidth - 8)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            .background {
                // La sombra naranja va en el fondo, no en el contenido: el texto blanco no la proyecta.
                ZStack(alignment: .trailing) {
                    LinearGradient(
                        colors: [Color.tindivo.primaryText, Color.tindivo.gradientCtaEnd, Color.tindivo.brand],
                        startPoint: .topLeading, endPoint: .bottomTrailing)
                    // Decorativa: el título ya nombra el servicio.
                    Image("MotoTindivo")
                        .resizable()
                        .aspectRatio(Self.motoRatio, contentMode: .fit)
                        .frame(width: Self.motoWidth)
                        .offset(x: 8)
                        .accessibilityHidden(true)
                }
                .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard, style: .continuous))
                .shadow(color: Color.tindivo.brand.opacity(0.45), radius: 6, x: 0, y: 4)
            }
            .contentShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("home.courierCard")
    }
}

#if DEBUG
#Preview("Banner de Entregas") {
    CourierEntryCard(onTap: {})
        .padding(TindivoTokens.Spacing.spaceScreen)
        .background(Color.tindivo.background)
        .onAppear { TindivoFonts.register() }
}
#endif
