/**
 * Renders a product card with a gradient/image hero, price, title, and description.
 * Tapping the card sends a detail request to the MCP host. Used internally by tool components.
 */

// Metadata
const metadata = {
    title: "Product Card",
    public: false
};

// Properties
const properties = {
    title: {
        type: "string",
        required: true
    },
    description: {
        type: "string"
    },
    price: {
        type: "number"
    },
    colors: {
        type: "array",
        description: "Gradient colors shown as a placeholder when no image is provided",
        valueType: {
            type: "string"
        }
    },
    image: {
        type: "string",
        description: "Image URL",
        required: true
    }
} satisfies ComponentProperties;

// Helper functions
function formatPrice(price: number): string {
    if (!isFinite(price)) return '';

    const isNegative = price < 0;
    const formatted = Math.abs(price).toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });

    return `${isNegative ? '-' : ''}$${formatted}`;
}


// Body
const BodyContent = defineComponent({
    body: (props: InferProps<typeof properties>, children: Component[]): Component => {
        // Dimension tokens for each size style
        const desktopSizeStyles = {
            regular: {
                height: 400 * 1.2,
                width: 400,
                contentHeight: 112
            },
            medium: {
                height: 300 * 1.2,
                width: 300,
                contentHeight: 112
            },
            small: {
                height: 220 * 1.2,
                width: 220,
                contentHeight: 40
            }
        };

        const mobileSizeStyles = {
            regular: {
                height: 320 * 1.2,
                width: 320,
                contentHeight: 112
            },
            medium: {
                height: 280 * 1.2,
                width: 280,
                contentHeight: 112
            },
            small: {
                height: 170 * 1.2,
                width: 170,
                contentHeight: 40
            }
        };

        const env = useEnvironment()
        const sizeStyle = env.sizeStyle ?? 'regular';
        const ss = env?.sizeClass == 'mobile' ? mobileSizeStyles : desktopSizeStyles
        const currentStyle = ss[sizeStyle];


        // Gradient fallback using the first two colors, or solid black if none provided
        const color = props.colors ? LinearGradient({
            colors: [
                Color(props.colors[0] as ColorProps),
                Color(props.colors[1] as ColorProps),
            ],
            endPoint: 'topLeading',
            startPoint: 'bottomTrailing'
        }) : Color('black');

        // Show the product image if available, otherwise render nothing over the gradient
        const image = props.image && props.image?.length > 0
            ? Image({ url: props.image, contentMode: 'fill' })
                .resizable()
                .frame({ maxHeight: Infinity })
            : Empty();

        const mcpHost = useMCPHost();

        const description = (
            Text(props.description ?? "Description")
                .lineLimit(sizeStyle == 'medium' ? 3 : 3)
                .lineSpacing(sizeStyle == 'medium' ? 8 : 2)
                .font(sizeStyle == 'medium' ? 'subheadline' : 'body')
                .frame({ alignment: 'leading', maxWidth: Infinity })
        )

        return (
            VStack([
                color.overlay(image).cornerRadius(20),
                VStack({ spacing: 4 }, [

                    VStack({ spacing: 6 }, [
                        Text(formatPrice(props.price ?? 0))
                            .font('subheadline')
                            .foregroundStyle(Color('secondary'))
                            .frame({ alignment: 'leading', maxWidth: Infinity }),

                        Text(props.title ?? "ProductCard")
                            .multilineTextAlignment('leading')
                            .font(sizeStyle == 'small' ? 'subheadline' : 'body')
                            .fontWeight('semibold')
                            .lineSpacing(5)
                            .lineLimit(sizeStyle == 'small' ? 1 : 1)
                            .frame({ alignment: 'leading', maxWidth: Infinity })
                    ]),

                    sizeStyle != 'small' ? description : Empty()

                ])
                    .frame({ height: currentStyle.contentHeight, alignment: 'top' })
                    .padding('horizontal', sizeStyle == 'small' ? 12 : 20)
                    .padding('vertical', sizeStyle == 'small' ? 4 : 12)
            ])
                .padding(10)
                .background(Color('white'))
                .cornerRadius(24)
                .shadow({ radius: 12, y: 6, color: Color('black').opacity(0.08) })
                .onTapGesture(() => {
                    mcpHost?.sendMessage('Show me product detail info for: ' + props.title)
                })
                .frame({ width: currentStyle.width, height: currentStyle.height })
        );
    }
});

// Previews
// Previews
const previews = () => ([
    // regular — Lumora Pendant Light
    Self({
        title: "Lumora Pendant Light",
        description: "Hand-blown ombre glass pendant fading from clear to warm amber. Brass canopy and twisted fabric cord included.",
        price: 289.00,
        colors: ["#c78a3a", "#e6c48a"],
        image: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/QZhYPftn0yk37E6SV1Iq/lumora-pendant-light.png"
    })
        .environment('sizeStyle', 'regular')
        .previewName("Regular"),

    // medium — Contour Lounge Chair
    Self({
        title: "Contour Lounge Chair",
        description: "Bent-ply birch frame with generous olive-green cushions. Sculptural, light and modern with a warm organic palette.",
        price: 949.00,
        colors: ["#6b6c3f", "#d9c9a3"],
        image: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/AtZQQourd4khVBmeNmid/006-a-contemporary-lounge-chair-with-a-curve.jpg"
    })

        .environment('sizeStyle', 'medium')
        .previewName("Medium"),

    // small — Petal Boucle Accent Chair
    Self({
        title: "Petal Boucle Accent Chair",
        description: "Mid-century wingback in textured ivory boucle on splayed solid walnut legs. Compact sculptural seating.",
        price: 1190.00,
        colors: ["#ece6d4", "#7a5438"],
        image: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/LWsOA82uk3xZKMhr3bXc/assets/YWMoCwbF2Vo1NsLYNIMC/002-a-comfortable-low-profile-mid-century-mo.jpg"
    })
        .environment('sizeStyle', 'small')
        .previewName("Small"),
]);

// Export
export default defineComponent({
    metadata,
    properties,
    previews,
    body: (props, children) => {
        return EnvironmentSizeClass([
            BodyContent(props, children)
        ])
    }
});
