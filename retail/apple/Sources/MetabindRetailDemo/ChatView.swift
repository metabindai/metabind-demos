import SwiftUI
import MetabindAI

/// The Oak&Ivory branded chat surface — composed directly against
/// ``MetabindAssistant``'s observable state rather than using the SDK's
/// stock ``MetabindAssistantView``, so the visual language stays on-brand.
struct ChatView: View {
    @Bindable var assistant: MetabindAssistant
    let suggestionService: SuggestionService
    let onReset: () -> Void
    let onResetAPIKey: () -> Void
    var onCart: () -> Void = {}

    @State private var inputText = ""
    @State private var keyboardVisible = false
    @State private var suggestions: [String] = []
    @State private var suggestionsTask: Task<Void, Never>?

    /// Whether to draft follow-up chips after each turn via ``SuggestionService``.
    ///
    /// Off by default: it costs an extra model round trip per turn, and this
    /// project's tools already end most turns with a selection card, where a
    /// row of "what next" chips competes with the choice the card is asking
    /// for. Turn it on to see the pattern — the service and the chip rail are
    /// both wired and working.
    static let showsFollowUpSuggestions = false
    @FocusState private var inputFocused: Bool
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            messageStream
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    inputBar
                        .background(alignment: .bottom) {
                            // Soft fade beneath the input bar so messages
                            // dissolve into the background as they scroll
                            // past it instead of clipping hard.
                            LinearGradient(
                                colors: [
                                    OakTheme.background.opacity(0),
                                    OakTheme.background,
                                    OakTheme.background
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            .ignoresSafeArea(edges: .bottom)
                            .allowsHitTesting(false)
                            .padding(.top, -32) // extend the fade above the bar
                        }
                }
                .background(OakTheme.background.ignoresSafeArea())
                .toolbar { chatToolbar }
                .toolbarTitleDisplayMode(.inline)
        }
        .task(id: ObjectIdentifier(assistant)) {
            wireHostBridge()
        }
        .environment(\.mcpHostBridge, assistant.hostBridge)
        .onChange(of: assistant.isProcessing) { _, isProcessing in
            if isProcessing {
                clearSuggestions()
            } else if Self.showsFollowUpSuggestions {
                scheduleSuggestionFetch()
            }
        }
        .onChange(of: assistant.conversation.messages.count) { _, _ in
            clearSuggestions()
        }
    }

    private func wireHostBridge() {
        let bridge = assistant.hostBridge
        let openURL = openURL
        bridge.handlers.onOpenLink = { url in
            await withCheckedContinuation { continuation in
                openURL(url) { accepted in
                    continuation.resume(returning: accepted)
                }
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var chatToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                Button("Reset API Key", systemImage: "key", role: .destructive, action: onResetAPIKey)
            } label: {
                Image(systemName: "person.crop.circle")
            }
            .accessibilityLabel("Profile")
        }

        ToolbarItem(placement: .principal) {
            Text("Oak&Ivory")
                .font(OakTheme.wordmark(size: 22))
                .foregroundStyle(OakTheme.text)
                .accessibilityAddTraits(.isHeader)
        }

        ToolbarItem(placement: .topBarTrailing) {
            Button {
                onCart()
            } label: {
                Image(systemName: "cart")
            }
            .accessibilityLabel("Cart")
        }

        if isInChat {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    assistant.reset()
                    inputText = ""
                    onReset()
                } label: {
                    Image(systemName: "xmark")
                }
                .accessibilityLabel("New conversation")
            }
        }
    }

    /// True once the user has started a conversation. Used to hide the
    /// new-conversation action on the starter screen, where there is nothing
    /// to clear yet.
    private var isInChat: Bool {
        !assistant.conversation.messages.isEmpty
    }

    // MARK: - Message Stream

    private var messageStream: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 14) {
                    Color.clear
                        .frame(height: 0)
                        .id("__top__")

                    if assistant.conversation.messages.isEmpty {
                        emptyState
                            .transition(
                                .asymmetric(
                                    insertion: .opacity,
                                    removal: .opacity.combined(with: .offset(y: 20))
                                )
                            )
                    } else {
                        ForEach(assistant.conversation.messages) { message in
                            MessageRow(message: message)
                                .id(message.id)
                        }

                        if showsThinkingIndicator {
                            ThinkingIndicator()
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, OakTheme.pageMargin)
                                .id("__streaming__")
                                .transition(.opacity)
                        } else if !suggestions.isEmpty {
                            SuggestedNextSteps(suggestions: suggestions) { picked in
                                clearSuggestions()
                                send(picked)
                            }
                            .padding(.horizontal, OakTheme.pageMargin)
                            .padding(.top, 8)
                            .id("__suggestions__")
                            .transition(.opacity)
                        }
                    }

                    Color.clear
                        .frame(height: 4)
                        .id("__bottom__")
                }
                .animation(.smooth(duration: 0.35), value: assistant.conversation.messages.isEmpty)
                .animation(.smooth(duration: 0.3), value: assistant.conversation.messages.count)
                .animation(.easeInOut(duration: 0.25), value: showsThinkingIndicator)
                .animation(.easeInOut(duration: 0.25), value: suggestions)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: assistant.conversation.messages.isEmpty) { wasEmpty, isEmpty in
                // Either direction swaps the whole content for something of a
                // very different height, and the scroll view keeps its offset
                // across the swap. Leaving the starter screen that parks the
                // stream at the bottom of nothing; coming back to it — "new
                // conversation" — parks it past the end of the cards, which
                // reads as an empty screen. Re-anchor to the top both ways,
                // then again once the transition has settled and the content
                // height has actually changed.
                guard wasEmpty != isEmpty else { return }
                scrollToTop(proxy)
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(400))
                    scrollToTop(proxy)
                }
            }
            .onChange(of: assistant.conversation.messages.count) { _, count in
                // The first message is handled by the empty-state re-anchor
                // above; jumping to the bottom here would fight it.
                guard count > 1 else { return }
                scrollToBottom(proxy)
            }
            .onChange(of: assistant.isProcessing) { _, _ in
                scrollToBottom(proxy)
            }
            .onChange(of: suggestions) { _, _ in
                scrollToBottom(proxy)
            }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo("__bottom__", anchor: .bottom)
        }
    }

    /// Snaps the stream back to the top without animation — used when the
    /// content underneath changes wholesale (starter screen → conversation)
    /// and an animated scroll would just chase a moving target.
    private func scrollToTop(_ proxy: ScrollViewProxy) {
        proxy.scrollTo("__top__", anchor: .top)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        StarterScreen(onSend: send)
    }

    // MARK: - Input

    private var inputBar: some View {
        Group {
            if #available(iOS 26.0, macOS 26.0, *) {
                modernInputBar
            } else {
                legacyInputBar
            }
        }
        .padding(.horizontal, OakTheme.pageMargin)
        .padding(.top, 16)
        .padding(.bottom, 12)
    }

    /// iOS 26+ layout. The text field and send button live inside the
    /// same ``GlassEffectContainer`` so their Liquid Glass materials merge
    /// when they're within the container's `spacing`. When the button
    /// appears it morphs out of the trailing edge of the input field's
    /// glass rather than fading in from nowhere.
    @available(iOS 26.0, macOS 26.0, *)
    private var modernInputBar: some View {
        GlassEffectContainer(spacing: 16) {
            HStack(spacing: 6) {
                TextField("Ask Anything…", text: $inputText, axis: .vertical)
                    .focused($inputFocused)
                    .lineLimit(1...5)
                    .font(OakTheme.body(size: 17))
                    .foregroundStyle(OakTheme.text)
                    .tint(OakTheme.accent)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity)
                    .glassEffect(.regular.interactive(), in: .capsule)
                    .onSubmit { sendCurrent() }

                if showsSendButton {
                    Button(action: sendCurrent) {
                        Image(systemName: assistant.isProcessing ? "stop.fill" : "arrow.up")
                            .font(.system(size: 17, weight: .semibold))
                            .frame(width: 32, height: 32)
                    }
                    .tint(OakTheme.accent)
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.circle)
                    .controlSize(.regular)
                    .accessibilityLabel(assistant.isProcessing ? "Stop response" : "Send message")
                }
            }
        }
        .animation(.smooth(duration: 0.35), value: showsSendButton)
    }

    /// Fallback layout for pre-iOS-26 systems — keeps the original look
    /// with the button always visible and dimmed when there's nothing to send.
    private var legacyInputBar: some View {
        HStack(spacing: 10) {
            TextField("Ask Anything…", text: $inputText, axis: .vertical)
                .focused($inputFocused)
                .lineLimit(1...5)
                .font(OakTheme.body(size: 17))
                .foregroundStyle(OakTheme.text)
                .tint(OakTheme.accent)
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .oakGlassBackground(cornerRadius: 26)
                .onSubmit { sendCurrent() }

            Button(action: sendCurrent) {
                Image(systemName: assistant.isProcessing ? "stop.fill" : "arrow.up")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .foregroundStyle(.white)
                    .background(
                        Circle().fill(canSend ? OakTheme.accent : OakTheme.accent.opacity(0.35))
                    )
            }
            .disabled(!canSend && !assistant.isProcessing)
            .accessibilityLabel(assistant.isProcessing ? "Stop response" : "Send message")
        }
    }

    /// Whether the send/stop button should be visible. Shows while the user
    /// has typed something *or* while a response is streaming (so they can
    /// cancel it).
    private var showsSendButton: Bool {
        canSend || assistant.isProcessing
    }

    private var canSend: Bool {
        !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// True while the assistant is generating, OR while the latest message
    /// is the user's prompt and no reply has landed yet. Closes the brief
    /// gap in `MetabindAssistant.send()` between appending `.user` and
    /// flipping `isProcessing` to true, which otherwise renders as a blank
    /// area below the new user bubble.
    private var showsThinkingIndicator: Bool {
        if assistant.isProcessing { return true }
        if case .user = assistant.conversation.messages.last { return true }
        return false
    }

    private func sendCurrent() {
        if assistant.isProcessing {
            assistant.cancel()
            return
        }
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        inputFocused = false
        assistant.send(text)
    }

    private func send(_ text: String) {
        assistant.send(text)
        inputFocused = false
    }

    // MARK: - Suggestions

    private func clearSuggestions() {
        suggestionsTask?.cancel()
        suggestionsTask = nil
        if !suggestions.isEmpty {
            suggestions = []
        }
    }

    private func scheduleSuggestionFetch() {
        suggestionsTask?.cancel()
        let recent = recentSuggestionContext()
        guard !recent.isEmpty else { return }
        let service = suggestionService
        suggestionsTask = Task { @MainActor in
            let result = await service.fetchSuggestions(recentMessages: recent)
            if Task.isCancelled { return }
            suggestions = result
        }
    }

    private func recentSuggestionContext() -> [SuggestionService.RecentMessage] {
        let textMessages: [SuggestionService.RecentMessage] = assistant.conversation.messages.compactMap { message in
            switch message {
            case .user(_, let text):
                return text.isEmpty ? nil : .init(role: "user", text: text)
            case .assistant(_, let text):
                return text.isEmpty ? nil : .init(role: "assistant", text: text)
            case .tool:
                return nil
            }
        }
        return Array(textMessages.suffix(4))
    }
}

