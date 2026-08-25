// net_worth_trend — interactive (view) tool. Apple-snippet-style card:
// header + hero total + full trend chart + account composition.
// Renders the output of get_net_worth.
//
// FETCH-ONLY. The agent passes { period } (or a date range) and the card calls
// get_net_worth itself. A 1y result is 53 weekly points — ~2.6KB, ~750 emitted
// tokens — which the agent would otherwise transcribe by hand on every
// net-worth question, and a mis-copied number produces a wrong chart rather
// than an error.
//
// The result fields are read from props when present, so previews can supply
// them directly, but they are NOT declared properties: anything in `properties`
// lands in the tool's input schema, and a schema offering seven data fields
// out-argues any description telling the model not to fill them. Unlike the
// Spending and Transaction cards, there is no two-tool path here.
//
// Two chart styles:
//   • line (default) — the continuous history.
//   • bar — one bar per period, for comparing periods against each other.
//
// Granularity comes from `groupBy`, which the data tool honours by returning
// each period's CLOSING balance (net worth is a stock, not a flow — summing a
// month of weekly balances would report ~4x the real number). That is what
// makes "compare this year to last year" work: groupBy 'year' returns two
// points. It previously returned twenty-four monthly ones labelled
// "J F M A M J J A S O N D J F M A M J J A S O N D", which answered nothing.
//
// The card used to do this rollup itself, re-deriving months by string-parsing
// labels like "Aug 10 '25" and appending zero-width spaces so colliding
// initials didn't merge bars. All of that is gone — the data tool has the
// information natively and returns both an axis `label` and a `full` name.
//
// Native interactions (no-ops gracefully on web / in Composer preview):
//   • drag across the chart to scrub — the hero swaps to the scrubbed month,
//     with a selection haptic per step.
//   • tap an account row to ask the assistant about it via host.sendMessage().

