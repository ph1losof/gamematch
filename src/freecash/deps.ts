/**
 * Everything Freecash's use cases run on: the database, time, settings and the two ports. Only
 * app.ts and system.ts see all of it; each use case takes the `Pick<Deps, …>` it uses.
 */
import type { Clock } from '../shared/clock';
import type { AdNetwork } from './adnetwork';
import type { AttributionTool } from './attribution';
import type { Config } from './config';
import type { Db } from './db';

export type Deps = {
  db: Db;
  clock: Clock;
  config: Config;
  adNetwork: AdNetwork;
  attribution: AttributionTool;
};
