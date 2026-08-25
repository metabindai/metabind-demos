// spending_breakdown — interactive (view) tool (Banking Assistant slice).
//
// FETCH-ONLY. The agent passes { period } (plus optional { highlight }) and the
// card calls get_spending_breakdown itself via
// useMCPHost().toolCall("get_spending_breakdown", { period }).
//
// The result fields — total_spend, total_income, net, comparison, groups — are
// read from props when present so previews can supply them directly, but they
// are NOT declared properties. Anything in `properties` lands in the tool's
// input schema, and a schema offering the dense groups array (nine categories x
// seven fields, each with its own top_merchants list) out-argues any
// description telling the model not to fill it.
//
// In a host without the bridge (e.g. Composer preview) host is null, so it
// renders whatever preview data it was given.

// Apple iOS system colors (the iPhone palette) — named, so they adapt to
// light/dark automatically rather than being pinned to one hex.
const COLORS = {
    "Housing": "indigo", "Food & Dining": "orange", "Groceries": "green",
    "Shopping": "pink", "Utilities": "yellow", "Health": "red",
    "Entertainment": "purple", "Subscriptions": "teal", "Transportation": "blue",
    "Travel": "mint", "Income": "green", "Transfers": "gray", "Investments": "cyan",
};
const PALETTE = ["blue", "orange", "green", "pink", "purple", "teal", "indigo", "cyan", "yellow", "red"];

// Shared period vocabulary — see the note in GetTransactions.ts.
const PERIOD = {
    "7d": "Last 7 days", "30d": "Last 30 days", mtd: "This month", lastMonth: "Last month",
    "3mo": "Past 3 months", "6mo": "Past 6 months", ytd: "Year to date",
    "1y": "Last 12 months", all: "All time",
};

// How each window reads inside a spoken follow-up. The row menu used to say
// "this month" and "the past 6 months" no matter what the card was showing, so
// tapping a row on a `lastMonth` card asked a question about a different window
// than the one on screen.
const DRILL_PERIOD = {
    "7d": "in the last 7 days", "30d": "in the last 30 days", mtd: "this month",
    lastMonth: "last month", "3mo": "over the past 3 months", "6mo": "over the past 6 months",
    ytd: "this year", "1y": "over the past 12 months", all: "across everything",
};

