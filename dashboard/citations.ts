/**
 * Where every dashboard input comes from, as external citations: the basis for its default and
 * range, a one-line note, and the published sources behind it (publisher, title, date, link, the
 * passage it rests on, and whether the link was opened and still says so). Data and its types
 * only: sources.ts and sources-view.ts render it. Keys follow the param table in dashboard/params.ts.
 */
import { MAX_GOALS } from './params';

export type Basis =
  | 'brief'
  | 'source'
  | 'derived'
  | 'estimate'
  | 'design choice'
  | 'partner data needed';
export type Publication = {
  publisher: string;
  title: string;
  date: string;
  url: string;
  supports: string;
  status: 'verified' | 'paraphrased' | 'unreachable';
  checked: string;
};
export type Citation = { basis: Basis; note: string; sources: Publication[] };
/** Citations by param key; views read a key with no entry as "No citation recorded yet". */
export interface Citations {
  [key: string]: Citation;
}

const CHECKED = '2026-10-19';
const src = (s: Omit<Publication, 'checked'>): Publication => ({ ...s, checked: CHECKED });
/** The same source, quoted for a different figure. */
const say = (
  s: Publication,
  supports: string,
  status: Publication['status'] = s.status,
): Publication => ({
  ...s,
  supports,
  status,
});

// ---------------------------------------------------------------------------------------------
// Sources. Each `supports` is the passage the default or range rests on (verbatim when verified).
// ---------------------------------------------------------------------------------------------

