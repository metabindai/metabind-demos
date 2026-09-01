// ─── Metadata ─────────────────────────────────────────────

const metadata = {
    title: "Card Stack",
    description: "A stacked draggable card selector driven by a list of inspiration asset ids",
    category: "Custom",
    public: true
};

// ─── Properties ───────────────────────────────────────────

const properties = {
    allowSelection: {
        type: "boolean",
        title: "Allow Selection",
        defaultValue: true,
        description: "When set to true, will let the user click a button to 'choose' the current item they're looking at. It'll send a message back to the LLM. Most of the time might as well default to true."
    },
    ids: {
        type: "array",
        title: "Inspiration IDs",
        valueType: {
            type: "string",
            description: "Array of inspiration asset ids, in the order they should be stacked. Image URLs and titles are resolved from the built-in catalogue, so no URLs are ever passed. Valid ids: 4Vz4QDOsgakAfoXAfDci (Scandinavian), 6CbhV4PNBSz5EHjVD1CT (Minimalist), GiOJSEGechQgSMx9Ued3 (Warm Contemporary), QZA7vy7hvJP56VJO7Y1h (Modern), S1lMVQsgG3BL3RdGps3F (Coastal Hamptons), TLhFIONJsGwqLMBNEq2j (Art Deco), UVKVosxVJ5x4461MtAgN (Classic), VeFfSlpEgl2uSnnXFOZ2 (Coastal), rkI86R371Wgnz00iowUS (Mid Century Modern), tZ7eisSDBTOkaPtES1v0 (Contemporary). Unknown ids are skipped.",
            inspector: { placeholder: "4Vz4QDOsgakAfoXAfDci", control: "singleline" }
        },
        description: "Inspiration asset ids to stack, resolved against the built-in catalogue.",
        validation: { minItems: 1 },
        required: true,
        defaultValue: []
    }
} satisfies ComponentProperties;

// ─── Types ────────────────────────────────────────────────

type Item = { id: string, title: string, url: string };

type CatalogueEntry = { title: string, file: string };

type CardLayout = {
    x: number;
    y: number;
    rotation: number;
    scale: number;
    opacity: number;
};

type TitleLayout = {
    opacity: number;
    blur: number;
    y: number;
    weight: 'regular' | 'semibold';
    color: string;
};

// ─── Constants ────────────────────────────────────────────

const SIZE_CONFIG = {
    mobile: { width: 240, height: 300, totalHeight: 550 },
    default: { width: 300, height: 400, totalHeight: 650 }
};

// Every catalogue asset lives under the same CDN prefix, so entries only
// carry the filename and the URL is rebuilt as `${BASE}${id}/${file}`.
const CATALOGUE_BASE = "https://cdn.metabind.ai/IgJH0BzIn4LlfnCbcDc7/Y676oC7SckYcfyXR54HY/assets/";

// Hardcoded mirror of the tagged reference assets returned by
// `inspiration_search`. Baked in so the card stack can render straight from
// ids without a lookup round-trip. Keep in sync if the tagged asset set
// changes.
const CATALOGUE: Record<string, CatalogueEntry> = {
    "4Vz4QDOsgakAfoXAfDci": { title: "Scandinavian", file: "EZYpuUuAeVOVKfUleXA0__reference-a-bright-scandinavian-lounge-characteriz.jpg" },
    "6CbhV4PNBSz5EHjVD1CT": { title: "Minimalist", file: "6UXixPZKcf0yyYeBvZcu__reference-a-refined-minimalist-lounge-defined-by-i.jpg" },
    "GiOJSEGechQgSMx9Ued3": { title: "Warm Contemporary", file: "Tf0Z3FKK3lKJMDcH1crj__reference-contemporary-lounge.png" },
    "QZA7vy7hvJP56VJO7Y1h": { title: "Modern", file: "pxBPCQGRK7u8kRanFlmx__reference-modern-lounge.png" },
    "S1lMVQsgG3BL3RdGps3F": { title: "Coastal Hamptons", file: "tFzLZ6xHmFhfVyVXidVE__reference-an-airy-coastal-hamptons-lounge-adorned-.jpg" },
    "TLhFIONJsGwqLMBNEq2j": { title: "Art Deco", file: "woN56IDcC5HU5Lmx3woY__reference-a-luxurious-art-deco-lounge-featuring-ge.jpg" },
    "UVKVosxVJ5x4461MtAgN": { title: "Classic", file: "PAhdc12PTlsUr7Huejtz__reference-classic-lounge.png" },
    "VeFfSlpEgl2uSnnXFOZ2": { title: "Coastal", file: "v3qq1MCxdPCpyU5duWlr__reference-coastal-lounge.png" },
    "rkI86R371Wgnz00iowUS": { title: "Mid Century Modern", file: "276V5oHV1AaW66mHGaao__reference-a-sophisticated-mid-century-modern-loung.jpg" },
    "tZ7eisSDBTOkaPtES1v0": { title: "Contemporary", file: "HckbNbhGEVtRfzMgf2gZ__reference-a-sleek-contemporary-lounge-defined-by-c.jpg" }
};

