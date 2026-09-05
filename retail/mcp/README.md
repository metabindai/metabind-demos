# Retail MCP project

The server half of the Oak&Ivory demo: the tools the assistant calls and the
BindJS components it renders, kept as flat files you can read, edit, and push
with the `metabind` CLI. The iOS client in [`../apple`](../apple) talks to a
copy of this project running in your own Metabind organization.

## What's inside

Everything the project is made of lives in this tree, one file per object:

| Path | What it holds |
|---|---|
| `components/data/*.ts` | Handlers for the four data tools, plus `CacheImage`, an internal image cache. |
| `components/view/*.ts` | 22 BindJS view components: the ten card surfaces the assistant renders, and the shared building blocks behind them. |
| `tools/data/*.json` | The tool definitions the model sees — description, root component, and config (allowed domains, annotations) — one file per tool. |
| `tools/view/*.json` | Matching definitions for the card tools. |
| `metabind.jsonc` | Project settings. The prose instructions the MCP server serves to clients live next to it in `mcp-instructions.md`. |
| `agent/` | Settings for the hosted-chat agent, with the system prompt in `agent/system-prompt.md`. |
| `assets/files/` | The project thumbnail, synced down from the project. |
| `.metabind/secrets.json` | The names of the secrets this project reads. Values never sync; `metabind inspect` reports these as the consent preview. |

The data tools read the catalogue and generate imagery:

| Tool | What it does |
|---|---|
| `product_search` | Searches the Oak&Ivory catalogue; its compact mode returns just ids for other tools to expand |
| `product_lookup` | Fetches full product records by id — called by view components to load their own data, not by the model |
| `inspiration_search` | Style-reference imagery from the shared asset library |
| `nano_banana_image_generator` | Generates room and product imagery with Gemini — needs `GEMINI_API_KEY` |

`CacheImage` is a fifth data component with no tool of its own: an image
cache wrapped around the generator, so repeating a room design doesn't pay
for a second generation.

The view tools are the surfaces the assistant can put on screen:

| Tool | Renders |
|---|---|
| `product_carousel` | A browsable carousel of products |
| `product_detail` | A product detail card: imagery, features, reviews, call to action |
| `product_comparison` | A comparison table across products and dimensions |
| `product_specs` | A spec-sheet card |
| `product_selection`, `palette_color_selection` | Selection flows — pick the products or the palette a design starts from |
| `product_groupings`, `product_recommendation` | Grouped suggestions and personalized recommendations |
| `interior_designer` | The room-design surface |
| `inspiration_card_stack` | A stack of style-inspiration images |

The remaining view components — brand backgrounds, the script font, the
logo, the error card — aren't tools; they're shared building blocks the card
surfaces compose, which is what keeps every card on-brand.

## It is not self-contained

Unlike [the Finance project](../../finance/mcp), which ships its own synthetic
data and makes no outbound calls, Retail reads a **hosted, public catalogue**:

| Resource | What |
|---|---|
| `Product Database` (`Y676oC7SckYcfyXR54HY`) | A public Metabind content project holding the Oak&Ivory products, specs and imagery. `ProductSearch`, `ProductLookup` and `InspirationSearch` query it directly. |
| `cdn.metabind.ai/…` | Product photography, the Manus brand font, and the spec-sheet style reference, referenced by URL from the view components. |

Those ids and URLs are hard-coded in the components on purpose — they are the
address of a shared demo resource, not leftover state from our project, and the
demo has no products without them. Installing this project into your own
organization gives you an assistant that reads Metabind's public catalogue.

To sell your own catalogue instead, replace the `ORG_ID` / `PROJ_ID` constants at
the top of the three data components and point `CATALOGUE_BASE` in
`ItemStackView.ts` at your own assets.

## Secrets this project needs

Retail reaches out, so it will not work until you bind two secrets. One of them
is a paid third-party API.

| Secret | Used by | What it is |
|---|---|---|
| `METABIND_API_KEY` | `product_search`, `product_lookup`, `inspiration_search` | Reads the `Product Database` content project over the Metabind content API |
| `GEMINI_API_KEY` | `nano_banana_image_generator` | Room and product imagery |

`METABIND_API_KEY` is published here on purpose: it is a shared, read-only key
for the public demo catalogue, the same for everyone, and it is the only way the
demo has products. Use it as-is — it is not yours to rotate, and it grants
nothing beyond reading that one content project.

```sh
metabind env set METABIND_API_KEY=74723201c99afe0e4a0c1feeb6be5f4e55392992798ff57d776461e753084119
```

`GEMINI_API_KEY` is your own paid key:

```sh
metabind env set GEMINI_API_KEY=...
```

That puts the value in shell history and `ps -ef`. To avoid it, pass it on
stdin: `echo $KEY | metabind env set GEMINI_API_KEY --value-stdin`.

Secret values are KMS-encrypted server-side and never sync into this tree —
`.metabind/secrets.json` records only the names.

Image generation is what makes the demo feel alive, but it is also the expensive
part: every room design is a generated image. Leave `GEMINI_API_KEY` unbound and
the rest of the assistant still works — product search, comparison, specs and
selection are all catalogue-driven.

## Install

This tree is project **source**, not a checkout of ours. The per-checkout
sync state — `.metabind/state.json` and `metabind.resolved` — is gitignored,
so nothing in it addresses our project.

One command turns it into a project in your organization (`metabind` CLI,
0.9.0 or newer, run from this directory):

```sh
metabind install --dir . --yes
```

This creates a new project in your organization, with fresh ids for
everything in the tree. `--yes` consents to what the tree declares — the
secrets and outbound calls above; `metabind inspect --dir .` shows the same
before anything is created. Everything lands as drafts: the project doesn't
work until the secrets are bound, and nothing serves traffic until you
publish.

The start-to-finish walkthrough — CLI setup, secrets, publishing, the
project thumbnail, and running the iOS app — is
[the demo tutorial](../README.md). For installing and signing in to the CLI
itself, see [Install and Sign In](https://docs.metabind.ai/cli/install).

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
   metabind validate component components/view/ProductCard.ts
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
