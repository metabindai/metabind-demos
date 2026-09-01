# Finance

A personal-finance assistant. The app asks one question on launch and uses the
rendered MCP result as its home screen; follow-up questions open in sheets.
There is no transcript — assistant turns are routed to purpose-built surfaces.

| Directory | Contents |
|---|---|
| [`apple/`](apple) | iOS app on `MetabindAI` (`MetabindAssistant`), SDK pinned by release tag |
| [`android/`](android) | Android app on `metabindai-android` (`MetabindAssistant`), SDK pinned in the version catalog |
| [`mcp/`](mcp) | The Finance MCP project: BindJS components, tools, and synthetic financial data |

All financial data is synthetic. Clone or import the `mcp/` project into your
own Metabind organization, then point a client at that org and project ID. See
each directory's README.
