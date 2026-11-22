import Foundation

/// Una fila de la carta, en el orden exacto en que la pantalla la pinta.
///
/// Es la única fuente de ese orden: la lista emite estas filas y el scroll-spy y los saltos de los chips leen los
/// índices de ellas. Si cada uno contara por su lado (banner opcional, cabecera, platos), un cambio en uno desfasaría
/// los chips del contenido.
enum MenuRow: Equatable {
    case banner(url: String)
    case header
    /// Los platos de «Destacados» en un carrusel: una sola fila, no una por plato.
    case carousel([MenuItem])
    case category(MenuCategory)
    /// `sectionID` va en la clave porque un plato destacado sale dos veces: en «Destacados» y en su sección.
    case dish(MenuItem, sectionID: String)

    var key: String {
        switch self {
        case .banner: "banner"
        case .header: "header"
        case .carousel: "carousel"
        case let .category(category): "category-\(category.id)"
        case let .dish(item, sectionID): "\(sectionID)-\(item.id)"
        }
    }
}

/// Banner si hay, cabecera del negocio y, por cada sección, su título seguido de sus platos. «Destacados» lleva un
/// solo carrusel en lugar de una fila por plato.
func menuRows(for business: BusinessDetail) -> [MenuRow] {
    var rows: [MenuRow] = []
    if let banner = business.bannerURL { rows.append(.banner(url: banner)) }
    rows.append(.header)
    if let featured = business.featured {
        rows.append(.category(featured))
        rows.append(.carousel(featured.items))
    }
    for category in business.categories {
        rows.append(.category(category))
        rows += category.items.map { .dish($0, sectionID: category.id) }
    }
    return rows
}

/// Índice de la cabecera de cada sección dentro de `rows`, en el orden de la carta.
func categoryHeaderIndices(_ rows: [MenuRow]) -> [Int] {
    rows.indices.filter { if case .category = rows[$0] { true } else { false } }
}

/// Índice de la cabecera del negocio: lo que queda por encima es la portada.
func businessHeaderIndex(_ rows: [MenuRow]) -> Int {
    rows.firstIndex { $0 == .header } ?? 0
}

/// La sección que se está leyendo: la última cuya cabecera ya pasó o está arriba del todo. Mientras se ve la portada
/// (todavía no llegó la primera cabecera) vale la primera.
func activeCategoryIndex(headerIndices: [Int], firstVisibleIndex: Int) -> Int {
    max(0, headerIndices.lastIndex { $0 <= firstVisibleIndex } ?? 0)
}

/// Los tramos de `text` que hay que resaltar, a partir de los índices UTF-16 que entrega `searchMenu`. Un tramo fuera
/// de rango se recorta; uno vacío, invertido o que parte un carácter se descarta, en vez de lanzar: pintar de menos
/// es mejor que cerrar la app por un índice mal calculado.
func highlightRanges(in text: String, _ ranges: [MatchRange]) -> [Range<String.Index>] {
    let length = text.utf16.count
    return ranges.compactMap { range in
        let start = min(max(range.start, 0), length)
        let end = min(max(range.end, 0), length)
        guard start < end,
              let from = String.Index(text.utf16.index(text.utf16.startIndex, offsetBy: start), within: text),
              let to = String.Index(text.utf16.index(text.utf16.startIndex, offsetBy: end), within: text)
        else { return nil }
        return from..<to
    }
}
