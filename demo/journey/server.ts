/**
 * The journey demo: `bun run journey`, then open http://localhost:3010.
 * Holds one Journey (one in-process System on a manual clock). Every action runs one at a time
 * and returns the full state, so the page just re-renders what it gets back. A step run out of
 * order is a 409 with the reason as text. The tests drive createApi() without a socket.
 */
import { Elysia, t } from 'elysia';
import index from './index.html';
import { Journey, JourneyError } from './journey';

const persona = t.Partial(
  t.Object({
    platform: t.UnionEnum(['android', 'ios']),
    linkedGame: t.UnionEnum(['kingdom-clash', 'jewel-mania']),
    segment: t.UnionEnum(['hot', 'warm', 'cold']),
    inApp: t.Boolean(),
    attInAdGame: t.Boolean(),
    attInOfferGame: t.Boolean(),
    optedOut: t.Boolean(),
    reinstall: t.Boolean(),
    competitor: t.Boolean(),
  }),
);

export async function createApi() {
  let journey: Journey = await Journey.create();

  // One action at a time: the System is a single shared world. The next action waits for this one
  // to settle either way; its error still reaches its own caller.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn);
    queue = Promise.allSettled([next]);
    return next;
  };

  return new Elysia({ prefix: '/api' })
    .onError(({ error, status }) => {
      if (error instanceof JourneyError) return status(409, error.message);
    })
    .get('/state', () => serial(() => journey.state()))
    .post(
      '/reset',
      ({ body }) =>
        serial(async () => {
          journey = await Journey.create(body);
          return journey.state();
        }),
      { body: persona },
    )
    .post('/step/1', () => serial(() => journey.openGame()))
    .post('/step/2', () => serial(() => journey.tapAd()))
    .post('/step/3', () => serial(() => journey.tapStart()))
    .post('/step/4', () => serial(() => journey.install()))
    .post('/step/5', ({ body }) => serial(() => journey.play(body.event)), {
      body: t.Object({ event: t.Optional(t.String()) }),
    })
    .post('/time', ({ body }) => serial(() => journey.advance(body.days, body.release)), {
      body: t.Object({ days: t.Number({ minimum: 0, maximum: 400 }), release: t.Boolean() }),
    })
    .post('/spend/sync', () => serial(() => journey.syncSpend()))
    .get('/progress', () =>
      serial(async () => {
        const screen = await journey.progressPage();
        return { screen, state: await journey.state() };
      }),
    );
}

if (import.meta.main) {
  const api = await createApi();
  const server = Bun.serve({
    port: Number(process.env.PORT ?? 3010),
    development: process.env.NODE_ENV !== 'production',
    routes: {
      '/': index,
      '/api/*': (req) => api.handle(req),
    },
  });
  console.log(`GameMatch journey demo: ${server.url}`);
}
