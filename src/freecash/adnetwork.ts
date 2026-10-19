/**
 * The port Freecash buys ads through. The MVP plugs in the mock network's client
 * (src/mocks/adnetwork.ts); a real integration (Moloco, Google) implements the same calls and
 * brings its own name and macro spelling, so nothing in src/freecash changes.
 */
import type { Micros } from '../shared/money';
import type { Creative } from '../shared/types';

/** One day of a campaign, as network reporting APIs return it. Rows can be revised after the day. */
export type DayRow = { date: string; impressions: number; clicks: number; spend: Micros };

export interface AdNetwork {
  /** The network's media-source name in Freecash's MMP, and the ledger account we owe it on. */
  readonly name: string;
  /** How this network spells the click-URL placeholders it fills at click time. */
  readonly macros: {
    deviceId: string;
    clickId: string;
    impressionId: string;
    publisherApp: string;
  };
  createAudience(name: string, deviceIds: string[]): Promise<string>;
  replaceAudience(audienceId: string, deviceIds: string[]): Promise<void>;
  createCampaign(c: {
    name: string;
    audienceId: string;
    bidCpm: Micros;
    /** Lifetime spend cap: the network stops serving the campaign once its spend would pass it. */
    totalBudget: Micros;
    frequencyCapPerDay: number;
    clickUrl: string;
    creative: Creative;
  }): Promise<string>;
  /** Stops serving the campaign. Idempotent; spend already delivered is still reported. */
  pause(campaignId: string): Promise<void>;
  /** Daily rows plus conversions the network has received postbacks for, by event. */
  report(campaignId: string): Promise<{ days: DayRow[]; conversions: Record<string, number> }>;
}
