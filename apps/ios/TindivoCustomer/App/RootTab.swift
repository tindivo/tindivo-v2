import SwiftUI
import TindivoDesign

/// Las cuatro pestañas raíz (`RootTab` de Android). Solo Inicio funciona hoy; las otras abren «Próximamente».
enum RootTab: CaseIterable, Hashable {
    case home
    case courier
    case orders
    case account

    var title: LocalizedStringResource {
        switch self {
        case .home: "Inicio"
        case .courier: "Entregas"
        case .orders: "Pedidos"
        case .account: "Cuenta"
        }
    }

    var icon: TindivoIcon {
        switch self {
        case .home: .home
        case .courier: .courier
        case .orders: .receipt
        case .account: .account
        }
    }

    /// Para las pruebas de interfaz: `tab.home`, `tab.courier`…
    var identifier: String {
        switch self {
        case .home: "tab.home"
        case .courier: "tab.courier"
        case .orders: "tab.orders"
        case .account: "tab.account"
        }
    }
}
