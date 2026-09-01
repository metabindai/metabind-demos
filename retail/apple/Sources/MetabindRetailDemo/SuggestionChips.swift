import SwiftUI

/// "Suggested next steps" rail rendered below the latest assistant turn.
/// Mirrors the web demo at demos.metabind.ai/mcpdemo — collapsible header,
/// two-column grid of outline pill buttons. Tapping a chip surfaces the
/// prompt back through `onTap`.
struct SuggestedNextSteps: View {
    let suggestions: [String]
    let onTap: (String) -> Void

    @State private var isExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.easeOut(duration: 0.18)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .rotationEffect(.degrees(isExpanded ? 0 : -90))
                    Text(suggestions.count == 1 ? "Suggested next step" : "Suggested next steps")
                        .font(OakTheme.body(size: 15))
                    Spacer(minLength: 0)
                }
                .foregroundStyle(OakTheme.text.opacity(0.5))
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityHint(isExpanded ? "Collapse suggestions" : "Expand suggestions")

            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(suggestions, id: \.self) { suggestion in
                        SuggestionChip(text: suggestion) { onTap(suggestion) }
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }
}

private struct SuggestionChip: View {
    let text: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(text)
                .font(OakTheme.body(size: 15))
                .foregroundStyle(OakTheme.text)
                .multilineTextAlignment(.leading)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 18)
                .padding(.vertical, 13)
                .background(
                    ZStack {
                        Capsule(style: .continuous)
                            .fill(OakTheme.surface)
                        Capsule(style: .continuous)
                            .stroke(OakTheme.text.opacity(0.14), lineWidth: 1)
                    }
                )
                .contentShape(Capsule(style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Send this follow-up")
    }
}

#Preview {
    ZStack {
        OakTheme.background.ignoresSafeArea()
        SuggestedNextSteps(
            suggestions: [
                "Design a room with sectional",
                "Compare two sectionals",
                "Show armchair details",
            ],
            onTap: { _ in }
        )
        .padding()
    }
}
