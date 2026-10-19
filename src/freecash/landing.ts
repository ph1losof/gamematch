/**
 * What the three screens between our ad and the game show, read from the database. The HTML is
 * screens.ts's job; a loader returns null when its link names nothing, and app.ts answers 404.
 *  /l  the offer page for an ad click: the offer, its ladder, and who is looking;
 *  /s  "Opening the store…" for a start, which forwards by itself only right after Start;
 *  /p  progress: each goal's state.
 */
import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from './db';
import type { Deps } from './deps';
import { getGoals, getOfferWithGame } from './offers';
import { boostTerms, hasGoals, leadGoal } from './personalise';
import { conversions, games, links, users } from './schema';
import type { LandingView, ProgressView, VerifyingView } from './screens';
import { goalState } from './screens';
import { getStart } from './starts';

/** How long after Start the "opening the store" page forwards by itself; a later reload just shows a button. */
const AUTO_FORWARD_MS = 2 * 60_000;

export function loadLanding(
  { db, config }: Pick<Deps, 'db' | 'config'>,
  click: { id: string; offerId: string; userId: string | null },
): LandingView | null {
  const found = getOfferWithGame(db, click.offerId);
  const ladder = getGoals(db, click.offerId);
  if (!found || !hasGoals(ladder)) return null;
  const visitor = click.userId ? loadVisitor(db, click.userId) : null;
  return {
    clickId: click.id,
    offerId: found.offer.id,
    game: found.game,
    ladder,
    lead: leadGoal(ladder),
    visitor,
    // Only a known user can start, so only they see the boost.
    boost: visitor ? boostTerms(config, ladder) : null,
    boostHours: config.linkedBoost.hours,
    holdDays: config.rewardHoldDays,
  };
}

/** The user an ad click resolved to, as the page may show them: a first name and their linked games. */
function loadVisitor(db: DbOrTx, userId: string) {
  const user = db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get();
  if (!user) return null;
  const linkedGames = db
    .select({ name: games.name, genre: games.genre })
    .from(links)
    .innerJoin(games, eq(games.id, links.gameId))
    .where(eq(links.userId, userId))
    .all();
  return { firstName: user.name.split(' ')[0] ?? user.name, linkedGames };
}

export function loadVerifying(
  deps: Pick<Deps, 'db' | 'clock' | 'config'>,
  startId: string,
): VerifyingView | null {
  const start = getStart(deps, startId);
  if (!start) return null;
  return {
    startId: start.id,
    gameName: start.game.name,
    trackingUrl: start.trackingUrl,
    autoForward: deps.clock.now() - start.createdAt <= AUTO_FORWARD_MS,
  };
}

export function loadProgress(
  deps: Pick<Deps, 'db' | 'clock' | 'config'>,
  startId: string,
): ProgressView | null {
  const start = getStart(deps, startId);
  if (!start) return null;
  const { db, clock, config } = deps;
  const done = new Map(
    db
      .select()
      .from(conversions)
      .where(and(eq(conversions.userId, start.userId), eq(conversions.offerId, start.offerId)))
      .all()
      .map((c) => [c.event, c]),
  );
  return {
    gameName: start.game.name,
    installed: start.installedAt !== null,
    goals: getGoals(db, start.offerId).map((g) => {
      const c = done.get(g.event);
      return {
        label: g.label,
        reward: c?.reward ?? g.reward,
        state: goalState(g, c, start, clock.now(), config.rewardHoldDays),
      };
    }),
  };
}