// Suffix for the headline comparison badge, matched to the window the data
// actually covers — "from last month" only makes sense for the month views.
const CMP_SUFFIX = {
    "7d": " vs prior week", "30d": " from last month", mtd: " from last month", lastMonth: " vs the month before",
    "3mo": " vs prior 3 months", "6mo": " vs prior 6 months", ytd: " vs last year",
    "1y": " vs prior year", all: " vs prior year",
};

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
        title: "Spending Breakdown",
        description:
            "Spending split by category for a period: a composition bar plus a ranked category list. It loads its own data — pass the period alone for the whole picture, which is what a broad 'where did my money go' question wants. `highlight` is for follow-ups about particular categories only; see its own description.",
    },
    properties: {
        // The complete input surface: which window, and what to call out.
        period: {
            type: "string",
            defaultValue: "mtd",
            description: "Window: 7d, 30d, mtd (this month so far), lastMonth (the whole previous calendar month), 3mo, 6mo, ytd, 1y or all.",
        },
        highlight: {
            type: "array",
            valueType: { type: "string", description: "OMIT THIS unless the user asked about specific categories. Leaving it empty is the normal, correct view: the whole picture, nothing dimmed. A broad opening question — 'where did my money go', 'show me my spending', 'how did I do this month' — wants the whole picture, so pass period alone. Only emphasise on a FOLLOW-UP that is genuinely about particular categories ('what should I cut', 'is dining out of hand', 'why is it higher than last month'), where you name them: ['Food & Dining','Subscriptions']. Everything else then dims and the hero reports their combined total. Matching is forgiving ('dining' finds 'Food & Dining')." },
            defaultValue: [],
        },
        note: {
            type: "string",
            defaultValue: "",
            description: "Usually omit this. Optional one-line insight rendered inside the card. Only pass it when you ALREADY have the figures in hand from a call you made for another reason — never make an extra tool call just to write a note, because that round trip delays the card itself. When you do add one, say something the card does not already show (what drove a change, what to watch), in one sentence, and never guess a number.",
        },
        drillPrompt: {
            type: "string",
            defaultValue: "",
            description: "What tapping a category should ask, when the question had an angle worth carrying. Write it as the user would say it and put {category} where the name goes: 'Show me the odd {category} transactions', 'Where can I cut back on {category}?'. Set it when the card answers something pointed — unusual spending, what to cut, why something moved — so the follow-up inherits that instead of resetting to a plain list. Omit it for a broad 'where did my money go', where a plain list is what a tap should give.",
        },
        nextSteps: {
            type: "array",
            valueType: { type: "string", description: "One short follow-up the user might ask next, in the form icon|question — 'calendar|Show me last month'. Phrase the question the way the user would say it, and take the icon from the table in the app instructions; any other name renders blank. Always supply 2-3. The card itself ignores them." },
            defaultValue: [],
        },
    },
    body: (props) => {
        // Hooks
        const host = useMCPHost();
        const env = useEnvironment();
        const [fetched, setFetched] = useState(null);
        const [failed, setFailed] = useState(false);
        // The key we've already started fetching. Plain state — the extra
        // render it causes is what makes the guard below stop firing.
        const [claimedKey, setClaimedKey] = useState(null);
        // Name of the isolated category, or null for the whole-total view.
        const [selected, setSelected] = useState(null);

        // Computed
        // Trend chips: iOS systemRed/Green tint for the fill (iPhone identity),
        // darker-shade text so it clears WCAG AA on that tint. { text, bg } pairs.
        const dark = !!(env && env.colorScheme === "dark");
        const tint = dark ? 0.22 : 0.15;
        const up = {
            text: dark ? Color("#FF6B6B") : Color("#C40015"),
            bg: Color("red").opacity(tint),
        };
        const down = {
            text: dark ? Color("#30D158") : Color("#1A6B2E"),
            bg: Color("green").opacity(tint),
        };

        const inline = Array.isArray(props.groups) ? props.groups : [];
        const hasInline = inline.length > 0;
        const data = hasInline ? props : fetched;

        // Side effects (called from .onAppear / .onChange)
        // What this card's data actually depends on. Keying the fetch on these
        // rather than on mount is what makes it correct on every host: where
        // props arrive whole (web, Composer preview) the key never changes and
        // this fetches exactly once, and where they stream in a fragment at a
        // time the key settles as the real values land and the card refetches
        // against them. Mount-only fetching quietly queried the default window
        // and cached that answer under a title asking for a different one.
        const fetchKey = [props.period].map((v) => String(v == null ? "" : v)).join("\u0001");

        const hydrate = async (key) => {
            setClaimedKey(key);
            const result = await loadOnce(key, () => fetchBreakdown(host, props.period || "mtd"));
            if (result) { setFetched(result); setFailed(false); }
            else setFailed(true);
        };

        // Driven from the render path, not from a lifecycle modifier. The
        // inputs can settle while any branch is on screen — the spinner, the
        // error card, or a card already showing data fetched under an earlier
        // key — and `.onAppear` only ever covers the branch it is attached to.
        // `claimedKey` makes this idempotent: one fetch per distinct key.
        if (host && !hasInline && claimedKey !== fetchKey) void hydrate(fetchKey);

        // Single-tool path: no data passed → fetch it ourselves once on mount.
        // Every exit is terminal: data renders or an error renders. The spinner
        // is the only non-terminal state and it always resolves into one of
        // those.
        if (!data) {
            if (failed || !host) {
                return (
                    Card([
                        Text("Spending").font("title2").fontWeight("bold").fontDesign("rounded"),
                        Text(host ? "Couldn't load spending data. Ask again to retry." : "No spending data provided.")
                            .font("body")
                            .foregroundStyle(Color("secondary")),
                    ])
                );
            }
            // Title plus a spinner — no "Loading…" copy, which is read for an
            // instant and then replaced. .onAppear is what kicks off the fetch,
            // so this still has to render something.
            return (
                Card([
                    Text("Spending").font("title2").fontWeight("bold").fontDesign("rounded"),
                    ProgressView({})
                        .frame({ maxWidth: Infinity })
                        .padding("vertical", 24),
                ])
                    .onAppear(() => {
                        void hydrate(fetchKey);
                    })
            );
        }

        const groups = (data.groups || []).slice().sort((a, b) => (b.amount || 0) - (a.amount || 0));

        // Emphasis has two sources: the live drag (one category, direct
        // manipulation) and the `highlight` prop (the assistant calling
        // categories out in its answer). A finger on the bar always wins while
        // it is down — touching the chart should never fight the model's
        // framing silently — and releasing falls back to the highlight.
        //
        // Resolve every name against the data actually rendered: a stale drag
        // selection (period changed underneath it) or a category the model
        // invented falls out here, so the card can't get stuck lighting
        // something that isn't in the list.
        const picked = selected ? groups.find((g) => g.name === selected) || null : null;
        const called = groups.filter((g) => nameMatches(props.highlight, g.name));
        const emphasis = picked ? [picked] : called;
        const dimmed = (name) => emphasis.length > 0 && !containsName(emphasis, name);

        // Combined total of whatever is emphasised — one category or several.
        let emphAmount = 0, emphPct = 0;
        for (let i = 0; i < emphasis.length; i++) {
            emphAmount += Number(emphasis[i].amount || 0);
            emphPct += Number(emphasis[i].pct_of_total || 0);
        }
        const cmpPct = data.comparison ? Number(data.comparison.change_pct || 0) : 0;
        const cmpUp = cmpPct > 0;

        // Tree
        const comparisonChip = (
            Text((cmpUp ? "+" : "−") + Math.abs(cmpPct) + "%" + (CMP_SUFFIX[data.period] || CMP_SUFFIX[props.period] || ""))
                .font("footnote")
                .fontWeight("semibold")
                .foregroundStyle((cmpUp ? up : down).text)
                .padding("horizontal", 10)
                .padding("vertical", 5)
                .background((cmpUp ? up : down).bg)
                .cornerRadius(9)
        );

        // Header: title + period + overall vs-last-period badge
        const header = (
            HStack({ alignment: "top" }, [
                VStack({ spacing: 2, alignment: "leading" }, [
                    Text("Spending").font("title2").fontWeight("bold").fontDesign("rounded"),
                    Text(PERIOD[data.period] || PERIOD[props.period] || "This month")
                        .font("subheadline")
                        .foregroundStyle(Color("secondary")),
                ]),
                Spacer(),
                comparisonChip,
            ])
        );

        // Total + income context. Web renderer ignores "firstTextBaseline"
        // (drops to center); "bottom" aligns the box bottoms ≈ baseline here.
        // While anything is emphasised the hero reports that instead of the
        // whole total: the category by name when it's one, a count when the
        // assistant has called out several.
        const heroCaption = emphasis.length === 0
            ? "of your " + money(data.total_income) + " income"
            : (emphasis.length === 1 ? emphasis[0].name : emphasis.length + " categories")
                + " · " + Math.round(emphPct) + "%";
        const heroRow = (
            HStack({ alignment: "bottom", spacing: 8 }, [
                Text(money(emphasis.length ? emphAmount : data.total_spend))
                    .font("largeTitle")
                    .fontWeight("bold")
                    .fontDesign("rounded")
                    .contentTransition("numericText"),
                Text(heroCaption)
                    .font("subheadline")
                    .fontWeight("medium")
                    .foregroundStyle(Color("secondary"))
                    .padding("bottom", 6),
                Spacer(),
            ])
        );

        // Composition bar. NOTE: a donut (PieChart/PieSliceMark) can't be
        // data-driven in Tier 2B — values must be literals — so this stacked
        // proportion bar stands in. Dynamic Rectangle widths, no chart engine.
        // Responsive composition bar: read the live content width so the segments
        // sum to exactly it and the bar fits flush at any device width (a fixed
        // width overflows on narrow screens). Height-clamped so GeometryReader
        // doesn't grab vertical space.
        // One recogniser spans the whole bar rather than one per segment: press
        // anywhere and drag across to sweep the isolation along, releasing to
        // clear. Per-segment taps made thin slices (Subscriptions at 2% is a
        // few points wide) practically unhittable; sweeping reaches them, and
        // the gap-splitting below means no x position falls through the cracks.
        const compositionBar = (
            GeometryReader((geo) => {
                // Subtract the inter-segment gaps (1pt spacing × n−1) so the
                // segments sum to exactly the available width at any count.
                const avail = (geo.size.width || 360) - Math.max(0, groups.length - 1);
                const widths = groups.map((g) =>
                    Math.max(3, (Number(g.amount || 0) / (data.total_spend || 1)) * avail));

                // Hit ranges in bar-local x. Each 1pt gap is split between its
                // neighbours so every x maps to a segment, and the ends extend
                // outward so a slightly-off press still registers.
                const edges = [];
                let x = 0;
                for (let i = 0; i < groups.length; i++) {
                    edges.push({ name: groups[i].name, start: i === 0 ? -1e6 : x - 0.5 });
                    x += widths[i] + 1;
                }
                for (let i = 0; i < edges.length; i++) {
                    edges[i].end = i === edges.length - 1 ? 1e6 : edges[i + 1].start;
                }
                const hit = (px) => {
                    for (let i = 0; i < edges.length; i++) {
                        if (px >= edges[i].start && px < edges[i].end) return edges[i].name;
                    }
                    return null;
                };

                return HStack({ spacing: 1 },
                    groups.map((g, i) =>
                        Rectangle()
                            .fill(colorFor(g.name, i))
                            .frame({ width: widths[i], height: 16 })
                            .opacity(dimmed(g.name) ? 0.25 : 1)
                    )
                )
                    .clipShape(Capsule())
                    .frame({ height: 16 })
                    // minimumDistance 0 fires on touch-down, so the highlight
                    // appears on press rather than after a drag threshold.
                    .contentShape(Rectangle())
                    .onDragGesture({ minimumDistance: 0 }, (state) => {
                        // Allow-list, not deny-list: ONLY an active press selects.
                        // Testing for "ended"/"cancelled" instead let the release
                        // fall through whenever the bridge reported some other
                        // phase, and that trailing event carries x≈0 — which the
                        // hit-test resolves to the leftmost segment, so the first
                        // category stayed lit after lifting off.
                        const phase = state && state.phase;
                        const loc = state && state.locationInView;
                        const pressing = (phase === "began" || phase === "changed") && !!loc;
                        setSelected(pressing ? hit(loc.x) : null);
                    })
                    // value must be a plain string/number/bool — null isn't accepted.
                    .animation({ animation: EaseInOut().speed(1.6), value: selected || "" })
                    .sensoryFeedback({ feedback: "selection", trigger: selected || "" });
            }).frame({ height: 16 })

        );

        const note = String(props.note || "").trim();

        return (
            Card([
                header,
                heroRow,
                compositionBar,
                ...(note ? [InsightNote({ text: note, dark })] : []),
                Divider(),
                // Ranked category list — rows are DIRECT children of the card VStack (not
                // nested), so each fills full width like the header and the amount column
                // sits flush right.
                ...groups.map((group, index) =>
                    CategoryRow({ group, index, up, down, host, dimmed: dimmed(group.name),
                        periodPhrase: DRILL_PERIOD[data.period] || DRILL_PERIOD.mtd,
                        drillPrompt: String(props.drillPrompt || "").trim() })),
            ])
        );
    },
    previews: () => {
        const groups = [
            { name: "Housing", icon: "house.fill", amount: 2000, pct_of_total: 46.7, transaction_count: 1, change_vs_prev_pct: 0 },
            { name: "Food & Dining", icon: "fork.knife", amount: 640, pct_of_total: 15.0, transaction_count: 34, change_vs_prev_pct: 22 },
            { name: "Shopping", icon: "bag.fill", amount: 430, pct_of_total: 10.0, transaction_count: 7, change_vs_prev_pct: 12 },
            { name: "Groceries", icon: "cart.fill", amount: 420, pct_of_total: 9.8, transaction_count: 9, change_vs_prev_pct: -5 },
            { name: "Utilities", icon: "bolt.fill", amount: 260, pct_of_total: 6.1, transaction_count: 4, change_vs_prev_pct: 3 },
            { name: "Transportation", icon: "car.fill", amount: 180, pct_of_total: 4.2, transaction_count: 11, change_vs_prev_pct: -14 },
            { name: "Health", icon: "heart.fill", amount: 134, pct_of_total: 3.1, transaction_count: 3, change_vs_prev_pct: -8 },
            { name: "Entertainment", icon: "film.fill", amount: 120, pct_of_total: 2.8, transaction_count: 5, change_vs_prev_pct: 13 },
            { name: "Subscriptions", icon: "repeat", amount: 96, pct_of_total: 2.2, transaction_count: 6, change_vs_prev_pct: 23 },
        ];
        return [
            Self({
                period: "mtd", total_spend: 4280, total_income: 6400, net: 2120,
                comparison: { prev_period_spend: 3990, change_pct: 7.3 }, groups,
            }).previewName("This month"),
            Self({
                period: "30d", total_spend: 3990, total_income: 6400, net: 2410,
                comparison: { prev_period_spend: 4180, change_pct: -4.5 },
                groups: groups.slice(0, 5),
            }).previewName("Fewer categories"),
            Self({
                period: "mtd", total_spend: 4280, total_income: 6400, net: 2120,
                comparison: { prev_period_spend: 3990, change_pct: 7.3 }, groups,
                highlight: ["Food & Dining", "Subscriptions"],
            }).previewName("Assistant call-out (what should I cut)"),
            Self({
                period: "mtd", total_spend: 4280, total_income: 6400, net: 2120,
                comparison: { prev_period_spend: 3990, change_pct: 7.3 }, groups,
                // Loose match: "dining" resolves to "Food & Dining".
                highlight: ["dining"],
            }).previewName("Single highlight, loose name"),
        ];
    },
});

