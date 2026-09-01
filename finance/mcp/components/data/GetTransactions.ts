// get_transactions — data tool (Banking Assistant slice).
// "What did I spend at [category]?" — filters the transaction feed by category
// or merchant for a window and returns the matching rows plus the total, the
// count, and the change vs the prior window.
//
// Every figure is computed from the rows actually in the window. There used to
// be a CATEGORY_META table of hand-written month totals here that the handler
// returned instead, on the theory that it kept the numbers aligned with the
// spending card. It did the opposite: the card reported "$640 across 34
// purchases" above a list of 25 rows summing to $651, because the table and the
// generator were never reconciled. The spending card now aggregates the same
// feed, so they agree by construction and the table is gone.

// ═══ BEGIN SHARED FEED ═══
// ═══════════════════════════════════════════════════════════════════════════
// SHARED FEED — the single source of truth for the Vault demo.
//
// This block is identical in every data component that needs it. If you change
// it, change it in all of them — any two cards showing the same figure are
// expected to agree.
//
// Why it is duplicated at all: BindJS components are deployed independently and
// the flat-file tree has no shared-library directory, so there is no import to
// reach for. Copying under a checksum is the honest version of that constraint.
//
// Everything the demo reports — spending by category, recurring-charge
// detection, transaction lists — is derived from the feed generated here. It
// used to be three hand-written tables that disagreed with each other: the
// spending card claimed 34 dining purchases where the feed held 25, and named
// top merchants (Chipotle, Sweetgreen) that weren't the feed's biggest.
//
// The feed is generated from recurring merchant patterns (cadence + phase +
// deterministic jitter), giving ~25 months of rows without a thousand-line
// table. Offsets are `daysAgo` relative to the clock at call time, so the feed
// stays evergreen, and the same call always returns the same rows.
// ═══════════════════════════════════════════════════════════════════════════

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86400000;

// ~25 months of feed. A 12-month window needs a full 12 months behind it to
// compare against, which 380 days could not give: a 1y comparison caught only
// the 15 days that existed before the window and reported +1669%.
const MAX_DAYS = 760;

function hash(i) {
    const s = Math.sin(i * 12.9898) * 43758.5453;
    return s - Math.floor(s);
}

const round2 = (n) => Math.round(n * 100) / 100;

// SF Symbol per category, for the spending card's rows.
const CATEGORY_ICONS = {
    "Housing": "house.fill", "Food & Dining": "fork.knife", "Groceries": "cart.fill",
    "Shopping": "bag.fill", "Utilities": "bolt.fill", "Health": "heart.fill",
    "Entertainment": "film.fill", "Subscriptions": "repeat", "Transportation": "car.fill",
    "Income": "arrow.down.circle.fill",
};

