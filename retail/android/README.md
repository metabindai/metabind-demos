# Metabind Retail demo (Android)

Oak&Ivory — a furniture store's shopping assistant, built on
[`metabindai-android`](https://github.com/metabindai/metabind-android), Metabind's
governed conversational AI runtime. The Jetpack Compose counterpart to
[the Apple client](../apple).

This is a **conversation**. The transcript is the product: you ask about a chair,
the assistant answers in prose and renders product cards, comparisons and room
designs inline as native Compose through BindJS. That makes it the counterpart to
[the Finance demo](../../finance), which deliberately has no transcript at all.

## Data and backend

The Retail MCP project lives alongside this client in [`../mcp`](../mcp). Before
running the app, install it into your own Metabind organization —
[Part 1 of the demo tutorial](../README.md#part-1--install-the-mcp-project)
walks through it — and configure this client with that organization's stable
internal ID and the installed project's ID.

Oak&Ivory is a fictional store, but the MCP project is not self-contained: its
tools read a hosted, public demo catalogue and need secrets bound before they
work. [The MCP project's README](../mcp/README.md#it-is-not-self-contained)
explains what it reaches and how to point it at your own catalogue instead.

## What it does

1. Connects to the Metabind Agent proxy and your Retail project's MCP server.
2. Streams assistant responses and renders MCP App tool results as native Compose
   through BindJS — product cards, colour and product pickers, room designs.
3. Opens on a starter screen: a greeting and three bento cards, each sending a
   prompt when tapped.
4. Stores a user-entered or configured Metabind API key in Jetpack DataStore.

The Metabind Agent proxy holds the upstream model-provider credentials and runs the
tool-use loop. The app never needs an Anthropic or other LLM provider key. One
Metabind API key authenticates both the agent proxy and the MCP server.

## Requirements

- Android Studio (AGP 9.3.1 / Gradle 9.6.1), JDK 17+
- `compileSdk` 36, `minSdk` 26
- A device or emulator with the **WebView JavaScript Sandbox** available — BindJS
  runs component code in `androidx.javascriptengine`
- A Retail MCP project installed into your own Metabind organization
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

   RETAIL_DEMO_ORG_ID=your_stable_internal_org_id
   RETAIL_DEMO_PROJECT_ID=your_project_id
   RETAIL_DEMO_API_KEY=
   ```

   - `RETAIL_DEMO_ORG_ID` must be the stable internal ID, not an organization
     slug.
   - `RETAIL_DEMO_API_KEY` is optional. Leave it empty to enter the key on first
     launch. Set it only for a controlled demo build that should start without
     setup.
   - Every value can also come from an environment variable of the same name,
     which is what CI should use.

`local.properties` is gitignored. Do not commit it.

> [!WARNING]
> A value supplied through `RETAIL_DEMO_API_KEY` is compiled into `BuildConfig`
> and is recoverable from a distributed APK. Marking it secret in CI protects build
> logs and configuration, but it does not make the key secret inside the app. Use
> only a restricted, revocable demo key. For a production app, issue short-lived
> user credentials from a backend instead of embedding a shared key.

## Run

```sh
./gradlew :app:installDebug
adb shell am start -n ai.metabind.retail.demo/.MainActivity
```

The build depends on the tagged `metabind-android` release pinned as
`metabindAssistant` in [`gradle/libs.versions.toml`](gradle/libs.versions.toml). To
develop against a local SDK checkout instead, uncomment the composite build in
[`settings.gradle.kts`](settings.gradle.kts) and point it at your `metabind-android`
directory. Don't commit that override.

If no API key is configured, enter one on the launch screen and tap **Start**. Tap
a starter card or type a question. **✕** (or Back) clears the conversation and
returns to the starter screen.

The key is stored in DataStore, scoped to the app's private storage, so
uninstalling clears it. Use **Profile > Reset API Key** to clear it in place. The
reset is sticky, so a relaunch won't quietly reinstate a key configured into the
build.

## How it works

The integration is one constructor call in
[`RetailViewModel`](app/src/main/java/ai/metabind/retail/demo/RetailViewModel.kt):

```kotlin
val assistant = MetabindAssistant(
    apiKey = trimmed,
    orgId = DemoConfig.orgId,
    projectId = DemoConfig.projectId,
    agentHost = DemoConfig.agentHost,
    mcpHost = DemoConfig.mcpHost,
)
```

`MetabindAssistant` handles tool discovery, the server-side conversation loop,
streaming, and interactive rendering. The SDK's drop-in conversational surface is:

```kotlin
MetabindAssistantView(assistant = assistant)
```

Oak&Ivory doesn't use it.
[`ChatScreen`](app/src/main/java/ai/metabind/retail/demo/ui/ChatScreen.kt) composes
against the same state — `assistant.messages`, `assistant.isLoading`,
`assistant.toolUIContent` — so the visual language stays on-brand: store
typography, card shadows, the pill input bar. Tool results render through
`MetabindToolView` exactly as the stock view renders them. If you don't need custom
branding, use `MetabindAssistantView` and delete most of this app.

- **Data-only tool calls are hidden.** The SDK only produces `toolUIContent` for
  tools that declared a `ui` resource;
  [`MessageRow`](app/src/main/java/ai/metabind/retail/demo/ui/MessageRow.kt)
  renders nothing for the rest.
- **The starter screen is plain Compose.**
  [`StarterScreen`](app/src/main/java/ai/metabind/retail/demo/ui/StarterScreen.kt)
  holds the greeting and the bento cards as data; edit `starterContent` to change
  the opening prompts, copy, or imagery. The images are bundled in
  `res/drawable-nodpi`.

## Differences from the Apple version

Same architecture and behavior; the platform-specific parts are translated rather
than copied.

| Apple | Android |
|---|---|
| Keychain (survives app deletion) | Jetpack DataStore (cleared on uninstall) |
| iOS 26 liquid-glass input bar | The iOS app's styled fallback: surface colour under a soft shadow |
| `AttributedString(markdown:)` for assistant prose | `compose-richtext` Markdown |
| Follow-up suggestion chips (`SuggestionService`, off by default) | Not ported |
| SF Symbols | Vector drawables |

## Where to next

- [`../mcp`](../mcp) — the Retail MCP project this client talks to.
- [`../apple`](../apple) — the same demo on iOS.
- [metabind-android](https://github.com/metabindai/metabind-android) — the SDK:
  installation, API reference, and the `assistant-demo` sample behind the drop-in
  `MetabindAssistantView` surface.
- [Metabind](https://metabind.ai) — create and manage MCP Apps.

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
