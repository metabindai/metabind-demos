// Reconciliation check for the Vault demo data.
//
//   node scripts/reconcile.mjs
//
// Every card in this app reads the same feed, so any two cards showing the same
// figure must agree. That was not true before: the spending card claimed 34
// dining purchases where the transaction list held 25, named top merchants the
// feed didn't have, and reported a year of saving that the net-worth curve
// contradicted by 2.4x. Those were all findable by opening two cards side by
// side, which is exactly what someone evaluating a finance demo does.
//
// This asserts the invariants that make that impossible. Run it after touching
// scripts/shared-feed.js or any data component.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The components are BindJS, not modules — strip the one wrapper call so they
// import as plain ESM with the handler exposed.
const stage = mkdtempSync(join(tmpdir(), "vault-reconcile-"));
async function load(name) {
    const src = readFileSync(join(ROOT, `components/data/${name}.ts`), "utf8")
        .replace(/^export default defineDataSource\(/m, "export default (");
    const path = join(stage, `${name}.mjs`);
    writeFileSync(path, src);
    return (await import(path)).default;
}

const TX = await load("GetTransactions");
const SP = await load("GetSpendingBreakdown");
const SU = await load("GetSubscriptions");
const NW = await load("GetNetWorth");

let failures = 0;
const money = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

function check(label, ok, detail) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
    if (!ok) failures++;
}

// ── 1. Every category total on the spending card matches the transaction list.
console.log("\nSpending card vs transaction list");
for (const period of ["mtd", "3mo", "1y"]) {
    const sp = await SP.handler({ period });
    let worst = 0, worstName = "";
    for (const g of sp.groups) {
        const tx = await TX.handler({ category: g.name, period, limit: 0 });
        const d = Math.abs(g.amount - tx.total_spent);
        if (d > worst) { worst = d; worstName = g.name; }
        if (g.transaction_count !== tx.count) {
            check(`${period} ${g.name} count`, false, `card ${g.transaction_count} vs feed ${tx.count}`);
        }
    }
    const all = await TX.handler({ period, limit: 0 });
    check(`${period} — all categories reconcile`, worst < 0.02,
        worst < 0.02 ? `total ${money(sp.total_spend)}` : `worst drift ${money(worst)} on ${worstName}`);
    check(`${period} — grand total matches`, Math.abs(sp.total_spend - all.total_spent) < 0.02,
        `${money(sp.total_spend)} vs ${money(all.total_spent)}`);
}

// ── 2. Top merchants are the feed's actual top merchants.
console.log("\nTop merchants are real");
{
    const sp = await SP.handler({ period: "mtd" });
    for (const g of sp.groups.slice(0, 4)) {
        const tx = await TX.handler({ category: g.name, period: "mtd", limit: 200 });
        const totals = {};
        for (const t of tx.transactions) totals[t.merchant] = (totals[t.merchant] || 0) + t.amount;
        const actual = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([n]) => n);
        const claimed = g.top_merchants.map((x) => x.name);
        const ok = claimed.every((n, i) => n === actual[i]);
        check(`${g.name} top merchants`, ok, ok ? claimed.join(", ") : `claims ${claimed} but feed says ${actual.slice(0, 3)}`);
    }
}

// ── 3. Every detected subscription has real transactions behind it.
console.log("\nSubscriptions are detected, not authored");
{
    const su = await SU.handler({ status: "all" });
    for (const s of su.subscriptions) {
        const tx = await TX.handler({ merchant: s.name, period: "all", limit: 0 });
        check(`${s.name} has charges`, tx.count > 0, `${tx.count} in the feed`);
    }
    const active = await SU.handler({ status: "active" });
    check("cancelled rows excluded from active", active.subscriptions.every((s) => s.status === "active"));
    check("a cancellation is detected", su.subscriptions.some((s) => s.status === "cancelled"));
    check("a price rise is detected", su.subscriptions.some((s) => s.price_change_pct > 0));
    check("new subscriptions are detected", active.new_count > 0, `${active.new_count} new`);
}

// ── 4. Saving and net-worth growth tell the same story at every horizon.
console.log("\nSavings rate vs net-worth growth");
for (const period of ["mtd", "3mo", "6mo", "1y"]) {
    const sp = await SP.handler({ period });
    const nw = await NW.handler({ period });
    const saved = sp.total_income - sp.total_spend;
    const grew = nw.change;
    const gap = Math.abs(saved - grew) / Math.max(Math.abs(saved), 1) * 100;
    // Market movement on the invested share is a real reason for these to
    // differ, so this is a sanity bound, not an equality.
    check(`${period} within 15%`, gap < 15,
        `saved ${money(saved)}, grew ${money(grew)} (${gap.toFixed(1)}% apart)`);
}

// ── 5. Accounts sum to the reported net worth.
console.log("\nAccount composition");
{
    const nw = await NW.handler({ period: "1y" });
    const sum = nw.accounts.reduce((s, a) => s + a.balance, 0);
    check("accounts sum to net worth", Math.abs(sum - nw.current) < 1, `${money(sum)} vs ${money(nw.current)}`);
    const card = nw.accounts.find((a) => a.type === "Credit");
    const tx = await TX.handler({ period: "30d", limit: 200 });
    const spent = tx.transactions.filter((t) => t.account === "Rewards Card").reduce((s, t) => s + t.amount, 0);
    check("card balance is real card spending", Math.abs(-card.balance - spent) < 2,
        `${money(card.balance)} vs ${money(-spent)} charged`);
}

// ── 6. Income is in the ledger but never nets off a spending total.
console.log("\nIncome");
{
    const inc = await TX.handler({ category: "income", period: "mtd", limit: 20 });
    check("payroll appears in the feed", inc.count > 0, `${inc.count} deposits, ${money(inc.total_spent)}`);
    const spend = await TX.handler({ period: "mtd", limit: 200 });
    check("spending excludes credits", spend.transactions.every((t) => t.category !== "Income"));
}

// ── 7. Every period resolves on every tool.
console.log("\nPeriod vocabulary");
{
    const PERIODS = ["7d", "30d", "mtd", "3mo", "6mo", "ytd", "1y", "all"];
    let ok = true;
    for (const p of PERIODS) {
        const r = await Promise.all([
            TX.handler({ period: p, limit: 0 }), SP.handler({ period: p }), NW.handler({ period: p }),
        ]);
        if (!r[0].periodLabel || !r[1].groups.length || !r[2].points.length) ok = false;
    }
    check("all 8 periods resolve on all 3 windowed tools", ok);
}

// ── 8. The shared feed block has not drifted between components.
console.log("\nShared feed integrity");
try {
    execFileSync("node", [join(ROOT, "scripts/sync-shared-feed.mjs"), "--check"], { stdio: "pipe" });
    check("all copies identical", true);
} catch {
    check("all copies identical", false, "run: node scripts/sync-shared-feed.mjs");
}

console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
