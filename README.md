# Metabind demos

Product-style apps built on the Metabind SDKs. Each demo pairs native clients
with the MCP project they talk to, so you can install the project into your
own [Metabind](https://metabind.ai) organization and have the same assistant
running in a real app on your own devices.

## What is Metabind

Metabind builds agents that answer in your product's own UI, not in a chat
window: interactive interfaces that take customers straight to what they came
for, in the brand they already know. It's built from the UI, design system,
and APIs the app already has. No rewrite. It's governed, rendering only
components you've approved, enforced on every render. And it's hosted: you
define the tools, we run the server. The same agent runs inside your own iOS,
Android, and web apps, and across Claude, ChatGPT, and every MCP host, on the
open [MCP](https://modelcontextprotocol.io) standard.

These demos show the inside-your-own-app half: the same MCP App rendered as
real native SwiftUI and Jetpack Compose through the Assistant SDK.

**[Start free at metabind.ai](https://www.metabind.ai/signup)** ·
**[Read the docs](https://docs.metabind.ai)**

## The demos

Two demos, deliberately opposite in shape — read both before deciding which
one your product is:

| Demo | What it shows | Video |
|---|---|---|
| [finance](finance) | Personal-finance assistant with purpose-built answer surfaces instead of a chat transcript. iOS and Android. | [▶️ Watch](https://youtu.be/yc-FLvOt94E) |
| [retail](retail) | Oak&Ivory, a furniture-store shopping assistant where the conversation itself is the product. iOS. | [▶️ Watch](https://youtu.be/9eI16TF2Ntc) |

Each demo is one folder holding every platform client and the MCP project it
talks to:

```
<demo>/
  apple/     # Xcode project, depends on a tagged metabind-apple release
  android/   # Gradle project, depends on a tagged metabind-android release
  mcp/       # the Metabind MCP project (BindJS components, types, tools)
```

Demos consume the SDKs the way an integrator would — pinned release tags, not
local checkouts. Apps that exist to exercise and debug the SDKs themselves live
as `Samples/` inside each SDK repository and reference the SDK by local path.

## Getting started

Every demo follows the same arc, written up as a start-to-finish tutorial in
its own README:

1. Sign up at [metabind.ai/signup](https://www.metabind.ai/signup) and install
   the `metabind` CLI, 0.9.0 or newer:

   ```sh
   brew install metabindai/tap/metabind
   ```

2. Install the demo's `mcp/` project into your organization with
   `metabind install`, which mints fresh ids and creates drafts for you to
   publish.
3. Configure a platform client with the printed org and project ids, and run
   it.

Start with [the Finance demo](finance/README.md) — it's self-contained, with
synthetic data and no secrets to bind. [The Retail demo](retail/README.md)
reads a shared public catalogue and needs secrets bound first; its README
walks through that.

## Starting with an agent

These demos are meant to be driven by a coding agent. Give yours the CLI's
shape first:

```sh
brew install metabindai/tap/metabind    # 0.9.0+
metabind auth login
metabind skill install                  # autodetects claude-code, codex, cursor
```

Then point it at a demo:

> Read `CLAUDE.md` and `finance/README.md`, then install the Finance MCP
> project into my Metabind organization and publish it. Show me the org and
> project ids when you're done so I can configure the clients.

Swap in `retail/` for the Retail demo — it needs secrets bound and reads a
shared public catalogue; its README walks through both. Each
`<demo>/mcp/README.md` documents the project tree itself: what's inside, and
how to edit and push changes.

## SDKs

- [metabind-apple](https://github.com/metabindai/metabind-apple) — Swift SDK (`MetabindContent`, `MCPAppsHost`, `MetabindAI`)
- [metabind-android](https://github.com/metabindai/metabind-android) — Android SDK
- [metabind-web](https://github.com/metabindai/metabind-web) — React SDK

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