const ACCOUNT_COLOR = {
    Checking: "blue", Savings: "green", Investment: "indigo", Credit: "orange", Loan: "red",
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
        title: "Net Worth Trend",
        description:
            "Net worth: current total, change over the period, a trend chart, and the account balances behind it. It loads its own data. Set chartStyle='bar' to compare month-end balances instead of drawing the continuous line.",
    },
    properties: {
        // The complete input surface: which window, and how to draw it.
        period: {
            type: "string",
            defaultValue: "",
            description: "Window: 7d, 30d, mtd (this month so far), lastMonth (the whole previous calendar month), 3mo, 6mo, ytd, 1y or all. Ignored when startDate/endDate are given. Defaults to 1y.",
        },
        startDate: { type: "string", defaultValue: "" },
        endDate: { type: "string", defaultValue: "" },
        chartStyle: {
            type: "enum",
            options: ["line", "bar"],
            defaultValue: "line",
            description: "'bar' compares periods against each other as closing balances; 'line' is the continuous history.",
        },
        groupBy: {
            type: "enum",
            options: ["auto", "day", "week", "month", "quarter", "year"],
            defaultValue: "auto",
            description: "One bar/point per period, carrying that period's closing balance. Set it to compare periods: 'year' for \"this year vs last year\", 'month' for \"month by month\", 'quarter' for \"by quarter\". Leave auto for a plain trend.",
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
    // FETCH-ONLY. The result fields — points, accounts, current, start,
    // change, change_pct, periodLabel — are deliberately NOT declared as
    // properties. Declaring them puts them in the tool's input schema, and a
    // schema advertising seven data fields is a louder instruction than any
    // description telling the model not to fill them: it would call
    // get_net_worth and transcribe ~53 history points, which is the cost this
    // card exists to avoid. The body still reads them (previews supply them
    // directly), so the rendering path is unchanged — they're just no longer
    // part of the public API.
    body: (props) => {
        // Hooks
        const env = useEnvironment();
        const host = useMCPHost();
        const [selX, setSelX] = useState(null);
        const [fetched, setFetched] = useState(null);
        const [failed, setFailed] = useState(false);
        // The key we've already started fetching. Plain state — the extra
        // render it causes is what makes the guard below stop firing.
        const [claimedKey, setClaimedKey] = useState(null);

        // Computed
        // Single-tool path: props win when they carry a history, else fetch.
        const inline = Array.isArray(props.points) ? props.points : [];
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
        const fetchKey = [props.period, props.startDate, props.endDate, props.groupBy, props.chartStyle].map((v) => String(v == null ? "" : v)).join("\u0001");

        const hydrate = async (key) => {
            setClaimedKey(key);
            const result = await loadOnce(key, () => fetchNetWorth(host, props));
            if (result) { setFetched(result); setFailed(false); }
            else setFailed(true);
        };

        // Driven from the render path, not from a lifecycle modifier. The
        // inputs can settle while any branch is on screen — the spinner, the
        // error card, or a card already showing data fetched under an earlier
        // key — and `.onAppear` only ever covers the branch it is attached to.
        // `claimedKey` makes this idempotent: one fetch per distinct key.
        if (host && !hasInline && claimedKey !== fetchKey) void hydrate(fetchKey);

        // Every exit is terminal: data renders or an error renders. The
        // spinner is the only non-terminal state and it always resolves into
        // one of those.
        if (!data) {
            if (failed || !host) {
                return (
                    Card([
                        Text("Net Worth").font("title2").fontWeight("bold").fontDesign("rounded"),
                        Text(host ? "Couldn't load net worth. Ask again to retry." : "No net worth data provided.")
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
                    Text("Net Worth").font("title2").fontWeight("bold").fontDesign("rounded"),
                    ProgressView({})
                        .frame({ maxWidth: Infinity })
                        .padding("vertical", 24),
                ])
                    .onAppear(() => {
                        void hydrate(fetchKey);
                    })
            );
        }

        const dark = !!(env && env.colorScheme === "dark");
        const up = Number(data.change || 0) >= 0;
        const accent = up ? Color(dark ? "#30D158" : "#34C759") : Color(dark ? "#FF453A" : "#FF3B30");
        // Accessible delta text/tint (vivid green/red fail contrast as text).
        const deltaText = up ? Color(dark ? "#30D158" : "#1A6B2E") : Color(dark ? "#FF6B6B" : "#C40015");

        const bar = props.chartStyle === "bar";
        // The data tool now returns the series at the requested granularity,
        // already carrying each period's closing balance and both an axis label
        // and a full name. The card used to roll this up itself by parsing month
        // names back out of label strings — see fetchNetWorth, which asks for
        // monthly buckets when bars are requested and no groupBy was given.
        const pts = Array.isArray(data.points) ? data.points : [];
        let lo = data.start || 0, hi = data.start || 0;
        for (let i = 0; i < pts.length; i++) {
            const v = pts[i].value;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
        const accts = Array.isArray(data.accounts) ? data.accounts : [];

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

        // Scrub state. The two scales report selection in different currencies:
        // the line's linear x gives a fractional index (round and clamp, since
        // a drag between two points lands between them), the bars' categorical
        // x gives the month label itself.
        const idx = bar || selX == null || !pts.length
            ? null
            : Math.max(0, Math.min(pts.length - 1, Math.round(Number(selX))));
        const scrubLabel = bar && selX != null
            ? findLabel(pts, String(selX))
            : null;
        const scrub = bar
            ? (scrubLabel == null ? null : pts[indexOfLabel(pts, scrubLabel)])
            : (idx == null ? null : pts[idx]);
        const sign = up ? "+" : "−";
        const pct = pctLabel(data.change_pct);
        // Change copy derives from the period actually shown — "Past 3 months" →
        // "over the past 3 months", "All time" → "all time", and a date range
        // "Jun 2025 – Aug 2026" → "from Jun 2025 to Aug 2026". Hardcoding "this
        // year" reads wrong the moment the agent asks for a shorter window.
        const periodLabel = data.periodLabel || props.periodLabel || "Past 12 months";
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
                    Text("Net Worth").font("title2").fontWeight("bold").fontDesign("rounded"),
                    Text(periodLabel).font("subheadline").foregroundStyle(Color("secondary")),
                ]),
                Spacer(),
                changeChip,
            ])
        );

        // While scrubbing the hero reports the touched month instead of the
        // period summary — the number itself animates between values.
        const heroRow = (
            HStack({ alignment: "bottom", spacing: 8 }, [
                Text(money(scrub ? scrub.value : data.current))
                    .font("largeTitle")
                    .fontWeight("bold")
                    .fontDesign("rounded")
                    .contentTransition("numericText"),
                // `full` only exists on rolled-up bar points, where the axis
                // label has been squeezed to an initial — the hero shows the
                // real month. Line points have no `full` and read as before.
                Text(scrub ? (scrub.full || scrub.label) : sign + money(Math.abs(data.change)) + " " + span)
                    .font("footnote")
                    .fontWeight("medium")
                    .foregroundStyle(scrub ? Color("secondary") : deltaText)
                    .padding("bottom", 6),
                Spacer(),
            ])
        );

        // Month-end balance bars. Categorical x, so no chartXScale and no
        // hidden x axis — the month labels ARE the readout.
        //
        // The y domain starts at ZERO, which is the honest choice for a balance
        // and the deliberate cost of this style: on a range like $34k–$43k the
        // shortest bar still stands ~79% as tall as the tallest, so the months
        // read as similar. That is what the data says. A cropped axis would
        // dramatise it, and a chart that exaggerates a 27% year into a 10×
        // one has no place on a finance card. Use the line for shape; use
        // these bars for level.
        const barChart = (
            Chart([
                ForEach(pts, (p) =>
                    BarMark({ x: { value: p.label }, y: { value: Number(p.value || 0) } })
                        .foregroundStyle(accent)
                        .opacity(scrubLabel && scrubLabel !== p.label ? 0.32 : 1)
                ),
                // Scrub indicator: dashed rule down the month plus a dot at the
                // bar top carrying its balance. The 12% headroom below keeps
                // the annotation from clipping on the tallest month.
                ...(scrub ? [
                    RuleMark({ x: { value: scrub.label } })
                        .foregroundStyle(Color("secondary").opacity(0.55))
                        .lineStyle({ width: 1, dash: [4, 3] }),
                    PointMark({ x: { value: scrub.label }, y: { value: scrub.value } })
                        .foregroundStyle(accent)
                        .symbolSize(64)
                        .annotation({ text: money(scrub.value), position: "top" }),
                ] : []),
            ])
                .chartYAxis({ hidden: true, gridHidden: true })
                .chartYScale({ domain: [0, (hi || 1) * 1.12] })
                .chartXSelection({ value: selX, onChange: setSelX })
                .sensoryFeedback({ feedback: "selection", trigger: scrubLabel || "" })
                .frame({ height: 240 })
                .frame({ maxWidth: Infinity })
        );

        // Full trend chart (sparkline expanded). Chart fills the card width.
        const trendChart = (
            Chart([
                ForEach(pts, (p, i) =>
                    AreaMark({ x: i, y: p.value })
                        .foregroundStyle(accent.opacity(0.18))
                        .interpolationMethod("monotone")
                ),
                RuleMark({ y: data.start })
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
                // Drag to scrub; one selection tick per month crossed.
                .chartXSelection({ value: selX, onChange: setSelXCoarse })
                .sensoryFeedback({ feedback: "selection", trigger: idx })
                // ChartD3 (web) hardcodes minHeight:240, so a smaller frame overflows
                // into the rows below. Match 240 to contain it; MET-1236 tracks making
                // the height and the hidden-axes plot margins honest on web. Native
                // renders edge-to-edge, so no centering hacks here.
                .frame({ height: 240 })
        );

        // The assistant's own sentence, sitting with the data it describes
        // rather than floating above the card in chat.
        const note = String(props.note || "").trim();
        const noteRow = note ? [InsightNote({ text: note, dark })] : [];

        return (
            Card([
                header,
                heroRow,
                bar ? barChart : trendChart,
                ...noteRow,
                Divider(),
                // Account composition — direct children, full-width rows.
                ...accts.map((account) => AccountRow({ account, host })),
            ])
        );
    },
    previews: () => {
        const points = [
            { label: "Jun", value: 34200 }, { label: "Jul", value: 35100 }, { label: "Aug", value: 35800 },
            { label: "Sep", value: 35200 }, { label: "Oct", value: 36400 }, { label: "Nov", value: 37500 },
            { label: "Dec", value: 36900 }, { label: "Jan", value: 38800 }, { label: "Feb", value: 40100 },
            { label: "Mar", value: 41200 }, { label: "Apr", value: 42300 }, { label: "May", value: 43470 },
        ];
        const accounts = [
            { name: "Everyday Checking", type: "Checking", balance: 3800 },
            { name: "High-Yield Savings", type: "Savings", balance: 12400 },
            { name: "Brokerage", type: "Investment", balance: 28500 },
            { name: "Rewards Card", type: "Credit", balance: -1230 },
        ];
        // Weekly points, the granularity get_net_worth actually returns for a
        // year — so the bar preview exercises the rollup rather than being fed
        // pre-monthly data it would pass straight through.
        const weekly = [];
        for (let m = 0; m < points.length; m++) {
            for (let w = 0; w < 4; w++) {
                weekly.push({
                    label: points[m].label + " " + (w * 7 + 3) + " '26",
                    // Drift within the month so the close is genuinely the last
                    // reading, not the average.
                    value: points[m].value - 400 + w * 150,
                });
            }
        }
        return [
            Self({ periodLabel: "Past 12 months", current: 43470, start: 34200, change: 9270, change_pct: 27.1, points, accounts })
                .previewName("Up year"),
            Self({
                periodLabel: "Past 12 months", current: 43470, start: 34200, change: 9270, change_pct: 27.1,
                chartStyle: "bar", points: weekly, accounts,
            }).previewName("Bar · 48 weekly points rolled to 12 months"),
            Self({
                periodLabel: "Past 6 months", current: 43470, start: 37500, change: 5970, change_pct: 15.9,
                chartStyle: "bar", points: points.slice(6), accounts,
            }).previewName("Bar · already monthly"),
        ];
    },
});

