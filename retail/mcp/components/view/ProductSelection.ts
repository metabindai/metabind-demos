/**
 * Tool Component: ProductSelection
 *
 * Thin wrapper around SelectionSheet that ships with a default product
 * set (coffee table, pendant light, credenza). Use when the user asks
 * to "start a design around using products I've purchased" — the sheet
 * lets them pick which of those products to include, then forwards the
 * built prompt via env.onDone → mcp.sendMessage.
 */


// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TITLE = "Select Products";

const DEFAULT_PRODUCTS = [
    {
        type:     "image",
        title:    "Pebble Round Coffee Table",
        imageUrl: "https://cdn.metabind.ai/IgJH0BzIn4LlfnCbcDc7/Y676oC7SckYcfyXR54HY/assets/uWBJD94e5rli7x45UMBw/4zNpljnwaCR2MbtS9mRX__003-an-oak-ivory-brand-coffee-table-high-end.jpg",
    },
    {
        type:     "image",
        title:    "Lumora Pendant Light",
        imageUrl: "https://cdn.metabind.ai/IgJH0BzIn4LlfnCbcDc7/Y676oC7SckYcfyXR54HY/assets/Oibpyx3F7nuKQP2vDrba/QZhYPftn0yk37E6SV1Iq__lumora-pendant-light.png",
    },
    {
        type:     "image",
        title:    "Viksund Teak Credenza",
        imageUrl: "https://cdn.metabind.ai/IgJH0BzIn4LlfnCbcDc7/Y676oC7SckYcfyXR54HY/assets/Cfk7aiY1ynY7l3HNzaY5/cDEXR2PlQ2TI5q3UJVfp__005-an-elegant-mid-century-modern-credenza-s.jpg",
    },
    {
        type: "image",
        title: "Contour Lounge Chair",
        imageUrl: "https://cdn.metabind.ai/IgJH0BzIn4LlfnCbcDc7/Y676oC7SckYcfyXR54HY/assets/mMCrkn7uTh11FxgbELjG/AtZQQourd4khVBmeNmid__006-a-contemporary-lounge-chair-with-a-curve.jpg"
    },
];


// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const properties = {

    selectionTitle: {
        type:         "string",
        title:        "Selection Title",
        description:  "Title shown at the top of the sheet. Falls back to \"Select Products\" if empty.",
        defaultValue: "",
        inspector:    { placeholder: DEFAULT_TITLE },
    },

    prompt: {
        type:         "string",
        title:        "Prompt",
        description:  "Prefix sent to the LLM followed by a comma-separated list of selected product titles.",
        defaultValue: "Start a design around these products:",
        inspector:    { control: "multiline" },
    },

    items: {
        type:        "array",
        title:       "Items",
        description: "Products to choose from. Leave empty to use the default purchased-product set.",
        valueType:   {
            type:       "group",
            properties: {

                type: {
                    type:         "enum",
                    title:        "Type",
                    defaultValue: "image",
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
        : DEFAULT_PRODUCTS;

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
        title:       "ProductSelection",
        description: "Use this when the user specifically says \"Start a design around using products I've purchased.\" Presents a selection sheet of the user's purchased products and forwards their picks back to the conversation.",
        public:      true,
    },

    properties,
    body,

    previews: () => [

        Self({}).previewName("Defaults"),

        Self({
            selectionTitle: "Pick from your purchases",
            prompt:         "Design a room around these items:",
        }).previewName("Custom prompt"),

        Self({
            selectionTitle: "Pick something",
            prompt:         "Design around:",
            items: [
                { type: "image", title: "Walnut shelf",   imageUrl: "https://images.unsplash.com/photo-1581539250439-c96689b516dd?w=400" },
                { type: "image", title: "Brass lamp",     imageUrl: "https://images.unsplash.com/photo-1565636192335-fc234c33196d?w=400" },
            ],
        }).previewName("Override"),

    ],

});
