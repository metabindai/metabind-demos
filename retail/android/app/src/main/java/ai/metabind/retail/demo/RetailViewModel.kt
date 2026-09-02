/*
 * RetailViewModel.kt.
 *
 * © 2026 Yap Studios LLC
 */
package ai.metabind.retail.demo

import ai.metabind.ai.MetabindAssistant
import ai.metabind.retail.demo.data.ApiKeyRepository
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Owns the assistant so it outlives configuration changes and a reply in flight
 * isn't lost to a rotation. The Apple counterpart is `RootView.swift`.
 */
@HiltViewModel
class RetailViewModel @Inject constructor(
    private val apiKeyRepository: ApiKeyRepository,
) : ViewModel() {

    sealed interface State {
        /** Reading the stored key. Brief, but not instant — DataStore is off-thread. */
        data object Loading : State
        data object NeedsKey : State
        data class Ready(val assistant: MetabindAssistant) : State
    }

    var state by mutableStateOf<State>(State.Loading)
        private set

    private var assistant: MetabindAssistant? = null

    init {
        viewModelScope.launch {
            val key = apiKeyRepository.initialKey()
            if (key.isBlank() || !DemoConfig.isConfigured) state = State.NeedsKey else start(key)
        }
    }

    /** Persist [key] and stand up an assistant on it. */
    fun start(key: String) {
        val trimmed = key.trim()
        if (trimmed.isEmpty() || !DemoConfig.isConfigured) return
        viewModelScope.launch {
            apiKeyRepository.save(trimmed)
            release()
            // One Metabind API key authenticates against both the agent proxy and the
            // MCP server — one key, two endpoints. The proxy holds the upstream
            // model-provider credentials, so no LLM key ever reaches the app.
            val created = MetabindAssistant(
                apiKey = trimmed,
                orgId = DemoConfig.orgId,
                projectId = DemoConfig.projectId,
                agentHost = DemoConfig.agentHost,
                mcpHost = DemoConfig.mcpHost,
            )
            assistant = created
            state = State.Ready(created)
        }
    }

    /** Forgets the key and drops back to the entry screen. The reset is sticky. */
    fun resetApiKey() {
        viewModelScope.launch {
            apiKeyRepository.reset()
            release()
            state = State.NeedsKey
        }
    }

    private fun release() {
        assistant?.close()
        assistant = null
    }

    override fun onCleared() {
        release()
    }
}
