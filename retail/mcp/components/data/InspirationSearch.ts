/**
 * Searches the Metabind Assets API for assets tagged with the "Reference"
 * tag, optionally narrowed by a query string. Returns the raw asset records,
 * or a compact `{ id, name, url }` shape when `compact` is true.
 */

// Metabind Public Demo Project Constants
const API_BASE = "https://api.metabind.ai";
const ORG_ID = "IgJH0BzIn4LlfnCbcDc7";
const PROJ_ID = "Y676oC7SckYcfyXR54HY";
const REFERENCE_TAG_ID = "XZHUeSyGbxgEaZyxvIES";

// Types

type AssetMetadata = {
    width?: number;
    height?: number;
    duration?: number;
    thumbnailUrl?: string;
    hlsUrl?: string;
    altText?: string;
};

type AssetItem = {
    id?: string;
    name?: string;
    description?: string;
    type?: string;
    url?: string;
    tags?: string[];
    metadata?: AssetMetadata;
};

type CompactAsset = {
    id: string;
    name: string;
    url: string;
};

// Data Source

export default defineDataSource({
    metadata: {
        title: "Inspiration Search",
        description: "Search Reference-tagged assets via the Metabind Assets API"
    },
    properties: {
        searchTerm: {
            type: "string",
            description: "Term to search for"
        },
        compact: {
            type: "boolean",
            description: "Return only { id, name, url } per asset — optimized for token-efficient LLM consumption when only image and title are needed"
        }
    },
    annotations: {},
    handler: async (props, env) => {
        const query = props.searchTerm?.trim() ?? "";
        const compact = props.compact ?? false;

        // Get the API key from the secrets
        const API_KEY = env?.secrets?.METABIND_API_KEY;

        const errors: string[] = [];

        const params = new URLSearchParams();
        params.set("limit", "100");
        params.set("page", "1");
        params.append("tags", REFERENCE_TAG_ID);
        //if (query) params.set("search", query);

        const url = `${API_BASE}/api/v1/organizations/${ORG_ID}/projects/${PROJ_ID}/assets?${params.toString()}`;

        let assets: AssetItem[] = [];
        let lastResponseSample = "";

        try {
            const res = await fetch(url, {
                method: "GET",
                headers: {
                    "x-api-key": API_KEY ?? "",
                    "Accept": "application/json"
                }
            });

            const rawText = await res.text();
            lastResponseSample = rawText.slice(0, 500);

            if (!res.ok) {
                errors.push(`HTTP ${res.status} ${res.statusText}: ${lastResponseSample}`);
            } else {
                let json: unknown = null;
                try {
                    json = JSON.parse(rawText);
                } catch (err) {
                    errors.push(`parse error: ${err instanceof Error ? err.message : String(err)}`);
                }

                // Endpoint may return either an array directly or { data: [...] }
                if (Array.isArray(json)) {
                    assets = json as AssetItem[];
                } else if (json && typeof json === "object" && Array.isArray((json as { data?: unknown[] }).data)) {
                    assets = (json as { data: AssetItem[] }).data;
                }
            }
        } catch (err) {
            errors.push(`network error: ${err instanceof Error ? err.message : String(err)}`);
        }

        const filtered = assets.filter((a) => a?.id);

        const results: AssetItem[] | CompactAsset[] = compact
            ? filtered.map((a): CompactAsset => ({
                id: a.id ?? "",
                name: a.name ?? "",
                url: a.metadata?.thumbnailUrl ?? a.url ?? ""
            }))
            : filtered;

        return {
            assets: results,
            errors,
            debug: {
                searchTerm: query || "(none)",
                tag: REFERENCE_TAG_ID,
                compact,
                totalAssets: assets.length,
                totalResults: results.length,
                requestUrl: url,
                lastResponseSample
            }
        };
    }
});

