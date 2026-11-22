import Foundation

/// Franja horaria de un plato (0226): «el ceviche solo se sirve sábados y domingos de 11:00 a 15:00».
///
/// Es la misma regla que `isWithinWindow` de `packages/contracts/src/menu-availability.ts`, que la API manda cruda
/// para que cada cliente la resuelva contra su reloj. Si cambia allí, cambia aquí y en sus pruebas.
///
/// - Días **0 = lunes … 6 = domingo**, en hora de Lima, nunca la zona del dispositivo.
/// - Semántica `[from, to)`: la hora de apertura entra, la de cierre no. `to <= from` cruza medianoche y la franja
///   pertenece al día en que empieza (un sábado 22:00–02:00 cubre la madrugada del domingo).
/// - **Falla abierta**: un campo ausente, una hora ilegible o un día fuera de rango hacen que el plato se vea.
///   Esconder un plato por un dato roto es una venta perdida que nadie llega a diagnosticar.
struct DishWindow: Sendable, Equatable {
    let days: [Int]?
    let from: String?
    let to: String?

    func isOpen(at now: Date) -> Bool {
        let days = Self.effectiveDays(days)
        let span = Self.timeSpan(from, to)
        if days == nil && span == nil { return true }

        let dayIndex = LimaClock.dayIndex(now)
        // Solo días: cualquier hora de esos días.
        guard let span else { return days?.contains(dayIndex) == true }

        let minutes = LimaClock.minutes(now)
        // La franja es del día en que EMPIEZA: de ahí el paso por ayer.
        return (0...1).contains { back in
            let day = (dayIndex - back + LimaClock.weekDays) % LimaClock.weekDays
            let mins = minutes + back * LimaClock.dayMinutes
            return (days?.contains(day) ?? true) && mins >= span.start && mins < span.start + span.length
        }
    }

    /// La franja en una frase («Solo sáb y dom, de 11:00 a 15:00»), o `nil` si no restringe nada. Es `describeWindow`
    /// de `packages/contracts/src/menu-availability.ts`.
    func describe() -> String? {
        let days = Self.effectiveDays(days)
        let span = Self.timeSpan(from, to)
        if days == nil && span == nil { return nil }
        let hours = span.map { span -> String in
            let start = Self.hhmm(span.start)
            let end = Self.hhmm((span.start + span.length) % LimaClock.dayMinutes)
            return String(localized: "de \(start) a \(end)")
        }
        let daysText = days.map { Self.describeDays($0.sorted()) }
        switch (daysText, hours) {
        case let (daysText?, hours?): return String(localized: "Solo \(daysText), \(hours)")
        case let (daysText?, nil): return String(localized: "Solo \(daysText)")
        case let (nil, hours?): return String(localized: "Solo \(hours)")
        case (nil, nil): return nil
        }
    }

    private static let minRun = 3

    private static func hhmm(_ minutes: Int) -> String {
        let hour = minutes / LimaClock.hourMinutes
        let minute = minutes % LimaClock.hourMinutes
        return (hour < 10 ? "0" : "") + "\(hour):" + (minute < 10 ? "0" : "") + "\(minute)"
    }

    /// 'sáb y dom', 'lun a vie', 'lun a mié y vie': las rachas de tres o más se colapsan.
    private static func describeDays(_ sorted: [Int]) -> String {
        var runs: [[Int]] = []
        for day in sorted {
            if let last = runs.last?.last, day == last + 1 {
                runs[runs.count - 1].append(day)
            } else {
                runs.append([day])
            }
        }
        let tokens: [String] = runs.flatMap { run -> [String] in
            guard let first = run.first, let last = run.last else { return [] }
            if run.count >= minRun {
                let from = LimaClock.dayLabel(first)
                let to = LimaClock.dayLabel(last)
                return [String(localized: "\(from) a \(to)")]
            }
            return run.map(LimaClock.dayLabel)
        }
        guard tokens.count > 1, let last = tokens.last else { return tokens.joined(separator: ", ") }
        let head = tokens.dropLast().joined(separator: ", ")
        return String(localized: "\(head) y \(last)")
    }

    /// `nil` si la franja no discrimina por día: vacío, los siete marcados o ninguno válido.
    private static func effectiveDays(_ days: [Int]?) -> Set<Int>? {
        let valid = Set((days ?? []).filter { (0..<LimaClock.weekDays).contains($0) })
        return valid.isEmpty || valid.count == LimaClock.weekDays ? nil : valid
    }

    /// Inicio y duración en minutos, o `nil` si falta una de las dos horas: con media franja no se sabe cuándo
    /// acaba, y se prefiere respetar solo los días a inventarse un final. `to == from` son 24 horas.
    private static func timeSpan(_ from: String?, _ to: String?) -> (start: Int, length: Int)? {
        guard let start = LimaClock.parseMinutes(from), let end = LimaClock.parseMinutes(to) else { return nil }
        return (start, (end <= start ? end + LimaClock.dayMinutes : end) - start)
    }
}
