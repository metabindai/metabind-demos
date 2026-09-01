const metadata = {
    title: "Color Action Card",
    description: "A color swatch card with built-in actions for applying or removing a color",
    category: "Custom",
    public: false
};

const properties = {
    hex: {
        type: "string",
        title: "Color Hex",
        description: "Hex value for the featured color",
        inspector: {
            placeholder: "#C9974C",
            control: "singleline"
        },
        validation: {
            minLength: 4,
            maxLength: 9
        }
    },
    name: {
        type: "string",
        title: "Color Name",
        description: "Display name for the color",
        inspector: {
            placeholder: "Aztec Gold",
            control: "singleline"
        },
        validation: {
            minLength: 1,
            maxLength: 60
        }
    }
} satisfies ComponentProperties;

const body = (props: InferProps<typeof properties>, children: Component[]): Component => {
    const colorValue = props.hex || "#C9974C";
    const colorName = props.name || colorValue;
    const mcp = useMCPHost();
    const env = useEnvironment();

    const actionOptions = [
        {
            id: "more",
            lines: ["Update design with", "more of this color"],
            log: `Update design with more of ${colorName} (${colorValue})`
        },
        {
            id: "remove",
            lines: ["Remove this color", "from the design"],
            log: `Remove ${colorName} (${colorValue}) from the design`
        },
        {
            id: "advice",
            lines: ["Tell me effective ways", "to use colour"],
            log: `Tell me effective ways to use ${colorName} (${colorValue}) from an interior designer point of view`
        },
        {
            id: "advice",
            lines: ["Show me complementary", " and constrasting colors"],
            log: `Show me complementary and constrasting colors for ${colorName} (${colorValue}) from an interior designer point of view`
        },
    ];

    const actionButton = (option: typeof actionOptions[number]) =>
        Button({
            action: () => {
                mcp?.sendMessage?.(option.log)
                env?.onDone?.();
            },
            label: VStack({ spacing: 2, alignment: "center" }, [
                Text(option.lines[0])
                    .font("headline")
                    .fontWeight("regular")
                    .multilineTextAlignment("center"),
                Text(option.lines[1])
                    .font("headline")
                    .fontWeight("regular")
                    .multilineTextAlignment("center")
            ])
                .frame({ maxWidth: Infinity, maxHeight: Infinity })
        })
            .frame({ width: 250, height: 90 })
            .background(Color("#fafafa"))
            .cornerRadius(18)
            .shadow({ radius: 0, color: Color("#D0D0D0") });

    return VStack({ spacing: 36, alignment: "center" }, [
        VStack({ spacing: 0, alignment: "leading" }, [
            Rectangle()
                .fill(Color(colorValue))
                .frame({ height: 180 })
                .cornerRadius(4),

            VStack({ spacing: 6, alignment: "leading" }, [
                Text(colorName)
                    .font("title3")
                    .fontWeight("semibold")
                    .multilineTextAlignment("leading")
            ])
                .frame({ width: 220, height: 50, alignment: "topLeading" })
                .padding(20)
                .background(Color("white"))
        ])
            .frame({ width: 200 })
            .background(Color("white"))
            .cornerRadius(16)
            .shadow({ radius: 20, y: 12, color: Color("black").opacity(0.12) })
            .onTapGesture(() => {
                env?.onDone?.();
            })
        ,

        VStack({ spacing: 24, alignment: "leading" }, [
            HStack({ spacing: 24, alignment: "center" }, [
                actionButton(actionOptions[0]),
                actionButton(actionOptions[1])
            ]),
            HStack({ spacing: 24, alignment: "center" }, [
                actionButton(actionOptions[2]),
                actionButton(actionOptions[3])
            ])
        ])
    ])
        .background(
            Color("white")

        )
};

const previews = [
    Self({
        colorHex: "#C9974C"
    }).previewName("Aztec Gold")
];

export default defineComponent({
    metadata,
    properties,
    body,
    previews
});