import Foundation
import TindivoAPI
@testable import TindivoCustomer

/// La raíz de composición de las pruebas (SW-4): mismas dependencias que `live`, con dobles.
extension AppEnvironment {
    static func test(system: any SystemRepository) -> AppEnvironment {
        AppEnvironment(config: .fromBundle(.main), system: system)
    }
}