const S = {
  brief: src({
    publisher: 'Almedia',
    title: 'GameMatch take-home brief',
    date: '2026',
    url: '',
    supports:
      'About 1 million linked users have never started any offer except the game they linked. About 75% of them have a usable device ID.',
    status: 'verified',
  }),

  // Market prices and auctions
  appodeal: src({
    publisher: 'Appodeal',
    title: 'The Latest eCPM Report 2025 (Oct–Dec 2024 data)',
    date: '2025-03',
    url: 'https://appodeal.com/wp-content/uploads/2025/03/Appodeal-The-Latest-eCPM-Report-2025.pdf',
    supports:
      'Top-10-countries chart, US publisher eCPM: Android rewarded ≈$13.2, interstitial ≈$12.3; iOS rewarded ≈$17.3, interstitial ≈$13.1.',
    status: 'paraphrased',
  }),
  tenjin: src({
    publisher: 'GameDev Reports (Tenjin data)',
    title: "Tenjin: Ad Monetization in Mobile Games in Q2'24",
    date: '2024-09-25',
    url: 'https://gamedevreports.substack.com/p/tenjin-ad-monetization-in-mobile-00b',
    supports:
      'Android: "The average eCPM for Rewarded Ads in the US was $30.25"; interstitial leaders "the US ($16.15)".',
    status: 'verified',
  }),
  adsense: src({
    publisher: 'Google AdSense Help',
    title: 'AdSense revenue share',
    date: 'undated',
    url: 'https://support.google.com/adsense/answer/180195',
    supports: 'publishers keep about 68% percent of the revenue',
    status: 'verified',
  }),
  dv360: src({
    publisher: 'Google (The Keyword)',
    title: 'How our display buying platforms share revenue with publishers',
    date: '2020-06-23',
    url: 'https://blog.google/products/admanager/display-buying-share-revenue-publishers/',
    supports:
      'Our standard rate for advertisers using Display & Video 360 to purchase display ads is 15 percent.',
    status: 'verified',
  }),
  bidlogic: src({
    publisher: 'Bidlogic',
    title: 'What happened to mobile app eCPMs in Q4 2025?',
    date: '2026-01-30',
    url: 'https://bidlogic.io/2026/01/30/what-happened-to-mobile-app-ecpms-in-q4-2025/',
    supports:
      'The USA and UK markets are leading this charge with remarkable eCPM increases of 24.19% and 23.29%. (Android rewarded video, Q3→Q4 2025)',
    status: 'verified',
  }),
  playioEcpm: src({
    publisher: 'Playio',
    title:
      'What Are 1,000 Ad Impressions Worth? 2026 Mobile Game eCPM Benchmarks by Format, Region, and OS',
    date: '2026-10-05',
    url: 'https://blog.playio.co/mobile-game-ecpm-benchmarks-2026',
    supports:
      'Rewarded "Tier 1 range (Playwire, 2025)": "$15–$30"; "video interstitials in the US and Canada ran $12–$25".',
    status: 'verified',
  }),
  zhang: src({
    publisher: "Zhang, Yuan & Wang, KDD '14 (ACM)",
    title: 'Optimal Real-Time Bidding for Display Advertising',
    date: '2014-08',
    url: 'https://wnzhang.net/papers/ortb-kdd.pdf',
    supports:
      'the winning rate w(b) consistently has an (approximately) concave shape: when the bid price is low, adding a unit bid will increase the winning rate more',
    status: 'verified',
  }),
  ironsource: src({
    publisher: 'Unity (ironSource Exchange)',
    title: 'ironSource Exchange OpenRTB 2.5 specs',
    date: '2026',
    url: 'https://docs.unity.com/en-us/grow/programmatic/ironsource-exchange/openrtb-specs',
    supports: `ironSource supports first price auction only. … \${MIN_BID_TO_WIN} macro, to indicate the minimum bid required to win the final auction.`,
    status: 'verified',
  }),
  maxAuction: src({
    publisher: 'AppLovin',
    title: 'Auction dynamics (MAX)',
    date: 'undated',
    url: 'https://support.applovin.com/en/max/demand-partners/auction-dynamics',
    supports: 'unified first-price auction in which the highest bidder wins',
    status: 'verified',
  }),
  gameanalytics: src({
    publisher: 'GameAnalytics',
    title: '2026 Mobile & PC Gaming Benchmarks',
    date: '2026-08-24',
    url: 'https://gameanalytics.com/reports/2026-mobile-pc-gaming-benchmarks',
    supports: 'Median games (P50) averaged between 3.8 and 3.9 sessions per day',
    status: 'verified',
  }),
  liftoffS1: src({
    publisher: 'Liftoff Mobile, Inc. (SEC EDGAR)',
    title: 'Form S-1/A, Amendment No. 3',
    date: '2026-06-02',
    url: 'https://www.sec.gov/Archives/edgar/data/1850351/000119312526253016/iron_s-1a_3_round_2.htm',
    supports: 'As of 2024, ad spend per user hour is approximately $0.07 within third-party apps',
    status: 'verified',
  }),
  singularQ1: src({
    publisher: 'Singular',
    title: 'Quarterly Report 2026 Q1',
    date: '2026',
    url: 'https://www.singular.net/quarterly-report-2026-q1',
    supports:
      'CPM increased 4.6% to $2.88, reflecting heavier competition for inventory as budgets ramped in Q4.',
    status: 'verified',
  }),
  molocoRe: src({
    publisher: 'Moloco',
    title: 'App Re-engagement | Moloco Ads',
    date: '2026',
    url: 'https://www.moloco.com/capabilities/moloco-ads/re-engagement',
    supports:
      'median cost per action on RE campaigns is 73% lower than the median cost per action on UA campaigns',
    status: 'verified',
  }),
  molocoApi: src({
    publisher: 'Moloco',
    title: 'Create a new Campaign (DSP API reference)',
    date: '2026-06-08',
    url: 'https://developer.moloco.cloud/reference/dspapi_createcampaign-1.md',
    supports:
      'OPTIMIZE_CPA_FOR_APP_RE: Aim to drive the user re-engagements while satisfying long-term cost per (certain) action.',
    status: 'verified',
  }),
  googlePfc: src({
    publisher: 'Google Ads Help',
    title: 'About Target CPA bidding',
    date: '2026',
    url: 'https://support.google.com/google-ads/answer/6268632',
    supports:
      'With Display campaigns, you can choose to pay for conversions instead of paying per click or engaged view.',
    status: 'verified',
  }),
  youappiFetch: src({
    publisher: 'YouAppi',
    title: 'YouAppi x Fetch: a partnership for enhanced user reactivation',
    date: '2025',
    url: 'https://youappi.com/resource/fetch',
    supports: 'Average Cost of app open at $1.06 … average Cost per User Game Download of $1.34',
    status: 'verified',
  }),

  // Identity, consent, audience
  singularGaid: src({
    publisher: 'Singular',
    title:
      'Zeroing out the Android Limit Ad Tracking (LAT) will impact only 2% of devices globally',
    date: '2021-06-17',
    url: 'https://www.singular.net/blog/zeroing-out-the-android-advertising-id-will-impact-only-2-of-devices-globally/',
    supports:
      'only 2.08% of Android users have tunneled down into Settings -> Privacy -> Advanced -> Ads … and actually turned Ads Personalization off',
    status: 'verified',
  }),
  adjustAtt: src({
    publisher: 'Adjust',
    title: 'The gaming app insights report: 2026 edition',
    date: '2026-06',
    url: 'https://a.storyblok.com/f/47007/x/20551740ee/gaming-app-insights-report-2026.pdf',
    supports:
      'Among users shown the prompt on iOS, the opt-in rate reached 39%, up from 38% in Q1 2025.',
    status: 'verified',
  }),
  appsflyerAtt: src({
    publisher: 'AppsFlyer',
    title:
      'Initial data indicates ATT opt-in rates are much higher than anticipated — at least 41%',
    date: '2021 (updated 2025-11-27)',
    url: 'https://www.appsflyer.com/blog/measurement-analytics/att-opt-in-rates-higher/',
    supports: 'the gap between non-gaming and gaming apps (42% vs. 31%)',
    status: 'verified',
  }),
  didomiUs: src({
    publisher: 'Didomi',
    title: 'What is the average acceptance rate in the United States in 2026?',
    date: '2026-05-06',
    url: 'https://www.didomi.io/blog/benchmark-average-acceptance-rate-united-states',
    supports: 'The national average is 94.2%, with an average opt-out rate of 5.8%.',
    status: 'verified',
  }),
  didomiEu: src({
    publisher: 'Didomi',
    title: 'What is the average consent rate in Europe in 2026?',
    date: '2026-03-19',
    url: 'https://didomi.io/blog/benchmark-average-consent-rate-europe',
    supports:
      'opt-in rates "range from 55.7% in Western Europe to 67.6% in Eastern Europe" (opt-ins over banners displayed)',
    status: 'verified',
  }),
  didomiInd: src({
    publisher: 'Didomi',
    title: 'Which industry has the highest consent rate in Europe in 2026?',
    date: '2026-05-25',
    url: 'https://www.didomi.io/blog/benchmark-consent-rate-by-industry-europe-2026',
    supports: 'Gaming & Sports: 79.3% consent rate, 60.2% opt-in, 24.1% no-choice.',
    status: 'verified',
  }),
  fcTerms: src({
    publisher: 'Freecash (Almedia)',
    title: 'Terms of Service',
    date: '2026-07-17',
    url: 'https://freecash.com/en/policies/terms',
    supports:
      'you represent and warrant that you are at least 16 years old and of legal age to form a binding contract with Almedia.',
    status: 'verified',
  }),
  modpa: src({
    publisher: 'DLA Piper',
    title: 'US: Maryland Online Data Privacy Act summary and comparative analysis',
    date: '2024-07-02',
    url: 'https://www.dlapiper.com/en/insights/publications/2024/07/us-maryland-online-data-privacy-act-summary-and-comparative-analysis',
    supports:
      "MODPA prohibits controllers from selling or processing minors' data for targeted advertising if the controller knows or should have known that the consumer is under 18",
    status: 'verified',
  }),
  similarweb: src({
    publisher: 'Similarweb',
    title: 'freecash.com Traffic Analytics, Ranking & Audience [September 2026]',
    date: '2026-09',
    url: 'https://www.similarweb.com/website/freecash.com/',
    supports:
      'United States 40.02% of web traffic; "The largest age group of visitors are 25 - 34 year olds."',
    status: 'verified',
  }),
  itunes: src({
    publisher: 'Apple (iTunes Lookup API)',
    title: 'Freecash - Get Paid Real Money (US storefront)',
    date: '2026-10-19',
    url: 'https://itunes.apple.com/lookup?id=1673567402',
    supports: 'userRatingCount 157338 (US App Store only; live figure)',
    status: 'verified',
  }),
  play: src({
    publisher: 'Google Play',
    title: 'Freecash: Earn Money',
    date: '2026-10-16',
    url: 'https://play.google.com/store/apps/details?id=com.freecash.app2',
    supports: '10M+ Downloads; 565K reviews (live figures)',
    status: 'verified',
  }),
  appfigures: src({
    publisher: 'Appfigures',
    title: "The App That Tricked TikTok To The Top of the App Store (And It's Still There)",
    date: '2026-03-01',
    url: 'https://web.archive.org/web/20260611150723/https://appfigures.com/resources/insights/freecash-tricked-tiktok-top-app-store',
    supports:
      'Freecash has crossed 31M downloads across both stores since its release. 21M on Google Play and 10M on the App Store.',
    status: 'verified',
  }),
  almediaRelease: src({
    publisher: 'Almedia',
    title:
      'Freecash Pays Out Over $500 Million in Rewards and Reaches $1 Billion Annual Revenue Run Rate',
    date: '2026-10-15',
    url: 'https://almedia.co/resource-hub/newsroom/freecash-500-million-payouts-1-billion-revenue-run-rate',
    supports: 'The United States accounts for 57.9% of lifetime payout value',
    status: 'verified',
  }),
  ppcPayouts: src({
    publisher: 'PPC Land',
    title: 'Freecash passes $500m in user payouts as Almedia nears $1bn run rate',
    date: '2026-10-15',
    url: 'https://ppc.land/freecash-passes-500m-in-user-payouts-as-almedia-nears-1bn-run-rate/',
    supports:
      'Freecash has paid more than $500 million to users … the business has reached a $1 billion annual revenue run rate',
    status: 'verified',
  }),
  ppcPulled: src({
    publisher: 'PPC Land',
    title: 'Freecash pulled from both app stores over media coverage Almedia disputes',
    date: '2026-05-02',
    url: 'https://ppc.land/freecash-pulled-from-both-app-stores-over-media-coverage-almedia-disputes/',
    supports:
      "according to Almedia's own figures … paid out over $300 million in rewards since its founding.",
    status: 'verified',
  }),
  googleEuConsent: src({
    publisher: 'Google Ads Help',
    title: 'FAQs about the EU user consent policy for Customer Match upload partners',
    date: '2024',
    url: 'https://support.google.com/google-ads/answer/14310715',
    supports:
      'for Customer Match lists to be used in EEA, both consent fields of ConsentStatus type must be set to "GRANTED"',
    status: 'verified',
  }),
  cnil: src({
    publisher: 'CNIL',
    title:
      'Transfer of data to a social network for advertising purposes: the CNIL imposed a fine of €3.5 million',
    date: '2026-01-22',
    url: 'https://www.cnil.fr/en/transfer-data-social-network-advertising-purposes-cnil-imposed-fine-eu35-million',
    supports:
      'transferring the data of members of its loyalty programme to a social network … for advertising targeting purposes, without valid consent.',
    status: 'verified',
  }),

  // Funnel and incrementality
  fcTracking: src({
    publisher: 'Freecash Academy',
    title: 'How Can I Make Sure Offers Track Correctly on Freecash?',
    date: '2025-05-09',
    url: 'https://freecash.com/academy/en/support/offer/tracking/how-ensure-offer-tracking-works',
    supports:
      'if you have ever installed the app or game before tracking will not work and you will not be rewarded.',
    status: 'verified',
  }),
  installReferrer: src({
    publisher: 'Android Developers',
    title: 'Google Play Install Referrer',
    date: '2025-07-21',
    url: 'https://developer.android.com/google/play/installreferrer',
    supports:
      "You can use the Google Play Store's Install Referrer API to securely retrieve referral content from Google Play",
    status: 'verified',
  }),
  playioCtr: src({
    publisher: 'Playio',
    title: 'What Is a Good Ad CTR for Mobile Games? 2026 CTR Benchmarks by Channel, Format, and OS',
    date: '2026-10-12',
    url: 'https://blog.playio.co/mobile-game-ad-ctr-benchmarks-2026',
    supports:
      'Format table (from MWM): static interstitial 2–6%, video interstitial 3–8%, rewarded 6–15%+ CTR; "Taps made while trying to close the ad get counted as clicks."',
    status: 'paraphrased',
  }),
  liftoffCasual: src({
    publisher: 'Liftoff (with Singular)',
    title: '2025 Casual Gaming Apps Report',
    date: '2025',
    url: 'https://liftoff.ai/2025-casual-gaming-apps-report/',
    supports:
      'Average click-through rates (CTR) for casual games overall were 9.4% on Android and 8.8% on iOS',
    status: 'verified',
  }),
  apptweak: src({
    publisher: 'AppTweak',
    title: 'Average App Conversion Rate per Category [2025]',
    date: '2026-05-18',
    url: 'https://www.apptweak.com/en/aso-blog/average-app-conversion-rate-per-category',
    supports: 'the average conversion rate across categories in the US was 8.56% on the App Store',
    status: 'verified',
  }),
  ghostAds: src({
    publisher: 'Johnson, Lewis & Nubbemeyer, Journal of Marketing Research 54(6)',
    title: 'Ghost Ads: Improving the Economics of Measuring Online Ad Effectiveness',
    date: '2017-12',
    url: 'https://api.crossref.org/works/10.1509/jmr.15.0297',
    supports: 'the ads lifted website visits by 17.2% and purchases by 10.5%',
    status: 'verified',
  }),
  sahni: src({
    publisher: 'Sahni, Narayanan & Kalyanam, Journal of Marketing Research 56(3)',
    title:
      'An Experimental Investigation of the Effects of Retargeted Advertising: The Role of Frequency and Timing',
    date: '2019-06',
    url: 'https://api.crossref.org/works/10.1177/0022243718813987',
    supports:
      'switching on experimental retargeting causes 14.6% more users to return to the website within four weeks',
    status: 'verified',
  }),
  nber: src({
    publisher: 'NBER (Blake, Nosko & Tadelis)',
    title:
      'Consumer Heterogeneity and Paid Search Effectiveness: A Large Scale Field Experiment (w20171)',
    date: '2014-05',
    url: 'https://www.nber.org/papers/w20171',
    supports:
      'more frequent users whose purchasing behavior is not influenced by ads account for most of the advertising expenses',
    status: 'verified',
  }),
  kabam: src({
    publisher: 'AppsFlyer',
    title: 'Increasing in-app usage and proving incremental lift with AppsFlyer (Kabam)',
    date: 'undated',
    url: 'https://www.appsflyer.com/customers/kabam/',
    supports: 'an incremental lift in revenue of almost 20%',
    status: 'verified',
  }),

  // Recency segments
  hillstrom: src({
    publisher: 'MineThatData (Kevin Hillstrom)',
    title: 'The MineThatData E-Mail Analytics And Data Mining Challenge',
    date: '2008-03-20',
    url: 'https://blog.minethatdata.com/2008/03/minethatdata-e-mail-analytics-and-data.html',
    supports: 'This dataset contains 64,000 customers who last purchased within twelve months.',
    status: 'verified',
  }),
  bnt: src({
    publisher: 'Blake, Nosko & Tadelis, Econometrica (accepted version)',
    title: 'Consumer Heterogeneity and Paid Search Effectiveness: A Large Scale Field Experiment',
    date: '2014-08-12',
    url: 'https://faculty.haas.berkeley.edu/stadelis/BNT_ECMA_rev.pdf',
    supports:
      'The estimates are tightly estimated zeros for zero days … the effect then steadily rises with absence',
    status: 'verified',
  }),
  jlr: src({
    publisher: 'Johnson, Lewis & Reiley (working paper)',
    title:
      'Add More Ads? Experimentally Measuring Incremental Purchases Due To Increased Frequency of Online Display Advertising',
    date: '2013-04-27',
    url: 'https://www.davidreiley.com/papers/AddMoreAds.pdf',
    supports:
      'Recent shoppers exhibit a higher effect $1.62 (s.e. $0.75) than not $0.13 (s.e. $0.14)',
    status: 'verified',
  }),
  gsb: src({
    publisher: 'Stanford GSB Insights',
    title: 'With "Retargeted" Advertising, Sooner Is Better Than Later',
    date: '2019-09-04',
    url: 'https://www.gsb.stanford.edu/insights/retargeted-advertising-sooner-better-later',
    supports:
      "about one-third of the effect of the first week's advertising occurred on the first day",
    status: 'verified',
  }),
  remergeRt: src({
    publisher: 'Remerge',
    title: 'Why gaming studios spend big on in-app retargeting',
    date: '2025-04-24',
    url: 'https://www.remerge.io/guides-and-reports/why-gaming-studios-spend-big-on-in-app-retargeting',
    supports: "86% of Remerge's gaming clients set inactivity windows to less than 7 days",
    status: 'verified',
  }),
  adjustReattr: src({
    publisher: 'Adjust Help Center',
    title: 'Reattribution',
    date: 'undated',
    url: 'https://help.adjust.com/en/article/reattribution',
    supports:
      'An inactivity period defines how long users must be inactive before qualifying for reattribution. (Default: 7 days; range 0–365 days)',
    status: 'verified',
  }),
  moloco111: src({
    publisher: 'Moloco',
    title: '111Percent Surpasses D7 ROAS Target by 291% on iOS with Moloco Re-engagement Campaign',
    date: '2026-06-25',
    url: 'https://www.moloco.com/case-studies/111percent-moloco-re-engagement-campaign',
    supports:
      'shortening the inactivity window used to define re-engagement audiences from 30 days to 7 days',
    status: 'verified',
  }),

  // Offers and follow-on value
  unityMulti: src({
    publisher: 'Unity (Tapjoy offerwall docs)',
    title: 'Multi rewards offer best practices',
    date: '2026',
    url: 'https://docs.unity.com/grow/offerwall/user-acquisition/best-practices/multi-rewards-offer-best-practices',
    supports:
      'Choose 6 to 10 events… Example bids: complete level 1 = 2% of the total bid; complete level 12 (5 to 8 days) = 28%.',
    status: 'paraphrased',
  }),
  unityUa: src({
    publisher: 'GameDev Reports (Unity data)',
    title: 'Unity: Mobile User Acquisition and Monetization trends in 2024',
    date: '2024-09-24',
    url: 'https://gamedevreports.substack.com/p/unity-mobile-user-acquisition-and',
    supports:
      'Almost 100% of users complete tasks tied to tutorial completion, but only 4.2% complete tasks related to IAP purchases.',
    status: 'verified',
  }),
  superbox: src({
    publisher: 'Almedia',
    title: 'How Superbox drove 2× higher D30 ROAS and retention with Almedia',
    date: 'undated',
    url: 'https://almedia.co/resource-hub/case-studies/superbox-jewels-jungle',
    supports: 'Retention (D30): 3× higher than other rewarded UA channels (2% → 6%)',
    status: 'verified',
  }),
  mwm: src({
    publisher: 'MWM',
    title: 'Offerwall — Mobile App Reward-Based Monetization Format Explained',
    date: 'undated',
    url: 'https://mwm.ai/glossary/offerwall',
    supports:
      'Per-offer payouts range $0.50-5 for app installs (most common), higher for "install + reach level N" offers.',
    status: 'verified',
  }),
  fcEarn: src({
    publisher: 'Freecash Academy',
    title: 'Make Money Online with Freecash: Top Methods Explained',
    date: '2026-08-19',
    url: 'https://freecash.com/academy/en/insider/how-to-earn-money-on-freecash',
    supports:
      'Gaming offers pay up to $2,500 per offer, with multi-tiered milestones that reward continued play.',
    status: 'verified',
  }),
  fcPnC: src({
    publisher: 'Freecash Academy',
    title: 'How to Earn Money with Puzzles & Chaos: Frozen Castle!',
    date: 'undated',
    url: 'https://freecash.com/academy/en/discover/games/puzzles-chaos',
    supports: 'Reach Castle 30 for $475 … reaching Castle 22 within 18 days for $101!',
    status: 'verified',
  }),
  fcToon: src({
    publisher: 'Freecash Academy',
    title: 'How to Earn Money with Toon Blast',
    date: 'undated',
    url: 'https://freecash.com/academy/en/discover/games/toon-blast',
    supports:
      'Earn up to $349 with Toon Blast! … like completing level 3000 within 120 days for $25!',
    status: 'verified',
  }),
  scrimpr: src({
    publisher: 'Scrimpr',
    title: 'Search & Compare Paid Offers on Get-Paid-To Sites',
    date: '2026-10-19',
    url: 'https://scrimpr.co.uk/gpt-search-engine/',
    supports:
      'The amounts shown here are based on a 4-star multiplier and may be higher than what new accounts see.',
    status: 'verified',
  }),
  ovivo: src({
    publisher: 'Almedia',
    title: 'How Ovivo Lifted LTV 16.8% Across 24 Titles with Almedia Link',
    date: 'undated (Oct–Dec 2025 data)',
    url: 'https://almedia.co/resource-hub/case-studies/ovivo-link',
    supports:
      'Link delivered an estimated 16.8% LTV uplift across exposed users in new monthly revenue',
    status: 'verified',
  }),
  lewis2006: src({
    publisher: 'Lewis, Journal of Marketing Research 43(2) (IAOR abstract)',
    title: 'Customer acquisition promotions and customer asset value',
    date: '2006-05',
    url: 'https://www.iaorifors.com/paper/53212',
    supports:
      'a 35% acquisition discount results in customers with about one-half the long-term value',
    status: 'verified',
  }),
  datta: src({
    publisher: 'Datta, Foubert & van Heerde, Journal of Marketing Research 52(2)',
    title: 'The challenge of retaining customers acquired with free trials',
    date: '2015-04',
    url: 'https://research.tilburguniversity.edu/en/publications/the-challenge-of-retaining-customers-acquired-with-free-trials/',
    supports:
      'the average customer lifetime value (CLV) of free-trial customers 59% lower than that of regular customers.',
    status: 'verified',
  }),
  gamesbeat: src({
    publisher: 'GamesBeat',
    title: 'AppsFlyer says retaining users is still a challenge for app marketers',
    date: '2017-02-14',
    url: 'https://gamesbeat.com/appsflyer-says-retaining-users-is-still-a-challenge-for-app-marketers/',
    supports:
      'the former [organic] outperformed the latter [non-organic] by 15 percent on iOS and 21 percent on Android.',
    status: 'verified',
  }),
  mtdRecency: src({
    publisher: 'MineThatData (Kevin Hillstrom)',
    title: 'Following The First-Time Buyer',
    date: '2017-09-05',
    url: 'https://blog.minethatdata.com/2017/09/following-first-time-buyer.html',
    supports:
      'Recency = 01, Rebuy = 17.3%. … Recency = 04, Rebuy = 4.0%. (one-time customers, by months since purchase)',
    status: 'verified',
  }),
  mediapost: src({
    publisher: 'MediaPost (Digital News Daily)',
    title: 'Paid, Organic Show Equal Retention Rates',
    date: '2018-06-26',
    url: 'https://www.mediapost.com/publications/article/321310/paid-organic-show-equal-retention-rates.html',
    supports:
      'Yet, at least in the gaming sector, retention rates are nearly identical across paid and organic installs.',
    status: 'verified',
  }),
  ladder: src({
    publisher: 'MineThatData (Kevin Hillstrom)',
    title: 'Climbing The Ladder',
    date: '2021-03-29',
    url: 'https://blog.minethatdata.com/2021/03/climbing-ladder.html',
    supports:
      '26.8% after a first purchase … 40.0% after a second purchase … 49.3% after a third purchase',
    status: 'verified',
  }),

  // Link partner surfaces and EU payouts
  linkTerms: src({
    publisher: 'Almedia',
    title: 'Link Terms & Conditions',
    date: '2026-01-29',
    url: 'https://almedia.co/legal/link-terms',
    supports:
      '§8.1: "including but not limited to CPC, CPI, CPA, CPM, revenue share or hybrid models."',
    status: 'verified',
  }),
  earnTab: src({
    publisher: 'Almedia (Link docs)',
    title: 'Best practices',
    date: 'undated',
    url: 'https://dev.almedia.co/publisher/best-practices',
    supports: 'The Earn Tab pays you a $3 CPA for every completed offer.',
    status: 'verified',
  }),
  gameloft: src({
    publisher: 'Débordès, Caporossi & Larocque, Journal of Marketing Analytics 9(3) (RePEc)',
    title:
      'Is my cross-promotion profitable? Evaluation of game-to-game cannibalization in free-to-play mobile games',
    date: '2021-09',
    url: 'https://ideas.repec.org/a/pal/jmarka/v9y2021i3d10.1057_s41270-021-00122-x.html',
    supports:
      'Results reveal an overall 20.66% decrease in expected IAP revenues in the current game … resulting in an overall 17.69% increase in future expected revenues.',
    status: 'verified',
  }),
  revenueLab: src({
    publisher: 'RevenueLab',
    title: 'AdMob eCPM Benchmarks 2026: Rewarded, Interstitial, Banner — by Format, Geo, and OS',
    date: '2026-06-17',
    url: 'https://www.revenuelab.fyi/blog/admob-ecpm-benchmarks-2026',
    supports:
      'Rewarded video, US / Tier 1: $14–$22; Tier 1 markets listed as US, CA, UK, AU, DE, JP. (table)',
    status: 'paraphrased',
  }),

  // Experiment design
  youappiIncr: src({
    publisher: 'YouAppi',
    title: 'How we use Incrementality Testing',
    date: '2023-03-22',
    url: 'https://youappi.com/blog/how-we-use-incrementality-testing/',
    supports: '10% in the control group and 90% in the test group',
    status: 'verified',
  }),
  playrix: src({
    publisher: 'Remerge',
    title: "A case of positive incrementality with Playrix's Gardenscapes",
    date: 'undated',
    url: 'https://www.remerge.io/case-study/playrix',
    supports: 'split into two groups: control group and test group (10% and 90%)',
    status: 'verified',
  }),
  liftoffRe: src({
    publisher: 'Liftoff',
    title: '7 Mobile App Re-Engagement Best Practices Proven to Drive Results',
    date: '2023-10-25',
    url: 'https://liftoff.ai/?post_type=post&p=30970',
    supports: "we'd assign 25% of those users to a control group where we display a PSA ad.",
    status: 'verified',
  }),
  lewisRao: src({
    publisher: 'Lewis & Rao, Quarterly Journal of Economics 130(4) (RePEc)',
    title: 'The Unfavorable Economics of Measuring the Returns to Advertising',
    date: '2015-11',
    url: 'https://ideas.repec.org/a/oup/qjecon/v130y2015i4p1941-1973.html',
    supports:
      'The median confidence interval on return on investment is over 100 percentage points wide.',
    status: 'verified',
  }),
  appsflyerIncr: src({
    publisher: 'AppsFlyer Help Center',
    title: 'Run an Incrementality for remarketing experiment',
    date: '2025',
    url: 'https://support.appsflyer.com/hc/en-us/articles/360014225577',
    supports:
      'The control group is automatically set to 15% of the audience size (best practice is between 15% to 25%).',
    status: 'verified',
  }),
  kohavi: src({
    publisher: 'Kohavi, Longbotham, Sommerfield & Henne, Data Mining and Knowledge Discovery 18',
    title: 'Controlled experiments on the web: survey and practical guide',
    date: '2009',
    url: 'https://ai.stanford.edu/~ronnyk/2009controlledExperimentsOnTheWebSurvey.pdf',
    supports:
      'Confidence level. Commonly set to 95%, this level implies that 5% of the time we will incorrectly conclude that there is a difference when there is none',
    status: 'verified',
  }),
  zhong: src({
    publisher: 'Zhong, Journal of Thoracic Disease 1(1) (PMC3256489)',
    title: 'How to Calculate Sample Size in Randomized Controlled Trial?',
    date: '2009-12',
    url: 'https://jtd.amegroups.org/article/view/59/html',
    supports:
      'Conventionally, the power is set at 0.80, for higher the power, the more sample is required.',
    status: 'verified',
  }),
  hohnhold: src({
    publisher: "Hohnhold, O'Brien & Tang (Google), KDD '15",
    title: "Focusing on the Long-term: It's Good for Users and Business",
    date: '2015-08',
    url: 'https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/43887.pdf',
    supports:
      'an increase in ad load usually leads to a decrease in the click-through rate (CTR = Clicks/Ad, term 5), even in the short-term',
    status: 'verified',
  }),
} satisfies Record<string, Publication>;

