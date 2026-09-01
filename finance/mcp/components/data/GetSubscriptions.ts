// get_subscriptions — data tool (Banking Assistant slice).
//
// Recurring-charge DETECTION over the shared transaction feed: finds merchants
// billing on a regular cadence, then derives each one's amount, cadence, next
// charge, normalized monthly cost, price history and lifecycle.
//
// This used to be a hand-written list, which made the demo's most impressive
// card its least trustworthy. Planet Fitness ($49/mo) was its top row and had
// zero transactions in the feed, so tapping "Charge history" returned nothing.
// ClassPass — charged $52 every 30.44 days with no variance, a textbook
// subscription — wasn't listed at all. The is_new flags were backwards: NYT had
// run the full 380 days and was flagged new, Disney+ started 80 days ago and
// wasn't. Netflix's price rise was recorded as 12% where the feed stepped
// 19.99 -> 22.99, which is 15%.
//
// Every one of those is now read off the rows, so the card cannot disagree with
// the transaction list beneath it, and "we detected these" is literally true.

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

// Detection thresholds.
const MIN_MONTHLY_CHARGES = 3;  // two points is a coincidence, three is a cadence
// A 380-day feed can only ever evidence two yearly charges, so requiring three
// would make an annual membership undetectable by construction.
const MIN_YEARLY_CHARGES = 2;
const MAX_INTERVAL_CV = 0.25;   // how irregular the spacing may be
const MAX_AMOUNT_CV = 0.12;     // how much the price may wobble
// First charge this recent = "new". 150 days covers both subscriptions the feed
// starts partway through (ChatGPT Plus at 130 days, Disney+ at 80).
const NEW_WITHIN_DAYS = 150;
const LAPSED_MULTIPLIER = 1.8;  // no charge for this many cadences = cancelled

// A genuine repricing is a step between two stable levels, not drift or noise.
const STEP_MIN_PCT = 0.03;      // smaller than this isn't worth flagging
const STEP_MAX_LEVEL_CV = 0.02; // each level must be essentially flat

// Rent is recurring, but nobody wants their mortgage listed as a subscription,
// and the electricity bill under a heading that says "Subscriptions" reads as a
// bug rather than a feature. Streaming, the gym and a yearly membership are
// what the card is for.
const EXCLUDED_CATEGORIES = ["Housing", "Income", "Utilities"];

// Display category per merchant, for the card's colour coding. The feed's own
// categories are coarser than the card wants ("Subscriptions" covers both
// Netflix and the NYT), so this refines rather than replaces them.
const DISPLAY_CATEGORY = {
    "Netflix": "Entertainment", "Disney+": "Entertainment", "Hulu": "Entertainment",
    "Spotify": "Entertainment", "Steam": "Entertainment",
    "The New York Times": "News",
    "ChatGPT Plus": "Productivity",
    "iCloud+": "Utilities", "Comcast": "Utilities", "AT&T": "Utilities", "PNM Electric": "Utilities",
    "ClassPass": "Health",
    "Amazon Prime": "Shopping",
};

const MONTH_DAYS = 30.44;

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

// Coefficient of variation — spread relative to size, so one threshold works
// for a $2.99 subscription and a $139 one alike.
function cv(xs) {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    if (!m) return 0;
    const variance = mean(xs.map((x) => (x - m) * (x - m)));
    return Math.sqrt(variance) / Math.abs(m);
}

// Group the feed by merchant, newest charge first within each.
function chargesByMerchant(rows) {
    const by = {};
    for (let i = 0; i < rows.length; i++) {
        const t = rows[i];
        if (EXCLUDED_CATEGORIES.indexOf(t.category) >= 0) continue;
        if (t.amount <= 0) continue;   // refunds are not subscriptions
        if (!by[t.merchant]) by[t.merchant] = [];
        by[t.merchant].push(t);
    }
    for (const name of Object.keys(by)) by[name].sort((a, b) => a.daysAgo - b.daysAgo);
    return by;
}

