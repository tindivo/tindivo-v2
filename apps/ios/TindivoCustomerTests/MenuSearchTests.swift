import Foundation
import Testing
@testable import TindivoCustomer

/// Los casos de `MenuSearchTest.kt` (y de `menu-search.test.ts` de la web), más los de índices UTF-16.
@Suite("Búsqueda dentro de la carta")
struct MenuSearchTests {
    private func item(_ name: String, _ description: String? = nil) -> MenuItem {
        MenuItem(
            dish: Dish(id: "it-\(name)", name: name, basePrice: dec("13.00"), imageURL: nil, groups: []),
            description: description, priceText: "S/ 13.00", isAvailable: true,
            window: DishWindow(days: nil, from: nil, to: nil)
        )
    }

    private func category(_ name: String, _ items: [MenuItem]) -> MenuCategory {
        MenuCategory(id: "cat-\(name)", name: name, blurb: nil, items: items)
    }

    /// Carta de juguete con la forma de la de Pizza Priamo.
    private var carta: [MenuCategory] {
        [
            category(
                "Pizzas",
                [
                    item("Pizza Americana", "Queso mozzarella, Jamón."),
                    item("Pizza Vegetariana", "Queso mozzarella, Cebolla, Pimentón, Champiñón."),
                    item("Pizza Hawaiana", "Queso mozzarella, Jamón, Piña."),
                ]),
            category("Sánguche de pollo", [item("Sánguche clásico", "Pollo deshilachado.")]),
            category("Bebidas", [item("Inca Kola 1L"), item("Chicha morada", "Jarra para acompañar la pizza.")]),
        ]
    }

    private func names(_ hits: [MenuHit]) -> [String] { hits.map(\.item.name) }

    @Test("fold quita tildes y mayúsculas")
    func foldBasics() {
        #expect(fold("Champiñón") == "champinon")
        #expect(fold("SÁNGUCHE") == "sanguche")
    }

    @Test("fold conserva la longitud UTF-16, de la que depende el resaltado")
    func foldKeepsLength() {
        for text in ["Champiñón", "Sánguche de pollo", "Pizza Américana", "Inca Kola 1L"] {
            #expect(text.utf16.count == fold(text).utf16.count, "\(text)")
        }
    }

    @Test("fold conserva la longitud con un emoji y con la I con punto")
    func foldEmojiAndDottedI() {
        #expect(fold("Pizza 🍕 OK") == "pizza 🍕 ok")
        #expect(fold("İSTANBUL") == "istanbul")
    }

    @Test("parseTerms ignora consultas por debajo del mínimo")
    func minimum() {
        #expect(parseTerms("p") == [])
        #expect(parseTerms("  ") == [])
    }

    @Test("parseTerms parte en términos, sin repetidos y sin puntuación")
    func splits() {
        #expect(parseTerms("  Pollo,  a la BRASA ") == ["pollo", "brasa"])
        #expect(parseTerms("pizza pizza") == ["pizza"])
    }

    @Test("parseTerms conserva las stopwords si son lo único que hay, y no pasa de cinco términos")
    func stopwordsAndCap() {
        #expect(parseTerms("de la") == ["de", "la"])
        #expect(parseTerms("uno dos tres cuatro cinco seis") == ["uno", "dos", "tres", "cuatro", "cinco"])
    }

    @Test("no busca nada hasta el mínimo de caracteres")
    func noSearchBelowMinimum() {
        #expect(searchMenu(carta, query: "p").isEmpty)
    }

    @Test("encuentra sin tildes en ambos sentidos")
    func accents() {
        #expect(names(searchMenu(carta, query: "champinon")) == ["Pizza Vegetariana"])
        #expect(names(searchMenu(carta, query: "sánguche")) == ["Sánguche clásico"])
    }

    @Test("no deja que una preposición descarte el plato")
    func prepositions() {
        let menu = [category("Pizzas", [item("Pizza Pollo BBQ")])]
        #expect(names(searchMenu(menu, query: "pizza de pollo")) == ["Pizza Pollo BBQ"])
    }

