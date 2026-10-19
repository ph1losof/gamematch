/**
 * Does the decision rule keep its promise? Runs the simulated test (scripts/sim.ts) in the no-effect
 * world, where no ad runs and both arms behave the same, over many seeds, and counts the verdicts.
 * True incremental profit is exactly zero there, so a "continue" is a false one. The 95% two-sided
 * CI puts 2.5% in each tail, so the false-continue rate should come out near or below 2.5%; much
 * more would mean the normal approximation is too optimistic for this heavy-tailed margin.
 * "insufficient" counts as no decision, which is what the data floor (src/model/readout.ts) is for.
 * About half a second per seed at the default 10,000 users (3,600 enrolled, ~750 in control).
 *   bun run calibrate [--seeds 100] [--users 10000]
 */
import { parseArgs } from 'node:util';
import type { Verdict } from '../src/model/readout';
import { simulate } from './sim';

export async function calibrate({ seeds, users }: { seeds: number; users: number }) {
  const verdicts: Record<Verdict, number> = {
    continue: 0,
    stop: 0,
    inconclusive: 0,
    insufficient: 0,
  };
  for (let seed = 1; seed <= seeds; seed++) {
    const { report } = await simulate({ users, seed, bid: 15, ladder: 'median', noEffect: true });
    verdicts[report.verdict]++;
  }
  return { seeds, users, verdicts, falseContinueRate: verdicts.continue / seeds };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      seeds: { type: 'string', default: '100' },
      users: { type: 'string', default: '10000' },
    },
  });
  const t0 = performance.now();
  const r = await calibrate({ seeds: Number(values.seeds), users: Number(values.users) });
  const share = (n: number) => `${n} (${((100 * n) / r.seeds).toFixed(1)}%)`;
  console.log(
    `No-effect world: ${r.seeds} seeds × ${r.users} users, no ads, readout at day 90 (${((performance.now() - t0) / 1000).toFixed(1)}s)`,
  );
  for (const [v, n] of Object.entries(r.verdicts)) console.log(`  ${v.padEnd(12)} ${share(n)}`);
  console.log(
    `False-continue rate: ${(100 * r.falseContinueRate).toFixed(1)}% (the rule's nominal one-sided error is 2.5%)`,
  );
}