// Used when the caller hasn't supplied ids yet (composer preview, dev
// sandbox, or in-flight prop). The view still renders meaningfully.
const EXAMPLE_IDS = [
    "tZ7eisSDBTOkaPtES1v0",
    "QZA7vy7hvJP56VJO7Y1h",
    "VeFfSlpEgl2uSnnXFOZ2",
    "UVKVosxVJ5x4461MtAgN"
];

// Distance / velocity thresholds for committing a swipe vs. snapping back.
const SWIPE_DISTANCE_THRESHOLD = 100;
const SWIPE_VELOCITY_THRESHOLD = 500;
const FLING_DISTANCE_MAX = 550;
const FLING_DISTANCE_BASE = 250;

// ─── Body ─────────────────────────────────────────────────

const BodyContent = defineComponent({
    properties,
    body: (props, children) => {

        // Hooks
        const env = useEnvironment();
        const host = useMCPHost();

        // Dont use example items when we're in mcp context.
        const requestedIds = props.ids && props.ids.length > 0
            ? props.ids
            : (host ? [] : EXAMPLE_IDS);

        const items: Item[] = resolveItems(requestedIds);

        const [order, setOrder] = useState<number[]>(items.map((_, i) => i));
        const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
        const [lastDrag, setLastDrag] = useState({ velocity: { x: 0, y: 0 }, translation: { x: 0, y: 0 } });
        const [dragging, setDragging] = useState(false);

        // Computed
        const isMobile = env.platform != 'web';
        const isWeb = env.platform == 'web';
        const config = SIZE_CONFIG[env.sizeClass] ?? SIZE_CONFIG.default;
        const topItem = items[order[0]];

        // Side effects
        const rotateForward = () => {
            setOrder([...order.slice(1), order[0]]);
        };

        // Tap on a card: flick the top card off, rotate, new top slides in.
        const advanceNext = () => {
            withAnimation(() => {
                setDragOffset({ x: 300, y: 0 });
            });
            setTimeout(() => {
                withAnimation(() => {
                    setDragOffset({ x: 0, y: 0 });
                });
                withAnimation(() => {
                    rotateForward();
                });
            }, 300);
        };

        const handleDragChanged = (drag: any) => {
            setDragOffset(drag.translation);
            setLastDrag(drag);
        };

        const handleDragEnded = () => {
            setDragging(false);

            // Web reports velocity at roughly 2x the rate of native — halve so the
            // commit threshold feels consistent across platforms.
            const rawSpeed = Math.abs(lastDrag.velocity.x) * 2;
            const speed = isWeb ? rawSpeed / 2 : rawSpeed;

            const distancePastThreshold = Math.abs(lastDrag.translation.x) > SWIPE_DISTANCE_THRESHOLD;
            const velocityPastThreshold = speed > SWIPE_VELOCITY_THRESHOLD;
            const shouldAdvance = distancePastThreshold || velocityPastThreshold;

            if (shouldAdvance) {
                commitSwipe(speed);
            } else {
                snapBack(speed);
            }
        };

        const commitSwipe = (speed: number) => {
            const dir = lastDrag.velocity.x !== 0
                ? (lastDrag.velocity.x > 0 ? 1 : -1)
                : (lastDrag.translation.x > 0 ? 1 : -1);

            const flyDistance = Math.min(FLING_DISTANCE_MAX, FLING_DISTANCE_BASE + speed * 0.06);

            // Phase 1: fling tuned to the user's momentum. How far the card still
            // needs to travel, and how long that would take at the current flick
            // speed. Clamp so a near-zero-speed commit still gets a sensible
            // response, and a super-fast flick doesn't snap.
            const remaining = Math.max(10, flyDistance - Math.abs(lastDrag.translation.x));
            const effectiveSpeed = Math.max(speed, 300);
            const flingResponse = Math.max(0.12, Math.min(0.45, remaining / effectiveSpeed));

            withAnimation(Spring({ response: flingResponse, dampingFraction: 1.0 }), () => {
                setDragOffset({ x: dir * flyDistance, y: lastDrag.translation.y });
            });

            // Phase 2: settle — a softer spring with a touch of bounce. Settle
            // timeout tracks the fling duration (response ≈ duration).
            const settleDelayMs = Math.round(flingResponse * 1000);
            setTimeout(() => {
                const settleAnimation = Spring({ response: 0.4, dampingFraction: 0.75 });
                withAnimation(settleAnimation, () => {
                    setDragOffset({ x: 0, y: 0 });
                });
                withAnimation(settleAnimation, () => {
                    rotateForward();
                });
            }, settleDelayMs);
        };

        const snapBack = (speed: number) => {
            // Velocity-aware so a hard flick that didn't travel far enough still
            // feels decisive.
            const snapResponse = Math.max(0.18, Math.min(0.4, 100 / Math.max(speed, 250)));
            withAnimation(Spring({ response: snapResponse, dampingFraction: 0.7 }), () => {
                setDragOffset({ x: 0, y: 0 });
            });
        };

        // Tree
        const cards = items.map((item, itemIndex) => {
            const depth = order.indexOf(itemIndex);
            const base = layoutForDepth(depth, itemIndex);
            const isTop = depth === 0;

            const x = base.x + (isTop ? dragOffset.x : 0);
            const y = base.y + (isTop ? dragOffset.y : 0);
            const rotation = base.rotation + (isTop ? dragOffset.x * 0.04 : 0);
            const scale = base.scale + (isTop && dragging ? 0.015 : 0);

            return (
                Image({ url: item.url, contentMode: "fill" })
                    .resizable()
                    .frame({ width: config.width, height: config.height })
                    .background(Color('white'))
                    .cornerRadius(23)
                    .offset({ x, y })
                    .rotationEffect(rotation)
                    .scaleEffect(scale)
                    .opacity(1.0)
                    .zIndex(order.length - depth)
                    .id(item.id)
            );
        });

        const stack = (
            ZStack(cards)
                .onTapGesture(() => {
                    advanceNext();
                })
                .onDragGesture((drag) => {
                    if (drag.phase == "began") {
                        setDragging(true);
                    } else if ((drag.phase == "changed" || drag.phase == "possible") && drag.translation.x != 0) {
                        handleDragChanged(drag);
                    } else if (drag.phase == "ended") {
                        handleDragEnded();
                    }
                })
                .shadow({ y: 4, color: Color('black').opacity(0.2), radius: 20 })
        );

        // One Text per item, stacked. Identity via .id() — when `order` rotates,
        // each title smoothly animates opacity/blur/position to its new depth.
        const titleStack = (
            ZStack(items.map((item, itemIndex) => {
                const depth = order.indexOf(itemIndex);
                const t = titleForDepth(depth);
                return (
                    Text(item.title)
                        .frame({ maxWidth: Infinity })
                        .font("title3")
                        .fontWeight(t.weight)
                        .foregroundStyle(Color(t.color as ColorProps))
                        .opacity(t.opacity)
                        .offset({ x: 0, y: 0 })
                        .blur(t.blur)
                        .id(item.id)
                );
            }))
        );

        const chooseButton = MessageButton({
            label: 'Choose',
            message: 'Lets go with: ' + (topItem?.title ?? ''),
            host
        });

        const variationsButton = MessageButton({
            label: ' Variations',
            message: 'I want to see more variations like: ' + (topItem?.title ?? ''),
            host
        });

        const actions = props.allowSelection != false
            ? HStack([chooseButton, variationsButton])
            : null;

        return (
            ZStack([
                VStack({ spacing: 0 }, [
                    Spacer(),
                    titleStack
                        .frame({ height: 40 })
                        .frame({ maxWidth: Infinity }),
                    actions
                ])
                    .padding("bottom", 30),
                stack.offset({ y: -30 })
            ])
                .frame({ maxWidth: Infinity })
                .frame({ height: config.totalHeight, alignment: "top" })
                .background(isMobile ? Color("clear") : Color("#F4F2EE"))
                .onChange(items?.length, ([old, newValue]) => {
                    setOrder(items.map((_, i) => i));
                })
        );
    }
});

