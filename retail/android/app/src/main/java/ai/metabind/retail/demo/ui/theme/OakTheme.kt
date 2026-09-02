/*
 * OakTheme.kt.
 *
 * © 2026 Yap Studios LLC
 */
package ai.metabind.retail.demo.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The Oak&Ivory palette, ported from the iOS app's `Assets.xcassets` colour sets
 * and `Theme.swift`. Named by role so the chat code reads like the SwiftUI original.
 */
data class OakColors(
    /** Behind everything — the warm off-white page. */
    val background: Color,
    /** Cards, bubbles, the input pill. */
    val surface: Color,
    val text: Color,
    val accent: Color,
)

private val LightColors = OakColors(
    background = Color(0xFFF2EDDD),
    surface = Color(0xFFFFFFFF),
    text = Color(0xFF464646),
    accent = Color(0xFF007AFF),
)

/** The iOS asset catalogue carries a dark appearance too; kept for parity even though
 *  both apps currently force light. */
private val DarkColors = OakColors(
    background = Color(0xFF1C1917),
    surface = Color(0xFF2B2826),
    text = Color(0xFFEAEAEA),
    accent = Color(0xFF0A95FF),
)

private val LocalOakColors = staticCompositionLocalOf { LightColors }

object OakTheme {
    val colors: OakColors
        @Composable @ReadOnlyComposable get() = LocalOakColors.current

    val cardCorner: Dp = 22.dp
    val bubbleCorner: Dp = 18.dp
    val pageMargin: Dp = 20.dp

    val cardShape: Shape get() = RoundedCornerShape(cardCorner)
    val bubbleShape: Shape get() = RoundedCornerShape(bubbleCorner)

    fun wordmark(size: Int = 44): TextStyle =
        TextStyle(fontSize = size.sp, fontWeight = FontWeight.Bold)

    fun body(size: Int = 17): TextStyle =
        TextStyle(fontSize = size.sp, fontWeight = FontWeight.Normal)

    fun cardTitle(size: Int = 19): TextStyle =
        TextStyle(fontSize = size.sp, fontWeight = FontWeight.SemiBold)
}

/**
 * Soft drop shadow plus the white surface, used on every card and bubble in the
 * Oak&Ivory chat — the Compose stand-in for `oakCardShadow()` on iOS.
 */
@Composable
fun Modifier.oakCard(shape: Shape = OakTheme.cardShape): Modifier {
    val colors = OakTheme.colors
    return this
        .shadow(
            elevation = 6.dp,
            shape = shape,
            ambientColor = Color.Black.copy(alpha = 0.18f),
            spotColor = Color.Black.copy(alpha = 0.18f),
        )
        .clip(shape)
        .background(colors.surface)
}

@Composable
fun MetabindRetailDemoTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    // Material defaults are mapped onto the palette so anything the SDK renders with
    // MaterialTheme tokens — the markdown body, menus, progress rings — lands on-brand
    // without per-call overrides.
    val scheme = lightColorScheme(
        primary = colors.accent,
        onPrimary = Color.White,
        background = colors.background,
        onBackground = colors.text,
        surface = colors.surface,
        onSurface = colors.text,
        surfaceVariant = colors.surface,
        onSurfaceVariant = colors.text.copy(alpha = 0.6f),
        outlineVariant = colors.text.copy(alpha = 0.12f),
    )
    CompositionLocalProvider(LocalOakColors provides colors) {
        MaterialTheme(
            colorScheme = scheme,
            typography = Typography(),
            content = content,
        )
    }
}