// ---------------------------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------------------------

const c = (basis: Basis, note: string, sources: Publication[] = []): Citation => ({
  basis,
  note,
  sources,
});

const appodealIos = say(
  S.appodeal,
  'Top-10-countries chart, US publisher eCPM: iOS rewarded ≈$17.3, interstitial ≈$13.1 (Android ≈$13.2 / ≈$12.3).',
);
const appodealEu = say(
  S.appodeal,
  'Europe-region chart, publisher eCPM: Android rewarded ≈$5.1, interstitial ≈$3.6; iOS ≈$8.9 / ≈$5.3. UK sits higher.',
);
const tenjinIos = say(
  S.tenjin,
  'iOS: "The average eCPM for Rewarded Ads in the US was $24.39"; interstitial leaders "the US ($23.17)".',
);
const adjustRegions = say(
  S.adjustAtt,
  'Europe and North America also saw growth, with opt-in rates reaching 36% and 33%.',
);
const didomiCa = say(
  S.didomiUs,
  'California sits near the bottom of the national range at 91.3% acceptance and 8.7% opt-out.',
);
const fcAllowTracking = say(
  S.fcTracking,
  'Unfortunately, if you did not allow tracking in the first instance your offer will not track and you will not be rewarded.',
);
const appsflyerTrust = say(S.appsflyerAtt, 'With higher levels of trust, opt-in rates rise.');
const tapToInstall = say(
  S.playioCtr,
  'SplitMetrics 2024: "a tap-to-install rate of 67.2%" for Apple Ads (the blog computes about 63.7% for 2026).',
  'verified',
);
const gaD7 = say(
  S.gameanalytics,
  'D7 retention just under 4% … retained just around 0.68-0.79% of players by Day 30',
);
const jlrLinear = say(
  S.jlr,
  'the returns to ad frequency are approximately linear among those who were eligible to see up to 50 ads',
);
const almediaTail = say(
  S.almediaRelease,
  'Over one million users have earned more than $100 through the platform, and more than 70,000 have earned over $1,000.',
);
const nberRecent = say(
  S.bnt,
  'most of paid search spending is wasted because the majority of spending on Google is related to clicks by those users that would purchase anyway',
);
const molocoSegments = say(
  S.moloco111,
  'Re-engaging users whose activity had recently declined proved more effective',
);
const gonulShi = say(
  S.bnt,
  'Gönül and Shi (1998) study a direct mail campaign and find that recent individuals are not influenced by mailing because they are likely to buy anyway.',
);
const hillstromSplit = say(
  S.hillstrom,
  '1/3 were randomly chosen to receive an e-mail campaign featuring Mens merchandise. … During a period of two weeks following the e-mail campaign, results were tracked.',
);
const jlrHighSales = say(
  S.jlr,
  'Customers with high past sales have a $1.74 lift (s.e. $0.93) versus $0.16 (s.e. $0.10) in the rest',
);
const youappiLtv = say(
  S.youappiIncr,
  'users with a LTV of $25 or more reactivated within the last 30 days showed a 40% uplift in revenue compared to users that had not made a transaction.',
);
const whales = say(S.remergeRt, "Whales typically account for over half of a game's income");
const scrimprCompare = say(
  S.scrimpr,
  'Compare what different reward sites pay for the same game offers.',
);
const scrimprEu = say(
  S.scrimpr,
  'Our match of ~800 offers each: UK and Germany rewards ≈0.79× the US (Android 0.81, iOS 0.75–0.77), France 0.60×, Poland 0.39× (medians).',
  'paraphrased',
);
const scrimprNewPlayers = say(
  S.scrimpr,
  'Our count of its 611 US Freecash offers: 412 (67%) carry a new-user restriction, including 59 of the 68 paying $1,000 or more.',
  'paraphrased',
);

