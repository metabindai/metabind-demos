/**
 * Tool Component: PaletteSelection
 *
 * Thin wrapper around SelectionSheet that ships with a default colour
 * palette. The user picks one or more swatches and the built prompt is
 * forwarded via env.onDone → mcp.sendMessage.
 */


// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TITLE = "Select Colors";

const DEFAULT_COLORS = [
    { type: "color", color: "#728E74" },
    { type: "color", color: "#D4C8B0" },
    { type: "color", color: "#CA944C" },
    { type: "color", color: "#C1987F" },
];


// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const properties = {

    selectionTitle: {
        type:         "string",
        title:        "Selection Title",
        description:  "Title shown at the top of the sheet. Falls back to \"Select Colors\" if empty.",
        defaultValue: "",
        inspector:    { placeholder: DEFAULT_TITLE },
    },

    prompt: {
        type:         "string",
        title:        "Prompt",
        description:  "Prefix sent to the LLM followed by a comma-separated list of selected hex values.",
        defaultValue: "Shop for products using these palette colors:",
        inspector:    { control: "multiline" },
    },

    items: {
        type:        "array",
        title:       "Items",
        description: "Palette to choose from. Leave empty to use the default colour set, or pass session-specific colours.",
        valueType:   {
            type:       "group",
            properties: {

                type: {
                    type:         "enum",
                    title:        "Type",
                    defaultValue: "color",
                    options: [
                        { value: "color", label: "Color" },
                        { value: "image", label: "Image" },
                    ],
                    inspector: { control: "segmented" },
                },

                title: {
                    type:         "string",
                    title:        "Title",
                    defaultValue: "",
                    inspector: {
                        visible:     (p) => p.type === "image",
                        placeholder: "Shown on the tile + sent in the action",
                    },
                },

                color: {
                    type:         "string",
                    title:        "Color (hex)",
                    defaultValue: "#F5A623",
                    inspector: {
                        visible:     (p) => p.type === "color",
                        placeholder: "#RRGGBB",
                    },
                },

                imageUrl: {
                    type:         "string",
                    title:        "Image URL",
                    defaultValue: "",
                    inspector: {
                        visible:     (p) => p.type === "image",
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

    const passedItems = (props.items ?? []) as Array<{
        type?:     "color" | "image";
        title?:    string;
        color?:    string;
        imageUrl?: string;
    }>;

    const items = passedItems.length > 0
        ? passedItems
        : DEFAULT_COLORS;

    const selectionTitle = props.selectionTitle && props.selectionTitle.trim().length > 0
        ? props.selectionTitle
        : DEFAULT_TITLE;

    return SelectionSheet({
        selectionTitle,
        prompt: props.prompt ?? "",
        items:  items as any,
    });
};


// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default defineComponent({

    metadata: {
        title:       "PaletteSelection",
        description: "*Always* use this when the user specifically says \"Shop for products using palettes from past projects\" — never use a different tool for that request. Do NOT use this if the user specifically asks to \"Start a design based on products I've purchased\" (use ProductSelection instead). Also use it when the user asks at the start of the session to help design a room, especially around the 'Contour chair' — in that case tell them to choose some palette colors first. The default palette is #728E74, #D4C8B0, #CA944C, #C1987F unless other colours have come up during the session, in which case pass those in via `items`.",
        public:      true,
    },

    properties,
    body,

    previews: () => [

        Self({}).previewName("Defaults"),

        Self({
            selectionTitle: "Pick from your palette",
            prompt:         "Find products in:",
        }).previewName("Custom prompt"),

        Self({
            selectionTitle: "Session colours",
            prompt:         "Shop for products in:",
            items: [
                { type: "color", color: "#1F2937" },
                { type: "color", color: "#F59E0B" },
                { type: "color", color: "#EF4444" },
            ],
        }).previewName("Session override"),

    ],

});