// ─── Lockups ─────────────────────────────────────────────

const MessageButton = (props: { label: string, message: string, host: MCPHost | null }) => {
    return (
        Button(props.label, () => {
            if (props.host) {
                props.host.sendMessage(props.message);
            } else {
                alert(props.message);
            }
        }).buttonStyle(ChooseButtonStyle())
    );
};

const ChooseButtonStyle = defineButtonStyle({
    body: (config, props) => {
        const [hover, setIsHovered] = useState(false);

        return (
            config.label
                .font('caption')
                .opacity(hover ? 1.0 : 0.5)
                .padding(8)
                .foregroundStyle(hover ? Color('white') : Color('black'))
                .padding('horizontal', 6)
                .background(RoundedRectangle().opacity(hover ? 1.0 : 0.05))
                .scaleEffect(hover ? 1.05 : 1.0)
                .onHover((hover) => {
                    withAnimation(() => {
                        setIsHovered(hover)
                    });
                })
        );
    }
});

// ─── Helpers ─────────────────────────────────────────────

// Turn the caller's id list into renderable items. Ids resolve against the
// baked-in catalogue; an absolute http(s) URL is accepted as an escape hatch
// so an off-catalogue image can still be shown. Anything else is dropped
// rather than rendering a broken card.
function resolveItems(ids: string[]): Item[] {
    const resolved: Item[] = [];
    for (const id of ids ?? []) {
        const entry = CATALOGUE[id];
        if (entry) {
            resolved.push({ id, title: entry.title, url: `${CATALOGUE_BASE}${id}/${entry.file}` });
        } else if (/^https?:\/\//i.test(id)) {
            resolved.push({ id, title: "", url: id });
        }
    }
    return resolved;
}

