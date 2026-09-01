// get_net_worth — data tool (Banking Assistant slice).
// Net worth trend over a period + the account composition behind it.
//
// The curve is DERIVED FROM THE FEED, which is what makes the demo's arithmetic
// close. It used to compound at a flat 1.8%/month from a hardcoded anchor of
// $44,800 on 1 Aug 2026 — about $800/month of growth, while the spending card
// simultaneously reported $6,400 income against $4,280 spend, i.e. $2,120/month
// saved. Over a year that was ~$25.9k saved against ~$10.7k of growth, and
// "where did the other $15k go?" had no answer. The anchor was also fixed, so
// net worth inflated forever while spending stayed pinned.
//
// Now: today's balance is the anchor, and every earlier point is today minus
// the net savings the feed says accumulated since. Ask "how much did I save
// this year" and "how much did my net worth grow" and you get the same figure.
//
// Market texture is applied only to the invested share, so a checking account
// doesn't appear to wobble with the S&P.

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
// One enum across every data tool — see the note in GetTransactions.ts. This
// tool used to accept only 3mo/6mo/1y/all, so a perfectly reasonable "how did
// my net worth do this month?" (mtd) was rejected outright.
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
    return now.getUTCDate() - 1 < MTD_MIN_DAYS ? "30d" : period;
}

// Days back from `today` (UTC-normalised) that a period reaches. `ytd` is
// calendar-anchored, so it's computed rather than tabulated.
//
// `mtd` is a true calendar month-to-date, except in the first week of a month,
// where resolvePeriod sends it to `30d` — see the note there. `all` reaches
// further back than the transaction feed does (24 months vs 12), which is fine:
// beyond the feed the curve extrapolates at the same savings rate.
// A window is a pair of day offsets back from today, newest end first:
// {newest: 0, oldest: 30} is the last 30 days. Both ends matter. A window that
// sits entirely in the past — "last month" ended before today began — cannot be
// described by a single depth, which is why `mtd` used to quietly resolve to 30
// days and "last month" had no spelling at all.
function periodWindow(period, now) {
    const daysInto = now.getUTCDate() - 1;              // the 1st of this month, in days ago

    if (period === "mtd") return { newest: 0, oldest: daysInto };

    if (period === "lastMonth") {
        // Day 0 of this month is the last day of the previous one, so this also
        // gets February right without a leap-year branch.
        const prevLen = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0).getDate();
        return { newest: daysInto + 1, oldest: daysInto + prevLen };
    }

    if (period === "ytd") {
        const jan1 = new Date(now.getUTCFullYear(), 0, 1);
        const days = Math.max(1, Math.floor((now.getTime() - jan1.getTime()) / DAY_MS));
        return { newest: 0, oldest: days };
    }

    const depth = { "7d": 7, "30d": 30, "3mo": 92, "6mo": 183, "1y": 365, all: MAX_DAYS }[period];
    return { newest: 0, oldest: depth === undefined ? 365 : depth };
}

// Today's balance. The one authored figure left in this file — everything else
// is derived from it and the feed.
const CURRENT_NET_WORTH = 44800;

// Non-cash accounts hold the rest. Shares are of the positive (asset) side;
// the credit card is derived from actual card spending, not a share.
const ASSET_MIX = [
    { name: "Everyday Checking", type: "Checking", share: 0.085 },
    { name: "High-Yield Savings", type: "Savings", share: 0.277 },
    { name: "Brokerage", type: "Investment", share: 0.638 },
];

// Share of the portfolio exposed to the market, which is the only part that
// should wobble day to day.
const INVESTED_SHARE = 0.638;

// Cumulative net flow: CUM_NET[d] is everything saved over the last d days —
// credits in, debits out, summed straight off the feed.
//
// The curve INTEGRATES this rather than applying an average daily rate, and the
// difference is not cosmetic. A flat rate reconciled over a year (0.5% out) but
// was 53% out over six months, because the trailing year contains a $5,400
// bonus and a seasonal spending peak that a single slope smears evenly across
// every window. Integrating the actual flow makes "what did I save over this
// period" and "how much did my net worth grow over this period" the same
// question at EVERY horizon, not just at twelve months.
const CUM_NET = (() => {
    const perDay = [];
    for (let d = 0; d <= MAX_DAYS; d++) perDay.push(0);
    for (let i = 0; i < TRANSACTIONS.length; i++) {
        const t = TRANSACTIONS[i];
        if (t.daysAgo <= MAX_DAYS) {
            perDay[t.daysAgo] += t.kind === "credit" ? t.amount : -t.amount;
        }
    }
    const cum = [];
    let running = 0;
    for (let d = 0; d <= MAX_DAYS; d++) {
        running += perDay[d];
        cum.push(running);
    }
    return cum;
})();

