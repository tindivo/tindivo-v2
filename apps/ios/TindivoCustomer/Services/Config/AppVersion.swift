import Foundation

/// Versión `mayor.menor.parche`, con la misma gramática que `parseVersion` de `packages/contracts/src/client-compat.ts`
/// (CLI-4) y que `AppVersion.kt` de Android: `1`, `1.2` o `1.2.3`, cada parte de 1 a 9 dígitos; el sufijo desde el
/// primer `-` o `+` se ignora. Una versión ilegible es `nil`: nunca bloquea a nadie.
struct AppVersion: Comparable, Equatable, Sendable {
    let major: Int
    let minor: Int
    let patch: Int

    init?(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let core = trimmed.prefix { $0 != "-" && $0 != "+" }
        let parts = core.split(separator: ".", omittingEmptySubsequences: false)
        guard (1...3).contains(parts.count) else { return nil }
        var numbers: [Int] = []
        for part in parts {
            guard (1...9).contains(part.count), part.allSatisfy({ $0.isASCII && $0.isNumber }),
                let number = Int(part)
            else { return nil }
            numbers.append(number)
        }
        major = numbers[0]
        minor = numbers.count > 1 ? numbers[1] : 0
        patch = numbers.count > 2 ? numbers[2] : 0
    }

    static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
        (lhs.major, lhs.minor, lhs.patch) < (rhs.major, rhs.minor, rhs.patch)
    }
}
