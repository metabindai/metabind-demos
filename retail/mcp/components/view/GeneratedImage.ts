/**
 * Wraps `nano_banana_image_generator`. Owns the call, the state machine
 * (idle → generating → generated | error), and the three rendered
 * states (loading placeholder, error panel via ToolErrorMessage,
 * generated image).
 *
 * Re-runs whenever the `imageUrls` array content changes. Outside an
 * MCP host (composer preview, dev sandbox) the tool can't run, so
 * `fallbackImageUrl` is rendered if provided.
 */

const properties = {
    imageUrls: {
        type: "array",
        title: "Image URLs",
        description: "Source images fed into the generator. The generator is invoked once a non-empty array arrives.",
        valueType: { type: "string" }
    },
    prompt: {
        type: "string",
        title: "Prompt",
        description: "Generation prompt passed to the image tool."
    },
    size: {
        type: "string",
        title: "Size",
        description: "Optional output size, e.g. \"1536x1024\". Omit to use the tool's default."
    },
    cache: {
        type: "boolean",
        title: "Cache",
        description: "Pass-through for the generator's cache flag. Defaults to true."
    },
    fuzzy: {
        type: "number",
        title: "Fuzzy",
        description: "Pass-through for the generator's fuzzy parameter. Defaults to 0."
    },
    contentMode: {
        type: "string",
        title: "Content Mode",
        description: "How the rendered image fills its frame: \"fit\" (default) or \"fill\"."
    },
    placeholderHeight: {
        type: "number",
        title: "Placeholder Height",
        description: "Height of the loading rectangle while the generator is running. Defaults to 360."
    },
    fallbackImageUrl: {
        type: "string",
        title: "Fallback Image URL",
        description: "Shown when there's no MCP host (composer preview / sandbox)."
    },
    loadingView: {
        type: "component",
        title: "Loading View",
        description: "Optional custom view rendered while the generator is running. Defaults to a white panel with a progress indicator."
    }
} satisfies ComponentProperties;

const body = (props: InferProps<typeof properties>): Component => {
    // Hooks
    const host = useMCPHost();
    const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // JSON-stringified imageUrls of the last attempted generation. Used as a
    // cheap dependency key so we re-run when the inputs change but not when
    // the component just re-renders.
    const [lastKey, setLastKey] = useState<string>('');

    // Computed
    const imageUrls = props.imageUrls ?? [];
    const prompt = (props.prompt ?? '').trim();
    const cache = props.cache ?? true;
    const fuzzy = props.fuzzy ?? 0;
    const contentMode = (props.contentMode ?? 'fit') as 'fit' | 'fill';
    const placeholderHeight = props.placeholderHeight ?? 360;
    // Key on both imageUrls + prompt so a caller-side prompt edit retriggers
    // generation even if the source images haven't changed.
    const key = JSON.stringify({ imageUrls, prompt });
    const ready = imageUrls.length > 0 && prompt.length > 0;

    // Side effects
    const generate = async () => {
        if (!host || !ready) return;
        if (generating) return;
        if (key === lastKey) return;

        setLastKey(key);
        setGenerating(true);
        setError(null);

        try {
            const args: Record<string, any> = {
                imageUrls,
                prompt,
                cache,
                fuzzy
            };
            if (props.size) args.size = props.size;

            const result = await host.toolCall('nano_banana_image_generator', args);

            if (result?.error && result.error?.length > 0) {
                setError(result.error);
            } else if (result?.result) {
                setGeneratedUrl(result.result);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setGenerating(false);
        }
    };

    // Tree
    if (!host) {
        // No MCP host — preview / sandbox mode.
        if (props.fallbackImageUrl) {
            return (
                Image({ url: props.fallbackImageUrl, contentMode })
                    .resizable()
                    .frame({ maxWidth: Infinity })
            );
        }
        return Empty();
    }

    const defaultLoadingView = (
        Rectangle()
            .fill(Color("white"))
            .frame({ minHeight: placeholderHeight })
            .cornerRadius(4)
            .overlay(ProgressView())
    );
    const loadingView = props.loadingView ?? defaultLoadingView;

    const errorView = ToolErrorMessage({
        message: error ?? '',
        minHeight: placeholderHeight
    });

    const imageView = generatedUrl ? (
        Image({ url: generatedUrl, contentMode })
            .resizable()
            .frame({ maxWidth: Infinity })
    ) : Empty();

    const content = error
        ? errorView
        : generating
            ? loadingView
            : generatedUrl
                ? imageView
                : Empty();

    return (
        content
            .onAppear(() => { void generate(); })
            .onChange(key, () => { void generate(); })
    );
};

const previews = [
    Self({
        imageUrls: [],
        prompt: "",
        fallbackImageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/assets/PtlHc3zPpDe2CMrdjB7W/dimension_spec_example.png"
    }).previewName("Fallback (no host)"),
    Self({
        imageUrls: [],
        prompt: ""
    }).previewName("Idle (empty)")
];

export default defineComponent({
    metadata: {
        title: "Generated Image",
        description: "Renders an image produced by nano_banana_image_generator, owning the call lifecycle and error/loading UI."
    },
    properties,
    body,
    previews
});