const cpmNote = (os: string, clearing: string, range: string, eu: string) =>
  `Fee-inclusive CPM we pay for US full-screen ads. ${os} publisher eCPM (rewarded and interstitial) runs ${clearing}; a ~$${range} base clearing price grossed up by a ~25% DSP/network fee (Google discloses 15–32%) gives the default, and the range spans the sources at 15–35% fees. EU uses ${eu} on the same basis. The data is 12–28 months old and prices rose in Q4 2025.`;

const CTR = c(
  'estimate',
  'No public in-app retargeting CTR exists. 2.5% is a rate of real taps: raw full-screen gaming CTRs read 2–15% (about 9% on casual UA) but are inflated by accidental taps while closing the ad. Range 1.5–4%.',
  [S.playioCtr, S.liftoffCasual],
);
const START = c(
  'partner data needed',
  'No public benchmark for an offer page reached from a paid ad. Almedia knows its offer page → Start rate for linked users; the test measures it for ad traffic. 30% (20–40%) is a placeholder.',
);
const INSTALL = c(
  'estimate',
  "A user who just tapped Start on a cash offer is high-intent: Apple Ads tap-to-install is about 64–67%, while casual store-page conversion (9–16%) is a floor that doesn't apply. 60% (45–70%) until Almedia gives its Start → install rate.",
  [tapToInstall, S.apptweak],
);
const INCR = c(
  'estimate',
  "Share of ad-credited installs that wouldn't happen without the ad. Retargeting experiments lift all conversions by 10.5–20%, which is roughly 20–80% of the ad-attributed ones depending on the attributed share; frequent users barely respond. 40% (25–55%) until the holdout measures it.",
  [S.ghostAds, S.sahni, S.kabam, S.nber],
);

