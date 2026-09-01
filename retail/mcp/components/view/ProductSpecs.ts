/**
 * Product specification sheet. Pass a `productId` and the view calls the
 * `product_lookup` MCP tool on appear (and whenever the id changes) to
 * hydrate the title + source image. The source image is then handed to the
 * shared `GeneratedImage` component, which owns the call to the
 * `openai_image_generator` tool plus all generating / error / fallback
 * rendering.
 *
 * `dimensions` and `specifications` stay as caller-supplied inputs —
 * `product_lookup` doesn't return them today.
 */

// ─── Metadata ─────────────────────────────────────────────

const metadata = {
    title: "Product Specifications",
    description: "Generates a product spec card",
    public: true
};

// ─── Properties ───────────────────────────────────────────

const properties = {
    productId: {
        type: "string",
        title: "Product ID",
        description: "Content id of the product to display. The view will call `product_lookup` to hydrate the title and image.",
        inspector: {
            control: "singleline",
            placeholder: "cont_1776491113487831"
        },
        required: true
    },
    dimensions: {
        type: "string",
        title: "Dimensions",
        description: "Pass in product dimensions if you have them"
    },
    specifications: {
        type: "array",
        title: "Specifications",
        valueType: {
            type: "group",
            description: "Specification for the product. Keep it to 4 - 5 specs. Keep value short. Try and generate from the description and other info you have about the product. Don't include price, or show anything about available assets, or palette. Just include things like dimensions, weight, fabric, assembly, care, style etc.",
            properties: {
                title: {
                    type: "string",
                    title: "Title",
                    inspector: { control: "singleline", placeholder: "Dimensions" }
                },
                value: {
                    type: "string",
                    title: "Value",
                    inspector: { control: "singleline", placeholder: "23x23x22" }
                }
            }
        },
        defaultValue: [],
        required: true,
        validation: { minItems: 1, maxItems: 12 }
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
// is known about the id.
type LookupOutcome = {
    product: HydratedProduct | null;
    errors: string[];
    failed: boolean;
};

// ─── Constants ────────────────────────────────────────────

// Style reference fed alongside the product image into the image generator
// so the spec sheet has a consistent look across products.
const STYLE_REFERENCE_URL = "https://cdn.metabind.ai/IgJH0BzIn4LlfnCbcDc7/Q0WNzrjYuO23n6k2EjKE/assets/wox659cxZX64WSt3ussf/dimension_spec_example-2.png";

const SIZE_STYLES = {
    small: { padding: 24 },
    regular: { padding: 48 }
};

const SPEC_SHEET_ASPECT = 1024 / 1536;

// Used when no MCP host is available (composer preview, dev sandbox). The
// lookup tool can't run there, so render this so the view still looks
// meaningful out of context.
const EXAMPLE_PRODUCT: HydratedProduct = {
    id: "cont_example_lounge_chair",
    title: "Lounge Chair",
    imageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/assets/PtlHc3zPpDe2CMrdjB7W/dimension_spec_example.png"
};

// ─── Body ─────────────────────────────────────────────────

const body = (props: InferProps<typeof properties>, children: Component[]): Component => {

    // Hooks
    const env = useEnvironment();
    const host = useMCPHost();
    const [loadedProduct, setLoadedProduct] = useState<HydratedProduct | null>(null);
    const [requested, setRequested] = useState(false);
    const [docWidth, setDocWidth] = useState(1.0);

    // Computed
    const productId = (props.productId ?? '').trim();
    const rows = props.specifications ?? [];
    const sizeClass = docWidth < 500 ? 'small' : 'regular';
    const currentStyle = SIZE_STYLES[sizeClass];
    const product: HydratedProduct = host
        ? (loadedProduct ?? { id: productId, title: '', imageUrl: '' })
        : EXAMPLE_PRODUCT;

    // Generator inputs — empty until the source image has hydrated so the
    // GeneratedImage component stays idle while we wait.
    const generatorImageUrls = product.imageUrl && product.imageUrl.length > 0
        ? [STYLE_REFERENCE_URL, product.imageUrl]
        : [];
    const generatorPrompt = `Use the first image as a style reference to create a line drawing specs sheet image for the second product image we've attached. Use background color #FAF8F5. Dimensions ${props.dimensions ? props.dimensions : "can be estimated. Only base your image generation off the provided images. Don't make anything else up. Only show measurements, no titles etc."}`;

    // Side effects
    const hydrate = async () => {
        if (!host || !productId || requested) return;
        setRequested(true);

        const { product: fetched, errors, failed } = await fetchProduct(host, productId);

        if (errors.length > 0) {
            host.log(failed ? 'error' : 'warning', 'product_lookup incomplete', {
                requested: productId,
                resolved: fetched?.id ?? null,
                errors
            });
        }

        // Release the mark so a later appear/change can retry a call that never
        // landed. A resolved-but-noisy lookup still renders.
        if (failed) setRequested(false);
        if (fetched) setLoadedProduct(fetched);
    };

    // Tree
    const header = (
        VStack({ spacing: 24, alignment: "leading" }, [
            VStack({ spacing: 4, alignment: "leading" }, [
                Text(product.title || "—")
                    .font("largeTitle")
                    .fontWeight("bold")
                    .foregroundStyle(Color("black")),
                Text("Specifications")
                    .font("title3")
                    .fontWeight("bold")
                    .foregroundStyle(Color("black"))
            ]),
            Rectangle()
                .fill(Color("#CFCFCF"))
                .frame({ height: 1 })
        ])
    );

    const specSheet = (
        GeneratedImage({
            imageUrls: generatorImageUrls,
            prompt: generatorPrompt,
            size: "1536x1024",
            cache: true,
            fuzzy: 0,
            contentMode: "fit",
            fallbackImageUrl: EXAMPLE_PRODUCT.imageUrl
        })
            .frame({ height: (docWidth - (currentStyle.padding * 2)) * SPEC_SHEET_ASPECT })
    );

    const specRows = (
        VStack({ spacing: 0, alignment: "leading" }, rows.map((item) =>
            VStack({ spacing: 0, alignment: "leading" }, [
                Rectangle()
                    .fill(Color("#CFCFCF"))
                    .frame({ height: 1 }),
                HStack({ alignment: "center" }, [
                    Text(item.title)
                        .lineLimit(1)
                        .font("body")
                        .foregroundStyle(Color("#777777")),
                    Spacer(),
                    Text(item.value)
                        .lineLimit(1)
                        .font("body")
                        .foregroundStyle(Color("#777777"))
                        .multilineTextAlignment("trailing")
                ])
                    .frame({ minHeight: 46 })
            ])
        ))
            .background(Color("#FAF8F5"))
    );

    return (
        VStack({ spacing: 36, alignment: "leading" }, [
            header,
            specSheet,
            specRows
        ])
            .padding(currentStyle.padding)
            .background(Color("#FAF8F5"))
            .background(
                GeometryReader((reader) => {
                    return Color('clear')
                        .onAppear(() => {
                            setDocWidth(reader.size.width);
                        })
                        .onChange(reader.size.width, ([oldValue, newWidth]) => {
                            setDocWidth(newWidth);
                        });
                })
            )
            .onAppear(() => {
                if (host) void hydrate();
            })
            .onChange(productId, () => {
                if (!host) return;
                setRequested(false);
                setLoadedProduct(null);
                void hydrate();
            })
    );
};

// ─── Helpers ─────────────────────────────────────────────

function normalizeProductLookup(raw: LookupProduct | null | undefined): HydratedProduct | null {
    if (!raw?.id) return null;
    return {
        id: raw.id,
        title: typeof raw.name === 'string' ? raw.name : '',
        imageUrl: typeof raw.image === 'string' ? raw.image : ''
    };
}

// Calls the `product_lookup` MCP tool for a single id and normalizes the
// response. Pure: no component state, no hooks — the caller wires the
// result into local state.
async function fetchProduct(host: MCPHost, id: string): Promise<LookupOutcome> {
    try {
        const result = await host.toolCall('product_lookup', { ids: [id] });
        const fetched: LookupProduct[] = Array.isArray(result?.products) ? result.products : [];
        return {
            product: normalizeProductLookup(fetched[0]),
            errors: toErrorList(result?.errors),
            failed: false
        };
    } catch (err) {
        return {
            product: null,
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

// ─── Previews ────────────────────────────────────────────

const previews = [
    Self({
        productId: "cont_example_lounge_chair",
        dimensions: "23x23x22",
        specifications: [
            { title: "Dimensions", value: "23x23x22" },
            { title: "Weight", value: "23kg" },
            { title: "Assembly", value: "Fully Assembled" },
            { title: "Fabric", value: "Nice" }
        ]
    }).previewName("Lounge Chair")
];

// ─── Export ──────────────────────────────────────────────

export default defineComponent({
    metadata,
    properties,
    body,
    previews
});
