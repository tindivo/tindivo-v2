import SwiftUI
import TindivoDesign

/// Una línea de la bolsa (`CartLineRow` de Android): la miniatura de 72, el nombre y el total, las opciones y la nota en
/// chips, los avisos de la línea, el selector en píldora y «Editar» / «Quitar». Con letra de accesibilidad la foto sube y
/// el texto usa todo el ancho: al lado de la foto no cabe.
struct CartLineView: View {
    let line: CartLineRow
    let onChange: (Int) -> Void
    /// Mientras se abre otra ficha de «Editar» (esperando la carta) el botón espera.
    let editDisabled: Bool
    let onEdit: () -> Void
    let onRemove: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    private var large: Bool { typeSize.isAccessibilitySize }

    var body: some View {
        Group {
            if large {
                VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
                    thumbnail
                    details
                }
            } else {
                HStack(alignment: .top, spacing: TindivoTokens.Spacing.spaceInner) {
                    thumbnail
                    details
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("cart.line")
    }

    private var thumbnail: some View {
        TindivoThumbnail(url: line.imageURL, size: 72, radius: 14)
            .accessibilityHidden(true)
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            nameAndTotal
            if !line.options.isEmpty || line.note != nil { chips }
            ForEach(Array(line.issues.enumerated()), id: \.offset) { _, issue in
                Text(issue)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("cart.issue")
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 0) {
                    stepper
                    Spacer(minLength: 8)
                    actions
                }
                VStack(alignment: .leading, spacing: 4) {
                    stepper
                    actions
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var nameAndTotal: some View {
        let name = Text(line.name)
            .tindivoText(TypeToken.bodyLarge)
            .fontWeight(.bold)
            .foregroundStyle(Color.tindivo.ink)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
        let total = Text(line.total)
            .amountAccessibility(line.total)
            .tindivoText(TypeToken.bodyLarge)
            .fontWeight(.bold)
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(Color.tindivo.ink)
        return Group {
            if large {
                VStack(alignment: .leading, spacing: 4) {
                    name
                    total
                }
            } else {
                HStack(alignment: .top, spacing: 8) {
                    name.frame(maxWidth: .infinity, alignment: .leading)
                    total
                }
            }
        }
    }

    private var chips: some View {
        FlowLayout(spacing: 6) {
            ForEach(line.options) { option in
                CartChip(
                    text: String(localized: "\(option.group): \(option.option)"),
                    background: Color.tindivo.surfaceSunken, foreground: Color.tindivo.inkSecondary)
            }
            if let note = line.note {
                CartChip(
                    text: String(localized: "Nota: \(note)"),
                    background: Color.tindivo.primaryContainer, foreground: Color.tindivo.onPrimaryContainer)
            }
        }
    }

    private var stepper: some View {
        TindivoStepper(
            style: .pill,
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
        // Como las barras del sistema: sus botones son de 48 y con letra de accesibilidad los iconos se salían.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }

    /// Con una unidad el «−» es un tacho que ya quita la línea: «Quitar» solo sale con más de una.
    private var actions: some View {
        HStack(spacing: 0) {
            if line.canEdit {
                TindivoTextButton("Editar", action: onEdit)
                    .accessibilityLabel(Text("Editar \(line.name)"))
                    .disabled(editDisabled)
                    .accessibilityIdentifier("cart.edit")
            }
            if !line.decreaseRemoves {
                TindivoTextButton("Quitar", action: onRemove)
                    .accessibilityLabel(Text("Quitar \(line.name)"))
                    .accessibilityIdentifier("cart.remove")
            }
        }
    }
}

/// Una opción o la nota de una línea, en su cápsula. Si no cabe en una línea el texto baja y la cápsula pasa a
/// rectángulo redondeado.
private struct CartChip: View {
    let text: String
    let background: Color
    let foreground: Color
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Text(text)
            .tindivoText(TindivoTokens.Typography.bodySecondary)
            .fontWeight(.semibold)
            .foregroundStyle(foreground)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(background, in: shape)
    }

    private var shape: AnyShape {
        typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: 14, style: .continuous)) : AnyShape(Capsule())
    }
}

/// Reparte sus hijos en filas que se rompen donde no caben (`FlowRow` de Compose). A cada hijo le propone, como mucho,
/// el ancho de la fila: un chip largo baja de línea en vez de salirse.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? .infinity, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let frames = arrange(width: bounds.width, subviews: subviews).frames
        for (subview, frame) in zip(subviews, frames) {
            subview.place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                proposal: ProposedViewSize(frame.size))
        }
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        var frames: [CGRect] = []
        var cursorX: CGFloat = 0
        var cursorY: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            var size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
            size.width = min(size.width, width)
            if cursorX > 0, cursorX + size.width > width {
                cursorX = 0
                cursorY += rowHeight + spacing
                rowHeight = 0
            }
            frames.append(CGRect(origin: CGPoint(x: cursorX, y: cursorY), size: size))
            cursorX += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, cursorX - spacing)
        }
        return (CGSize(width: widest, height: cursorY + rowHeight), frames)
    }
}
