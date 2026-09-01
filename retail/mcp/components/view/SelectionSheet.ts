/**
 * Content Component: SelectionSheet
 *
 * Sheet for picking 1+ items (colour or image) from a list. The sheet
 * builds a prompt:
 *
 *   value = `${prompt} ${value1},${value2},…`
 *     - image tile  → its `title`
 *     - colour tile → its hex value
 *
 * Done dispatches in order:
 *   1. `env.onDone(value)` — parent receives the built prompt and owns dismissal.
 *   2. `useMCPHost().sendMessage(value)` — push the prompt back to the LLM,
 *      then dismiss via the standard env / prop fallback.
 */


// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const metadata = {
    title: "SelectionSheet",
    description: "Multi-select sheet for BentoCard items. Fires `selectedStarter` on Done.",
    public: true,
};


// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const properties = {

    selectionTitle: {
        type: "string",
        title: "Selection Title",
        defaultValue: "Choose items",
        inspector: { placeholder: "Title shown at the top of the sheet" },
    },

    prompt: {
        type: "string",
        title: "Prompt",
        description: "Prefix sent to the host action followed by a comma-separated list of selected tile values.",
        defaultValue: "",
        inspector: { control: "multiline" },
    },

    items: {
        type: "array",
        title: "Items",
        valueType: {
            type: "group",
            properties: {

                type: {
                    type: "enum",
                    title: "Type",
                    defaultValue: "color",
                    options: [
                        { value: "color", label: "Color" },
                        { value: "image", label: "Image" },
                    ],
                    inspector: { control: "segmented" },
                },

                title: {
                    type: "string",
                    title: "Title",
                    defaultValue: "",
                    inspector: {
                        visible: (p) => p.type === "image",
                        placeholder: "Shown on the tile + sent in the action",
                    },
                },

                color: {
                    type: "string",
                    title: "Color (hex)",
                    defaultValue: "#F5A623",
                    inspector: {
                        visible: (p) => p.type === "color",
                        placeholder: "#RRGGBB",
                    },
                },

                imageUrl: {
                    type: "string",
                    title: "Image URL",
                    defaultValue: "",
                    inspector: {
                        visible: (p) => p.type === "image",
                        placeholder: "https://…",
                    },
                },

            },
        },
    },

} satisfies ComponentProperties;


// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

