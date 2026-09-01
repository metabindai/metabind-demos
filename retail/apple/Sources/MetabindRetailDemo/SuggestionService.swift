import Foundation

/// Issues one-shot LLM calls to the Metabind agent proxy to draft short
/// follow-up prompts after each assistant turn. Mirrors the web demo's
/// `agentClient.chatText` flow: stream SSE, accumulate `text_delta`,
/// parse the reply as a JSON array of strings.
actor SuggestionService {
    struct RecentMessage: Sendable {
        let role: String
        let text: String
    }

    private let chatURL: URL
    private let apiKey: String

    init(agentHost: URL, orgId: String, projectId: String, apiKey: String) {
        self.chatURL = agentHost
            .appendingPathComponent(orgId)
            .appendingPathComponent(projectId)
            .appendingPathComponent("chat")
        self.apiKey = apiKey
    }

    /// Returns up to 4 short follow-up prompts. Returns an empty array on
    /// any failure path so the UI silently hides.
    func fetchSuggestions(recentMessages: [RecentMessage]) async -> [String] {
        do {
            return try await fetchInternal(recentMessages: recentMessages)
        } catch is CancellationError {
            return []
        } catch {
            return []
        }
    }

    private func fetchInternal(recentMessages: [RecentMessage]) async throws -> [String] {
        let prompt = Self.buildPrompt(recentMessages: recentMessages)
        var request = URLRequest(url: chatURL)
        request.httpMethod = "POST"
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 30
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "stream": true,
            "messages": [["role": "user", "content": prompt]],
        ])

        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            return []
        }

        // `URLSession.AsyncBytes.lines` collapses blank lines, so the SSE
        // blank-line terminator isn't visible — flush the pending frame
        // when the next `event:` arrives or at end-of-stream.
        var text = ""
        var pendingEvent: String?
        var pendingData = ""

        func flush() {
            defer { pendingData = "" }
            guard let name = pendingEvent else { return }
            guard let data = pendingData.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return }
            if name == "text_delta", let t = json["text"] as? String {
                text += t
            }
        }

        for try await line in bytes.lines {
            try Task.checkCancellation()
            if line.hasPrefix(":") { continue }
            if line.hasPrefix("event:") {
                flush()
                pendingEvent = String(line.dropFirst("event:".count))
                    .trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                let payload = String(line.dropFirst("data:".count))
                    .trimmingCharacters(in: .whitespaces)
                pendingData = pendingData.isEmpty ? payload : pendingData + "\n" + payload
            }
        }
        flush()

        return Self.parseSuggestions(from: text)
    }

    private static func buildPrompt(recentMessages: [RecentMessage]) -> String {
        let context = recentMessages
            .filter { !$0.text.isEmpty }
            .map { "\($0.role): \($0.text)" }
            .joined(separator: "\n\n")
        return """
        You are helping draft short follow-up prompts a user might send next during a furniture product discovery demo. Keep each tight — ideally 3-6 words, max 40 characters — written like a button label, not a sentence. No trailing punctuation. Vary the angle (drill-in, comparison, alternative, broaden).

        VERY Important: Never show any suggestions or follow ups if the last tool presented was a selection one (palette_color_selection color_selection, or product_selection, or item stack) as the user will be making a choice there.
        
        Recent conversation:
        \(context)

        Reply with ONLY a JSON array of 3 short follow-up prompt strings, e.g. ["...", "...", "..."]. No prose, no code fences.
        """
    }

    static func parseSuggestions(from reply: String) -> [String] {
        let stripped = reply
            .replacingOccurrences(of: #"```(?:json)?"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "```", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if let data = stripped.data(using: .utf8) {
            if let arr = try? JSONSerialization.jsonObject(with: data) as? [String] {
                return Array(arr.prefix(4))
            }
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let arr = obj["suggestions"] as? [String] {
                return Array(arr.prefix(4))
            }
        }

        if let match = stripped.range(of: #"\[[\s\S]*?\]"#, options: .regularExpression),
           let data = stripped[match].data(using: .utf8),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [String] {
            return Array(arr.prefix(4))
        }

        return []
    }
}
