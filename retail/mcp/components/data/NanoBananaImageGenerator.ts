/**
 * Generates an image via Google's Gemini "nano banana" image models using a text
 * prompt and optional reference images.
 *
 * Calls the Gemini Interactions API
 * (https://generativelanguage.googleapis.com/v1beta/interactions) with the fast
 * gemini-3.1-flash-lite-image model.
 *
 * Reference images are passed by URL (the Interactions API resolves public URLs
 * directly, no base64 upload needed).
 *
 * Returns the result as a base64 data URL. Requires a GEMINI_API_KEY secret.
 */

const GEMINI_MODEL = "gemini-3.1-flash-lite-image"
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"

export default defineDataSource({
    metadata: {
        title: "Nano Banana Image Generator",
        description: "Generate an image using Google Gemini (nano banana) from a prompt and optional reference images. Never call this tool directly from the agent. It's only ever used by ui tools directly."
    },
    properties: {
        prompt: {
            type: "string",
            description: "Prompt used to generate the image"
        },
        size: {
            type: "string",
            description: "Optional aspect ratio for the generated image, e.g. \"1:1\", \"16:9\", \"4:3\", \"3:2\". Defaults to 1:1."
        },
        imageUrls: {
            type: "array",
            description: "Optional list of reference image URLs",
            valueType: {
                type: "string"
            }
        }
    },
    output: {
        result: {
            type: "string",
            description: "Generated image as a data URL"
        },
        size: {
            type: "string",
            description: "Aspect ratio of the generated image"
        },
        cached: {
            type: "boolean",
            description: "Always false — nano banana calls Gemini directly with no cache proxy."
        },
        cacheStatus: {
            type: "string",
            description: "Always empty — retained for contract parity with open_aiimage_generator."
        },
        error: {
            type: "string",
            description: "Any error message"
        }
    },
    annotations: {},
    handler: async (props, env) => {
        const apiKey = env.secrets?.GEMINI_API_KEY;
        const prompt = props.prompt ?? "Generate an image";

        if (!apiKey) {
            return { result: "", size: "", cached: false, cacheStatus: "", error: "A GEMINI_API_KEY is required to be added to the secrets of the nano_banana_image_generator tool." };
        }

        const imageUrls = Array.isArray(props.imageUrls)
            ? props.imageUrls.filter(Boolean)
            : [];

        // Aspect ratio; gemini-3.1-flash-lite-image only supports 1K resolution.
        const aspectRatio = (typeof props.size === "string" && props.size.includes(":")) ? props.size : "1:1";

        const input: any[] = [
            { type: "text", text: prompt },
            // Reference images are passed by public URL; the Interactions API resolves them.
            ...imageUrls.map((url) => ({ type: "image", uri: url }))
        ];

        const body = {
            model: GEMINI_MODEL,
            input,
            response_format: {
                type: "image",
                aspect_ratio: aspectRatio,
                image_size: "1K"
            }
        };

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
        };

        // Walks the Interactions response for the generated image's base64 bytes +
        // mime type. Tries the documented convenience path first, then falls back
        // to scanning the steps/content blocks so we tolerate response-shape drift.
        const extractImage = (data: any): { base64: string; mime: string } => {
            const fromBlock = (block: any): { base64: string; mime: string } | null => {
                if (!block || typeof block !== "object") return null;
                const b64 = block.data ?? block.base64 ?? block.b64_json;
                if (typeof b64 === "string" && b64.length > 0) {
                    return { base64: b64, mime: block.mime_type ?? block.mimeType ?? "image/png" };
                }
                return null;
            };

            const roots = [data, data?.interaction].filter(Boolean);
            for (const root of roots) {
                // 1. Convenience property: interaction.output_image
                const direct = fromBlock(root?.output_image);
                if (direct) return direct;

                // 2. Walk steps[].content[] (or steps[].content_block) for an image block
                const steps = Array.isArray(root?.steps) ? root.steps : [];
                for (const step of steps) {
                    const blocks = Array.isArray(step?.content)
                        ? step.content
                        : (step?.content_block ? [step.content_block] : []);
                    for (const block of blocks) {
                        if (block?.type && String(block.type).indexOf("image") === -1) continue;
                        const hit = fromBlock(block);
                        if (hit) return hit;
                    }
                }
            }
            return { base64: "", mime: "image/png" };
        };

        try {
            const res = await fetch(`${GEMINI_BASE_URL}/v1beta/interactions`, {
                method: "POST",
                headers,
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errorText = await res.text();
                return { result: "", size: aspectRatio, cached: false, cacheStatus: "", error: `Gemini API error: ${res.status} ${errorText}` };
            }

            const data = await res.json();
            const { base64, mime } = extractImage(data);

            if (!base64) {
                return { result: "", size: aspectRatio, cached: false, cacheStatus: "", error: "No image returned by Gemini" };
            }

            return {
                result: `data:${mime};base64,${base64}`,
                size: aspectRatio,
                cached: false,
                cacheStatus: "",
                error: ""
            };
        } catch (e: any) {
            return { result: "", size: aspectRatio, cached: false, cacheStatus: "", error: `Gemini request failed: ${e?.message ?? String(e)}` };
        }
    }
});
