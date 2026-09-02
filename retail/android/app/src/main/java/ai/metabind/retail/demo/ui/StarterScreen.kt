/*
 * StarterScreen.kt.
 *
 * © 2026 Yap Studios LLC
 */
package ai.metabind.retail.demo.ui

import ai.metabind.retail.demo.R
import ai.metabind.retail.demo.ui.theme.OakTheme
import ai.metabind.retail.demo.ui.theme.oakCard
import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The empty state, before the first question: a greeting and three bento cards, each
 * carrying the prompt it sends when tapped.
 *
 * The content — copy, prompts, palette and imagery — is the "Home Page Suggestions"
 * item from the Oak & Ivory CMS project, hard-coded here (as in `StarterScreen.swift`)
 * so the demo has no content-project dependency; see [starterContent].
 */
@Composable
fun StarterScreen(
    onSend: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = OakTheme.pageMargin)
            .padding(top = 8.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        starterContent.forEach { block ->
            when (block) {
                is StarterBlock.Subheader -> ContentSubheader(block)
                is StarterBlock.Bento -> BentoCard(block, onTap = { onSend(block.prompt) })
            }
        }
    }
}

// MARK: - Content model (mirrors the CMS component instances)

sealed interface StarterBlock {
    /** `ContentSubheader` */
    data class Subheader(val title: String, val subtitle: String) : StarterBlock

    /** `BentoCard` */
    data class Bento(
        val title: String,
        val description: String,
        val prompt: String,
        val items: List<BentoItem>,
    ) : StarterBlock
}

sealed interface BentoItem {
    data class Swatch(val color: Color, val title: String? = null) : BentoItem
    data class Picture(@param:DrawableRes val drawable: Int, val title: String) : BentoItem
}

/**
 * "Home Page Suggestions", version 20. Image assets are the CMS originals, bundled in
 * `res/drawable-nodpi` (resized to 1000px, webp) — the `imageUrl`s they came from are
 * noted beside each one.
 */
val starterContent: List<StarterBlock> = listOf(
    StarterBlock.Subheader(
        title = "Welcome back, Joe",
        subtitle = "A few thoughtful ways to continue shaping your space.",
    ),
    StarterBlock.Bento(
        title = "Continue exploring palettes you love",
        description = "Revisit tones and combinations that fit your style.",
        prompt = "Shop for products using palettes from past projects",
        items = listOf(
            BentoItem.Swatch(Color(0xFF4A5240), "Green"),
            BentoItem.Swatch(Color(0xFFC9A45A), "Brown 1"),
            BentoItem.Swatch(Color(0xFFE8DCC8)),
            BentoItem.Swatch(Color(0xFF444444), "Charcoal"),
        ),
    ),
    StarterBlock.Bento(
        title = "Pick up where you left off",
        description = "Continue shopping the pieces you’ve been considering.",
        prompt = "Start a design based on products I've purchased",
        items = listOf(
            // …/uWBJD94e5rli7x45UMBw/4zNpljnwaCR2MbtS9mRX__003-an-oak-ivory-brand-coffee-table-high-end.jpg
            BentoItem.Picture(R.drawable.oi_starter_pebble_coffee_table, "Pebble Round Coffee Table"),
            // …/Oibpyx3F7nuKQP2vDrba/QZhYPftn0yk37E6SV1Iq__lumora-pendant-light.png
            BentoItem.Picture(R.drawable.oi_starter_lumora_pendant, "Lumora Pendant Light"),
            // …/Cfk7aiY1ynY7l3HNzaY5/cDEXR2PlQ2TI5q3UJVfp__005-an-elegant-mid-century-modern-credenza-s.jpg
            BentoItem.Picture(R.drawable.oi_starter_viksund_credenza, "Viksund Teak Credenza"),
        ),
    ),
    StarterBlock.Bento(
        title = "A space imagined just for you",
        description = "Explore a design tailored to your style and home",
        prompt = "Shop for products using themes I like",
        items = listOf(
            // …/GiOJSEGechQgSMx9Ued3/Tf0Z3FKK3lKJMDcH1crj__reference-contemporary-lounge.png
            BentoItem.Picture(R.drawable.oi_starter_contemporary_lounge, "Contemporary"),
        ),
    ),
)