// ─── Lockups ─────────────────────────────────────────────

const Card = (children) => (
    VStack({ spacing: 18, alignment: "leading" }, children)
        .padding(22)
        .background(Color("secondarySystemGroupedBackground"))
        .cornerRadius(24)
        .shadow({ radius: 18, y: 8, color: Color("black").opacity(0.1) })
        // Edited server-side in the Metabind editor — the 440 cap left the card
        // narrow against the others, which are all uncapped.
        .frame({ maxWidth: Infinity })
);

// name left, balance right — same direct-child + Spacer row idiom as spending.
// Tapping opens a menu of follow-up questions; each one hands the phrasing to
// the assistant via sendMessage, so the answer arrives as another card.
const AccountRow = ({ account, host }) => {
    // A Menu tints its whole label with the accent colour by default, which
    // would turn the amounts blue. So every Text inside carries an explicit
    // foregroundStyle: accent on the name (the tap affordance), primary on the
    // amount. Without a host the row isn't tappable, so the name stays primary.
    const env = useEnvironment();
    
    const row = (
        HStack({ spacing: 12 }, [
            Circle().fill(Color(ACCOUNT_COLOR[account.type] || "gray")).frame({ width: 12, height: 12 }),
            VStack({ spacing: 2, alignment: "leading" }, [
                Text(account.name)
                    .font("body")
                    .fontWeight("medium")
                    .foregroundStyle(Color(host ? "accent" : "primary")),
                Text(account.type).font("footnote").foregroundStyle(Color("secondary")),
            ]),
            Spacer(),
            Text((account.balance < 0 ? "−" : "") + money(Math.abs(account.balance)))
                .font("body")
                .fontWeight("semibold")
                .fontDesign("rounded")
                .lineLimit(1)
                .foregroundStyle(account.balance < 0 ? Color("secondary") : Color("primary"))
                .fixedSize({ horizontal: true }),
            // Affordance hinting the row is tappable. Plain text, not an SF
            // Symbol — those don't render on web (see SpendingBreakdown).
            ...(host ? [
                Text("⋯").font("footnote").foregroundStyle(Color("tertiary")),
            ] : []),
        ])
    );
    // No host (Composer preview, web) — render the plain row, no menu.
    if (!host) return row;
    if (env.platform == 'web') return row;
    return Menu({ label: row }, [
        Button("Recent transactions", () =>
            host.sendMessage("Show me the recent transactions on my " + account.name + ".")),
        Button("How has it changed?", () =>
            host.sendMessage("How has my " + account.name + " balance changed over the past 6 months?")),
        Button("Compare to my other accounts", () =>
            host.sendMessage("How does my " + account.name + " compare to my other accounts?")),
    ]).sensoryFeedback({ feedback: "selection", trigger: account.name });
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

function findLabel(points, value) {
    for (let i = 0; i < points.length; i++) if (points[i].label === value) return value;
    return null;
}

function indexOfLabel(points, label) {
    for (let i = 0; i < points.length; i++) if (points[i].label === label) return i;
    return 0;
}

// Single-tool path's data fetch. Pure: no hooks, no state — the body's hydrate
// closure owns dedupe and setState.
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

async function fetchNetWorth(host, props) {
    const args = {};
    if (props.startDate) args.startDate = props.startDate;
    if (props.endDate) args.endDate = props.endDate;
    // Dates override the period upstream, so only send it when they're absent.
    if (props.period && !props.startDate && !props.endDate) args.period = props.period;
    if (!args.period && !args.startDate) args.period = "1y";
    if (props.groupBy && props.groupBy !== "auto") {
        args.groupBy = props.groupBy;
    } else if (props.chartStyle === "bar") {
        // Bars compare periods, and the auto granularity for a year is 53 weekly
        // points — 53 unreadable bars. Months are the sane default when someone
        // asked for bars without saying at what grain.
        args.groupBy = "month";
    }
    try {
        const result = await host.toolCall("get_net_worth", args);
        return result && Array.isArray(result.points) ? result : null;
    } catch (e) {
        return null;
    }
}