#Preview {
    ZStack {
        OakTheme.background.ignoresSafeArea()
        // Preview without a live assistant — use the stock view for layout only.
        Text("Preview requires a live MetabindAssistant; build & run to exercise the chat.")
            .font(OakTheme.body())
            .foregroundStyle(OakTheme.text.opacity(0.5))
            .multilineTextAlignment(.center)
            .padding()
    }
}

// MARK: - Glass Background Shim
private extension View {
    /// Applies Liquid Glass when available, falling back to the Oak&Ivory
    /// surface + card shadow on earlier OS versions. Keeps the call site a
    /// single expression so `if #available` doesn't fragment the view tree.
    @ViewBuilder
    func oakGlassBackground(cornerRadius: CGFloat) -> some View {
        oakGlassBackground(in: .rect(cornerRadius: cornerRadius, style: .continuous))
    }

    /// Shape-flexible variant of ``oakGlassBackground(cornerRadius:)`` — use
    /// this for circular controls or any non-rectangular surface.
    @ViewBuilder
    func oakGlassBackground<S: Shape>(
        in shape: S,
        tint: Color? = nil
    ) -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            let glass: Glass = {
                if let tint {
                    return .regular.tint(tint).interactive()
                } else {
                    return .regular.interactive()
                }
            }()
            self.glassEffect(glass, in: shape)
        } else {
            self
                .background((tint ?? OakTheme.surface), in: shape)
                .oakCardShadow()
        }
    }

    /// Applies the system `.glassProminent` button style with a tint when
    /// available, falling back to a manual filled-circle treatment on
    /// earlier OS versions so the send button stays visually consistent.
    @ViewBuilder
    func oakGlassButtonStyle(tint: Color) -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            self
                .tint(tint)
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
        } else {
            self
                .foregroundStyle(.white)
                .background(Circle().fill(tint))
                .buttonStyle(.plain)
                .frame(width: 44, height: 44)
        }
    }
}



