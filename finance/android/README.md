# Metabind Finance demo (Android)

A configurable Jetpack Compose reference app built on
[`metabindai-android`](https://github.com/metabindai/metabind-android), Metabind's
governed conversational AI runtime. The Android counterpart to
[the Apple client](../apple).

The app asks one question on launch and uses the rendered MCP result as its home
screen. Later questions come from the pill rail at the bottom and open in a sheet.
There is no transcript and no navigation stack: assistant turns are routed to
purpose-built surfaces instead of a message list.

## Data and backend

The Finance MCP project lives alongside this client in [`../mcp`](../mcp). Before
running the app, install it into your own Metabind organization —
[Part 1 of the demo tutorial](../README.md#part-1--install-the-mcp-project)
walks through it — and configure this client with that organization's stable
internal ID and the installed project's ID.

The supplied Finance MCP project uses synthetic financial data, such as sample
transactions, spending categories, balances, and net-worth history. The app does
not connect to real financial accounts unless you replace that backend with one
that does. The agent should explain and render data returned by the MCP tools
rather than inventing financial records.

## What it does

1. Connects to the Metabind Agent proxy and your Finance project's MCP server.
2. Streams governed assistant responses and renders MCP App tool results as native
   Compose through BindJS.
3. Displays multiple tool results from one turn as tabs.
4. Routes each turn to a UI surface through
   [`AnswerRouter`](app/src/main/java/ai/metabind/finance/demo/ui/AnswerRouter.kt).
5. Stores a user-entered or configured Metabind API key in Jetpack DataStore.

The Metabind Agent proxy holds the upstream model-provider credentials and runs the
tool-use loop. The app never needs an Anthropic or other LLM provider key. One
Metabind API key authenticates both the agent proxy and the MCP server.

## Requirements

- Android Studio (AGP 9.3.1 / Gradle 9.6.1), JDK 17+
- `compileSdk` 36, `minSdk` 26
- A device or emulator with the **WebView JavaScript Sandbox** available — BindJS
  runs component code in `androidx.javascriptengine`
- A Finance MCP project installed into your own Metabind organization
- A Metabind API key authorized for that organization and project
- GitHub Packages credentials (`gpr.user` / `gpr.key` Gradle properties, or
  `GITHUB_ACTOR` / `GITHUB_TOKEN` env vars). GitHub Packages requires
  authentication even for public reads, and both the Metabind libraries and their
  BindJS dependency resolve from there.

## Configure a local build

1. Copy the public template to the ignored local configuration file:

   ```sh
   cp local.properties.example local.properties
   ```

2. Fill in the values:

   ```properties
   sdk.dir=/Users/you/Library/Android/sdk

   FINANCE_DEMO_ORG_ID=your_stable_internal_org_id
   FINANCE_DEMO_PROJECT_ID=your_project_id
   FINANCE_DEMO_API_KEY=
   ```

   - `FINANCE_DEMO_ORG_ID` must be the stable internal ID, not an organization
     slug.
   - `FINANCE_DEMO_API_KEY` is optional. Leave it empty to enter the key on first
     launch. Set it only for a controlled demo build that should start without
     setup.
   - Every value can also come from an environment variable of the same name,
     which is what CI should use.

`local.properties` is gitignored. Do not commit it.

> [!WARNING]
> A value supplied through `FINANCE_DEMO_API_KEY` is compiled into `BuildConfig`
> and is recoverable from a distributed APK. Marking it secret in CI protects build
> logs and configuration, but it does not make the key secret inside the app. Use
> only a restricted, revocable demo key. For a production app, issue short-lived
> user credentials from a backend instead of embedding a shared key.

## Run

```sh
./gradlew :app:installDebug
adb shell am start -n ai.metabind.finance.demo/.MainActivity
```

The build depends on the tagged `metabind-android` release pinned as
`metabindAssistant` in [`gradle/libs.versions.toml`](gradle/libs.versions.toml). To
develop against a local SDK checkout instead, uncomment the composite build in
[`settings.gradle.kts`](settings.gradle.kts) and point it at your `metabind-android`
directory. Don't commit that override.

If no API key is configured, enter one on the launch screen and tap **Start**. The
home screen loads by asking _"Where did my money go this month?"_. Tap a suggested
follow-up or **Ask anything** to start another turn.

The key is stored in DataStore, scoped to the app's private storage, so
uninstalling clears it. Use **⋮ > Reset API Key** to clear it in place. The reset is
sticky, so a relaunch won't quietly reinstate a key configured into the build.

## How it works

The integration is three lines in
[`FinanceViewModel`](app/src/main/java/ai/metabind/finance/demo/FinanceViewModel.kt):

```kotlin
val assistant = MetabindAssistant(
    apiKey = trimmed,
    orgId = BuildConfig.FINANCE_DEMO_ORG_ID,
    projectId = BuildConfig.FINANCE_DEMO_PROJECT_ID,
    agentHost = BuildConfig.FINANCE_DEMO_AGENT_HOST,
    mcpHost = BuildConfig.FINANCE_DEMO_MCP_HOST,
)
```

`MetabindAssistant` handles tool discovery, the server-side conversation loop,
streaming, and interactive rendering. The SDK's drop-in conversational surface is:

```kotlin
MetabindAssistantView(assistant = assistant)
```

FinanceDemo instead observes `assistant.messages` / `assistant.isLoading` /
`assistant.toolUIContent` and uses
[`AnswerRouter`](app/src/main/java/ai/metabind/finance/demo/ui/AnswerRouter.kt) to
decide where each turn lands. Tool cards render through `MetabindToolView`, exactly
as they do in the drop-in view.

A custom surface also has to:

- Snapshot each delivered answer's prose and cards. `assistant.reset()` — which is
  what closing the sheet does — clears the conversation and the tool-UI map, and an
  answer still on screen must survive that.
- Wait for a tool's `ui://` resource to resolve before presenting the sheet, or it
  slides up over an empty card.
- Adopt turns it didn't start. A rendered component calling `host.sendMessage`
  lands straight on the assistant, and that turn needs somewhere to go.

## Differences from the Apple version

Same architecture and behavior; the platform-specific parts are translated rather
than copied.

| Apple | Android |
|---|---|
| Keychain (survives app deletion) | Jetpack DataStore (cleared on uninstall) |
| iOS 26 liquid glass, `glassEffectID` pill→bubble morphing | Translucent surfaces with hairline borders; a directional `AnimatedContent` transition |
| `presentationDetents([.medium, .large])` | One full-height `ModalBottomSheet` — Material's partial state translates the content down, which would put the pinned ask bar below the screen |
| `onDisplayMode` host handler pushes the sheet to `.large` | No display-mode channel in bindjs on Android |
| "Reset Cache" menu item | Omitted — the Android assistant reads each tool's `ui://` resource fresh, so there is no cache to drop |
| `assistant.nextSteps` | Read off each card's tool arguments and held per answer, so the chips offer the suggestions belonging to the answer you're looking at |
| `AttributedString(markdown:)` + a custom `FlowLayout` | A small inline-markdown parser + `FlowRow` |
| SF Symbols | Vector drawables, keyed by the same SF Symbol names the server instructions use |

## Where to next

- [`../mcp`](../mcp) — the Finance MCP project this client talks to.
- [`../apple`](../apple) — the same demo on iOS.
- [metabind-android](https://github.com/metabindai/metabind-android) — the SDK:
  installation, API reference, and the `assistant-demo` sample behind the drop-in
  `MetabindAssistantView` surface.
- [Metabind](https://metabind.ai) — create and manage MCP Apps.

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