    @Test("exige todos los términos, en cualquier orden")
    func allTerms() {
        #expect(names(searchMenu(carta, query: "hawaiana pizza")) == ["Pizza Hawaiana"])
        #expect(searchMenu(carta, query: "pizza sushi").isEmpty)
    }

    @Test("encuentra por descripción y por nombre de categoría")
    func descriptionAndCategory() {
        #expect(names(searchMenu(carta, query: "piña")) == ["Pizza Hawaiana"])
        #expect(names(searchMenu(carta, query: "bebidas")) == ["Inca Kola 1L", "Chicha morada"])
    }

    @Test("pone delante lo que casa en el nombre, no en la descripción")
    func nameFirst() {
        #expect(
            names(searchMenu(carta, query: "pizza"))
                == ["Pizza Americana", "Pizza Vegetariana", "Pizza Hawaiana", "Chicha morada"])
    }

    @Test("prioriza el prefijo de palabra sobre la aparición suelta")
    func wordPrefix() {
        let menu = [category("Cosas", [item("Gaseosa", "Va bien con la hawaiana."), item("Hawaiana familiar")])]
        #expect(names(searchMenu(menu, query: "hawaiana")) == ["Hawaiana familiar", "Gaseosa"])
    }

    @Test("el principio de una palabra gana a la aparición en medio de otra")
    func wordStartBeatsMiddle() {
        let menu = [category("Pizzas", [item("Champizza"), item("Media Pizza")])]
        #expect(names(searchMenu(menu, query: "pizza")) == ["Media Pizza", "Champizza"])
    }

    @Test("un emoji antes de la palabra no es una letra: la palabra empieza ahí, como en Android")
    func wordStartAfterEmoji() {
        let menu = [category("Cosas", [item("Donapo"), item("🍕napo")])]
        #expect(names(searchMenu(menu, query: "napo")) == ["🍕napo", "Donapo"])
    }

    @Test("devuelve los tramos alineados con el texto original")
    func rangesAligned() throws {
        let hit = try #require(searchMenu(carta, query: "champinon").first)
        let range = try #require(hit.descriptionRanges.first)
        #expect(substring(hit.item.description, range) == "Champiñón")
    }

    @Test("los tramos siguen alineados después de un emoji")
    func rangesAfterEmoji() throws {
        let hit = try #require(searchMenu([category("X", [item("🍕 Pizza Hawaiana")])], query: "hawaiana").first)
        let range = try #require(hit.nameRanges.first)
        #expect(hit.nameRanges.count == 1)
        #expect(substring(hit.item.name, range) == "Hawaiana")
    }

    @Test("resalta todas las apariciones del término en el nombre")
    func allOccurrences() throws {
        let hit = try #require(searchMenu([category("X", [item("Pizza de pizza")])], query: "pizza").first)
        #expect(hit.nameRanges == [MatchRange(start: 0, end: 5), MatchRange(start: 9, end: 14)])
    }

    @Test("fusiona los tramos que se solapan")
    func mergesOverlaps() throws {
        let hit = try #require(searchMenu([category("X", [item("Pollo broaster")])], query: "pollo llo").first)
        #expect(hit.nameRanges == [MatchRange(start: 0, end: 5)])
    }

    @Test("adjunta la categoría del plato para poder mostrarla")
    func attachesCategory() throws {
        let hit = try #require(searchMenu(carta, query: "inca").first)
        #expect(hit.categoryName == "Bebidas")
        #expect(hit.categoryId == "cat-Bebidas")
    }

    @Test("un plato sin descripción no casa por la palabra null")
    func noNullWord() {
        #expect(searchMenu(carta, query: "null").isEmpty)
    }

    /// El tramo (en unidades UTF-16, como los índices de `NSString`) sobre el texto original.
    private func substring(_ text: String?, _ range: MatchRange) -> String? {
        text.map { ($0 as NSString).substring(with: NSRange(location: range.start, length: range.end - range.start)) }
    }
}
