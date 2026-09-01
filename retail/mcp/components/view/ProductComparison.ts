/**
 * Side-by-side product comparison table.
 *
 * Pass `productIds` and the view calls the `product_lookup` MCP tool on
 * appear (and whenever the ids change) to hydrate each product's title,
 * price, and image. Outside an MCP host the lookup pipeline can't run,
 * so example products are rendered instead — composer previews and dev
 * sandboxes still look meaningful.
 *
 * `dimensions` are the comparison rows down the left column. Each row
 * carries its own `values` array, indexed positionally against
 * `productIds`, so the rows can describe whatever attributes the LLM
 * wants to highlight (price, materials, dimensions, finish, ...)
 * without having to extend `product_lookup`.
 */

// ─── Metadata ─────────────────────────────────────────────

const metadata = {
    title: "ProductComparison",
    description: "Side-by-side product comparison table. Pass productIds and per-row values; product metadata is hydrated via product_lookup.",
    category: "Display",
    public: true
};

// ─── Properties ───────────────────────────────────────────

const properties = {
    productIds: {
        type: "array",
        title: "Product IDs",
        description: "Content ids of the products to compare. The view will call `product_lookup` to hydrate each one. Must contain at least 2 ids.",
        valueType: { type: "string" },
        defaultValue: [],
        required: true,
        validation: { minItems: 2 }
    },
    dimensions: {
        type: "array",
        title: "Dimensions",
        description: "The comparison rows shown down the left column. `values` lines up positionally against `productIds`.",
        valueType: {
            type: "group",
            properties: {
                label: {
                    type: "string",
                    title: "Label",
                    description: "Row label shown in the left column. Keep it as short as possible.",
                    inspector: { control: "singleline" }
                },
                values: {
                    type: "array",
                    title: "Values",
                    description: "One value per product, in the same order as `productIds`.",
                    valueType: { type: "string" }
                }
            }
        },
        defaultValue: [],
        required: true,
        validation: { minItems: 1 }
    }
} satisfies ComponentProperties;

// ─── Types ────────────────────────────────────────────────

type HydratedProduct = {
    id: string;
    title: string;
    price: number;
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
    video?: string;
};

type Row = { label: string, value: string };

// ─── Constants ────────────────────────────────────────────

const LABEL_CELL_WIDTH = 115;
const COLUMN_WIDTH = 280;
const CELL_HORIZONTAL_PADDING = 20;
const CELL_VERTICAL_PADDING = 14;
const CELL_HEADER_HEIGHT = 304;
const CELL_HEADER_IMAGE_HEIGHT = 200;
const SHOP_CELL_HEIGHT = 82;
const TITLE_BAR_HEIGHT = 50;
const CELL_BG = "#F1F0EB";

// Result of one `product_lookup` round. `errors` carries per-id failures,
// which are expected and survivable — the model occasionally hands us a
// truncated id. `failed` means the tool call itself never landed, so nothing
// is known about any of the ids in the batch.
type LookupOutcome = {
    products: HydratedProduct[];
    errors: string[];
    failed: boolean;
};

// Used while a product row is in flight from product_lookup.
const EMPTY_PRODUCT: HydratedProduct = {
    id: "",
    title: "",
    price: 0,
    imageUrl: ""
};

// Used when no MCP host is available (composer preview, dev sandbox). The
// lookup tool can't run there, so render these so the view still looks
// meaningful out of context.
const EXAMPLE_PRODUCTS: HydratedProduct[] = [
    {
        id: "cont_example_walnut_table",
        title: "Heritage Walnut Coffee Table",
        price: 789,
        imageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/94MXxT6NMoEdB7pnBM0R/002-an-oak-ivory-brand-coffee-table-high-end.jpg"
    },
    {
        id: "cont_example_oak_table",
        title: "Ivory Oak Coffee Table",
        price: 849,
        imageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/4rfQGSfnSS693OrOjnVL/004-an-oak-ivory-brand-coffee-table-high-end.jpg"
    }
];

