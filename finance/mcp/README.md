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
.metabind/sdk/           generated typings for authoring components
```

This tree is project **source**, not a checkout of our project. Nothing here
names an organization, a project, or an entity id: `.metabind/state.json`,
`metabind.resolved` and `.metabind/secrets.json` are per-checkout sync state and
are gitignored, so your first sync establishes a baseline against *your* project
rather than inheriting ours.

All financial data is synthetic. Nothing here reads a secret or calls an
external host (`metabind inspect --dir .` confirms).

Every card reads the same synthetic feed, so any two cards showing the same
figure agree: account balances sum to net worth, savings track net-worth growth,
and category totals match the transaction list. The feed is carried inline in
each data component — they are self-contained and finished. Build on top of them
rather than regenerating them.

## Requirements

The `metabind` CLI, **0.9.0 or newer**:

```sh
brew install metabindai/tap/metabind
metabind --version
```

## Install into your organization

```sh
metabind auth login
metabind inspect --dir finance/mcp          # what the tree declares
metabind install --dir finance/mcp --name "Banking Assistant" --yes
metabind agent set --provider anthropic --key ...   # hosted chat needs an LLM key
metabind publish
```

`install` mints fresh ids and writes the sync baseline
(`.metabind/state.json`) for the project it just created. Use the printed org
and project IDs to configure the clients (`apple/Config/Local.xcconfig`,
`android/local.properties`).

Pass `--org` and `--project` explicitly on the first sync of a fresh checkout —
there is no baseline to read them from until one exists.

`install` creates components and tools only — it doesn't upload assets or
apply the project settings in `metabind.jsonc`. No icon *URL* is checked in: a
CDN address is stamped with the org, project and asset ids that own it, so it
means nothing in another project.

The icon image itself ships in `assets/files/`, synced down from the project —
it is not read out of the iOS app. Upload it into your own project and point
both settings at the URL you get back:

```sh
metabind asset upload assets/files/project-thumbnail.png
metabind project update <projectId> --data '{"settings":{"thumbnailUrl":"<cdnUrl>","mcp":{"icons":[{"src":"<cdnUrl>","sizes":["1024x1024"],"mimeType":"image/png"}]}}}'
```

Assets are pull-only: they are edited in the Studio, `metabind pull --with-assets`
brings the binaries down into `assets/files/`, and `push` discards any edit to
`assets/assets.json`.

Pass `--org` and `--project` explicitly on every mutating command; without
them the CLI targets whatever project `metabind use` last persisted.

## Edit

Edit the source under `components/`, then:

```sh
metabind validate component components/view/TrendCard.ts
metabind push        # from a checkout pulled from your own project
metabind publish
```

Re-pull with `metabind pull --out finance/mcp` to refresh this tree from its
source project.

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
