# Metabind Retail demo

Oak&Ivory, a furniture store's shopping assistant where the conversation
itself is the product. You ask about a chair and the assistant answers in
prose, rendering product cards, comparisons, and room designs inline as native
UI.

[![Watch the Retail demo video: the Oak&Ivory iOS app rendering product cards
and room designs inline in the conversation](https://img.youtube.com/vi/9eI16TF2Ntc/maxresdefault.jpg)](https://youtu.be/9eI16TF2Ntc)

*▶️ [Watch the Retail demo on YouTube](https://youtu.be/9eI16TF2Ntc) — the iOS app.*

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
through the Assistant SDK.

**[Start free at metabind.ai](https://metabind.ai)** ·
**[Read the docs](https://docs.metabind.ai)**

## What this demo is

Retail is a transcript. The conversation is the surface: answers stream in as
prose, and the assistant's tool results — product cards, colour and product
pickers, spec sheets, room designs — render inline as native SwiftUI through
BindJS.

It's the opposite shape to [the Finance demo](../finance), which has no
transcript at all and routes each turn onto a purpose-built surface. Same
SDKs, two shapes — read both before deciding which one your product is.

Working through this README end to end, you get:

- The Retail MCP project — catalogue search and lookup, comparison, pickers,
  room design, and image generation — installed as a project in your own
  Metabind organization.
- The iOS app running against that project.
- The Android app running against the same project.

Oak&Ivory is a fictional store, but unlike Finance this project is not
self-contained: its tools read a hosted, public demo catalogue and need
secrets bound before they work. Part 1 covers both, and
[the MCP project's README](mcp/README.md#it-is-not-self-contained) explains
exactly what it reaches and how to point it at your own catalogue instead.

## What's in this folder

| Directory | Contents |
|---|---|
| [`apple/`](apple) | iOS app on `MetabindAI` (`MetabindAssistant`), SDK pinned by release tag |
| [`android/`](android) | Android app on `metabindai-android` (`MetabindAssistant`), SDK pinned in the version catalog |
| [`mcp/`](mcp) | The Retail MCP project: BindJS components, tools, and the catalogue bindings |

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
- Optional: a [Gemini API key](https://ai.google.dev/) for image generation.
  It's a paid API — see the secrets step for what works without it.

## Part 1 — install the MCP project

Run these from this directory (`retail/`).

1. Sign up at [metabind.ai](https://www.metabind.ai/signup) if you haven't
   already — that creates your account and organization. Then sign in to the
   CLI and pick the organization to install into:

   ```sh
   metabind auth login
   metabind org list
   metabind use --clear
   metabind use --org <org-id>
   ```

   `use --clear` matters if you have used the CLI before. `install` in
   step 3 creates a project only when none is bound, and installs into the
   bound one otherwise — after the Finance demo, for instance. Setting the org
   alone does not release a project bound earlier; `metabind status` shows
   the active scope.

2. See what the tree declares before creating anything:

   ```sh
   metabind inspect --dir mcp
   ```

   Unlike Finance, Retail declares secrets and outbound calls — it reads a
   hosted catalogue. `inspect` shows you exactly what, and `install` asks for
   the same consent (`--yes`) before creating anything.

3. Install:

   ```sh
   metabind install --dir mcp --name "Oak & Ivory" --yes
   ```

   `install` mints fresh ids for everything it creates, records where the
   tree came from, and creates drafts only — nothing serves traffic until you
   publish. Copy the project id it prints.

4. Scope the CLI to the new project:

   ```sh
   metabind use --project <project-id>
   ```

5. Bind the catalogue key — the shared, read-only key committed in
   [the MCP project's secrets table](mcp/README.md#secrets-this-project-needs).
   It's published on purpose: the same for everyone, granting nothing beyond
   reading the public demo catalogue. Copy the value from there:

   ```sh
   metabind env set METABIND_API_KEY=<shared-catalogue-key>
   ```

6. Optionally, bind your own Gemini key for image generation:

   ```sh
   echo $GEMINI_API_KEY | metabind env set GEMINI_API_KEY --value-stdin
   ```

   Room designs are what make the demo feel alive, but every one is a paid
   image generation. Leave this unbound and the rest of the assistant still
   works — product search, comparison, specs, and selection are all
   catalogue-driven.

7. Set the agent's LLM key, and publish:

   ```sh
   echo $ANTHROPIC_API_KEY | metabind agent set --provider anthropic --api-key-stdin
   metabind publish
   ```

8. Mint the API key the app signs in with:

   ```sh
   metabind api-key create
   ```

   Copy the value now — it is shown once, at creation. One Metabind API key
   authenticates both the Agent proxy and the MCP server.

9. Optionally, apply the project settings and thumbnail. `install` creates
   the components and tools; the settings in `mcp/metabind.jsonc` — MCP
   instructions, agent system prompt, platforms — are applied by `push`:

   ```sh
   metabind asset upload mcp/assets/files/project-thumbnail.png
   metabind sync repair --out mcp --org <org-id> --project <project-id>
   metabind push --out mcp
   metabind project update <project-id> \
     --data '{"settings":{"thumbnailUrl":"<url from asset upload>"}}'
   metabind publish
   ```

   `push` rewrites the tool drafts, so publish once more to release them.

> [!NOTE]
> Configure the client with the org and project ids that `install` printed —
> the stable internal ids, not the organization slug.

## Part 2 — run the iOS app

1. Create the gitignored local configuration from its template:

   ```sh
   cd apple
   cp Config/Local.xcconfig.example Config/Local.xcconfig
   ```

2. Fill in the ids from Part 1:

   ```xcconfig
   RETAIL_DEMO_ORG_ID = your_stable_internal_org_id
   RETAIL_DEMO_PROJECT_ID = your_project_id
   ```

   Leave `RETAIL_DEMO_API_KEY` empty — you'll enter the key on first launch.
   `RETAIL_DEMO_BUNDLE_ID` and `DEVELOPMENT_TEAM` matter only for signed
   device builds.

3. Open the project and run it (⌘R) on an iOS 17+ simulator:

   ```sh
   open MetabindRetailDemo.xcodeproj
   ```

4. Enter your Metabind API key on the launch screen and tap **Start**. Pick a
   starter prompt or ask about a chair, and watch the answer arrive as prose
   with product cards inline.

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
   adb shell am start -n ai.metabind.retail.demo/.MainActivity
   ```

4. Enter your Metabind API key and tap **Start** — the same first-launch flow
   as iOS.

For the Compose architecture and the deliberate divergences from the iOS app,
see [the Android app's README](android/README.md).

## Where to next

- [Sell your own catalogue](mcp/README.md#it-is-not-self-contained) — replace
  the demo catalogue's ids with your own content project and assets.
- [Edit the MCP project](mcp/README.md#edit-and-push) — change a component,
  validate, push, and publish.
- [The Finance demo](../finance) — the same SDKs with the opposite shape: no
  transcript, purpose-built surfaces.
- [Metabind for Apple](https://github.com/metabindai/metabind-apple) and
  [Metabind for Android](https://github.com/metabindai/metabind-android) —
  SDK installation and API reference.
- [docs.metabind.ai](https://docs.metabind.ai) — the full guides.

## License

Apache 2.0. See [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE) at the
repository root; `apple/` and `mcp/` carry their own copies because they are
meant to be copied out as starters.
