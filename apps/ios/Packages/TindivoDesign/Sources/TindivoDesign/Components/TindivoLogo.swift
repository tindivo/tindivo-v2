import SwiftUI

/// El isotipo de Tindivo en sus dos colores (naranja y gris), tal como está en el tablero. `TindivoLogo` es el logo de
/// la barra superior, con nombre para VoiceOver; `TindivoBrandFallback` es el respaldo de marca de una foto que falta
/// (sobre `primaryContainer`, `#FFF7ED`), decorativo porque la foto ausente no dice nada que leer.
public struct TindivoLogo: View {
    private let height: CGFloat
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

    public init(height: CGFloat = 28) {
        self.height = height
    }

    public var body: some View {
        TindivoIsotipo()
            .frame(height: height * min(scale, 1.6))
            .accessibilityLabel(Text("Tindivo", bundle: .module))
            .accessibilityAddTraits(.isImage)
    }
}

/// El dibujo del isotipo, con su proporción (158 × 93), sin etiqueta.
struct TindivoIsotipo: View {
    static let ratio: CGFloat = 158.0 / 93.0

    var body: some View {
        Image("TindivoIsotipo", bundle: .module)
            .resizable()
            .interpolation(.high)
            .aspectRatio(Self.ratio, contentMode: .fit)
    }
}

/// Lo que se ve cuando un plato o un negocio no tiene foto (o mientras carga o si falla): el isotipo, de un 40 % del
/// ancho del recuadro, sobre `primaryContainer`. Llena el marco que le den.
public struct TindivoBrandFallback: View {
    private static let share: CGFloat = 0.4

    public init() {}

    public var body: some View {
        Color.tindivo.primaryContainer
            .overlay {
                GeometryReader { proxy in
                    TindivoIsotipo()
                        .frame(width: proxy.size.width * Self.share)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .accessibilityHidden(true)
    }
}

#Preview("Isotipo y respaldo de marca") {
    VStack(spacing: TindivoTokens.Spacing.spaceInner) {
        TindivoLogo()
        HStack {
            TindivoBrandFallback().frame(width: 92, height: 92)
            TindivoBrandFallback().frame(width: 160, height: 120)
        }
        TindivoBrandFallback().frame(height: 160)
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
}
