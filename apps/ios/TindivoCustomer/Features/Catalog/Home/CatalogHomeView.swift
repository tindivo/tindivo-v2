import SwiftUI
import TindivoAPI
import TindivoDesign

struct CatalogHomeView: View {
    let model: CatalogHomeScreenModel
    let onOpenBusiness: (String) -> Void
    let onOpenCart: () -> Void
    /// El banner «Entregas»: lleva a la pestaña Entregas.
    let onOpenCourier: () -> Void
    /// `nil` fuera de las compilaciones de desarrollo: Diagnóstico no es de quien pide comida. Se abre con una pulsación
    /// larga en el isotipo de la barra superior.
    let onOpenDiagnostics: (() -> Void)?

    var body: some View {
        Group {
            switch model.state {
            case .idle, .loading:
                ProgressView()
                    .accessibilityLabel(Text("Cargando"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case let .failed(error):
                failure(error)
            case let .loaded(loaded):
                list(loaded)
            }
        }
        .background(Color.tindivo.background)
        // La barra de abajo es la de la plataforma; la de arriba es propia y fija (CUS-CAT-030). El título solo le da
        // nombre a la pantalla para VoiceOver y al botón «volver» de la siguiente.
        .navigationTitle(String(localized: "Inicio"))
        .toolbar(.hidden, for: .navigationBar)
        .safeAreaInset(edge: .top, spacing: 0) {
            HomeTopBar(
                address: model.deliveryAddress, bagBadge: model.bagBadgeText, bagLabel: model.bagAccessibilityLabel,
                onOpenBag: onOpenCart, onOpenDiagnostics: onOpenDiagnostics
            )
        }
        .task { await model.load() }
        .task { await model.observeCart() }
        .task { await model.runClock() }
    }

    private func list(_ loaded: CatalogHomeScreenModel.Loaded) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
                title
                CourierEntryCard(onTap: onOpenCourier)
                restaurantsHeader
                if let error = loaded.refreshFailed {
                    Text(ErrorText.message(for: error))
                        .tindivoText(TindivoTokens.Typography.body)
                        .foregroundStyle(Color.tindivo.error)
                        .accessibilityIdentifier("home.refreshFailed")
                }
                if loaded.listing.restaurants.isEmpty {
                    Text("Aún no hay restaurantes disponibles.")
                        .tindivoText(TindivoTokens.Typography.body)
                        .foregroundStyle(Color.tindivo.inkSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, TindivoTokens.Spacing.spaceGroup + 8)
                }
                ForEach(loaded.listing.restaurants, id: \.id) { business in
                    BusinessCardView(
                        business: business, whatsapp: false, closedLabel: model.closedLabel(for: business)
                    ) { onOpenBusiness(business.id) }
                }
                if !loaded.listing.whatsapp.isEmpty {
                    whatsappSection(loaded.listing.whatsapp)
                }
            }
            .padding(TindivoTokens.Spacing.spaceScreen)
        }
        .refreshable { await model.refresh() }
    }

    /// «Restaurantes» y, a la derecha, la píldora «N abiertos ahora» (solo con alguno abierto). Con letra grande la
    /// píldora pasa debajo del título en vez de apretarlo.
    private var restaurantsHeader: some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                restaurantsTitle
                Spacer(minLength: 8)
                openNowPill
            }
            VStack(alignment: .leading, spacing: 4) {
                restaurantsTitle
                openNowPill
            }
        }
        .padding(.top, 10)
    }

    private var restaurantsTitle: some View {
        Text("Restaurantes")
            .tindivoText(TindivoTokens.Typography.titleSection)
            .foregroundStyle(Color.tindivo.ink)
            .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder private var openNowPill: some View {
        let count = model.openNowCount
        if count > 0 {
            TindivoStatusPill(String(localized: "\(count) abiertos ahora"), tone: .success)
                .accessibilityIdentifier("home.openNow")
        }
    }

    private var title: some View {
        Text("¿Qué pedimos hoy?")
            .tindivoText(TypeToken.greeting)
            .foregroundStyle(Color.tindivo.ink)
            .accessibilityAddTraits(.isHeader)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func whatsappSection(_ businesses: [BusinessCard]) -> some View {
        VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Próximamente pedidos por la plataforma")
                    .tindivoText(TindivoTokens.Typography.titleSection)
                    .foregroundStyle(Color.tindivo.ink)
                    .accessibilityAddTraits(.isHeader)
                Text("Pide directo por WhatsApp mientras preparamos su integración completa a la plataforma.")
                    .tindivoText(TindivoTokens.Typography.bodySecondary)
                    .foregroundStyle(Color.tindivo.inkSecondary)
            }
            .padding(.top, TindivoTokens.Spacing.spaceGroup)
            ForEach(businesses, id: \.id) { business in
                BusinessCardView(
                    business: business, whatsapp: true, closedLabel: model.closedLabel(for: business)
                ) { onOpenBusiness(business.id) }
            }
        }
    }

    private func failure(_ error: AppError) -> some View {
        VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
            Text(ErrorText.message(for: error))
                .tindivoText(TindivoTokens.Typography.body)
                .foregroundStyle(Color.tindivo.ink)
            TindivoPrimaryButton("Reintentar") { Task { await model.refresh() } }
        }
        .padding(TindivoTokens.Spacing.spaceScreen)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}

#if DEBUG
#Preview("Inicio") {
    CatalogHomeView(
        model: CatalogHomeScreenModel(catalog: PreviewCatalog()), onOpenBusiness: { _ in }, onOpenCart: {},
        onOpenCourier: {}, onOpenDiagnostics: {}
    )
    .onAppear { TindivoFonts.register() }
}

#Preview("Inicio sin conexión") {
    CatalogHomeView(
        model: CatalogHomeScreenModel(catalog: PreviewCatalog(businesses: .failure(.network))),
        onOpenBusiness: { _ in }, onOpenCart: {}, onOpenCourier: {}, onOpenDiagnostics: nil
    )
    .onAppear { TindivoFonts.register() }
}
#endif
