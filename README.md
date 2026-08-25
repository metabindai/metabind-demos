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

## SDKs

- [metabind-apple](https://github.com/metabindai/metabind-apple) — Swift SDK (`MetabindContent`, `MCPAppsHost`, `MetabindAI`)
- [metabind-android](https://github.com/metabindai/metabind-android) — Android SDK
- [metabind-web](https://github.com/metabindai/metabind-web) — React SDK

## License

MIT. See [`LICENSE`](LICENSE).
