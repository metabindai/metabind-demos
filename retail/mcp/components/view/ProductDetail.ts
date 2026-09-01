/**
 * Product detail view. Pass a `productId` and the view calls the
 * `product_lookup` MCP tool on appear (and whenever the id changes) to hydrate
 * the title, price, description, image / video. Outside an MCP host the lookup
 * pipeline can't run, so the example product is rendered instead — composer
 * previews and dev sandboxes still look meaningful.
 *
 * Reviews and features stay as overridable props because `product_lookup`
 * doesn't return them today.
 */

// ─── Metadata ─────────────────────────────────────────────

const metadata = {
    title: "Product Detail",
    description: "A split-out product detail card that looks up a product by id and renders image, CTA, description, features, and reviews",
    public: true
};

// ─── Properties ───────────────────────────────────────────

const properties = {
    productId: {
        type: "string",
        title: "Product ID",
        description: "Content id of the product to display. The view will call `product_lookup` to hydrate it.",
        inspector: {
            control: "singleline",
            placeholder: "cont_1776491113487831"
        },
        required: true
    },
    features: {
        type: "array",
        title: "Features",
        description: "Feature list shown with tick icons. Optional override — `product_lookup` does not return features today. Always try and pass features based off the description/ information you know about the product.",
        valueType: { type: "string" },
        validation: { minItems: 0, maxItems: 8 }
    },
    rating: {
        type: "group",
        title: "Rating",
        description: "Review summary shown below the description. Only provide if you have the data for it.",
        properties: {
            value: {
                type: "string",
                title: "Rating Value",
                description: "Displayed rating text.",
                inspector: { control: "singleline", placeholder: "4.85" }
            },
            count: {
                type: "string",
                title: "Review Count",
                description: "Displayed review count text.",
                inspector: { control: "singleline", placeholder: "23 Reviews" }
            },
            stars: {
                type: "number",
                title: "Star Count",
                description: "Number of filled stars to show.",
                inspector: { control: "slider", step: 1 },
                validation: { min: 0, max: 5 }
            }
        }
    }
} satisfies ComponentProperties;

// ─── Types ────────────────────────────────────────────────

type HydratedProduct = {
    id: string;
    title: string;
    price: number;
    description: string;
    imageUrl: string;
    videoUrl: string;
};

// Raw row shape returned by the `product_lookup` MCP tool. Fields are all
// optional because we treat the tool as an untrusted external surface.
type LookupProduct = {
    id?: string;
    name?: string;
    price?: number;
    description?: string;
    image?: string;
    video?: string;
};

// Result of one `product_lookup` round. `errors` carries per-id failures,
// which are expected and survivable — the model occasionally hands us a
// truncated id. `failed` means the tool call itself never landed, so nothing
// is known about any of the ids in the batch.
type LookupOutcome = {
    products: HydratedProduct[];
    errors: string[];
    failed: boolean;
};

// ─── Constants ────────────────────────────────────────────

// Used when the lookup pipeline hasn't returned yet.
const EMPTY_PRODUCT: HydratedProduct = {
    id: "",
    title: "",
    price: 0,
    description: "",
    imageUrl: "",
    videoUrl: ""
};

// Used when no MCP host is available (composer preview, dev sandbox). The
// lookup tool can't run there, so render this so the view still looks
// meaningful out of context.
const EXAMPLE_PRODUCT: HydratedProduct = {
    id: "cont_example_lounge_chair",
    title: "Lounge Chair",
    price: 128.99,
    description: "A sculpted lounge chair with a bent-ply birch frame and generous olive-green cushions. Light, modern, and quietly architectural.",
    imageUrl: "",
    videoUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/assets/KkAuRbN2VL9tt51h751N/Chair.mp4"
};

const SIZE_CONFIG = {
    mobile: {
        paddingHorizontal: 24,
        featureColumns: 1,
        imageHeight: 280,
        spacing: 20
    },
    default: {
        paddingHorizontal: 48,
        featureColumns: 2,
        imageHeight: 420,
        spacing: 28
    }
};