// ─── Lockups ─────────────────────────────────────────────

const Card = (children) => (
    VStack({ spacing: 18, alignment: "leading" }, children)
        .padding(22)
        .background(Color("secondarySystemGroupedBackground"))
        .cornerRadius(24)
        .shadow({ radius: 18, y: 8, color: Color("black").opacity(0.10) })
        //.frame({ maxWidth: 420 })
);

// +/− percent chip. Tinted-label pattern: fill is the iOS systemRed/Green tint
// (iPhone identity), text is a darker shade of that hue so it clears WCAG AA on
// the tint. Direction is also in the +/− sign, never color alone. ASCII +
// and U+2212 minus — arrow and triangle glyphs (↑/▲) drop out of the
// server-side snapshot renderer's font fallback, signs render everywhere.
// `up`/`down` are { text, bg } pairs passed from the body so they adapt to
// light/dark.
const DeltaBadge = ({ pct, up, down }) => {
    const p = Number(pct || 0);
    if (p === 0) return Text("—").font("footnote").foregroundStyle(Color("tertiary"));
    const c = p > 0 ? up : down;
    return (
        Text((p > 0 ? "+" : "−") + pctLabel(p) + "%")
            .font("footnote")
            .fontWeight("semibold")
            .lineLimit(1)
            .foregroundStyle(c.text)
            .padding("horizontal", 7)
            .padding("vertical", 2)
            .background(c.bg)
            .cornerRadius(7)
    );
};

