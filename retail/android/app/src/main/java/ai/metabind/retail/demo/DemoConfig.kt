/*
 * DemoConfig.kt.
 *
 * © 2026 Yap Studios LLC
 */
package ai.metabind.retail.demo

/**
 * Every externally-configurable value the demo needs, read from `BuildConfig` where
 * Gradle substituted it from `local.properties` (or the environment).
 *
 * Nothing identifying is compiled in. A clean clone builds and runs with the
 * placeholders, asks for an API key on launch, and shows the built-in starter prompts.
 * The Apple counterpart is `DemoConfig.swift` in `retail/apple`.
 */
object DemoConfig {
    /** Placeholders from the Gradle defaults. Treated as "unset" so an unconfigured
     *  build behaves like an empty one rather than trying to talk to a project
     *  literally named YOUR_PROJECT_ID. */
    private val placeholders = setOf("YOUR_ORG_ID", "YOUR_PROJECT_ID", "")

    private fun configured(value: String): String? =
        value.trim().takeUnless { it in placeholders }

    val orgId: String = configured(BuildConfig.RETAIL_DEMO_ORG_ID) ?: ""
    val projectId: String = configured(BuildConfig.RETAIL_DEMO_PROJECT_ID) ?: ""
    val agentHost: String = BuildConfig.RETAIL_DEMO_AGENT_HOST
    val mcpHost: String = BuildConfig.RETAIL_DEMO_MCP_HOST

    /** Optional, so a controlled demo build starts without setup. */
    val apiKey: String = BuildConfig.RETAIL_DEMO_API_KEY.trim()

    val isConfigured: Boolean get() = orgId.isNotEmpty() && projectId.isNotEmpty()
}
