import SwiftUI
import MetabindContent

/// The empty state, before the first question.
///
/// When a content project is configured this is a Metabind-managed component —
/// which is the interesting version, because it means merchandising can change
/// the opening screen without shipping a release. The component reports taps
/// back through `onMetabindAction`, carrying the prompt to send.
///
/// Without one it falls back to the built-in prompts below, so a fresh clone
/// still runs. The fallback is deliberately plain: it is a stand-in for the
/// managed screen, not a second design to maintain.
struct StarterScreen: View {
    let onSend: (String) -> Void

    var body: some View {
        if let content = DemoConfig.content {
            MetabindView(contentId: content.starterContentId)
                .onMetabindAction { action in
                    guard action.name == "selectedStarter",
                          let prompt = action.props["prompt"] as? String else { return }
                    onSend(prompt)
                }
        } else {
            fallback
        }
    }

    private var fallback: some View {
        VStack(spacing: 14) {
            ForEach(Self.starters) { starter in
                StarterChip(
                    text: starter.prompt,
                    isPrimary: starter.isPrimary,
                    onTap: { onSend(starter.prompt) }
                )
            }
        }
        .padding(.horizontal, OakTheme.pageMargin)
        .padding(.top, 12)
    }

    struct Starter: Identifiable {
        let prompt: String
        let isPrimary: Bool
        var id: String { prompt }
    }

    static let starters: [Starter] = [
        Starter(prompt: "Contemporary lounge chair with a curved bent-ply natural birch frame", isPrimary: true),
        Starter(prompt: "Show me inspirations for a living room", isPrimary: false),
        Starter(prompt: "Help me put together a lounge room around the Contour Chair", isPrimary: false),
        Starter(prompt: "Compare the coffee tables in your range", isPrimary: false),
        Starter(prompt: "Tell me everything about the Contour Chair", isPrimary: false),
    ]
}

#Preview {
    ZStack {
        OakTheme.background.ignoresSafeArea()
        ScrollView { StarterScreen(onSend: { _ in }) }
    }
}