// Recurring merchant patterns. `every` = average days between visits,
// `phase` = daysAgo of the most recent visit, `var` = amount variance,
// `jitter` = ± days of schedule wobble. var/jitter 0 = fixed bills.
//
// `stepAt`/`stepFrom` reprice a merchant partway through the history (the rent
// rise, the Netflix hike). `startedDaysAgo`/`endedDaysAgo` bound a merchant's
// lifetime, which is what makes subscription detection able to report "new"
// and "cancelled" from the data rather than from a flag someone typed.
const PATTERNS = {
    "Housing": [
        // Rent stepped 1850 -> 2000 at the renewal ~5 months ago; a clean,
        // explainable jump for "why is my housing spend up?".
        { merchant: "Greystar Rent", account: "Everyday Checking", amount: 2000, var: 0, every: 30.44, phase: 8, jitter: 0, stepAt: 150, stepFrom: 1850 },
    ],
    "Food & Dining": [
        { merchant: "Sushi Hana", account: "Rewards Card", amount: 78, var: 0.3, every: 21, phase: 1, jitter: 3 },
        { merchant: "DoorDash", account: "Rewards Card", amount: 41, var: 0.35, every: 7, phase: 4, jitter: 2 },
        { merchant: "Chipotle", account: "Everyday Checking", amount: 15, var: 0.15, every: 8, phase: 6, jitter: 2 },
        { merchant: "Sweetgreen", account: "Rewards Card", amount: 16.5, var: 0.15, every: 11, phase: 8, jitter: 3 },
        { merchant: "Frontier Restaurant", account: "Rewards Card", amount: 52, var: 0.3, every: 38, phase: 10, jitter: 5 },
        { merchant: "Starbucks", account: "Everyday Checking", amount: 6.9, var: 0.2, every: 5, phase: 0, jitter: 2 },
        { merchant: "Shake Shack", account: "Rewards Card", amount: 23.9, var: 0.2, every: 19, phase: 15, jitter: 4 },
        { merchant: "Olive Garden", account: "Rewards Card", amount: 64, var: 0.25, every: 41, phase: 17, jitter: 6 },
        { merchant: "Blue Bottle Coffee", account: "Everyday Checking", amount: 8.4, var: 0.15, every: 12, phase: 3, jitter: 3 },
        { merchant: "Pizzeria Luca", account: "Rewards Card", amount: 38.6, var: 0.25, every: 27, phase: 24, jitter: 5 },
    ],
    "Groceries": [
        { merchant: "Whole Foods", account: "Rewards Card", amount: 124, var: 0.3, every: 11, phase: 3, jitter: 2 },
        { merchant: "Trader Joe's", account: "Rewards Card", amount: 86, var: 0.25, every: 12, phase: 11, jitter: 3 },
    ],
    "Shopping": [
        { merchant: "Amazon", account: "Rewards Card", amount: 130, var: 0.6, every: 9, phase: 5, jitter: 3 },
        { merchant: "Apple", account: "Rewards Card", amount: 99, var: 0.5, every: 34, phase: 12, jitter: 6 },
        { merchant: "REI", account: "Rewards Card", amount: 67, var: 0.5, every: 41, phase: 20, jitter: 8 },
        { merchant: "Target", account: "Rewards Card", amount: 54, var: 0.4, every: 17, phase: 9, jitter: 4 },
        // Yearly membership. Detection reports it as a subscription at its
        // monthly equivalent, which is the whole point of tracking cadence.
        // Phase 10 so BOTH charges (10 and 375 days ago) fall inside the
        // 380-day feed — one charge is a purchase, two a year apart is a
        // cadence, and detection can only report what the rows evidence.
        { merchant: "Amazon Prime", account: "Rewards Card", amount: 139, var: 0, every: 365, phase: 10, jitter: 0 },
    ],
    "Transportation": [
        { merchant: "Shell", account: "Rewards Card", amount: 48, var: 0.2, every: 12, phase: 2, jitter: 2 },
        { merchant: "Uber", account: "Rewards Card", amount: 30, var: 0.4, every: 9, phase: 9, jitter: 3 },
        { merchant: "City Parking", account: "Everyday Checking", amount: 12, var: 0.3, every: 15, phase: 5, jitter: 4 },
    ],
    "Entertainment": [
        { merchant: "AMC Theatres", account: "Rewards Card", amount: 32, var: 0.25, every: 16, phase: 7, jitter: 4 },
        { merchant: "Steam", account: "Rewards Card", amount: 17, var: 0.4, every: 13, phase: 14, jitter: 4 },
        { merchant: "Ticketmaster", account: "Rewards Card", amount: 22, var: 0.8, every: 55, phase: 21, jitter: 10 },
    ],
    "Utilities": [
        { merchant: "PNM Electric", account: "Everyday Checking", amount: 124, var: 0.25, every: 30.44, phase: 6, jitter: 1 },
        { merchant: "Comcast", account: "Everyday Checking", amount: 89, var: 0, every: 30.44, phase: 12, jitter: 0 },
        { merchant: "AT&T", account: "Everyday Checking", amount: 47, var: 0, every: 30.44, phase: 17, jitter: 0 },
    ],
    "Health": [
        { merchant: "Walgreens", account: "Rewards Card", amount: 41, var: 0.3, every: 12, phase: 4, jitter: 3 },
        // Repriced mid-history, so "which subscriptions went up?" has an answer
        // outside the streaming services and detection has to find it from the
        // rows rather than from a flag.
        { merchant: "ClassPass", account: "Rewards Card", amount: 52, var: 0, every: 30.44, phase: 14, jitter: 0, stepAt: 120, stepFrom: 39 },
    ],
    "Subscriptions": [
        // Subscription creep is the story: three of these are older than the
        // 6-month window, two started inside it, and one was cancelled — so
        // "what changed?" has a real answer, and detection can find it.
        { merchant: "Spotify", account: "Rewards Card", amount: 11.99, var: 0, every: 30.44, phase: 2, jitter: 0 },
        { merchant: "Netflix", account: "Rewards Card", amount: 22.99, var: 0, every: 30.44, phase: 6, jitter: 0, stepAt: 100, stepFrom: 19.99 },
        { merchant: "iCloud+", account: "Rewards Card", amount: 2.99, var: 0, every: 30.44, phase: 8, jitter: 0 },
        { merchant: "ChatGPT Plus", account: "Rewards Card", amount: 20, var: 0, every: 30.44, phase: 1, jitter: 0, startedDaysAgo: 130 },
        { merchant: "Disney+", account: "Rewards Card", amount: 13.99, var: 0, every: 30.44, phase: 19, jitter: 0, startedDaysAgo: 80 },
        { merchant: "The New York Times", account: "Rewards Card", amount: 25, var: 0, every: 30.44, phase: 24, jitter: 0 },
        { merchant: "Hulu", account: "Rewards Card", amount: 17.99, var: 0, every: 30.44, phase: 11, jitter: 0, endedDaysAgo: 95 },
    ],
};

// Money coming IN. Kept in its own table because credits are excluded from
// every spending total — without this, `total_income` was a constant floating
// free of the feed, and "show me all my transactions" returned a ledger with no
// paycheck in it, which no real bank feed looks like.
//
// Semi-monthly payroll of ~$3,200 nets the $6,400/month the demo quotes.
const INCOME_PATTERNS = {
    "Income": [
        { merchant: "Northwind Labs Payroll", account: "Everyday Checking", amount: 3200, var: 0.02, every: 15.22, phase: 3, jitter: 1 },
        { merchant: "Savings Interest", account: "High-Yield Savings", amount: 41, var: 0.12, every: 30.44, phase: 9, jitter: 1 },
        // One annual bonus, so the year has a visible spike rather than a flat line.
        { merchant: "Northwind Labs Bonus", account: "Everyday Checking", amount: 5400, var: 0, every: 365, phase: 233, jitter: 0 },
    ],
};

// Per-category monthly drift, applied to amounts as they approach the present.
// Without this the feed is stationary noise and every period-over-period
// comparison reads "flat", which is both wrong and boring to demo.
const DRIFT = {
    "Food & Dining": 0.035,
    "Groceries": -0.008,
    "Shopping": 0.020,
    "Transportation": -0.025,
    "Entertainment": 0.021,
    "Utilities": 0.005,
    "Health": -0.014,
    "Housing": 0,        // stepped, not drifted — see the rent increase above
    "Subscriptions": 0,  // grows by adding subs, not by raising prices
    "Income": 0.004,     // a modest raise over the year
};

