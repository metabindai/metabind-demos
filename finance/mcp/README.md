# Finance MCP project

The Metabind MCP project behind the Finance demo, materialized with
`metabind pull`. One file per object:

```
components/data/*.ts     data tools — synthetic transactions, balances,
                         subscriptions, net-worth history (no outbound calls)
components/view/*.ts     BindJS UI tools rendered natively in the apps
tools/<kind>/*.json      tool definitions (name, description, annotations)
metabind.jsonc           project settings; prose in mcp-instructions.md
agent/                   hosted-chat agent settings; prompt in system-prompt.md
scripts/                 the shared synthetic feed and the checks that keep
                         every card reconciled against it
.metabind/               ids, content hashes, generated typings
```

All financial data is synthetic. Nothing here reads a secret or calls an
external host (`metabind inspect --dir .` confirms).

Every card reads one feed, so any two cards showing the same figure agree. That
is enforced, not assumed: `scripts/shared-feed.js` is the single source, and
`node scripts/sync-shared-feed.mjs --check` fails if a component's injected copy
has drifted. `node scripts/reconcile.mjs` asserts the cross-card invariants —
account balances summing to net worth, savings tracking net-worth growth,
category totals matching the transaction list. Run both before pushing a change
to any data component.

## Install into your organization

```sh
metabind auth login
metabind inspect --dir finance/mcp          # what the tree declares
metabind install --dir finance/mcp --name "Banking Assistant" --yes
metabind agent set --provider anthropic --key ...   # hosted chat needs an LLM key
metabind publish
```

`install` mints fresh ids, so the tree's `.metabind/state.json` never
addresses anything in your org. Use the printed org and project IDs to
configure the clients (`apple/Config/Local.xcconfig`).

`install` creates components and tools only — it doesn't upload assets or
apply the project settings in `metabind.jsonc` (thumbnail, MCP icon). To carry
the icon over, upload the app icon and point both settings at it:

```sh
metabind asset upload ../apple/AppIcon.xcassets/AppIcon.appiconset/finance-icon-2.png
metabind project update <projectId> --data '{"settings":{"thumbnailUrl":"<cdnUrl>","mcp":{"icons":[{"src":"<cdnUrl>","sizes":["1024x1024"],"mimeType":"image/png"}]}}}'
```

Pass `--org` and `--project` explicitly on every mutating command; without
them the CLI targets whatever project `metabind use` last persisted.

## Edit

Edit the source under `components/`, then:

```sh
node scripts/sync-shared-feed.mjs      # after editing scripts/shared-feed.js
node scripts/sync-shared-feed.mjs --check
node scripts/reconcile.mjs
metabind validate component components/view/TrendCard.ts
metabind push        # from a checkout pulled from your own project
metabind publish
```

Re-pull with `metabind pull --out finance/mcp` to refresh this tree from its
source project.

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
