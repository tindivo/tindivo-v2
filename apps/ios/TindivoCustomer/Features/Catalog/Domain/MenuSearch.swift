import Foundation

/// Mismo mínimo que `search_catalog`: por debajo, todo casa con todo.
let minQueryChars = 2

/// Tramo `[start, end)` del texto ORIGINAL que casó con un término, en unidades UTF-16 (los índices de `NSString`).
struct MatchRange: Sendable, Equatable {
    let start: Int
    let end: Int
}

struct MenuHit: Sendable, Equatable {
    let item: MenuItem
    let categoryId: String
    let categoryName: String
    /// Para resaltar en la fila; ya vienen fusionados y ordenados.
    let nameRanges: [MatchRange]
    let descriptionRanges: [MatchRange]
}

/// Tope de términos, como el `limit 5` del servidor.
private let maxTerms = 5

private let stopwords: Set<String> = [
    "a", "al", "con", "de", "del", "el", "en", "la", "las", "lo", "los", "para", "por", "sin", "un", "una", "y",
]

/// Minúsculas y sin tildes, con la MISMA longitud UTF-16 que la entrada.
///
/// De esa invariante depende el resaltado: se busca en el texto plegado y se pinta sobre el original con los mismos
/// índices. Si el plegado de un carácter cambia el tamaño, se devuelve el original: mejor no encontrar esa palabra
/// que resaltar donde no es.
func fold(_ text: String) -> String {
    var result = ""
    result.reserveCapacity(text.utf8.count)
    for scalar in text.unicodeScalars {
        result += foldScalar(scalar)
    }
    return result
}

private func foldScalar(_ scalar: Unicode.Scalar) -> String {
    let original = String(scalar)
    let withoutMarks = String(String.UnicodeScalarView(
        original.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }
    ))
    let folded = withoutMarks.lowercased()
    if folded.utf16.count == original.utf16.count { return folded }
    let lower = original.lowercased()
    return lower.utf16.count == original.utf16.count ? lower : original
}

private func isWordScalar(_ scalar: Unicode.Scalar) -> Bool {
    switch scalar.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
         .decimalNumber, .letterNumber, .otherNumber:
        true
    default:
        false
    }
}

/// Términos buscables de la consulta. Vacía cuando no hay nada accionable: la señal de «no busques todavía».
func parseTerms(_ query: String) -> [String] {
    var raw: [String] = []
    var current = String.UnicodeScalarView()
    for scalar in fold(query).unicodeScalars {
        if isWordScalar(scalar) {
            current.append(scalar)
        } else if !current.isEmpty {
            raw.append(String(current))
            current = String.UnicodeScalarView()
        }
    }
    if !current.isEmpty { raw.append(String(current)) }

    var seen = Set<String>()
    let all = raw.filter { $0.utf16.count >= minQueryChars && seen.insert($0).inserted }
    let meaningful = all.filter { !stopwords.contains($0) }
    return Array((meaningful.isEmpty ? all : meaningful).prefix(maxTerms))
}

private func index(of needle: [UInt16], in hay: [UInt16], from start: Int) -> Int? {
    guard !needle.isEmpty, hay.count >= needle.count, start <= hay.count - needle.count else { return nil }
    for at in start...(hay.count - needle.count) where hay[at..<(at + needle.count)].elementsEqual(needle) {
        return at
    }
    return nil
}

private func mergeRanges(_ ranges: [MatchRange]) -> [MatchRange] {
    var merged: [MatchRange] = []
    for range in ranges.sorted(by: { ($0.start, $0.end) < ($1.start, $1.end) }) {
        if let last = merged.last, range.start <= last.end {
            merged[merged.count - 1] = MatchRange(start: last.start, end: max(last.end, range.end))
        } else {
            merged.append(range)
        }
    }
    return merged
}

/// Todas las apariciones de cada término, fusionadas si se solapan.
private func ranges(in text: String?, terms: [String]) -> [MatchRange] {
    guard let text else { return [] }
    let hay = Array(fold(text).utf16)
    var found: [MatchRange] = []
    for term in terms {
        let needle = Array(term.utf16)
        var from = 0
        while let at = index(of: needle, in: hay, from: from) {
            found.append(MatchRange(start: at, end: at + needle.count))
            from = at + needle.count
        }
    }
    return mergeRanges(found)
}

/// ¿Empieza alguna PALABRA de `hay` por `prefix`? («napo» → «Pizza Napolitana»).
private func wordStarts(_ hay: [UInt16], with prefix: [UInt16]) -> Bool {
    var from = 0
    while let at = index(of: prefix, in: hay, from: from) {
        if at == 0 { return true }
        if let previous = Unicode.Scalar(hay[at - 1]), !isWordScalar(previous) { return true }
        from = at + 1
    }
    return false
}

/// Menor es mejor: con 75 platos, que «pizza americana» salga antes que «gaseosa (va con pizza)» es lo que importa.
private func scoreName(_ foldedName: String, phrase: String, terms: [String]) -> Int {
    let name = Array(foldedName.utf16)
    let phrase16 = Array(phrase.utf16)
    if foldedName == phrase { return 0 }
    if name.starts(with: phrase16) { return 1 }
    if wordStarts(name, with: phrase16) { return 2 }
    if index(of: phrase16, in: name, from: 0) != nil { return 3 }
    if terms.allSatisfy({ index(of: Array($0.utf16), in: name, from: 0) != nil }) { return 4 }
    return 5 // solo casó por descripción o por el nombre de la categoría
}

/// Búsqueda dentro de la carta de UN negocio, la misma que `searchMenu` de `apps/customer/features/catalog/lib/`.
/// Si cambia allí, cambia aquí y en sus pruebas.
///
/// Devuelve los platos de `categories` que casan con `query`, del más relevante al menos. A igualdad de relevancia
/// manda el orden de la carta. Se le pasa la carta que se ve (ya filtrada por franja): no se puede encontrar un plato
/// que no se muestra. No habla con la API: la carta entera ya llegó. Sin tildes ni mayúsculas, términos de 2 o más
/// caracteres unidos por AND y en cualquier orden. Las preposiciones no son obligatorias si queda algo con lo que
/// buscar. También casa por el nombre de la categoría.
func searchMenu(_ categories: [MenuCategory], query: String) -> [MenuHit] {
    let terms = parseTerms(query)
    guard !terms.isEmpty else { return [] }
    let phrase = fold(query).split(whereSeparator: \.isWhitespace).joined(separator: " ")
    let needles = terms.map { Array($0.utf16) }

    var scored: [(score: Int, hit: MenuHit)] = []
    for category in categories {
        let foldedCategory = fold(category.name)
        for item in category.items {
            let foldedName = fold(item.name)
            let haystack = Array("\(foldedName) \(item.description.map(fold) ?? "") \(foldedCategory)".utf16)
            guard needles.allSatisfy({ index(of: $0, in: haystack, from: 0) != nil }) else { continue }
            scored.append((
                scoreName(foldedName, phrase: phrase, terms: terms),
                MenuHit(
                    item: item, categoryId: category.id, categoryName: category.name,
                    nameRanges: ranges(in: item.name, terms: terms),
                    descriptionRanges: ranges(in: item.description, terms: terms)
                )
            ))
        }
    }
    // A igual puntaje se conserva el orden de la carta (el desempate por posición hace estable la ordenación).
    return scored.enumerated()
        .sorted { ($0.element.score, $0.offset) < ($1.element.score, $1.offset) }
        .map(\.element.hit)
}
