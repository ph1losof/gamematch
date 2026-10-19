/**
 * Freecash's HTTP surface for GameMatch. Public: the ad click, the three user screens, the offer
 * start and the MMP postback. Admin (unauthenticated in this MVP): experiment, campaigns,
 * audiences, spend, rewards, balances. This file validates input and maps results to HTTP; every
 * decision is made in the module it calls.
 *
 * Error rule: a domain function returns null when the one thing it looks up doesn't exist,
 * `{ kind: 'refused', reason }` when it refuses (or must say which of several things is wrong,
 * like launchCampaign), and throws only for broken invariants or a failing integration. This
 * file maps them to 4xx.
 */
import { Elysia, t } from 'elysia';
import { SEGMENTS, VALUE_TIERS } from '../model/segments';
import { syncAudiences } from './audiences';
import { campaignReport, type LaunchRefusal, launchCampaign, pauseCampaign } from './campaigns';
import { getAdClick, recordAdClick } from './clicks';
import type { Deps } from './deps';
import { enroll } from './enrollment';
import { experimentReport } from './experiment-report';
import { html } from './html';
import { loadLanding, loadProgress, loadVerifying } from './landing';
import { balances } from './ledger';
import { handlePostback } from './postbacks';
import { releaseRewards, reverseConversion } from './rewards';
import { landingPage, progressPage, verifyingPage } from './screens';
import { syncSpend } from './spend';
import { startDirect, startFromLanding, startOffer } from './starts';

const invalidLink = () => html('<p>This offer link is no longer valid.</p>', 404);
const LAUNCH_STATUS = {
  unknown_offer: 404,
  platform_disabled: 409,
  no_goals: 409,
  already_launched: 409,
} as const satisfies Record<LaunchRefusal, 404 | 409>;

export function createFreecash(deps: Deps) {
  return (
    new Elysia({ name: 'freecash' })
      // The deep link behind Freecash's re-engagement link (the network fills ifa/imp/pub from its
      // macros). A universal link: the app opens it when installed, sending the user's session; the
      // browser opens it when not. The direct path needs a known user; anyone else gets the page.
      .get(
        '/go/:campaignId',
        async ({ params, query, headers, redirect }) => {
          const click = recordAdClick(deps, params.campaignId, query, headers['x-user-id']);
          if (!click) return invalidLink();
          if (deps.config.clickPath === 'direct' && click.userId) {
            const start = await startDirect(deps, { ...click, userId: click.userId });
            return redirect(start.trackingUrl, 302);
          }
          return redirect(`/l/${click.id}`, 302);
        },
        {
          query: t.Object({
            ifa: t.Optional(t.String()),
            imp: t.Optional(t.String()),
            pub: t.Optional(t.String()),
          }),
          headers: t.Object({ 'x-user-id': t.Optional(t.String()) }),
        },
      )
      .get('/l/:adClickId', ({ params }) => {
        const click = getAdClick(deps.db, params.adClickId);
        const view = click && loadLanding(deps, click);
        return view ? landingPage(view) : invalidLink();
      })
      // A form POST, so link scanners and prefetchers can't start offers (and fire MMP clicks) on their own.
      // On the web it needs no login: the ad ID picked the user, and clicks.ts says why that's bounded for the MVP.
      .post('/l/:adClickId/start', async ({ params, redirect }) => {
        const click = getAdClick(deps.db, params.adClickId);
        if (!click) return invalidLink();
        if (!click.userId) return html('<p>Open Freecash and log in to start this offer.</p>', 403);
        const start = await startFromLanding(deps, { ...click, userId: click.userId });
        return redirect(`/s/${start.id}`, 303);
      })
      // "Opening the store…", then on to the advertiser's tracking link. The start ID is the bearer token.
      .get('/s/:startId', ({ params }) => {
        const view = loadVerifying(deps, params.startId);
        return view ? verifyingPage(view) : invalidLink();
      })
      .get('/p/:startId', ({ params }) => {
        const view = loadProgress(deps, params.startId);
        return view ? progressPage(view) : invalidLink();
      })
      // Today's offerwall start, kept here so the control arm's organic conversions flow through the same books.
      // `x-user-id` stands in for the logged-in session.
      .post(
        '/offers/:offerId/start',
        ({ params, headers, redirect, status }) => {
          const start = startOffer(deps, {
            userId: headers['x-user-id'],
            offerId: params.offerId,
            channel: 'offerwall',
          });
          return start ? redirect(start.trackingUrl, 303) : status(404, 'unknown offer or user');
        },
        { headers: t.Object({ 'x-user-id': t.String() }) },
      )
      .get(
        '/postbacks/:advertiserId',
        ({ params, query, status }) => {
          const outcome = handlePostback(deps, params.advertiserId, query);
          return outcome === 'unauthorized' ? status(401, 'unauthorized') : { outcome };
        },
        {
          query: t.Object({
            secret: t.String(),
            click_id: t.String(),
            event: t.String(),
            event_time: t.Numeric({ minimum: 0, multipleOf: 1 }),
            install_time: t.Optional(t.Numeric({ minimum: 0, multipleOf: 1 })),
            event_id: t.Optional(t.String()),
            device_id: t.Optional(t.String()),
            is_rejected: t.Optional(t.String()),
            rejection_reason: t.Optional(t.String()),
          }),
        },
      )
      .group('/admin', (admin) =>
        admin
          .post('/experiment/enroll', () => enroll(deps))
          .get('/experiment', () => experimentReport(deps.db))
          .post(
            '/campaigns',
            async ({ body, status }) => {
              const r = await launchCampaign(deps, body.offerId, body.segment, body.valueTier);
              return r.kind === 'refused' ? status(LAUNCH_STATUS[r.reason], r.reason) : r.campaign;
            },
            {
              body: t.Object({
                offerId: t.String(),
                segment: t.UnionEnum(SEGMENTS),
                valueTier: t.UnionEnum(VALUE_TIERS),
              }),
            },
          )
          .get(
            '/campaigns/:id',
            async ({ params, status }) =>
              (await campaignReport(deps, params.id)) ?? status(404, 'unknown campaign'),
          )
          // The stop button: delivery ends at the network; syncSpend also pauses everything at the test budget.
          .post(
            '/campaigns/:id/pause',
            async ({ params, status }) =>
              (await pauseCampaign(deps, params.id)) ?? status(404, 'unknown campaign'),
          )
          .post('/audiences/refresh', () => syncAudiences(deps))
          .post('/spend/sync', () => syncSpend(deps))
          .post('/rewards/release', () => releaseRewards(deps))
          .post('/conversions/:id/reverse', ({ params, status }) => {
            const r = reverseConversion(deps, params.id);
            if (r === null) return status(404, 'unknown conversion');
            return r.kind === 'refused' ? status(409, r.reason) : r.conversion;
          })
          .get('/balances', () => balances(deps.db)),
      )
  );
}

export type FreecashApp = ReturnType<typeof createFreecash>;
