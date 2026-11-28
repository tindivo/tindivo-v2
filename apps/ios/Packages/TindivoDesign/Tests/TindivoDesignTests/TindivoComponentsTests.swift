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
        for layers in [
            TindivoTokens.Elevation.elevation1, TindivoTokens.Elevation.elevation2, TindivoTokens.Elevation.elevation3,
        ] {
            #expect(layers.count <= TindivoElevationModifier.maxLayers)
        }
    }

    @Test("con VoiceOver el decremento ajustable no quita la línea: «Quitar» es una acción aparte")
    func adjustableDecrementNeverRemoves() {
        #expect(TindivoStepper.adjustableDecrementAllowed(canDecrease: true, decreaseRemoves: false))
        #expect(!TindivoStepper.adjustableDecrementAllowed(canDecrease: true, decreaseRemoves: true))
        #expect(!TindivoStepper.adjustableDecrementAllowed(canDecrease: false, decreaseRemoves: false))
    }

    @Test("el valor hablado usa el plural del catálogo: «1 unidad», «3 unidades»")
    func spokenQuantityPlural() {
        #expect(TindivoStepper.spokenQuantity(1) == "1 unidad")
        #expect(TindivoStepper.spokenQuantity(3) == "3 unidades")
    }
}