// Mild holiday seasonality (calendar-month multipliers) so a 12-month view has
// a visible shape rather than a straight ramp. Nov/Dec up for gifts and going
// out, Jan down for the post-holiday lull.
const SEASON = {
    "Shopping": { 10: 1.35, 11: 1.75, 0: 0.72 },
    "Entertainment": { 11: 1.30, 0: 0.85 },
    "Food & Dining": { 11: 1.18, 0: 0.90 },
};

// One-off purchases that follow no schedule. Every other row in the feed comes
// from a cadence, and a ledger where nothing is ever a surprise reads as
// synthetic the moment anyone scrolls it. These are the irregular ones.
// Spread deliberately: the current month carries ONE modest irregular purchase,
// not a cluster. Stacking a flight, a hotel and a car repair into the last
// three weeks pushed the month's total to $6,183 against $6,400 of income,
// which made the headline "you saved $217 this month" — technically derived
// from the feed, and a terrible thing to open a demo on. The big irregulars sit
// further back where they give the 6- and 12-month views their shape instead.
const ONE_OFFS = [
    // This month, and deliberately unmistakable. A car repair is many times any
    // other Transportation row, so it stands out against its category; the
    // Amazon order stands out against that merchant's own history instead,
    // which exercises the other half of how a standout is judged.
    { daysAgo: 6, merchant: "Sandia Auto Repair", amount: 612.4, category: "Transportation", account: "Everyday Checking" },
    { daysAgo: 11, merchant: "Amazon", amount: 389.9, category: "Shopping", account: "Rewards Card" },

    { daysAgo: 18, merchant: "IKEA", amount: 297.45, category: "Shopping", account: "Rewards Card" },
    { daysAgo: 41, merchant: "Presbyterian Urgent Care", amount: 175.0, category: "Health", account: "Rewards Card" },
    // A refund, so the ledger isn't uniformly one-directional.
    { daysAgo: 55, merchant: "Amazon — refund", amount: -84.3, category: "Shopping", account: "Rewards Card" },
    { daysAgo: 73, merchant: "The Home Depot", amount: 156.8, category: "Shopping", account: "Rewards Card" },
    { daysAgo: 96, merchant: "Meow Wolf", amount: 118.0, category: "Entertainment", account: "Rewards Card" },
    // A trip: flight and hotel land together, the way a real one does.
    { daysAgo: 108, merchant: "Southwest Airlines", amount: 348.6, category: "Transportation", account: "Rewards Card" },
    { daysAgo: 109, merchant: "Hotel Chaco", amount: 412.0, category: "Transportation", account: "Rewards Card" },
    { daysAgo: 134, merchant: "DMV Registration", amount: 92.0, category: "Transportation", account: "Everyday Checking" },
    { daysAgo: 151, merchant: "Sandia Auto Repair", amount: 684.22, category: "Transportation", account: "Everyday Checking" },
    { daysAgo: 168, merchant: "Vet — Petroglyph Animal Hospital", amount: 240.5, category: "Health", account: "Rewards Card" },
    { daysAgo: 205, merchant: "REI", amount: 389.95, category: "Shopping", account: "Rewards Card" },
    { daysAgo: 262, merchant: "Delta Air Lines", amount: 512.4, category: "Transportation", account: "Rewards Card" },
    { daysAgo: 318, merchant: "Best Buy", amount: 649.99, category: "Shopping", account: "Rewards Card" },

    // The prior year. Without these the older half of the feed is nothing but
    // cadences, so a year-over-year comparison holds a lumpy year up against an
    // implausibly smooth one and every irregular reads as new. Deliberately not
    // a mirror of the recent year. Only the repair shop repeats by name: two
    // charges a year apart read as a cadence, and detection duly reported the
    // urgent-care visit and the museum trip as subscriptions. The car is worth
    // the repeat because "you spent more on it this year" is a real observation;
    // everything else uses a different merchant.
    { daysAgo: 402, merchant: "United Airlines", amount: 421.3, category: "Transportation", account: "Rewards Card" },
    { daysAgo: 438, merchant: "Mesa Verde Lodge", amount: 268.0, category: "Transportation", account: "Rewards Card" },
    { daysAgo: 470, merchant: "Sandia Auto Repair", amount: 312.55, category: "Transportation", account: "Everyday Checking" },
    { daysAgo: 512, merchant: "Lovelace Urgent Care", amount: 140.0, category: "Health", account: "Rewards Card" },
    { daysAgo: 566, merchant: "Lowe's", amount: 233.4, category: "Shopping", account: "Rewards Card" },
    { daysAgo: 611, merchant: "Explora Science Center", amount: 96.0, category: "Entertainment", account: "Rewards Card" },
    { daysAgo: 668, merchant: "Costco", amount: 418.75, category: "Shopping", account: "Rewards Card" },
    { daysAgo: 712, merchant: "Vet — Cottonwood Animal Clinic", amount: 188.0, category: "Health", account: "Rewards Card" },
];

