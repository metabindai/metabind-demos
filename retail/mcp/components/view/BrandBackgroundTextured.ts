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

            Image({ contentMode: 'fill', url: "https://cdn-dev.metabind.ai/IQDOOSfxsCz6vOufDazi/vIMNFCjt4Hu2QhD4egHR/components/h63fO5EeUDK2l38vTlas/latest/assets/udFg65MV9EZK2k4H4vqA/bg-texture.jpg" })
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
