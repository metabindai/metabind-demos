import SwiftUI

/// The empty state, before the first question: a greeting and three bento
/// cards, each of which sends a prompt when tapped.
///
/// The prompt is the card's headline prompt followed by the values of its
/// tiles — hex codes for colours, titles for images — so the model sees what
/// the shopper was looking at, not just the card's wording. Edit `cards` to
/// change the opening screen.
struct StarterScreen: View {
    let onSend: (String) -> Void

    var body: some View {
        VStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Welcome back, Joe")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(OakTheme.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 16)
                Text("A few thoughtful ways to continue shaping your space.")
                    .font(.body)
                    .foregroundStyle(OakTheme.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 8)
            }

            ForEach(Self.cards) { card in
                BentoCard(
                    title: card.title,
                    description: card.description,
                    tiles: card.tiles,
                    showTileTitles: card.showTileTitles,
                    onTap: { onSend(card.fullPrompt) }
                )
            }
        }
        .padding(.horizontal, Self.horizontalPadding)
    }

    private static let horizontalPadding: CGFloat = 24

    struct Card: Identifiable {
        let title: String
        let description: String
        let prompt: String
        let tiles: [BentoTile]
        var showTileTitles: Bool = true
        var id: String { title }

        var fullPrompt: String {
            let values = tiles.map(\.promptValue).filter { !$0.isEmpty }
            guard !values.isEmpty else { return prompt }
            return "\(prompt) \(values.joined(separator: ","))"
        }
    }

    static let cards: [Card] = [
        Card(
            title: "Continue exploring palettes you love",
            description: "Revisit tones and combinations that fit your style.",
            prompt: "Shop for products using palettes from past projects",
            tiles: [
                .color(hex: "#4a5240"),
                .color(hex: "#c9a45a"),
                .color(hex: "#e8dcc8"),
                .color(hex: "#444444"),
            ]
        ),
        Card(
            title: "Pick up where you left off",
            description: "Continue shopping the pieces you\u{2019}ve been considering.",
            prompt: "Start a design based on products I've purchased",
            tiles: [
                .image(name: "starter-pebble-coffee-table", title: "Pebble Round Coffee Table"),
                .image(name: "starter-lumora-pendant-light", title: "Lumora Pendant Light"),
                .image(name: "starter-viksund-teak-credenza", title: "Viksund Teak Credenza"),
            ],
            showTileTitles: false
        ),
        Card(
            title: "A space imagined just for you",
            description: "Explore a design tailored to your style and home",
            prompt: "Shop for products using themes I like",
            tiles: [
                .image(name: "starter-contemporary-lounge", title: ""),
            ]
        ),
    ]
}

#Preview {
    ZStack {
        OakTheme.background.ignoresSafeArea()
        ScrollView { StarterScreen(onSend: { _ in }) }
    }
}
