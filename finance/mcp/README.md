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
assets/files/            the project thumbnail, synced down from the project
.metabind/sdk/           generated typings for authoring components
```

This tree is project **source**, not a checkout of our project. Nothing here
names an organization, a project, or an entity id: `.metabind/state.json`,
`metabind.resolved` and `.metabind/secrets.json` are per-checkout sync state and
are gitignored, so your first sync establishes a baseline against *your* project
rather than inheriting ours.

All financial data is synthetic. Nothing here reads a secret or calls an
external host (`metabind inspect --dir .` confirms).

## How the data stays consistent

Every card reads the same synthetic feed, so any two cards showing the same
figure agree: account balances sum to net worth, savings track net-worth growth,
and category totals match the transaction list. The feed is carried inline in
each data component — they are self-contained and finished. Build on top of them
rather than regenerating them.

## Install

One command creates this tree as a project in your organization, as drafts
(`metabind` CLI, 0.9.0 or newer, run from this directory):

```sh
metabind install --dir . --yes
```

The start-to-finish walkthrough — CLI setup, publishing, the project icon, and
running the iOS and Android apps — is [the demo tutorial](../README.md). For
installing and signing in to the CLI itself, see
[Install and Sign In](https://docs.metabind.ai/cli/install).

## Edit and push

Edit the source under `components/`, then:

```sh
metabind validate component components/view/TrendCard.ts
metabind push        # from a checkout pulled from your own project
metabind publish
```

Re-pull with `metabind pull --out .` to refresh this tree from its source
project.

Sync details worth knowing:

- Pass `--org` and `--project` explicitly on the first sync of a fresh
  checkout — there is no baseline to read them from until one exists — and on
  every mutating command; without them the CLI targets whatever project
  `metabind use` last persisted.
- Assets are pull-only: they are edited in the Studio,
  `metabind pull --with-assets` brings the binaries down into `assets/files/`,
  and `push` discards any edit to `assets/assets.json`.

How sync works end to end — pull, push, conflicts, and repairing local state —
is documented in [Flat-File Sync](https://docs.metabind.ai/cli/flat-file-sync).

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
