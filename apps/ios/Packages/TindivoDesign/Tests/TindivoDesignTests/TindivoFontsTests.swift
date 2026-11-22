import Testing
@testable import TindivoDesign

@Suite("Geist")
struct TindivoFontsTests {
    @Test("se registra y el sistema la resuelve por su familia")
    func registers() {
        #expect(TindivoFonts.register())
        #expect(TindivoFonts.isRegistered)
    }

    @Test("una segunda llamada no falla")
    func registersTwice() {
        TindivoFonts.register()
        #expect(TindivoFonts.register())
    }
}
