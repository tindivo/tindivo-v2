import SwiftUI
import TindivoAPI
import TindivoDesign

struct DiagnosticsView: View {
    let model: DiagnosticsScreenModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceGroup) {
                Text("Diagnóstico")
                    .tindivoText(TindivoTokens.Typography.titleScreen)
                    .foregroundStyle(Color.tindivo.ink)

                VStack(alignment: .leading, spacing: TindivoTokens.Spacing.spaceInner) {
                    row("API", model.apiBaseURL)
                    row("Versión", model.appVersion)
                    status
                }
                .padding(TindivoTokens.Spacing.spaceScreen)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.tindivo.surface, in: RoundedRectangle(cornerRadius: TindivoTokens.Radius.radiusCard))
                .tindivoElevation(TindivoTokens.Elevation.elevation1)

                TindivoPrimaryButton("Probar de nuevo", loading: model.state == .loading) {
                    Task { await model.load() }
                }
            }
            .padding(TindivoTokens.Spacing.spaceScreen)
        }
        .background(Color.tindivo.background)
        .task { await model.load() }
    }

    @ViewBuilder private var status: some View {
        switch model.state {
        case .idle, .loading:
            row("Estado", String(localized: "Consultando…"))
        case let .loaded(health, compat):
            row("Estado", health.status)
            row("Contrato", health.version)
            row("Versión mínima", compat.minAppVersion)
            row("iOS mínimo", "\(compat.minOS)")
        case let .failed(error):
            row("Error", message(for: error))
                .foregroundStyle(Color.tindivo.error)
        }
    }

    private func row(_ label: LocalizedStringKey, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .tindivoText(TindivoTokens.Typography.bodySecondary)
                .foregroundStyle(Color.tindivo.inkSecondary)
            Text(value)
                .tindivoText(TindivoTokens.Typography.body)
                .foregroundStyle(Color.tindivo.ink)
                .textSelection(.enabled)
        }
    }

    private func message(for error: AppError) -> String {
        switch error {
        case .network: String(localized: "Sin conexión con la API")
        case let .upgradeRequired(min): String(localized: "Hay que actualizar la app (mínimo \(min ?? "?"))")
        case let .known(code, status, _, _): "\(code.rawValue) · HTTP \(status)"
        case let .unknown(code, detail, status): [code, detail, status.map { "HTTP \($0)" }]
            .compactMap(\.self).joined(separator: " · ")
        case .cancelled: ""
        }
    }
}