const tickSvg = `
<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.63076 12C4.27541 12 3.97335 11.8427 3.7246 11.5279L0.273182 7.16305C0.175458 7.04446 0.104386 6.92816 0.0599668 6.81413C0.019989 6.7001 0 6.58152 0 6.45837C0 6.18471 0.0888398 5.95894 0.266519 5.78106C0.444198 5.60318 0.668519 5.51425 0.939478 5.51425C1.24598 5.51425 1.50361 5.6488 1.71238 5.9179L4.60411 9.6807L10.2476 0.499429C10.3632 0.31699 10.4831 0.189282 10.6075 0.116305C10.7318 0.0387685 10.8873 0 11.0739 0C11.3448 0 11.5669 0.086659 11.7402 0.259977C11.9134 0.433295 12 0.654503 12 0.923604C12 1.03307 11.9823 1.14253 11.9467 1.25199C11.9111 1.36146 11.8557 1.47548 11.7801 1.59407L5.54359 11.5005C5.33038 11.8335 5.0261 12 4.63076 12Z" fill="black"/>
</svg>
`;

// ─── Body ─────────────────────────────────────────────────

const BodyContent = defineComponent({
    body: (props: InferProps<typeof properties>, children: Component[]): Component => {

        // Hooks
        const host = useMCPHost();
        const { spacing, imageHeight, paddingHorizontal, featureColumns } = useSizeConfig(SIZE_CONFIG);
        const [loaded, setLoaded] = useState<Record<string, HydratedProduct>>({});
        const [requested, setRequested] = useState<Record<string, true>>({});
        const [error, setError] = useState(false);

        // Computed
        const productId = (props.productId ?? "").trim();
        const hydratedProduct = loaded[productId] ?? EMPTY_PRODUCT;
        const product = host ? hydratedProduct : EXAMPLE_PRODUCT;
        const hasProduct = product.title.length > 0 || product.imageUrl.length > 0 || product.videoUrl.length > 0;
        const hasDescription = product.description.length > 0;
        const hasFeatures = (props.features?.length ?? 0) > 0;
        const hasReviews = !!(props.rating?.value && props.rating?.count);

        // Hydration wrapper: dedupe requested ids, defer lookup to the module-level
        // fetchProducts helper, then fold results into local state.
        const hydrate = async () => {
            if (!host || !productId) return;
            if (requested[productId] || loaded[productId]) return;

            const nextRequested: Record<string, true> = { ...requested, [productId]: true };
            setRequested(nextRequested);
            host.log('info', 'fetching products..', [productId]);

            const { products, errors, failed } = await fetchProducts(host, [productId]);

            if (errors.length > 0) {
                host.log(failed ? 'error' : 'warning', 'product_lookup incomplete', {
                    requested: [productId],
                    resolved: products.map((p) => p.id),
                    errors
                });
            }

            if (failed) {
                // Nothing landed, so nothing is known about this id — release the
                // mark so a later appear/change can retry it.
                setRequested(withoutIds(nextRequested, [productId]));
            }

            // An error alongside a product row is survivable — render the row.
            // The error placeholder is only for having nothing at all to show.
            if (products.length === 0) {
                setError(true);
                return;
            }

            const next: Record<string, HydratedProduct> = { ...loaded };
            for (const p of products) next[p.id] = p;
            setLoaded(next);
        };

        // Tree
        const details = (
            VStack({ spacing, alignment: "leading" }, [
                ProductHeader({ product }),
                DividedSection({ show: hasDescription, spacing }, [
                    ProductDescription({ product })
                ]),
                DividedSection({ show: hasFeatures, spacing }, [
                    ProductFeatures({ features: props.features, columns: featureColumns })
                ]),
                DividedSection({ show: hasReviews, spacing }, [
                    ProductReviews({
                        ratingValue: props.rating?.value,
                        reviewCount: props.rating?.count,
                        starCount: props.rating?.stars
                    })
                ])
            ])
                .frame({ maxWidth: 700, alignment: "leading" })
                .padding("horizontal", paddingHorizontal)
        );

        const hero = (
            VStack({ spacing, alignment: "center" }, [
                ProductImage({ product, height: imageHeight }),
                details
            ])
        );

        const placeholder = LoadingState({ productId, height: imageHeight, error });

        const content = hasProduct ? hero : placeholder;

        return (
            content
                .padding("vertical", 12)
                .background(BrandBackground())
                .onAppear(() => {
                    void hydrate();
                })
                .onChange(productId, ([oldId, newId]) => {
                    void hydrate();
                })
        );
    }
});

