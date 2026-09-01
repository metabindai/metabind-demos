# Retail MCP project

The Metabind MCP project behind the Oak&Ivory demo — the tools the assistant
calls and the BindJS components it renders. One file per object:

```
components/data/*.ts     data tools — catalogue search and lookup, inspiration
                         search, image generation
components/view/*.ts     BindJS UI tools rendered natively in the app —
                         product cards, comparisons, pickers, room designs
tools/<kind>/*.json      tool definitions (name, description, secrets, annotations)
metabind.jsonc           project settings; prose in mcp-instructions.md
agent/                   hosted-chat agent settings; prompt in system-prompt.md
.metabind/sdk/           generated typings for authoring components
```

This tree is project **source**, not a checkout of ours. The sync bookkeeping —
`.metabind/state.json`, `metabind.resolved` and `.metabind/secrets.json` — is
per-checkout state and is gitignored, so your first sync establishes a baseline
against *your* project rather than inheriting ours.

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

## Requirements

The `metabind` CLI, **0.9.0 or newer**:

```sh
brew install metabindai/tap/metabind
metabind --version
```

## Install into your organization

```sh
metabind auth login
metabind inspect --dir retail/mcp          # what the tree declares
metabind install --dir retail/mcp --name "Oak & Ivory" --yes
metabind agent set --provider anthropic --key ...   # hosted chat needs an LLM key
metabind publish
```

`install` mints fresh ids and writes the sync baseline
(`.metabind/state.json`) for the project it just created. Use the printed org and
project IDs to configure the client (`apple/Config/Local.xcconfig`).

Pass `--org` and `--project` explicitly on the first sync of a fresh checkout —
there is no baseline to read them from until one exists.

`install` creates components and tools only — it doesn't upload assets or apply
the project settings in `metabind.jsonc`. `metabind.jsonc` names the thumbnail
by asset name, so it resolves only once that asset exists in your project.

The image ships in `assets/files/`, synced down from the project — not read out
of the iOS app. Upload it, then apply the settings:

```sh
metabind asset upload assets/files/project-thumbnail.png
metabind project update <projectId> --from-file metabind.jsonc
```

Assets are pull-only: they are edited in the Studio, `metabind pull --with-assets`
brings the binaries down into `assets/files/`, and `push` discards any edit to
`assets/assets.json`.

## Edit

```sh
metabind validate component components/view/ProductCard.ts
metabind push        # from a checkout pulled from your own project
metabind publish
```

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
