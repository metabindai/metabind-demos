/**
 * Generates an image via the OpenAI API using a text prompt and optional reference images.
 * Uses the edits endpoint when reference images are provided, otherwise uses generations.
 * Returns the result as a base64 data URL.
 *
 * Calls go through the metabind-cache OpenAI-compatible proxy, which transparently
 * caches results. Per-call cache controls:
 *   - cache: boolean   — default true; set false to send X-Cache: off (bypass)
 *   - fuzzy: 0..1      — default 0 (exact match only); >0 enables fuzzy match on prompt
 */

const OPENAI_MODEL = "gpt-image-2"
const PROXY_BASE_URL = "https://metabind-cache.dave-48e.workers.dev"

export default defineDataSource({
    metadata: {
        title: "Open AI Image Generator",
        description: "Generate an image using OpenAI from a prompt and optional reference images. Never call this tool directly from the agent. It's only ever used by ui tools directly."
    },
    properties: {
        prompt: {
            type: "string",
            description: "Prompt used to generate the image"
        },
        size: {
            type: "string"
        },
        imageUrls: {
            type: "array",
            description: "Optional list of reference image URLs",
            valueType: {
                type: "string"
            }
        },
        cache: {
            type: "boolean",
            description: "Use the image cache. Default true. Set false to bypass (send X-Cache: off).",
            defaultValue: true
        },
        fuzzy: {
            type: "number",
            description: "Fuzzy-match similarity threshold on the prompt (0..1). 0 = exact match only. 0.97 = near match.",
            defaultValue: 0
        }
    },
    output: {
        result: {
            type: "string",
            description: "Generated image as a data URL"
        },
        size: {
            type: "string",
            description: "Size of the image"
        },
        cached: {
            type: "boolean",
            description: "True if the result was served from the cache (HIT or HIT-FUZZY)."
        },
        cacheStatus: {
            type: "string",
            description: "Raw X-Cache header from the proxy: HIT, HIT-FUZZY, MISS, BYPASS, or ERROR."
        },
        error: {
            type: "string",
            description: "Any error message"
        }
    },
    annotations: {},
    handler: async (props, env) => {
        const apiKey = env.secrets?.OPENAI_API_KEY;
        const prompt = props.prompt ?? "Generate an image";

        if (!apiKey) {
            return { result: "", size: "", cached: false, cacheStatus: "", error: "An OPENAI_API_KEY is required to be added to the secrets of the openai_image_geneator tool." };
        }

        const imageUrls = Array.isArray(props.imageUrls)
            ? props.imageUrls.filter(Boolean)
            : [];

        const hasReferenceImages = imageUrls.length > 0;

        // Use the edits endpoint when reference images are supplied, generations otherwise
        const endpoint = hasReferenceImages
            ? `${PROXY_BASE_URL}/v1/images/edits`
            : `${PROXY_BASE_URL}/v1/images/generations`;

        const body = {
            model: OPENAI_MODEL,
            prompt,
            quality: "low",
            size: props.size ?? "auto",
            n: 1,
            output_format: "png",
            ...(hasReferenceImages && {
                images: imageUrls.map((url) => ({ image_url: url }))
            })
        };

        // Cache control headers. Cache is on by default at the proxy; we only
        // send headers to override defaults.
        const useCache = props.cache !== false;
        const fuzzy = typeof props.fuzzy === "number" ? Math.max(0, Math.min(1, props.fuzzy)) : 0;

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
        };
        if (!useCache) {
            headers["X-Cache"] = "off";
        }
        if (fuzzy != undefined) {
            headers["X-Cache-Fuzzy"] = String(fuzzy);
        }

        const readHeader = (h: any, name: string): string => {
            if (!h) return "";
            if (typeof h.get === "function") return h.get(name) ?? "";
            const lower = name.toLowerCase();
            for (const k of Object.keys(h)) {
                if (k.toLowerCase() === lower) return String(h[k] ?? "");
            }
            return "";
        };

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(body)
            });

            const cacheStatus = readHeader(res.headers, "X-Cache");
            const cached = cacheStatus === "HIT" || cacheStatus === "HIT-FUZZY";

            if (!res.ok) {
                const errorText = await res.text();
                return { result: "", size: "", cached: false, cacheStatus, error: `OpenAI API error: ${res.status} ${errorText}` };
            }

            const data = await res.json();
            const imageBase64 = data?.data?.[0]?.b64_json;

            if (!imageBase64) {
                return { result: "", size: "", cached, cacheStatus, error: "No image returned by OpenAI" };
            }

            return {
                result: `data:image/png;base64,${imageBase64}`,
                size: (data?.size ?? ""),
                cached,
                cacheStatus,
                error: ""
            };

        } catch (err) {
            return {
                result: "",
                size: "",
                cached: false,
                cacheStatus: "",
                error: `Request failed: ${err instanceof Error ? err.message : String(err)}`
            };
        }
    }
});