const body = (props: InferProps<typeof properties>, children: Component[]): Component => {

    const env = useEnvironment();
    const mcp = useMCPHost();

    const items = (props.items ?? []) as Array<{
        type?: "color" | "image";
        title?: string;
        color?: string;
        imageUrl?: string;
    }>;

    const [sselected, ssetSelected] = useState<number[]>([]);
    const selected = env.selected ?? sselected
    const setSelected = env.setSelected ?? ssetSelected;

    // ----- Helpers ---------------------------------------------------------

    const tileValue = (item: typeof items[number]) => {
        if (!item) return "";
        if (item.type === "image") return (item.title ?? "").trim();
        return (item.color ?? "").trim();
    };

    const toggle = (index: number) => {
        withAnimation(Bouncy(), () => {
            if (selected.indexOf(index) >= 0) {
                setSelected(selected.filter((i) => i !== index));
            } else {
                setSelected([...selected, index]);
            }
        })
    };

    const dismiss = () => {
        // Prefer the environment hook the parent wires up. Fall back to a
        // prop callback only if a function was actually passed in.
        if (typeof env?.onDone === "function") {
            env.onDone();
            return;
        }
        const propOnDone = (props as any).onDone;
        if (typeof propOnDone === "function") {
            propOnDone();
        }
    };

    const handleDone = () => {
        const chosen = selected.length > 0
            ? selected.map((i) => items[i]).filter(Boolean)
            : items;

        const tokens        = chosen.map(tileValue).filter((t) => t.length > 0);
        const trimmedPrompt = (props.prompt ?? "").trim();
        const value         = tokens.length > 0
            ? `${trimmedPrompt} ${tokens.join(",")}`.trim()
            : trimmedPrompt;

        // Delivery order:
        //   1. env.onDone(value) — parent receives the prompt and owns dismissal
        //   2. mcp.sendMessage(value) — send back to the LLM, then dismiss ourselves
        if (typeof env?.onDone === "function") {
            env.onDone(value);
            return;
        }

        if (mcp && typeof mcp.sendMessage === "function") {
            mcp.sendMessage(value);
        }
        dismiss();
    };

    // ----- Tile renderer ---------------------------------------------------

    const tileRadius = 12;
    const tileHeight = 110;

    const renderTile = (item: typeof items[number], index: number) => {

        const isSelected = selected.indexOf(index) >= 0;
        const anySelected = selected.length > 0;
        const scale = isSelected ? 1 : anySelected ? 0.95 : 0.95;
        const shadowColor = Color('black')
        const shadowColorWithOpacity = shadowColor.opacity(isSelected ? 0.2 : 0.1);

        const base = (() => {

            if (item.type === "image" && item.imageUrl) {

                const showOverlay = false;//item.title && item.title.length > 0;

                const overlay = showOverlay
                    ? Text(item.title)
                        .font("caption")
                        .fontWeight("semibold")
                        .foregroundStyle(Color("white"))
                        .lineLimit(2)
                        .padding(8)
                        .frame({
                            maxWidth:  Infinity,
                            maxHeight: Infinity,
                            alignment: "bottomLeading",
                        })
                    : null;

                return (
                    ZStack(
                        { alignment: "bottomLeading" },
                        [
                            Image({ url: item.imageUrl, contentMode: "fill" })
                                .resizable()
                                .frame({ maxWidth: Infinity, maxHeight: Infinity }),
                            ...(overlay ? [overlay] : []),
                        ]
                    )
                );
            }

            const fill = item.color && item.color.length > 0
                ? item.color
                : "#E5E5E5";
            return Rectangle().fill(Color(fill as ColorProps));

        })();

        // Selection check mark
        const checkmark = (
            ZStack({ alignment: 'topLeading'}, [
                Circle()
                    .fill(isSelected ? Color("black") : Color("white").opacity(0.45))
                    .frame({ width: 22, height: 22 })
                    .overlay(
                        Circle().stroke({
                            style:     Color("black").opacity(isSelected ? 0 : 0.01),
                            lineWidth: 1,
                        })
                    ),
                isSelected
                    ? Image({ systemName: "checkmark" }).resizable().frame({ width: 22, height: 22})
                        .foregroundStyle(Color("white"))
                        .font("caption2")
                    : Empty(),
            ])
                .frame({
                    maxWidth:  Infinity,
                    maxHeight: Infinity,
                    alignment: "topLeading",
                })
                .padding(8)
        );

        return (
            ZStack([
                base,
                checkmark,
            ])
                .frame({ maxWidth: Infinity })
                .frame({ height: tileHeight })
                .cornerRadius(tileRadius)
                //.clipShape(RoundedRectangle({ cornerRadius: tileRadius }))
                
                // .overlay(
                //     RoundedRectangle({ cornerRadius: tileRadius })
                //         .stroke({
                //             style:     isSelected ? Color("black") : Color("black").opacity(0.05),
                //             lineWidth: isSelected ? 3 : 1,
                //         })
                // )
                .contentShape(RoundedRectangle({ cornerRadius: tileRadius }))
                .onTapGesture(() => toggle(index))
                
                .scaleEffect(scale)
                
        );
    };

    // ----- Grid (2 columns) ------------------------------------------------

    const rows: Component[] = [];
    for (let i = 0; i < items.length; i += 2) {
        const left  = renderTile(items[i],     i);
        const right = i + 1 < items.length
            ? renderTile(items[i + 1], i + 1)
            : Rectangle().fill(Color("clear")).frame({ maxWidth: Infinity }).frame({ height: tileHeight });
        rows.push(
            HStack({ spacing: 10, alignment: "top" }, [left, right])
        );
    }

    const grid = items.length > 0
        ? VStack({ spacing: 10, alignment: "leading" }, rows).shadow({ radius:  8, color: Color('black').opacity(0.1) })
        : ContentUnavailableView({
            title:       "No items",
            systemImage: "tray",
            description: "There's nothing to pick from yet.",
        });

    // ----- Header ----------------------------------------------------------

    const titleView = props.selectionTitle && props.selectionTitle.trim().length > 0
        ? Text(props.selectionTitle)
            .font("title")
            .fontWeight("semibold")
            .foregroundStyle(Color("primary"))
            .frame({ maxWidth: Infinity, alignment: "leading" })
        : null;

    const subtitle = items.length > 0
        ? Text(selected.length === 0
            ? "Select one or more items."
            : `${selected.length} selected`)
            .font("body")
            .foregroundStyle(Color("secondary"))
            .frame({ maxWidth: Infinity, alignment: "leading" })
        : null;

    // ----- Done button -----------------------------------------------------

    const doneButton = Button({
        action: handleDone,
        label:  Text("Done")
            .font("headline")
            .foregroundStyle(Color("accent"))
            .padding("vertical", 14)
            .frame({ maxWidth: Infinity })
            .background(
                RoundedRectangle({ cornerRadius: 14 })
                    .fill(Color("#f0f0f0"))
            ),
    });

    // ----- Layout ----------------------------------------------------------

    return (
        VStack(
            { alignment: "leading", spacing: 8 },
            [
                ...(titleView ? [titleView] : []),
                ...(subtitle  ? [subtitle]  : []),
                grid.padding('top', 16),
                Spacer(),
                doneButton,
            ]
        )
            .padding(20)
            .frame({ maxWidth: Infinity, maxHeight: Infinity })
    );
};


// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default defineComponent({

    metadata: {
        title:       "SelectionSheet",
        description: "Multi-select sheet for BentoCard items. Fires `selectedStarter` on Done.",
        public:      true,
    },
    properties,
    body,

    previews: () => [

        Self({
            selectionTitle: "Pick a palette",
            prompt:         "Start a design project using these colors:",
            items: [
                { type: "color", color: "#F5A623" },
                { type: "color", color: "#3B82F6" },
                { type: "color", color: "#10B981" },
                { type: "color", color: "#8B5CF6" },
            ],
        }).previewName("Colours"),

        Self({
            selectionTitle: "Pick references",
            prompt:         "Design something inspired by:",
            items: [
                { type: "image", title: "Minimal poster",   imageUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400" },
                { type: "image", title: "Brand mark",       imageUrl: "https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=400" },
                { type: "image", title: "Type system",      imageUrl: "https://images.unsplash.com/photo-1481349518771-20055b2a7b24?w=400" },
                { type: "image", title: "Editorial spread", imageUrl: "https://images.unsplash.com/photo-1626785774573-4b799315345d?w=400" },
            ],
        }).previewName("Images"),

        Self({
            selectionTitle: "Pick a mix",
            prompt:         "Use these as a starting point:",
            items: [
                { type: "color", color: "#8B5CF6" },
                { type: "color", color: "#10B981" },
                { type: "image", title: "Brutalist grid", imageUrl: "https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=400" },
                { type: "image", title: "Soft gradient",  imageUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=400" },
            ],
        }).previewName("Mixed"),

        Self({
            selectionTitle: "Choose items",
            prompt:         "Start fresh with:",
            items:          [],
        }).previewName("Empty"),

    ],

});