// Expand one pattern table into rows.
function emitPattern(rows, table, kind, seedBase) {
    const cats = Object.keys(table);
    const now = new Date();
    for (let ci = 0; ci < cats.length; ci++) {
        const cat = cats[ci];
        const drift = DRIFT[cat] || 0;
        const season = SEASON[cat];
        for (let pi = 0; pi < table[cat].length; pi++) {
            const p = table[cat][pi];
            const seed = seedBase + ci * 97.31 + pi * 13.7;
            // A fixed-price bill does not drift. Applying the category's drift
            // to `var: 0` patterns made Spotify creep 3.5%/month and ClassPass
            // fall 15.6% over the year, so recurring-charge detection reported
            // price changes on subscriptions whose price never moved. Genuine
            // repricing is modelled with stepAt/stepFrom instead.
            const patternDrift = p.var === 0 ? 0 : drift;
            for (let k = 0; p.phase + k * p.every <= MAX_DAYS + 20; k++) {
                const wobble = p.jitter ? Math.round((hash(seed + k * 7.3) - 0.5) * 2 * p.jitter) : 0;
                const daysAgo = p.phase + Math.round(k * p.every) + wobble;
                if (daysAgo < 0 || daysAgo > MAX_DAYS) continue;
                // Lifecycle: subscriptions that started partway through the
                // history, or were cancelled, simply don't emit outside it.
                if (p.startedDaysAgo != null && daysAgo > p.startedDaysAgo) continue;
                if (p.endedDaysAgo != null && daysAgo < p.endedDaysAgo) continue;

                // Base amount, with a step change if the merchant repriced
                // (rent went up) — steps read better than drift for fixed bills.
                const base = p.stepAt != null && daysAgo > p.stepAt ? p.stepFrom : p.amount;
                // Drift toward the present, then calendar seasonality, then noise.
                let amount = base * Math.pow(1 + patternDrift, -daysAgo / 30.44);
                if (season) {
                    const m = new Date(now.getTime() - daysAgo * DAY_MS).getMonth();
                    if (season[m]) amount *= season[m];
                }
                if (p.var) amount *= 1 + (hash(seed * 31.7 + k) - 0.5) * p.var;
                rows.push({
                    daysAgo, merchant: p.merchant, amount: round2(amount),
                    category: cat, account: p.account, kind,
                });
            }
        }
    }
}

function generateFeed() {
    const rows = [];
    emitPattern(rows, PATTERNS, "debit", 0);
    emitPattern(rows, INCOME_PATTERNS, "credit", 511.7);
    for (let i = 0; i < ONE_OFFS.length; i++) {
        const o = ONE_OFFS[i];
        rows.push({
            daysAgo: o.daysAgo, merchant: o.merchant, amount: round2(o.amount),
            category: o.category, account: o.account, kind: "debit",
        });
    }
    rows.sort((a, b) => a.daysAgo - b.daysAgo);
    return rows;
}

const TRANSACTIONS = generateFeed();

// Spending only — credits never count toward a spending total.
const DEBITS = TRANSACTIONS.filter((t) => t.kind === "debit");

// Every distinct merchant in the feed, for resolving merchant-scoped queries
// ("what do I spend at Whole Foods?"). Derived, so it can't drift from the
// pattern tables.
const MERCHANTS = (() => {
    const out = [];
    for (let i = 0; i < TRANSACTIONS.length; i++) {
        if (out.indexOf(TRANSACTIONS[i].merchant) < 0) out.push(TRANSACTIONS[i].merchant);
    }
    return out;
})();

// Rows inside a [newest, oldest] daysAgo window.
function inWindow(rows, newest, oldest) {
    return rows.filter((t) => t.daysAgo >= newest && t.daysAgo <= oldest);
}

const sumOf = (rows) => round2(rows.reduce((s, t) => s + t.amount, 0));

// Percent change between two windows, to one decimal. Zero when there is no
// prior window to compare against, rather than a misleading 100%.
function pctChange(current, prior) {
    if (!(prior > 0)) return 0;
    return Math.round(((current - prior) / prior) * 1000) / 10;
}

// ═══════════════════════════════════════════════════════════════════════════
// END SHARED FEED
// ═══════════════════════════════════════════════════════════════════════════
// ═══ END SHARED FEED ═══

// ─── Shared period vocabulary ────────────────────────────
// One enum across every data tool. Previously each tool had its own ("3mo"
// here, "90d" in spending, absent from net worth), so the agent guessed, the
// call was rejected, and the retry cost a whole turn. Each tool now accepts all
// eight and clamps to what it can serve.
const PERIOD_OPTIONS = ["7d", "30d", "mtd", "lastMonth", "3mo", "6mo", "ytd", "1y", "all"];

const PERIOD_LABELS = {
    "7d": "Last 7 days", "30d": "Last 30 days", mtd: "This month", lastMonth: "Last month",
    "3mo": "Past 3 months", "6mo": "Past 6 months", ytd: "Year to date",
    "1y": "Past 12 months", all: "All time",
};

// A calendar month-to-date window is empty at the start of a month. On the 1st
// it spans zero days, so "this month" reported $89.47 — one dinner — and the
// card opened looking broken. For the first week of a month `mtd` therefore
// resolves to the trailing 30 days instead.
//
// It resolves to a DIFFERENT period rather than quietly widening `mtd`, because
// the caller reads the period back off the result and renders its label from
// it: the card says "Last 30 days" and compares against the 30 before that.
// Answering "this month" with a rolling window is only honest while the window
// is also called a rolling one.
const MTD_MIN_DAYS = 7;

function resolvePeriod(period, now) {
    if (period !== "mtd") return period;
    return now.getDate() - 1 < MTD_MIN_DAYS ? "30d" : period;
}

