/**
 * Runs the simulated live test once (scripts/sim.ts) and prints the funnels, the experiment readout
 * per segment, value tier and platform, and the books. A mechanism check, not calibration evidence.
 *   bun run demo [--users 20000] [--seed 7] [--bid 15 | --bid value] [--ladder median | illustrative]
 * `--bid 15` is the planned test: a fixed $15 CPM. `--bid value` uses the value-based bid from config.
 */
import { parseArgs } from 'node:util';
import { getGoals } from '../src/freecash/offers';
import { marginPerInstall } from '../src/model/bidding';
import { SEGMENTS, VALUE_TIERS } from '../src/model/segments';
import { fmtUsd } from '../src/shared/money';
import { PLATFORMS } from '../src/shared/types';
import { AD_DAYS, READOUT_DAY, simulate } from './sim';

const { values } = parseArgs({
  options: {
    users: { type: 'string', default: '20000' },
    seed: { type: 'string', default: '7' },
    bid: { type: 'string', default: '15' },
    ladder: { type: 'string', default: 'median' },
  },
});

const ladder = values.ladder === 'illustrative' ? 'illustrative' : 'median';
const run = await simulate({
  users: Number(values.users),
  seed: Number(values.seed),
  bid: values.bid === 'value' ? 'value' : Number(values.bid),
  ladder,
});
const { sys, freecash, enrolled, campaigns, report: x } = run;

// ---- Readout ----
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const pp = (x: number) => (x * 100).toFixed(2);
console.log(
  `Simulated ${run.people} linked users: ${AD_DAYS} days of ads, readout at day ${READOUT_DAY} (${run.seconds.toFixed(1)}s)`,
);
console.log(
  `Enrolled: ${enrolled.treatment} treatment, ${enrolled.control} control (holdout ${sys.config.holdoutPct}%) · ` +
    SEGMENTS.map((s) => `${s} ${enrolled.bySegment[s]}`).join(', ') +
    ` · tier ${VALUE_TIERS.map((t) => `${t} ${enrolled.byTier[t]}`).join(', ')}` +
    `\nBid: ${values.bid === 'value' ? 'value-based per segment' : `fixed $${values.bid} CPM`} · Bubble Saga ladder: ${values.ladder}\n`,
);

console.log(
  'Campaigns that served (attributed, not incremental; margin per credited install of the promoted ladder in brackets)',
);
for (const c of campaigns) {
  const r = (await freecash.admin.campaigns({ id: c.id }).get()).data;
  if (!r) throw new Error(`no report for campaign ${c.id}`);
  if (!r.impressions) continue; // most tier × segment cells never win a user: Castle Siege takes them
  const ladderMargin = marginPerInstall(getGoals(sys.db, r.offerId));
  console.log(
    `  ${r.offerId.padEnd(20)} [${fmtUsd(ladderMargin)}] ${r.segment.padEnd(5)} ${r.valueTier.padEnd(8)} bid ${fmtUsd(r.bidCpm).padStart(7)} · ${String(r.impressions).padStart(6)} imp → ` +
      `${String(r.adClicks).padStart(4)} clicks (${pct(r.adClicks / Math.max(r.impressions, 1))}) → ${String(r.offerStarts).padStart(3)} starts → ` +
      `${String(r.conversions).padStart(3)} paid goals · margin ${fmtUsd(r.margin)}`,
  );
}

console.log();
for (const arm of ['treatment', 'control'] as const) {
  const a = x.arms[arm];
  console.log(
    `${arm.padEnd(9)} ${String(a.users).padStart(6)} users · started an offer ${pct(a.startRate)} · margin ${fmtUsd(a.margin)} (${fmtUsd(a.marginPerUser)}/user)`,
  );
}
const inc = x.incremental;
console.log(`
Ad spend ${fmtUsd(x.adSpend)} (${fmtUsd(inc.spendPerUser)} per treated user)
Second-offer start rate lift: ${(inc.startRateLift * 100).toFixed(2)} pp
Credited-install lift: ${pp(inc.installLift)} pp  95% CI [${pp(inc.installLiftCi95[0])}, ${pp(inc.installLiftCi95[1])}]
Incremental profit per treated user: ${fmtUsd(inc.profitPerUser)}  95% CI [${fmtUsd(inc.profitPerUserCi95[0])}, ${fmtUsd(inc.profitPerUserCi95[1])}]
Incremental ROAS: ${inc.roas === null ? 'n/a' : inc.roas.toFixed(2)}
Verdict: ${x.verdict.toUpperCase()}
`);

type Stratum = (typeof x.bySegment)[keyof typeof x.bySegment];
const line = (name: string, seg: Stratum) => {
  const [lo, hi] = seg.incremental.profitPerUserCi95;
  console.log(
    `  ${name.padEnd(8)} ${String(seg.arms.treatment.users + seg.arms.control.users).padStart(6)} users · installs ${pp(seg.incremental.installLift)} pp · ` +
      `spend ${fmtUsd(seg.adSpend)} · profit/treated user ${fmtUsd(seg.incremental.profitPerUser)} [${fmtUsd(lo)}, ${fmtUsd(hi)}] · ` +
      `iROAS ${seg.incremental.roas === null ? 'n/a' : seg.incremental.roas.toFixed(2)} → ${seg.verdict.toUpperCase()}`,
  );
};
console.log('By segment, value tier and platform (exploratory: where to look next)');
for (const s of SEGMENTS) line(s, x.bySegment[s]);
for (const t of VALUE_TIERS) line(t, x.byTier[t]);
for (const p of PLATFORMS) line(p, x.byPlatform[p]);
console.log();

const books = (await freecash.admin.balances.get()).data;
if (!books) throw new Error('no balances');
const sum = (prefix: string) =>
  Object.entries(books)
    .filter(([k]) => k.startsWith(prefix))
    .reduce((s, [, v]) => s + v, 0);
console.log('Books');
console.log(`  advertisers owe us   ${fmtUsd(sum('advertiser:'))}`);
console.log(
  `  we owe users         ${fmtUsd(-sum('user:'))} cashable + ${fmtUsd(-sum('user_pending:'))} on hold`,
);
console.log(`  we owe the network   ${fmtUsd(-sum('network:'))}`);
console.log(
  `  ledger total         ${fmtUsd(Object.values(books).reduce((s, v) => s + v, 0))} (must be $0.00)`,
);
