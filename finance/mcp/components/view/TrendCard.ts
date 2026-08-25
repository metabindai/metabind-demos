// trend_card — interactive (view) tool. Generic version of the Net Worth
// Trend card: hero value + change chip + full trend chart for ANY metric
// over a time period — subscription spend, category spend, balances, counts.
// Feed it any {label, value} series (e.g. slice get_subscriptions or
// get_spending_breakdown output, or hand it a computed series).
//
// Two chart styles:
//   • line (default) — continuous area+line trend, axes hidden, index-based
//     x scale. The original behaviour; unchanged.
//   • bar — discrete BarMarks on a CATEGORICAL x scale, x axis visible so the
//     period labels read directly. Points carrying a `series` name stack
//     within each label and the chart draws a legend, which is what makes
//     month-by-month spending-by-category legible.
//
// Why the two paths don't share their scales: a stacked bar must be measured
// from zero (a padded lo..hi domain would make the stack lie about its
// proportions), and its selection reports the x LABEL rather than the numeric
// index a linear scale reports. Series colour comes from
// .foregroundStyle({ by }) so the renderer's own palette and legend do the
// work — there is no scale API here to pin a series to a chosen colour, so
// these hues won't match the Spending card's category colours.

// The assistant's one-line insight, rendered inside the card.
//
// A tinted block rather than plain text, so it reads as commentary about the
// figures rather than as another figure. Deliberately unlabelled — "Insight:"
// or a lightbulb would make one sentence look like a feature announcement.
const InsightNote = ({ text, dark }) => (
    HStack({ spacing: 10, alignment: "top" }, [
        Rectangle()
            .fill(Color("accent").opacity(dark ? 0.55 : 0.4))
            .frame({ width: 3 })
            .cornerRadius(2),
        Text(text)
            .font("footnote")
            .foregroundStyle(Color("secondary"))
            .fixedSize({ horizontal: false, vertical: true }),
        Spacer(),
    ])
        .padding("vertical", 2)
);