// How many days back a period reaches from today. `ytd` is calendar-anchored so
// it is computed, not tabulated — a fixed constant for "year to date" is wrong
// on every day of the year except one.
//
// `mtd` is a true calendar month-to-date, except in the first week of a month,
// where resolvePeriod sends it to `30d` — see the note there.
// A window is a pair of day offsets back from today, newest end first:
// {newest: 0, oldest: 30} is the last 30 days. Both ends matter. A window that
// sits entirely in the past — "last month" ended before today began — cannot be
// described by a single depth, which is why `mtd` used to quietly resolve to 30
// days and "last month" had no spelling at all.
function periodWindow(period, now) {
    const daysInto = now.getDate() - 1;              // the 1st of this month, in days ago
    const prevLen = new Date(now.getFullYear(), now.getMonth(), 0).getDate();

    // Calendar windows compare against the same calendar days a month back, not
    // against the span immediately before them. Rent lands on the 1st: compare
    // Aug 1-17 against "the previous 17 days" and you are holding a window with
    // rent in it up against one without, which reports a 155% blowout that is
    // really just the calendar.
    if (period === "mtd") {
        // Clamped, so the 31st compared against a 30-day month lines up with
        // that month's last day rather than running off the end of it.
        const sameDays = Math.min(daysInto, prevLen - 1);
        return {
            newest: 0, oldest: daysInto,
            priorNewest: daysInto + prevLen - sameDays, priorOldest: daysInto + prevLen,
        };
    }

    if (period === "lastMonth") {
        // Day 0 of a month is the last day of the one before, which also gets
        // February right without a leap-year branch.
        const prevPrevLen = new Date(now.getFullYear(), now.getMonth() - 1, 0).getDate();
        return {
            newest: daysInto + 1, oldest: daysInto + prevLen,
            priorNewest: daysInto + prevLen + 1, priorOldest: daysInto + prevLen + prevPrevLen,
        };
    }

    let oldest;
    if (period === "ytd") {
        const jan1 = new Date(now.getFullYear(), 0, 1);
        oldest = Math.max(1, Math.floor((now.getTime() - jan1.getTime()) / DAY_MS));
    } else {
        const depth = { "7d": 7, "30d": 30, "3mo": 92, "6mo": 183, "1y": 365, all: 3650 }[period];
        oldest = depth === undefined ? 30 : depth;
    }

    // A rolling window has no calendar to line up with, so it compares against
    // the equal-length span immediately before it.
    return { newest: 0, oldest, priorNewest: oldest + 1, priorOldest: oldest * 2 + 1 };
}

// Plain-language terms → canonical category.
const ALIASES = {
    restaurants: "Food & Dining", restaurant: "Food & Dining", dining: "Food & Dining",
    food: "Food & Dining", eating: "Food & Dining", coffee: "Food & Dining", takeout: "Food & Dining",
    grocery: "Groceries", groceries: "Groceries",
    shopping: "Shopping", shops: "Shopping", retail: "Shopping",
    transport: "Transportation", transportation: "Transportation", gas: "Transportation",
    rideshare: "Transportation", uber: "Transportation",
    entertainment: "Entertainment", fun: "Entertainment", movies: "Entertainment",
    utilities: "Utilities", bills: "Utilities",
    health: "Health", fitness: "Health", medical: "Health",
    rent: "Housing", mortgage: "Housing",
    streaming: "Subscriptions",
    income: "Income", salary: "Income", pay: "Income", paycheck: "Income",
    payroll: "Income", wages: "Income", earnings: "Income", deposits: "Income",
};

// Line items for merchants where an itemised basket makes sense. Prices are
// typical shelf prices; the basket builder scales them to hit the transaction
// total exactly, so the receipt always adds up. Merchants absent here (rent,
// utilities, streaming) return no items — a single charge has nothing to
// itemise.
const CATALOG = {
    "Whole Foods": [
        { name: "Organic bananas", price: 3.40 }, { name: "Rotisserie chicken", price: 11.99 },
        { name: "Almond milk", price: 4.79 }, { name: "Sourdough loaf", price: 5.99 },
        { name: "Free-range eggs, dozen", price: 7.49 }, { name: "Wild salmon fillet", price: 18.99 },
        { name: "Baby spinach", price: 4.29 }, { name: "Greek yoghurt", price: 6.49 },
        { name: "Avocados, bag", price: 8.99 }, { name: "Cold brew concentrate", price: 9.49 },
        { name: "Parmigiano Reggiano", price: 13.99 }, { name: "Cherry tomatoes", price: 4.99 },
        { name: "Olive oil", price: 16.99 }, { name: "Dark chocolate bar", price: 3.99 },
    ],
    "Trader Joe's": [
        { name: "Mandarin chicken", price: 5.99 }, { name: "Everything bagel seasoning", price: 2.49 },
        { name: "Cauliflower gnocchi", price: 3.29 }, { name: "Cold pressed juice", price: 4.49 },
        { name: "Brioche buns", price: 3.99 }, { name: "Frozen dumplings", price: 4.99 },
        { name: "Goat cheese", price: 4.29 }, { name: "Trail mix", price: 6.49 },
        { name: "Sparkling water, 8pk", price: 3.99 }, { name: "Chili lime cashews", price: 4.99 },
    ],
    "Amazon": [
        { name: "USB-C cable, 2m", price: 14.99 }, { name: "Paperback novel", price: 16.99 },
        { name: "Laundry detergent", price: 24.99 }, { name: "Phone case", price: 21.99 },
        { name: "AA batteries, 16pk", price: 13.49 }, { name: "Desk lamp", price: 39.99 },
        { name: "Coffee filters", price: 9.99 }, { name: "Running socks, 3pk", price: 18.99 },
        { name: "HDMI adapter", price: 22.99 }, { name: "Notebook, A5", price: 11.99 },
    ],
    "Target": [
        { name: "Bath towels, 2pk", price: 24.99 }, { name: "Storage bins", price: 17.99 },
        { name: "Dish soap", price: 4.49 }, { name: "T-shirt", price: 12.99 },
        { name: "Paper towels, 6pk", price: 13.99 }, { name: "Scented candle", price: 9.99 },
        { name: "Toothpaste", price: 5.49 },
    ],
    "REI": [
        { name: "Merino base layer", price: 78.00 }, { name: "Trail socks", price: 22.00 },
        { name: "Water bottle", price: 34.00 }, { name: "Headlamp", price: 44.95 },
        { name: "Climbing chalk", price: 12.95 }, { name: "Dry bag", price: 29.95 },
    ],
    "Walgreens": [
        { name: "Ibuprofen, 100ct", price: 11.49 }, { name: "Vitamin D3", price: 14.99 },
        { name: "Sunscreen SPF 50", price: 13.99 }, { name: "Toothbrush", price: 6.49 },
        { name: "Allergy tablets", price: 18.99 },
    ],
    "Chipotle": [
        { name: "Chicken burrito bowl", price: 11.45 }, { name: "Guacamole", price: 2.85 },
        { name: "Chips", price: 2.25 }, { name: "Fountain drink", price: 2.95 },
    ],
    "Starbucks": [
        { name: "Grande latte", price: 5.45 }, { name: "Cold brew", price: 4.95 },
        { name: "Butter croissant", price: 3.95 }, { name: "Egg bites", price: 5.75 },
    ],
    "Sweetgreen": [
        { name: "Harvest bowl", price: 13.95 }, { name: "Sparkling water", price: 2.95 },
        { name: "Add avocado", price: 2.75 },
    ],
    "Shell": [
        { name: "Unleaded, 12.4 gal", price: 44.00 }, { name: "Car wash", price: 12.00 },
        { name: "Coffee", price: 2.49 },
    ],
    "Apple": [
        { name: "AirPods tips", price: 9.00 }, { name: "MagSafe charger", price: 39.00 },
        { name: "USB-C to Lightning", price: 19.00 }, { name: "iCloud+ 2TB, annual", price: 119.00 },
    ],
    "The Home Depot": [
        { name: "Paint, gallon", price: 42.98 }, { name: "Drop cloth", price: 12.47 },
        { name: "Roller kit", price: 18.99 }, { name: "Painter's tape", price: 8.97 },
    ],
    "IKEA": [
        { name: "BILLY bookcase", price: 79.99 }, { name: "LACK side table", price: 24.99 },
        { name: "RIBBA frame", price: 14.99 }, { name: "Storage boxes, 2pk", price: 19.99 },
    ],
};