// Frosted label-column background. Mobile drops the material layer so the
// label cell blends with the scrolling product columns.
const cellLeftGradient = ZStack([
    Material("thin"),
    Color(CELL_BG).opacity(0.8)
]);

const cellLeftGradientMobile = ZStack([
    LinearGradient({
        colors: [
            Color('white').opacity(1.0),
            Color('white').opacity(0.9),
            Color('white').opacity(0.01)
        ],
        startPoint: 'leading',
        endPoint: 'trailing'
    })
]);

const bgGradient = LinearGradient({
    colors: [
        Color('white').opacity(0.005),
        Color('white').opacity(0.9)
    ],
    startPoint: 'leading',
    endPoint: 'trailing'
});

// ─── Body ─────────────────────────────────────────────────

const BodyContent = defineComponent({
    body: (props: InferProps<typeof properties>, children: Component[]): Component => {

        // Hooks
        const host = useMCPHost();
        const isMobile = useEnvironment().sizeClass == 'mobile';
        const [loaded, setLoaded] = useState<Record<string, HydratedProduct>>({});
        const [requested, setRequested] = useState<Record<string, true>>({});
        const [unresolved, setUnresolved] = useState<Record<string, true>>({});
        const [error, setError] = useState(false);

        // Computed
        const productIds = (props.productIds ?? []).filter(
            (id): id is string => typeof id === 'string' && id.length > 0
        );
        const dimensions = (props.dimensions ?? []).filter((d) => d != null);
        const shopButtonLabel =  "Learn More";

        // Ids the lookup has definitively failed on drop out of the table —
        // a permanently blank column reads as a rendering bug.
        const visibleIds = productIds.filter((id) => !unresolved[id]);

        const hydratedProducts: HydratedProduct[] = host
            ? visibleIds.map((id) => loaded[id] ?? { ...EMPTY_PRODUCT, id })
            : EXAMPLE_PRODUCTS;

        const hasAnyProduct = hydratedProducts.some((p) => p.title.length > 0 || p.imageUrl.length > 0);
        const titleLabel = buildTitleLabel(hydratedProducts.length);

        // `dimensions[].values` is positional against the *original* productIds,
        // so a dropped column must not shift the ones after it.
        const columnSources: number[] = host
            ? visibleIds.map((id) => productIds.indexOf(id))
            : hydratedProducts.map((_, i) => i);

        // Per-column rows: zips dimensions × productIndex into {label, value}
        // so each ProductColumn can stay agnostic about positional indexing.
        const columnRows: Row[][] = hydratedProducts.map((_, columnIndex) => {
            const productIndex = columnSources[columnIndex] ?? columnIndex;
            return dimensions.map((d) => ({
                label: d?.label ?? "",
                value: d?.values?.[productIndex] || "—"
            }));
        });

        // Hydration: dedupe requested ids, defer the tool call to fetchProducts,
        // fold results into local state.
        const hydrate = async () => {
            if (!host || productIds.length === 0) return;

            const pending = productIds.filter((id) => !requested[id] && !loaded[id]);
            if (pending.length === 0) return;

            const nextRequested: Record<string, true> = { ...requested };
            for (const id of pending) nextRequested[id] = true;
            setRequested(nextRequested);

            const { products, errors, failed } = await fetchProducts(host, pending);

            if (errors.length > 0) {
                host.log(failed ? 'error' : 'warning', 'product_lookup incomplete', {
                    requested: pending,
                    resolved: products.map((p) => p.id),
                    errors
                });
            }

            // Only an empty table is an error worth showing the user. A batch
            // that lost one id still compares the rest.
            const nothingOnScreen = Object.keys(loaded).length === 0 && products.length === 0;

            if (failed) {
                // Nothing landed, so nothing is known about these ids — release
                // the marks so a later appear/change can retry them.
                setRequested(withoutIds(nextRequested, pending));
                if (nothingOnScreen) setError(true);
                return;
            }

            const resolvedIds = products.map((p) => p.id);
            const missed = pending.filter((id) => !resolvedIds.includes(id));
            if (missed.length > 0) {
                const nextUnresolved: Record<string, true> = { ...unresolved };
                for (const id of missed) nextUnresolved[id] = true;
                setUnresolved(nextUnresolved);
            }

            if (products.length === 0) {
                if (nothingOnScreen) setError(true);
                return;
            }

            const nextLoaded: Record<string, HydratedProduct> = { ...loaded };
            for (const p of products) nextLoaded[p.id] = p;
            setLoaded(nextLoaded);
        };

        // Tree
        const titleBar = TitleBar({ title: titleLabel });
        const labelColumn = LabelColumn({
            labels: dimensions.map((d) => d?.label || "—"),
            isMobile
        });
        const productColumns = hydratedProducts.map((product, i) =>
            ProductColumn({
                product,
                rows: columnRows[i],
                isMobile,
                shopButtonLabel
            })
        );

        const empty = (
            EmptyState({ hasError: error })
                .frame({ minHeight: 100 })
                .padding('top', TITLE_BAR_HEIGHT)
                .overlay({ alignment: 'top' }, titleBar)
                .background(BrandBackground().cornerRadius(12))
        );

        const mobileTable = (
            ScrollView({ axis: 'horizontal' }, [
                HStack({ spacing: 0 }, productColumns.map((col) => col.frame({ width: COLUMN_WIDTH })))
            ])
                .padding('top', TITLE_BAR_HEIGHT)
                .overlay({ alignment: 'top' }, titleBar)
                .background(BrandBackground().cornerRadius(12))
        );

        const desktopScrollingTable = (
            ScrollView({ axis: 'horizontal' }, [
                HStack([
                    VStack([]).frame({ width: LABEL_CELL_WIDTH }),
                    HStack({ spacing: 0 }, productColumns.map((col) => col.frame({ width: COLUMN_WIDTH })))
                ])
            ])
                .overlay({ alignment: 'topLeading' }, labelColumn)
                .padding('top', TITLE_BAR_HEIGHT)
                .overlay({ alignment: 'top' }, titleBar)
                .background(BrandBackground().cornerRadius(12))
        );

        const desktopStaticTable = (
            VStack({ spacing: 0 }, [
                HStack({ spacing: 0 }, [labelColumn, ...productColumns])
                    .padding('top', TITLE_BAR_HEIGHT)
                    .overlay({ alignment: 'top' }, titleBar)
            ])
                .background(BrandBackground().cornerRadius(12))
        );

        const showEmpty = productIds.length === 0 || (!!host && !hasAnyProduct);
        const showScrolling = !isMobile && hydratedProducts.length > 2;

        let content: Component;
        if (showEmpty) {
            content = empty;
        } else if (isMobile) {
            content = mobileTable;
        } else if (showScrolling) {
            content = desktopScrollingTable;
        } else {
            content = desktopStaticTable;
        }

        return (
            content
                .onAppear(() => {
                    void hydrate();
                })
                .onChange(productIds.join(','), ([oldIds, newIds]) => {
                    void hydrate();
                })
        );
    }
});

