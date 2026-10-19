/** Game B's attribution SDK: what it reports to the MMP on first open and on each event. */
import { treaty } from '@elysiajs/eden';
import type { MmpApp } from '../mocks/mmp';
import type { Device } from './device';

export function gameSdk(mmpUrl: string, fetcher: typeof fetch, appId: string) {
  const mmp = treaty<MmpApp>(mmpUrl, { fetcher });
  return {
    appId,
    /** `storeUrl` is where the user installed from; on Android it carries the install referrer. */
    async install(device: Device, storeUrl?: string) {
      const referrer = storeUrl
        ? (new URL(storeUrl).searchParams.get('referrer') ?? undefined)
        : undefined;
      const { data, error } = await mmp.sdk.install.post({
        appId,
        advertisingId: device.adIdFor(appId),
        referrer,
      });
      if (error) throw new Error(`install failed: ${error.status}`);
      return data;
    },
    async track(installId: string, event: string) {
      const { data, error } = await mmp.sdk.event.post({ installId, event });
      if (error) throw new Error(`event failed: ${error.status}`);
      return data;
    },
  };
}