// ─── Lockups ──────────────────────────────────────────────

const ProductHeader = (props: { product: HydratedProduct }) => {
    return (
        HStack({ spacing: 24, alignment: "center" }, [
            VStack({ spacing: 6, alignment: "leading" }, [
                Text(props.product.title)
                    .font("title2")
                    .fontWeight("bold")
                    .foregroundStyle(Color("black")),
                Text(formatPrice(props.product.price))
                    .font("body")
                    .foregroundStyle(Color("#7A7A7A"))
            ])
                .frame({ maxWidth: Infinity, alignment: "leading" }),

            Button({
                label: Text("Shop").padding('horizontal', 45).frame({ height: 44 }),
                action: () => {
                    useMCPHost().openLink("https://metabind.ai");
                }
            })
                .background(Color("black"))
                .foregroundStyle(Color("white"))
                .cornerRadius(23)
        ])
    );
};

const ProductImage = (props: { product: HydratedProduct, height: number }) => {
    if (!props.product.imageUrl && !props.product.videoUrl) {
        return Empty();
    }

    const video = Video({
        url: props.product.videoUrl,
        contentMode: "fill",
        loop: true,
        controls: false,
        autoplay: true,
        muted: true
    });

    const image = Image({ url: props.product.imageUrl, contentMode: "fill" }).resizable();

    const media = props.product.videoUrl ? video : image;

    return (
        media
            .frame({ height: props.height })
            .cornerRadius(8)
            .padding("horizontal", 12)
    );
};

const ProductDescription = (props: { product: HydratedProduct }) => {
    return (
        Text(props.product.description)
            .font("body")
            .foregroundStyle(Color("#7A7A7A"))
            .lineSpacing(8)
            .lineLimit(4)
    );
};

const ProductFeatures = (props: { features: string[], columns: number }) => {
    const isMobile = useEnvironment().sizeClass == 'mobile';

    // Group features into rows of `columns` for the two-column desktop layout.
    const rows: string[][] = [];
    for (let i = 0; i < props.features?.length; i += props.columns) {
        rows.push(props.features?.slice(i, i + props.columns));
    }

    const renderRow = (row: string[]) => {
        const left = FeatureItem(row[0]).frame({ maxWidth: Infinity, alignment: "leading" });
        const right = row[1]
            ? FeatureItem(row[1]).frame({ maxWidth: Infinity, alignment: "leading" })
            : Spacer();
        return HStack({ spacing: 32, alignment: "top" }, [left, right]);
    };

    return (
        VStack(
            { spacing: isMobile ? 16 : 28, alignment: "leading" },
            rows.map(renderRow)
        )
    );
};

const ProductReviews = (props: { ratingValue: string, reviewCount: string, starCount?: number }) => {
    const stars = Math.max(0, Math.min(5, props.starCount ?? 0));

    const starRow = HStack(
        { spacing: 10, alignment: "center" },
        Array.from({ length: stars }).map(() =>
            Text("★").font("body").foregroundStyle(Color("#7A7A7A"))
        )
    );

    const summary = (
        Text(`${props.ratingValue} • ${props.reviewCount}`)
            .font("body")
            .foregroundStyle(Color("#7A7A7A"))
    );

    return (
        HStack({ spacing: 20, alignment: "center" }, [starRow, summary])
    );
};

