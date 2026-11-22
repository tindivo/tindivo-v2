import SwiftUI
import TindivoDesign

@main
struct TindivoCustomerApp: App {
    private let environment: AppEnvironment

    init() {
        TindivoFonts.register()
        environment = .live()
    }

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment)
        }
    }
}
