// Metadata
const metadata = {
    title: "Recommendation Section",
    public: false
}

// Properties
const properties = {
    title: {
        type: "string",
        title: "Title",
        required: true
    },
    description: {
        title: "Description",
        type: "string"
    },
    content: {
        type: "array",
        title: "Section Content",
        valueType: {
            type: "component",
            allowedComponents: ["ProductCarousel"]
        },
        required: true,
        validation: {
            minItems: 1
        }
    },
    cardSize: {
        type: "enum",
        description: "Use small if wanting to present a lot of items without descriptions. Use medium if dont have a preference.",
        defaultValue: "medium",
        options: [{
            label: "Small",
            value: "small"
        },
        {
            label: "Medium",
            value: "medium"
        },
        {
            label: "Large",
            value: "regular"
        }
        ]
    }
} satisfies ComponentProperties;

// Body
const body = (props: InferProps<typeof properties>, children: Component[]): Component => {
    const sizeStyle = useEnvironment().sizeStyle ?? 'medium'
    return (
        VStack({ spacing: 0 }, [

            VStack({ spacing: 8 }, [
                Text(props.title).frame({ maxWidth: Infinity, alignment: 'leading' })
                    .font('headline').fontWeight('semibold')
                    .padding('horizontal', 20),

                Text(props.description).font('subheadline').frame({ maxWidth: Infinity, alignment: 'leading' })
                    .foregroundStyle(Color('secondary'))
                    .lineSpacing(8)
                    .padding('horizontal', 20)
            ]),

            ...(props.content ?? []) as Component[]
        ])
            .environment('sizeStyle', props.cardSize == 'default' || !props.cardSize ? sizeStyle : props.cardSize)
            .background(BrandBackground())
    )
};

const previews = () => ([
    Self({
        title: "Product Section",
        description: "Description",
        content: [
            ProductCarousel({
                productCards: [
                    {
                        title: "Hello",
                        description: "World"
                    }
                ]
            })
        ]
    })
])

// Export
export default defineComponent({
    metadata,
    properties,
    previews,
    body
});
