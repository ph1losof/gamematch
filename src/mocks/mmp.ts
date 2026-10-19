/**
 * Mock attribution tool (MMP). Two instances run: the advertiser's (AppsFlyer-like, credits Game B
 * installs) and Freecash's own (Adjust-like, measures re-engagement of the Freecash app). It records
 * clicks from every media source, credits each new install or re-engagement to one source and sends
 * postbacks only to that source. Matching follows the real tools:
 *  - Android: the Play Install Referrer carries the click ID through the store (deterministic,
 *    works even with a zeroed GAID); otherwise last click by GAID.
 *  - iOS: last click by IDFA, only if the user allowed tracking in the app being measured.
 *    Without it there is only aggregate SKAdNetwork data, so no user-level postback.
 * A device that already had the app is a reinstall: nobody is credited. An install from a device
 * on the fraud blocklist is rejected and the credited source is told so (`is_rejected=1`).
 * Postback times are Unix seconds, as AppsFlyer and Adjust send them.
 */
import { treaty } from '@elysiajs/eden';
import { Elysia, t } from 'elysia';
import type { AttributionTool } from '../freecash/attribution';
import { normalizeAdId } from '../shared/adid';
import { type Clock, DAY } from '../shared/clock';
import { PLATFORMS, type Platform } from '../shared/types';
import { fillTemplate, newId } from '../shared/util';

export const CLICK_LOOKBACK = 7 * DAY;
const REENGAGEMENT_WINDOW = 7 * DAY;

/** The tracking-link parameter the ad ID is read from: AppsFlyer takes `idfa` on iOS, `advertising_id` on Android. */
export const adIdParam = (platform: Platform) => (platform === 'ios' ? 'idfa' : 'advertising_id');

type AppConfig = {
  appId: string;
  platform: Platform;
  storeUrl: string;
  partners: Record<string, string>;
};
type Click = {
  id: string;
  appId: string;
  pid: string;
  partnerClickId: string;
  deviceId: string | null;
  retargeting: boolean;
  at: number;
};
type Install = {
  id: string;
  app: AppConfig;
  deviceId: string | null;
  click: Click | null;
  at: number;
};
/** Who an install is credited to: one click, or nobody (and why). */
type Credit =
  | { kind: 'credited'; click: Click }
  | { kind: 'rejected'; click: Click }
  | { kind: 'reinstall' }
  | { kind: 'organic' };
type Postback = { eventId: string; url: string; attempts: number; lastStatus: number };
type ClickQuery = {
  pid: string;
  clickid?: string;
  advertising_id?: string;
  idfa?: string;
  deep_link?: string;
};

