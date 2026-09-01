/**
 * Looks up one or more Oak&Ivory products by id via the Metabind Content API.
 * Fetches each id in parallel (no batch endpoint exists), then maps the
 * content rows to the same Product shape returned by ProductSearch so
 * callers can swap between the two tools without reshaping data.
 */

// Metabind Public Demo Project Constants
const API_BASE = "https://api.metabind.ai";
const ORG_ID = "IgJH0BzIn4LlfnCbcDc7";
const PROJ_ID = "Y676oC7SckYcfyXR54HY";

// Content ids are word characters only. Ids arrive from the LLM, which
// occasionally truncates or mangles one ("cont_177822174962?") — those are
// rejected here rather than spent on a request that can only 404.
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Types

type ContentFields = {
    description?: string;
    price?: string | number;
    colors?: string;
    keywords?: string;
    asset?: { image?: { url?: string } };
    assetVideo?: { video?: { url?: string } };
    additionalAssets?: { image?: { url?: string } }[];
    assetModel?: { model?: { url?: string } };
};

type ContentItem = {
    id?: string;
    name?: string;
    content?: ContentFields;
};

type Product = {
    id: string;
    name: string;
    description: string;
    image: string;
    video: string;
    model3D: string;
    additionalImages: string[];
    price: number;
    colors: string[];
    keywords: string[];
};

type LookupResult =
    | { ok: true; item: ContentItem }
    | { ok: false; id: string; error: string };

// Data Source
export default defineDataSource({
    metadata: {
        title: "Product Lookup",
        description: "Fetch one or more Oak&Ivory products by id."
    },
    properties: {
        ids: {
            type: "array",
            valueType: {
                type: "string",
                description: "Product ids to look up"                
            }
        }
    },
    output: {
        products: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    description: { type: "string" },
                    image: { type: "string" },
                    video: { type: "string" },
                    model3D: { type: "string" },
                    additionalImages: { type: "array", valueType: { type: "string" } },
                    price: { type: "number" },
                    colors: { type: "array", valueType: { type: "string" } },
                    keywords: { type: "array", valueType: { type: "string" } }
                }
            }
        },
        errors: { type: "array", valueType: { type: "string" } },
        debug: {
            type: "group",
            properties: {
                requested: { type: "integer" },
                fetched: { type: "integer" }
            }
        }
    },
    annotations: {
        readOnlyHint: true,
        idempotentHint: true
    },
    handler: async (props, env) => {
        const rawIds = Array.isArray(props.ids) ? props.ids : [];
        const candidates = Array.from(
            new Set(
                rawIds
                    .filter((id): id is string => typeof id === "string")
                    .map((id) => id.trim())
                    .filter(Boolean)
            )
        );

        const API_KEY = env?.secrets?.METABIND_API_KEY;
        const errors: string[] = [];

        // Partition rather than bail: one malformed id must never cost the
        // caller the ids that are fine.
        const ids: string[] = [];
        for (const id of candidates) {
            if (ID_PATTERN.test(id)) ids.push(id);
            else errors.push(`${id}: skipped, not a valid content id`);
        }

        if (ids.length === 0) {
            return {
                products: [],
                errors: errors.length > 0 ? errors : ["no ids provided"],
                debug: { requested: candidates.length, fetched: 0 }
            };
        }

        const results = await Promise.all(
            ids.map(async (id): Promise<LookupResult> => {
                const url = `${API_BASE}/api/v1/organizations/${ORG_ID}/projects/${PROJ_ID}/content/${id}`;
                try {
                    const res = await fetch(url, {
                        method: "GET",
                        headers: {
                            "x-api-key": API_KEY ?? "",
                            "Content-Type": "application/json"
                        }
                    });
                    if (!res.ok) {
                        let body = "";
                        try { body = await res.text(); } catch { /* ignore */ }
                        return { ok: false, id, error: `HTTP ${res.status} ${res.statusText}${describeBody(body)}` };
                    }
                    const json = await res.json() as { data?: ContentItem };
                    const item = json?.data;
                    if (!item?.id) {
                        return { ok: false, id, error: "missing data in response" };
                    }
                    return { ok: true, item };
                } catch (err) {
                    return { ok: false, id, error: err instanceof Error ? err.message : String(err) };
                }
            })
        );

        // Per-id failures are collected, never thrown. A caller asking for five
        // products and getting four back is a partial success, not an outage.
        const products: Product[] = [];
        for (const r of results) {
            if (r.ok) {
                products.push(mapContentToProduct(r.item));
            } else {
                errors.push(`${r.id}: ${r.error}`);
            }
        }

        // Preserve input order
        const order = new Map(ids.map((id, i) => [id, i]));
        products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

        return {
            products,
            errors,
            debug: {
                requested: candidates.length,
                fetched: products.length
            }
        };
    }
});

// Condense an error body to one readable clause. The Content API returns
// nested JSON; the `message` is the only part worth surfacing.
function describeBody(body: string): string {
    if (!body) return "";
    try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        const message = parsed?.error?.message;
        if (typeof message === "string" && message.length > 0) return `: ${message}`;
    } catch { /* not JSON — fall through to the raw body */ }
    return `: ${body.slice(0, 200)}`;
}

// Mapping

function mapContentToProduct(item: ContentItem): Product {
    const c = item.content ?? {} as ContentFields;

    return {
        id: item.id ?? "",
        name: item.name ?? "",
        description: "Oak&Ivory Product:" + (c.description ?? ""),
        image: c.asset?.image?.url ?? "",
        video: c.assetVideo?.video?.url ?? "",
        model3D: c.assetModel?.model?.url ?? "",
        additionalImages: (c.additionalAssets ?? []).map((a) => a?.image?.url ?? "").filter(Boolean),
        price: parseFloat(String(c.price ?? "0")) || 0,
        colors: String(c.colors ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        keywords: String(c.keywords ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    };
}
