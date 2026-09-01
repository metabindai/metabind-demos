// Metadata
const metadata = {
    title: "Product Groupings"
}

// Properties
const properties = {
    'sections': {
        type: 'array',
        valueType: {
            type: 'component',
            allowedComponents: ['ProductSection']
        },
        validation: {
            minItems: 1
        },
        defaultValue: [],
        required: true
    }
} satisfies ComponentProperties;

// Body
const body = (props: InferProps<typeof properties>, children: Component[]): Component => {
    return (
        VStack({ spacing: 20 }, [
            ...(props.sections ?? []) as Component[]
        ])
            .padding('vertical', 20)
            .environment('sizeStyle', 'medium')
            .background(BrandBackground())
    )
};

const previews = () => ([
    ScrollView({ axis: 'vertical' }, [
        Self({
            title: "Product Recommendations",
            sections: [
                ProductSection({
                    title: "New Arrivals",
                    cardSize: 'regular',
                    description: "Just landed — lighting, ceramics, and objects for the considered home.",
                    content: [
                        ProductCarousel({
                            productIds: [
                                "cont_1776491113487831",
                                "cont_1776491113487831",
                                "cont_1776491113487831"
                            ]
                        })
                    ]
                }),
                ProductSection({
                    title: "Made to Last",
                    cardSize: 'medium',
                    description: "Natural materials, enduring forms. Textiles and furniture built for the long term.",
                    content: [
                        ProductCarousel({
                            productIds: [
                                "cont_1776491113487831",
                                "cont_1776491113487831",
                                "cont_1776491113487831"
                            ]
                        })
                    ]
                }),
                ProductSection({
                    title: "Table Ready",
                    cardSize: 'small',
                    description: "Boards, vessels and accents for kitchens and tables that earn their place every day.",
                    content: [
                        ProductCarousel({
                            productIds: [
                                "cont_1776491113487831",
                                "cont_1776491113487831",
                                "cont_1776491113487831"
                            ]
                        })
                    ]
                })
            ]
        })
    ])
])

// Export
export default defineComponent({
    metadata,
    properties,
    previews,
    body
});
