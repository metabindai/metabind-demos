# Metabind Retail demo (Apple)

Oak&Ivory — a furniture store's shopping assistant, built on
[`MetabindAI`](https://github.com/metabindai/metabind-apple), Metabind's governed
conversational AI runtime.

This is a **conversation**. The transcript is the product: you ask about a chair,
the assistant answers in prose and renders product cards, comparisons and room
designs inline as native SwiftUI. That makes it the counterpart to
[the Finance demo](../../finance/apple), which deliberately has no transcript at
all and routes each turn onto a purpose-built surface. Same SDK, opposite shape —
read both before deciding which one your product is.

## Data and backend

The Retail MCP project lives alongside this client in [`../mcp`](../mcp). Before
running the app, install it into your own Metabind organization —
[Part 1 of the demo tutorial](../README.md#part-1--install-the-mcp-project)
walks through it, secrets included — and configure this client with that
organization's stable internal ID and the installed project's ID.

All catalogue data is synthetic. Oak&Ivory is a fictional store; the products,
prices and imagery come from the MCP project, not from a real inventory system.

## What it does

1. Connects to the Metabind Agent proxy and your Retail project's MCP server.
2. Streams governed assistant responses and renders MCP App tool results as
   native SwiftUI through BindJS — product cards, colour and product pickers,
   room designs.
3. Renders the starter screen from Metabind-managed **content**, so the opening
   prompts are merchandising, not a release. See "Starter screen" below.
4. Stores a user-entered or configured Metabind API key in Keychain.

The Metabind Agent proxy holds the upstream model-provider credentials and runs
the tool-use loop. The app never needs an Anthropic or other LLM provider key.
One Metabind API key authenticates both the agent proxy and the MCP server.

## Requirements

- iOS 17+ (the Liquid Glass input bar is iOS 26+; there is a styled fallback below that)
- Xcode 26+
- A Retail MCP project installed into your own Metabind organization
- A Metabind API key authorized for that organization and project

## Configure a local build

1. Copy the public template to the ignored local configuration file:

   ```sh
   cp Config/Local.xcconfig.example Config/Local.xcconfig
   ```

2. Fill in the values:

   ```xcconfig
   RETAIL_DEMO_BUNDLE_ID = com.yourcompany.MetabindRetailDemo
   RETAIL_DEMO_ORG_ID = your_stable_internal_org_id
   RETAIL_DEMO_PROJECT_ID = your_project_id
   RETAIL_DEMO_API_KEY =
   DEVELOPMENT_TEAM = YOUR_TEAM_ID
   ```

   - `RETAIL_DEMO_ORG_ID` must be the stable internal ID, not an organization
     slug.
   - `RETAIL_DEMO_API_KEY` is optional. Leave it empty to enter the key on
     first launch. Set it only for a controlled demo build that should start
     without setup.
   - `RETAIL_DEMO_BUNDLE_ID` and `DEVELOPMENT_TEAM` are required for a signed
     device or distribution build. The public defaults stay generic.

`Config/Local.xcconfig` is gitignored. Do not commit it.

> [!WARNING]
> A value supplied through `RETAIL_DEMO_API_KEY` is compiled into the app's
> `Info.plist` and is recoverable from a distributed app. Marking the Xcode Cloud
> variable as secret protects build logs and configuration, but it does not make
> the key secret inside the app. Use only a restricted, revocable demo key. For a
> production app, issue short-lived user credentials from a backend instead of
> embedding a shared key.

## Starter screen

The empty state — everything on screen before the first question — is plain
SwiftUI in [`StarterScreen`](Sources/MetabindRetailDemo/StarterScreen.swift): a
greeting and three [`BentoCard`](Sources/MetabindRetailDemo/BentoCard.swift)s,
each a tappable card with a line of copy and a small grid of colour or image
tiles. Tapping a card sends its prompt followed by the tile values — hex codes
for colours, titles for images — so the model sees what the shopper was looking
at. Edit the `cards` list to change the opening prompts, copy, or imagery; the
images are bundled in `Resources/Assets.xcassets`.

## Run

```sh
open MetabindRetailDemo.xcodeproj
```

The project depends on the tagged
[`metabind-apple`](https://github.com/metabindai/metabind-apple) release pinned in
`Package.resolved`. To develop against a local SDK checkout, drag the
`metabind-apple` folder into the Xcode project navigator; Xcode overrides the
remote package with the local one until you remove it. Don't commit that override.

If no API key is configured, enter one on the launch screen and tap **Start**.
Pick a starter prompt or type a question. **✕** clears the conversation and
returns to the starter screen. **Profile > Reset API Key** clears the stored key;
the reset is sticky, so a relaunch won't quietly reinstate a key configured into
the build.

## How it works

The integration is in [`RootView`](Sources/MetabindRetailDemo/RootView.swift):

```swift
let provider = MetabindAgentProvider(
    baseURL: MetabindAgentProvider.productionHost,
    apiKey: key,
    orgId: DemoConfig.orgId,
    projectId: DemoConfig.projectId
)

assistant = MetabindAssistant(
    serverURL: serverURL,
    serverHeaders: ["authorization": "Bearer \(key)"],
    provider: provider
)
```

`MetabindAssistant` handles tool discovery, the server-side conversation loop,
streaming, and interactive rendering. The SDK's drop-in conversational surface is
`MetabindAssistantView(assistant:)` — one line, and you have a working chat.

Oak&Ivory doesn't use it, but for a different reason than Finance does.
[`ChatView`](Sources/MetabindRetailDemo/ChatView.swift) is still a transcript; it
composes against the same observable state (`assistant.conversation.messages`,
`assistant.isProcessing`) purely so the visual language stays on-brand — store
typography, card shadows, the Liquid Glass input bar. Tool results render through
`MCPAppView` exactly as the stock view renders them. If you don't need custom
branding, use `MetabindAssistantView` and delete most of this app.

Things worth knowing:

- **Data-only tool calls are hidden.** A tool with no `ui://` resource is
  model-internal bookkeeping; showing it would turn the stream into a debug log.
  See `ToolCard` in [`MessageRow`](Sources/MetabindRetailDemo/MessageRow.swift).
- **The thinking indicator covers a gap in `send`.** `MetabindAssistant.send`
  appends the user message and *then* flips `isProcessing`, so a check on
  `isProcessing` alone leaves a blank frame under the new bubble.
- **Follow-up suggestion chips are off by default.**
  [`SuggestionService`](Sources/MetabindRetailDemo/SuggestionService.swift) drafts
  them with a one-shot call to the agent proxy, which costs a round trip per turn
  — and this project's tools often end a turn with a selection card, where "what
  next" chips compete with the choice the card is asking for. Flip
  `ChatView.showsFollowUpSuggestions` to see the pattern; the service and the chip
  rail are both wired and working.

## Xcode Cloud and TestFlight

The checked-in [`ci_scripts/ci_post_clone.sh`](ci_scripts/ci_post_clone.sh)
generates the gitignored `Config/Local.xcconfig` on the cloud worker. Configure
these workflow environment variables:

| Variable | Purpose |
|---|---|
| `RETAIL_DEMO_BUNDLE_ID` | Bundle ID registered in Apple Developer and App Store Connect |
| `RETAIL_DEMO_ORG_ID` | Stable internal Metabind organization ID |
| `RETAIL_DEMO_PROJECT_ID` | Retail MCP project ID |
| `RETAIL_DEMO_API_KEY` | Restricted demo API key |
| `DEVELOPMENT_TEAM` | Apple Developer team ID |

Mark all private values as **Secret** in Xcode Cloud. The script fails early if a
required variable is missing rather than producing a misconfigured build.

`Package.resolved` is checked in because Xcode Cloud archives with automatic
package resolution disabled. Keep it updated when package dependencies change.

## Where to next

- [`../mcp`](../mcp) — the Retail MCP project this client talks to.
- [`../../finance/apple`](../../finance/apple) — the same SDK with no transcript
  at all.
- [Metabind for Apple](https://github.com/metabindai/metabind-apple) — SDK
  installation, API reference, and the lower-level `MCPAppsHost` building blocks.
- [Metabind](https://metabind.ai) — create and manage MCP Apps.

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