// Solid color dot legend — ties each row to its segment in the composition bar.
// (SF Symbol icons via Image({systemName}) do NOT render on web, only native.)
// Structured exactly like the header row (which reaches the right edge): a
// direct child of the card VStack + a Spacer. Direct children get the full
// width proposed, so Spacer drives the amount column flush right.
// Tapping a category opens a menu of follow-ups; each hands the phrasing to
// the assistant via sendMessage, so the answer comes back as another card.
const CategoryRow = ({ group: g, index, up, down, host, dimmed, periodPhrase, drillPrompt }) => {
    const env = useEnvironment();

    // A Menu tints its whole label with the accent colour by default, so every
    // Text inside carries an explicit foregroundStyle: accent on the category
    // name (the tap affordance), primary on the amount. No host = not tappable,
    // so the name stays primary.
    const row = (
        HStack({ spacing: 12 }, [
            Circle().fill(colorFor(g.name, index)).frame({ width: 12, height: 12 }),
            VStack({ spacing: 2, alignment: "leading" }, [
                Text(g.name)
                    .font("body")
                    .fontWeight("medium")
                    .foregroundStyle(Color(host ? "accent" : "primary")),
                Text(Math.round(Number(g.pct_of_total || 0)) + "% of spending")
                    .font("footnote")
                    .foregroundStyle(Color("secondary")),
            ]),
            Spacer(),
            VStack({ spacing: 2, alignment: "trailing" }, [
                Text(money(g.amount))
                    .font("body")
                    .fontWeight("semibold")
                    .fontDesign("rounded")
                    .lineLimit(1)
                    .foregroundStyle(Color("primary")),
                DeltaBadge({ pct: g.change_vs_prev_pct, up, down }),
            ]).fixedSize({ horizontal: true }),
        ])
            // Fades back when another segment is isolated on the bar above.
            .opacity(dimmed ? 0.25 : 1)
            .animation({ animation: EaseInOut().speed(1.6), value: dimmed })
    );
    // No host (Composer preview, web) — plain row, no menu.
    if (!host) return row;

    // Ignore if on the web.
    if (env.platform == 'web') return row;
    // The assistant's own angle wins when it gave one — a card that answered
    // "anything odd?" should drill into the odd charges, not reset to a plain
    // list. `{category}` is substituted; a template that forgot the token still
    // names the category rather than asking about nothing.
    const drill = drillPrompt
        ? (drillPrompt.indexOf("{category}") >= 0
            ? drillPrompt.split("{category}").join(g.name)
            : drillPrompt + " (" + g.name + ")")
        : "What did I spend on " + g.name + " " + periodPhrase + "?";

    return Menu({ label: row }, [
        Button("See the transactions", () => host.sendMessage(drill)),
        Button("Trend over 6 months", () =>
            host.sendMessage("Show me my " + g.name + " spending trend over the past 6 months.")),
        Button("Why did it change?", () =>
            host.sendMessage("Why did my " + g.name + " spending change " + periodPhrase + " compared to the period before?")),
    ]).sensoryFeedback({ feedback: "selection", trigger: g.name });
};

