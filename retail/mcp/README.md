# Retail MCP project

The Metabind MCP project behind the Oak&Ivory demo — the tools the assistant
calls and the BindJS components it renders. One file per object:

```
components/data/*.ts     data tools — catalogue search and lookup, inspiration
                         search, two image generators
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

Retail reaches out, so it will not work until you bind three secrets. Two of them
are paid third-party APIs.

| Secret | Used by | What it is |
|---|---|---|
| `METABIND_API_KEY` | `product_search`, `product_lookup`, `inspiration_search` | Reads the `Product Database` content project over the Metabind content API |
| `OPENAI_API_KEY` | `openai_image_generator` | Room and product imagery |
| `GEMINI_API_KEY` | `nano_banana_image_generator` | Alternative image generator |

```sh
metabind env set METABIND_API_KEY --value ...
metabind env set OPENAI_API_KEY --value ...
metabind env set GEMINI_API_KEY --value ...
```

Secret values are KMS-encrypted server-side and never sync into this tree —
`.metabind/secrets.json` records only the names.

The image generators are what make the demo feel alive, but they are also the
expensive part: every room design is an image generation. Leave `OPENAI_API_KEY`
and `GEMINI_API_KEY` unbound and the rest of the assistant still works — product
search, comparison, specs and selection are all catalogue-driven.

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
the project settings in `metabind.jsonc`. The project thumbnail is referenced by
name and has to be uploaded into your own project before it resolves.

## Edit

```sh
metabind validate component components/view/ProductCard.ts
metabind push        # from a checkout pulled from your own project
metabind publish
```

## License

Apache 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
