// get_spending_breakdown — data tool (Banking Assistant slice).
//
// Aggregates the shared transaction feed for a window: per-category amounts,
// shares, counts, change vs the prior window, and top merchants, plus the
// totals.
//
// This used to be a hand-written month table multiplied by a per-period scale
// factor, which meant it was a second source of truth that disagreed with the
// transaction feed everywhere it mattered — $420/9 for groceries where the feed
// held $507/5, top dining merchants of Chipotle/Sweetgreen/Starbucks where the
// feed's biggest were DoorDash/Sushi Hana, and a year-to-date scale frozen at
// 5.35 months. Every one of those was a number a client could catch by opening
// two cards. Deriving from the rows makes them agree by construction.

// ═══ BEGIN SHARED FEED — generated, do not edit here ═══
// ═══════════════════════════════════════════════════════════════════════════
// SHARED FEED — the single source of truth for the Vault demo.
//
// DO NOT EDIT THIS BLOCK INSIDE A COMPONENT. Edit scripts/shared-feed.js and
// run `node scripts/sync-shared-feed.mjs` to inject it into every component
// that needs it. `--check` verifies the copies are identical and is what stops
// them drifting apart again.
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
// One enum across every data tool — see the note in GetTransactions.ts.
const PERIOD_OPTIONS = ["7d", "30d", "mtd", "lastMonth", "3mo", "6mo", "ytd", "1y", "all"];

const PERIOD_LABELS = {
    "7d": "Last 7 days", "30d": "Last 30 days", mtd: "This month", lastMonth: "Last month",
    "3mo": "Past 3 months", "6mo": "Past 6 months", ytd: "Year to date",
    "1y": "Past 12 months", all: "All time",
};

// Days back from today that a period reaches. `ytd` is computed, not
// tabulated: it used to be a frozen scale of 5.35 months, which is right on
// exactly one day of the year.
//
// 30, not 31, for mtd: a 31-day window fits a 30.44-day monthly subscription
// twice, which reads as a double charge. Matches GetTransactions.
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
        const depth = { "7d": 7, "30d": 30, "3mo": 92, "6mo": 183, "1y": 365, all: MAX_DAYS }[period];
        oldest = depth === undefined ? 30 : depth;
    }

    // A rolling window has no calendar to line up with, so it compares against
    // the equal-length span immediately before it.
    return { newest: 0, oldest, priorNewest: oldest + 1, priorOldest: oldest * 2 + 1 };
}

// Roll a set of rows up by category.
function groupByCategory(rows) {
    const byCat = {};
    for (let i = 0; i < rows.length; i++) {
        const t = rows[i];
        if (!byCat[t.category]) byCat[t.category] = { amount: 0, count: 0, merchants: {} };
        const g = byCat[t.category];
        g.amount = round2(g.amount + t.amount);
        g.count += 1;
        g.merchants[t.merchant] = round2((g.merchants[t.merchant] || 0) + t.amount);
    }
    return byCat;
}

// Biggest merchants within one category, most spent first.
function topMerchants(merchantTotals, n) {
    const out = Object.keys(merchantTotals).map((name) => ({ name, amount: merchantTotals[name] }));
    out.sort((a, b) => b.amount - a.amount);
    return out.slice(0, n);
}

export default defineDataSource({
    metadata: {
        title: "Spending Breakdown",
        description:
            "Spending by category for a period — each category's amount, share, transaction count, change from the prior period, and top merchants, plus the totals and the overall change. Call this only when you need the numbers to reason with; to DISPLAY spending, call spending_breakdown with the period instead — it loads this itself.",
    },
    properties: {
        period: {
            type: "enum",
            options: PERIOD_OPTIONS,
            defaultValue: "mtd",
            description: "Spending window.",
        },
        summary: {
            type: "boolean",
            defaultValue: false,
            description: "Drop each category's top_merchants list and return only the headline totals and per-category amounts. Use this when you want the numbers to comment on rather than to chart.",
        },
    },
    output: {
        period: { type: "string" },
        periodLabel: { type: "string" },
        total_spend: { type: "number" },
        total_income: { type: "number" },
        net: { type: "number" },
        comparison: {
            type: "group",
            properties: {
                prev_period_spend: { type: "number" },
                change_pct: { type: "number" },
            },
        },
        groups: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    name: { type: "string" },
                    icon: { type: "string" },
                    amount: { type: "number" },
                    pct_of_total: { type: "number" },
                    transaction_count: { type: "integer" },
                    change_vs_prev: { type: "number" },
                    change_vs_prev_pct: { type: "number" },
                    top_merchants: {
                        type: "array",
                        valueType: {
                            type: "group",
                            properties: {
                                name: { type: "string" },
                                amount: { type: "number" },
                            },
                        },
                    },
                },
            },
        },
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    handler: async (props, env) => {
        const period = PERIOD_LABELS[props.period] ? props.period : "mtd";
        const now = new Date();
        const win = periodWindow(period, now);
        const oldest = Math.min(MAX_DAYS, win.oldest);
        const newest = Math.min(win.newest, oldest);
        const priorOldest = Math.min(MAX_DAYS, win.priorOldest);
        const priorNewest = Math.min(win.priorNewest, priorOldest);

        // This window and the one immediately before it, so every change figure
        // is a real comparison of two spans of equal length rather than an
        // authored constant. When the feed doesn't reach back far enough, the
        // prior window is empty and pctChange returns 0 rather than inventing a
        // direction.
        const current = inWindow(DEBITS, newest, oldest);
        const prior = inWindow(DEBITS, priorNewest, priorOldest);

        const total_spend = sumOf(current);
        const total_income = sumOf(inWindow(TRANSACTIONS.filter((t) => t.kind === "credit"), newest, oldest));
        const prev_spend = sumOf(prior);

        const nowByCat = groupByCategory(current);
        const prevByCat = groupByCategory(prior);

        // Summary mode keeps only what a sentence of commentary needs — the
        // category, what it cost, and which way it moved. The icon, share,
        // count, absolute delta and merchant list are all for the card to draw,
        // and together they are most of the payload.
        const groups = Object.keys(nowByCat).map((name) => {
            const g = nowByCat[name];
            const was = prevByCat[name] ? prevByCat[name].amount : 0;
            if (props.summary) {
                return { name, amount: g.amount, change_vs_prev_pct: pctChange(g.amount, was) };
            }
            return {
                name,
                icon: CATEGORY_ICONS[name] || "circle.fill",
                amount: g.amount,
                pct_of_total: total_spend ? Math.round((g.amount / total_spend) * 1000) / 10 : 0,
                transaction_count: g.count,
                change_vs_prev: round2(g.amount - was),
                change_vs_prev_pct: pctChange(g.amount, was),
                top_merchants: topMerchants(g.merchants, 3),
            };
        });
        groups.sort((a, b) => b.amount - a.amount);

        return {
            period,
            periodLabel: PERIOD_LABELS[period],
            total_spend,
            total_income,
            net: round2(total_income - total_spend),
            comparison: {
                prev_period_spend: prev_spend,
                change_pct: pctChange(total_spend, prev_spend),
            },
            groups,
        };
    },
});