// ─── Helpers ─────────────────────────────────────────────

function commas(s) {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Badge percentages are whole numbers. Values that round to zero but aren't
// zero render as "<1" rather than a misleading "0".
function pctLabel(n) {
    const v = Math.abs(Number(n || 0));
    if (v > 0 && v < 0.5) return "<1";
    return String(Math.round(v));
}

function money(n) {
    const v = Math.round(Number(n || 0));
    return (v < 0 ? "-$" : "$") + commas(String(Math.abs(v)));
}

function colorFor(name, i) {
    return Color(COLORS[name] || PALETTE[i % PALETTE.length]);
}

// `highlight` is written by a language model, so it is matched loosely rather
// than by equality: it will say "dining" for "Food & Dining" and "transport"
// for "Transportation". Containment in either direction covers both, with a
// 3-character floor so a stray short token can't light the whole card up. An
// unmatched name simply selects nothing.
function nameMatches(wanted, name) {
    if (!Array.isArray(wanted) || wanted.length === 0) return false;
    const a = String(name || "").toLowerCase();
    for (let i = 0; i < wanted.length; i++) {
        const b = String(wanted[i] || "").toLowerCase().trim();
        if (b.length < 3) continue;
        if (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
    }
    return false;
}

function containsName(list, name) {
    for (let i = 0; i < list.length; i++) if (list[i].name === name) return true;
    return false;
}

// Single-tool path's data fetch. Pure: no hooks, no state — the body's
// hydrate closure owns dedupe and setState.
// In-flight fetches, keyed by the inputs that produced them. Module scope, so
// it survives re-renders and — the part that matters — a body evaluated more
// than once in a single pass. `useState` cannot dedupe that: both evaluations
// read the same pre-update value and both fire. Callers sharing a key share one
// request, and the entry is dropped on settle so a later mount fetches fresh.
const inFlight = {};

function loadOnce(key, run) {
    if (!inFlight[key]) {
        inFlight[key] = run().then(
            (v) => { delete inFlight[key]; return v; },
            (e) => { delete inFlight[key]; throw e; }
        );
    }
    return inFlight[key];
}

async function fetchBreakdown(host, period) {
    try {
        const result = await host.toolCall("get_spending_breakdown", { period });
        return result && Array.isArray(result.groups) ? result : null;
    } catch (e) {
        return null;
    }
}