// ─── Lockups ──────────────────────────────────────────────

const TitleBar = (props: { title: string }) => {
    return (
        HStack([
            Text(props.title).font('body').fontWeight('regular'),
            Spacer(),
            LogoImage()
        ])
            .padding('horizontal', 14)
            .frame({ height: TITLE_BAR_HEIGHT })
            .overlay({ alignment: 'bottom' }, CellDivider())
            .foregroundStyle(Color('secondary'))
    );
};

const LabelColumn = (props: { labels: string[], isMobile: boolean }) => {
    return (
        VStack({ spacing: 0 }, [
            HeaderCellSpacer({ isMobile: props.isMobile }),
            ...props.labels.map((title) => LabelCell({ title, isMobile: props.isMobile })),
            ShopLabelCell()
        ])
    );
};

const ProductColumn = (props: {
    product: HydratedProduct,
    rows: Row[],
    isMobile: boolean,
    shopButtonLabel: string
}) => {
    return (
        VStack({ spacing: 0 }, [
            HeaderCell({ product: props.product }),
            ...props.rows.map((row) =>
                ItemCell({
                    title: row.value,
                    dimension: row.label,
                    showDimension: props.isMobile
                })
            ),
            ShopButtonCell({
                productName: props.product.title,
                label: props.shopButtonLabel
            })
        ])
    );
};

