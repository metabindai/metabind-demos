// Metadata
const metadata = {
    title: "EnvironmentSizeClass"
}

// Properties
const properties = {} satisfies ComponentProperties;

// Body
const body = (props: InferProps<typeof properties>, children: Component[]): Component => {
    const env = useEnvironment();

    let sizeClasses = {
        0: 'mobile',
        550: 'tablet',
        1400: 'desktop'
    }

    let screenWidth = env.screen?.width ?? 400

    const sizeClass = getSizeClass(screenWidth, sizeClasses);

    return (
        Group(children)
            .environment('sizeClass', sizeClass)
            .environment('containerWidth', screenWidth)
    )
};


function getSizeClass(width, breakpoints) {
    const entries = Object.entries(breakpoints)
        .map(([k, v]) => [Number(k), v])
        .sort((a, b) => Number(a[0]) - Number(b[0]));

    let result = entries[0][1];

    for (const [minWidth, label] of entries) {
        if (width >= minWidth) {
            result = label;
        } else {
            break;
        }
    }

    return result;
}

const SizeClassTest = defineComponent({
    body: () => {
        let env = useEnvironment();
        return Text({ markdown: "Size Class **" + env.sizeClass + "**" })
    }
})

const previews = ([
    Self([
        SizeClassTest()
    ])
])

// Export
export default defineComponent({
    metadata: {
        title: "EnvironmentSizeClass"
    },
    properties,
    previews,
    body
});
