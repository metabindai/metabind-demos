/**
 * CacheImage — wrap an image cache around expensive image generation.
 *
 * Usage:
 *   - Pass `params` (JSON string keyed by your generation inputs, e.g.
 *     { prompt, model, size, style, quality, ... }).
 *   - If the image is already cached, returns the cached base64.
 *   - On miss: if `image_base64` is supplied, stores it and echoes it back.
 *     Otherwise returns hit=false with an empty result so the caller can
 *     generate the image and pass it back in a follow-up call.
 *
 * Backed by the metabind-cache Cloudflare Worker:
 * https://github.com/.../metabind-cache (POST /cache/lookup, POST /cache).
 */

const CACHE_BASE_URL = "https://metabind-cache.dave-48e.workers.dev"

export default defineDataSource({
    metadata: {
        title: "Cache Image",
        description: "Look up or store a generated image by its generation params. Returns base64 on hit; stores and echoes on miss when base64 is provided."
    },
    properties: {
        params: {
            type: "string",
            description: "JSON-stringified bag of generation params used as the cache key (e.g. {\"prompt\":\"...\",\"model\":\"...\",\"size\":\"...\"})."
        },
        image_base64: {
            type: "string",
            description: "Optional base64 image to store on cache miss. Bare or 'data:image/png;base64,...' both accepted."
        },
        fuzzy: {
            type: "number",
            description: "Fuzzy match threshold (0..1). 0 or omitted = exact match only. 0.97 is a common default."
        },
        content_type: {
            type: "string",
            description: "Content type used when storing (default image/png)."
        }
    },
    output: {
        result: {
            type: "string",
            description: "Base64 image data (data URL form). Empty string on miss without store."
        },
        hit: {
            type: "boolean",
            description: "True when the lookup matched an existing entry."
        },
        match: {
            type: "string",
            description: "'exact', 'fuzzy', 'stored', or '' on pure miss."
        },
        score: {
            type: "number",
            description: "Similarity score, present for fuzzy matches."
        },
        image_url: {
            type: "string",
            description: "Worker-relative URL for the raw image bytes (e.g. /image/<hash>)."
        },
        exact_hash: {
            type: "string",
            description: "64-char hex hash of the canonicalized params."
        },
        error: {
            type: "string",
            description: "Error message if the request failed."
        }
    },
    annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        idempotentHint: true
    },
    handler: async (props, env) => {
        const empty = {
            result: "",
            hit: false,
            match: "",
            score: 0,
            image_url: "",
            exact_hash: "",
            error: ""
        }

        let params: Record<string, unknown>
        try {
            params = JSON.parse(props.params ?? "")
            if (!params || typeof params !== "object" || Array.isArray(params)) {
                return { ...empty, error: "params must be a JSON object string" }
            }
        } catch (err) {
            return { ...empty, error: `Invalid JSON in params: ${err instanceof Error ? err.message : String(err)}` }
        }

        const fuzzy = typeof props.fuzzy === "number" && props.fuzzy > 0 ? props.fuzzy : false
        const contentType = props.content_type || "image/png"
        const incoming = props.image_base64 ?? ""

        try {
            const lookupRes = await fetch(`${CACHE_BASE_URL}/cache/lookup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ params, fuzzy, include_base64: true })
            })

            if (lookupRes.ok) {
                const data = await lookupRes.json()
                const b64 = data?.image_base64 ?? ""
                const ct = data?.content_type || contentType
                const result = b64.startsWith("data:") ? b64 : (b64 ? `data:${ct};base64,${b64}` : "")
                return {
                    result,
                    hit: true,
                    match: data?.match ?? "",
                    score: typeof data?.score === "number" ? data.score : 0,
                    image_url: data?.image_url ?? "",
                    exact_hash: data?.exactHash ?? "",
                    error: ""
                }
            }

            if (lookupRes.status !== 404) {
                const txt = await lookupRes.text()
                return { ...empty, error: `Lookup failed: ${lookupRes.status} ${txt}` }
            }
        } catch (err) {
            return { ...empty, error: `Lookup request failed: ${err instanceof Error ? err.message : String(err)}` }
        }

        if (!incoming) {
            return empty
        }

        try {
            const storeRes = await fetch(`${CACHE_BASE_URL}/cache`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    params,
                    image_base64: incoming,
                    content_type: contentType
                })
            })

            if (!storeRes.ok) {
                const txt = await storeRes.text()
                return { ...empty, error: `Store failed: ${storeRes.status} ${txt}` }
            }

            const data = await storeRes.json()
            const result = incoming.startsWith("data:") ? incoming : `data:${contentType};base64,${incoming}`
            return {
                result,
                hit: false,
                match: "stored",
                score: 0,
                image_url: data?.image_url ?? "",
                exact_hash: data?.exactHash ?? "",
                error: ""
            }
        } catch (err) {
            return { ...empty, error: `Store request failed: ${err instanceof Error ? err.message : String(err)}` }
        }
    }
})