// Turn a merchant's charge history into a subscription, or null if it isn't one.
function detect(name, charges, now) {
    if (charges.length < MIN_YEARLY_CHARGES) return null;

    const gaps = [];
    for (let i = 1; i < charges.length; i++) gaps.push(charges[i].daysAgo - charges[i - 1].daysAgo);
    const amounts = charges.map((c) => c.amount);

    // A subscription bills on a rhythm, for a stable price. Groceries fail the
    // amount test, restaurants fail both.
    if (cv(gaps) > MAX_INTERVAL_CV) return null;
    if (cv(amounts) > MAX_AMOUNT_CV) return null;

    const interval = mean(gaps);
    const yearly = interval > 200;
    const monthly = interval >= 25 && interval <= 35;
    if (!yearly && !monthly) return null;
    if (monthly && charges.length < MIN_MONTHLY_CHARGES) return null;

    const newest = charges[0];
    const oldest = charges[charges.length - 1];

    // Cancelled = nothing has arrived for well over a cadence. Detected from
    // the gap, not from a flag someone remembered to set.
    const lapsed = newest.daysAgo > interval * LAPSED_MULTIPLIER;

    // Next charge = last charge plus one cadence, rolled forward if that has
    // already passed. Cancelled subscriptions have no next charge; empty string
    // (not null) because the UI card's schema types it as a string.
    let next_charge = "";
    if (!lapsed) {
        let ahead = interval - newest.daysAgo;
        while (ahead < 0) ahead += interval;
        const d = new Date(now.getTime() + ahead * DAY_MS);
        next_charge = MONTHS[d.getMonth()] + " " + d.getDate();
    }

    // Price change, reported ONLY for a genuine step between two stable levels.
    //
    // Comparing the newest charge against the oldest looked right and wasn't: a
    // utility bill that varies ±25% run through it reported "PNM Electric +11.7%"
    // off nothing but noise, which is exactly the sort of invented number this
    // rewrite exists to remove. Requiring the recent charges to be flat AND the
    // old charges to be flat AND the two levels to differ means only a real
    // repricing (Netflix 19.99 -> 22.99) is flagged.
    let price_change_pct = 0;
    const recent = charges.slice(0, 3).map((c) => c.amount);
    const earlier = charges.slice(-3).map((c) => c.amount);
    if (charges.length >= 4 && cv(recent) < STEP_MAX_LEVEL_CV && cv(earlier) < STEP_MAX_LEVEL_CV) {
        const a = mean(recent), b = mean(earlier);
        if (b > 0 && Math.abs(a - b) / b >= STEP_MIN_PCT) {
            price_change_pct = Math.round(((a - b) / b) * 1000) / 10;
        }
    }

    const amount = newest.amount;
    return {
        name,
        amount,
        cadence: yearly ? "yearly" : "monthly",
        monthly_equiv: round2(yearly ? amount / 12 : amount),
        next_charge,
        category: DISPLAY_CATEGORY[name] || newest.category,
        status: lapsed ? "cancelled" : "active",
        // "New" means the history starts recently AND the feed goes back far
        // enough to know that — otherwise every merchant looks new on a short feed.
        is_new: !lapsed && oldest.daysAgo < NEW_WITHIN_DAYS && MAX_DAYS > NEW_WITHIN_DAYS + 30,
        price_change_pct,
    };
}

export default defineDataSource({
    metadata: {
        title: "Subscriptions",
        description:
            "Recurring charges detected in the transaction feed: each subscription's amount, cadence, next charge date, normalized monthly cost, and flags for newly added subscriptions and recent price increases, plus the total monthly spend. Status 'active' (default) lists current subscriptions; 'all' also includes recently cancelled ones. Call this only when you need the numbers to reason with; to DISPLAY subscriptions, call the subscriptions card instead — it loads this itself.",
    },
    properties: {
        status: {
            type: "enum",
            options: ["active", "all"],
            defaultValue: "active",
            description: "Which subscriptions to include.",
        },
    },
    output: {
        count: { type: "integer" },
        new_count: { type: "integer" },
        total_monthly: { type: "number" },
        subscriptions: {
            type: "array",
            valueType: {
                type: "group",
                properties: {
                    name: { type: "string" },
                    amount: { type: "number" },
                    cadence: { type: "string" },
                    monthly_equiv: { type: "number" },
                    next_charge: { type: "string" },
                    category: { type: "string" },
                    status: { type: "string" },
                    is_new: { type: "boolean" },
                    price_change_pct: { type: "number" },
                },
            },
        },
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    handler: async (props, env) => {
        const now = new Date();
        const byMerchant = chargesByMerchant(TRANSACTIONS);

        const detected = [];
        for (const name of Object.keys(byMerchant)) {
            const sub = detect(name, byMerchant[name], now);
            if (sub) detected.push(sub);
        }

        const included = props.status === "all"
            ? detected
            : detected.filter((s) => s.status === "active");
        included.sort((a, b) => b.monthly_equiv - a.monthly_equiv);

        // The headline total is what the user is actually paying — active only,
        // regardless of whether cancelled rows are being shown.
        const total_monthly = round2(
            included.filter((s) => s.status === "active").reduce((sum, s) => sum + s.monthly_equiv, 0)
        );

        return {
            count: included.length,
            new_count: included.filter((s) => s.is_new).length,
            total_monthly,
            subscriptions: included,
        };
    },
});
