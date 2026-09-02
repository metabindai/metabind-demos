/*
 * ChatScreen.kt.
 *
 * © 2026 Yap Studios LLC
 */
package ai.metabind.retail.demo.ui

import ai.metabind.ai.ChatMessage
import ai.metabind.ai.MessageRole
import ai.metabind.ai.MetabindAssistant
import ai.metabind.ai.ToolStatus
import ai.metabind.retail.demo.R
import ai.metabind.retail.demo.ui.theme.OakTheme
import ai.metabind.retail.demo.ui.theme.oakCard
import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp

/**
 * The Oak&Ivory branded chat surface — composed directly against
 * [MetabindAssistant]'s flows rather than the SDK's stock `MetabindAssistantView`,
 * so the visual language stays on-brand: store typography, card shadows, the pill
 * input bar. Tool results render through `MetabindToolView` exactly as the stock
 * view renders them. Port of `ChatView.swift`.
 */
@Composable
fun ChatScreen(
    assistant: MetabindAssistant,
    onResetApiKey: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = OakTheme.colors
    val allMessages by assistant.messages.collectAsState()
    val isLoading by assistant.isLoading.collectAsState()
    // metabindai-android 0.2.8 catches CancellationException in `send` and appends it
    // as an ERROR row ("StandaloneCoroutine was cancelled"). A stopped reply isn't an
    // error the shopper needs to read, so those rows are dropped here until the SDK fix
    // lands (MET-1422: rethrow CancellationException in send).
    val messages = remember(allMessages) { allMessages.filterNot { it.isCancellationNoise } }
    val toolUIContent by assistant.toolUIContent.collectAsState()
    val focusManager = LocalFocusManager.current
    val listState = rememberLazyListState()

    val isInChat = messages.isNotEmpty()
    // Back on the transcript clears it rather than leaving the app, mirroring ✕.
    BackHandler(enabled = isInChat) { assistant.reset() }

    val send: (String) -> Unit = remember(assistant) {
        { text ->
            assistant.send(text)
            focusManager.clearFocus()
        }
    }

    // Follow the conversation: a new message, a reply landing, or the thinking bubble
    // toggling all pull the list to its end.
    LaunchedEffect(messages.size, isLoading) {
        if (messages.isNotEmpty()) {
            val last = listState.layoutInfo.totalItemsCount - 1
            if (last >= 0) listState.animateScrollToItem(last)
        }
    }
    // Streaming prose grows the last item in place; keep it pinned while the user
    // hasn't scrolled away from the end.
    val streamingLength = messages.lastOrNull()?.content?.length ?: 0
    LaunchedEffect(streamingLength) {
        if (messages.isNotEmpty() && !listState.canScrollForward) {
            val last = listState.layoutInfo.totalItemsCount - 1
            if (last >= 0) listState.scrollToItem(last)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .imePadding(),
    ) {
        TitleBar(
            isInChat = isInChat,
            onNewConversation = { assistant.reset() },
            onResetApiKey = onResetApiKey,
        )

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 4.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (!isInChat) {
                    item(key = "starter") { StarterScreen(onSend = send) }
                } else {
                    items(messages, key = { it.id }) { message ->
                        MessageRow(
                            assistant = assistant,
                            message = message,
                            content = toolUIContent[message.id],
                            onSendMessage = send,
                        )
                    }
                    if (showsThinkingIndicator(isLoading, messages)) {
                        item(key = "thinking") {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = OakTheme.pageMargin),
                                contentAlignment = Alignment.CenterStart,
                            ) {
                                ThinkingIndicator()
                            }
                        }
                    }
                }
            }

            // Soft fade beneath the input bar so messages dissolve into the background
            // as they scroll past it instead of clipping hard.
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(32.dp)
                    .background(
                        Brush.verticalGradient(
                            listOf(colors.background.copy(alpha = 0f), colors.background),
                        ),
                    ),
            )
        }

        InputBar(
            isLoading = isLoading,
            onSend = send,
            onCancel = assistant::cancel,
        )
    }
}

/**
 * True while the assistant is generating and nothing visible has landed for the
 * latest turn yet: the user's prompt is the last row, or the reply / tool card is
 * still empty. Closes the blank-frame gap under a fresh user bubble.
 */
private val ChatMessage.isCancellationNoise: Boolean
    get() = role == MessageRole.ERROR && content.contains("cancelled", ignoreCase = true)

private fun showsThinkingIndicator(isLoading: Boolean, messages: List<ChatMessage>): Boolean {
    if (!isLoading) return false
    val last = messages.lastOrNull() ?: return true
    return when (last.role) {
        MessageRole.USER -> true
        MessageRole.ASSISTANT -> last.content.isEmpty()
        MessageRole.TOOL -> last.toolStatus == ToolStatus.LOADING
        MessageRole.ERROR -> false
    }
}

// MARK: - Title bar

