/**
 * Runs Freecash and the mocks on real ports with a small seeded dataset, so the flow can be
 * clicked through in a browser. Prints a ready-made ad click URL to open.
 */
import { treaty } from '@elysiajs/eden';
import { armFor } from './freecash/enrollment';
import { addUser, LINKED_GAME, offerId, seedCatalog } from './seed';
import { createSystem } from './system';

const urls = {
  freecash: 'http://localhost:3000',
  adNetwork: 'http://localhost:3001',
  mmp: 'http://localhost:3002',
  freecashMmp: 'http://localhost:3003',
};
const sys = createSystem({ urls, fetch });
sys.freecash.listen(3000);
sys.adNetworkMock.listen(3001);
sys.mmpMock.listen(3002);
sys.freecashMmpMock.listen(3003);

await seedCatalog(sys.db, urls, fetch);
// Pick a user ID that hashes into the treatment arm, so the demo user actually sees the ad.
let n = 0;
while (armFor(sys.config.experimentSalt, `usr_demo_${n}`, sys.config.holdoutPct) !== 'treatment')
  n++;
const demoDevice = '3f1c2a9e-7b4d-4e8a-9c21-5d6e7f8a9b0c';
addUser(
  sys.db,
  {
    id: `usr_demo_${n}`,
    name: 'Alex Kim',
    age: 27,
    adsConsent: true,
    platform: 'android',
    deviceId: demoDevice,
    trackingAllowed: true,
    daysSinceActive: 1,
  },
  Date.now(),
);

const admin = treaty<typeof sys.freecash>(urls.freecash).admin;
await admin.experiment.enroll.post();
await admin.campaigns.post({ offerId: offerId('android'), segment: 'hot', valueTier: 'standard' });

// Serve one ad to the demo user inside the linked game and tap it.
const ads = treaty<typeof sys.adNetworkMock>(urls.adNetwork);
const served = await ads.sim.serve.post({
  deviceId: demoDevice,
  publisherApp: LINKED_GAME.appId,
  floorCpm: 0,
});
if (!served.data?.filled) throw new Error('demo user was not served an ad');
const click = await ads.sim.click.post({ impressionId: served.data.impressionId });

console.log(`
GameMatch running
  Freecash   ${urls.freecash}
  Ad network ${urls.adNetwork}
  Advertiser MMP ${urls.mmp}
  Freecash MMP   ${urls.freecashMmp}

Ad served in ${LINKED_GAME.name}: "${served.data.creative.headline}"
Open the ad click in a browser:
  ${click.data?.url}
`);