const HeaderCell = (props: { product: HydratedProduct }) => {
    const imageUrl = props.product.imageUrl;
    const imageView = imageUrl
        ? Image({ url: imageUrl, contentMode: 'fill' })
            .resizable()
            .frame({ height: CELL_HEADER_IMAGE_HEIGHT })
            .cornerRadius(8)
        : Rectangle()
            .fill(Color('black').opacity(0.06))
            .frame({ height: CELL_HEADER_IMAGE_HEIGHT })
            .cornerRadius(8);

    return (
        VStack({ alignment: 'leading' }, [
            VStack({ spacing: 8, alignment: 'leading' }, [
                imageView,
                VStack({ spacing: 4, alignment: 'leading' }, [
                    Text(props.product.title || "—")
                        .font("title3")
                        .fontWeight("semibold")
                        .foregroundStyle(Color("black")),
                    Text(formatPrice(props.product.price))
                        .font("subheadline")
                        .foregroundStyle(Color('secondary'))
                        .fontWeight("regular")
                ])
            ])
                .padding('horizontal', CELL_HORIZONTAL_PADDING)
                .padding('vertical', 15)
        ])
            .frame({ maxWidth: Infinity })
            .frame({ height: CELL_HEADER_HEIGHT, alignment: 'top' })
            .background(bgGradient)
    );
};

const HeaderCellSpacer = (props: { isMobile: boolean }) => {
    return (
        VStack([])
            .frame({ width: LABEL_CELL_WIDTH, alignment: 'leading' })
            .frame({ height: CELL_HEADER_HEIGHT })
            .background(props.isMobile ? Empty() : cellLeftGradient)
    );
};

const LabelCell = (props: { title: string, isMobile: boolean }) => {
    return (
        VStack({ spacing: 0 }, [
            CellDivider(),
            Text(props.title)
                .lineLimit(1)
                .foregroundStyle(Color('secondary'))
                .frame({ maxWidth: Infinity, alignment: 'leading' })
                .padding('vertical', CELL_VERTICAL_PADDING)
                .padding('horizontal', CELL_HORIZONTAL_PADDING)
        ])
            .frame({ width: LABEL_CELL_WIDTH, alignment: 'leading' })
            .background(props.isMobile ? cellLeftGradientMobile : cellLeftGradient)
            .font('subheadline')
    );
};

const ItemCell = (props: { title: string, dimension: string, showDimension: boolean }) => {
    const content = props.showDimension
        ? [
            Text(props.dimension).lineLimit(1),
            Spacer(),
            Text(props.title)
                .foregroundStyle(Color('secondary'))
                .lineLimit(1)
        ]
        : [
            Text(props.title).lineLimit(1)
        ];

    return (
        VStack({ spacing: 0 }, [
            CellDivider(),
            HStack(content)
                .frame({ maxWidth: Infinity, alignment: 'leading' })
                .padding('horizontal', CELL_HORIZONTAL_PADDING)
                .padding('vertical', CELL_VERTICAL_PADDING)
        ])
            .font('subheadline')
            .frame({ maxWidth: Infinity })
            .background(bgGradient)
    );
};