export default defineComponent({
    metadata: {
        title: "Trend Card",
        description:
            "Any metric over time that has no dedicated card — one category's spend by month, a series you computed. Points are {label, value} in display order. Set upIsGood=false for cost-like metrics. chartStyle='bar' compares discrete periods; give each point a `series` name (repeating the label once per series) to stack them with a legend. Pass `items` to list the composition behind the number.",
    },
    properties: {
        title: { type: "string", defaultValue: "Trend" },
        periodLabel: { type: "string", defaultValue: "Past 12 months" },
        current: { type: "number", defaultValue: 0 },
        start: { type: "number", defaultValue: 0 },
        change: {
            type: "number",
            defaultValue: 0,
            description: "The change over the period, in the same unit as `current`. Send it together with `start` whenever you have them: the card leads with this figure, and left out it has to work back from `change_pct`, which is close but not the real number.",
        },
        change_pct: { type: "number", defaultValue: 0 },
        valueFormat: {
            type: "enum",
            options: ["currency", "number"],
            defaultValue: "currency",
            description: "How the hero value and change are formatted.",
        },
        valueSuffix: {
            type: "string",
            defaultValue: "",
            description: "Optional unit appended to values, e.g. ' subs' or '/mo'.",
        },
        upIsGood: {
            type: "boolean",
            defaultValue: true,
            description: "false for cost-like metrics: an increase renders red, a decrease green.",
        },
        chartStyle: {
            type: "enum",
            options: ["line", "bar"],
            defaultValue: "line",
            description: "'bar' draws discrete bars on a labelled x axis — better for comparing periods against each other, and the only style that stacks series. 'line' is the continuous trend.",
        },
        items: {
            type: "array",
            valueType: {
                type: "group",
                description: "Optional rows under the chart — the composition behind the number (accounts behind a net worth, categories behind a month's spend). Each is { name, detail, value, color?, prompts? }. `color` is a named colour for the dot ('blue', 'green', …); omit it and rows are coloured in order. `prompts` are follow-up questions offered when the row is tapped — each string is shown as the menu label AND sent to the assistant verbatim, so keep them short and self-contained ('How has my Brokerage changed?', not 'changed?'). OMIT `prompts` unless a row needs something its name cannot imply: left out, the card builds its own drill-down from `name`, which saves you writing the same sentence once per row.",
                properties: {
                    name: { type: "string" },
                    detail: { type: "string" },
                    value: { type: "number" },
                    color: { type: "string" },
                    prompts: { type: "array", valueType: { type: "string" } },
                },
            },
        },
        points: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    label: { type: "string" },
                    value: { type: "number" },
                    // Optional. Repeat a label across several points, one per
                    // series, to stack them: {label:"Mar", series:"Dining"},
                    // {label:"Mar", series:"Groceries"}, … Bar style only —
                    // a series-per-point would shatter a line into
                    // single-point paths that draw nothing.
                    series: { type: "string" },
                },
            },
        },
        note: {
            type: "string",
            defaultValue: "",
            description: "Usually omit this. Optional one-line insight rendered inside the card. Only pass it when you ALREADY have the figures in hand from a call you made for another reason — never make an extra tool call just to write a note, because that round trip delays the card itself. When you do add one, say something the card does not already show (what drove a change, what to watch), in one sentence, and never guess a number.",
        },
        nextSteps: {
            type: "array",
            valueType: { type: "string", description: "One short follow-up the user might ask next, in the form icon|question — 'calendar|Show me last month'. Phrase the question the way the user would say it, and take the icon from the table in the app instructions; any other name renders blank. Always supply 2-3. The card itself ignores them." },
            defaultValue: [],
        },
    },
    body: (props) => {
        // Hooks
        const env = useEnvironment();
        // Only needed to make the detail rows tappable — null in Composer
        // preview and on web, where the rows render plain.
        const host = useMCPHost();
        const [selX, setSelX] = useState(null);

        // Computed
        const dark = !!(env && env.colorScheme === "dark");
        // `change` is optional and routinely left out — the model sends
        // `current` and `change_pct` and omits the amount, which then fell back
        // to its default of 0 and rendered as a confident "+$0 over the past 6
        // months" beside a -5.5% chip. Worse, `up` read that 0 as a rise, so a
        // category that had fallen came out green with a plus sign.
        //
        // Derive the amount where the numbers allow it, and where they don't,
        // say only what is actually known.
        const pctNum = Number(props.change_pct || 0);
        const curNum = Number(props.current || 0);
        const delta = Number(props.change || 0) !== 0
            ? Number(props.change)
            : Number(props.start || 0) !== 0
                ? curNum - Number(props.start)
                : (pctNum !== 0 && curNum !== 0
                    ? curNum - curNum / (1 + pctNum / 100)
                    : null);
        const up = (delta != null ? delta : pctNum) >= 0;
        const good = props.upIsGood === false ? !up : up;
        const accent = good ? Color(dark ? "#30D158" : "#34C759") : Color(dark ? "#FF453A" : "#FF3B30");
        // Accessible delta text/tint (vivid green/red fail contrast as text).
        const deltaText = good ? Color(dark ? "#30D158" : "#1A6B2E") : Color(dark ? "#FF6B6B" : "#C40015");

        const fmt = (n) => {
            const v = Math.round(Number(n || 0) * 100) / 100;
            const body = props.valueFormat === "number"
                ? commas(String(Math.abs(v)))
                : "$" + commas(String(Math.abs(Math.round(v))));
            return (v < 0 ? "−" : "") + body + (props.valueSuffix || "");
        };

        const pts = Array.isArray(props.points) ? props.points : [];

        // Distinct series and x labels, both in first-appearance order so the
        // caller controls legend order and bar order without sorting here.
        const seriesNames = [];
        const xLabels = [];
        for (let i = 0; i < pts.length; i++) {
            const s = pts[i].series;
            if (s && seriesNames.indexOf(s) < 0) seriesNames.push(s);
            const l = pts[i].label;
            if (xLabels.indexOf(l) < 0) xLabels.push(l);
        }

        // Named series imply bars even if chartStyle wasn't set: series data in
        // line style plots every (label, series) pair as its own x index and
        // draws a meaningless zigzag through repeated months. Inferring the
        // style beats rendering that.
        const bar = props.chartStyle === "bar" || seriesNames.length > 0;
        // One bar per label is the sum of that label's points, so a stack is
        // read at its full height — this drives both the y domain and the
        // scrub hero.
        const totalAt = (label) => {
            let sum = 0;
            for (let i = 0; i < pts.length; i++) if (pts[i].label === label) sum += Number(pts[i].value || 0);
            return sum;
        };

        let lo = props.start || 0, hi = props.start || 0;
        for (let i = 0; i < pts.length; i++) {
            const v = pts[i].value;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
        // Tallest stack, for the bar y domain. Falls back to hi when nothing
        // stacks (every label appears once).
        let hiStack = 0;
        for (let i = 0; i < xLabels.length; i++) {
            const t = totalAt(xLabels[i]);
            if (t > hiStack) hiStack = t;
        }

        // Scrub state. The two scales report selection in different currencies:
        // linear x gives a fractional index (rounded/clamped — see
        // NetWorthTrend), categorical x gives the label string itself.

        // Scrubbing a *line* chart reports a fractional index, so the binding
        // fires continuously as the finger moves — and every one of those calls
        // is a `useState` write, which re-runs this whole component in JS and
        // rebuilds the entire card (chart, marks, rows, header) before it can
        // be handed back to SwiftUI. At gesture frequency that is the drag
        // feeling heavy.
        //
        // Nothing on screen can change until the *rounded* index changes, so
        // swallow everything in between: one update per data point crossed
        // rather than one per touch event. The bar charts need no such guard —
        // their selection is a category label, which is already discrete.
        const setSelXCoarse = (v) => {
            const next = v == null ? null : Math.round(Number(v));
            const cur = selX == null ? null : Math.round(Number(selX));
            if (next !== cur) setSelX(v);
        };
        const idx = bar || selX == null || !pts.length
            ? null
            : Math.max(0, Math.min(pts.length - 1, Math.round(Number(selX))));
        // Bar mode scrubs a whole label (the stack), not a single point.
        const scrubLabel = bar && selX != null && xLabels.indexOf(String(selX)) >= 0
            ? String(selX)
            : null;
        const scrub = bar
            ? (scrubLabel == null ? null : { label: scrubLabel, value: totalAt(scrubLabel) })
            : (idx == null ? null : pts[idx]);
        const sign = up ? "+" : "−";
        const pct = pctLabel(props.change_pct);
        // Same period copy rules as Net Worth Trend: "Past 3 months" → "over
        // the past 3 months", "Jun 2025 – Aug 2026" → "from Jun 2025 to Aug 2026".
        const periodLabel = props.periodLabel || "Past 12 months";
        const span = /^Past/i.test(periodLabel)
            ? "over the " + periodLabel.charAt(0).toLowerCase() + periodLabel.slice(1)
            : periodLabel.indexOf("–") >= 0
                ? "from " + periodLabel.replace("–", "to")
                : periodLabel.charAt(0).toLowerCase() + periodLabel.slice(1);

        // Tree
        const changeChip = (
            Text((up ? "+" : "−") + pct + "%")
                .font("footnote")
                .fontWeight("semibold")
                .foregroundStyle(deltaText)
                .padding("horizontal", 10)
                .padding("vertical", 5)
                .background(deltaText.opacity(dark ? 0.22 : 0.12))
                .cornerRadius(9)
        );

        const header = (
            HStack({ alignment: "top" }, [
                VStack({ spacing: 2, alignment: "leading" }, [
                    Text(props.title || "Trend").font("title2").fontWeight("bold").fontDesign("rounded"),
                    Text(periodLabel).font("subheadline").foregroundStyle(Color("secondary")),
                ]),
                Spacer(),
                changeChip,
            ])
        );

        // While scrubbing the hero reports the touched point, not the summary.
        const heroRow = (
            HStack({ alignment: "bottom", spacing: 8 }, [
                Text(fmt(scrub ? scrub.value : props.current))
                    .font("largeTitle")
                    .fontWeight("bold")
                    .fontDesign("rounded")
                    .contentTransition("numericText"),
                Text(scrub
                        ? scrub.label
                        : delta != null
                            ? sign + fmt(Math.abs(delta)) + " " + span
                            // Neither an amount nor anything to derive one from:
                            // the percentage still says something true, and the
                            // bare period is better than a made-up zero.
                            : (pctNum !== 0 ? sign + pct + "% " + span : span))
                    .font("footnote")
                    .fontWeight("medium")
                    .foregroundStyle(scrub ? Color("secondary") : deltaText)
                    .padding("bottom", 6),
                Spacer(),
            ])
        );

        // Bar chart. Categorical x, so no chartXScale and no hidden x axis —
        // the period labels ARE the readout. Marks sharing an x stack in
        // draw order; .foregroundStyle({ by }) is what makes each a distinct
        // series (and therefore what populates the legend), so it is applied
        // even when there is only one, using the card title as its name.
        const barChart = (
            Chart([
                ForEach(pts, (p) =>
                    BarMark({ x: { value: p.label }, y: { value: Number(p.value || 0) } })
                        .foregroundStyle({ by: p.series || props.title || "Value" })
                        // Dim the other periods while one stack is scrubbed.
                        .opacity(scrubLabel && scrubLabel !== p.label ? 0.32 : 1)
                ),
                // Scrub indicator, categorical twin of the line chart's: a
                // dashed rule down the touched month and a dot at the TOP OF
                // THE STACK carrying the month's total, which is the number
                // the stack is actually reporting. The 12% headroom in the y
                // domain above is what keeps that annotation from clipping.
                ...(scrubLabel ? [
                    RuleMark({ x: { value: scrubLabel } })
                        .foregroundStyle(Color("secondary").opacity(0.55))
                        .lineStyle({ width: 1, dash: [4, 3] }),
                    // symbolSize is an AREA (the renderer square-roots it for
                    // the radius), so 64 is an 8pt dot against the ~3.5pt
                    // default.
                    PointMark({ x: { value: scrubLabel }, y: { value: totalAt(scrubLabel) } })
                        .foregroundStyle(accent)
                        .symbolSize(64)
                        .annotation({ text: fmt(totalAt(scrubLabel)), position: "top" }),
                ] : []),
            ])
                .chartYAxis({ hidden: true, gridHidden: true })
                .chartYScale({ domain: [0, (hiStack || 1) * 1.12] })
                .chartLegend({ hidden: false })
                .chartXSelection({ value: selX, onChange: setSelX })
                .sensoryFeedback({ feedback: "selection", trigger: scrubLabel || "" })
                .frame({ height: 240 })
                // Bars don't stretch to fill the card on their own the way the
                // line chart's area does — without this the plot sits narrow
                // and left-aligned. (Edited in the Metabind editor, kept here.)
                .frame({ maxWidth: Infinity })
        );

        // Full trend chart — same treatment as Net Worth Trend.
        const trendChart = (
            Chart([
                ForEach(pts, (p, i) =>
                    AreaMark({ x: i, y: p.value })
                        .foregroundStyle(accent.opacity(0.18))
                        .interpolationMethod("monotone")
                ),
                RuleMark({ y: props.start })
                    .foregroundStyle(Color("secondary").opacity(0.4))
                    .lineStyle({ width: 1, dash: [4, 3] }),
                ForEach(pts, (p, i) =>
                    LineMark({ x: i, y: p.value })
                        .foregroundStyle(accent)
                        .interpolationMethod("monotone")
                        .lineStyle({ width: 2.5 })
                ),
                // Scrub indicator: vertical rule + dot at the touched point.
                ...(scrub ? [
                    RuleMark({ x: idx })
                        .foregroundStyle(Color("secondary").opacity(0.55))
                        .lineStyle({ width: 1 }),
                    PointMark({ x: idx, y: scrub.value })
                        .foregroundStyle(accent)
                        .symbolSize(90),
                ] : []),
            ])
                .chartXAxis({ hidden: true, gridHidden: true })
                .chartYAxis({ hidden: true, gridHidden: true })
                .chartXScale({ type: "linear", domain: [0, Math.max(1, pts.length - 1)] })
                .chartYScale({ domain: [lo - pad, hi + pad] })
                .chartXSelection({ value: selX, onChange: setSelXCoarse })
                .sensoryFeedback({ feedback: "selection", trigger: idx })
                // ChartD3 (web) hardcodes minHeight:240 — see MET-1236, same as
                // NetWorthTrend.
                .frame({ height: 240 })
        );

        // Composition rows under the chart. Same direct-child + Spacer idiom as
        // the other finance cards: rows are children of the card VStack, not a
        // nested stack, so each gets the full proposed width and the value
        // column sits flush right.
        const note = String(props.note || "").trim();
        const noteRow = note ? [InsightNote({ text: note, dark })] : [];
        const rows = Array.isArray(props.items) ? props.items : [];
        const detail = rows.length === 0 ? [] : [
            Divider(),
            ...rows.map((item, index) => TrendItemRow({ item, index, host, fmt })),
        ];

        return (
            VStack({ spacing: 18, alignment: "leading" },
                [header, heroRow, bar ? barChart : trendChart].concat(noteRow).concat(detail))
                .padding(22)
                .background(Color("secondarySystemGroupedBackground"))
                .cornerRadius(24)
                .shadow({ radius: 18, y: 8, color: Color("black").opacity(0.1) })
                //.frame({ maxWidth: 440 })
        );
    },
    previews: () => {
        const subs = [
            { label: "Sep", value: 62 }, { label: "Oct", value: 62 }, { label: "Nov", value: 71 },
            { label: "Dec", value: 71 }, { label: "Jan", value: 76 }, { label: "Feb", value: 76 },
            { label: "Mar", value: 84 }, { label: "Apr", value: 84 }, { label: "May", value: 79 },
            { label: "Jun", value: 89 }, { label: "Jul", value: 89 }, { label: "Aug", value: 94 },
        ];
        const count = [
            { label: "Q1", value: 6 }, { label: "Q2", value: 7 }, { label: "Q3", value: 9 },
            { label: "Q4", value: 8 }, { label: "Q1", value: 10 }, { label: "Q2", value: 11 },
        ];
        // Stacked: one point per (month, category). Repeating the month label
        // is what stacks them.
        const byCategory = [];
        const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug"];
        const cats = [
            { name: "Food & Dining", base: 590, step: 14 },
            { name: "Groceries", base: 430, step: -4 },
            { name: "Shopping", base: 360, step: 22 },
            { name: "Transportation", base: 210, step: -6 },
        ];
        for (let m = 0; m < months.length; m++) {
            for (let c = 0; c < cats.length; c++) {
                byCategory.push({ label: months[m], series: cats[c].name, value: cats[c].base + cats[c].step * m });
            }
        }
        // The A/B pair: ONE series, identical numbers, rendered both ways so
        // line and bar can be compared directly rather than across different
        // datasets. Keep these two in lockstep if you touch either.
        const dining = months.map((m, i) => ({ label: m, value: 590 + 14 * i }));
        const diningProps = {
            title: "Dining", periodLabel: "Past 6 months",
            current: 664, start: 590, change: 74, change_pct: 12.5,
            valueFormat: "currency", upIsGood: false, points: dining,
        };
        // Net Worth Trend rebuilt out of generic props — the check on whether
        // trend_card could stand in for net_worth_trend. Compare it against
        // NetWorthTrend's own preview before retiring anything.
        const netWorth = [
            { label: "Jun", value: 34200 }, { label: "Jul", value: 35100 }, { label: "Aug", value: 35800 },
            { label: "Sep", value: 35200 }, { label: "Oct", value: 36400 }, { label: "Nov", value: 37500 },
            { label: "Dec", value: 36900 }, { label: "Jan", value: 38800 }, { label: "Feb", value: 40100 },
            { label: "Mar", value: 41200 }, { label: "Apr", value: 42300 }, { label: "May", value: 43470 },
        ];
        return [
            Self({
                title: "Net Worth", periodLabel: "Past 12 months",
                current: 43470, start: 34200, change: 9270, change_pct: 27.1,
                valueFormat: "currency", points: netWorth,
                items: [
                    { name: "Everyday Checking", detail: "Checking", value: 3800, color: "blue",
                        prompts: ["Show me recent transactions on my Everyday Checking.", "How has my Everyday Checking changed?"] },
                    { name: "High-Yield Savings", detail: "Savings", value: 12400, color: "green",
                        prompts: ["How has my High-Yield Savings changed over the past 6 months?"] },
                    { name: "Brokerage", detail: "Investment", value: 28500, color: "indigo",
                        prompts: ["How does my Brokerage compare to my other accounts?"] },
                    { name: "Rewards Card", detail: "Credit", value: -1230, color: "orange",
                        prompts: ["Show me recent transactions on my Rewards Card."] },
                ],
            }).previewName("Net Worth, built generically"),
            Self({ ...diningProps, chartStyle: "line" }).previewName("Same data · line"),
            Self({ ...diningProps, chartStyle: "bar" }).previewName("Same data · bar"),
            Self({
                title: "Spending by category", periodLabel: "Past 6 months",
                current: 1738, start: 1590, change: 148, change_pct: 9.3,
                valueFormat: "currency", upIsGood: false,
                chartStyle: "bar", points: byCategory,
                // Bars + composition rows together: the stack, then what's in it.
                items: cats.map((c) => ({
                    name: c.name,
                    detail: c.step >= 0 ? "trending up" : "trending down",
                    value: c.base + c.step * (months.length - 1),
                    prompts: ["What did I spend on " + c.name + " last month?"],
                })),
            }).previewName("Stacked bars + legend + items"),
            Self({
                title: "Subscriptions", periodLabel: "Past 12 months",
                current: 94, start: 62, change: 32, change_pct: 51.6,
                valueFormat: "currency", valueSuffix: "/mo", upIsGood: false, points: subs,
            }).previewName("Subscription cost (up = bad)"),
            Self({
                title: "Active Subscriptions", periodLabel: "Jan 2025 – Jun 2026",
                current: 11, start: 6, change: 5, change_pct: 83.3,
                valueFormat: "number", valueSuffix: " subs", points: count,
            }).previewName("Count trend (date range)"),
        ];
    },
});

