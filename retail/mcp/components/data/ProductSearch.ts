/**
 * Searches products via the Metabind Content API, paginating through
 * results and deduplicating by id. In compact mode (default) each result
 * is reduced to { id, description } so the LLM can identify products
 * without the full payload — those ids feed UI tools that take product ids.
 */

// Metabind Public Demo Project Constants
const API_BASE = "https://api.metabind.ai";
const ORG_ID = "IgJH0BzIn4LlfnCbcDc7";
const PROJ_ID = "Y676oC7SckYcfyXR54HY";

// Types

type ContentFields = {
    description?: string;
    price?: string | number;
    colors?: string;
    keywords?: string;
    asset?: { image?: { url?: string } };
    assetVideo?: { video?: { url?: string } };
    additionalAssets: { image?: { url?: string } }[];
    assetModel: { model?: { url?: string } };
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

// Data Source

export default defineDataSource({
    metadata: {
        title: "Product Search",
        description: "Semantic product search via Metabind Content API"
    },
    properties: {
        searchTerm: {
            type: "string",
            description: "Term to search for"
        },
        needsImage: {
            type: "boolean",
            description: "Only return products that have a non-empty image"
        },
        needsVideo: {
            type: "boolean",
            description: "Only return products that have a non-empty video"
        },
        compact: {
            type: "boolean",
            defaultValue: true,
            description: "When true (default) return only { id, description } per product — enough for the LLM to identify each result. Those ids can then be passed to any UI tool that accepts product ids. Set false to receive the full product payload (image, video, price, colors, etc.)."
        }
    },
    output: {
        products: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    id: { type: "string" },
                    description: { type: "string" },
                    name: { type: "string" },
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
        errors: { type: "array", valueType: { type: "string" } }
    },
    annotations: {},
    handler: async (props, env: DataSourceEnvironment) => {
        const query = props.searchTerm?.trim() ?? "";
        const needsImage = props.needsImage ?? false;
        const needsVideo = props.needsVideo ?? false;
        const compact = props.compact ?? true;

        // Get the API key from the secrets
        const API_KEY = env?.secrets?.METABIND_API_KEY;

        const errors: string[] = [];
        const url = `${API_BASE}/api/v1/organizations/${ORG_ID}/projects/${PROJ_ID}/content/search`;

        const allItems: ContentItem[] = [];
        const seenIds = new Set<string>();
        const seenKeys = new Set<string>();

        let lastKey: string | undefined;
        let pagesFetched = 0;
        let lastRequestBody = "";
        let lastResponseSample = "";

        const MAX_PAGES = 10;

        // Paginate through results, deduplicating by ID
        for (let page = 0; page < MAX_PAGES; page++) {
            const body: Record<string, unknown> = {
                filter: {
                    status: { in: ["published", "modified"] }
                },
                limit: 100,
                pagination: {
                    limit: 100,
                    ...(lastKey ? { lastKey } : { page: 1 })
                },
                ...(query ? { query } : {})
            };

            lastRequestBody = JSON.stringify(body);

            let res: Response;
            try {
                res = await fetch(url, {
                    method: "POST",
                    headers: {
                        "x-api-key": API_KEY ?? "",
                        "Content-Type": "application/json"
                    },
                    body: lastRequestBody
                });
            } catch (err) {
                errors.push(`page ${page} network error: ${err instanceof Error ? err.message : String(err)}`);
                break;
            }

            if (!res.ok) {
                let resBody = "";
                try { resBody = await res.text(); } catch { /* ignore */ }
                lastResponseSample = resBody.slice(0, 500);
                errors.push(`page ${page} HTTP ${res.status} ${res.statusText}: ${lastResponseSample}`);
                break;
            }

            let json: { data?: unknown[]; pagination?: { lastKey?: string } } = {};
            try {
                const rawText = await res.text();
                lastResponseSample = rawText.slice(0, 500);
                json = JSON.parse(rawText);
            } catch (err) {
                errors.push(`page ${page} parse error: ${err instanceof Error ? err.message : String(err)}`);
                break;
            }

            pagesFetched++;

            const pageItems = Array.isArray(json?.data) ? json.data as ContentItem[] : [];

            for (const item of pageItems) {
                if (!item?.id || seenIds.has(item.id)) continue;
                seenIds.add(item.id);
                allItems.push(item);
            }

            const nextKey = json?.pagination?.lastKey;
            if (!nextKey || typeof nextKey !== "string" || seenKeys.has(nextKey) || pageItems.length === 0) {
                break;
            }

            seenKeys.add(nextKey);
            lastKey = nextKey;
        }

        // Map, filter, score and sort all collected items
        const fullProducts = allItems
            .filter((item) => item?.id)
            .map(mapContentToProduct)
            .filter((p) => !needsImage || p.image.trim())
            .filter((p) => !needsVideo || p.video.trim());

        // In compact mode strip everything but id + description so the LLM
        // gets enough to reason about each result without paying the token
        // cost of image/video/colors/etc. Callers pass the ids back through
        // UI tools that accept product ids when they need to render.
        const products = compact
            ? fullProducts.map((p) => ({
                id: p.id,
                description: `$${p.price} -` + `${p.name}:` + p.description
            }))
            : fullProducts;

        return {
            products,
            errors
        };
    }
});

// Mapping

function mapContentToProduct(item: ContentItem): Product {
    const c = item.content ?? {} as ContentFields;

    return {
        id: item.id ?? "",
        name: item.name ?? "",
        description: (c.description ?? ""),
        image: c.asset?.image?.url ?? "",
        video: c.assetVideo?.video?.url ?? "",
        model3D: c.assetModel?.model?.url ?? "",
        additionalImages: (c.additionalAssets ?? []).map((a) => a?.image?.url),
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
