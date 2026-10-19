/**
 * Mock ad network (stands in for Moloco / Google / Liftoff). It holds device-ID audiences, runs a
 * first-price auction per ad request, charges the winner per impression and fills the click URL
 * macros. It stops serving a campaign that is paused or whose next impression would pass its
 * lifetime budget. Like the real ones, it reports spend as daily rows that can still change after the day
 * closes (invalid-traffic credits), and it takes conversion postbacks from the advertiser's MMP to
 * optimise on. `/v1` is the API Freecash calls; `/sim` is what the publisher game's ad SDK, the
 * user's tap and the network's own back office would trigger.
 */
import { treaty } from '@elysiajs/eden';
import { Elysia, t } from 'elysia';
import type { AdNetwork, DayRow } from '../freecash/adnetwork';
import { normalizeAdId } from '../shared/adid';
import { type Clock, DAY } from '../shared/clock';
import type { Micros } from '../shared/money';
import type { Creative } from '../shared/types';
import { fillTemplate, newId } from '../shared/util';

type Campaign = {
  id: string;
  name: string;
  audienceId: string;
  bidCpm: Micros;
  totalBudget: Micros;
  paused: boolean;
  frequencyCapPerDay: number;
  clickUrl: string;
  creative: Creative;
  days: Map<string, DayRow>; // by YYYY-MM-DD
  conversions: Record<string, number>; // by event, from MMP postbacks
};

type Impression = { id: string; campaign: Campaign; deviceId: string; publisherApp: string };

/** This network's media-source name: what Freecash's MMP and ledger know it by. */
export const MOCK_NETWORK_NAME = 'mocknet';
/** The click-URL macros /sim/click fills, by what they carry. Real networks each spell their own. */
const MACROS = {
  deviceId: 'IFA',
  clickId: 'CLICK_ID',
  impressionId: 'IMPRESSION_ID',
  publisherApp: 'PUBLISHER_APP',
} as const;

