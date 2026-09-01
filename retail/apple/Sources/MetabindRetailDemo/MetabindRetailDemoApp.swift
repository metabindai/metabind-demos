import SwiftUI
import MetabindContent

@main
struct MetabindRetailDemoApp: App {
    /// Content client for the Metabind-managed starter screen. Always
    /// constructed so `.environment` stays unconditional; it only reaches the
    /// network when a `MetabindView` actually asks it to, and `StarterScreen`
    /// does not ask unless `DemoConfig.content` is set.
    @State private var client = MetabindClient(
        url: DemoConfig.contentAPIURL,
        ws: DemoConfig.contentWebSocketURL,
        apiKey: DemoConfig.content?.apiKey ?? "",
        organizationId: DemoConfig.orgId,
        projectId: DemoConfig.content?.projectId ?? ""
    )

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.light)
        }
        .environment(client)
    }
}
