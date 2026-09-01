import SwiftUI
import MetabindAI

/// Renders one entry from ``Conversation/messages`` in the Oak&Ivory style:
/// user messages as right-aligned white pills, assistant text as plain copy,
/// and tool calls as full-width white surface cards hosting the BindJS render.
struct MessageRow: View {
    let message: Message

    var body: some View {
        switch message {
        case .user(_, let text):
            UserBubble(text: text)
                .padding(.horizontal, OakTheme.pageMargin)
                .transition(.userMessageInsert)

        case .assistant(_, let text):
            AssistantBubble(text: text)
                .padding(.horizontal, OakTheme.pageMargin)
                .transition(.opacity)

        case .tool(let session):
            ToolCard(session: session)
                .padding(.horizontal, OakTheme.pageMargin)
                .transition(.opacity)
        }
    }
}

private extension AnyTransition {
    /// Subtle "fly-in from below" used when a new user message lands in the
    /// stream — fades up while sliding ~12pt vertically so the bubble feels
    /// like it settles into place rather than popping in.
    static var userMessageInsert: AnyTransition {
        .asymmetric(
            insertion: .opacity.combined(with: .offset(y: 12)),
            removal: .opacity
        )
    }
}

// MARK: - User

private struct UserBubble: View {
    let text: String

    var body: some View {
        HStack {
            Spacer(minLength: 40)
            Text(text)
                .font(OakTheme.body(size: 17))
                .foregroundStyle(OakTheme.text)
                .multilineTextAlignment(.leading)
                .lineSpacing(4)
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                .background(OakTheme.surface, in: .rect(cornerRadius: OakTheme.bubbleCorner, style: .continuous))
                .oakCardShadow()
        }
    }
}

// MARK: - Assistant text

private struct AssistantBubble: View {
    let text: String

    var body: some View {
        HStack {
            Text(parsedMarkdown)
                .font(OakTheme.body(size: 17))
                .foregroundStyle(OakTheme.text)
                .lineSpacing(5)
                .textSelection(.enabled)
            Spacer(minLength: 0)
        }
    }

    /// Falls back to the raw text if markdown parsing fails.
    private var parsedMarkdown: AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace
        )
        return (try? AttributedString(markdown: text, options: options))
            ?? AttributedString(text)
    }
}

// MARK: - Tool render

private struct ToolCard: View {
    let session: MCPAppSession

    var body: some View {
        let failed: Bool = if case .failed = session.phase { true } else { false }

        // Data-only tool calls (no BindJS UI resource) are model-internal —
        // hide them from the visual stream so the surface stays a UI feed.
        if session.resourceUri == nil && !failed {
            EmptyView()
        } else {
            MCPAppView(session: session) { content in
                content
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(OakTheme.surface, in: .rect(cornerRadius: OakTheme.cardCorner, style: .continuous))
                    .oakCardShadow()
                    .clipShape(.rect(cornerRadius: OakTheme.cardCorner, style: .continuous))
            } placeholder: {
                HStack(spacing: 10) {
                    ProgressView()
                        .controlSize(.small)
                        .tint(OakTheme.text.opacity(0.6))
                    Text(prettyToolName(session.toolName))
                        .font(OakTheme.body(size: 15))
                        .foregroundStyle(OakTheme.text.opacity(0.55))
                    Spacer()
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 16)
                .background(OakTheme.surface, in: .rect(cornerRadius: OakTheme.cardCorner, style: .continuous))
                .oakCardShadow()
            }
        }
    }

    private func prettyToolName(_ raw: String) -> String {
        raw
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }
}

// MARK: - Streaming indicator

struct ThinkingIndicator: View {
    /// Seconds for one full ripple cycle. Lower = faster motion.
    private let period: Double = 1.1

    var body: some View {
        // `TimelineView(.animation)` requests a redraw every display frame,
        // giving us a continuously updating `context.date` we can use to
        // derive the sine-driven dot positions. This is the supported way
        // to do per-frame animation in SwiftUI — animating a `@State` does
        // not cause `body` to re-evaluate per interpolated frame.
        TimelineView(.animation) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let angle = (t.truncatingRemainder(dividingBy: period) / period) * .pi * 2

            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { i in
                    let stagger = Double(i) * (.pi / 4) // 45° between dots
                    let s = sin(angle + stagger)

                    Circle()
                        .fill(OakTheme.text.opacity(0.35))
                        .frame(width: 7, height: 7)
                        .scaleEffect(CGFloat(1.0 + s * 0.1))
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(OakTheme.surface, in: .rect(cornerRadius: OakTheme.bubbleCorner, style: .continuous))
        .oakCardShadow()
        .accessibilityLabel("Thinking")
    }
}
