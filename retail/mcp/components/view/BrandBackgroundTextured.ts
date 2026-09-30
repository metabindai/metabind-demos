// Metadata
const metadata = {
    title: "Brand Background - Textured",
    public: false
}

// Properties
const properties = {} satisfies ComponentProperties;

// Body
const body = (props: InferProps<typeof properties>, children: Component[]): Component => {
    return (
        ZStack([                        
            BrandBackground(),

            Image({ contentMode: 'fill', url: "https://cdn.metabind.ai/IgJH0BzIn4LlfnCbcDc7/Q0WNzrjYuO23n6k2EjKE/assets/u3ddbCJvTaxQiWSh1zGu/bg-texture.jpg" })
                    .resizable()
        ])
                 
    )
};

// Export
export default defineComponent({
    metadata,
    properties,
    body
});
