/**
 * ROI model. Uses the same functions as the live bidder (src/model/bidding.ts). The main lines leave
 * out the landing page's linked-player boost, as the dashboard does; the last line per platform is
 * what the live bidder bids on the landing path, with the boost's expected cost priced in.
 *   bun run roi                         # defaults from config + seed offer
 *   bun run roi --ctr 0.03 --cpm 12     # override any funnel input; --cpm adds a profit line at that price
 *   bun run roi --followon 15           # add $15 of later-offer margin per activated user
 *   bun run roi --eligibility 1         # every user may take the offer (default: 65%, "new players only")
 */
import { parseArgs } from 'node:util';
import { defaultConfig } from '../src/freecash/config';
import { biddingLadder } from '../src/freecash/personalise';
import { breakEvenCtr, marginPerInstall, maxCpm, valuePerImpression } from '../src/model/bidding';
import type { Funnel } from '../src/model/funnel';
import { GOALS } from '../src/model/goals';
import { OFFER_GAME } from '../src/seed';
import { fmtUsd, usd } from '../src/shared/money';
import { PLATFORMS } from '../src/shared/types';

const { values } = parseArgs({
  options: {
    ctr: { type: 'string' },
    start: { type: 'string' },
    install: { type: 'string' },
    attributed: { type: 'string' },
    eligibility: { type: 'string' },
    incrementality: { type: 'string' },
    followon: { type: 'string' },
    margin: { type: 'string' },
    cpm: { type: 'string' },
  },
});
const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
const config = defaultConfig('');
const targetMargin = num(values.margin) ?? config.targetMargin;
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

console.log(
  `Offer: ${OFFER_GAME.name}. Margin per credited install: ${fmtUsd(marginPerInstall(GOALS))}`,
);
const boosted = biddingLadder(config, GOALS);
console.log(
  `With the landing page's linked-player boost priced in: ${fmtUsd(marginPerInstall(boosted))}`,
);
for (const g of GOALS)
  console.log(
    `  ${g.label.padEnd(26)} pays ${fmtUsd(g.payout)}, user gets ${fmtUsd(g.reward)}, reached by ${pct(g.completionRate)} of installers`,
  );

for (const platform of PLATFORMS) {
  const base = config.funnel[platform];
  const f: Funnel = {
    ctr: num(values.ctr) ?? base.ctr,
    startRate: num(values.start) ?? base.startRate,
    installRate: num(values.install) ?? base.installRate,
    attributedRate: num(values.attributed) ?? base.attributedRate,
    eligibility: num(values.eligibility) ?? base.eligibility,
    incrementality: num(values.incrementality) ?? base.incrementality,
    marginMultiplier: base.marginMultiplier,
    followOnValue:
      values.followon === undefined ? base.followOnValue : usd(Number(values.followon)),
  };
  const per1000 = 1000 * valuePerImpression(f, GOALS);
  const installs =
    1000 *
    f.ctr *
    f.startRate *
    f.installRate *
    f.attributedRate *
    f.eligibility *
    f.incrementality;
  console.log(`
${platform.toUpperCase()}  ctr ${pct(f.ctr)} · start ${pct(f.startRate)} · install ${pct(f.installRate)} · credited ${pct(f.attributedRate)} · eligible ${pct(f.eligibility)} · incremental ${pct(f.incrementality)} · follow-on ${fmtUsd(f.followOnValue)}
  incremental paid installs per 1000 impressions:     ${installs.toFixed(2)}
  value of 1000 impressions:                          ${fmtUsd(per1000)}
  max bid (keeping ${pct(targetMargin)}):                       ${fmtUsd(maxCpm(f, GOALS, targetMargin))} CPM`);
  console.log(
    `  max bid with the boost priced (live bidder):        ${fmtUsd(maxCpm(f, boosted, targetMargin))} CPM`,
  );
  console.log(
    '  break-even CTR at CPM:  ' +
      [2, 5, 10, 15, 20, 30]
        .map((c) => `$${c} → ${pct(breakEvenCtr(usd(c), f, GOALS))}`)
        .join('   '),
  );
  const cpm = num(values.cpm);
  if (cpm !== undefined)
    console.log(`  at $${cpm} CPM: profit per 1000 impressions ${fmtUsd(per1000 - usd(cpm))}`);
}
