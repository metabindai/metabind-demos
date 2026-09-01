/**
 * Shared error panel for MCP tool failures (e.g. when the host hasn't
 * configured an OpenAI API key). Rendered in place of whatever content
 * the failed tool was supposed to produce.
 */

const properties = {
    message: {
        type: "string",
        title: "Message",
        description: "Error string returned by the failing tool. Shown verbatim.",
        required: true
    },
    minHeight: {
        type: "number",
        title: "Minimum Height",
        description: "Minimum panel height in points. Defaults to 360.",
        defaultValue: 360
    }
} satisfies ComponentProperties;

const body = (props: InferProps<typeof properties>): Component => {
    const message = (props.message ?? '').trim();
    const minHeight = props.minHeight ?? 360;

    return (
        Rectangle()
            .fill(Color("white"))
            .frame({ minHeight })
            .cornerRadius(4)
            .overlay(
                Text(message.length > 0 ? message : "Something went wrong.")
                    .multilineTextAlignment("center")
                    .foregroundStyle(Color("#777777"))
                    .padding(24)
                    .frame({ maxWidth: 480 })
            )
    );
};

const previews = [
    Self({
        message: "OpenAI API key not configured. Set OPENAI_API_KEY in the project's environment to enable image generation."
    }).previewName("Missing API key"),
    Self({
        message: "Rate limit exceeded. Try again in a few seconds."
    }).previewName("Rate limit"),
    Self({
        message: ""
    }).previewName("Empty (fallback copy)")
];

export default defineComponent({
    metadata: {
        title: "Tool Error Message",
        description: "Shared error panel for failed MCP tool calls."
    },
    properties,
    body,
    previews
});
