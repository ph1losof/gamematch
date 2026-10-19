/** Catalog reads: an offer, its game and its goal ladder. Plain functions over `db`, like ledger.ts. */
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from './db';
import { games, goals, offers } from './schema';

export type { Game, Goal } from './schema';

export const getOffer = (db: DbOrTx, id: string) =>
  db.select().from(offers).where(eq(offers.id, id)).get();

/** The offer with its game, or undefined. One read, so callers need one guard. */
export const getOfferWithGame = (db: DbOrTx, id: string) =>
  db
    .select({ offer: offers, game: games })
    .from(offers)
    .innerJoin(games, eq(games.id, offers.gameId))
    .where(eq(offers.id, id))
    .get();

/** The offer's goals, cheapest first: the order the ladder is climbed in. */
export const getGoals = (db: DbOrTx, offerId: string) =>
  db.select().from(goals).where(eq(goals.offerId, offerId)).orderBy(asc(goals.payout)).all();
