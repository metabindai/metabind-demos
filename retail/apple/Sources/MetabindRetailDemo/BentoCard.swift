import SwiftUI

/// One tile in a `BentoCard`: a flat colour swatch or a bundled product image.
///
/// Each tile also contributes a value to the prompt the card sends — the hex
/// for a colour, the title for an image — so the model sees what the shopper
/// tapped, not just the card's headline.
enum BentoTile: Hashable {
    case color(hex: String)
    case image(name: String, title: String)

    var promptValue: String {
        switch self {
        case .color(let hex): return hex
        case .image(_, let title): return title
        }
    }
}

/// A tappable card with a title, a line of description, and a small grid of
/// colour / image tiles. The grid adapts to the number of tiles: one fills the
/// card, two sit side by side, three put a tall tile beside two stacked ones,
/// and four make the classic bento — a wide tile over two small ones on the
/// left, a tall tile down the right.
struct BentoCard: View {
    let title: String
    let description: String
    let tiles: [BentoTile]
    /// Overlay the title on image tiles. Colour tiles never show one.
    var showTileTitles: Bool = true
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    if !title.isEmpty {
                        Text(title)
                            .font(.headline)
                            .foregroundStyle(OakTheme.text)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Text(description)
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .lineSpacing(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .multilineTextAlignment(.leading)

                bento
            }
            .padding(20)
            .frame(maxWidth: .infinity)
            .background(OakTheme.surface, in: .rect(cornerRadius: 24, style: .continuous))
            .contentShape(.rect(cornerRadius: 24, style: .continuous))
            .shadow(color: .black.opacity(0.1), radius: 20)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Send this prompt")
    }

    // MARK: - Layout

    private let spacing: CGFloat = 8
    private let smallHeight: CGFloat = 72
    private var tallHeight: CGFloat { smallHeight * 2 + spacing }
    private let rightColumnWidth: CGFloat = 130

    @ViewBuilder
    private var bento: some View {
        switch tiles.count {
        case 0:
            tile(nil, height: tallHeight)
        case 1:
            tile(tiles[0], height: tallHeight)
        case 2:
            HStack(alignment: .top, spacing: spacing) {
                tile(tiles[0], height: tallHeight)
                tile(tiles[1], height: tallHeight)
            }
        case 3:
            HStack(alignment: .top, spacing: spacing) {
                tile(tiles[0], height: tallHeight)
                VStack(alignment: .leading, spacing: spacing) {
                    tile(tiles[1], height: smallHeight)
                    tile(tiles[2], height: smallHeight)
                }
                .frame(maxWidth: .infinity)
            }
        default:
            HStack(alignment: .top, spacing: spacing) {
                VStack(alignment: .leading, spacing: spacing) {
                    tile(tiles[0], height: smallHeight)
                    HStack(alignment: .top, spacing: spacing) {
                        tile(tiles[1], height: smallHeight)
                        tile(tiles[2], height: smallHeight)
                    }
                }
                .frame(maxWidth: .infinity)
                tile(tiles[3], height: tallHeight, width: rightColumnWidth)
            }
        }
    }

    private func tile(_ tile: BentoTile?, height: CGFloat, width: CGFloat? = nil) -> some View {
        Group {
            switch tile {
            case .none:
                Color(.systemGray5)
            case .color(let hex):
                Color(hex: hex) ?? Color(.systemGray5)
            case .image(let name, let title):
                Color.clear
                    .overlay {
                        Image(name)
                            .resizable()
                            .scaledToFill()
                    }
                    .overlay(alignment: .bottomLeading) {
                        if showTileTitles, !title.isEmpty {
                            Text(title)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.white)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                                .padding(8)
                        }
                    }
            }
        }
        .frame(maxWidth: width ?? .infinity)
        .frame(width: width, height: height)
        .clipShape(.rect(cornerRadius: 10, style: .continuous))
    }
}

private extension Color {
    /// Parses `#RRGGBB` (with or without the hash). Returns nil for anything else.
    init?(hex: String) {
        var digits = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if digits.hasPrefix("#") { digits.removeFirst() }
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

#Preview {
    ZStack {
        OakTheme.background.ignoresSafeArea()
        ScrollView {
            VStack(spacing: 12) {
                BentoCard(
                    title: "Four colours",
                    description: "The classic bento: wide tile, two small ones, tall column.",
                    tiles: [.color(hex: "#4a5240"), .color(hex: "#c9a45a"), .color(hex: "#e8dcc8"), .color(hex: "#444444")],
                    onTap: {}
                )
                BentoCard(
                    title: "Three images",
                    description: "Tall tile beside two stacked ones.",
                    tiles: [
                        .image(name: "starter-pebble-coffee-table", title: "Pebble Round Coffee Table"),
                        .image(name: "starter-lumora-pendant-light", title: "Lumora Pendant Light"),
                        .image(name: "starter-viksund-teak-credenza", title: "Viksund Teak Credenza"),
                    ],
                    onTap: {}
                )
                BentoCard(
                    title: "One image",
                    description: "A single tile fills the card.",
                    tiles: [.image(name: "starter-contemporary-lounge", title: "Contemporary")],
                    onTap: {}
                )
            }
            .padding(24)
        }
    }
}
