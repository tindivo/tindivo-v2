import SwiftUI
import TindivoDesign

/// El negocio de la bolsa: su icono redondo, el nombre y «Delivery» o «Recojo» (CUS-CRT-010).
struct CartBusinessRow: View {
    let name: String
    let methodLabel: String

    var body: some View {
        HStack(spacing: TindivoTokens.Spacing.spaceInner) {
            TindivoRoundIcon(.bag, size: 44)
            VStack(alignment: .leading, spacing: 0) {
                Text(name)
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(Color.tindivo.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(methodLabel)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .accessibilityIdentifier("cart.method")
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
    }
}

/// «Agregar más de [negocio]»: una píldora con contorno, el «+» en su círculo y el chevron. Con letra grande el texto
/// baja de línea y la píldora pasa a rectángulo redondeado.
struct CartAddMoreRow: View {
    let businessName: String
    let action: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    private var shape: AnyShape {
        typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusField, style: .continuous))
            : AnyShape(Capsule())
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: TindivoTokens.Spacing.spaceInner) {
                TindivoRoundIcon(.plus, size: 40)
                Text("Agregar más de \(businessName)")
                    .tindivoText(TypeToken.bodyLarge)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.tindivo.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(tindivo: .forward)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.tindivo.ink)
                    .accessibilityHidden(true)
            }
            .padding(.leading, 6)
            .padding(.trailing, 16)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Color.tindivo.surface, in: shape)
            .overlay(shape.stroke(Color.tindivo.outline, lineWidth: 1))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("cart.addMore")
    }
}

/// El resumen: el subtotal y, en delivery, que el envío se calcula con la dirección (CA-CRT-08). Cada fila lleva su
/// icono redondo.
struct CartTotalsCard: View {
    let subtotal: String
    let showsShipping: Bool

    var body: some View {
        TindivoCard(padding: TindivoTokens.Spacing.spaceScreen) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: TindivoTokens.Spacing.spaceInner) {
                    TindivoRoundIcon(.receipt, size: 40)
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) {
                            label
                            Spacer(minLength: 8)
                            amount
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            label
                            amount
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                if showsShipping {
                    HStack(spacing: TindivoTokens.Spacing.spaceInner) {
                        TindivoRoundIcon(.courier, size: 40)
                        Text("Delivery · Se calcula con tu dirección")
                            .tindivoText(TindivoTokens.Typography.bodySecondary)
                            .foregroundStyle(Color.tindivo.inkSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityIdentifier("cart.shipping")
                    }
                }
            }
        }
    }

    private var label: some View {
        Text("Subtotal")
            .tindivoText(TypeToken.bodyLarge)
            .foregroundStyle(Color.tindivo.inkSecondary)
            .lineLimit(1)
            .fixedSize()
    }

    private var amount: some View {
        Text(subtotal)
            .amountAccessibility(subtotal)
            .tindivoText(TindivoTokens.Typography.titleSection)
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(Color.tindivo.ink)
            .accessibilityIdentifier("cart.subtotal")
    }
}
