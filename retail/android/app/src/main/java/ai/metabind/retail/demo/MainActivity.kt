/*
 * MainActivity.kt.
 *
 * © 2026 Yap Studios LLC
 */
package ai.metabind.retail.demo

import ai.metabind.retail.demo.ui.ChatScreen
import ai.metabind.retail.demo.ui.KeyEntryScreen
import ai.metabind.retail.demo.ui.theme.MetabindRetailDemoTheme
import ai.metabind.retail.demo.ui.theme.OakTheme
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Light system bars over the warm page colour, matching the iOS app's
        // forced light appearance.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(TRANSPARENT, TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(TRANSPARENT, TRANSPARENT),
        )
        setContent {
            MetabindRetailDemoTheme {
                RetailApp()
            }
        }
    }

    private companion object {
        const val TRANSPARENT = android.graphics.Color.TRANSPARENT
    }
}

/**
 * Key entry until there is a key, then the chat surface. Unlike the Finance demo this
 * app *is* a conversation — the transcript is the product.
 */
@Composable
private fun RetailApp(viewModel: RetailViewModel = hiltViewModel()) {
    when (val state = viewModel.state) {
        RetailViewModel.State.Loading -> Box(
            modifier = Modifier
                .fillMaxSize()
                .background(OakTheme.colors.background),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(color = OakTheme.colors.accent)
        }

        RetailViewModel.State.NeedsKey -> KeyEntryScreen(onStart = viewModel::start)

        is RetailViewModel.State.Ready -> ChatScreen(
            assistant = state.assistant,
            onResetApiKey = viewModel::resetApiKey,
        )
    }
}