// MARK: - Components

@Composable
private fun ContentSubheader(block: StarterBlock.Subheader) {
    val colors = OakTheme.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp, bottom = 2.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = block.title,
            style = OakTheme.wordmark(24),
            color = colors.text,
        )
        Text(
            text = block.subtitle,
            style = OakTheme.body(17).copy(lineHeight = 24.sp),
            color = colors.text.copy(alpha = 0.85f),
        )
    }
}

/**
 * A white card: title, description, then a fixed-height bento grid of the items.
 * The whole card is the tap target and sends the card's prompt.
 */
@Composable
private fun BentoCard(block: StarterBlock.Bento, onTap: () -> Unit) {
    val colors = OakTheme.colors
    val hint = stringResource(R.string.starter_hint)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .oakCard()
            .clickable(onClick = onTap)
            .semantics { onClick(label = hint, action = null) }
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = block.title,
            style = OakTheme.body(20).copy(fontWeight = FontWeight.SemiBold),
            color = colors.text,
        )
        Text(
            text = block.description,
            style = OakTheme.body(17).copy(lineHeight = 24.sp),
            color = colors.text.copy(alpha = 0.5f),
        )
        if (block.items.isNotEmpty()) {
            BentoGrid(
                items = block.items,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp)
                    .height(BentoHeight),
            )
        }
    }
}

private val BentoHeight = 160.dp
private val BentoGap = 8.dp
private val TileShape = RoundedCornerShape(12.dp)

/**
 * The bento arrangements from the design, keyed by item count:
 *
 * - 1: one full-bleed tile
 * - 2: side by side
 * - 3: one tall tile on the left, two stacked on the right
 * - 4+: left 4/7 — a wide tile over two small ones; right 3/7 — one tall tile
 *
 * Anything beyond the fourth item is dropped rather than squeezed in.
 */
@Composable
private fun BentoGrid(items: List<BentoItem>, modifier: Modifier = Modifier) {
    when (items.size) {
        1 -> Tile(items[0], modifier)
        2 -> Row(modifier, horizontalArrangement = Arrangement.spacedBy(BentoGap)) {
            Tile(items[0], Modifier.weight(1f).fillMaxSize())
            Tile(items[1], Modifier.weight(1f).fillMaxSize())
        }
        3 -> Row(modifier, horizontalArrangement = Arrangement.spacedBy(BentoGap)) {
            Tile(items[0], Modifier.weight(1f).fillMaxSize())
            Column(Modifier.weight(1f).fillMaxSize(), verticalArrangement = Arrangement.spacedBy(BentoGap)) {
                Tile(items[1], Modifier.weight(1f).fillMaxWidth())
                Tile(items[2], Modifier.weight(1f).fillMaxWidth())
            }
        }
        else -> Row(modifier, horizontalArrangement = Arrangement.spacedBy(BentoGap)) {
            Column(Modifier.weight(4f).fillMaxSize(), verticalArrangement = Arrangement.spacedBy(BentoGap)) {
                Tile(items[0], Modifier.weight(1f).fillMaxWidth())
                Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(BentoGap)) {
                    Tile(items[1], Modifier.weight(1f).fillMaxSize())
                    Tile(items[2], Modifier.weight(1f).fillMaxSize())
                }
            }
            Tile(items[3], Modifier.weight(3f).fillMaxSize())
        }
    }
}

@Composable
private fun Tile(item: BentoItem, modifier: Modifier) {
    when (item) {
        is BentoItem.Swatch -> androidx.compose.foundation.layout.Box(
            modifier = modifier
                .clip(TileShape)
                .background(item.color),
        )

        is BentoItem.Picture -> Image(
            painter = painterResource(item.drawable),
            contentDescription = item.title,
            contentScale = ContentScale.Crop,
            modifier = modifier.clip(TileShape),
        )
    }
}
