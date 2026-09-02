/*
 * KeyEntryScreen.kt.
 *
 * © 2026 Yap Studios LLC
 */
package ai.metabind.retail.demo.ui

import ai.metabind.retail.demo.DemoConfig
import ai.metabind.retail.demo.R
import ai.metabind.retail.demo.ui.theme.OakTheme
import ai.metabind.retail.demo.ui.theme.oakCard
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/** The launch screen: wordmark, one secure field, Start. Mirrors `RootView.keyEntry`. */
@Composable
fun KeyEntryScreen(
    onStart: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = OakTheme.colors
    var apiKey by rememberSaveable { mutableStateOf("") }
    val canStart = apiKey.isNotBlank() && DemoConfig.isConfigured
    val submit = { if (canStart) onStart(apiKey) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .imePadding(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.wordmark),
                style = OakTheme.wordmark(34),
                color = colors.text,
            )
            Text(
                text = stringResource(R.string.key_entry_title),
                style = OakTheme.body(17),
                color = colors.text.copy(alpha = 0.75f),
            )
            Text(
                text = stringResource(R.string.key_entry_subtitle),
                style = OakTheme.body(14),
                color = colors.text.copy(alpha = 0.5f),
                textAlign = TextAlign.Center,
            )
            TextField(
                value = apiKey,
                onValueChange = { apiKey = it },
                placeholder = {
                    Text(
                        text = stringResource(R.string.key_entry_placeholder),
                        style = OakTheme.body(16),
                        color = colors.text.copy(alpha = 0.35f),
                    )
                },
                textStyle = OakTheme.body(16).copy(color = colors.text),
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                singleLine = true,
                shape = OakTheme.bubbleShape,
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = colors.surface,
                    unfocusedContainerColor = colors.surface,
                    disabledContainerColor = colors.surface,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    disabledIndicatorColor = Color.Transparent,
                    cursorColor = colors.accent,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 360.dp)
                    .oakCard(OakTheme.bubbleShape),
            )
            Button(
                onClick = submit,
                enabled = canStart,
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = colors.accent,
                    contentColor = Color.White,
                    disabledContainerColor = colors.accent.copy(alpha = 0.35f),
                    disabledContentColor = Color.White,
                ),
            ) {
                Text(
                    text = stringResource(R.string.key_entry_start),
                    style = OakTheme.body(16),
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                )
            }
            if (!DemoConfig.isConfigured) {
                Text(
                    text = stringResource(R.string.key_entry_unconfigured),
                    style = OakTheme.body(13),
                    color = colors.text.copy(alpha = 0.45f),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}
