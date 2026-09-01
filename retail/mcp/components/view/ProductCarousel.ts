/**
 * Horizontally scrollable carousel of ProductCard components.
 *
 * Pass `productIds` and the view calls the `product_lookup` MCP tool on
 * appear (and whenever the ids change) to hydrate each card. Outside an
 * MCP host the lookup pipeline can't run, so example products are
 * rendered instead — composer previews and dev sandboxes still look
 * meaningful.
 */

// ─── Metadata ─────────────────────────────────────────────

const metadata = {
    title: "Product Carousel",
    public: true
};

// ─── Properties ───────────────────────────────────────────

const properties = {
    productIds: {
        type: "array",
        title: "Product IDs",
        description: "Content ids of the products to show. The view will call `product_lookup` to hydrate each one. Use this after a compact `product_search` to avoid re-shipping full product payloads through the LLM.",
        valueType: { type: "string" },
        defaultValue: [],
        required: true,
        validation: { minItems: 1 }
    }
} satisfies ComponentProperties;

// ─── Types ────────────────────────────────────────────────

type HydratedCard = {
    id: string;
    title: string;
    description: string;
    price: number;
    colors: string[];
    image: string;
};

// Raw row shape returned by the `product_lookup` MCP tool. Fields are all
// optional because we treat the tool as an untrusted external surface.
type LookupProduct = {
    id?: string;
    name?: string;
    price?: number;
    description?: string;
    image?: string;
    colors?: string[];
};

// Result of one `product_lookup` round. `errors` carries per-id failures,
// which are expected and survivable — the model occasionally hands us a
// truncated id. `failed` means the tool call itself never landed, so nothing
// is known about any of the ids in the batch.
type LookupOutcome = {
    products: HydratedCard[];
    errors: string[];
    failed: boolean;
};

// ─── Constants ────────────────────────────────────────────

const DESKTOP_SIZE_STYLES = {
    regular: { height: 540 },
    medium: { height: 410 },
    small: { height: 320 }
};

const MOBILE_SIZE_STYLES = {
    regular: { height: 440 },
    medium: { height: 390 },
    small: { height: 250 }
};

// Used when no MCP host is available (composer preview, dev sandbox). The
// lookup tool can't run there, so render these so the view still looks
// meaningful out of context.
const EXAMPLE_PRODUCTS: HydratedCard[] = [
    {
        id: "cont_example_lumora",
        title: "Lumora Pendant Light",
        description: "Hand-blown ombre glass pendant fading from clear to warm amber. Brass canopy and twisted fabric cord included.",
        price: 289.00,
        image: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/QZhYPftn0yk37E6SV1Iq/lumora-pendant-light.png",
        colors: ["#c78a3a", "#e6c48a", "#b8863a", "#cdb68a"]
    },
    {
        id: "cont_example_terracotta",
        title: "Terracotta Drift Planter",
        description: "Sculptural terracotta with an asymmetric slanted rim and full-bellied body. Matte clay finish for herbs, succulents and small houseplants.",
        price: 79.00,
        image: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/W7yflt7A1gRtvJbLLfs9/terracotta-drift-planter.png",
        colors: ["#c58a6a", "#a86848", "#d9a888", "#7a4a32"]
    },
    {
        id: "cont_example_penumbra",
        title: "Penumbra Candle",
        description: "Soy-wax candle cast into a raw speckled concrete vessel. Industrial-minimalist and reusable after the burn.",
        price: 48.00,
        image: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/Avf2JD2UWdfoiEXUpK6x/penumbra-candle.png",
        colors: ["#b8b3a8", "#8c887d", "#e6e1d0", "#585449"]
    },
    {
        id: "cont_example_stillwater",
        title: "Stillwater Diffuser",
        description: "Sand-coloured stoneware reed diffuser with natural rattan reeds. Quiet home fragrance for bedrooms and calm living spaces.",
        price: 64.00,
        image: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/LfEHmxT7Ccaa2igtBWkX/stillwater-diffuser.png",
        colors: ["#d9cdb4", "#c9bc9e", "#a8834a", "#8a7248"]
    }
];

// ─── Body ─────────────────────────────────────────────────

