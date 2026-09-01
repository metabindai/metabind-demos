import SwiftUI

/// The Oak&Ivory empty-state suggestion card. The primary variant matches
/// the large faded "Contemporary lounge chair…" card from the design — wider,
/// quieter typography. Secondary variants are smaller utility chips.
struct StarterChip: View {
    let text: String
    let isPrimary: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 12) {
                Text(text)
                    .font(isPrimary ? OakTheme.body(size: 20) : OakTheme.body(size: 16))
                    .foregroundStyle(OakTheme.text.opacity(isPrimary ? 0.35 : 0.55))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .lineSpacing(2)

                if !isPrimary {
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(OakTheme.text.opacity(0.35))
                        .padding(.top, 3)
                }
            }
            .padding(.horizontal, isPrimary ? 22 : 18)
            .padding(.vertical, isPrimary ? 22 : 16)
            .background(OakTheme.surface, in: .rect(cornerRadius: OakTheme.cardCorner, style: .continuous))
            .oakCardShadow()
        }
        .buttonStyle(.plain)
        .accessibilityHint("Send this prompt")
    }
}

#Preview {
    ZStack {
        OakTheme.background.ignoresSafeArea()
        VStack(spacing: 14) {
            StarterChip(text: "Contemporary lounge chair with a curved bent-ply natural birch frame", isPrimary: true, onTap: {})
            StarterChip(text: "Compare two of your bestselling sofas", isPrimary: false, onTap: {})
        }
        .padding()
    }
}
