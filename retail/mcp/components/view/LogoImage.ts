// Metadata
const metadata = {
    title: "LogoImage",
    public: false
}

// Properties
const properties = {} satisfies ComponentProperties;

// Body
const body = (props: InferProps<typeof properties>, children: Component[]): Component => {
    return (
        Image({ url: "https://cdn.metabind.ai/N9qb1ir3Fst1ree94WHW/JcPoq4t6LBp8ct12ttCJ/assets/JVHAM01BrS28jGF6SG6r/o399JyXks3kPQMHxkOuD__oak-ivory_logo.png" })
            .resizable()
            .frame({ width: 581 / 6, height: 109 / 6 })
            .opacity(0.5)
    )
};

// Export
export default defineComponent({
    metadata,
    properties,
    body
});
