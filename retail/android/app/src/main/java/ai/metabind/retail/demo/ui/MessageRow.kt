/*
 * MessageRow.kt.
 *
 * © 2026 Yap Studios LLC
 */
package ai.metabind.retail.demo.ui

import ai.metabind.ai.ChatMessage
import ai.metabind.ai.MessageRole
import ai.metabind.ai.MetabindAssistant
import ai.metabind.ai.MetabindToolView
import ai.metabind.ai.ToolStatus
import ai.metabind.ai.ToolUIContent
import ai.metabind.retail.demo.R
import ai.metabind.retail.demo.ui.theme.OakTheme
import ai.metabind.retail.demo.ui.theme.oakCard
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.halilibo.richtext.commonmark.Markdown
import com.halilibo.richtext.ui.material3.RichText
import kotlin.math.PI
import kotlin.math.sin

/**
 * Renders one [ChatMessage] in the Oak&Ivory style: user messages as right-aligned
 * white pills, assistant text as plain copy, and tool calls as full-width white
 * surface cards hosting the BindJS render. Port of `MessageRow.swift`.
 */
@Composable
fun MessageRow(
    assistant: MetabindAssistant,
    message: ChatMessage,
    content: ToolUIContent?,
    onSendMessage: (String) -> Unit,
) {
    val rowPadding = Modifier
        .fillMaxWidth()
        .padding(horizontal = OakTheme.pageMargin)
    when (message.role) {
        MessageRole.USER -> UserBubble(message.content, rowPadding)
        MessageRole.ASSISTANT -> AssistantBubble(message.content, rowPadding)
        MessageRole.ERROR -> ErrorBubble(message.content, rowPadding)
        MessageRole.TOOL -> ToolCard(assistant, message, content, onSendMessage, rowPadding)
    }
}

// MARK: - User

@Composable
private fun UserBubble(text: String, modifier: Modifier) {
    val colors = OakTheme.colors
    Row(modifier = modifier, horizontalArrangement = Arrangement.End) {
        Spacer(modifier = Modifier.width(40.dp))
        Text(
            text = text,
            style = OakTheme.body(17).copy(lineHeight = 25.sp),
            color = colors.text,
            modifier = Modifier
                .weight(1f, fill = false)
                .oakCard(OakTheme.bubbleShape)
                .padding(horizontal = 18.dp, vertical = 14.dp),
        )
    }
}

// MARK: - Assistant text

@Composable
private fun AssistantBubble(text: String, modifier: Modifier) {
    if (text.isEmpty()) return
    val colors = OakTheme.colors
    Box(modifier = modifier) {
        CompositionLocalProvider(
            LocalContentColor provides colors.text,
            LocalTextStyle provides OakTheme.body(17).copy(color = colors.text, lineHeight = 26.sp),
        ) {
            RichText(modifier = Modifier.fillMaxWidth()) {
                Markdown(text)
            }
        }
    }
}

// MARK: - Error

@Composable
private fun ErrorBubble(text: String, modifier: Modifier) {
    Box(modifier = modifier) {
        Text(
            text = text,
            style = OakTheme.body(15),
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier
                .fillMaxWidth()
                .oakCard(OakTheme.bubbleShape)
                .padding(horizontal = 18.dp, vertical = 14.dp),
        )
    }
}

// MARK: - Tool render

/**
 * Data-only tool calls (no BindJS UI resource) are model-internal bookkeeping —
 * showing them would turn the stream into a debug log, so they get no row at all.
 * The SDK only creates `toolUIContent` for tools that declared a `ui` resource,
 * which is exactly the filter we want.
 */
@Composable
private fun ToolCard(
    assistant: MetabindAssistant,
    message: ChatMessage,
    content: ToolUIContent?,
    onSendMessage: (String) -> Unit,
    modifier: Modifier,
) {
    val colors = OakTheme.colors
    if (content == null) {
        // Nothing to render yet. While the resource is still on its way in, hold the
        // slot with the loading pill so the card doesn't pop in from nowhere.
        if (message.toolStatus == ToolStatus.LOADING) {
            Box(modifier = modifier) { ToolLoadingPill(message.toolName) }
        }
        return
    }
    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .oakCard(),
        ) {
            MetabindToolView(
                assistant = assistant,
                toolName = message.toolName ?: "",
                content = content,
                onSendMessage = onSendMessage,
                placeholder = { ToolLoadingPill(message.toolName, inCard = true) },
            )
        }
    }
}

@Composable
private fun ToolLoadingPill(toolName: String?, inCard: Boolean = false) {
    val colors = OakTheme.colors
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .then(if (inCard) Modifier else Modifier.oakCard())
            .padding(horizontal = 18.dp, vertical = 16.dp),
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(16.dp),
            strokeWidth = 2.dp,
            color = colors.text.copy(alpha = 0.6f),
        )
        Text(
            text = prettyToolName(toolName.orEmpty()),
            style = OakTheme.body(15),
            color = colors.text.copy(alpha = 0.55f),
        )
    }
}

private fun prettyToolName(raw: String): String =
    raw.split('_', ' ')
        .filter { it.isNotEmpty() }
        .joinToString(" ") { it.replaceFirstChar(Char::uppercase) }

// MARK: - Streaming indicator

/** Three dots breathing in a sine ripple, in a small surface pill. */
@Composable
fun ThinkingIndicator() {
    val colors = OakTheme.colors
    val label = stringResource(R.string.thinking)
    val transition = rememberInfiniteTransition(label = "thinking")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "phase",
    )
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .oakCard(OakTheme.bubbleShape)
            .padding(horizontal = 18.dp, vertical = 14.dp)
            .semantics { contentDescription = label },
    ) {
        repeat(3) { i ->
            val stagger = i * (PI / 4).toFloat()
            Box(
                modifier = Modifier
                    .size(7.dp)
                    .graphicsLayer {
                        val s = 1f + sin((phase + stagger).toDouble()).toFloat() * 0.1f
                        scaleX = s
                        scaleY = s
                    }
                    .background(colors.text.copy(alpha = 0.35f), CircleShape),
            )
        }
    }
}