// Balance at the far edge of the feed, and the monthly growth rate that implies.
//
// Beyond the feed the curve COMPOUNDS backwards rather than continuing to
// subtract a flat daily amount. Extrapolating linearly is what a constant
// savings rate suggests and it is badly wrong at range: at $60/day, a query
// spanning 2024 drove the balance to MINUS $10,290, because a fixed subtraction
// eventually eats a balance that in reality was simply smaller back then.
// Compounding decays toward a small positive number instead, which is how a
// portfolio actually looks going backwards.
const EDGE_VALUE = Math.max(1000, CURRENT_NET_WORTH - CUM_NET[MAX_DAYS]);
const EDGE_MONTHS = MAX_DAYS / 30.44;
const MONTHLY_RATE = Math.pow(CURRENT_NET_WORTH / EDGE_VALUE, 1 / EDGE_MONTHS);

// Net worth `daysAgo` days before today, before market texture.
//
// Inside the feed this is exact — today's balance minus everything the feed
// says was saved since — which is what makes the savings rate and the trend
// agree. Outside it, the compounded estimate takes over, continuous at the
// boundary.
function baseValueAt(daysAgo) {
    if (daysAgo <= 0) return CURRENT_NET_WORTH;
    if (daysAgo <= MAX_DAYS) return CURRENT_NET_WORTH - CUM_NET[daysAgo];
    return EDGE_VALUE / Math.pow(MONTHLY_RATE, (daysAgo - MAX_DAYS) / 30.44);
}

// Net worth `daysAgo` days before today. Deterministic, and a pure function of
// the offset so any two ranges agree wherever they overlap.
function valueAt(daysAgo) {
    const base = baseValueAt(daysAgo);
    // Market texture on the invested slice only — a checking account should not
    // appear to wobble with the S&P. Kept modest: at a larger amplitude the
    // swing dwarfed a month's actual saving, so a good month could render as a
    // loss for no reason the data could explain.
    const swing = 0.016 * Math.sin(daysAgo / 58) + 0.009 * Math.sin(daysAgo / 19 + 2);
    const jitter = (hash(Math.floor(daysAgo / 7)) - 0.5) * 0.012;
    return Math.round((base * (1 + (swing + jitter) * INVESTED_SHARE)) / 10) * 10;
}

function toDay(date) {
    return Math.floor(date.getTime() / DAY_MS);
}

// ─── Series bucketing ────────────────────────────────────
// Net worth is a STOCK, not a flow, so a period's value is its CLOSING balance
// — the last reading inside it — never the sum of its parts. Summing a month of
// weekly balances would report roughly four times the real figure.
//
// This lives here rather than in the card because the card had no way to ask for
// a granularity: it received whatever the range implied and re-derived months by
// string-parsing labels like "Aug 10 '25" back into a month key, then appended
// zero-width spaces so colliding initials didn't merge into one bar. All of that
// was archaeology over information this function simply has.

const QUARTER = ["Q1", "Q2", "Q3", "Q4"];

// End-of-period date for the period containing `d`, clamped to `limit`.
function periodEnd(d, step, limit) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    let end;
    if (step === "year") end = new Date(Date.UTC(y, 11, 31));
    else if (step === "quarter") end = new Date(Date.UTC(y, Math.floor(m / 3) * 3 + 3, 0));
    else if (step === "month") end = new Date(Date.UTC(y, m + 1, 0));
    else end = new Date(d.getTime());
    return end > limit ? limit : end;
}

// Advance to the first day of the next period.
function nextPeriod(d, step) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (step === "day") return new Date(d.getTime() + DAY_MS);
    if (step === "week") return new Date(d.getTime() + 7 * DAY_MS);
    if (step === "month") return new Date(Date.UTC(y, m + 1, 1));
    if (step === "quarter") return new Date(Date.UTC(y, Math.floor(m / 3) * 3 + 3, 1));
    return new Date(Date.UTC(y + 1, 0, 1));
}

function fullLabel(d, step, multiYear) {
    const m = MONTHS[d.getUTCMonth()], y = d.getUTCFullYear();
    if (step === "year") return String(y);
    if (step === "quarter") return QUARTER[Math.floor(d.getUTCMonth() / 3)] + " " + y;
    if (step === "month") return multiYear ? m + " " + y : m;
    return multiYear ? m + " " + d.getUTCDate() + " '" + String(y).slice(2) : m + " " + d.getUTCDate();
}

