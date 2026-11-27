import SwiftUI
import TindivoDesign

/// La portada del negocio (`BusinessBanner.kt`): la foto de 208 más la barra de estado, que queda bajo ella; el velo
/// oscuro de arriba deja ver los iconos de la barra de estado. Sin foto, o mientras carga, se ve el degradado de marca
/// con la inicial del negocio: nunca un hueco.
struct BusinessBannerView: View {
    static let height: CGFloat = 208

    let url: String?
    let name: String
    /// El alto de la barra de estado: la portada llega hasta el borde de la pantalla.
    let statusBarHeight: CGFloat

    var body: some View {
        ZStack {
            placeholder
            if let url, let parsed = URL(string: url) {
                AsyncImage(url: parsed) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() }
                }
            }
            LinearGradient(colors: [.black.opacity(0.45), .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: statusBarHeight + 24)
                .frame(maxHeight: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity)
        .frame(height: Self.height + statusBarHeight)
        .clipped()
        .accessibilityHidden(true)
    }

    /// Degradado de marca con dos círculos muy tenues y la inicial, como el de Android.
    private var placeholder: some View {
        let initial = name.first { $0.isLetter || $0.isNumber }.map { String($0).uppercased() } ?? ""
        return LinearGradient(
            colors: [Color.tindivo.gradientCtaStart, Color.tindivo.gradientCtaMid, Color.tindivo.gradientCtaEnd],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
        .overlay {
            GeometryReader { proxy in
                let ring = Color.white.opacity(0.10)
                let center = CGPoint(x: proxy.size.width * 0.85, y: proxy.size.height * 0.2)
                ZStack {
                    Circle().fill(ring).frame(width: proxy.size.height * 1.8).position(center)
                    Circle().fill(ring).frame(width: proxy.size.height * 1.1).position(center)
                }
            }
        }
        .overlay {
            Text(verbatim: initial)
                .font(.system(size: 57, weight: .bold))
                .foregroundStyle(Color.white.opacity(0.28))
        }
    }
}

/// La cabecera (`BusinessHeader.kt`): una hoja blanca de esquinas superiores de 28 que sube sobre la portada, el logo
/// redondo de 76 con borde blanco que sube la mitad sobre ella, el nombre, el giro y, debajo, o el estado o, si está
/// cerrado, la píldora `warning`. Sin fila «Información del negocio ›» ni modos de entrega (CUS-CAT-027, CUS-CAT-017).
struct BusinessHeaderView: View {
    let business: BusinessDetail
    /// «Abierto · cierra 23:00»; `nil` sin horario, en modo catálogo o cerrado (entonces va `closed`).
    let status: String?
    let closed: BusinessScreenModel.ClosedNotice?

    static let logoSize: CGFloat = 76

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            logo.padding(.top, -Self.logoSize / 2)
            Text(business.name)
                .tindivoText(TindivoTokens.Typography.titleScreen)
                .foregroundStyle(Color.tindivo.ink)
                .padding(.top, 4)
                .accessibilityAddTraits(.isHeader)
            if let tagline = business.tagline {
                Text(tagline)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            if let closed {
                TindivoStatusPill(closed.pill, tone: .warning)
                    .padding(.top, 6)
                    .accessibilityIdentifier("business.status")
            } else if let status {
                Text(status)
                    .tindivoText(TypeToken.labelLarge)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.tindivo.inkSecondary)
                    .padding(.top, 2)
                    .accessibilityIdentifier("business.status")
            }
            Color.clear.frame(height: 4)
        }
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            UnevenRoundedRectangle(
                topLeadingRadius: TindivoTokens.Radius.radiusSheet, topTrailingRadius: TindivoTokens.Radius.radiusSheet,
                style: .continuous
            )
            .fill(Color.tindivo.surface)
        )
    }

    /// Decorativo a propósito: el nombre está al lado, y una etiqueta lo haría sonar dos veces. Sin logo, el respaldo
    /// de marca.
    private var logo: some View {
        TindivoAsyncImage(url: business.logoURL)
            .frame(width: Self.logoSize, height: Self.logoSize)
            .clipShape(Circle())
            .overlay { Circle().strokeBorder(.white, lineWidth: 3) }
            .shadow(color: Color.tindivo.ink.opacity(0.25), radius: 3, y: 2)
    }
}

/// El título de una sección de la carta, de 18, con cuántos productos tiene al lado.
struct CategoryHeaderView: View {
    let category: MenuCategory

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .lastTextBaseline, spacing: 8) {
                    title.fixedSize(); count.fixedSize()
                }
                VStack(alignment: .leading, spacing: 2) {
                    title; count
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            if let blurb = category.blurb {
                Text(blurb)
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, TindivoTokens.Spacing.spaceScreen)
        .padding(.top, TindivoTokens.Spacing.spaceInner)
    }

    private var title: some View {
        Text(category.name)
            .tindivoText(TindivoTokens.Typography.titleSection)
            .foregroundStyle(Color.tindivo.ink)
    }

    private var count: some View {
        Text("\(category.items.count) productos")
            .tindivoText(TindivoTokens.Typography.bodySecondary)
            .fontWeight(.medium)
            .foregroundStyle(Color.tindivo.inkSecondary)
    }
}