@Composable
private fun TitleBar(
    isInChat: Boolean,
    onNewConversation: () -> Unit,
    onResetApiKey: () -> Unit,
) {
    val colors = OakTheme.colors
    var menuOpen by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))
            .padding(horizontal = 4.dp)
            .height(52.dp),
    ) {
        Box(modifier = Modifier.align(Alignment.CenterStart)) {
            IconButton(onClick = { menuOpen = true }) {
                Icon(
                    painter = painterResource(R.drawable.oi_ic_person),
                    contentDescription = stringResource(R.string.action_profile),
                    tint = colors.text,
                    modifier = Modifier.size(24.dp),
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = {
                        Text(
                            text = stringResource(R.string.menu_reset_api_key),
                            color = MaterialTheme.colorScheme.error,
                        )
                    },
                    leadingIcon = {
                        Icon(
                            painter = painterResource(R.drawable.oi_ic_key),
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(20.dp),
                        )
                    },
                    onClick = {
                        menuOpen = false
                        onResetApiKey()
                    },
                )
            }
        }

        Text(
            text = stringResource(R.string.wordmark),
            style = OakTheme.wordmark(22),
            color = colors.text,
            modifier = Modifier.align(Alignment.Center),
        )

        Row(modifier = Modifier.align(Alignment.CenterEnd)) {
            IconButton(onClick = { /* Cart is decorative in the demo, as on iOS. */ }) {
                Icon(
                    painter = painterResource(R.drawable.oi_ic_cart),
                    contentDescription = stringResource(R.string.action_cart),
                    tint = colors.text,
                    modifier = Modifier.size(22.dp),
                )
            }
            AnimatedVisibility(visible = isInChat, enter = fadeIn(), exit = fadeOut()) {
                IconButton(onClick = onNewConversation) {
                    Icon(
                        painter = painterResource(R.drawable.oi_ic_close),
                        contentDescription = stringResource(R.string.action_new_conversation),
                        tint = colors.text,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
        }
    }
}

// MARK: - Input

private const val StopGraceMillis = 700L

/**
 * The pill composer. Android has no Liquid Glass, so this is the iOS app's styled
 * fallback: the surface colour under a soft shadow. The send button doubles as stop
 * while a response is streaming, and only appears when there is something to do.
 */
@Composable
private fun InputBar(
    isLoading: Boolean,
    onSend: (String) -> Unit,
    onCancel: () -> Unit,
) {
    val colors = OakTheme.colors
    var text by rememberSaveable { mutableStateOf("") }
    val canSend = text.isNotBlank()
    val pill = RoundedCornerShape(26.dp)

    var lastSendAt by remember { mutableLongStateOf(0L) }

    val sendNow = {
        if (!isLoading && canSend) {
            lastSendAt = SystemClock.uptimeMillis()
            onSend(text.trim())
            text = ""
        }
    }
    // The round button doubles as stop while streaming, in the same spot the send
    // button just occupied — so a double tap (or a stray second click on the emulator)
    // would cancel the turn it started. Ignore stop for a beat after each send.
    val buttonTap = {
        if (isLoading) {
            if (SystemClock.uptimeMillis() - lastSendAt > StopGraceMillis) onCancel()
        } else {
            sendNow()
        }
    }

    Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(horizontal = OakTheme.pageMargin)
            .padding(top = 4.dp, bottom = 12.dp),
    ) {
        TextField(
            value = text,
            onValueChange = { text = it },
            placeholder = {
                Text(
                    text = stringResource(R.string.input_placeholder),
                    style = OakTheme.body(17),
                    color = colors.text.copy(alpha = 0.4f),
                )
            },
            textStyle = OakTheme.body(17).copy(color = colors.text),
            maxLines = 5,
            shape = pill,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = colors.surface,
                unfocusedContainerColor = colors.surface,
                disabledContainerColor = colors.surface,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                disabledIndicatorColor = Color.Transparent,
                cursorColor = colors.accent,
            ),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { sendNow() }),
            modifier = Modifier
                .weight(1f)
                .oakCard(pill)
                .onPreviewKeyEvent { event ->
                    // Emulators and tablets have real keyboards: Enter sends, like
                    // `onSubmit` on iOS; Shift+Enter still inserts a newline.
                    if (event.type == KeyEventType.KeyDown && event.key == Key.Enter && !event.isShiftPressed) {
                        sendNow()
                        true
                    } else {
                        false
                    }
                },
        )

        AnimatedVisibility(
            visible = canSend || isLoading,
            enter = fadeIn() + scaleIn(initialScale = 0.6f),
            exit = fadeOut() + scaleOut(targetScale = 0.6f),
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .padding(bottom = 6.dp)
                    .size(44.dp)
                    .oakCard(CircleShape)
                    .background(colors.accent)
                    .clickable(onClick = buttonTap),
            ) {
                Icon(
                    painter = painterResource(
                        if (isLoading) R.drawable.oi_ic_stop else R.drawable.oi_ic_arrow_upward,
                    ),
                    contentDescription = stringResource(
                        if (isLoading) R.string.action_stop else R.string.action_send,
                    ),
                    tint = Color.White,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}
