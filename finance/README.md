# Metabind Finance demo

A personal-finance assistant with no chat transcript. The app asks one question
on launch and uses the rendered answer as its home screen; every follow-up
opens on a purpose-built surface. The same assistant runs natively on iOS and
Android from one MCP App definition.

[![Watch the Finance demo video: the iOS app answering with rendered
surfaces instead of a transcript](https://img.youtube.com/vi/yc-FLvOt94E/maxresdefault.jpg)](https://youtu.be/yc-FLvOt94E)

*▶️ [Watch the Finance demo on YouTube](https://youtu.be/yc-FLvOt94E) — the iOS app.*

## What is Metabind

Metabind builds agents that answer in your product's own UI, not in a chat
window: interactive interfaces that take customers straight to what they came
for, in the brand they already know. It's built from the UI, design system,
and APIs the app already has. No rewrite. It's governed, rendering only
components you've approved, enforced on every render. And it's hosted: you
define the tools, we run the server. The same agent runs inside your own iOS,
Android, and web apps, and across Claude, ChatGPT, and every MCP host, on the
open [MCP](https://modelcontextprotocol.io) standard.

This demo shows the inside-your-own-app half, rendered as real native SwiftUI
and Jetpack Compose through the Assistant SDK.

**[Start free at metabind.ai](https://metabind.ai)** ·
**[Read the docs](https://docs.metabind.ai)**

## What this demo is

Finance is a deliberately transcript-free assistant. One question is asked on
launch — *"Where did my money go this month?"* — and its rendered MCP result
*is* the home screen. Later questions come from a pill rail at the bottom and
open in sheets. Each turn is routed to a purpose-built surface instead of
scrolling by in a message list.

It's the opposite shape to [the Retail demo](../retail), where the
conversation itself is the product. Same SDKs, two shapes — read both before
deciding which one your product is.

Working through this README end to end, you get:

- The Finance MCP project — spending breakdowns, transaction lists,
  subscriptions, and net-worth trends as BindJS components over synthetic
  data — installed as a project in your own Metabind organization.
- The iOS app running against that project.
- The Android app running against the same project.

All financial data is synthetic. Nothing here connects to a real bank, reads
a secret, or calls an external host.

## What's in this folder

| Directory | Contents |
|---|---|
| [`apple/`](apple) | iOS app on `MetabindAI` (`MetabindAssistant`), SDK pinned by release tag |
| [`android/`](android) | Android app on `metabindai-android` (`MetabindAssistant`), SDK pinned in the version catalog |
| [`mcp/`](mcp) | The Finance MCP project: BindJS components, tools, and the synthetic feed |

## Before you start

- A Metabind account and organization — sign up at
  [metabind.ai/signup](https://www.metabind.ai/signup).
- The `metabind` CLI, 0.9.0 or newer:

  ```sh
  brew install metabindai/tap/metabind
  metabind --version
  ```

- An LLM provider API key (Anthropic, OpenAI, or Google). The Metabind Agent
  proxy holds it server-side and runs the conversation with it — the apps
  never ship a provider key.
- For iOS: Xcode 26+ (the app targets iOS 17+).
- For Android: Android Studio, JDK 17+, and GitHub Packages credentials —
  GitHub requires authentication even to read a public package.

## Part 1 — install the MCP project

Run these from this directory (`finance/`).

1. Sign in, and pick the organization to install into:

   ```sh
   metabind auth login
   metabind org list
   metabind use --org <org-id>
   ```

2. See what the tree declares before creating anything:

   ```sh
   metabind inspect --dir mcp
   ```

   Finance declares no secrets and no outbound calls — `inspect` is how you
   confirm that from the tree itself.

3. Install:

   ```sh
   metabind install --dir mcp --name "Banking Assistant" --yes
   ```

   `install` mints fresh ids for everything it creates, records where the
   tree came from, and creates drafts only — nothing serves traffic until you
   publish. Copy the project id it prints.

4. Scope the CLI to the new project and set the agent's LLM key:

   ```sh
   metabind use --project <project-id>
   echo $ANTHROPIC_API_KEY | metabind agent set --provider anthropic --api-key-stdin
   ```

5. Publish:

   ```sh
   metabind publish
   ```

6. Mint the API key the apps sign in with:

   ```sh
   metabind api-key create
   ```

   Copy the value now — it is shown once, at creation. One Metabind API key
   authenticates both the Agent proxy and the MCP server.

7. Optionally, give the project its icon. `install` creates components and
   tools only — it doesn't upload assets or apply the settings in
   `mcp/metabind.jsonc` — so upload the shipped thumbnail and point the
   settings at the CDN URL you get back:

   ```sh
   metabind asset upload mcp/assets/files/project-thumbnail.png
   metabind project update <project-id> --data '{"settings":{"thumbnailUrl":"<cdnUrl>","mcp":{"icons":[{"src":"<cdnUrl>","sizes":["1024x1024"],"mimeType":"image/png"}]}}}'
   ```

> [!NOTE]
> Configure the clients with the org and project ids that `install` printed —
> the stable internal ids, not the organization slug.

## Part 2 — run the iOS app

1. Create the gitignored local configuration from its template:

   ```sh
   cd apple
   cp Config/Local.xcconfig.example Config/Local.xcconfig
   ```

2. Fill in the ids from Part 1:

   ```xcconfig
   FINANCE_DEMO_ORG_ID = your_stable_internal_org_id
   FINANCE_DEMO_PROJECT_ID = your_project_id
   ```

   Leave `FINANCE_DEMO_API_KEY` empty — you'll enter the key on first launch.
   `FINANCE_DEMO_BUNDLE_ID` and `DEVELOPMENT_TEAM` matter only for signed
   device builds.

3. Open the project and run it (⌘R) on an iOS 17+ simulator:

   ```sh
   open MetabindFinanceDemo.xcodeproj
   ```

4. Enter your Metabind API key on the launch screen and tap **Start**. The
   home screen loads by asking *"Where did my money go this month?"*. Tap a
   suggested follow-up or **Ask anything** to open the next answer in a sheet.

For signing, Xcode Cloud, TestFlight, and how the integration works, see
[the iOS app's README](apple/README.md).

## Part 3 — run the Android app

1. Give Gradle credentials for GitHub Packages, either as environment
   variables (`GITHUB_ACTOR` / `GITHUB_TOKEN`) or in
   `~/.gradle/gradle.properties`:

   ```properties
   gpr.user=your-github-username
   gpr.key=your-github-token
   ```

2. Create the gitignored local configuration from its template, and fill in
   the same ids from Part 1:

   ```sh
   cd android
   cp local.properties.example local.properties
   ```

3. Build, install, and launch on a device or emulator (API 26+, with the
   WebView JavaScript Sandbox available — BindJS runs component code in
   `androidx.javascriptengine`):

   ```sh
   ./gradlew :app:installDebug
   adb shell am start -n ai.metabind.finance.demo/.MainActivity
   ```

4. Enter your Metabind API key and tap **Start** — the same first-launch flow
   as iOS.

For the Compose architecture and the deliberate divergences from the iOS app,
see [the Android app's README](android/README.md).

## Where to next

- [Edit the MCP project](mcp/README.md#edit-and-push) — change a component,
  validate, push, and publish, with the reconcile scripts that keep every
  card's figures agreeing.
- [The Retail demo](../retail) — the same SDKs with the opposite shape: the
  transcript is the product.
- [Metabind for Apple](https://github.com/metabindai/metabind-apple) and
  [Metabind for Android](https://github.com/metabindai/metabind-android) —
  SDK installation and API reference.
- [docs.metabind.ai](https://docs.metabind.ai) — the full guides.

## License

Apache 2.0. See [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE) at the
repository root; `apple/`, `android/`, and `mcp/` carry their own copies
because they are meant to be copied out as starters.
