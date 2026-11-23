import Testing
import UIKit
@testable import TindivoDesign

@Suite("Componentes")
struct TindivoComponentsTests {
    @Test("el isotipo del respaldo de marca está en el paquete: sin él, una foto ausente sería un hueco")
    func isotipoExists() {
        #expect(UIImage(named: "TindivoIsotipo", in: .module, with: nil) != nil)
    }

    @Test("M9 ninguna elevación del canon pasa de las dos capas que aplica el modificador fijo")
    func elevationsFit() {
        for layers in [TindivoTokens.Elevation.elevation1, TindivoTokens.Elevation.elevation2, TindivoTokens.Elevation.elevation3] {
            #expect(layers.count <= TindivoElevationModifier.maxLayers)
        }
    }
}