/** Follow-on value per activated user, per segment: one basis, a segment-specific first sentence. */
const FOLLOW_ON = (first: string, extra: Publication[] = []) =>
  c(
    'estimate',
    `${first} Margin on later offers: a second-offer starter's repeat rate × offers per repeater × margin, plus the ~1% heavy tail (about 70% of the value), minus what the user would have earned anyway, then cut for ad-driven users (promotion-acquired customers are worth 0.41–0.87×). Weighted by who the ad activates it blends to $1.8 (90 days) / $4.0 (12 months), floor ~$0. Never a bidding input until Almedia's cohorts measure it.`,
    [almediaTail, S.lewis2006, S.datta, S.gamesbeat, S.mediapost, S.ladder, ...extra],
  );

const LIFT_WARM = c(
  'design choice',
  'Warm users are the reference segment: their funnel is the platform funnel, so each warm lift is 1 by definition.',
);
const SHARE = c(
  'partner data needed',
  "Placeholder 28/43/29 hot/warm/cold split from the demo population. Almedia knows each linked user's days since last linked-game progress, so it can give the real split.",
);

const goalEntries = (i: number): Citations => {
  const inDefault = i < 3; // the illustrative ladder fills slots 0–2
  const slot = `Goal ${i + 1}`;
  const empty = inDefault
    ? ''
    : ` Empty in the default illustrative offer; filled when the median or high-value offer is picked.`;
  return {
    [`goal${i}On`]: c(
      'design choice',
      `Whether ${slot} counts toward margin; set by the offer picked.${empty}`,
    ),
    [`goal${i}Payout`]: inDefault
      ? c(
          'estimate',
          "Illustrative ladder: install $0.50, level 10 $5, level 30 $20. Shaped like Unity's multi-reward guidance (early events a small share of the total bid) and inside published install payouts of $0.50–5. The median and high-value presets use real Freecash reward rungs, with payout = reward ÷ 50% user share.",
          [S.unityMulti, S.mwm],
        )
      : c('derived', `Advertiser payout = the rung's user reward ÷ the 50% user share.${empty}`, [
          S.ppcPayouts,
          S.ppcPulled,
        ]),
    [`goal${i}Reward`]: inDefault
      ? c(
          'estimate',
          'Illustrative ladder pays the user 40–50% of the payout ($0.20, $2.50, $10). Real Freecash ladders run from cents for the install to hundreds of dollars for deep goals.',
          [S.fcEarn, S.fcToon],
        )
      : c(
          'source',
          `User reward from real Freecash ladders (Monopoly GO / Toon Blast and Puzzles & Chaos shapes). Rewards vary by account level and over time.${empty}`,
          [S.fcPnC, S.fcToon, S.scrimpr],
        ),
    [`goal${i}Completion`]: inDefault
      ? c(
          'partner data needed',
          '100% / 35% / 7% of credited installs are guesses: no offerwall publishes completion rates. Public ceilings: tutorial tasks ~100%, purchase tasks 4.2%, median D7 retention just under 4%, best-case D30 on Freecash 6%. Ask Almedia for completion curves.',
          [S.unityUa, gaD7, S.superbox],
        )
      : c(
          'estimate',
          `Our judgement under public ceilings: purchase tasks complete ~4%, a deadline goal can't beat retention on that day (best case D30 6% on Freecash). Ask Almedia for real curves.${empty}`,
          [S.unityUa, S.superbox, gaD7],
        ),
  };
};