export function createMmp({ clock, fetch }: { clock: Clock; fetch: typeof globalThis.fetch }) {
  const apps = new Map<string, AppConfig>();
  const clicks = new Map<string, Click>();
  const clicksByDevice = new Map<string, Click[]>(); // in time order
  const installs = new Map<string, Install>();
  const installedOn = new Set<string>(); // `${appId}:${deviceId}`
  const blockedDevices = new Set<string>();
  const postbacks = new Map<string, Postback>();

  /** The device's latest click for the app, of the given kind, inside the window. */
  const lastClick = (deviceId: string, appId: string, retargeting: boolean, window: number) =>
    (clicksByDevice.get(deviceId) ?? []).findLast(
      (c) => c.appId === appId && c.retargeting === retargeting && clock.now() - c.at <= window,
    ) ?? null;

  function recordClick(app: AppConfig, query: ClickQuery, retargeting: boolean): Click {
    const click: Click = {
      id: newId('mclk'),
      appId: app.appId,
      pid: query.pid,
      partnerClickId: query.clickid ?? '',
      deviceId: normalizeAdId(query[adIdParam(app.platform)]),
      retargeting,
      at: clock.now(),
    };
    clicks.set(click.id, click);
    if (click.deviceId) {
      const history = clicksByDevice.get(click.deviceId) ?? [];
      history.push(click);
      clicksByDevice.set(click.deviceId, history);
    }
    return click;
  }

  /** Android: the install referrer names the click; otherwise (and on iOS) the last click by ad ID. */
  function attributeInstall(app: AppConfig, deviceId: string | null, referrer?: string) {
    const referred = app.platform === 'android' && referrer ? clicks.get(referrer) : undefined;
    if (referred && referred.appId === app.appId && !referred.retargeting)
      if (clock.now() - referred.at <= CLICK_LOOKBACK) return referred;
    return deviceId ? lastClick(deviceId, app.appId, false, CLICK_LOOKBACK) : null;
  }

  function creditFor(app: AppConfig, deviceId: string | null, referrer?: string): Credit {
    if (deviceId && installedOn.has(`${app.appId}:${deviceId}`)) return { kind: 'reinstall' };
    const click = attributeInstall(app, deviceId, referrer);
    if (!click) return { kind: 'organic' };
    if (deviceId && blockedDevices.has(deviceId)) return { kind: 'rejected', click };
    return { kind: 'credited', click };
  }

  async function deliver(pb: Postback) {
    pb.attempts++;
    pb.lastStatus = (await fetch(pb.url)).status;
    return pb;
  }

  /** Sends an event to the source credited with `click`, if that source has a postback configured. */
  async function report(
    app: AppConfig,
    click: Click,
    deviceId: string | null,
    event: string,
    installedAt: number | null,
    rejection?: string,
  ) {
    const template = app.partners[click.pid];
    if (!template) return null;
    const eventId = newId('evt');
    const url = fillTemplate(template, {
      clickid: click.partnerClickId,
      event_name: event,
      event_id: eventId,
      advertising_id: deviceId ?? '',
      event_time: String(Math.floor(clock.now() / 1000)),
      install_time: installedAt === null ? '' : String(Math.floor(installedAt / 1000)),
      is_rejected: rejection ? '1' : '0',
      rejection_reason: rejection ?? '',
    });
    const pb: Postback = { eventId, url, attempts: 0, lastStatus: 0 };
    postbacks.set(eventId, pb);
    return deliver(pb);
  }

  /** Credits an app's own event to the device's last retargeting click in the re-engagement window. */
  async function creditEvent(app: AppConfig, advertisingId: string, event: string) {
    const deviceId = normalizeAdId(advertisingId);
    const click = deviceId ? lastClick(deviceId, app.appId, true, REENGAGEMENT_WINDOW) : null;
    if (click) await report(app, click, deviceId, event, null);
    return click?.pid ?? 'unattributed';
  }

  return (
    new Elysia({ name: 'mmp' })
      .post(
        '/apps',
        ({ body }) => {
          apps.set(body.appId, body);
          return { appId: body.appId };
        },
        {
          body: t.Object({
            appId: t.String(),
            platform: t.UnionEnum(PLATFORMS),
            storeUrl: t.String(),
            partners: t.Record(t.String(), t.String()),
          }),
        },
      )
      // The tracking link every media source sends users through. A UA click goes to the store
      // (on Android with the click as install referrer); a retargeting click deep-links into the
      // app (or its web fallback), passing `dl_*` params on.
      .get(
        '/click/:appId',
        ({ params, query, redirect, status }) => {
          const app = apps.get(params.appId);
          if (!app) return status(404, 'unknown app');
          if (query.is_retargeting !== 'true') {
            const store = new URL(app.storeUrl);
            const click = recordClick(app, query, false);
            if (app.platform === 'android') store.searchParams.set('referrer', click.id);
            return redirect(store.href, 302);
          }
          if (!query.deep_link) return status(400, 'retargeting click needs a deep_link');
          recordClick(app, query, true);
          const target = new URL(query.deep_link);
          for (const [k, v] of Object.entries(query))
            if (k.startsWith('dl_') && v) target.searchParams.set(k.slice(3), v);
          return redirect(target.href, 302);
        },
        {
          query: t.Object(
            {
              pid: t.String(),
              clickid: t.Optional(t.String()),
              advertising_id: t.Optional(t.String()),
              idfa: t.Optional(t.String()),
              af_siteid: t.Optional(t.String()),
              is_retargeting: t.Optional(t.String()),
              deep_link: t.Optional(t.String()),
            },
            { additionalProperties: true },
          ),
        },
      )
      // Called by the app's SDK on first open. A blocked install is reported to the source that
      // would have been credited, then credits no one.
      .post(
        '/sdk/install',
        async ({ body, status }) => {
          const app = apps.get(body.appId);
          if (!app) return status(404, 'unknown app');
          const deviceId = normalizeAdId(body.advertisingId);
          const credit = creditFor(app, deviceId, body.referrer);
          const install: Install = {
            id: newId('inst'),
            app,
            deviceId,
            click: credit.kind === 'credited' ? credit.click : null,
            at: clock.now(),
          };
          installs.set(install.id, install);
          if (deviceId) installedOn.add(`${app.appId}:${deviceId}`);
          if (credit.kind === 'credited' || credit.kind === 'rejected') {
            const rejection = credit.kind === 'rejected' ? 'fraud_blocklist' : undefined;
            await report(app, credit.click, deviceId, 'install', install.at, rejection);
          }
          return {
            installId: install.id,
            attribution: credit.kind === 'credited' ? credit.click.pid : credit.kind,
          };
        },
        {
          body: t.Object({
            appId: t.String(),
            advertisingId: t.String(),
            referrer: t.Optional(t.String()),
          }),
        },
      )
      // Called by the app's SDK for each in-app event, e.g. reaching a level.
      .post(
        '/sdk/event',
        async ({ body, status }) => {
          const install = installs.get(body.installId);
          if (!install) return status(404, 'unknown install');
          const { app, click, deviceId, at } = install;
          const pb = click ? await report(app, click, deviceId, body.event, at) : null;
          return { postbackSent: pb !== null, eventId: pb?.eventId ?? null };
        },
        { body: t.Object({ installId: t.String(), event: t.String() }) },
      )
      // Server-to-server event from the app's own backend (Freecash reports `offer_started`).
      // Credited to the last retargeting click within the re-engagement window.
      .post(
        '/s2s/event',
        async ({ body, status }) => {
          const app = apps.get(body.appId);
          if (!app) return status(404, 'unknown app');
          return { attribution: await creditEvent(app, body.advertisingId, body.event) };
        },
        { body: t.Object({ appId: t.String(), advertisingId: t.String(), event: t.String() }) },
      )
      // Fraud tooling (Protect360 / Adjust FPS) blocking a device.
      .post(
        '/admin/fraud/block',
        ({ body }) => {
          blockedDevices.add(normalizeAdId(body.deviceId) ?? body.deviceId);
          return { blocked: blockedDevices.size };
        },
        { body: t.Object({ deviceId: t.String() }) },
      )
      // Real MMPs retry on timeouts, so the same event can arrive twice. This simulates that.
      .post('/admin/postbacks/:eventId/redeliver', async ({ params, status }) => {
        const pb = postbacks.get(params.eventId);
        if (!pb) return status(404, 'unknown postback');
        const { attempts, lastStatus } = await deliver(pb);
        return { attempts, lastStatus };
      })
  );
}

export type MmpApp = ReturnType<typeof createMmp>;

/** Freecash's client for its own MMP, implementing the `AttributionTool` port. */
export function mockAttributionClient(baseUrl: string, fetcher: typeof fetch): AttributionTool {
  const api = treaty<MmpApp>(baseUrl, { fetcher });
  return {
    // AppsFlyer/Adjust-style retargeting link. The click and ad ID values are left raw: they are
    // the network's macros, which it replaces before anyone opens the URL.
    retargetingClickUrl(p) {
      const passOn = Object.entries(p.deepLinkParams)
        .map(([k, v]) => `&dl_${k}=${v}`)
        .join('');
      return (
        `${baseUrl}/click/${p.appId}?pid=${p.mediaSource}&is_retargeting=true` +
        `&clickid=${p.clickId}&${adIdParam(p.platform)}=${p.deviceId}` +
        `&deep_link=${encodeURIComponent(p.deepLink)}${passOn}`
      );
    },
    async trackEvent(e) {
      const { data, error } = await api.s2s.event.post(e);
      if (error) throw new Error(`MMP s2s event failed: ${error.status}`);
      return data;
    },
  };
}
