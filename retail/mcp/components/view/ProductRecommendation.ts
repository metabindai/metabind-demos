/**
 * Editorial product recommendation list. Pass `productIds` and the view
 * calls the `product_lookup` MCP tool on appear (and whenever the ids
 * change) to hydrate each product's title and image. Outside an MCP host
 * the lookup pipeline can't run, so example products are rendered instead
 * — composer previews and dev sandboxes still look meaningful.
 *
 * `descriptions` is the per-product rationale ("Why we recommend this
 * product"), positionally aligned against `productIds`. The overall
 * `description` and `keywordSummary` set the editorial frame for the
 * whole set.
 */

// ─── Metadata ─────────────────────────────────────────────

const metadata = {
    title: "ProductRecommendationView",
    description: "Presents product recommendations",
    public: true
};

// ─── Properties ───────────────────────────────────────────

const properties = {
    productIds: {
        type: "array",
        title: "Product IDs",
        description: "Content ids of the products to recommend. The view will call `product_lookup` to hydrate the title and image for each one.",
        valueType: { type: "string" },
        defaultValue: [],
        required: true,
        validation: { minItems: 1 }
    },
    descriptions: {
        type: "array",
        title: "Recommendation Descriptions",
        description: "Per-product rationale, positionally aligned with `productIds`. Each entry explains why this product is being recommended in the context of the overall summary.",
        valueType: { type: "string" },
        defaultValue: [],
        required: true,
        validation: { minItems: 1 }
    },
    keywordSummary: {
        type: "string",
        title: "Keyword Summary",
        description: "Give a summary of what you've suggested in 2 - 4 words. i.e. Earthy, Tonal, Calm."
    },
    description: {
        type: "string",
        title: "Description",
        description: "Overall framing paragraph for the recommendation set."
    }
} satisfies ComponentProperties;

// ─── Types ────────────────────────────────────────────────

type HydratedProduct = {
    id: string;
    title: string;
    imageUrl: string;
};

