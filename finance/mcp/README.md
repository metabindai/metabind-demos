# Finance MCP project

The server half of the Finance demo: the tools the assistant calls and the
cards the apps render, kept as flat files you can read, edit, and push with
the `metabind` CLI. The clients in [`../apple`](../apple) and
[`../android`](../android) talk to a copy of this project running in your own
Metabind organization.

## What's inside

Everything the project is made of lives in this tree, one file per object:

| Path | What it holds |
|---|---|
| `components/data/*.ts` | The four data tools' handlers. Each derives its numbers from the shared synthetic feed. |
| `components/view/*.ts` | The five cards, written in BindJS and rendered natively by the apps. |
| `tools/data/*.json` | The tool definitions the model sees — name, description, input schema, and annotations — one file per tool. |
| `tools/view/*.json` | Matching definitions for the card tools. |
| `metabind.jsonc` | Project settings. The prose instructions the MCP server serves to clients live next to it in `mcp-instructions.md`. |
| `agent/` | Settings for the hosted-chat agent, with the system prompt in `agent/system-prompt.md`. |
| `assets/files/` | The project thumbnail, synced down from the project. |
| `.metabind/sdk/` | Generated TypeScript typings that give you autocompletion while authoring components. |

The project pairs each data tool with a view tool. Data tools return plain
numbers for the model to reason with; view tools are the BindJS cards the
apps render natively. Each card loads its own data from the same generated
feed, so a figure in the assistant's prose and the same figure on a card
always agree.

| Data tool | Card | Covers |
|---|---|---|
| `get_net_worth` | `net_worth_trend` | Net-worth history, its trend chart, and the per-account balances behind it |
| `get_spending_breakdown` | `spending_breakdown` | Spending by category for a period, with a prior-period comparison |
| `get_subscriptions` | `subscriptions` | Recurring-charge detection: cadence, next charge date, total monthly cost |
| `get_transactions` | `transaction_list` | About 12 months of individual purchases, by category or merchant |

`trend_card` is the odd one out: a general chart card for any metric over
time that has no dedicated card — one category's spend by month, or a series
the model computed itself.

## Where the data comes from

Nothing here is stored data, and nothing calls a bank. The shared feed
*generates* about 25 months of transactions from recurring merchant
patterns. Generation is deterministic — the same call always returns the
same rows — and dates are day offsets from the clock, so the demo stays
evergreen without a thousand-line table checked into the repo.

BindJS components deploy independently, and the flat-file tree has no shared
imports, so each of the four data components carries a verbatim copy of the
feed between `BEGIN SHARED FEED` / `END SHARED FEED` markers. They are
self-contained and finished — build on top of them rather than regenerating
them. If you do change the feed, change it in all four copies: the cards are
expected to agree with each other, with account balances summing to net
worth, category totals matching the transaction list, and savings tracking
the net-worth curve.

## Install

This tree is project **source**, not a checkout of our project. Nothing in
it names an organization, a project, or an entity id, and the per-checkout
sync state (`.metabind/state.json`, `metabind.resolved`,
`.metabind/secrets.json`) is gitignored. `metabind inspect --dir .` confirms
the tree reads no secrets and calls no external host.

One command turns it into a project in your organization (`metabind` CLI,
0.9.0 or newer, run from this directory):

```sh
metabind install --dir . --yes
```

This creates a new project in your organization, with fresh ids for
everything in the tree. Everything lands as drafts; nothing serves traffic
until you publish.

`install` creates a project only when the CLI has no project bound. If
`metabind use --project` has already scoped it to one — after installing the
other demo, say — install writes this tree into *that* project instead, as
drafts alongside whatever is already there, and the name in the tree is
ignored. `metabind status` reports the active scope; release it first if it
names a project you don't want to install into:

```sh
metabind use --clear
metabind use --org <org-id>
```

`use --clear` wipes the organization along with the project, which is why the
org is set again after it — setting the org alone does not release a bound
project.

The start-to-finish walkthrough — CLI setup, publishing, the project icon,
and running the iOS and Android apps — is [the demo tutorial](../README.md).
For installing and signing in to the CLI itself, see
[Install and Sign In](https://docs.metabind.ai/cli/install).

## Edit and push

After install, the copy of this project on the server is the source of
truth. Make this directory a checkout of it once:

```sh
metabind sync repair --org <org-id> --project <project-id>
```

Then the loop:

1. Edit the source — a card in `components/view/`, a handler in
   `components/data/`, the system prompt in `agent/`.
2. Validate before writing anything to the server:

   ```sh
   metabind validate component components/view/TrendCard.ts
   ```

3. Preview, apply, release. `push` writes drafts; nothing reaches the
   published MCP app until you publish:

   ```sh
   metabind push --plan     # report what would change, write nothing
   metabind push
   metabind publish
   ```

Sync rules that save surprises:

- Pass `--org` and `--project` explicitly on the first sync of a fresh
  checkout — there is no baseline to read them from until one exists — and
  on every mutating command; without them the CLI targets whatever project
  `metabind use` last persisted.
- A push that would overwrite a change made in Studio is refused, not
  merged, and there is no partial apply — resolve the conflict, then push
  again.
- Assets are pull-only: they are managed in the Studio,
  `metabind pull --with-assets` brings the binaries down into
  `assets/files/`, and `push` discards any edit to `assets/assets.json`.
- To refresh this directory after edits made in the Studio, re-pull with
  `metabind pull --out .`.

The full sync model — conflicts, renames, repairing local state — is
documented in [Flat-File Sync](https://docs.metabind.ai/cli/flat-file-sync).

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
