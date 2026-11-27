import SwiftUI

/// La miniatura cuadrada de un plato o un negocio: la foto (o el isotipo sobre `primaryContainer` si no hay) con las
/// esquinas redondeadas. Android usa 72 con radio 14 en la bolsa y 104 con radio 12 en la carta.
public struct TindivoThumbnail: View {
    private let url: String?
    private let size: CGFloat
    private let radius: CGFloat

    public init(url: String?, size: CGFloat = 72, radius: CGFloat = TindivoTokens.Radius.radiusThumb) {
        self.url = url
        self.size = size
        self.radius = radius
    }

    public var body: some View {
        TindivoAsyncImage(url: url)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

#Preview("Miniaturas") {
    HStack {
        TindivoThumbnail(url: nil)
        TindivoThumbnail(url: nil, size: 104, radius: 12)
    }
    .padding(TindivoTokens.Spacing.spaceScreen)
    .background(Color.tindivo.background)
}
