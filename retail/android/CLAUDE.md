# CLAUDE.md

Context for agents working in this directory. Read together with `README.md`
(user-facing) — this file is the developer/internals view.

This is the Android client of the `retail` demo (`retail/android`), a standalone
Gradle build depending on a published `metabind-android` release. Its siblings are
[`../apple`](../apple) — the Swift original — and [`../mcp`](../mcp), the MCP project
both clients talk to. When in doubt about *intent*, read the Swift app; the comments
there carry the reasoning behind most of the behavior, and this port preserves the
behavior while translating the mechanics.

## What this app is

A branded chat on the **`metabindai-android`** SDK (module `:metabindai`, package
`ai.metabind.ai`). The transcript is the product: prose streams in and tool results
render inline as Compose through BindJS. It is the counterpart to `finance/android`,
which has no transcript at all.

It exists to demo a **custom** surface over `MetabindAssistant` — the SDK repo's
`samples/assistant-demo` is the drop-in `MetabindAssistantView` instead. Everything
here is about keeping the store's visual language while the SDK does the work.

## SDK dependency

This is an integrator's build: `ai.metabind:metabindai-android` is resolved as a
**published** artifact, pinned as `metabindAssistant` in
`gradle/libs.versions.toml`. `mcpappshost-android` and `bindjs-android` come in
transitively. All three resolve from GitHub Packages, which requires credentials
even for a public read.

There are no SDK sources in this tree. To read or edit them, clone
`metabind-android` and uncomment the composite build at the bottom of
`settings.gradle.kts` — it substitutes `:metabindai` and `:mcpappshost` for the
published modules. Don't commit that override: the demo pins releases.

Keep AGP / Kotlin in `gradle/libs.versions.toml` in step with `finance/android`;
they share the SDK and the same GitHub Packages repo.

## Module / package layout

```
app/src/main/java/ai/metabind/retail/demo/
  MainActivity.kt          — Loading → KeyEntryScreen → ChatScreen, no nav stack
  MetabindRetailDemoApp.kt — Hilt @HiltAndroidApp entry
  RetailViewModel.kt       — owns the MetabindAssistant; start / resetApiKey
  DemoConfig.kt            — BuildConfig with placeholder handling (mirrors DemoConfig.swift)
  data/ApiKeyRepository.kt — DataStore; sticky reset so a configured key stays reset
  ui/theme/OakTheme.kt     — palette + `Modifier.oakCard()` (the iOS oakCardShadow)
  ui/KeyEntryScreen.kt     — RootView.keyEntry
  ui/StarterScreen.kt      — greeting + bento cards, content held as data
  ui/ChatScreen.kt         — ChatView: title bar, transcript, fade, pill input
  ui/MessageRow.kt         — MessageRow + ThinkingIndicator; MetabindToolView cards
```

## Porting notes

- Light only, like iOS (`.preferredColorScheme(.light)`); the dark palette is kept
  in `OakTheme.kt` for parity but never selected.
- The starter screen is hard-coded content on both platforms: the "Home Page
  Suggestions" item from the Oak&Ivory CMS, with the images bundled in
  `res/drawable-nodpi`. Keep `starterContent` in step with `StarterScreen.swift`.
- Follow-up suggestion chips (`SuggestionService`) are off by default on iOS and
  not ported.
- Config keys are `RETAIL_DEMO_*` in `local.properties`, one-to-one with the iOS
  `Local.xcconfig`, plus `RETAIL_DEMO_API_KEY` for a preconfigured demo key.
- Data-only tool calls get no row: the SDK only creates `toolUIContent` for tools
  that declared a `ui` resource, and `MessageRow` renders nothing for the rest.

## Build / run

```sh
./gradlew :app:installDebug
adb shell am start -n ai.metabind.retail.demo/.MainActivity
```

`local.properties` (gitignored) feeds BuildConfig: `RETAIL_DEMO_ORG_ID`,
`RETAIL_DEMO_PROJECT_ID`, optional `RETAIL_DEMO_API_KEY`,
`RETAIL_DEMO_AGENT_HOST`, `RETAIL_DEMO_MCP_HOST`. The GitHub Packages repo in
`settings.gradle.kts` needs `gpr.user` / `gpr.key` (or `GITHUB_ACTOR` /
`GITHUB_TOKEN`); nothing resolves without it.

For the JS ↔ Kotlin bridge internals and the logcat tags worth watching, see
`samples/assistant-demo/CLAUDE.md` in the `metabind-android` repo — the same
machinery applies verbatim here.
