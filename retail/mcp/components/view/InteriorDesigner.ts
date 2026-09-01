/**
 * Mood-board / interior renderer. Pass `productIds` and the view calls the
 * `product_lookup` MCP tool on appear (and whenever the ids change) to
 * hydrate each product's title, price, and image. Outside an MCP host the
 * lookup pipeline can't run, so example products are rendered instead so
 * composer previews and dev sandboxes still look meaningful.
 *
 * Once the prompt + product images are in, the view calls
 * `openai_image_generator` to render the interior mock-up.
 */

// ─── Metadata ─────────────────────────────────────────────

const metadata = {
    title: "Interior Design Renderer"
};

// ─── Properties ───────────────────────────────────────────

const properties = {
    prompt: {
        title: "Prompt",
        description: "Prompt for the design we're going to make with the included products. This prompt will be used to generate an image of an interior such as a lounge room or kitchen. It should be detailed enough to describe to the generator the exact image the user has in mind plus how the products should be incorporated",
        type: "string"
    },
    title: {
        title: "Title",
        description: "A short title to frame this design",
        type: "string"
    },
    description: {
        title: "Description",
        description: "One or two word description that sums up the whole design, words that a designer would use to sum up the design.",
        type: "string"
    },
    paletteColors: {
        type: "array",
        valueType: {
            type: "group",
            description: "Palette of colors that were suggested. Give 3 - 4 in hex format. Put the dominate color first.",
            properties: {
                name: {
                    type: "string",
                    description: "Color name"
                },
                hex: {
                    type: "string",
                    description: "Color hex value"
                }
            }
        }
    },
    productIds: {
        title: "Product IDs",
        type: "array",
        description: "Content ids of the products to feature in the moodboard. The view will call `product_lookup` to hydrate each one. Up to 3 are shown on the board.",
        valueType: { type: "string" },
        defaultValue: [],
        validation: { minItems: 0, maxItems: 3 }
    },
    allDataProvided: {
        type: "boolean",
        description: "Send as true once the entire tool input is done. Can leave as the last piece to send / omit until then."
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

type PaletteColor = { hex: string, name?: string };

// ─── Constants ────────────────────────────────────────────

const SIZE_CONFIG = {
    mobile: {
        imagePadding: 20,
        titlePaddingTop: 56,
        titlePaddingHorizontal: 20,
        descriptionPadding: 0,
        footerTextAlignment: 'trailing' as const,
        footerPaddingHorizontal: 40,
        imageHeight: 300,
        height: 550,
        productOffset: 150,
        paletteY: -110,
        paletteX: 0.35,
        paletteSpacing: 4,
        paletteSize: { width: 100, height: 135 }
    },
    default: {
        imagePadding: 100,
        titlePaddingTop: 35,
        titlePaddingHorizontal: 35,
        descriptionPadding: 20,
        footerTextAlignment: 'center' as const,
        footerPaddingHorizontal: 0,
        imageHeight: 400,
        height: 600,
        productOffset: 0,
        paletteY: -140,
        paletteX: 0.38,
        paletteSpacing: 8,
        paletteSize: { width: 125, height: 200 }
    }
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
        id: "cont_example_throw",
        title: "Woven Dusk Throw",
        price: 89,
        imageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/assets/0brICv9JuBxtlmvCgWuk/woven-dusk-throw.png"
    },
    {
        id: "cont_example_cushion",
        title: "Dune Cushion Cover",
        price: 49,
        imageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/assets/Ss4i7of14C9jor5hqtpc/dune-cushion-cover.png"
    },
    {
        id: "cont_example_mug",
        title: "Ceramic Mug",
        price: 29,
        imageUrl: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/assets/Ji3X8BriDjYfA116a6T6/mug.png"
    }
];

const EXAMPLE_GEN_IMAGE = "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/assets/042dBkoDpywIzjIinFtZ/reference-classic-lounge.png";

const LOGO_URL = "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/components/h63fO5EeUDK2l38vTlas/latest/assets/HOgSWMUfDMSpForukh3q/logo.png";

const arrowSVG = `
    <svg width="32" height="72" viewBox="0 0 32 72" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M31.0296 15.7257C30.4609 16.9591 28.7145 15.6541 27.6169 13.1816C27.2405 12.3339 26.883 11.6809 26.8147 11.7366C26.773 11.8142 26.9398 12.7803 27.2155 13.8587C27.8603 16.473 28.5845 23.9904 28.4788 26.9716C28.1558 36.8734 25.3988 45.9784 20.2919 53.8857C18.5406 56.608 13.0049 63.378 10.867 65.401C7.65272 68.4852 3.29116 71.3853 1.66109 71.5424C0.760899 71.6291 0.0618174 71.2545 0.00322509 70.6463C-0.0366177 70.2327 0.27587 69.9079 1.22182 69.2766C1.9142 68.8171 2.48025 68.3206 2.46619 68.1746C2.45213 68.0286 3.07476 67.3548 3.84337 66.6669C5.38059 65.2911 5.77309 65.0323 5.52567 65.5227C5.42512 65.7533 5.45413 65.7997 5.63705 65.6593C5.77365 65.5479 5.83024 65.3706 5.74553 65.2559C5.54944 65.0047 6.20343 64.4016 6.48746 64.5461C6.64047 64.605 6.87205 64.4599 7.01892 64.2002C7.2977 63.7805 7.27337 63.7828 6.86825 64.1656C6.61938 64.386 6.69795 64.182 7.04503 63.7066C7.76353 62.7535 8.40168 62.4956 7.75148 63.393C7.3871 63.9438 7.3871 63.9438 7.94377 63.35C8.27825 62.9985 8.51306 62.6322 8.43069 62.5419C8.375 62.4736 9.35265 61.1517 10.6278 59.6047C11.881 58.0844 12.9214 56.9038 12.9307 57.0011C12.9401 57.0984 12.8152 57.3315 12.6857 57.5158C12.5318 57.7025 11.7253 58.7624 10.8726 59.8512L9.36961 61.8376L11.309 59.5391C12.3667 58.2832 13.2321 57.0703 13.2573 56.8223C13.2582 56.5767 13.6525 55.8267 14.1291 55.1669C14.6034 54.4828 15.4618 53.197 16.0147 52.3089C16.5895 51.3941 17.1392 50.7273 17.2655 50.7642C17.3699 50.8279 17.658 50.5054 17.9078 50.0394L18.3657 49.185L17.8034 49.9758C17.1336 50.9243 17.0348 50.6637 17.6443 49.5983C17.8744 49.1832 18.1649 48.8852 18.2936 48.9464C18.4223 49.0077 18.5855 48.9183 18.6688 48.763C18.7717 48.5566 18.7207 48.537 18.5135 48.6797C18.3305 48.8201 18.2529 48.7785 18.3048 48.5525C18.359 48.3508 18.5152 48.1885 18.6369 48.1767C18.7829 48.1627 18.9925 48.0443 19.1024 47.9109C19.2123 47.7775 19.1613 47.7579 19.0004 47.8716C18.5639 48.1838 18.5994 47.7875 19.1036 46.9041C20.0218 45.2196 21.8769 40.0073 22.5483 37.2908C24.0917 30.8809 24.3051 25.704 23.3563 18.4047C22.7009 13.3851 22.4049 11.8422 22.0886 11.8727C21.967 11.8844 21.7878 12.319 21.6887 12.8197C21.3797 14.1999 19.4407 19.052 18.9178 19.7407C18.4607 20.3495 18.0125 20.54 17.975 20.1508C17.9633 20.0291 17.7397 20.0016 17.4791 20.1003C17.1722 20.2281 16.9925 20.1472 16.9714 19.9282C16.9526 19.7336 16.6546 19.4431 16.2975 19.3057C15.8385 19.1289 15.6377 18.829 15.5909 18.3425C15.476 17.1504 16.1712 13.916 17.5011 9.36813C18.2006 6.94356 19.0581 3.86536 19.3742 2.55811C19.9245 0.368898 20.0274 0.162554 20.6286 0.0309738C21.3758 -0.114669 22.7631 0.267313 23.6293 0.846828C25.0485 1.81503 29.1587 8.53972 30.3313 11.7906C31.2029 14.2112 31.3579 15.0556 31.0296 15.7257ZM24.4569 42.828C24.3839 42.8351 24.0036 43.7311 23.5668 44.8044C21.8187 49.3434 18.594 54.614 14.2156 60.143C12.178 62.6965 12.0947 62.8518 13.457 61.4438C15.6883 59.1172 20.148 52.6473 21.9043 49.2124C22.3771 48.2584 24.5556 43.0886 24.5832 42.865C24.5809 42.8406 24.5299 42.821 24.4569 42.828ZM20.1504 13.1643C19.6112 14.9596 19.0698 16.7305 18.9323 17.0875C18.7531 17.5222 18.7382 17.6218 18.9407 17.4305C19.2485 17.057 21.2415 10.7266 21.1703 10.2423C21.1516 10.0477 20.6872 11.3447 20.1504 13.1643ZM19.0238 5.2928C18.9209 5.49915 18.8171 5.95112 18.7526 6.30109C18.6801 6.8237 18.7265 6.79468 18.9598 6.15835C19.2498 5.34469 19.3058 4.65178 19.0238 5.2928ZM18.457 7.31172C18.3541 7.51806 18.2583 7.79739 18.2723 7.94336C18.2841 8.065 18.401 8.00462 18.5039 7.79828C18.6068 7.59193 18.7003 7.28828 18.6886 7.16664C18.6746 7.02067 18.5599 7.10537 18.457 7.31172ZM18.0876 8.575C17.9847 8.78134 17.8889 9.06067 17.9029 9.20664C17.9147 9.32828 18.0316 9.26791 18.1345 9.06156C18.2374 8.85522 18.3309 8.55156 18.3192 8.42992C18.3052 8.28395 18.1905 8.36866 18.0876 8.575ZM17.7182 9.83829C17.6153 10.0446 17.5195 10.324 17.5335 10.4699C17.5452 10.5916 17.6622 10.5312 17.7651 10.3248C17.868 10.1185 17.9615 9.81485 17.9498 9.69321C17.9357 9.54724 17.8211 9.63194 17.7182 9.83829ZM17.3488 11.1016C17.2459 11.3079 17.1501 11.5872 17.1641 11.7332C17.1758 11.8549 17.2928 11.7945 17.3957 11.5881C17.4986 11.3818 17.5921 11.0781 17.5804 10.9565C17.5663 10.8105 17.4517 10.8952 17.3488 11.1016ZM16.9794 12.3649C16.8765 12.5712 16.7807 12.8505 16.7947 12.9965C16.8064 13.1181 16.9234 13.0578 17.0263 12.8514C17.1292 12.6451 17.2227 12.3414 17.211 12.2198C17.1969 12.0738 17.0823 12.1585 16.9794 12.3649ZM16.61 13.6281C16.5071 13.8345 16.4113 14.1138 16.4253 14.2598C16.437 14.3814 16.554 14.321 16.6569 14.1147C16.7598 13.9084 16.8533 13.6047 16.8416 13.4831C16.8275 13.3371 16.7129 13.4218 16.61 13.6281ZM16.5924 51.934C14.9496 54.253 13.3939 56.711 14.0118 55.9885C14.3856 55.5351 15.273 54.2955 15.9797 53.2207C17.3297 51.1755 17.7146 50.3281 16.5924 51.934ZM15.564 54.513C15.52 54.5664 15.0654 55.1995 14.5471 55.9369L13.5938 57.2565L14.6318 56.0515C15.2081 55.4067 15.6628 54.7736 15.6487 54.6276C15.637 54.506 15.608 54.4597 15.564 54.513ZM13.41 57.6425C13.3856 57.6448 12.858 58.2849 12.2667 59.0294L11.1745 60.436L12.3467 59.0954C13.4067 57.8638 13.6046 57.6237 13.41 57.6425ZM9.66402 65.1485C9.09797 65.645 8.65591 66.1542 8.66763 66.2758C8.69107 66.5191 9.1252 66.1826 10.102 65.1064C10.9884 64.1125 10.8181 64.1289 9.66402 65.1485ZM8.19745 66.493C8.0758 66.5047 7.96587 66.6381 7.97993 66.784C7.99165 66.9057 8.11799 66.9426 8.2326 66.8579C8.37155 66.7709 8.45715 66.6398 8.45012 66.5668C8.44543 66.5182 8.34343 66.4789 8.19745 66.493ZM3.10802 70.2489C2.92042 70.3407 3.00044 70.4066 3.26806 70.3809C3.53803 70.3794 3.67697 70.2924 3.57262 70.2287C3.4926 70.1628 3.2713 70.1596 3.10802 70.2489Z" fill="#A4A4A4" fill-opacity="0.91"/>
</svg>

`;

// ─── Body ─────────────────────────────────────────────────

const body = (props: InferProps<typeof properties>, children: Component[]): Component => {
    return (
        EnvironmentSizeClass([
            BodyContent(props, children)
        ])
    );
};

const BodyContent = defineComponent({
    properties,
    body: (props, children) => {

        // Hooks
        const env = useEnvironment();
        const host = useMCPHost();
        const [loaded, setLoaded] = useState<Record<string, HydratedProduct>>({});
        const [requested, setRequested] = useState<Record<string, true>>({});
        const [unresolved, setUnresolved] = useState<Record<string, true>>({});
        const [width, setWidth] = useState(env?.screen?.width ?? 600);
        const [showColorModal, setShowColorModal] = useState(null);

        // Computed
        const config = SIZE_CONFIG[env.sizeClass] ?? SIZE_CONFIG.default;
        const productIds = (props.productIds ?? []).filter(
            (id): id is string => typeof id === 'string' && id.length > 0
        );
        // Ids the lookup has definitively failed on drop off the board — a
        // permanently blank slot reads as a rendering bug, and feeding an
        // empty imageUrl to the generator wastes a request.
        const visibleIds = productIds.filter((id) => !unresolved[id]);
        const hydratedProducts: HydratedProduct[] = host
            ? visibleIds.map((id) => loaded[id] ?? { ...EMPTY_PRODUCT, id })
            : EXAMPLE_PRODUCTS;
        const colors: PaletteColor[] = props.paletteColors ?? [];
        const descriptionText = props.description ?? "Warm and something";
        const normalisedWidth = width;
        const footerSize = 20;

        // Side effects
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

            if (failed) {
                // Nothing landed, so nothing is known about these ids — release
                // the marks so a later appear/change can retry them.
                setRequested(withoutIds(nextRequested, pending));
                return;
            }

            // Whatever resolved gets rendered; the rest are marked unresolved so
            // they stop occupying a slot on the board.
            const resolvedIds = products.map((p) => p.id);
            const missed = pending.filter((id) => !resolvedIds.includes(id));
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

        // Generator inputs — stay empty until every gate has passed so
        // GeneratedImage idles instead of firing partial requests.
        const generatorReady =
            !!host
            && props.allDataProvided === true
            && typeof props.prompt === 'string'
            && props.prompt.length > 0;

        const productImageUrls = generatorReady
            ? hydratedProducts
                .map((p) => p.imageUrl)
                .filter((url) => typeof url === 'string' && url.length > 0)
            : [];

        // Tree
        const desktopProductList = DesktopProductList({
            products: hydratedProducts,
            normalisedWidth,
            footerSize
        });
        const mobileProductList = MobileProductList({
            products: hydratedProducts,
            productOffset: config.productOffset
        });
        const productList = env.sizeClass == 'mobile' ? mobileProductList : desktopProductList;

        const palette = colors.length > 0 ? (
            MoodBoardPalette({
                width: config.paletteSize.width,
                height: config.paletteSize.height,
                spacing: config.paletteSpacing,
                colors: colors.map((c) => ({ hex: c.hex, name: c.name ?? '' }))
            })
                .offset({ y: config.paletteY, x: normalisedWidth * config.paletteX })
        ) : Empty();

        const heroImage = (
            GeneratedImage({
                imageUrls: productImageUrls,
                prompt: props.prompt ?? '',
                cache: true,
                fuzzy: 0.5,
                contentMode: 'fill',
                fallbackImageUrl: EXAMPLE_GEN_IMAGE,
                loadingView: GeneratingPlaceholder({
                    paletteColors: colors.map((color) => color.hex)
                })
            })
                .frame({ maxWidth: Infinity })
                .frame({ height: config.imageHeight })
                .background(Color('black').opacity(0.1))
                .cornerRadius(20)
                .padding('horizontal', config.imagePadding)
        );

        const titleText = (
            Text(`"${props.title ?? "Mood Board"}"`)
                .multilineTextAlignment('leading')
                .frame({ maxWidth: Infinity, alignment: 'leading' })
                .frame({ maxHeight: Infinity, alignment: 'top' })
                .font(BrandScriptFont())
                .opacity(0.5)
                .padding('top', config.titlePaddingTop)
                .padding('horizontal', config.titlePaddingHorizontal)
        );

        const description = descriptionText ? (
            DescriptionFooter({
                text: descriptionText,
                alignment: config.footerTextAlignment,
                paddingHorizontal: config.footerPaddingHorizontal,
                padding: config.descriptionPadding
            })
        ) : Empty();

        const logoBadge = (
            Image({ url: LOGO_URL })
                .resizable()
                .frame({ width: 581 / 6, height: 109 / 6 })
                .frame({ maxWidth: Infinity, alignment: 'trailing' })
                .frame({ maxHeight: Infinity, alignment: 'top' })
                .opacity(0.5)
                .padding(20)
        );

        const modal = showColorModal ? ColorModal({
            color: showColorModal,
            onDone: () => {
                setShowColorModal(null);
            }
        }) : null;

        return (
            ZStack({ alignment: 'center' }, [
                logoBadge,
                heroImage,
                titleText,
                description,
                productList,
                palette
            ])
                .frame({ maxWidth: Infinity })
                .frame({ height: config.height })
                .background(BrandBackgroundTextured())
                .background(
                    GeometryReader((geo) => {
                        return Color('clear')
                            .onAppear(() => {
                                setWidth(geo.size.width);
                            })
                            .onChange((geo.size.width), ([old, newValue]) => {
                                setWidth(newValue);
                            });
                    })
                )
                .onAppear(() => {
                    if (host) void hydrate();
                })
                .onChange(productIds.join(','), () => {
                    if (host) void hydrate();
                })
        )
            .environment('onColorSelected', (color: PaletteColor) => {
                host?.sendMessage("Let's use more of color #" + color.hex + " in the design.");
            })
            .overlay(modal)
            .colorScheme('light')
            .cornerRadius(4);
    }
});

// ─── Lockups ─────────────────────────────────────────────

const DesktopProductList = (props: {
    products: HydratedProduct[],
    normalisedWidth: number,
    footerSize: number
}) => {
    const slots: { width: number, y: number, xRatio: number }[] = [
        { width: 120, y: 170, xRatio: -0.38 },
        { width: 180, y: 160, xRatio: 0.34 },
        { width: 125, y: -150, xRatio: -0.15 }
    ];

    const cards = slots.map((slot, i) => {
        const product = props.products[i];
        return (
            MoodBoardProductCard({
                url: product?.imageUrl,
                title: product?.title,
                price: formatPrice(product?.price),
                width: slot.width,
                height: slot.width + props.footerSize,
                canDrag: true
            })
                .environment('offset', { y: slot.y, x: props.normalisedWidth * slot.xRatio })
                .zIndex(20)
        );
    });

    return Group(cards);
};

const MobileProductList = (props: {
    products: HydratedProduct[],
    productOffset: number
}) => {
    const cards = props.products.slice(0, 3).map((product) =>
        MoodBoardProductCard({
            url: product.imageUrl,
            title: product.title,
            price: formatPrice(product.price),
            width: 86,
            height: 100,
            canDrag: false
        })
    );

    return (
        ScrollView({ axis: 'horizontal' }, [
            HStack(cards)
                .padding(20)
                .frame({ height: 240 })
        ])
            .frame({ height: 240 })
            .offset({ y: props.productOffset })
    );
};

const DescriptionFooter = (props: {
    text: string,
    alignment: 'leading' | 'center' | 'trailing',
    paddingHorizontal: number,
    padding: number
}) => {
    return (
        HStack([
            Text(props.text)
                .multilineTextAlignment('leading')
                .opacity(0.5),
            VStack([
                Image({ svg: arrowSVG }).resizable().frame({ width: 32, height: 72 })
            ])
                .offset({ y: -35, x: 10 })
        ])
            .frame({ maxHeight: Infinity, alignment: 'bottom' })
            .frame({ maxWidth: Infinity, alignment: props.alignment })
            .padding('trailing', props.paddingHorizontal)
            .font(BrandScriptFont())
            .padding(props.padding)
    );
};

const ColorModal = (props: { color: PaletteColor, onDone: () => void }) => {
    return (
        ZStack([
            ColorInfo(props.color)
                .environment('onDone', () => {
                    props.onDone();
                })
        ])
            .frame({ maxWidth: Infinity, maxHeight: Infinity })
            .background(Color('white'))
            .cornerRadius(12)
            .padding(20)
    );
};

const GeneratingPlaceholder = defineComponent({
    properties: {
        paletteColors: {
            type: "array",
            valueType: { type: "string" }
        }
    },
    body: (props) => {
        // Self-animates on appear so callers can drop this into a slot
        // without juggling extra state. The animation tears down with the
        // view when generation completes.
        const [animating, setAnimating] = useState(false);

        // Each blurred circle needs a real hex; passing undefined renders as
        // solid black, which looks broken when the palette hasn't arrived yet.
        // Skip the background entirely until we have at least one color.
        const hasPalette = (props.paletteColors?.length ?? 0) > 0;

        const blurredBackground = hasPalette ? (
            ZStack([
                Circle().fill(Color(props.paletteColors[0] as ColorProps))
                    .blur(150)
                    .frame({ width: 400, height: 400 })
                    .offset({ x: animating ? 100 : 200 })
                    .opacity(animating ? 0.5 : 1.0)
                    .scaleEffect(animating ? 0.75 : 1.0),
                props.paletteColors[1] ? (
                    Circle().fill(Color(props.paletteColors[1] as ColorProps))
                        .blur(150)
                        .frame({ width: 400, height: 400 })
                        .offset({ x: animating ? 200 : -200, y: -50 })
                        .opacity(animating ? 0.75 : 1.0)
                        .scaleEffect(animating ? 1.25 : 1.0)
                ) : Empty(),
                props.paletteColors[2] ? (
                    Circle().fill(Color(props.paletteColors[2] as ColorProps))
                        .blur(150)
                        .frame({ width: 200, height: 200 })
                        .offset({ x: animating ? -200 : 0, y: -50 })
                        .scaleEffect(animating ? 2.0 : 1.0)
                ) : Empty()
            ])
        ) : Empty();

        return (
            ZStack([
                Rectangle().fill(Color('clear'))
                    .background(blurredBackground),

                Text("Generating your design...")
                    .opacity(0.4)
                    .multilineTextAlignment('center')
                    .padding(16)
                    .frame({ maxWidth: 400, maxHeight: Infinity })
            ])
                .allowsHitTesting(false)
                .onAppear(() => {
                    setTimeout(() => {
                        withAnimation(
                            EaseInOut({ duration: 2.0 }).repeatForever({ autoreverses: true }),
                            () => { setAnimating(true); }
                        );
                    }, 50);
                })
        );
    }
});

const MoodBoardProductCard = defineComponent({
    properties: {
        width: { type: "number" },
        height: { type: "number" },
        title: { type: "string" },
        price: { type: "string" },
        url: { type: "string" },
        canDrag: {
            type: "boolean",
            defaultValue: true
        }
    },
    body: (props) => {
        if (!props.url) {
            return Empty();
        }

        // Hooks
        const env = useEnvironment();
        const host = useMCPHost();
        const [hovered, setHovered] = useState(false);
        const [offset, setOffset] = useState(env.offset ?? { x: 0, y: 0 });
        const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
        const [dragging, setDragging] = useState(false);

        // Computed
        const isMobile = env.sizeClass == 'mobile';
        const heightOffset = isMobile ? 8 : 0;
        const padding = isMobile ? 5 : 8;
        const totalOffset = {
            x: offset.x + dragOffset.x,
            y: offset.y + dragOffset.y
        };

        // Tree
        const image = (
            Image({ url: props.url, contentMode: 'fill' })
                .resizable()
                .frame({ width: props.width - padding * 2, height: props.width - padding * 2 - heightOffset })
        );

        var innerContent = (
            VStack({ spacing: 0 }, [
                image
                    .cornerRadius(4)
                    .padding('top', padding),
                Text(hovered ? (props.price ?? "$29.99") : props.title)
                    .lineLimit(1)
                    .frame({ maxWidth: Infinity, alignment: 'leading' })
                    .font('caption2')
                    .padding()
                    .foregroundStyle(Color('secondary'))
            ])
                .frame({ width: props.width ?? 100, height: props.height ?? 100 })
                .background(
                    Rectangle().fill(Color('white'))
                        .allowsHitTesting(false)
                )
        );

        if (props.canDrag) {
            innerContent = innerContent
                .onDragGesture((drag) => {
                    if (drag.phase == 'began') {
                        setDragging(true);
                    } else if (drag.phase == 'changed' || drag.phase == 'possible') {
                        setDragOffset(drag.translation);
                    } else if (drag.phase == 'ended') {
                        setOffset({
                            x: drag.translation.x + offset.x,
                            y: drag.translation.y + offset.y
                        });
                        setDragOffset({ x: 0, y: 0 });
                        setDragging(false);
                        return;
                    }
                })
                .onHover((hovering) => {
                    if (dragging) {
                        return;
                    }
                    withAnimation(() => {
                        if (hovering && !hovered) {
                            setHovered(hovering);
                        } else {
                            setTimeout(() => {
                                setHovered(false);
                            }, 150);
                        }
                    });
                });
        }

        return (
            ZStack([
                innerContent
                    .onTapGesture(() => {
                        host?.sendMessage("Tell me more about the " + props.title);
                    })
            ])
                .offset(totalOffset)
                .cornerRadius(10)
                .shadow({ y: 10, radius: 10, color: Color('black').opacity(0.1) })
                .scaleEffect(hovered ? 1.025 : 1.0)
        );
    }
});

const MoodBoardPalette = defineComponent({
    properties: {
        width: { type: "number" },
        height: { type: "number" },
        colors: {
            type: "array",
            description: "Palette of colors that were suggested. Give 3 in hex format.",
            valueType: {
                type: "group",
                properties: {
                    name: { type: "string" },
                    hex: { type: "string" }
                }
            }
        },
        spacing: { type: "number" }
    },
    body: (props) => {
        if (!props.colors || props.colors?.length == 0) {
            return Empty();
        }

        const env = useEnvironment();

        const bindjsColors = props.colors.map((color) =>
            Color(color.hex as ColorProps).cornerRadius(4)
                .onTapGesture(() => {
                    env?.onColorSelected?.(color);
                })
        );

        return (
            Rectangle()
                .fill(Color('white'))
                .frame({ width: props.width ?? 100, height: props.height ?? 100 })
                .overlay({ alignment: 'top' },
                    VStack({ spacing: props.spacing ?? 4 }, bindjsColors)
                        .padding(10)
                )
                .cornerRadius(12)
                .shadow({ y: 10, radius: 10, color: Color('black').opacity(0.1) })
        );
    }
});

// ─── Helpers ─────────────────────────────────────────────

function formatPrice(price: number | undefined): string {
    if (typeof price !== 'number' || !isFinite(price) || price <= 0) return '';

    const formatted = price.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });

    return `$${formatted}`;
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

// ─── Previews ────────────────────────────────────────────

const previews = () => [
    Self({
        title: "Modern Oak & Ivory Living Room",
        description: "Warm Minimalist",
        prompt: "Modern living room with oak and ivory",
        paletteColors: [
            { hex: "#F5F0E8" },
            { hex: "#C9967B", name: 'Aztec Gold' },
            { hex: "#D4913B", name: 'Yellow' },
            { hex: "#D6C8AD", name: 'Aztec' },
            { hex: "#6B8F72", name: '' }
        ],
        productIds: [
            "cont_example_throw",
            "cont_example_cushion",
            "cont_example_mug"
        ]
    }).previewName("Default")
];

// ─── Export ──────────────────────────────────────────────

export default defineComponent({
    metadata,
    properties,
    previews,
    body
});


