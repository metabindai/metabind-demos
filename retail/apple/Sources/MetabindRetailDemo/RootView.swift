import SwiftUI
import Security
import MetabindAI

/// Top-level container: key entry until there is a key, then the chat surface.
///
/// Unlike the Finance demo — which routes each turn onto a purpose-built
/// surface and has no transcript — this app is a conversation. It is the
/// counterpart example: what the SDK looks like when a chat *is* the product.
struct RootView: View {
    @State private var metabindApiKey: String = KeychainKey.initialValue()
    @State private var assistant: MetabindAssistant?
    @State private var suggestionService: SuggestionService?

    var body: some View {
        ZStack {
            OakTheme.background.ignoresSafeArea()

            if let assistant, let suggestionService {
                ChatView(
                    assistant: assistant,
                    suggestionService: suggestionService,
                    onReset: { assistant.reset() },
                    onResetAPIKey: resetAPIKey
                )
            } else {
                keyEntry
            }
        }
        .onAppear {
            if !metabindApiKey.isEmpty { start() }
        }
    }

    // MARK: - Key entry

    private var keyEntry: some View {
        VStack(spacing: 16) {
            Text("Oak&Ivory")
                .font(OakTheme.wordmark(size: 34))
                .foregroundStyle(OakTheme.text)

            Text("Enter your Metabind API key")
                .font(OakTheme.body(size: 17))
                .foregroundStyle(OakTheme.text.opacity(0.75))

            Text("Routed through the Metabind Agent proxy — no provider keys in the app.")
                .font(OakTheme.body(size: 14))
                .foregroundStyle(OakTheme.text.opacity(0.5))
                .multilineTextAlignment(.center)

            SecureField("mb_\u{2026}", text: $metabindApiKey)
                .textFieldStyle(.plain)
                .font(OakTheme.body(size: 16))
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                .background(OakTheme.surface, in: .rect(cornerRadius: OakTheme.bubbleCorner, style: .continuous))
                .oakCardShadow()
                .frame(maxWidth: 360)
                .onSubmit(start)

            Button("Start", action: start)
                .font(OakTheme.body(size: 16))
                .foregroundStyle(.white)
                .padding(.horizontal, 28)
                .padding(.vertical, 12)
                .background(
                    Capsule(style: .continuous)
                        .fill(canStart ? OakTheme.accent : OakTheme.accent.opacity(0.35))
                )
                .buttonStyle(.plain)
                .disabled(!canStart)

            if !isConfigured {
                Text("No org or project configured — copy Config/Local.xcconfig.example to Local.xcconfig and fill it in.")
                    .font(OakTheme.body(size: 13))
                    .foregroundStyle(OakTheme.text.opacity(0.45))
                    .multilineTextAlignment(.center)
                    .padding(.top, 8)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var canStart: Bool {
        !metabindApiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && isConfigured
    }

    private var isConfigured: Bool { DemoConfig.mcpServerURL != nil }

    // MARK: - Lifecycle

    private func start() {
        guard canStart, let serverURL = DemoConfig.mcpServerURL else { return }
        let key = metabindApiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        KeychainKey.save(key)

        let provider = MetabindAgentProvider(
            baseURL: MetabindAgentProvider.productionHost,
            apiKey: key,
            orgId: DemoConfig.orgId,
            projectId: DemoConfig.projectId
        )
        // One Metabind API key authenticates against both the agent proxy and
        // the MCP server — one key, two endpoints.
        assistant = MetabindAssistant(
            serverURL: serverURL,
            serverHeaders: ["authorization": "Bearer \(key)"],
            provider: provider
        )
        suggestionService = SuggestionService(
            agentHost: MetabindAgentProvider.productionHost,
            orgId: DemoConfig.orgId,
            projectId: DemoConfig.projectId,
            apiKey: key
        )
    }

    /// Forgets the key and drops back to `keyEntry`. The reset is sticky, so a
    /// relaunch doesn't quietly reinstate a key configured into the build.
    private func resetAPIKey() {
        KeychainKey.delete()
        assistant = nil
        suggestionService = nil
        metabindApiKey = ""
    }
}

/// Keychain-backed storage for the Metabind API key, scoped to the app's
/// bundle identifier. Keychain items generally survive app deletion, so
/// "Reset API Key" is the way to clear one.
private enum KeychainKey {
    private static let fallbackBundleIdentifier = "com.example.MetabindRetailDemo"

    static let service = "\(Bundle.main.bundleIdentifier ?? fallbackBundleIdentifier)" + ".apiKey"
    static let account = "metabind-api-key"

    /// Optional configured key so private demo builds run without setup.
    static let configuredKey = DemoConfig.apiKey

    /// Set once "Reset API Key" runs, so the configured key stops seeding the
    /// field. Without it the reset would appear to work and then undo itself
    /// on the next launch.
    private static let wasResetDefault = "\(Bundle.main.bundleIdentifier ?? fallbackBundleIdentifier)" + ".keyWasReset"

    static func initialValue() -> String {
        if let stored = load() { return stored }
        if UserDefaults.standard.bool(forKey: wasResetDefault) { return "" }
        return configuredKey
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let key = String(data: data, encoding: .utf8) else { return nil }
        return key
    }

    static func save(_ key: String) {
        let attrs: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(attrs as CFDictionary)
        var add = attrs
        add[kSecValueData as String] = Data(key.utf8)
        SecItemAdd(add as CFDictionary, nil)
        UserDefaults.standard.set(false, forKey: wasResetDefault)
    }

    static func delete() {
        let attrs: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(attrs as CFDictionary)
        UserDefaults.standard.set(true, forKey: wasResetDefault)
    }
}
