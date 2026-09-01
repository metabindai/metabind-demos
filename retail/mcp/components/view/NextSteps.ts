/**
 * Renders a row of outlined "next step" suggestion pills at the end of an
 * interaction. Tapping a pill injects its `prompt` back into the host
 * conversation via `useMCPHost().sendMessage`, triggering the next turn.
 */

// Properties
const properties = {
    prompts: {
        type: "array",
        title: "Prompts",
        description: "Suggested follow-up prompts. Each pill shows `title` and sends `prompt` when tapped.",
        defaultValue: [],
        valueType: {
            type: "group",
            properties: {
                title: {
                    type: "string",
                    description: "Short label shown on the pill"
                },
                prompt: {
                    type: "string",
                    description: "Full message sent back to the host when tapped"
                }
            }
        }
    }
} satisfies ComponentProperties;

// Body
export default defineComponent({
    metadata: {
        title: "Next Steps",
        description: "Outlined suggestion pills shown at the end of an interaction; tapping a pill sends its prompt back to the host.",
        public: true
    },
    properties,
    body: (props: InferProps<typeof properties>, children: Component[]): Component => {
        const [hasSelected, setHasSelected] = useState(false);

        const items = props.prompts ?? [];
        let bgColor = Color('#F2EDDD')
        if (useEnvironment().platform == 'web') {
            bgColor = Empty();
        }

        if (items.length === 0 || hasSelected) {
            return Group([]);
        }

        const pills = items.map((item, index) =>
            Button({
                label: Text(item.title)
                    .foregroundStyle(Color('black'))
                    .padding("horizontal", 18)
                    .padding("vertical", 8)
                    .font('body')
                    .contentShape(Capsule())
                    .background(Capsule().stroke({ style: Color("black").opacity(0.1), lineWidth: 1 }))
                    .background(Capsule().fill(Color("white")))
                , action: () => {
                    const host = useMCPHost();
                    if (host) {                        
                        host.sendMessage(item.prompt);
                    }
                    setHasSelected(true);
                }
            })
               
                
        );

        return (
            VStack({ spacing: 12}, [
                Text("Suggested next steps")
                    .fontWeight('semibold')
                    .frame({ maxWidth: Infinity, alignment: 'leading' })
                    .font('subheadline')
                    .foregroundStyle(Color('secondary')),
                VStack({ spacing: 8, alignment: 'leading' }, pills)
                    
                    .frame({ maxWidth: Infinity, alignment: 'leading' })
                    
            ])
                .padding('horizontal', 0).padding('vertical', 12)
                .padding('top', 16)
                .background(bgColor)
        )
    },
    previews: () => [
        Self({
            prompts: [
                { title: "Show product details", prompt: "Show me more details about this product" },
                { title: "Compare options", prompt: "Compare these two products side by side" },
                { title: "Design a room", prompt: "Help me design a lounge room with this piece" }
            ]
        }),
        Self({
            prompts: [
                { title: "Show product details", prompt: "Show me more details about this product" },
                { title: "Compare options", prompt: "Compare these two products side by side" },
                { title: "Design a room", prompt: "Help me design a lounge room with this piece" },
                { title: "Find similar", prompt: "Find similar products to this one" },
                { title: "Add to favourites", prompt: "Add this to my favourites" },
                { title: "Browse new arrivals", prompt: "Show me the latest new arrivals" },
                { title: "Sign up", prompt: "How do I sign up for Metabind?" }
            ]
        })
    ]
});
