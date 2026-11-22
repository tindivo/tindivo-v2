import Foundation
import Testing
@testable import TindivoAPI

@Suite("Dinero heredado como número JSON (SW-8)")
struct ExactMoneyTests {
    private struct Box: Codable { let p: ExactMoney }
    private let posix = Locale(identifier: "en_US_POSIX")

    private func decode(_ number: String) throws -> Decimal {
        try JSONDecoder().decode(Box.self, from: Data(#"{"p":\#(number)}"#.utf8)).p.value
    }

    @Test("llega como Decimal exacto", arguments: ["0.1", "3.3", "12.5", "12.50", "0", "99999999.99", "1234567.89"])
    func exact(number: String) throws {
        #expect(try decode(number) == Decimal(string: number, locale: posix))
    }

    @Test("un tercer decimal de verdad no cabe en numeric(10,2): se rechaza, no se redondea")
    func rejectsThirdDecimal() {
        #expect(throws: DecodingError.self) { try decode("12.345") }
    }

    @Test("lo que lee Foundation antigua por Double se recupera a céntimos")
    func recoversDoubleDrift() {
        let drifted = Decimal(string: "3.2999999999999998", locale: posix)!
        #expect(ExactMoney.exactCents(drifted) == Decimal(string: "3.3", locale: posix))
    }

    @Test("ida y vuelta sin perder céntimos")
    func roundTrip() throws {
        let data = try JSONEncoder().encode(Box(p: ExactMoney(Decimal(string: "45.67", locale: posix)!)))
        #expect(try JSONDecoder().decode(Box.self, from: data).p.value == Decimal(string: "45.67", locale: posix))
    }
}
