// Inject scripts/shared-feed.js into every component that needs the feed, and
// verify the copies never drift.
//
//   node scripts/sync-shared-feed.mjs           # write the block into each component
//   node scripts/sync-shared-feed.mjs --check   # exit 1 if any copy differs
//
// BindJS components deploy independently and the flat-file tree has no shared
// library directory, so there is no import to reach for. Three verbatim copies
// under a checksum is the honest version of that: the duplication is real, but
// drift is mechanically impossible as long as --check runs before a push.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BEGIN = "// ═══ BEGIN SHARED FEED — generated, do not edit here ═══";
const END = "// ═══ END SHARED FEED ═══";

const TARGETS = [
    "components/data/GetTransactions.ts",
    "components/data/GetSpendingBreakdown.ts",
    "components/data/GetSubscriptions.ts",
    "components/data/GetNetWorth.ts",
];

const block = readFileSync(join(ROOT, "scripts/shared-feed.js"), "utf8").trimEnd();
const payload = `${BEGIN}\n${block}\n${END}`;
const digest = createHash("sha256").update(payload).digest("hex").slice(0, 12);

const check = process.argv.includes("--check");
let failed = 0;

for (const rel of TARGETS) {
    const path = join(ROOT, rel);
    const src = readFileSync(path, "utf8");

    const start = src.indexOf(BEGIN);
    const stop = src.indexOf(END);
    if (start < 0 || stop < 0) {
        console.error(`MISSING  ${rel} — no shared-feed markers`);
        failed++;
        continue;
    }

    const current = src.slice(start, stop + END.length);
    if (current === payload) {
        console.log(`ok       ${rel}`);
        continue;
    }

    if (check) {
        console.error(`DRIFTED  ${rel} — run: node scripts/sync-shared-feed.mjs`);
        failed++;
        continue;
    }

    writeFileSync(path, src.slice(0, start) + payload + src.slice(stop + END.length));
    console.log(`written  ${rel}`);
}

console.log(`\nshared-feed ${digest} → ${TARGETS.length} components`);
if (failed) {
    console.error(`${failed} file(s) out of sync.`);
    process.exit(1);
}
