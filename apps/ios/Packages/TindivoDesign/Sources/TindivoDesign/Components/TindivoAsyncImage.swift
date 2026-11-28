import SwiftUI

/// Una foto remota que llena su marco. Mientras carga, si falla o si no hay URL, se ve el respaldo de marca (el isotipo
/// sobre `#FFF7ED`): el marco ocupa siempre su sitio, así las filas quedan alineadas con y sin foto. Es decorativa para
/// VoiceOver: el nombre de lo que muestra va al lado.
public struct TindivoAsyncImage: View {
    private let url: String?

    public init(url: String?) {
        self.url = url
    }

    public var body: some View {
        TindivoBrandFallback()
            .overlay {
                if let url, let parsed = URL(string: url) {
                    AsyncImage(url: parsed) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        }
                    }
                }
            }
            .clipped()
            .accessibilityHidden(true)
    }
}

#Preview("Foto sin URL (respaldo de marca)") {
    TindivoAsyncImage(url: nil)
        .frame(width: 92, height: 92)
        .clipShape(RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusThumb))
        .padding(TindivoTokens.Spacing.spaceScreen)
        .background(Color.tindivo.background)
}
