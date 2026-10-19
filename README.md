# GameMatch MVP

> **In short**
> - Freecash pays people to play mobile games. About 1 million of its users have only ever earned through one game they "linked" to their account.
> - GameMatch tests one idea: show these users an ad inside the games they already play, so they start a second game on Freecash.
> - This repository is a working model of that idea. It runs the whole path from ad to reward to bill, with simulated partners in place of the real ones.
> - It also contains the money model (what an ad is worth and the most we should pay) and a simulation of the live test with its yes/no rule.
> - Nothing here talks to a real ad network or tracking company. Everything runs on one laptop with `bun`.

## What problem does this solve?

**Freecash** (made by Almedia) is a rewards app. Users install games and get paid when they reach goals in them, such as "reach level 10". The game studio (the **advertiser**) pays Freecash for each goal. Freecash passes part of that to the user and keeps the rest. The part it keeps is its **margin**.

**Link** is a Freecash feature that connects a Freecash account to a game the user already plays, so progress there earns rewards. The brief says about 1 million linked users never started any other game offer, and about 75% of them have a usable **ad ID**. An ad ID is the phone's advertising identifier: GAID on Android, IDFA on iPhone. Ad networks use it to show an ad to a chosen list of people.

The question: if Freecash buys ads inside those games, aimed at those users, do enough of them start a second game to pay for the ads? And can each install be traced back to the right Freecash user, so we reward that user and bill the right studio?

## How do I run it?

