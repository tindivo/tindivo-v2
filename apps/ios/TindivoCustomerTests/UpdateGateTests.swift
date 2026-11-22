import Foundation
import Testing
@testable import TindivoCustomer

@Suite("Pantalla de actualización (CLI-4)")
struct UpdateScreenTests {
    @Test("CLI-4: sin id de la App Store no hay enlace (el botón queda deshabilitado)")
    func noStoreIdMeansNoURL() {
        #expect(AppConfig.storeURL(appStoreId: "") == nil)
        #expect(AppConfig.storeURL(appStoreId: "  ") == nil)
    }

    @Test("CLI-4: con el id de la App Store el enlace es el de la ficha")
    func storeURL() {
        #expect(AppConfig.storeURL(appStoreId: "1234567890")?.absoluteString == "https://apps.apple.com/app/id1234567890")
    }

    @Test("CLI-4: un id que no es numérico no arma enlace")
    func nonNumericIdIsRejected() {
        #expect(AppConfig.storeURL(appStoreId: "abc/../x") == nil)
    }
}

@Suite("Imágenes")
struct ImageCacheTests {
    @Test("las miniaturas de AsyncImage tienen una caché con capacidad (32 MB en memoria, 128 MB en disco)")
    func capacity() {
        let cache = AppEnvironment.makeImageCache()
        #expect(cache.memoryCapacity == 32 * 1024 * 1024)
        #expect(cache.diskCapacity == 128 * 1024 * 1024)
    }
}