// Build a plausible basket that sums EXACTLY to `amount`. Items are picked
// deterministically from the merchant's catalogue, then every price is scaled
// by one factor so the receipt reconciles; the residual cent lands on the last
// line. A basket that didn't add up would be the first thing anyone notices.
function basketFor(merchant, amount, seed) {
    const catalog = CATALOG[merchant];
    if (!catalog || !catalog.length || !(amount > 0)) return [];

    // Deterministic shuffle, so the same transaction always has the same basket.
    const order = catalog.map((item, i) => ({ item, k: hash(seed + i * 5.9) }));
    order.sort((a, b) => a.k - b.k);

    // Fill the basket until it roughly reaches the transaction total, skipping
    // any line that would overshoot badly. Two effects worth having: baskets
    // differ trip to trip instead of listing the whole catalogue, and the raw
    // total lands near the real one so the scale factor stays close to 1 and
    // prices stay recognisable.
    const MAX_LINES = 10;
    const picked = [];
    let raw = 0;
    for (let i = 0; i < order.length && picked.length < MAX_LINES && raw < amount; i++) {
        const c = order[i].item;
        if (picked.length && raw + c.price > amount * 1.1) continue;
        const qty = raw + c.price * 2 <= amount && hash(seed + i * 11.3) > 0.62 ? 2 : 1;
        picked.push({ name: c.name, qty, price: c.price });
        raw += c.price * qty;
    }
    if (!picked.length || raw <= 0) return [];

    // Scale to the transaction total, then fix rounding drift on the last line.
    const scale = amount / raw;
    let running = 0;
    for (let i = 0; i < picked.length; i++) {
        const unit = round2(picked[i].price * scale);
        picked[i].price = unit;
        picked[i].total = round2(unit * picked[i].qty);
        running = round2(running + picked[i].total);
    }
    const drift = round2(amount - running);
    if (drift !== 0) {
        const last = picked[picked.length - 1];
        last.total = round2(last.total + drift);
        last.price = round2(last.total / last.qty);
    }
    return picked;
}

// Exact, then merchant-contains-query ("whole" -> Whole Foods), then
// query-contains-merchant ("Netflix subscription" -> Netflix).
function resolveMerchant(s) {
    const l = String(s || "").trim().toLowerCase();
    if (!l) return null;
    return MERCHANTS.find((m) => m.toLowerCase() === l)
        || (l.length > 2 ? MERCHANTS.find((m) => m.toLowerCase().indexOf(l) >= 0) : null)
        || (l.length > 2 ? MERCHANTS.find((m) => l.indexOf(m.toLowerCase()) >= 0) : null)
        || null;
}

function parseISO(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
}

const CATEGORY_NAMES = Object.keys(PATTERNS).concat(Object.keys(INCOME_PATTERNS));