// ─── Lockups ─────────────────────────────────────────────

// Fallback dot colours when an item doesn't name one. Named iOS system colours,
// so they adapt to light/dark rather than being pinned to a hex.
const PALETTE = ["blue", "green", "indigo", "orange", "purple", "teal", "pink", "cyan", "yellow", "red"];

// One composition row: dot, name over detail, value flush right. The generic
// twin of NetWorthTrend's AccountRow — same structure, but the follow-up
// questions come from the caller instead of being written into the component,
// which is what lets this serve accounts, categories, merchants or anything
// else. `fmt` is passed down so rows format exactly like the hero.
const TrendItemRow = ({ item, index, host, fmt }) => {
    const env = useEnvironment();
    const negative = Number(item.value || 0) < 0;
    // Fall back to a drill-down built from the row's own name. The model used
    // to type one of these per row — nine near-identical sentences differing
    // only in the category — which is ~360 bytes of an argument payload it
    // generates a token at a time, and the card can compose for free. Supply
    // `prompts` only when the row needs something the name can't imply.
    const authored = Array.isArray(item.prompts) ? item.prompts : [];
    const prompts = authored.length
        ? authored
        : (item.name ? ["How has my " + item.name + " changed?"] : []);
    // A Menu tints its whole label with the accent colour, so every Text
    // carries an explicit foregroundStyle: accent on the name (the tap
    // affordance), primary on the value. Not tappable = name stays primary.
    const tappable = !!host && prompts.length > 0;

    const row = (
        HStack({ spacing: 12 }, [
            Circle()
                .fill(Color(item.color || PALETTE[index % PALETTE.length]))
                .frame({ width: 12, height: 12 }),
            VStack({ spacing: 2, alignment: "leading" }, [
                Text(item.name || "")
                    .font("body")
                    .fontWeight("medium")
                    .foregroundStyle(Color(tappable ? "accent" : "primary")),
                ...(item.detail ? [
                    Text(item.detail).font("footnote").foregroundStyle(Color("secondary")),
                ] : []),
            ]),
            Spacer(),
            Text(fmt(item.value))
                .font("body")
                .fontWeight("semibold")
                .fontDesign("rounded")
                .lineLimit(1)
                .foregroundStyle(negative ? Color("secondary") : Color("primary"))
                .fixedSize({ horizontal: true }),
            // Tappable hint. Plain text, not an SF Symbol — those don't render
            // on web (see SpendingBreakdown).
            ...(tappable ? [
                Text("⋯").font("footnote").foregroundStyle(Color("tertiary")),
            ] : []),
        ])
    );

    if (!tappable) return row;
    // Menus don't work on web, so the row stays plain there.
    if (env.platform == 'web') return row;
    return Menu({ label: row },
        prompts.map((prompt) => Button(prompt, () => host.sendMessage(prompt)))
    ).sensoryFeedback({ feedback: "selection", trigger: item.name || "" });
};

// ─── Helpers ─────────────────────────────────────────────

function commas(s) {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Badge percentages are whole numbers — a raw series can hand us
// 51.63829787234043. Values that round to zero but aren't zero render as "<1"
// rather than a misleading "0".
function pctLabel(n) {
    const v = Math.abs(Number(n || 0));
    if (v > 0 && v < 0.5) return "<1";
    return String(Math.round(v));
}
