import Testing
import UIKit
@testable import TindivoDesign

@Suite("Iconos")
struct TindivoIconTests {
    @Test("cada icono es un SF Symbol que existe: si no, la pantalla enseñaría un hueco")
    func everyIconExists() {
        for icon in TindivoIcon.allCases {
            #expect(UIImage(systemName: icon.systemName) != nil, "\(icon) → \(icon.systemName)")
        }
    }

    @Test("dos significados no comparten dibujo, salvo que se decida")
    func distinctSymbols() {
        let names = TindivoIcon.allCases.map(\.systemName)
        #expect(Set(names).count == names.count)
    }
}
