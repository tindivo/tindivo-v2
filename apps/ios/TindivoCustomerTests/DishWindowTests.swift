import Foundation
import Testing
@testable import TindivoCustomer

/// Los casos de `DishWindowTest.kt` (y de `isWithinWindow` de `packages/contracts`). Lima = UTC-5 fijo.
/// Semana de referencia: lunes 2026-07-06 … domingo 2026-07-12.
@Suite("Franja horaria del plato")
struct DishWindowTests {
    private let mon = "2026-07-06", tue = "2026-07-07", fri = "2026-07-10", sat = "2026-07-11", sun = "2026-07-12"

    private func win(days: [Int]? = nil, from: String? = nil, to: String? = nil) -> DishWindow {
        DishWindow(days: days, from: from, to: to)
    }

    private var siempre: DishWindow { win() }
    private var mediodia: DishWindow { win(days: [5, 6], from: "11:00", to: "15:00") }
    private var noche: DishWindow { win(days: [0, 1, 2, 3, 4, 5], from: "18:00", to: "23:30") }
    private var trasnoche: DishWindow { win(days: [5], from: "22:00", to: "02:00") }

    @Test("el reloj es el de Lima aunque el dispositivo esté en otra zona")
    func clockIsLima() {
        #expect(LimaClock.calendar.timeZone.identifier == "America/Lima")
    }

    @Test("CA-CAT-01 la franja se cuenta en una frase, la de describeWindow")
    func describes() {
        #expect(mediodia.describe() == "Solo sáb y dom, de 11:00 a 15:00")
        #expect(noche.describe() == "Solo lun a sáb, de 18:00 a 23:30")
        #expect(win(days: [5, 6]).describe() == "Solo sáb y dom")
        #expect(win(from: "11:00", to: "15:00").describe() == "Solo de 11:00 a 15:00")
        #expect(win(days: [0, 1, 2, 3, 4, 5, 6], from: "11:00", to: "15:00").describe() == "Solo de 11:00 a 15:00")
        #expect(win(days: [0, 2, 4]).describe() == "Solo lun, mié y vie")
        #expect(siempre.describe() == nil)
    }

    @Test("CA-CAT-01 el martes a las 20 la carta de mediodía está fuera y el sábado a las 12 dentro")
    func lunchMenu() {
        #expect(!mediodia.isOpen(at: at(tue, "20:00")))
        #expect(mediodia.isOpen(at: at(sat, "12:00")))
        #expect(mediodia.isOpen(at: at(sun, "12:00")))
        #expect(!mediodia.isOpen(at: at(sat, "20:00")))
        #expect(!mediodia.isOpen(at: at(tue, "12:00")))
    }

    @Test("sin restricción el plato siempre se ve")
    func always() {
        #expect(siempre.isOpen(at: at(tue, "20:00")))
        #expect(win(days: [0, 1, 2, 3, 4, 5, 6]).isOpen(at: at(tue, "20:00")))
    }

    @Test("la apertura entra y el cierre no")
    func halfOpen() {
        #expect(mediodia.isOpen(at: at(sat, "11:00")))
        #expect(!mediodia.isOpen(at: at(sat, "10:59")))
        #expect(mediodia.isOpen(at: at(sat, "14:59")))
        #expect(!mediodia.isOpen(at: at(sat, "15:00")))
    }

    @Test("la carta de noche es la complementaria")
    func nightMenu() {
        #expect(noche.isOpen(at: at(mon, "20:00")))
        #expect(noche.isOpen(at: at(sat, "20:00")))
        #expect(!noche.isOpen(at: at(sat, "12:00")))
        #expect(!noche.isOpen(at: at(sun, "20:00")))
    }

    @Test("solo días vale todo el día en esos días; solo horas vale esa franja todos los días")
    func onlyOneSide() {
        let soloFinde = win(days: [5, 6])
        #expect(soloFinde.isOpen(at: at(sat, "06:00")))
        #expect(soloFinde.isOpen(at: at(sat, "23:59")))
        #expect(!soloFinde.isOpen(at: at(fri, "12:00")))
        let soloTarde = win(from: "11:00", to: "15:00")
        #expect(soloTarde.isOpen(at: at(tue, "12:00")))
        #expect(soloTarde.isOpen(at: at(sat, "12:00")))
        #expect(!soloTarde.isOpen(at: at(tue, "20:00")))
    }

    @Test("con media franja manda el día")
    func halfSpan() {
        let aMedias = win(days: [5, 6], from: "11:00")
        #expect(aMedias.isOpen(at: at(sat, "20:00")))
        #expect(!aMedias.isOpen(at: at(tue, "20:00")))
    }

    @Test("la franja que cruza medianoche es del día en que empieza")
    func crossesMidnight() {
        #expect(trasnoche.isOpen(at: at(sat, "23:00")))
        #expect(trasnoche.isOpen(at: at(sun, "01:00")))
        #expect(!trasnoche.isOpen(at: at(sun, "02:00")))
        #expect(!trasnoche.isOpen(at: at(sun, "03:00")))
        #expect(!trasnoche.isOpen(at: at(sat, "21:59")))
    }

    @Test("el día se juzga en hora de Lima y no en UTC")
    func limaNotUTC() throws {
        // 2026-07-12T03:00:00Z es sábado 11 a las 22:00 en Lima (domingo en UTC).
        let utcNow = try #require(ISO8601DateFormatter().date(from: "2026-07-12T03:00:00Z"))
        #expect(win(days: [5], from: "18:00", to: "23:00").isOpen(at: utcNow))
        #expect(!win(days: [6], from: "18:00", to: "23:00").isOpen(at: utcNow))
    }

    @Test("acepta la hora de Postgres con segundos")
    func withSeconds() {
        let conSegundos = win(days: [5, 6], from: "11:00:00", to: "15:00:00")
        #expect(conSegundos.isOpen(at: at(sat, "12:00")))
        #expect(!conSegundos.isOpen(at: at(tue, "12:00")))
    }

    @Test("un dato roto nunca esconde el plato (falla abierta)")
    func failsOpen() {
        #expect(win(days: []).isOpen(at: at(tue, "20:00")))
        #expect(win(from: "media tarde", to: "15:00").isOpen(at: at(tue, "20:00")))
        #expect(win(from: "24:00", to: "15:00").isOpen(at: at(tue, "20:00")))
        #expect(win(days: [5, 6, 99]).isOpen(at: at(sat, "12:00")))
        #expect(!win(days: [5, 6, 99]).isOpen(at: at(tue, "12:00")))
        #expect(win(days: [99]).isOpen(at: at(tue, "12:00")))
    }
}
