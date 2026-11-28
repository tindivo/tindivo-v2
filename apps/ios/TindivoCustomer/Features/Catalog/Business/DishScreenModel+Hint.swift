import Foundation

extension DishScreenModel {
    /// La ayuda bajo el título del grupo, aparte de su estado: «Elige 1», «Elige 2 · hasta 3» si es obligatorio;
    /// «Hasta 2» (también «Hasta 1») si es opcional con tope. `nil` si no hay nada que añadir (opcional sin tope).
    func hint(for group: DishGroup) -> String? {
        let progress = selection.progress(of: group)
        guard progress.required else {
            return progress.max.map { String(localized: "Hasta \($0)") }
        }
        let pick = max(1, group.minSelections)
        let choose = String(localized: "Elige \(pick)")
        guard let limit = progress.max, limit > pick else { return choose }
        let upTo = String(localized: "Hasta \(limit)").lowercased(with: Locale(identifier: "es_PE"))
        return String(localized: "\(choose) · \(upTo)")
    }
}