const BodyContent = defineComponent({
    body: (props: InferProps<typeof properties>, children: Component[]): Component => {

        // Hooks
        const env = useEnvironment();
        const host = useMCPHost();
        const [loaded, setLoaded] = useState<Record<string, HydratedCard>>({});
        const [requested, setRequested] = useState<Record<string, true>>({});

        // Computed
        const sizeStyle = env.sizeStyle ?? 'regular';
        const sizeTable = env?.sizeClass == 'mobile' ? MOBILE_SIZE_STYLES : DESKTOP_SIZE_STYLES;
        const currentStyle = sizeTable[sizeStyle] ?? sizeTable.regular;

        const productIds = (props.productIds ?? []).filter(
            (id): id is string => typeof id === 'string' && id.length > 0
        );

        const resolvedCards: HydratedCard[] = host
            ? productIds.map((id) => loaded[id]).filter((c): c is HydratedCard => Boolean(c))
            : EXAMPLE_PRODUCTS;

        // Side effects
        const hydrate = async () => {
            if (!host || productIds.length === 0) return;

            const missing = productIds.filter((id) => !requested[id] && !loaded[id]);
            if (missing.length === 0) return;

            // Mark requested up-front so a second onChange firing before this
            // fetch resolves doesn't re-dispatch the same ids.
            const nextRequested: Record<string, true> = { ...requested };
            for (const id of missing) nextRequested[id] = true;
            setRequested(nextRequested);

            const { products, errors, failed } = await fetchProducts(host, missing);

            if (errors.length > 0) {
                host.log(failed ? 'error' : 'warning', 'product_lookup incomplete', {
                    requested: missing,
                    resolved: products.map((p) => p.id),
                    errors
                });
            }

            if (failed) {
                // Nothing landed, so nothing is known about these ids — release
                // the marks so a later appear/change can retry them.
                setRequested(withoutIds(nextRequested, missing));
                return;
            }

            // Whatever resolved gets rendered. Ids the lookup couldn't resolve
            // are simply absent from the carousel — one bad id costs one card.
            if (products.length === 0) return;

            const nextLoaded: Record<string, HydratedCard> = { ...loaded };
            for (const p of products) nextLoaded[p.id] = p;
            setLoaded(nextLoaded);
        };

        // Tree
        const cards = resolvedCards.map((card) => ProductCard(card as ProductCardProps));

        return (
            VStack([
                ScrollView({ axis: 'horizontal' }, [                    
                    HStack({ spacing: 20 }, cards).padding(20)
                ])
                    .background(BrandBackground())
                    .frame({ height: currentStyle.height })
            ])
                .onAppear(() => {
                    void hydrate();
                })
                .onChange(productIds.join(','), () => {
                    void hydrate();
                })
        );
    }
});

// ─── Helpers ─────────────────────────────────────────────

function normalizeProductLookup(raw: LookupProduct | null | undefined): HydratedCard | null {
    if (!raw?.id) return null;
    return {
        id: raw.id,
        title: typeof raw.name === 'string' ? raw.name : '',
        // product_search prefixes descriptions with "Oak&Ivory Product:" for
        // LLM grounding — strip it for human rendering.
        description: typeof raw.description === 'string'
            ? raw.description.replace(/^Oak&Ivory Product:\s*/, '')
            : '',
        price: typeof raw.price === 'number' ? raw.price : 0,
        colors: Array.isArray(raw.colors) ? raw.colors : [],
        image: typeof raw.image === 'string' ? raw.image : ''
    };
}

// Calls the `product_lookup` MCP tool and normalizes the response into
// HydratedCards. Pure: no component state, no hooks — the caller wires
// results into local state in its `.onAppear` / `.onChange` handlers.
async function fetchProducts(host: MCPHost, ids: string[]): Promise<LookupOutcome> {
    try {
        const result = await host.toolCall('product_lookup', { ids });
        const fetched: LookupProduct[] = Array.isArray(result?.products) ? result.products : [];

        const products: HydratedCard[] = [];
        for (const raw of fetched) {
            const normalized = normalizeProductLookup(raw);
            if (normalized) products.push(normalized);
        }
        return { products, errors: toErrorList(result?.errors), failed: false };
    } catch (err) {
        return {
            products: [],
            errors: [err instanceof Error ? err.message : String(err)],
            failed: true
        };
    }
}

// The tool declares `errors` as string[], but it crosses an untrusted
// boundary — coerce anything else to a printable form.
function toErrorList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((e) => (typeof e === 'string' ? e : JSON.stringify(e)));
}

// Copy of `marks` without `ids`, so those ids are eligible for a retry.
function withoutIds(marks: Record<string, true>, ids: string[]): Record<string, true> {
    const next: Record<string, true> = {};
    for (const key of Object.keys(marks)) {
        if (!ids.includes(key)) next[key] = true;
    }
    return next;
}

// ─── Previews ────────────────────────────────────────────

const sampleIds = EXAMPLE_PRODUCTS.map((p) => p.id);

const previews = () => [
    Self({ productIds: sampleIds }).previewName('Default'),
    Self({ productIds: sampleIds }).environment('sizeStyle', 'small').previewName('Small')
];

// ─── Export ──────────────────────────────────────────────

export default defineComponent({
    metadata,
    properties,
    previews,
    body: (props, children) => {
        return (
            EnvironmentSizeClass([
                BodyContent(props, children)
            ])
                .colorScheme('light')
        );
    }
});