const FeatureItem = (text: string) => {
    // Web rendering needs a slightly larger tick offset to align with the text baseline.
    const tickOffset = useEnvironment().platform == 'web' ? 6 : 2;

    const tick = (
        Image({ svg: tickSvg })
            .frame({ width: 15, height: 15 })
            .opacity(0.25)
            .padding("top", tickOffset)
    );

    const label = (
        Text(text)
            .font("subheadline")
            .lineSpacing(8)
            .foregroundStyle(Color("#7A7A7A"))
            .lineLimit(3)
            .frame({ maxWidth: Infinity, alignment: "leading" })
    );

    return (
        HStack({ spacing: 16, alignment: "top" }, [tick, label])
    );
};

const DividedSection = (props: { show: boolean, spacing: number }, children: Component[]) => {
    if (!props.show) {
        return Empty();
    }

    return (
        VStack({ spacing: props.spacing, alignment: "leading" }, [
            DividerLine(),
            ...children
        ])
    );
};

const DividerLine = () => {
    return (
        Rectangle()
            .fill(Color("#E5E5E5"))
            .frame({ height: 1 })
    );
};

const LoadingState = (props: { productId: string, height: number, error: boolean }) => {
    var message = props.productId ? ProgressView() : Text("No product id");
    if (props.error) {
        message = Text("Product not found");
    }
    return (
        VStack({ spacing: 12, alignment: "center" }, [
            message
                .font("body")
                .foregroundStyle(Color("#7A7A7A"))
        ])
            .frame({ maxWidth: Infinity, alignment: "center" })
            .frame({ height: props.height })
    );
};

// ─── Helpers ──────────────────────────────────────────────

function formatPrice(price: number): string {
    if (!isFinite(price)) return '';

    const isNegative = price < 0;
    const formatted = Math.abs(price).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });

    return `${isNegative ? '-' : ''}$${formatted}`;
}

// product_lookup grounds descriptions with this prefix for the LLM. Strip it
// before showing a human.
function stripGroundingPrefix(description: string): string {
    return description.replace(/^Oak&Ivory Product:\s*/, '');
}

function normalizeProductLookup(raw: LookupProduct | null | undefined): HydratedProduct | null {
    if (!raw?.id) return null;
    return {
        id: raw.id,
        title: typeof raw.name === 'string' ? raw.name : '',
        price: typeof raw.price === 'number' ? raw.price : 0,
        description: typeof raw.description === 'string' ? stripGroundingPrefix(raw.description) : '',
        imageUrl: typeof raw.image === 'string' ? raw.image : '',
        videoUrl: typeof raw.video === 'string' ? raw.video : ''
    };
}

// Calls the `product_lookup` MCP tool and normalizes the response into
// HydratedProducts. Pure: no component state, no hooks — the caller wires
// results into local state in its `.onAppear` / `.onChange` handlers.
async function fetchProducts(host: MCPHost, ids: string[]): Promise<LookupOutcome> {
    try {
        const result = await host.toolCall('product_lookup', { ids });
        const fetched: LookupProduct[] = Array.isArray(result?.products) ? result.products : [];

        const products: HydratedProduct[] = [];
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

// Resolve a size-keyed config table against the current sizeClass, falling
// back to `default`. Wraps `useEnvironment()` so callers don't have to thread
// `env.sizeClass` through manually — destructure at the call site to make
// the consumed tokens visible.
function useSizeConfig<T>(table: { default: T } & Partial<Record<string, T>>): T {
    const { sizeClass } = useEnvironment();
    return (sizeClass && table[sizeClass]) || table.default;
}

// ─── Previews ─────────────────────────────────────────────

const previews = [
    ScrollView([
        Self({
            productId: "cont_1778221760727665",
            features: [
                "Hand-blown ombre glass shade.",
                "Brass canopy and twisted fabric cord.",
                "Bulb sold separately.",
                "Easy ceiling-mount installation."
            ],
            rating: {
                value: "4.85",
                count: "23 Reviews",
                stars: 5
            }
        }).previewName("With features & reviews"),
    ]),

    Self({ productId: "cont_1778221760727665" })
        .previewName("Product id only"),
];

// ─── Export ───────────────────────────────────────────────

export default defineComponent({
    metadata,
    properties,
    body: (props, children) => {
        return EnvironmentSizeClass([
            BodyContent(props, children)
        ]).colorScheme('light')
    },
    previews
});






