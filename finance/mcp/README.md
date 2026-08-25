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
.metabind/               ids, content hashes, JSON schemas, generated typings
```

All financial data is synthetic. Nothing here reads a secret or calls an
external host (`metabind inspect --dir .` confirms).

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

## Edit

Edit the source under `components/`, then:

```sh
metabind validate component components/view/TrendCard.ts
metabind push        # from a checkout pulled from your own project
metabind publish
```

Re-pull with `metabind pull --out finance/mcp` to refresh this tree from its
source project.