const ShopLabelCell = () => {
    return (
        CellDivider()
            .frame({ width: LABEL_CELL_WIDTH, alignment: 'leading' })
            .frame({ height: SHOP_CELL_HEIGHT, alignment: 'top' })
            .background(cellLeftGradient)
    );
};

const ShopButtonCell = (props: { productName: string, label: string }) => {
    return (
        VStack({ spacing: 0 }, [
            CellDivider(),
            Spacer(),
            Button({
                label: Text(props.label)
                    .fontWeight("semibold")
                    .foregroundStyle(Color("white")),
                action: () => {
                    const mcpHost = useMCPHost();
                    mcpHost.sendMessage(
                        "I want to see more information about the " + (props.productName || 'product')
                    );
                }
            })
                .frame({ maxWidth: Infinity, alignment: 'center' })
                .padding('vertical', 8)
                .background(Color("black"))
                .cornerRadius(999)
                .padding('horizontal', CELL_HORIZONTAL_PADDING)
                .padding('vertical', CELL_VERTICAL_PADDING)
        ])
            .frame({ height: SHOP_CELL_HEIGHT })
            .frame({ maxWidth: Infinity })
            .background(bgGradient)
    );
};

const CellDivider = () => {
    return (
        Rectangle()
            .fill(Color('black'))
            .opacity(0.08)
            .frame({ height: 1 })
    );
};

const EmptyState = (props: { hasError: boolean }) => {
    const message = props.hasError ? "Product lookup failed" : "Loading";
    return (
        HStack([
            VStack([
                Text(message)
                    .font('body')
                    .foregroundStyle(Color('secondary'))
            ])
                .frame({ maxWidth: Infinity })
                .frame({ maxHeight: Infinity, alignment: 'center' })
        ])
    );
};

// ─── Helpers ──────────────────────────────────────────────

function buildTitleLabel(count: number): string {
    if (count === 0) return "Loading";
    if (count === 1) return "Comparing 1 Product";
    return `Comparing ${count} Products`;
}

function formatPrice(price: number): string {
    if (!isFinite(price)) return '';

    const isNegative = price < 0;
    const formatted = Math.abs(price).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
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
        imageUrl: typeof raw.image === 'string' ? raw.image : ''
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

// ─── Previews ─────────────────────────────────────────────

const previews = [
    Self({
        productIds: ["cont_example_walnut_table", "cont_example_oak_table"],
        dimensions: [
            { label: "Price", values: ["$789", "$849"] },
            { label: "Dimensions", values: ["120 × 60 × 40 cm", "130 × 65 × 42 cm"] },
            { label: "Material", values: ["Solid Walnut", "Solid Oak + Steel"] },
            { label: "Finish", values: ["Hand-oiled", "Powder-coated frame"] }
        ]
    }).previewName("Two Products"),

    Self({
        productIds: [
            "cont_example_walnut_table",
            "cont_example_oak_table",
            "cont_example_chair"
        ],
        dimensions: [
            { label: "Price", values: ["$1,190", "$949", "$1,190"] },
            { label: "Dimensions", values: ["72 × 75 × 80 cm", "78 × 80 × 85 cm", "110 × 55 × 38 cm"] },
            { label: "Material", values: ["Boucle Weave", "Bent-ply + Fabric", "Solid Walnut + Brass"] },
            { label: "Upholstery", values: ["Ivory", "Olive Green", "—"] },
            { label: "Frame", values: ["Solid Walnut", "Natural Birch", "Brass sabots"] }
        ]
    }).previewName("Three Products (Scrolling)"),

    Self({
        productIds: [],
        dimensions: []
    }).previewName("No Products")
];

// ─── Export ───────────────────────────────────────────────

export default defineComponent({
    metadata,
    properties,
    body: (props, children) => {
        return EnvironmentSizeClass([
            BodyContent(props, children)
        ]).colorScheme('light');
    },
    previews
});
