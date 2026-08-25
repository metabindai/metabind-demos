// transaction_list — interactive (view) tool. Apple-snippet-style card for
// "what did I spend at <category>?": header + category total + the matching
// transactions.
//
// FETCH-ONLY. The agent passes a filter ({ category } or { merchant }, plus a
// window) and the card calls get_transactions itself.
//
// The result fields — transactions, total_spent, count, shown,
// change_vs_prev_pct, periodLabel — are read from props when present so
// previews can supply them directly, but they are NOT declared properties.
// Anything in `properties` lands in the tool's input schema, and a schema
// offering the whole result out-argues any description telling the model not to
// fill it: a merchant-scoped result is ~8KB, three quarters of it `items`
// receipts, and the agent would have to EMIT all of that as tool-call arguments
// to draw a card whose receipt sheet most sessions never open.

// Per-merchant dot color from the iOS system palette (varied, so the list isn't
// monochrome even though every row is the same category).
const PALETTE = ["blue", "orange", "green", "pink", "purple", "teal", "indigo", "red"];

// Rows shown inline on mobile before the list collapses behind "See All".
const PREVIEW_LIMIT = 8;

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
        title: "Transaction List",
        description:
            "Individual purchases for a category or a merchant: the window total plus the matching transactions. It loads its own data. Plain terms like 'restaurants', 'groceries' or 'gas' resolve to categories; omit both filters for all spending.",
    },
    properties: {
        // The complete input surface: what to filter by, and over what window.
        category: {
            type: "string",
            defaultValue: "",
            description: "Category or plain term, e.g. 'Food & Dining', 'restaurants', 'rent', 'gas'. Omit for all categories.",
        },
        merchant: {
            type: "string",
            defaultValue: "",
            description: "Single store or brand, e.g. 'Whole Foods', 'Netflix'.",
        },
        period: {
            type: "string",
            defaultValue: "",
            description: "Window: 7d, 30d, mtd (this month so far), lastMonth (the whole previous calendar month), 3mo, 6mo, ytd, 1y or all. Ignored when startDate/endDate are given. Defaults to mtd.",
        },
        startDate: { type: "string", defaultValue: "", description: "Window start, YYYY-MM-DD." },
        endDate: { type: "string", defaultValue: "", description: "Window end, YYYY-MM-DD." },
        views: {
            type: "array",
            valueType: {
                type: "enum",
                options: ["recent", "largest", "unusual"],
                description: "Which cuts to offer as segments on the card. Omit for all three, which is usually right — the user can then explore without asking again. Narrow it only when a cut would be meaningless for what was asked: a single-merchant list has little to call unusual, and a one-week window has little to rank. Listing a single cut drops the control entirely and renders a plain list, so use that when the question has exactly one sensible answer.",
            },
            defaultValue: [],
        },
        view: {
            type: "enum",
            options: ["recent", "largest", "unusual"],
            defaultValue: "recent",
            description: "Which cut of the window to open on. 'recent' is newest-first, the plain list. 'largest' leads with the biggest charges. 'unusual' shows only the charges well above what that merchant or category normally costs — this is the answer to \"anything odd this month\", not a spending breakdown. The user can switch between the offered cuts on the card without asking again, so pick the one that answers the question and leave the rest to them. Use `views` to change which cuts are offered.",
        },
        limit: {
            type: "integer",
            defaultValue: 0,
            description: "Max transactions to load. Raise past the default 20 only if the user wants the full list.",
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
        // One sheet, two modes: "all" for the full list, or a transaction index
        // for that purchase's itemised breakdown. Kept here rather than per row
        // so there's a single piece of state and no hooks inside a .map().
        const [sheetMode, setSheetMode] = useState(null);
        const [fetched, setFetched] = useState(null);
        const [failed, setFailed] = useState(false);
        // The key we've already started fetching. Plain state — the extra
        // render it causes is what makes the guard below stop firing.
        const [claimedKey, setClaimedKey] = useState(null);
        // The model picks the opening cut; a tap overrides it. Kept as an
        // override rather than seeded state so a `view` arriving late in the
        // stream still lands, right up until the user expresses a preference.
        const [viewOverride, setViewOverride] = useState(null);
        const view = viewOverride || props.view || "recent";

        // The model may narrow the segments; it may not hide the one on screen,
        // which would leave the card showing a cut with no way back to it.
        const offered = (() => {
            const all = ["recent", "largest", "unusual"];
            const asked = Array.isArray(props.views)
                ? props.views.filter((v) => all.indexOf(v) >= 0)
                : [];
            const list = asked.length ? asked.slice() : all.slice();
            if (list.indexOf(view) < 0) list.unshift(view);
            return list;
        })();

        // Computed
        // Props win when they carry transactions (previews), else fetch.
        const inline = Array.isArray(props.transactions) ? props.transactions : [];
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
        const fetchKey = [props.category, props.merchant, props.period, props.startDate, props.endDate, props.limit, view].map((v) => String(v == null ? "" : v)).join("\u0001");

        const hydrate = async (key) => {
            setClaimedKey(key);
            const result = await loadOnce(key, () => fetchTransactions(host, props, view));
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
                        Text(props.category || "Spending").font("title2").fontWeight("bold").fontDesign("rounded"),
                        Text(host ? "Couldn't load transactions. Ask again to retry." : "No transactions provided.")
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
                    Text(props.category || "Spending").font("title2").fontWeight("bold").fontDesign("rounded"),
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
        // 'unusual' draws from `standouts` — charges well above what that
        // merchant (or, for a one-off, its category) normally costs, ranked by
        // how many dollars over. A category breakdown cannot express this: an
        // anomaly is one charge out of line with its own history, not a
        // category that moved.
        const standouts = Array.isArray(data.standouts) ? data.standouts : [];
        const txns = view === "unusual"
            ? standouts
            : (Array.isArray(data.transactions) ? data.transactions : []);
        // On mobile a long list collapses to a preview with a "See All" action
        // that opens a native sheet. Web has no sheet idiom here and scrolls
        // fine inside the page, so it keeps rendering the full list inline.
        const isWeb = !!(env && env.platform === "web");
        const collapsed = !isWeb && txns.length > PREVIEW_LIMIT;
        const visible = collapsed ? txns.slice(0, PREVIEW_LIMIT) : txns;
        const count = data.count || txns.length;
        const shown = data.shown || txns.length;
        const pct = Number(data.change_vs_prev_pct || 0);
        const up = pct > 0;
        // Spending up = red (watch it), down = green (saving); accessible shades.
        const deltaText = up ? Color(dark ? "#FF6B6B" : "#C40015") : Color(dark ? "#30D158" : "#1A6B2E");

        // Comparison copy tracks the window actually shown — a 6-month or
        // custom-range result is not "vs last month".
        const periodLabel = data.periodLabel || "This month";
        const vsCopy =
            /^This month$/i.test(periodLabel) ? " vs last month"
            : /^Last 7 days$/i.test(periodLabel) ? " vs prior week"
            : /^Last 30 days$/i.test(periodLabel) ? " vs prior 30 days"
            : /^Past (\d+) months$/i.test(periodLabel)
                ? " vs prior " + periodLabel.replace(/^Past /i, "")
                : " vs prior period";

        // Rows show their category when the result spans more than one
        // (an all-categories query), since the header no longer names it.
        const multiCategory = (() => {
            for (let i = 1; i < txns.length; i++) if (txns[i].category !== txns[0].category) return true;
            return false;
        })();

        // A merchant-scoped list already names the merchant in the header, so
        // repeating it down every row wastes the title line. Those rows lead
        // with what actually differs between visits instead.
        const singleMerchant = (() => {
            if (txns.length < 2) return false;
            for (let i = 1; i < txns.length; i++) if (txns[i].merchant !== txns[0].merchant) return false;
            return true;
        })();

        // Tree
        // Optional change chip (only when there's a prior-period delta).
        const changeChip = pct !== 0
            ? Text((up ? "+" : "−") + pctLabel(pct) + "%" + vsCopy)
                    .font("footnote")
                    .fontWeight("semibold")
                    .foregroundStyle(deltaText)
                    .padding("horizontal", 10)
                    .padding("vertical", 5)
                    .background(deltaText.opacity(dark ? 0.22 : 0.12))
                    .cornerRadius(9)
            : Empty();

        const header = (
            HStack({ alignment: "top" }, [
                VStack({ spacing: 2, alignment: "leading" }, [
                    Text(data.category || props.category || "Spending").font("title2").fontWeight("bold").fontDesign("rounded"),
                    Text(periodLabel).font("subheadline").foregroundStyle(Color("secondary")),
                ]),
                Spacer(),
                changeChip,
            ])
        );

        const heroRow = (
            HStack({ alignment: "bottom", spacing: 8 }, [
                Text(money0(data.total_spent)).font("largeTitle").fontWeight("bold").fontDesign("rounded"),
                Text("across " + count + (count === 1 ? " purchase" : " purchases"))
                    .font("footnote")
                    .fontWeight("medium")
                    .foregroundStyle(Color("secondary"))
                    .padding("bottom", 6),
                Spacer(),
            ])
        );

        // Footer note when the tool itself returned fewer rows than exist.
        const truncationNote = count > shown && shown > 0
            ? Text("Showing " + shown + " of " + count)
                    .font("footnote")
                    .foregroundStyle(Color("tertiary"))
            : Empty();

        // Mobile only — opens the full list in a native sheet.
        const seeAll = collapsed
            ? Button(
                Text("See All (" + txns.length + ")")
                    .font("subheadline")
                    .fontWeight("semibold")
                    .foregroundStyle(Color("accent")),
                () => setSheetMode("all")
            ).sensoryFeedback({ feedback: "selection", trigger: sheetMode })
            : Empty();

        // Every sheet gets a nav bar with an explicit Done button. A swipe-down
        // dismiss doesn't reliably drive the isPresented binding back through
        // the bridge, which would leave sheetMode set and the sheet unable to
        // reopen. Done (plus onDismiss below) guarantees the state resets.
        const closeSheet = () => setSheetMode(null);
        const sheetShell = (title, children) => (
            NavigationStack(
                VStack({ spacing: 16, alignment: "leading" }, children)
                    .padding(22)
                    .frame({ maxWidth: Infinity, alignment: "leading" })
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode("inline")
                    .toolbar(
                        ToolbarItem({ placement: "confirmationAction" }, [
                            Button("Done", closeSheet),
                        ])
                    )
            ).presentationDetents([Detent.medium, Detent.large])
        );

        // Full-list sheet.
        const allContent = () => sheetShell(data.category || props.category || "Spending", [
            Text(periodLabel + " · " + money0(data.total_spent) + " across " + count)
                .font("subheadline")
                .foregroundStyle(Color("secondary")),
            ScrollView(
                VStack({ spacing: 14, alignment: "leading" },
                    txns.map((transaction, i) =>
                        TransactionRow({
                            transaction, showCategory: multiCategory, singleMerchant, host,
                            onOpen: () => setSheetMode(i),
                        }))
                )
            ),
        ]);

        // Single-purchase breakdown sheet — the receipt for one transaction.
        const detailContent = () => {
            const t = txns[sheetMode] || {};
            const items = Array.isArray(t.items) ? t.items : [];
            return sheetShell(t.merchant || "Purchase", [
                    Text((t.date || "") + (t.account ? " · " + t.account : ""))
                        .font("subheadline")
                        .foregroundStyle(Color("secondary")),
                    HStack({ alignment: "bottom", spacing: 8 }, [
                        Text(money2(t.amount))
                            .font("largeTitle")
                            .fontWeight("bold")
                            .fontDesign("rounded"),
                        Text(items.length + (items.length === 1 ? " item" : " items"))
                            .font("footnote")
                            .fontWeight("medium")
                            .foregroundStyle(Color("secondary"))
                            .padding("bottom", 6),
                        Spacer(),
                    ]),
                    Divider(),
                    ScrollView(
                        VStack({ spacing: 10, alignment: "leading" },
                            items.map((it) =>
                                HStack({ spacing: 10 }, [
                                    Text(it.qty > 1 ? String(it.qty) + "×" : "")
                                        .font("subheadline")
                                        .foregroundStyle(Color("tertiary"))
                                        .frame({ width: 24 }),
                                    Text(it.name)
                                        .font("subheadline")
                                        .foregroundStyle(Color("primary")),
                                    Spacer(),
                                    Text(money2(it.total))
                                        .font("subheadline")
                                        .fontDesign("rounded")
                                        .foregroundStyle(Color("primary"))
                                        .fixedSize({ horizontal: true }),
                                ])
                            )
                        )
                    ),
                    ...(host ? [
                        Divider(),
                        Button("See all " + (t.merchant || "") + " purchases", () => {
                            setSheetMode(null);
                            host.sendMessage("Show me everything I've spent at " + t.merchant + " over the past 6 months.");
                        }),
                    ] : []),
            ]);
        };

        // Switching cut costs a host call (~400ms) and no model turn at all,
        // where asking for the same thing in words costs a full inference pass.
        // That difference is the whole reason this is a control and not a pill.
        const VIEW_LABELS = { recent: "Recent", largest: "Largest", unusual: "Unusual" };
        const viewPicker = offered.length > 1
            ? Picker("View", [view, (v) => setViewOverride(v)], offered.map((v) =>
                    Text(VIEW_LABELS[v] || v).tag(v)))
                    .pickerStyle("segmented")
                    .padding("vertical", 2)
            // A segmented control with one segment is chrome that does nothing.
            : Empty();

        // Nothing stood out is a real answer, and an empty list under a header
        // reads as a broken card rather than as good news.
        const emptyUnusual = view === "unusual" && txns.length === 0
            ? Text("Nothing out of the ordinary this period.")
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
                // Transaction rows — direct children, full-width.
                ...visible.map((transaction, i) =>
                    TransactionRow({
                        transaction, showCategory: multiCategory, singleMerchant, host,
                        onOpen: () => setSheetMode(i),
                    })),
                emptyUnusual,
                // `standouts` is already the whole answer — there is no longer
                // list behind it to see, and no truncation to confess to.
                ...(view === "unusual" ? [] : [seeAll, truncationNote]),
            ]).sheet({
                isPresented: sheetMode !== null,
                setIsPresented: (v) => { if (!v) setSheetMode(null); },
                content: sheetMode === "all" ? allContent : detailContent,
                // Belt and braces with the Done button: if the bridge does
                // deliver a swipe-dismiss, this clears the state too.
                onDismiss: () => setSheetMode(null),
            })
        );
    },
    previews: () => {
        const transactions = [
            { date: "May 27", merchant: "Sushi Hana", amount: 78.40, category: "Food & Dining", account: "Rewards Card" },
            { date: "May 24", merchant: "DoorDash", amount: 41.20, category: "Food & Dining", account: "Rewards Card" },
            { date: "May 22", merchant: "Chipotle", amount: 14.85, category: "Food & Dining", account: "Everyday Checking" },
            { date: "May 20", merchant: "Sweetgreen", amount: 16.50, category: "Food & Dining", account: "Rewards Card" },
            { date: "May 18", merchant: "Frontier Restaurant", amount: 52.00, category: "Food & Dining", account: "Rewards Card" },
            { date: "May 15", merchant: "Starbucks", amount: 6.75, category: "Food & Dining", account: "Everyday Checking" },
            { date: "May 13", merchant: "Shake Shack", amount: 23.90, category: "Food & Dining", account: "Rewards Card" },
            { date: "May 11", merchant: "Olive Garden", amount: 64.30, category: "Food & Dining", account: "Rewards Card" },
        ];
        const mixed = [
            { date: "Aug 3", merchant: "Sushi Hana", amount: 89.47, category: "Food & Dining", account: "Rewards Card" },
            { date: "Aug 2", merchant: "Spotify", amount: 11.99, category: "Subscriptions", account: "Rewards Card" },
            { date: "Aug 1", merchant: "Shell", amount: 47.20, category: "Transportation", account: "Rewards Card" },
            { date: "Jul 28", merchant: "PNM Electric", amount: 123.19, category: "Utilities", account: "Everyday Checking" },
            { date: "Jul 26", merchant: "Greystar Rent", amount: 2000.00, category: "Housing", account: "Everyday Checking" },
        ];
        return [
            Self({
                category: "Food & Dining", periodLabel: "This month", total_spent: 640,
                count: 34, shown: 8, change_vs_prev_pct: 22, transactions,
            }).previewName("Food & Dining"),
            Self({
                category: "Food & Dining", periodLabel: "Past 6 months", total_spent: 3829,
                count: 152, shown: 8, change_vs_prev_pct: 2.4, transactions,
            }).previewName("Six-month window"),
            Self({
                category: "All spending", periodLabel: "Past 3 months", total_spent: 14346,
                count: 192, shown: 5, change_vs_prev_pct: -2.3, transactions: mixed,
            }).previewName("All categories"),
            Self({
                category: "Whole Foods", periodLabel: "This month", total_spent: 343.08,
                count: 3, shown: 3, change_vs_prev_pct: -10.8,
                transactions: [
                    {
                        date: "Jul 31", merchant: "Whole Foods", amount: 111.60,
                        category: "Groceries", account: "Rewards Card",
                        items: [
                            { name: "Sourdough loaf", qty: 2, price: 5.93, total: 11.86 },
                            { name: "Parmigiano Reggiano", qty: 1, price: 13.85, total: 13.85 },
                            { name: "Olive oil", qty: 1, price: 16.83, total: 16.83 },
                            { name: "Rotisserie chicken", qty: 2, price: 11.87, total: 23.74 },
                            { name: "Wild salmon fillet", qty: 1, price: 18.80, total: 18.80 },
                            { name: "Avocados, bag", qty: 2, price: 8.90, total: 17.80 },
                            { name: "Almond milk", qty: 1, price: 4.74, total: 4.74 },
                            { name: "Dark chocolate bar", qty: 1, price: 3.98, total: 3.98 },
                        ],
                    },
                    {
                        date: "Jul 19", merchant: "Whole Foods", amount: 117.20,
                        category: "Groceries", account: "Rewards Card",
                        items: [
                            { name: "Free-range eggs, dozen", qty: 2, price: 7.42, total: 14.84 },
                            { name: "Wild salmon fillet", qty: 1, price: 18.80, total: 18.80 },
                            { name: "Cherry tomatoes", qty: 1, price: 4.94, total: 4.94 },
                            { name: "Cold brew concentrate", qty: 1, price: 9.40, total: 9.40 },
                        ],
                    },
                ],
            }).previewName("Merchant — tap a row for its breakdown"),
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

const TransactionRow = ({ transaction: t, showCategory, singleMerchant, host, onOpen }) => {
    const color = colorForMerchant(t.merchant);
    const env = useEnvironment();
    const items = Array.isArray(t.items) ? t.items : [];
    const itemCount = items.length + (items.length === 1 ? " item" : " items");

    // In a merchant-scoped list the header already names the merchant, so the
    // title leads with the basket size ("8 items") — or the date when there's
    // nothing to itemise. A mixed list still leads with the merchant.
    const title = !singleMerchant
        ? (t.merchant || "—")
        : items.length ? itemCount : (t.date || "—");

    // Subtitle carries whatever the title didn't. The breakdown itself lives in
    // the detail sheet — inline it swamped the card.
    const bits = [];
    if (!(singleMerchant && !items.length)) bits.push(t.date || "");
    if (showCategory && t.category) bits.push(t.category);
    if (t.account) bits.push(t.account);
    if (items.length && !singleMerchant) bits.push(itemCount);
    const subtitle = bits.filter((s) => !!s).join(" · ");

    // A Menu tints its whole label with the accent colour by default, so every
    // Text inside carries an explicit foregroundStyle: accent on the merchant
    // (the tap affordance), primary on the amount. No host = not tappable, so
    // the merchant stays primary.
    const amountText = (
        Text(money2(t.amount))
            .font("body")
            .fontWeight("semibold")
            .fontDesign("rounded")
            .lineLimit(1)
            .foregroundStyle(Color("primary"))
            .fixedSize({ horizontal: true })
    );

    const row = (
        HStack({ spacing: 12 }, [
            Monogram({ name: t.merchant, color }),
            VStack({ spacing: 2, alignment: "leading" }, [
                Text(title)
                    .font("body")
                    .fontWeight("medium")
                    .lineLimit(1)
                    .foregroundStyle(Color(host ? "accent" : "primary")),
                Text(subtitle)
                    .font("footnote")
                    .foregroundStyle(Color("secondary"))
                    .lineLimit(1),
            ]),
            Spacer(),
            amountText,
        ])
    );

    // Web keeps plain rows — no sheet idiom, no menu.
    if (!host || (env && env.platform === "web")) return row;

    // A purchase with a basket opens its breakdown sheet on tap. The follow-up
    // questions move into that sheet, so the tap does one obvious thing.
    if (items.length && onOpen) {
        return row
            .contentShape(Rectangle())
            .onTapGesture(() => onOpen())
            .sensoryFeedback({ feedback: "selection", trigger: t.merchant + t.date });
    }

    // Nothing to itemise (rent, streaming) — keep the drill-down menu.
    return Menu({ label: row }, [
        Button("All " + t.merchant + " charges", () =>
            host.sendMessage("Show me everything I've spent at " + t.merchant + " over the past 6 months.")),
        Button("Is this recurring?", () =>
            host.sendMessage("Is my " + t.merchant + " charge a recurring subscription?")),
        ...(t.category ? [
            Button("More " + t.category, () =>
                host.sendMessage("What did I spend on " + t.category + " over the past 3 months?")),
        ] : []),
    ]).sensoryFeedback({ feedback: "selection", trigger: t.merchant + t.date });
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

function money2(n) {
    const v = Number(n || 0);
    const f = Math.abs(v).toFixed(2);
    const parts = f.split(".");
    return (v < 0 ? "-$" : "$") + commas(parts[0]) + "." + parts[1];
}

function money0(n) {
    const v = Math.round(Number(n || 0));
    return (v < 0 ? "-$" : "$") + commas(String(Math.abs(v)));
}

function colorForMerchant(name) {
    let h = 0;
    const s = String(name || "");
    for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % 997;
    return Color(PALETTE[h % PALETTE.length]);
}

// Single-tool path's data fetch. Pure: no hooks, no state — the body's hydrate
// closure owns dedupe and setState. Only non-empty filters are forwarded, so an
// omitted merchant doesn't narrow the query to "" and come back empty.
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

async function fetchTransactions(host, props, view) {
    const args = {};
    // 'unusual' reads `standouts`, which the tool computes over the whole
    // window regardless of ordering — so only 'largest' changes the sort.
    if (view === "largest") args.sort = "largest";
    if (props.category) args.category = props.category;
    if (props.merchant) args.merchant = props.merchant;
    if (props.startDate) args.startDate = props.startDate;
    if (props.endDate) args.endDate = props.endDate;
    // Dates override the period upstream, so only send it when they're absent.
    if (props.period && !props.startDate && !props.endDate) args.period = props.period;
    if (Number(props.limit || 0) > 0) args.limit = Number(props.limit);
    try {
        const result = await host.toolCall("get_transactions", args);
        return result && Array.isArray(result.transactions) ? result : null;
    } catch (e) {
        return null;
    }
}