// One point per period, carrying that period's closing balance.
//
// Each point gets `label` (sized for an axis) and `full` (the real name, for the
// scrub readout). Beyond nine month-buckets a full label truncates to "Ja…" in
// the renderer, so they collapse to initials — which makes collisions certain
// (J is January, June and July) and two bars sharing a categorical x value MERGE.
// Each repeat therefore gets a zero-width space appended: distinct strings to the
// chart's scale, identical glyphs on screen.
function bucketSeries(startDate, endDate, step, at) {
    const multiYear = startDate.getUTCFullYear() !== endDate.getUTCFullYear();
    const raw = [];
    let cursor = new Date(startDate.getTime());
    while (cursor <= endDate) {
        const close = periodEnd(cursor, step, endDate);
        raw.push({ date: close, full: fullLabel(close, step, multiYear), value: at(close) });
        cursor = nextPeriod(cursor, step);
    }
    if (!raw.length) raw.push({ date: endDate, full: fullLabel(endDate, step, multiYear), value: at(endDate) });

    const initials = step === "month" && raw.length >= 10;
    const seen = {};
    return raw.map((p) => {
        let label = initials ? p.full.charAt(0) : p.full;
        if (initials) {
            const n = seen[label] || 0;
            seen[label] = n + 1;
            for (let i = 0; i < n; i++) label += "​";
        }
        return { label, full: p.full, value: p.value };
    });
}

function parseISO(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + "T00:00:00Z");
    return isNaN(d.getTime()) ? null : d;
}

