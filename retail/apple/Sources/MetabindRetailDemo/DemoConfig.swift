import Foundation

/// Every externally-configurable value the demo needs, read from `Info.plist`
/// where the build substituted it from `Config/Local.xcconfig` (or, on Xcode
/// Cloud, from the workflow environment via `ci_scripts/ci_post_clone.sh`).
///
/// Nothing identifying is compiled in. A clean clone builds and runs with the
/// placeholders in `Config/RetailDemo.xcconfig` and asks for an API key on
/// launch.
enum DemoConfig {
    private static func string(_ key: String) -> String {
        (Bundle.main.infoDictionary?[key] as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Placeholders from the committed base xcconfig. Treated as "unset" so an
    /// unconfigured build behaves like an empty one rather than trying to talk
    /// to a project literally named YOUR_PROJECT_ID.
    private static let placeholders: Set<String> = ["YOUR_ORG_ID", "YOUR_PROJECT_ID", ""]

    private static func configured(_ key: String) -> String? {
        let value = string(key)
        return placeholders.contains(value) ? nil : value
    }

    // MARK: - MCP / agent

    static let orgId = configured("RetailDemoOrgId") ?? ""
    static let projectId = configured("RetailDemoProjectId") ?? ""

    /// Optional, so a controlled demo build starts without setup. It is
    /// compiled into Info.plist and is recoverable from the built app — use
    /// only a restricted, revocable key.
    static let apiKey = string("RetailDemoAPIKey")

    static var mcpServerURL: URL? {
        guard !orgId.isEmpty, !projectId.isEmpty else { return nil }
        return URL(string: "https://mcp.metabind.ai/\(orgId)/projects/\(projectId)")
    }
}
