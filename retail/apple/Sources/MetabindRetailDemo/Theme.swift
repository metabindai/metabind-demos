import SwiftUI

enum OakTheme {
    static let background = Color("OakBackground")
    static let surface = Color("OakSurface")
    static let text = Color("OakText")
    static let accent = Color("OakAccent")

    static let cardCorner: CGFloat = 22
    static let bubbleCorner: CGFloat = 18
    static let pageMargin: CGFloat = 20

    static func wordmark(size: CGFloat = 44) -> Font {
        .system(size: size, weight: .bold, design: .default)
    }

    static func body(size: CGFloat = 17) -> Font {
        .system(size: size, weight: .regular, design: .default)
    }

    static func cardTitle(size: CGFloat = 19) -> Font {
        .system(size: size, weight: .semibold, design: .default)
    }
}

extension View {
    /// Soft drop shadow used on the white surface cards in the Oak&Ivory chat.
    func oakCardShadow() -> some View {
        shadow(color: .black.opacity(0.04), radius: 14, x: 0, y: 4)
            .shadow(color: .black.opacity(0.02), radius: 2, x: 0, y: 1)
    }
}
