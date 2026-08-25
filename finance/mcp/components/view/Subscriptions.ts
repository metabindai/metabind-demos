// subscriptions — interactive (view) tool. Apple-snippet-style card:
// header + monthly total + per-subscription rows with cadence, next charge,
// and "New" / price-hike flags.
//
// FETCH-ONLY, same contract as NetWorthTrend. The agent passes { status } and
// the card calls get_subscriptions itself. Transcribing the result instead cost
// ~370 emitted tokens per question (nine subscriptions x nine fields) plus a
// second sequential round trip, to draw a card whose only real input is which
// subscriptions to include.
//
// The result fields — count, new_count, total_monthly, subscriptions — are read
// from props when present so previews can supply them directly, but they are
// NOT declared properties: anything in `properties` lands in the tool's input
// schema, and a schema offering the whole result out-argues any description
// telling the model not to fill it.

const CATEGORY_COLOR = {
    Entertainment: "purple", Health: "red", News: "orange",
    Productivity: "blue", Shopping: "pink", Utilities: "teal",
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
        title: "Subscriptions",
        description:
            "Recurring charges: total monthly cost and a row per subscription with its cadence, next charge date, and New / price-increase flags. It loads its own data.",
    },
    properties: {
        // The complete input surface: which subscriptions to include.
        status: {
            type: "enum",
            options: ["active", "all"],
            defaultValue: "active",
            description: "'active' lists current subscriptions; 'all' also includes recently cancelled ones.",
        },
        views: {
            type: "array",
            valueType: {
                type: "enum",
                options: ["all", "unusual", "new", "repriced"],
                description: "Which cuts to offer as segments. Omit and the card offers All alongside whichever cut you opened on. Pair the specific cut with 'all' so the user can get back to the full picture — ['all','repriced'] for a price question, ['all','new'] for a what's-new one.",
            },
            defaultValue: [],
        },
        view: {
            type: "enum",
            options: ["all", "unusual", "new", "repriced"],
            defaultValue: "all",
            description: "Which cut to open on. 'all' is every recurring charge, biggest first — the answer to 'what am I paying for'. 'repriced' is only the ones whose price moved, which is what 'which went up' asks. 'new' is only the recently started. 'unusual' is both of those together, for a general 'anything odd'. Match the cut to the question: a price question answered with the full list makes the user hunt for the answer. The header keeps reporting the full count, so narrowing hides nothing.",
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
        const host = useMCPHost();
        const [fetched, setFetched] = useState(null);
        const [failed, setFailed] = useState(false);
        // The key we've already started fetching. Plain state — the extra
        // render it causes is what makes the guard below stop firing.
        const [claimedKey, setClaimedKey] = useState(null);

        // Computed
        // Props win when they carry subscriptions (previews), else fetch.
        const inline = Array.isArray(props.subscriptions) ? props.subscriptions : [];
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
        const fetchKey = [props.status].map((v) => String(v == null ? "" : v)).join("\u0001");

        const hydrate = async (key) => {
            setClaimedKey(key);
            const result = await loadOnce(key, () => fetchSubscriptions(host, props.status));
            if (result) { setFetched(result); setFailed(false); }
            else setFailed(true);
        };

        // Driven from the render path, not from a lifecycle modifier. The
        // inputs can settle while any branch is on screen — the spinner, the
        // error card, or a card already showing data fetched under an earlier
        // key — and `.onAppear` only ever covers the branch it is attached to.
        // `claimedKey` makes this idempotent: one fetch per distinct key.
        if (host && !hasInline && claimedKey !== fetchKey) void hydrate(fetchKey);

        // Every exit is terminal: data renders or an error renders. The spinner
        // is the only non-terminal state and it always resolves into one of
        // those.
        if (!data) {
            if (failed || !host) {
                return (
                    Card([
                        Text("Subscriptions").font("title2").fontWeight("bold").fontDesign("rounded"),
                        Text(host ? "Couldn't load subscriptions. Ask again to retry." : "No subscription data provided.")
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
                    Text("Subscriptions").font("title2").fontWeight("bold").fontDesign("rounded"),
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
        const subs = Array.isArray(data.subscriptions) ? data.subscriptions : [];
        const count = data.count || subs.length;
        const newCount = data.new_count || 0;

        // "Unusual" for a recurring charge is one that just started or just
        // moved price — a pattern change, which is the thing a transaction list
        // structurally cannot show. Filtering happens here rather than in the
        // tool: the payload already carries `is_new` and `price_change_pct`, so
        // switching cuts costs no network call at all.
        const [viewOverride, setViewOverride] = useState(null);
        const view = viewOverride || props.view || "all";
        const isNew = (s) => !!s.is_new;
        const isRepriced = (s) => Number(s.price_change_pct || 0) !== 0;
        const MATCHES = {
            all: () => true,
            unusual: (s) => isNew(s) || isRepriced(s),
            new: isNew,
            repriced: isRepriced,
        };
        const countIn = (cut) => subs.filter(MATCHES[cut] || MATCHES.all).length;
        const shownSubs = subs.filter(MATCHES[view] || MATCHES.all);

        // Offer All beside whatever cut is open, unless told otherwise. A cut
        // with nothing in it is dropped rather than shown as an empty segment —
        // except the one currently selected, which must stay reachable.
        const offered = (() => {
            const asked = Array.isArray(props.views)
                ? props.views.filter((v) => MATCHES[v])
                : [];
            const base = asked.length ? asked.slice() : ["all", view === "all" ? "unusual" : view];
            const list = base.filter((v, i) => base.indexOf(v) === i)
                .filter((v) => v === view || v === "all" || countIn(v) > 0);
            if (list.indexOf(view) < 0) list.unshift(view);
            return list;
        })();
        const noun = count === 1 ? " recurring charge" : " recurring charges";
        const CUT_SUBTITLE = {
            unusual: " recently started or changed price",
            new: " recently started",
            repriced: " changed price",
        };
        const subtitle = view === "all"
            ? count + noun + (newCount > 0 ? " · " + newCount + " new" : "")
            : shownSubs.length + " of " + count + noun + CUT_SUBTITLE[view];

        // Tree
        const header = (
            HStack({ alignment: "top" }, [
                VStack({ spacing: 2, alignment: "leading" }, [
                    Text("Subscriptions").font("title2").fontWeight("bold").fontDesign("rounded"),
                    Text(subtitle).font("subheadline").foregroundStyle(Color("secondary")),
                ]),
                Spacer(),
            ])
        );

        const heroRow = (
            HStack({ alignment: "bottom", spacing: 8 }, [
                Text(money2(data.total_monthly))
                    .font("largeTitle")
                    .fontWeight("bold")
                    .fontDesign("rounded")
                    .contentTransition("numericText"),
                Text("per month")
                    .font("footnote")
                    .fontWeight("medium")
                    .foregroundStyle(Color("secondary"))
                    .padding("bottom", 6),
                Spacer(),
            ])
        );

        // Offered only when there is something to narrow to. A two-segment
        // control where one segment is always empty is worse than no control.
        const CUT_LABELS = { all: "All", unusual: "New & changed", new: "New", repriced: "Price rises" };
        const viewPicker = offered.length > 1
            ? Picker("View", [view, (v) => setViewOverride(v)],
                    offered.map((v) => Text(CUT_LABELS[v] || v).tag(v)))
                    .pickerStyle("segmented")
                    .padding("vertical", 2)
            : Empty();

        // Nothing having changed is a real answer, and an empty list under a
        // header reads as a broken card rather than as reassurance.
        const CUT_EMPTY = {
            unusual: "Nothing new, and no prices moved.",
            new: "Nothing new this period.",
            repriced: "No prices have moved.",
        };
        const emptyOdd = view !== "all" && shownSubs.length === 0
            ? Text(CUT_EMPTY[view] || "Nothing to show.")
                    .font("subheadline")
                    .foregroundStyle(Color("secondary"))
                    .padding("vertical", 12)
            : Empty();

        const note = String(props.note || "").trim();

        return (
            Card([
                header,
                heroRow,
                ...(note ? [InsightNote({ text: note, dark })] : []),
                viewPicker,
                Divider(),
                // One row per subscription — direct children, full-width.
                ...shownSubs.map((subscription) => SubscriptionRow({ subscription, dark, host })),
                emptyOdd,
            ])
        );
    },
    previews: () => {
        // A verbatim get_subscriptions payload, so the preview shows exactly
        // what detection returns rather than a hand-written approximation of it.
        // The old preview led with Planet Fitness, which no longer exists in the
        // feed — and never did, which was the bug.
        const subscriptions = [
            { name: "ClassPass", amount: 52.0, cadence: "monthly", monthly_equiv: 52.0, next_charge: "Sep 2", category: "Health", status: "active", is_new: false, price_change_pct: 0 },
            { name: "The New York Times", amount: 25.0, cadence: "monthly", monthly_equiv: 25.0, next_charge: "Aug 23", category: "News", status: "active", is_new: false, price_change_pct: 0 },
            { name: "Netflix", amount: 22.99, cadence: "monthly", monthly_equiv: 22.99, next_charge: "Sep 10", category: "Entertainment", status: "active", is_new: false, price_change_pct: 15 },
            { name: "ChatGPT Plus", amount: 20.0, cadence: "monthly", monthly_equiv: 20.0, next_charge: "Sep 15", category: "Productivity", status: "active", is_new: true, price_change_pct: 0 },
            { name: "Hulu", amount: 17.99, cadence: "monthly", monthly_equiv: 17.99, next_charge: "", category: "Entertainment", status: "cancelled", is_new: false, price_change_pct: 0 },
            { name: "Disney+", amount: 13.99, cadence: "monthly", monthly_equiv: 13.99, next_charge: "Aug 28", category: "Entertainment", status: "active", is_new: true, price_change_pct: 0 },
            { name: "Spotify", amount: 11.99, cadence: "monthly", monthly_equiv: 11.99, next_charge: "Sep 14", category: "Entertainment", status: "active", is_new: false, price_change_pct: 0 },
            { name: "Amazon Prime", amount: 139.0, cadence: "yearly", monthly_equiv: 11.58, next_charge: "Aug 7", category: "Shopping", status: "active", is_new: false, price_change_pct: 0 },
            { name: "iCloud+", amount: 2.99, cadence: "monthly", monthly_equiv: 2.99, next_charge: "Sep 8", category: "Utilities", status: "active", is_new: false, price_change_pct: 0 },
        ];
        const active = subscriptions.filter((s) => s.status === "active");
        return [
            Self({ count: active.length, new_count: 2, total_monthly: 160.54, subscriptions: active })
                .previewName("Active"),
            Self({ count: subscriptions.length, new_count: 2, total_monthly: 160.54, subscriptions })
                .previewName("All (one cancelled)"),
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
        //.frame({ maxWidth: 440 })
);

// Monogram chip — first letter on a tinted circle (no logos/SF Symbols needed).
const Monogram = ({ name, color }) => (
    ZStack([
        Circle().fill(color.opacity(0.18)).frame({ width: 34, height: 34 }),
        Text((name || "?").trim().charAt(0).toUpperCase())
            .font("subheadline")
            .fontWeight("bold")
            .foregroundStyle(color),
    ]).frame({ width: 34, height: 34 })
);

const SubscriptionRow = ({ subscription: s, dark, host }) => {
    const color = Color(CATEGORY_COLOR[s.category] || "gray");
    const cadence = s.cadence === "yearly" ? "Yearly" : "Monthly";
    const cancelled = s.status === "cancelled";
    const caption = cancelled ? "Cancelled" : cadence + " · Next " + (s.next_charge || "—");
    const rose = Number(s.price_change_pct || 0) > 0;
    const riseText = dark ? Color("#FF6B6B") : Color("#C40015");
    const env = useEnvironment();

    // A Menu tints its whole label with the accent colour by default, so every
    // Text inside carries an explicit foregroundStyle: accent on the name (the
    // tap affordance), primary on the amount. No host = not tappable, so the
    // name stays primary. The New / price-hike chips already set their own.
    const amountText = (
        Text(money2(s.amount))
            .font("body")
            .fontWeight("semibold")
            .fontDesign("rounded")
            .lineLimit(1)
            .foregroundStyle(Color("primary"))
    );

    const newChip = (
        Text("New")
            .font("caption2")
            .fontWeight("semibold")
            .foregroundStyle(Color(dark ? "#30D158" : "#1A6B2E"))
            .padding("horizontal", 7)
            .padding("vertical", 2)
            .background(Color("green").opacity(dark ? 0.22 : 0.14))
            .cornerRadius(7)
    );

    const riseChip = (
        Text("+" + Math.abs(Number(s.price_change_pct)) + "%")
            .font("caption2")
            .fontWeight("semibold")
            .lineLimit(1)
            .foregroundStyle(riseText)
            .padding("horizontal", 7)
            .padding("vertical", 2)
            .background(Color("red").opacity(dark ? 0.22 : 0.15))
            .cornerRadius(7)
    );

    // Trailing: amount + an optional flag chip (New, or price hike).
    const trailing = [amountText];
    if (s.is_new) {
        trailing.push(newChip);
    } else if (rose) {
        trailing.push(riseChip);
    }

    const row = (
        HStack({ spacing: 12 }, [
            Monogram({ name: s.name, color }),
            VStack({ spacing: 2, alignment: "leading" }, [
                Text(s.name)
                    .font("body")
                    .fontWeight("medium")
                    .lineLimit(1)
                    .foregroundStyle(Color(host ? "accent" : "primary")),
                Text(caption).font("footnote").foregroundStyle(Color("secondary")).lineLimit(1),
            ]),
            Spacer(),
            VStack({ spacing: 2, alignment: "trailing" }, trailing).fixedSize({ horizontal: true }),
        ])
    );

    // No host (Composer preview, web) — plain row, no menu.
    if (!host) return row;
    if (env.platform == 'web') return row;
    
    return Menu({ label: row }, [
        Button("Charge history", () =>
            host.sendMessage("Show me every " + s.name + " charge over the past 6 months.")),
        Button("What does this cost me a year?", () =>
            host.sendMessage("What is my " + s.name + " subscription costing me per year?")),
        ...(rose ? [
            Button("When did the price go up?", () =>
                host.sendMessage("When did my " + s.name + " price increase, and by how much?")),
        ] : []),
    ]).sensoryFeedback({ feedback: "selection", trigger: s.name });
};

// ─── Helpers ─────────────────────────────────────────────

function commas(s) {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function money2(n) {
    const v = Number(n || 0);
    const f = Math.abs(v).toFixed(2);
    const parts = f.split(".");
    return (v < 0 ? "-$" : "$") + commas(parts[0]) + "." + parts[1];
}

// Data fetch for the single-tool path. Pure: no hooks, no state — the body's
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

async function fetchSubscriptions(host, status) {
    try {
        const result = await host.toolCall("get_subscriptions", {
            status: status === "all" ? "all" : "active",
        });
        return result && Array.isArray(result.subscriptions) ? result : null;
    } catch (e) {
        return null;
    }
}
