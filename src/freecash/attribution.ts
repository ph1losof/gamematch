/**
 * The port to Freecash's own attribution tool (Adjust in production). Re-engagement campaigns on
 * Moloco and Google measure through it: the ad's click URL is the tool's retargeting link, and
 * when a re-engaged user starts an offer, Freecash reports `offer_started`, the tool credits the
 * network's click and posts back to the network, which optimises toward it. The MVP plugs in the
 * mock (src/mocks/mmp.ts), which owns its URL format.
 */
import type { Platform } from '../shared/types';

export interface AttributionTool {
  /**
   * A retargeting click URL for `appId`: the tool records the network's click (its `clickId` and
   * `deviceId`, usually macros the network fills), then opens `deepLink` with `deepLinkParams`.
   */
  retargetingClickUrl(p: {
    appId: string;
    platform: Platform;
    mediaSource: string;
    clickId: string;
    deviceId: string;
    deepLink: string;
    deepLinkParams: Record<string, string>;
  }): string;
  trackEvent(e: {
    appId: string;
    advertisingId: string;
    event: string;
  }): Promise<{ attribution: string }>;
}