// Raw row shape returned by the `product_lookup` MCP tool. Fields are all
// optional because we treat the tool as an untrusted external surface.
type LookupProduct = {
    id?: string;
    name?: string;
    price?: number;
    description?: string;
    image?: string;
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

type RecommendationRow = {
    product: HydratedProduct;
    description: string;
    align: "left" | "right";
};

// ─── Constants ────────────────────────────────────────────

const circleSVG = `
<svg width="188" height="91" viewBox="0 0 188 91" fill="none" xmlns="http://www.w3.org/2000/svg">
<path opacity="0.11" d="M1.28943 68.1667C18.1878 110.148 180.562 88.4877 187.433 49.5206C198.262 -11.8887 50.5232 -6.30601 29.4658 13.7916C28.6859 14.5359 28.8135 15.9109 29.4658 15.6153C86.5305 -10.2511 190.468 6.08755 181.663 49.5206C171.509 82.6073 5.1487 106.278 4.47425 60.7232C4.03018 30.7289 78.5122 2.47739 132.392 11.4841C134.003 11.1119 132.735 9.48444 130.968 9.13933C73.1917 -0.472797 -11.4632 28.1127 1.28943 68.1667Z" fill="black"/>
</svg>
`;

const BACKGROUND_TEXTURE_URL = "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/components/h63fO5EeUDK2l38vTlas/latest/assets/udFg65MV9EZK2k4H4vqA/bg-texture.jpg";

const EMPTY_PRODUCT: HydratedProduct = {
    id: "",
    title: "",
    imageUrl: ""
};

// Used when no MCP host is available (composer preview, dev sandbox). The
// lookup tool can't run there, so render these so the view still looks
// meaningful out of context.
const EXAMPLE_PRODUCTS: HydratedProduct[] = [
    {
        id: "cont_example_siena_cushion",
        title: "Siena Cushion Set",
        imageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/assets/P4W8G12dIc7F6XTCRRWm/canopy-bed-lined-set-green.png"
    },
    {
        id: "cont_example_terracotta_planter",
        title: "Terracotta Drift Planter",
        imageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/W7yflt7A1gRtvJbLLfs9/terracotta-drift-planter.png"
    },
    {
        id: "cont_example_stillwater",
        title: "Stillwater Diffuser",
        imageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/LfEHmxT7Ccaa2igtBWkX/stillwater-diffuser.png"
    }
];

const EXAMPLE_DESCRIPTIONS = [
    "Introduces texture and subtle tonal variation without breaking the palette.",
    "Sculptural terracotta with an asymmetric rim — adds organic weight to the corner.",
    "Quiet, sand-coloured fragrance vessel that reinforces the calm, earthy mood."
];

const SIZE_CONFIG = {
    mobile: {
        columns: 1,
        descriptionPadding: 20,
        imageSize: 150,
        padding: 20,
        productSpacing: 20
    },
    default: {
        columns: 2,
        descriptionPadding: 100,
        imageSize: 200,
        padding: 40,
        productSpacing: 40
    }
};

// ─── Body ─────────────────────────────────────────────────

const BodyContent = defineComponent({
    body: (props: InferProps<typeof properties>, children: Component[]): Component => {
        // Hooks
        const host = useMCPHost();
        const [loaded, setLoaded] = useState<Record<string, HydratedProduct>>({});
        const [requested, setRequested] = useState<Record<string, true>>({});
        const [unresolved, setUnresolved] = useState<Record<string, true>>({});
        const { columns, descriptionPadding, imageSize, padding, productSpacing } = useSizeConfig(SIZE_CONFIG);

        // Computed
        const productIds = (props.productIds ?? []).filter(
            (id): id is string => typeof id === "string" && id.length > 0
        );
        const descriptions = props.descriptions ?? [];

        // Ids the lookup has definitively failed on drop out of the list — a
        // permanently blank row reads as a rendering bug.
        const visibleIds = productIds.filter((id) => !unresolved[id]);

        const hydratedProducts: HydratedProduct[] = host
            ? visibleIds.map((id) => loaded[id] ?? { ...EMPTY_PRODUCT, id })
            : EXAMPLE_PRODUCTS;

        const rowDescriptions = host ? descriptions : EXAMPLE_DESCRIPTIONS;

        // `descriptions` is positional against the *original* productIds, so a
        // dropped row must not shift the copy on the ones after it. Alternating
        // alignment stays keyed to the visible index.
        const descriptionSources: number[] = host
            ? visibleIds.map((id) => productIds.indexOf(id))
            : hydratedProducts.map((_, i) => i);

        const rows: RecommendationRow[] = hydratedProducts.map((product, index) => ({
            product,
            description: rowDescriptions[descriptionSources[index] ?? index] ?? "",
            align: index % 2 === 0 ? "left" : "right"
        }));

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
                host.log(failed ? "error" : "warning", "product_lookup incomplete", {
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

            // Whatever resolved gets rendered; the rest are marked unresolved so
            // they stop occupying a row.
            const resolvedIds = products.map((p) => p.id);
            const missed = missing.filter((id) => !resolvedIds.includes(id));
            if (missed.length > 0) {
                const nextUnresolved: Record<string, true> = { ...unresolved };
                for (const id of missed) nextUnresolved[id] = true;
                setUnresolved(nextUnresolved);
            }

            if (products.length === 0) return;

            const nextLoaded: Record<string, HydratedProduct> = { ...loaded };
            for (const p of products) nextLoaded[p.id] = p;
            setLoaded(nextLoaded);
        };

        // Tree
        const title = (
            Text("Your Space Recommendations")
                .font(BrandScriptFont())
                .opacity(0.5)
                .frame({ maxWidth: Infinity, alignment: "leading" })
        );

        const intro = (
            VStack({ spacing: 20 }, [
                title,
                Text(props.description ?? "")
                    .padding("trailing", 100)
            ])
        );

        const productRows = rows.map((row, index) =>
            ProductRow({
                product: row.product,
                description: row.description,
                align: row.align,
                iconSize: imageSize,
                columns: columns
            })
        );

        return (
            VStack({ spacing: 20 }, [
                LogoImage()
                    .padding(20)
                    .frame({ maxWidth: Infinity, alignment: "trailing" }),

                VStack({ spacing: 60 }, [
                    intro,
                    KeywordSummaryLockup({ title: props.keywordSummary ?? "" }),
                    VStack({ spacing: productSpacing }, productRows)
                ])
                    .frame({ maxWidth: 600 })
            ])
                .lineSpacing(8)
                .padding(padding)
                .frame({ maxWidth: Infinity })
                .background(
                    Image({ url: BACKGROUND_TEXTURE_URL })
                        .resizable()
                        .frame({ maxWidth: Infinity, maxHeight: Infinity })
                        .opacity(0.5)
                )
                .background(Color("#F1F0EB"))
                .onAppear(() => {
                    void hydrate();
                })
                .onChange(productIds.join(","), () => {
                    void hydrate();
                })
        );
    }
});

// ─── Lockups ──────────────────────────────────────────────

const KeywordSummaryLockup = defineComponent({
    properties: {
        title: {
            type: "string"
        }
    },
    body: (props) => {
        return (
            ZStack([
                Text(props.title)
                    .opacity(0.5)
                    .overlay(
                        VStack([
                            Image({ svg: circleSVG })
                        ])
                            .offset({ x: 25, y: -5 })
                            .scaleEffect(1.0)
                    )
                    .frame({ maxWidth: Infinity, alignment: "trailing" })
            ])
                .frame({ maxWidth: Infinity, alignment: "trailing" })
                .font(BrandScriptFont())
        );
    }
});

const ProductRow = (props: {
    product: HydratedProduct;
    description: string;
    align: "left" | "right";
    iconSize: number,
    columns: number
}) => {
    const image = (
        Image({ url: props.product.imageUrl })
            .resizable()
            .frame({ width: props.iconSize, height: props.iconSize })
            .cornerRadius(8)
    );

    if (props.columns == 1) {

        const lockup = (
            VStack({ alignment: 'leading', spacing: 4 }, [
                Text(props.product.title)
                    .font('title3')
                    .fontWeight('semibold')
                    .frame({ maxWidth: Infinity, alignment: 'leading' })
                    .lineSpacing(2),
                Text(props.description).font('subheadline').frame({ maxWidth: Infinity, alignment: 'leading' })
                    .lineSpacing(8)
                ,
            ])
        )

        let alignment = (props.align == 'left' ? 'leading' : 'trailing') as HorizontalAlignment
        return (
            HStack({ spacing: 16, alignment: 'center' }, [
                image, lockup
            ])
                .frame({ maxWidth: Infinity, alignment: alignment })
        )
    }

    const lockup = (
        VStack({ spacing: 4 }, [
            Text(props.product.title || "—")
                .font("title2")
                .fontWeight("semibold")
                .frame({ maxWidth: Infinity, alignment: "leading" }),
            Text(props.description)
                .font("subheadline")
                .frame({ maxWidth: Infinity, alignment: "leading" })
                .lineSpacing(15)
        ])
    );

    return props.align === "left"
        ? HStack({ spacing: 40 }, [image, lockup])
        : HStack({ spacing: 40 }, [lockup, image]);
};

// ─── Helpers ──────────────────────────────────────────────

// Resolve a size-keyed config table against the current sizeClass, falling
// back to `default`. Wraps `useEnvironment()` so callers don't have to thread
// `env.sizeClass` through manually — destructure at the call site to make
// the consumed tokens visible.
function useSizeConfig<T>(table: { default: T } & Partial<Record<string, T>>): T {
    const { sizeClass } = useEnvironment();
    return (sizeClass && table[sizeClass]) || table.default;
}

function normalizeProductLookup(raw: LookupProduct | null | undefined): HydratedProduct | null {
    if (!raw?.id) return null;
    return {
        id: raw.id,
        title: typeof raw.name === "string" ? raw.name : "",
        imageUrl: typeof raw.image === "string" ? raw.image : ""
    };
}

// Calls the `product_lookup` MCP tool and normalizes the response into
// HydratedProducts. Pure: no component state, no hooks — the caller wires
// results into local state in its `.onAppear` / `.onChange` handlers.
async function fetchProducts(host: MCPHost, ids: string[]): Promise<LookupOutcome> {
    try {
        const result = await host.toolCall("product_lookup", { ids });
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
    return raw.map((e) => (typeof e === "string" ? e : JSON.stringify(e)));
}

// Copy of `marks` without `ids`, so those ids are eligible for a retry.
function withoutIds(marks: Record<string, true>, ids: string[]): Record<string, true> {
    const next: Record<string, true> = {};
    for (const key of Object.keys(marks)) {
        if (!ids.includes(key)) next[key] = true;
    }
    return next;
}

// ─── Previews ─────────────────────────────────────────────

const previews = () => [
    ScrollView([
        Self({
            keywordSummary: "Tonal, Earthy, Calm",
            description: "The space feels calm and minimal, with beige upholstery, light wood, and plenty of natural light. It has a clean foundation, but could use more contrast, texture, and ambient lighting to feel finished.",
            productIds: [
                "cont_example_siena_cushion",
                "cont_example_terracotta_planter",
                "cont_example_stillwater"
            ],
            descriptions: [
                "Introduces texture and subtle tonal variation without breaking the palette.",
                "Sculptural terracotta with an asymmetric rim — adds organic weight to the corner.",
                "Quiet, sand-coloured fragrance vessel that reinforces the calm, earthy mood."
            ]
        })
    ]).previewName("Default")
];

// ─── Export ──────────────────────────────────────────────

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