export const CITATIONS: Citations = {
  // What Almedia tells us
  cpmA: c(
    'derived',
    cpmNote(
      'Android',
      '$12–13 (Appodeal) to $16–30 (Tenjin)',
      '13',
      "$5 / $8 / $14 from Appodeal's Europe and UK charts",
    ),
    [S.appodeal, S.tenjin, S.adsense, S.dv360, S.bidlogic, S.playioEcpm],
  ),
  cpmI: c(
    'derived',
    cpmNote(
      'iOS',
      '$13–17 (Appodeal) to $23–24 (Tenjin)',
      '16',
      "$7 / $12 / $19 from Appodeal's Europe and UK charts",
    ),
    [appodealIos, tenjinIos, S.adsense, S.dv360, appodealEu],
  ),
  horizon: c(
    'design choice',
    "Counts the first offer only by default, the conservative case. The 90-day and 12-month options add follow-on value, the number the case rests on, which only Almedia's cohorts can measure.",
  ),
  followOn90: FOLLOW_ON('Warm users, 90 days: $1.6 ($0–6.4).'),
  followOn90H: FOLLOW_ON(
    'Hot users, 90 days: $2.3 ($0–10.7). Recent buyers rebuy most, so recent players are likeliest to start more offers.',
    [S.mtdRecency],
  ),
  followOn90C: FOLLOW_ON(
    'Cold users, 90 days: $1.0 ($0–5.1). Rebuy rates fall about 3× within three months of the last purchase.',
    [S.mtdRecency],
  ),
  followOn12: FOLLOW_ON('Warm users, 12 months: $3.6 ($0–14.2).'),
  followOn12H: FOLLOW_ON('Hot users, 12 months: $5.0 ($0–23.9).', [S.mtdRecency]),
  followOn12C: FOLLOW_ON('Cold users, 12 months: $2.2 ($0–11.4).', [S.mtdRecency]),
  geoUs: c(
    'partner data needed',
    'Ask Almedia for the country split of the 1M. Proxies: the US is 57.9% of lifetime payout value (self-reported) and 40% of freecash.com web traffic. 45% (30–60%) sits a little lower because Link partners may skew European.',
    [S.almediaRelease, S.similarweb],
  ),
  geoEu: c(
    'partner data needed',
    'Ask Almedia. With the US at roughly 45–58% of users, Europe plausibly takes most of the rest; 35% (25–45%). The rest of the world is the remainder.',
    [S.almediaRelease, S.ovivo],
  ),
  ladder: c(
    'design choice',
    "Which offer the ad promotes. 'Illustrative' is a simple three-goal ladder; 'median' and 'high-value' copy the shape of real Freecash ladders (Monopoly GO / Toon Blast and Puzzles & Chaos). 'Premium' is the high-value ladder at 88% completion, about $7 per credited install: the top 10% of 611 real US Freecash offers (median about $4.75, best about $9.5, our model of their ladders).",
    [S.fcEarn, S.fcPnC, S.fcToon, scrimprCompare],
  ),
  tierOn: c(
    'design choice',
    "Off: every user at the platform funnel. On: only the top tier by past Link earnings, at the tier's lifts, and the pool shrinks to its share. This is the one group that stays profitable with no follow-on value, if the margin multiplier holds.",
    [jlrHighSales],
  ),
  targetH: c(
    'design choice',
    'Hot users are targeted by default so the test measures every segment; the value bid already spends less where a segment is worth less.',
  ),
  targetW: c(
    'design choice',
    'Warm users are targeted by default so the test measures every segment.',
  ),
  targetC: c(
    'design choice',
    'Cold users are targeted by default: lapsed users can respond more to ads than recent ones, so the test should measure them.',
    [S.bnt],
  ),

  // Ad performance
  ctrA: CTR,
  startA: START,
  installA: INSTALL,
  credA: c(
    'estimate',
    "Play's install referrer makes Android attribution deterministic. Credit is lost to prior installs (never creditable), late installs, other networks' clicks and fraud rejections. 88% (80–95%).",
    [S.installReferrer, S.fcTracking],
  ),
  incrA: INCR,
  ctrI: CTR,
  startI: START,
  installI: INSTALL,
  credI: c(
    'estimate',
    "iOS credit needs tracking allowed in the offer game. Gaming opt-in is 39% globally and 33% in North America among users shown the prompt; Freecash tells earners the offer won't track otherwise, so they should beat the average. 45% (33–55%); ask Almedia for the real share.",
    [S.adjustAtt, adjustRegions, fcAllowTracking, appsflyerTrust],
  ),
  incrI: INCR,

  // Audience
  linkedUsers: c('brief', "The brief's count of linked users who never started another offer.", [
    S.brief,
  ]),
  androidShare: c(
    'derived',
    'Appfigures estimates 21M Google Play vs 10M App Store downloads (68/32); store ratings point the same way. 66% (50–70%); ask Almedia for the split of the 1M.',
    [S.appfigures, S.play, S.itunes],
  ),
  idA: c(
    'estimate',
    "Only ~2% of Android users turn ad personalisation off, so ~98% have an ID; 95% allows for stale IDs (resets, new phones). Set with iOS 36% to keep the brief's 75% overall.",
    [S.singularGaid, S.brief],
  ),
  idI: c(
    'derived',
    "(75% − 66% × 95%) ÷ 34% = 36%, which keeps the brief's 75% usable IDs overall. Consistent with gaming ATT opt-in of 33–39% of users shown the prompt. Range 25–55%.",
    [S.brief, S.adjustAtt, adjustRegions],
  ),
  consentUs: c(
    'estimate',
    'US state privacy laws let adults be targeted unless they opt out: web consent banners see 94.2% acceptance nationally and 91.3% in California. 92% (85–95%).',
    [S.didomiUs, didomiCa, S.singularGaid],
  ),
  consentEu: c(
    'estimate',
    'The EU needs opt-in for cross-app ads. Bundled web banners get 55.7–67.6% opt-in (gaming 60.2%), a ceiling; a separate, unrewarded tracking prompt like ATT gets 31–39% (Europe 36%). 35% (25–50%).',
    [S.didomiEu, S.didomiInd, S.appsflyerAtt, adjustRegions],
  ),
  consentRow: c(
    'partner data needed',
    'Mixed legal regimes (Canada, Australia and others). 60% (40–70%) sits between the US opt-out and EU opt-in figures; ask Almedia what users agreed to at Link and sign-up.',
    [S.didomiUs, S.didomiEu],
  ),
  adults: c(
    'partner data needed',
    "No public age split. Freecash admits users from 16, and Maryland bans targeted ads to known under-18s, so minors must be excluded. The web audience's largest group is 25–34. 80% (70–90%) until Almedia gives the self-declared ages.",
    [S.fcTerms, S.modpa, S.similarweb],
  ),
  testUs: c(
    'design choice',
    'The first test runs in the US, where adults can be targeted under opt-out rules.',
    [S.didomiUs],
  ),
  testEu: c(
    'design choice',
    "Held back until there is an opt-in consent flow and a DPIA: Google needs granted consent for EEA lists, and the CNIL fined a retailer €3.5M for sharing members' data for ad targeting without valid consent.",
    [S.googleEuConsent, S.cnil],
  ),
  testRow: c(
    'design choice',
    'Not in the first test: mixed legal regimes and a smaller share of users.',
  ),
  reachA: c(
    'derived',
    'Of users with a usable ad ID: active in ad-funded apps in 14 days 65% (guess) × ID passed in the bid request 98% × our DSP sees the supply 80% (guess: the share of users whose apps sell at least once in 14 days on exchanges our DSP buys) × won at least once 97% ≈ 49%. The ID share is the separate usable-ID gate. No platform publishes list match or reach rates. Range 37–63%.',
    [S.singularGaid],
  ),
  reachI: c(
    'derived',
    'Of users with an IDFA: 65% active × 35% of host-game requests carry the IDFA (ATT in the host game) × 80% (users whose apps sell on exchanges our DSP buys) × 97% ≈ 18%. Range 9–30%.',
    [S.adjustAtt, adjustRegions],
  ),
  daysHot: c(
    'design choice',
    "Hot = progress in the linked game within 3 days. Gaming retargeters use short windows: most of Remerge's gaming clients use under 7 days, and Adjust defaults to 7.",
    [S.remergeRt, S.adjustReattr],
  ),
  daysWarm: c(
    'design choice',
    'Warm = within 14 days; older is cold. Short windows work better in published re-engagement cases.',
    [S.moloco111, molocoSegments, S.gsb],
  ),
  shareH: SHARE,
  shareW: SHARE,
  shareC: SHARE,
  liftHCtr: c(
    'estimate',
    "Recent customers respond more: in our re-analysis of the public Hillstrom e-mail test, 1–2-month customers respond about ×1.26 vs 3–8 months (×1.52 vs the most lapsed). No source gives a CTR lift by recency; ×1.25 (0.94–1.5), measured per segment in the test. With starts ×1.25 it gives ×1.56, in line with Hillstrom's hot conversion response (×1.55). The Upside end (×1.5, with starts ×1.3: ×1.95) is optimistic: above Hillstrom (×1.27 visits, ×1.55 conversions).",
    [hillstromSplit, S.jlr],
  ),
  liftHStart: c(
    'estimate',
    "Recent players are in the habit of playing, so more of those who click should start the offer. No published figure; ×1.25 (0.94–1.3) is our estimate. With click-through ×1.25 it gives ×1.56, matching Hillstrom's hot conversion response (×1.55); the Upside ×1.3 (×1.95 with click-through ×1.5) is above it.",
    [S.jlr, hillstromSplit],
  ),
  liftHIncr: c(
    'estimate',
    'Ads move recent customers least: eBay found zero effect for recent buyers, rising with absence, and direct mail moves recent buyers least. Hillstrom puts hot vs warm at ×0.91. ×0.85 (0.75–0.91).',
    [S.bnt, gonulShi, nberRecent, hillstromSplit],
  ),
  liftWCtr: LIFT_WARM,
  liftWStart: LIFT_WARM,
  liftWIncr: LIFT_WARM,
  liftCCtr: c(
    'estimate',
    'Lapsed customers respond less: in our re-analysis of the public Hillstrom e-mail test, 9–12-month customers respond about 0.83× as much as 3–8-month ones. ×0.6 (0.45–0.75) is the conservative side.',
    [hillstromSplit],
  ),
  liftCStart: c(
    'estimate',
    'Lapsed players are less engaged, so fewer clickers start. No published figure; ×0.8 (0.6–1.0) is a guess the test measures.',
    [hillstromSplit],
  ),
  liftCIncr: c(
    'estimate',
    "Ads move lapsed customers more, because they wouldn't come back anyway: eBay's effect rises with time since last purchase, and Hillstrom's 9–12-month customers show ×1.30 the incremental share of 3–8-month ones. ×1.15 (0.9–1.3), the cautious side.",
    [S.bnt, hillstromSplit],
  ),

  // The high-value tier (used only when the tier is targeted)
  tierShare: c(
    'partner data needed',
    'Placeholder: the top 15% of linked users by past Link earnings (about 37k of the ~248k enrollable US users). Almedia can count it by tier, app vs web-only and country. Earnings are heavy-tailed.',
    [almediaTail],
  ),
  tierCtr: c(
    'estimate',
    "High past spenders respond more: in our Hillstrom re-analysis, $750+ customers respond ×1.35 vs all on visits (×2.0 on conversions), n = 3,167. Click-through ×1.2 × starts ×1.3 = ×1.56, between Hillstrom's $750+ visit response (×1.35; net ×1.09 after incremental share) and conversion response (×2.0).",
    [hillstromSplit, jlrHighSales],
  ),
  tierStart: c(
    'estimate',
    "Conversion vs visit response implies up to ×1.5 past the click: ×1.3 (1.09–1.5), = ×1.56 with click-through ×1.2, between Hillstrom's $750+ visit response (×1.35; net ×1.09 after incremental share) and conversion response (×2.0). Almedia's own marketing click-through by earnings tier can check it before any media is bought.",
    [hillstromSplit, jlrHighSales],
  ),
  tierIncr: c(
    'estimate',
    "No sign that high past buyers are less incremental: at Yahoo the effect on high past spenders was larger ($1.74 vs $0.16), and Hillstrom's conversion share rises for top spenders. ×1.0 (0.9–1.1).",
    [jlrHighSales, youappiLtv, hillstromSplit],
  ),
  tierMargin: c(
    'estimate',
    'A guess, and the number that decides the case: high earners go deeper into a ladder, so margin per credited install ×1.5 (1.0–2.5). Validate on Almedia history first (second-offer margin by first-game earnings tier); stop below ×1.2.',
    [almediaTail, whales],
  ),
  tierFollowOn: c(
    'estimate',
    "A guess: about 1% of users earn about 75% of payouts, so high earners are far likelier to become multi-offer users. ×3 (2–5) on the segment's follow-on value.",
    [almediaTail, whales, S.ladder],
  ),

  // Offer details
  completionScale: c(
    'design choice',
    "Scales every goal's completion rate; 100% uses the ladders as built. Public ceilings suggest their mid and deep rates are high (purchase tasks ~4%, best-case D30 retention 6% on Freecash); about 82% matches a checked median offer.",
    [S.unityUa, S.superbox],
  ),
  eligibility: c(
    'derived',
    "Most offers pay only new players: a user who had the game before can't be credited. A new-user rule is on 67% of US Freecash offers (59 of the 68 top ones), so 65% (40–90%) until Almedia counts install overlap from app lists and MMP rejections.",
    [S.fcTracking, scrimprNewPlayers],
  ),
  rewardsFromShare: c(
    'design choice',
    "Off: each goal's own reward. On: the user gets the payout × the user share, to test other splits.",
  ),
  userShare: c(
    'derived',
    'Freecash paid users over $300M by 2 May 2026 and over $500M by 15 Oct: about $200M in 166 days, or $440M a year, 44% of the $1B revenue run rate. Other start dates give 40–61%; the ladders use 50%.',
    [S.ppcPulled, S.ppcPayouts],
  ),
  ...Object.assign({}, ...Array.from({ length: MAX_GOALS }, (_, i) => goalEntries(i))),

  // Auction
  region: c(
    'design choice',
    "Picks which region's market prices apply and resets both CPMs to that region's base.",
  ),
  buyMode: c(
    'design choice',
    'Pay per 1,000 impressions (default, what most in-app DSPs sell), per offer start (moves click-through risk to the network, but only if the contract bills per action; Google does only on Display), or a revenue share to a Link studio for its Offers screen, with no auction.',
    [S.molocoApi, S.googlePfc, S.linkTerms],
  ),
  revShare: c(
    'design choice',
    'Link Offers: the host studio gets this share of net margin on every credited install, incremental or not, so per incremental install it costs share × margin ÷ incrementality ($2.38 at 30% on the median offer, vs about $10.73 through a paid network). Start at 20–30%; hosts lose some in-game purchases from players who install.',
    [S.linkTerms, S.earnTab, S.gameloft],
  ),
  payoutEu: c(
    'derived',
    'The same game pays less in Europe: across ~800 matched offers each, UK and Germany ≈0.79× US (Android 0.81, iOS 0.75–0.77), France 0.60× (Android 0.68, iOS 0.56), Poland 0.39×. 80% (60–80%) for a Germany/UK-first launch. These are reward ratios, so they assume the same user share; the EU CPMs paid are already lower.',
    [scrimprEu, S.revenueLab],
  ),
  cpaAuto: c(
    'design choice',
    'On: bid what an offer start is worth per segment. Off: the fixed CPAs below.',
  ),
  cpaA: c(
    'derived',
    'What an Android start is worth at the defaults, less the 20% margin: install 60% × credited 88% × caused 40% × $1.875 margin per credited install × 0.8 ≈ $0.30. Published re-engagement CPAs are far higher ($1.06 per app open, $1.34 per game download), so a fixed $0.30 CPA would buy little.',
    [S.youappiFetch, S.molocoRe],
  ),
  cpaI: c('derived', 'As Android with 45% credited: 60% × 45% × 40% × $1.875 × 0.8 ≈ $0.15.', [
    S.youappiFetch,
    S.molocoRe,
  ]),
  targetMargin: c(
    'design choice',
    "Bid 20% below an impression's value so the channel keeps margin. In first-price auctions you pay your bid, so bidding full value leaves nothing. Range 10–30%.",
    [S.maxAuction, S.ironsource],
  ),
  frequencyCap: c(
    'design choice',
    'At most 2 ads per user a day (1–3). More ads lower CTR and build ad blindness, though display returns can stay linear well past that, so the test measures decay.',
    [S.hohnhold, jlrLinear],
  ),
  requests: c(
    'estimate',
    'About 4 sessions a day × one interstitial plus 1–2 rewarded chances ≈ 4–8 full-screen slots per active user-day, base 6 (4–10). Cross-check: $0.07 ad spend per user-hour × 12 min a day at a $2.88 CPM ≈ 5. Ask the network.',
    [S.gameanalytics, S.liftoffS1, S.singularQ1],
  ),
  dailyActive: c(
    'partner data needed',
    "Share of reached users who play on a given day. Almedia's playtime data for linked users answers it; 40% (30–55%) is a guess.",
  ),
  testDays: c(
    'design choice',
    "14 days of ads: long enough to see CTR decay, short enough for a capped budget. Retargeting effects arrive early: about a third of the first week's effect lands on day 1.",
    [S.gsb],
  ),
  winMax: c(
    'estimate',
    "Request-level: of a reached user's ad requests, the share open to an outside bid at any price (the rest go to direct deals, first-look or exchanges we don't buy). List reach's 80% supply factor is a different, user-level question. No DSP publishes its share of in-app supply. 80% (70–90%). When the frequency cap binds, this only matters at low bids. Loss notices report the minimum bid to win, so the test can measure the real curve.",
    [S.ironsource, S.zhang],
  ),
  winSteep: c(
    'estimate',
    'Win share follows a log-logistic curve b^α / (c^α + b^α); the published fit on web display uses α = 1–2. In-app full-screen is assumed steeper: 2.5 (1.5–3.5). Replace with the measured curve.',
    [S.zhang, S.ironsource],
  ),
  platformFee: c(
    'derived',
    "The CPM we pay includes the DSP or network's cut; the exchange, and so the win curve, sees the rest. Google discloses that publishers keep about 68% on AdSense (a ~32% cut) and a 15% standard fee on Display & Video 360; performance DSPs publish nothing. 25% (15–35%).",
    [S.adsense, S.dv360],
  ),
  medianUsA: c(
    'derived',
    'Median clearing CPM = mean publisher eCPM ÷ 1.32 (mean/median of the log-logistic curve at α = 2.5): US Android mean ~$13 → $10.',
    [S.appodeal, S.tenjin],
  ),
  medianUsI: c('derived', 'Mean US iOS publisher eCPM ~$16 ÷ 1.32 → $12.', [
    appodealIos,
    tenjinIos,
  ]),
  medianEuA: c(
    'derived',
    "EU Android clearing ~$6 (between Appodeal's Europe and UK figures) ÷ 1.32 → $4.50.",
    [appodealEu],
  ),
  medianEuI: c('derived', 'EU iOS clearing ~$9 ÷ 1.32 → $7.', [appodealEu]),

  // Judgement calls
  followOnCeiling: c(
    'estimate',
    "Top of the blended 12-month follow-on range ($1.5–20) for paid-ad activations; it excludes the hot-only optimistic corner ($23.9). Higher values would need Almedia's cohort data. Value is heavy-tailed: a small share of users earn over $1,000.",
    [almediaTail, S.lewis2006],
  ),
  minWin: c(
    'design choice',
    'Below a 5% win share a cheap bid barely delivers impressions, so the dashboard treats it as not buying.',
  ),

  // Test design
  holdout: c(
    'design choice',
    '20% control, because margin per user is noisy and the holdout sets the precision of incrementality. Published re-engagement tests use 10–25% controls.',
    [S.appsflyerIncr, S.youappiIncr, S.playrix, S.liftoffRe, S.lewisRao],
  ),
  budget: c(
    'design choice',
    'Capped at $5k: the test is a measurement of incrementality, prices and follow-on value, not a channel expected to pay for itself yet.',
    [S.lewisRao],
  ),
  sd: c(
    'partner data needed',
    'Standard deviation of margin per linked user. Almedia can compute it from historical margin; $2 (1–3) is a guess, and heavy tails push it up. Revenue-type metrics are high-variance, so tests on them need large samples.',
    [
      S.lewisRao,
      say(
        S.kohavi,
        'If you are running an A/B test and want to detect a 5% change to revenue, you will need over 409,000 users to achieve the desired 80% power',
      ),
    ],
  ),
  alpha: c(
    'design choice',
    '5% two-sided (95% confidence), fixed before the test: the usual convention for controlled experiments.',
    [
      S.kohavi,
      say(
        S.zhong,
        'The type I error is usually set at two sided 0.05, not all, but some study design is exceptive.',
      ),
    ],
  ),
  power: c(
    'design choice',
    '80% power: the usual convention (online-experiment guides cite 80–95%).',
    [
      S.zhong,
      say(
        S.kohavi,
        'Power. Commonly desired to be around 80–95%, although not directly controlled.',
      ),
    ],
  ),
};