const CreativeSchema = t.Object({ headline: t.String(), body: t.String(), cta: t.String() });
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function createAdNetwork({ clock }: { clock: Clock }) {
  const audiences = new Map<string, Set<string>>();
  const campaigns = new Map<string, Campaign>();
  const impressions = new Map<string, Impression>();
  const seenToday = new Map<string, number>(); // `${campaign}:${device}:${day}` -> impressions

  const toSet = (ids: string[]) => new Set(ids.flatMap((id) => normalizeAdId(id) ?? []));
  const today = (c: Campaign) => {
    const date = dateOf(clock.now());
    const row = c.days.get(date) ?? { date, impressions: 0, clicks: 0, spend: 0 };
    c.days.set(date, row);
    return row;
  };
  const spent = (c: Campaign) => [...c.days.values()].reduce((s, d) => s + d.spend, 0);
  const capKey = (c: Campaign, device: string) =>
    `${c.id}:${device}:${Math.floor(clock.now() / DAY)}`;
  /** Live, under its budget and daily cap for this device, targeting it, and bidding at least the floor. */
  const canServe = (c: Campaign, device: string, floorCpm: Micros) =>
    !c.paused &&
    spent(c) + c.bidCpm / 1000 <= c.totalBudget &&
    audiences.get(c.audienceId)?.has(device) === true &&
    (seenToday.get(capKey(c, device)) ?? 0) < c.frequencyCapPerDay &&
    c.bidCpm >= floorCpm;

  return (
    new Elysia({ name: 'adnetwork' })
      .post(
        '/v1/audiences',
        ({ body }) => {
          const id = newId('aud');
          const members = toSet(body.deviceIds);
          audiences.set(id, members);
          return { id, size: members.size };
        },
        { body: t.Object({ name: t.String(), deviceIds: t.Array(t.String()) }) },
      )
      .put(
        '/v1/audiences/:id',
        ({ params, body, status }) => {
          if (!audiences.has(params.id)) return status(404, 'unknown audience');
          const members = toSet(body.deviceIds);
          audiences.set(params.id, members);
          return { id: params.id, size: members.size };
        },
        { body: t.Object({ deviceIds: t.Array(t.String()) }) },
      )
      .post(
        '/v1/campaigns',
        ({ body, status }) => {
          if (!audiences.has(body.audienceId)) return status(400, 'unknown audience');
          const id = newId('ncmp');
          campaigns.set(id, { ...body, id, paused: false, days: new Map(), conversions: {} });
          return { id };
        },
        {
          body: t.Object({
            name: t.String(),
            audienceId: t.String(),
            bidCpm: t.Integer({ minimum: 0, multipleOf: 1000 }),
            totalBudget: t.Integer({ minimum: 0 }),
            frequencyCapPerDay: t.Integer({ minimum: 1 }),
            clickUrl: t.String(),
            creative: CreativeSchema,
          }),
        },
      )
      .post('/v1/campaigns/:id/pause', ({ params, status }) => {
        const c = campaigns.get(params.id);
        if (!c) return status(404, 'unknown campaign');
        c.paused = true;
        return { id: c.id, paused: true };
      })
      // Daily rows, the way network reporting APIs return them. A row can change after its day.
      .get('/v1/campaigns/:id/report', ({ params, status }) => {
        const c = campaigns.get(params.id);
        if (!c) return status(404, 'unknown campaign');
        return {
          days: [...c.days.values()].map((d) => ({ ...d })),
          conversions: { ...c.conversions },
        };
      })
      // Conversion postbacks from the advertiser's MMP (for Freecash's campaigns: Freecash's own MMP).
      .get(
        '/v1/postbacks',
        ({ query, status }) => {
          const c = impressions.get(query.click_id)?.campaign;
          if (!c) return status(404, 'unknown click');
          c.conversions[query.event] = (c.conversions[query.event] ?? 0) + 1;
          return { ok: true };
        },
        {
          query: t.Object({
            click_id: t.String(),
            event: t.String(),
            event_time: t.Optional(t.String()),
          }),
        },
      )
      .post(
        '/sim/serve',
        ({ body }) => {
          // A zeroed ID (no tracking consent in the publisher app) can't match any audience.
          const device = normalizeAdId(body.deviceId);
          if (!device) return { filled: false as const };
          const winner = [...campaigns.values()]
            .filter((c) => canServe(c, device, body.floorCpm))
            .sort((a, b) => b.bidCpm - a.bidCpm)[0];
          if (!winner) return { filled: false as const };

          // First-price: the winner pays its own bid, per impression.
          const row = today(winner);
          row.impressions++;
          row.spend += winner.bidCpm / 1000;
          const key = capKey(winner, device);
          seenToday.set(key, (seenToday.get(key) ?? 0) + 1);
          const id = newId('imp');
          impressions.set(id, {
            id,
            campaign: winner,
            deviceId: device,
            publisherApp: body.publisherApp,
          });
          return { filled: true as const, impressionId: id, creative: winner.creative };
        },
        {
          body: t.Object({
            deviceId: t.String(),
            publisherApp: t.String(),
            floorCpm: t.Integer({ minimum: 0 }),
          }),
        },
      )
      .post(
        '/sim/click',
        ({ body, status }) => {
          const imp = impressions.get(body.impressionId);
          if (!imp) return status(404, 'unknown impression');
          today(imp.campaign).clicks++;
          // The impression ID doubles as the network's click ID that MMP postbacks echo back.
          const url = fillTemplate(imp.campaign.clickUrl, {
            [MACROS.deviceId]: imp.deviceId,
            [MACROS.clickId]: imp.id,
            [MACROS.impressionId]: imp.id,
            [MACROS.publisherApp]: imp.publisherApp,
          });
          return { url };
        },
        { body: t.Object({ impressionId: t.String() }) },
      )
      // The network's back office credits invalid traffic on a closed day, lowering its spend.
      .post(
        '/sim/revise',
        ({ body, status }) => {
          const row = campaigns.get(body.campaignId)?.days.get(body.date);
          if (!row) return status(404, 'unknown campaign day');
          row.spend = body.spend;
          return { ...row };
        },
        {
          body: t.Object({
            campaignId: t.String(),
            date: t.String(),
            spend: t.Integer({ minimum: 0 }),
          }),
        },
      )
  );
}

export type AdNetworkApp = ReturnType<typeof createAdNetwork>;

/** Freecash's client for this mock, implementing the `AdNetwork` port over its HTTP API. */
export function mockAdNetworkClient(baseUrl: string, fetcher: typeof fetch): AdNetwork {
  const api = treaty<AdNetworkApp>(baseUrl, { fetcher });
  const fail = (call: string, e: { status: unknown; value: unknown }) =>
    new Error(`ad network ${call} failed: ${e.status} ${JSON.stringify(e.value)}`);
  return {
    name: MOCK_NETWORK_NAME,
    macros: {
      deviceId: `{${MACROS.deviceId}}`,
      clickId: `{${MACROS.clickId}}`,
      impressionId: `{${MACROS.impressionId}}`,
      publisherApp: `{${MACROS.publisherApp}}`,
    },
    async createAudience(name, deviceIds) {
      const { data, error } = await api.v1.audiences.post({ name, deviceIds });
      if (error) throw fail('createAudience', error);
      return data.id;
    },
    async replaceAudience(audienceId, deviceIds) {
      const { error } = await api.v1.audiences({ id: audienceId }).put({ deviceIds });
      if (error) throw fail('replaceAudience', error);
    },
    async createCampaign(c) {
      const { data, error } = await api.v1.campaigns.post(c);
      if (error) throw fail('createCampaign', error);
      return data.id;
    },
    async pause(campaignId) {
      const { error } = await api.v1.campaigns({ id: campaignId }).pause.post();
      if (error) throw fail('pause', error);
    },
    async report(campaignId) {
      const { data, error } = await api.v1.campaigns({ id: campaignId }).report.get();
      if (error) throw fail('report', error);
      return data;
    },
  };
}