You need [Bun](https://bun.sh) (built and tested with 1.4.3).

```bash
bun install
bun test                 # 30 core tests, in memory, under a second
bun run typecheck        # TypeScript type check, under a second
bun run dev              # all services on real ports; prints an ad-click link to open in a browser
bun run journey          # one user's journey, step by step, with every screen and message: http://localhost:3010
bun run dashboard        # the money model as a live page with sliders: http://localhost:3100
bun run dashboard:build  # a static copy of the dashboard in dashboard/dist
bun run demo             # simulates the live test on 20,000 users and prints the result at day 90
bun run roi              # what an ad is worth and the highest price worth paying
bun run calibrate        # checks the yes/no rule in a world where the ads do nothing
```

What `bun run dev` starts: Freecash on port 3000, the simulated ad network on 3001, the game studio's tracking company on 3002, and Freecash's own tracking company on 3003. `bun run journey` takes a `PORT` variable to change its port.

Options:

- `bun run demo --users 100000 --seed 7 --bid 15 --ladder median`. Defaults: 20,000 users, seed 7, a fixed bid of $15 per 1,000 ads shown, and the "median" reward ladder for the puzzle game. `--bid value` uses the bid from the money model instead. `--ladder illustrative` uses the simple three-goal ladder.
- `bun run roi --ctr 0.03 --start 0.3 --install 0.6 --attributed 0.9 --eligibility 1 --incrementality 0.4 --followon 5 --margin 0.2 --cpm 15`. Each flag replaces one input; `--cpm` adds a profit line at that price.
- `bun run calibrate --seeds 100 --users 10000`.

## Words you will need

| Term | Plain meaning, with an example from this project |
|---|---|
| **CPM** | The price for showing an ad 1,000 times. We assume about $17 on Android in the US. |
| **CTR** | Click-through rate: the share of ads shown that get tapped. We assume 2.5%. |
| **Ad network** | The company that sells ad space inside other apps and runs the auction (for example Moloco or Google). |
| **MMP** | Mobile measurement partner: a tracking company (AppsFlyer, Adjust) that decides which ad gets credit for an install. |
| **Postback** | A message the tracking company sends to the credited source: "this click led to an install" or "this user reached level 10". |
| **Click ID** | A one-off code we create when the user taps Start. It travels through the tracking company and comes back in every postback. |
| **ATT** | Apple's App Tracking Transparency prompt. Without a "yes" in an app, the iPhone's ad ID reads as all zeros in that app. |
| **Incrementality** | The share of installs that happened only because of the ad. We assume 40%. |
| **Holdout / control** | A random 20% of users who never see the ads, so we can compare. |

## How does it work? One user, start to finish

1. **Choose who may see ads.** We take linked users who never started another offer, are 18 or older, agreed to ads in other apps, live in a test country (the US for now), and have a usable ad ID. Each is placed for good in **treatment** (sees ads) or **control** (does not), by a fixed random rule. 20% go to control. We also record a **segment** by how recently they played their linked game (hot: within 3 days, warm: within 14, cold: older) and a **value tier** (high if they earned $50 or more on Link). These labels never change afterwards.
2. **Launch campaigns.** One campaign per offer (one game on one platform), segment and value tier. Each campaign has its own bid, ad text and spending cap. The whole test may spend at most $5,000.
3. **Upload audiences.** Each treatment user goes into exactly one campaign: the one for the offer that suits them best. "Best" means the highest expected margin, with a small bonus (×1.15) when the game's genre matches a game they already play. Control users are never uploaded. At every upload we check consent, age, country and tracking permission again; a user who now fails is left out but stays in their group for the final comparison.
4. **The ad is tapped.** The tap goes first through Freecash's own tracking company. The network requires this kind of link for "come back to our app" campaigns.
   > **What we found:** Moloco, *Create a new Campaign (DSP API reference)* (2026): "tracking_link_id is required for APP installs or re-engagement type campaign" and "landing_url is not allowed for APP installs or re-engagement type campaign" ([link](https://developer.moloco.cloud/reference/dspapi_createcampaign-1.md)).
   > **What it means:** we cannot send the tap straight to a web page. It must pass through Freecash's own tracker and open the Freecash app.
   > **So we decided:** the ad link goes through Freecash's tracker, then opens the Freecash app if installed, or a Freecash web page if not.
5. **Who is this?** In the Freecash app, the logged-in session tells us. On the web page, the ad ID does, because there is no login there. On the web, the ad ID therefore also decides which account gets the reward. We accept that for the MVP because an install from any other phone is rejected; a web login before Start would close the gap.
6. **The offer page.** It shows the game, each goal with its reward and deadline, the rules ("new players only"), and one **Start** button. Some offers get a **linked-player bonus**: the first easy goal pays double if reached within 48 hours, never more than the studio pays us. The bonus is offered only when that goal can actually be reached in 48 hours. "Play for 7 days" cannot, so it gets no bonus.
7. **Start.** We create the click ID, tell Freecash's tracker that an offer started (so the network can learn which users respond), and send the user on to the game studio's tracking link and the app store.
8. **Install and goals.** The studio's tracking company credits the install to the last ad tapped. On Android it uses the Play Store's install referrer, which carries our click through the store even without an ad ID.
   > **What we found:** Android Developers, *Google Play Install Referrer* (2025): "You can use the Google Play Store's Install Referrer API to securely retrieve referral content from Google Play" ([link](https://developer.android.com/google/play/installreferrer)).
   > **What it means:** on Android the click can be matched to the install directly.
   > **So we decided:** Android installs are credited through the referrer first, then the ad ID. iOS installs are credited only if the user allowed tracking in the game.
9. **Postback, reward and bill.** Each postback brings our click ID back. We check it and, if the goal is paid, we record two things in one step: the studio owes us the payout, and we owe the user the reward. The reward is **on hold** for 30 days, then the user can cash it out. During the hold it can still be cancelled.
10. **Ad spend.** Each day we copy the network's daily cost into our books, including later corrections. When total spend reaches $5,000, every campaign is paused.
11. **The readout.** At day 90 we compare treatment and control. We decide at day 90. We continue only if, for all treated users together, the lower end of the 95% confidence range for extra profit per treated user is above zero — counting no follow-on value. Results by segment, value tier or platform are only for learning, not for the decision. The extra installs per treated user (install lift) is the early signal we check first, because it needs far fewer users to see.

   A **95% confidence range** is the band the true number very likely lies in. "Lower end above zero" means we are confident the ads make money. If either group has fewer than 30 users or fewer than 10 users who earned anything, the readout says **insufficient** instead of guessing.

## What do the scripts show today?

These are outputs of the code as it is now. They are simulated or modelled, not measured.

- **`bun run roi`** (our estimate, using the simple puzzle offer, 65% of users eligible for "new players only" offers, and no value from later offers): 1,000 ads are worth **$1.93** on Android and **$0.99** on iPhone. The most we should pay, keeping a 20% safety margin, is **$1.54** and **$0.79** per 1,000 ads. With the linked-player bonus's expected cost included, that falls to **$0.82** and **$0.42**.
- **The market price** (from published sources): about **$17** per 1,000 ads on Android in the US and about **$21** on iPhone, including the ad platform's cut (we assume 25%).
  > **What we found:** GameDev Reports (Tenjin data), *Tenjin: Ad Monetization in Mobile Games in Q2'24* (2024-09-25): "The average eCPM for Rewarded Ads in the US was $30.25" on Android ([link](https://gamedevreports.substack.com/p/tenjin-ad-monetization-in-mobile-00b)); Appodeal, *The Latest eCPM Report 2025* (2025-03): about $12–13 per 1,000 for US Android full-screen ads ([link](https://appodeal.com/wp-content/uploads/2025/03/Appodeal-The-Latest-eCPM-Report-2025.pdf)). Google, *How our display buying platforms share revenue with publishers* (2020-06-23): "Our standard rate for advertisers using Display & Video 360 to purchase display ads is 15 percent" ([link](https://blog.google/products/admanager/display-buying-share-revenue-publishers/)).
  > **What it means:** app owners receive $12–30 per 1,000 full-screen ads in the US, and the buyer pays more than that because the platform takes a cut.
  > **So we decided:** we use $17 (Android) and $21 (iPhone) as the price paid, and a 25% platform cut. At that price, one ordinary offer shown to an average user does not pay for itself.
- **`bun run demo`** (simulation, 20,000 users, fixed bid of $15 per 1,000 ads, readout at day 90): spend **$929.60**. Extra profit per treated user **+$0.27**, with a 95% range from **−$0.32 to +$0.87**: **inconclusive**. Install lift **+4.01 percentage points** (range +2.59 to +5.43), so the ads clearly change behaviour even though profit is unclear.
- **`bun run calibrate`** (100 simulated runs where the ads do nothing): the rule wrongly said "continue" **0 times** and wrongly said "stop" 3 times. A good rule should say "continue" here at most about 2.5% of the time.

The full design write-up, in plain language, is [DESIGN.md](DESIGN.md).

## What is simulated, and why?

Real ad networks and tracking companies need accounts, contracts and live money. To keep the whole path testable on one machine, each outside party is a small server that follows the real one's rules. Freecash's own code talks to them through the same web requests it would use in production.

| Party | Simulated in | What it does like the real one | What it leaves out |
|---|---|---|---|
| Ad network (like Moloco or Google) | `src/mocks/adnetwork.ts` | Lists of ad IDs to target, a first-price auction, a charge per ad shown, a daily cap per user, a spending cap and pause, daily cost reports that can be corrected later, link placeholders filled in at tap time | Smart bid lowering, even pacing, paying per result, choosing which apps to appear in |
| Game studio's tracking company (like AppsFlyer) | `src/mocks/mmp.ts`, first copy | Credits the last tap within 7 days, Android referrer then ad ID, iPhone only with tracking allowed, no credit for reinstalls, fraud blocking, postbacks only to the winner, times in Unix seconds | Apple's anonymous counting system (SKAdNetwork), credit for ads only seen, real fraud scoring |
| Freecash's tracking company (like Adjust) | `src/mocks/mmp.ts`, second copy | Records the ad tap, opens the deep link, credits "offer started" to the last tap and tells the network | Deferred deep links |
| The game | `src/sim/game.ts` | Reports the first open and later goals | — |
| The phone | `src/sim/device.ts` | One ad ID per app (zeros without permission), follows links, opens Freecash links in the app when installed | Real universal-link handling |
| Login | an `x-user-id` header | Stands in for the logged-in session | Real sessions and sign-in |

The simulation's user behaviour (`scripts/sim.ts`) is a check that the machinery works, not a forecast. Only the live test can measure the real numbers.

## Where is everything?

```
src/model/        pure maths, shared by the server, the scripts and the dashboard (a test keeps it free of server code)
  bidding.ts        margin per install, value per 1,000 ads, highest bid, highest price per Start, break-even CTR
  funnel.ts         default rates per platform, safety margin, daily cap, control share
  goals.ts          reward ladders (simple, median, high-value, premium), with the earliest day each goal can be reached
  segments.ts       hot / warm / cold and value tiers, and how each changes the rates
  market.ts         market prices, platform cut, chance of winning an auction at a bid, reach in 14 days
  delivery.ts       what a price buys in the auction, and how many ads a reached user sees
  cell.ts, blend.ts one platform × segment, then the segments blended per platform
  platform.ts, prize.ts   per-platform figures; what treating everyone for one wave would earn
  readout.ts        extra profit per treated user, 95% range (pooled spread), verdict incl. "insufficient"
  sizing.ts, experiment-sizing.ts   how many users the test needs to see an effect, and what it spends
  population.ts, scenario.ts, scenario-types.ts, sweeps.ts, chart-sweeps.ts, verdict.ts, issues.ts   the dashboard's business case
src/freecash/     the system being tested
  app.ts            web routes; turns results into status codes
  deps.ts           what the use cases run on (database, clock, settings, the two connection points)
  clicks.ts         ad tap → user (app session, else ad ID)
  starts.ts         Start: click ID, bonus, "offer started", tracking link; one Start per ad tap
  postbacks.ts      money in: a goal postback → bill + reward on hold, in one step
  landing.ts        what the three screens show, read from the database
  screens.ts, html.ts   the screens themselves (offer page, "opening the store", progress) and the page shell
  personalise.ts    which offer, which goal to lead with, the bonus, the ad text
  offers.ts         catalogue reads: an offer, its game, its goal ladder
  rewards.ts        release after the hold; cancel during it
  spend.ts          money out: daily ad cost with corrections; pause at the budget
  ledger.ts         the account book
  eligibility.ts    who may see ads, as database filters
  enrollment.ts     who is in the test, frozen before any ad runs: arm, segment, value tier, platform
  experiment-report.ts   the readout (overall, by segment, tier and platform) and the install lift
  campaigns.ts      one campaign per offer, segment and tier: bid, ad link, launch, pause, report
  audiences.ts      each treated device goes into exactly one campaign's upload
  adnetwork.ts, attribution.ts   the connection points to the ad network and Freecash's tracker
  config.ts         every setting; open product questions are switches here
  schema.ts, db.ts  database tables (rules on money are built into them) and the migration
src/shared/       money in micro-dollars, the clock, ad IDs, IDs and small shared types
src/mocks/        the simulated ad network and tracking companies
src/sim/          the simulated phone and game
src/seed.ts       the sample catalogue: Kingdom Clash and Jewel Mania (linked games); Bubble Saga and Castle Siege (offers)
src/system.ts     connects everything, on real ports or in memory
src/main.ts       `bun run dev`
scripts/          demo, roi, calibrate, and the shared simulation
demo/journey/     the step-by-step one-user journey
dashboard/        the live money model (Tweakpane + ECharts); every number comes from src/model
test/             30 core tests: the main paths (flow, money, postbacks, experiment) and the model boundary
drizzle/          the database migration: one file, 0000_init.sql
```

**How errors are handled.** A function returns nothing when the thing it looks up does not exist, a short reason when it refuses, and throws only when something that must never happen does. `app.ts` turns these into 4xx answers. Postbacks are the exception: a refused postback still gets a 200 answer with the reason, so the tracking company stops resending it. A wrong password gets a 401.

**Stack.** Bun (runtime, tests, bundler), Elysia with Eden (typed requests between the parties), Drizzle on SQLite, TypeScript 7.

## What would we do with more time?

- **Close the web identity gap:** ask for a Freecash login on the web page before Start, so the ad ID never picks the account that gets paid.
- **Real partners:** connect Moloco or Google behind the ad-network connection point and Adjust behind the tracker connection point.
- **Paying per result:** many networks can charge per Start instead of per 1,000 ads. The money model already prices this; the simulated network does not yet bill that way.
- **Safer postbacks:** allow postbacks only from known addresses or with signatures, and keep a queue of postbacks we failed to process.
- **Operations:** sign-in for admin routes, Postgres, scheduled jobs for spend, audiences and reward release, and monthly checks against the studio's and the network's invoices.
- **Better test design:** read the result in stages, add a free push-notification arm, and measure the real auction win rate.
