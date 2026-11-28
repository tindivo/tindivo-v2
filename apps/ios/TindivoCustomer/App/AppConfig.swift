import Foundation

/// La configuración del entorno, leída del Info.plist que arman los `.xcconfig` (SW-15).
struct AppConfig: Sendable {
    let apiBaseURL: URL
    let supabaseURL: URL
    let supabasePublishableKey: String
    let appVersion: String
    let build: String
    /// Id numérico de la ficha en la App Store; vacío hasta que exista la ficha (`APP_STORE_ID` en el `.xcconfig`).
    let appStoreId: String

    var storeURL: URL? { Self.storeURL(appStoreId: appStoreId) }

    static func storeURL(appStoreId: String) -> URL? {
        let id = appStoreId.trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty, id.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
        return URL(string: "https://apps.apple.com/app/id\(id)")
    }

    /// Falta un valor solo si el proyecto está mal generado: es un error de programación y la raíz de composición
    /// puede pararse (SW-6).
    static func fromBundle(_ bundle: Bundle = .main) -> AppConfig {
        func string(_ key: String) -> String {
            guard let value = bundle.object(forInfoDictionaryKey: key) as? String, !value.isEmpty else {
                fatalError("Falta \(key) en el Info.plist: regenera con apps/ios/scripts/gen.sh")
            }
            return value
        }
        func url(_ key: String) -> URL {
            guard let url = URL(string: string(key)), url.scheme == "https" else {
                fatalError("\(key) no es una URL https: revisa el .xcconfig (las URL se escriben https:/$()/host)")
            }
            return url
        }
        return AppConfig(
            apiBaseURL: url("TindivoAPIBaseURL"),
            supabaseURL: url("TindivoSupabaseURL"),
            supabasePublishableKey: string("TindivoSupabasePublishableKey"),
            appVersion: string("CFBundleShortVersionString"),
            build: string("CFBundleVersion"),
            appStoreId: (bundle.object(forInfoDictionaryKey: "TindivoAppStoreID") as? String) ?? ""
        )
    }
}
