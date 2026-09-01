# Retail

Oak&Ivory, a furniture store's shopping assistant. You ask about a chair and the
assistant answers in prose, rendering product cards, comparisons and room designs
inline as native UI.

It is deliberately the opposite shape to [finance](../finance): the transcript
*is* the product here, where Finance has no transcript at all and routes each
turn onto a purpose-built surface. Two ways to consume the same SDK.

| Directory | Contents |
|---|---|
| [`apple/`](apple) | iOS app on `MetabindAI` (`MetabindAssistant`), SDK pinned by release tag |
| [`android/`](android) | Not yet available |
| [`mcp/`](mcp) | The Retail MCP project: BindJS components, tools, and the synthetic catalogue |

All catalogue data is synthetic — Oak&Ivory is a fictional store. Install the
`mcp/` project into your own Metabind organization, then point the client at that
org and project ID. See each directory's README.