// Resting transform per card depth. depth 0 = front, 1/2 = peeking behind,
// 3+ = hidden. itemIndex injects a small alternating jitter so the back
// cards don't sit perfectly aligned.
function layoutForDepth(depth: number, itemIndex: number): CardLayout {
    const jitter = itemIndex % 2;
    if (depth === 0) return { x: 0, y: 0, rotation: 0, scale: 1.00, opacity: 1.00 };
    if (depth === 1) return { x: 24, y: 26, rotation: 7 + jitter, scale: 0.94, opacity: 0.68 };
    if (depth === 2) return { x: -22, y: 20, rotation: -8 + jitter, scale: 0.94, opacity: 0.72 };
    return { x: 0, y: 0, rotation: 0, scale: 0.90, opacity: 0 };
}

// Resting style per depth for the title lane. depth 0 = current (front),
// depth 1 = next, deeper = hidden.
function titleForDepth(depth: number): TitleLayout {
    if (depth === 0) return { opacity: 1.0, blur: 0, y: 0, weight: "semibold", color: "#64615eff" };
    if (depth === 1) return { opacity: 0.0, blur: 6, y: 28, weight: "semibold", color: "#64615eff" };
    return { opacity: 0, blur: 14, y: 0, weight: "semibold", color: "#64615eff" };
}

// ─── Previews ────────────────────────────────────────────

const previews = [
    Self({
        allowSelection: true,
        ids: [
            "4Vz4QDOsgakAfoXAfDci",
            "tZ7eisSDBTOkaPtES1v0",
            "S1lMVQsgG3BL3RdGps3F",
            "rkI86R371Wgnz00iowUS"
        ]
    }).previewName("Default (catalogue ids)"),
    Self({
        allowSelection: false,
        ids: [
            "TLhFIONJsGwqLMBNEq2j",
            "6CbhV4PNBSz5EHjVD1CT"
        ]
    }).previewName("No selection")
];

// ─── Export ──────────────────────────────────────────────

export default defineComponent({
    metadata,
    properties,
    body: (props, children) => {
        return (
            EnvironmentSizeClass([
                BodyContent(props, children)
            ])
            .colorScheme('light')
        );
    },
    previews
});