export default defineDataSource({
    metadata: {
        title: "Net Worth",
        description:
            "Net worth history plus the account balances behind it: the range-end total, the change over the range, a value series at an auto-picked granularity, and per-account balances. `income`/`spending`/`saved` break the change down for the same range — net worth here is accumulated cash flow, so `saved` accounts for essentially all of it. Answer \"what drove the change\" from that and from spending categories, never from the account balances: their shares are fixed proportions and attribute nothing. Pass a period, or startDate/endDate (YYYY-MM-DD) for an arbitrary range — dates override the period. Call this only when you need the numbers to reason with; to DISPLAY net worth, call net_worth_trend with the period instead — it loads this itself.",
    },
    properties: {
        period: {
            type: "enum",
            options: PERIOD_OPTIONS,
            defaultValue: "1y",
            description: "How far back the trend goes. Ignored when startDate/endDate are given.",
        },
        startDate: {
            type: "string",
            description: "Range start, YYYY-MM-DD. Defaults to a year before endDate.",
        },
        endDate: {
            type: "string",
            description: "Range end, YYYY-MM-DD. Defaults to today.",
        },
        groupBy: {
            type: "enum",
            options: ["auto", "day", "week", "month", "quarter", "year"],
            defaultValue: "auto",
            description: "Granularity of the returned series. Each point carries that period's CLOSING balance. 'auto' picks a readable granularity for the span; set it explicitly to compare periods against each other — 'year' over a two-year range gives one point per year, 'month' gives one per month.",
        },
        summary: {
            type: "boolean",
            defaultValue: false,
            description: "Omit the `points` series and return only the headline figures and accounts. Use this when you want the numbers to comment on rather than to chart — it is a fraction of the size of a full result.",
        },
    },
    output: {
        period: { type: "string" },
        periodLabel: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        current: { type: "number" },
        start: { type: "number" },
        change: { type: "number" },
        change_pct: { type: "number" },
        income: { type: "number" },
        spending: { type: "number" },
        saved: { type: "number" },
        groupBy: { type: "string" },
        points: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    label: { type: "string" },
                    // The period's real name. `label` is sized for an axis and
                    // may be squeezed to an initial; this is what a readout shows.
                    full: { type: "string" },
                    value: { type: "number" },
                },
            },
        },
        accounts: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    name: { type: "string" },
                    type: { type: "string" },
                    balance: { type: "number" },
                },
            },
        },
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    handler: async (props, env) => {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const period = resolvePeriod(PERIOD_LABELS[props.period] ? props.period : "1y", today);
        const todayDay = toDay(today);

        // Resolve the range. Explicit dates win; otherwise the period maps to a
        // range ending today.
        let startDate = parseISO(props.startDate);
        let endDate = parseISO(props.endDate);
        const custom = !!(startDate || endDate);
        let periodLabel;
        if (custom) {
            if (!endDate) endDate = today;
            if (!startDate) startDate = new Date(endDate.getTime() - 365 * DAY_MS);
            if (startDate > endDate) { const t = startDate; startDate = endDate; endDate = t; }
            if (toDay(endDate) === toDay(startDate)) endDate = new Date(startDate.getTime() + DAY_MS);
        } else {
            periodLabel = PERIOD_LABELS[period];
            const win = periodWindow(period, today);
            endDate = new Date(today.getTime() - win.newest * DAY_MS);
            startDate = new Date(today.getTime() - win.oldest * DAY_MS);
        }

        const startDay = toDay(startDate);
        const endDay = toDay(endDate);
        const totalDays = endDay - startDay;

        // What the change is actually made of. Net worth here is accumulated
        // cash flow — over any window the change and (income - spending) agree
        // to within a few percent, the remainder being market wobble on the
        // invested share. Returning the two sides means "why is my net worth
        // up?" can be answered from one call instead of guessed at, and it
        // points the answer at spending categories rather than at accounts,
        // whose shares are fixed proportions that explain nothing.
        const startAgo = Math.min(MAX_DAYS, Math.max(0, todayDay - startDay));
        const endAgo = Math.min(MAX_DAYS, Math.max(0, todayDay - endDay));
        let income = 0, spending = 0;
        for (let i = 0; i < TRANSACTIONS.length; i++) {
            const t = TRANSACTIONS[i];
            if (t.daysAgo < endAgo || t.daysAgo > startAgo) continue;
            if (t.kind === "credit") income += t.amount;
            else spending += t.amount;
        }
        income = round2(income);
        spending = round2(spending);
        const saved = round2(income - spending);

        // Granularity. `auto` keeps the series readable (≤ ~62 points) at any
        // span; an explicit groupBy overrides it, which is what makes
        // "compare this year to last year" answerable — that question wants two
        // bars, and auto was handing it twenty-four.
        const requested = props.groupBy && props.groupBy !== "auto" ? props.groupBy : null;
        const step = requested || (
            totalDays <= 62 ? "day"
            : totalDays <= 434 ? "week"
            : totalDays <= 1830 ? "month"
            : totalDays <= 5490 ? "quarter"
            : "year"
        );

        const at = (d) => valueAt(todayDay - toDay(d));

        // start/current/change are read straight off the range ends, NOT off the
        // bucketed series. Bucketing is presentation; if these were derived from
        // it, asking for yearly bars would silently change what "change over the
        // period" meant.
        const start = at(startDate);
        const current = at(endDate);
        const change = current - start;
        const change_pct = start ? Math.round((change / start) * 1000) / 10 : 0;

        const points = bucketSeries(startDate, endDate, step, at);

        if (custom) {
            const fmt = (d) =>
                (step === "day" || step === "week")
                    ? MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear()
                    : MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
            periodLabel = fmt(startDate) + " – " + fmt(endDate);
        }

        // Account composition as of the range end.
        //
        // The card balance is the trailing month of actual charges on it, not a
        // share of the total: the feed routes most spending to the Rewards Card,
        // so a fixed -2.83% share had it owing ~$1,270 against ~$2,000/month of
        // real charges. Assets then fill whatever the total needs to be, with
        // the remainder folded into the largest so the column sums exactly.
        const cardDebt = sumOf(inWindow(DEBITS.filter((t) => t.account === "Rewards Card"), 0, 30));
        const assetTotal = current + cardDebt;
        const accounts = ASSET_MIX.map((a) => ({
            name: a.name, type: a.type, balance: Math.round(assetTotal * a.share),
        }));
        accounts.push({ name: "Rewards Card", type: "Credit", balance: -Math.round(cardDebt) });
        const drift = current - accounts.reduce((sum, a) => sum + a.balance, 0);
        accounts[2].balance += drift;

        const iso = (d) => d.toISOString().slice(0, 10);
        return {
            period: custom ? "custom" : period,
            periodLabel,
            startDate: iso(startDate),
            endDate: iso(endDate),
            groupBy: step,
            current,
            start,
            change,
            change_pct,
            income,
            spending,
            saved,
            // `points` is the whole cost of this result — 53 of them for a year.
            // Summary mode drops it and keeps the four accounts, which is enough
            // to say something true about the number without paying for the chart.
            points: props.summary ? [] : points,
            accounts,
        };
    },
});