export default defineDataSource({
    metadata: {
        title: "Transactions",
        description:
            "Raw transactions for a category or a single merchant, with the window total, count, and change vs the prior window. Categories: Housing, Food & Dining, Groceries, Shopping, Transportation, Entertainment, Subscriptions, Utilities, Health, Income — plain terms like 'restaurants', 'rent', 'gas' or 'paycheck' resolve, as does a merchant name in the category slot. Omit both for all spending (income is excluded from spending totals; ask for the Income category to see deposits). Any category- or merchant-scoped query returns that window's line items rolled up biggest-first (`top_items`) — which is what answers \"what should I stop buying\"; merchant-scoped queries additionally itemise each row's basket. Every row carries `vs_typical_pct` (this charge against what that merchant normally costs), and `standouts` lists the few charges furthest above typical across the whole window — use it for \"anything unusual\" rather than scanning rows. Pass sort:'largest' for biggest-first. Covers roughly the past 25 months. Call this only when you need the numbers to reason with; to DISPLAY transactions, call transaction_list with the filter instead — it loads this itself.",
    },
    properties: {
        category: {
            type: "string",
            description: "Category or plain term to filter by, e.g. 'Food & Dining', 'restaurants', 'rent', 'gas', 'income'. A merchant name here is resolved as a merchant. Omit or leave empty for all categories.",
        },
        merchant: {
            type: "string",
            description: "Single store or brand to filter by, e.g. 'Whole Foods', 'Netflix', 'Shell'. Combine with category to narrow further.",
        },
        period: {
            type: "enum",
            options: PERIOD_OPTIONS,
            defaultValue: "mtd",
            description: "Time window. Ignored when startDate/endDate are given. The feed covers ~25 months, so a 1y window has a full prior year to compare against.",
        },
        startDate: {
            type: "string",
            description: "Window start, YYYY-MM-DD. Defaults to 30 days before endDate.",
        },
        endDate: {
            type: "string",
            description: "Window end, YYYY-MM-DD. Defaults to today.",
        },
        sort: {
            type: "enum",
            options: ["recent", "largest"],
            defaultValue: "recent",
            description: "'recent' is newest-first and is what a plain list wants. Use 'largest' for \"my biggest transactions\" — a window can hold hundreds of rows, so date order buries them.",
        },
        limit: {
            type: "integer",
            defaultValue: 20,
            validation: { min: 0, max: 200 },
            description: "Max transactions to return. Pass 0 for totals and counts only — much cheaper when you need the figures to reason with rather than to list.",
        },
    },
    output: {
        category: { type: "string" },
        periodLabel: { type: "string" },
        total_spent: { type: "number" },
        count: { type: "integer" },
        shown: { type: "integer" },
        change_vs_prev_pct: { type: "number" },
        transactions: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    date: { type: "string" },
                    merchant: { type: "string" },
                    amount: { type: "number" },
                    category: { type: "string" },
                    account: { type: "string" },
                    vs_typical_pct: { type: "number" },
                    items: {
                        type: "array",
                        valueType: {
                            type: "group",
                            properties: {
                                name: { type: "string" },
                                qty: { type: "integer" },
                                price: { type: "number" },
                                total: { type: "number" },
                            },
                        },
                    },
                },
            },
        },
        top_items: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    name: { type: "string" },
                    qty: { type: "integer" },
                    total: { type: "number" },
                },
            },
        },
        standouts: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    date: { type: "string" },
                    merchant: { type: "string" },
                    amount: { type: "number" },
                    category: { type: "string" },
                    typical: { type: "number" },
                    vs_typical_pct: { type: "number" },
                },
            },
        },
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    handler: async (props, env) => {
        const raw = String(props.category || "").trim();
        const lower = raw.toLowerCase();
        const period = props.period || "mtd";
        const limit = props.limit === 0 ? 0 : (props.limit || 20);

        // Resolve the scope. An explicit `merchant` always filters by merchant.
        // A `category` that names no known category is retried as a merchant,
        // so "Whole Foods" or "Netflix" in the category slot still works —
        // otherwise it matched nothing and the card came back empty.
        let merchant = resolveMerchant(props.merchant) || (String(props.merchant || "").trim() || null);
        let matched = null;
        if (raw) {
            matched =
                CATEGORY_NAMES.find((k) => k.toLowerCase() === lower) ||
                ALIASES[lower] ||
                CATEGORY_NAMES.find((k) => lower.length > 2 && k.toLowerCase().indexOf(lower) >= 0) ||
                null;
            if (!matched && !merchant) {
                const asMerchant = resolveMerchant(raw);
                if (asMerchant) merchant = asMerchant;
                else matched = raw;  // unknown term — no rows
            }
        }

        const now = new Date();
        const today = new Date(now.getTime());
        today.setHours(0, 0, 0, 0);

        // Window as [newest, oldest] daysAgo bounds. Explicit dates win;
        // future dates clamp to today (there are no future transactions).
        let startDate = parseISO(props.startDate);
        let endDate = parseISO(props.endDate);
        const custom = !!(startDate || endDate);
        let newest = 0, oldest, periodLabel, priorNewest, priorOldest;
        if (custom) {
            if (!endDate) endDate = today;
            if (!startDate) startDate = new Date(endDate.getTime() - 30 * DAY_MS);
            if (startDate > endDate) { const t = startDate; startDate = endDate; endDate = t; }
            newest = Math.max(0, Math.floor((today.getTime() - endDate.getTime()) / DAY_MS));
            oldest = Math.max(newest, Math.floor((today.getTime() - startDate.getTime()) / DAY_MS));
            const fmt = (d) => MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear();
            periodLabel = fmt(startDate) + " – " + fmt(endDate);
            // A hand-picked range has no calendar to line up with, so it
            // compares against the equal-length span immediately before it.
            priorNewest = oldest + 1;
            priorOldest = oldest + (oldest - newest + 1);
        } else {
            // The feed only covers MAX_DAYS, so long windows clamp to it rather
            // than reporting an empty stretch before the history begins.
            const resolved = resolvePeriod(period, now);
            const win = periodWindow(resolved, now);
            oldest = Math.min(MAX_DAYS, win.oldest);
            newest = Math.min(win.newest, oldest);
            priorOldest = win.priorOldest;
            priorNewest = win.priorNewest;
            periodLabel = PERIOD_LABELS[resolved] || "This month";
        }

        const dateLabel = (daysAgo) => {
            const d = new Date(now.getTime() - daysAgo * DAY_MS);
            const base = MONTHS[d.getMonth()] + " " + d.getDate();
            return d.getFullYear() === now.getFullYear() ? base : base + " '" + String(d.getFullYear()).slice(2);
        };

        // Income is excluded unless it was explicitly asked for — a "what did I
        // spend" total that quietly nets off the paycheck is worse than useless.
        const wantsIncome = matched === "Income" ||
            (!!merchant && TRANSACTIONS.some((t) => t.merchant === merchant && t.kind === "credit"));
        const pool = wantsIncome ? TRANSACTIONS : DEBITS;

        const inScope = (t) =>
            (!matched || t.category.toLowerCase() === matched.toLowerCase()) &&
            (!merchant || t.merchant.toLowerCase() === merchant.toLowerCase());
        const scoped = pool.filter(inScope);
        const rows = inWindow(scoped, newest, oldest);

        // Per-row baskets only when the question is about one merchant: a broad
        // query returns hundreds of rows and the receipts would dwarf the
        // payload. The `top_items` rollup below has no such problem — it is a
        // fixed-size summary however many rows feed it — so it runs for any
        // scoped query. That is what makes "what should I stop buying at the
        // grocery store" answerable across every grocery store at once, rather
        // than one merchant at a time.
        const itemise = !!merchant;
        const rollUpItems = !!merchant || !!matched;

        // "Standout" has to mean unusual *for that kind of spending*, not merely
        // large, or rent wins every time and the answer is never interesting.
        // The median is the yardstick because it shrugs off the very outliers
        // we're hunting; a mean would be dragged toward them.
        //
        // A merchant seen often enough is its own baseline. A one-off — a vet
        // bill, a flight, an auto repair — has no history to be unusual against,
        // so it is judged against its category. Judging it against itself is
        // what the first cut of this did, and it made every genuine one-off
        // invisible: a single $684 repair is exactly its own median.
        const MIN_HISTORY = 6;
        const median = (xs) => {
            if (!xs.length) return 0;
            const s = xs.slice().sort((a, b) => a - b);
            return s[Math.floor(s.length / 2)];
        };
        const byMerchant = {}, byCategory = {};
        for (let i = 0; i < DEBITS.length; i++) {
            const d = DEBITS[i];
            if (!byMerchant[d.merchant]) byMerchant[d.merchant] = [];
            if (!byCategory[d.category]) byCategory[d.category] = [];
            byMerchant[d.merchant].push(d.amount);
            byCategory[d.category].push(d.amount);
        }
        const baselineCache = {};
        const baselineFor = (t) => {
            const key = t.merchant + "|" + t.category;
            if (baselineCache[key] === undefined) {
                const own = byMerchant[t.merchant] || [];
                baselineCache[key] = own.length >= MIN_HISTORY
                    ? median(own)
                    : median(byCategory[t.category] || []);
            }
            return baselineCache[key];
        };
        const overTypical = (t) => {
            const base = baselineFor(t);
            return base ? round2(((t.amount - base) / base) * 100) : 0;
        };

        // Newest-first is the right default for "show me my transactions", and
        // useless for "what were my biggest" — with 393 rows in a window and 20
        // shown, sorting by date means the largest are never in the payload.
        const ordered = props.sort === "largest"
            ? rows.slice().sort((a, b) => b.amount - a.amount)
            : rows;

        const shown = ordered.slice(0, limit).map((t) => ({
            date: dateLabel(t.daysAgo),
            merchant: t.merchant,
            amount: t.amount,
            category: t.category,
            account: t.account,
            vs_typical_pct: overTypical(t),
            items: itemise ? basketFor(t.merchant, t.amount, t.daysAgo * 3.1) : [],
        }));

        // The rows furthest above what that merchant normally costs — computed
        // over the whole window rather than the truncated slice, for the same
        // reason `top_items` is. Ranked by the size of the overshoot in dollars
        // so a $40 coffee outranks a 200%-over $6 one: percentages alone
        // promote trivia.
        const standouts = [];
        for (let i = 0; i < rows.length; i++) {
            const base = baselineFor(rows[i]);
            if (!base || rows[i].amount < base * 1.5) continue;
            standouts.push({
                date: dateLabel(rows[i].daysAgo),
                merchant: rows[i].merchant,
                amount: rows[i].amount,
                category: rows[i].category,
                typical: base,
                vs_typical_pct: overTypical(rows[i]),
            });
        }
        standouts.sort((a, b) => (b.amount - b.typical) - (a.amount - a.typical));
        standouts.length = Math.min(standouts.length, 5);

        // "What do I actually buy here?" — the same lines rolled up across the
        // window, biggest spend first. Rolled up from every row in the window,
        // NOT from the `limit`-truncated slice: a six-month Whole Foods question
        // used to answer from only the first 20 baskets and silently under-report
        // everything.
        const top_items = [];
        if (rollUpItems) {
            const byName = {};
            for (let i = 0; i < rows.length; i++) {
                const its = basketFor(rows[i].merchant, rows[i].amount, rows[i].daysAgo * 3.1);
                for (let j = 0; j < its.length; j++) {
                    const it = its[j];
                    if (!byName[it.name]) byName[it.name] = { name: it.name, qty: 0, total: 0 };
                    byName[it.name].qty += it.qty;
                    byName[it.name].total = round2(byName[it.name].total + it.total);
                }
            }
            const names = Object.keys(byName);
            for (let i = 0; i < names.length; i++) top_items.push(byName[names[i]]);
            top_items.sort((a, b) => b.total - a.total);
        }

        // Change against the preceding window of equal length, whenever the feed
        // covers it. Computed from the rows either way — there is no longer a
        // parallel table of hand-written month figures to disagree with.
        const change_pct = priorOldest <= MAX_DAYS
            ? pctChange(sumOf(rows), sumOf(inWindow(scoped, priorNewest, priorOldest)))
            : 0;

        return {
            // Header label: the merchant when scoped to one, else the category.
            category: merchant
                ? (matched ? merchant + " · " + matched : merchant)
                : (matched || "All spending"),
            periodLabel,
            total_spent: sumOf(rows),
            count: rows.length,
            shown: shown.length,
            change_vs_prev_pct: change_pct,
            transactions: shown,
            top_items,
            standouts,
        };
    },
});
