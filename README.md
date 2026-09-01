# Metabind Demos

Product-style apps built on top of the Metabind SDKs. Each demo is one folder
holding every platform client and the MCP project it talks to:

```
<demo>/
  apple/     # Xcode project, depends on a tagged metabind-apple release
  android/   # Gradle project, depends on a tagged metabind-android release
  mcp/       # the Metabind MCP project (BindJS components, types, tools)
```

Demos consume the SDKs the way an integrator would — pinned release tags, not
local checkouts. Apps that exist to exercise and debug the SDKs themselves live
as `Samples/` inside each SDK repository and reference the SDK by local path.

| Demo | What it shows |
|---|---|
| [finance](finance) | Personal-finance assistant with purpose-built answer surfaces instead of a chat transcript |
| [retail](retail) | Furniture-store shopping assistant where the conversation itself is the product |

## Starting with an agent

These demos are meant to be driven by a coding agent. Give yours the CLI's shape
first:

```sh
brew install metabindai/tap/metabind    # 0.9.0+
metabind auth login
metabind skill install                  # autodetects claude-code, codex, cursor
```

Then point it at a demo:

> Read `CLAUDE.md` and `finance/mcp/README.md`, then install the Finance MCP
> project into my Metabind organization and publish it. Show me the org and
> project ids when you're done so I can configure the clients.

Swap in `retail/` for the Retail demo. Each `<demo>/mcp/README.md` is written to
be read start-to-finish before anything is run — Retail in particular needs
secrets bound and reads a shared public catalogue.

## SDKs

- [metabind-apple](https://github.com/metabindai/metabind-apple) — Swift SDK (`MetabindContent`, `MCPAppsHost`, `MetabindAI`)
- [metabind-android](https://github.com/metabindai/metabind-android) — Android SDK
- [metabind-web](https://github.com/metabindai/metabind-web) — React SDK

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
