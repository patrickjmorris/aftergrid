// The deck, written once. build-deck.mjs renders it as HTML and PDF; build-page.mjs as the site page.
// Every number comes from numbers.mjs, which reads analysis/results/.
import { N, S, x, int, change } from './numbers.mjs';

const GH = 'https://github.com/patrickjmorris/aftergrid/blob/main/examples/spotsports-youtube';
const TREE = 'https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube';
const num = Number;
const md = (d) => `${num(d.slice(5, 7))}/${num(d.slice(8, 10))}`;
const range = (r, lo, hi, v) => `${x(r[v])} (${x(r[lo])} to ${x(r[hi])})`;

export const meta = {
  title: 'Sports YouTube’s fall 2026 will look like a record season. The new view count is the leading reason',
  description: `Real data from ${N.channels} sports creator channels across 14 sports. Same creators, same video age: long-form views rose ${N.pooledPct} after YouTube changed how it counts a view, in the same weeks the football and soccer seasons began. What it means for creators, clubs, leagues, and sponsors.`,
  kicker: 'Analysis · Real data · Sports YouTube',
};

const weekly = S.events.filter((r) => r.publish_start <= '2026-09-21');
const nullLabel = (c) => c.startsWith('long-form 28-30d: published before') ? 'Long-form, after vs before July 1 (old rule)'
  : c.startsWith('long-form 28-30d: published 2026-08-31') ? 'Long-form, Sept 14 on vs Aug 31 to Sept 13 (new rule)'
  : c.startsWith('shorts 12-14d: published before') ? 'Shorts, after vs before May 1'
  : c.startsWith('shorts 12-14d across') ? 'Shorts across the change (rule unchanged)'
  : c.startsWith('shorts across the switch, without') ? 'Shorts across the change, without its largest channel'
  : c.startsWith('long-form 2025') ? 'Long-form, same weeks in 2025 (unequal ages)'
  : c.startsWith('shorts 2025') ? 'Shorts, same weeks in 2025 (unequal ages)' : c;
const nullRows = S.nulls.filter((r) => r.in_null_spread === 'yes');
const transitionLabel = (p) => p.startsWith('2026-08-31') || p.includes('on') ? 'Aug 31 on' : p.replace('2026-', '').replace('..', ' to ').replace(/(\d\d)-(\d\d)/g, (_, m, d) => `${num(m)}/${num(d)}`);
const groupLabel = (t) => t === 'sport' ? 'Long-form, sport' : t === 'shorts sport' ? 'Shorts, sport' : t === 'duration' ? 'Long-form, length'
  : t.includes('independent') && !t.startsWith('null') ? 'Long-form, channel size' : t.startsWith('null') ? 'Channel size, nothing changed' : 'Channel size, biased split (kept for record)';
const groupName = { 'published on/after 2026-08-24': 'Published Aug 24, 2026 or later', 'published 2026-07-26..08-23': 'Published Jul 26 to Aug 23, 2026', 'published 2026-01-01..07-25': 'Published Jan 1 to Jul 25, 2026', 'published 2025': 'Published in 2025', 'all long-form': 'All long-form' };
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const sports = S.segments.filter((r) => r.segment_type === 'sport').sort((a, b) => num(b.channels) - num(a.channels));
const cat = (sp) => S.catalog.find((r) => r.sport === sp);
const catShare = (sp) => num(cat(sp).share_of_stored_long_form_views);
const catalogHeadline = `Soccer and basketball hold ${Math.round((catShare('Soccer') + catShare('Basketball')) * 100)}% of long-form views; football’s ${cat('Football').channels} channels draw as much as baseball’s ${cat('Baseball').channels}`;
const seg = (type, label) => S.segments.find((r) => r.segment_type === type && r.label === label);
const pairSports = ['Soccer', 'Football', 'Basketball', 'Baseball', 'Hockey', 'Golf', 'Tennis', 'Running'];
const lfPair = pairSports.map((l) => seg('sport', l)), shPair = pairSports.map((l) => seg('shorts sport', l));
const pairLfWins = pairSports.filter((_, i) => num(lfPair[i].ratio_of_totals) > num(shPair[i].ratio_of_totals));
const pairExceptions = pairSports.filter((l) => !pairLfWins.includes(l));
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const clearCount = sports.filter((r) => num(r.rt_lo) > 1).length;
const sportChange = (l) => change(seg('sport', l).ratio_of_totals);

const APX = ['catalog', 'calendar', 'sportWeekly', 'weekly', 'channels', 'channelsBySport', 'named', 'formats', 'sportFormats', 'ranks', 'length', 'size', 'primary', 'transition', 'nulls', 'segments', 'sensitivity', 'lifetime'];
const shifts = (row) => Object.fromEntries([...row.sport_shifts.matchAll(/([A-Za-z][A-Za-z ]*?):([+-]?\d+\.\d)/g)].map((m) => [m[1].trim(), m[2]]));
const trialRows = [S.trial.find((r) => r.cutover.startsWith('switch')), ...S.trial.filter((r) => r.cutover.startsWith('null'))];
const shiftVals = (r) => Object.values(shifts(r)).map(Number);
const lt = (g, a) => `${(num(S.stock.find((r) => r.group === g && r.accrual === a && r.R_used === 'point').lift_on_stored_total) * 100).toFixed(1)}%`;
const exRatios = S.chExamples.map((r) => num(r.ratio_of_means));
const exMin = S.chExamples.find((r) => num(r.ratio_of_means) === Math.min(...exRatios));
const exMax = S.chExamples.find((r) => num(r.ratio_of_means) === Math.max(...exRatios));
const fmtRows = S.formatLift.filter((r) => r.sport === 'All sports' && r.format !== 'Untagged');
const formatSports = sports.filter((r) => seg('shorts sport', r.label));
const ap = (k) => `A${APX.indexOf(k) + 1}`;
const sportWeeks = [...new Set(S.sportEvents.map((r) => r.publish_start))].filter((w) => w !== '2026-08-10').sort();
const sportSeries = (sp, short) => ({ name: sp, short: short || sp, end: num(seg('sport', sp).ratio_of_totals), values: sportWeeks.map((w) => num(S.sportEvents.find((r) => r.sport === sp && r.publish_start === w).ratio_of_totals)) });

const CONTACT = 'mailto:patrickjohnmorris@gmail.com?subject=Sporting%20Works%20analysis';

export const slides = [
  {
    id: 'takeaway',
    layout: 'title',
    title: 'Report sports performance and price sponsorships on engaged views.',
    facts: [
      ['Measured', `Across ${N.channels} sports channels, long-form videos published August 31 to September 29 had ${N.pooledPct} more first-month public views per video (+${N.pooledLoPct} to +${N.pooledHiPct}) than the same channels’ summer videos. Some of that may be real growth.`],
      ['Season or count?', 'Basketball and hockey rose alongside football and soccer before the NBA and NHL openers: imperfect checks, since basketball includes the WNBA playoffs and hockey training camps. No sport showed a clear Shorts rise.'],
      ['Not measured', 'Engaged views, the old count. Each channel sees them in YouTube Studio; this analysis could not.'],
    ],
    points: [
      'Monday, reporting: compare first-30-day engaged views at matching competition stages with 2025; label public views separately (slide 7).',
      'Monday, sponsorships: for your 10 most recent sponsored long-form videos since August 24 now 30 days old, divide total engaged by total public views; use that share with an agreed engaged CPM (slide 8).',
    ],
    notes: `Data: 535,168 videos from Spot Sports’ catalog of about ${N.catalogChannels} sports creator channels, read 2026-10-27.`,
  },
  {
    id: 'what-changed',
    title: 'On August 24 YouTube changed what a view is, at the start of the busiest stretch of the sports calendar',
    cards: [
      { stat: 'Before', label: 'A view needed a viewer to keep watching', body: 'YouTube never published how long. That count is now called “engaged views” and is available in the creator’s YouTube Studio and through authorized channel reporting.' },
      { stat: 'After', label: 'A view counts when the video starts', body: 'Any play counts, including a few seconds of autoplay in a feed. Shorts already counted this way. Counts from before August 24 were not restated.' },
      { stat: 'Kickoff', label: 'Bad timing for sports', body: `The American football and European soccer seasons were starting. Fall is when sports channels report season starts against last year, so a counting change is easy to read as a great start. Last year these weeks showed no long-form rise, a weak check (appendix ${ap('nulls')}).` },
    ],
    notes: 'Rule change source: Social Media Today, 2026-08-17.',
  },
  {
    id: 'jump',
    title: 'Different sports calendars, the same week of rising public views',
    lead: 'Each line is one sport’s new long-form videos by publish week, read at one month old, against the same channels’ videos from before the change.',
    temptingLabel: 'Could it be the season?',
    tempting: `Football starting, baseball nearing the postseason, NBA and NHL openers still ahead, yet all four rose the same week. Basketball includes the WNBA playoffs and hockey training camps, so neither is a season-free control. That supports, but does not isolate or size, a counting contribution.`,
    chart: {
      kind: 'line',
      labels: sportWeeks.map(md),
      series: [sportSeries('Football'), sportSeries('Baseball'), sportSeries('Basketball'), sportSeries('Hockey')],
      marker: { at: '8/24', label: 'Aug 24: new count' },
      endLabel: 'All weeks since',
      gapAfter: '8/3',
      caption: `Change in views per video against each channel’s earlier videos; late July to mid-August publishes straddle the change, and the thin August 10 week is left out. End labels pool every week since the change, as on slide 5. Soccer and all sports: appendix ${ap('sportWeekly')} and ${ap('weekly')}.`,
      source: 'sport_event_study.csv',
    },
    notes: `The full step starts with videos published August 27; those from August 24 to 26 rose about ${N.aug24to26Pct} across all sports (appendix ${ap('transition')}).`,
  },
  {
    id: 'season-test',
    title: `Same sports, same weeks: long-form rose in all eight. Shorts, whose counting did not change, rose clearly in ${shPair.filter((r) => num(r.tv_lo) > 1).length ? words[shPair.filter((r) => num(r.tv_lo) > 1).length] : 'none'}`,
    lead: `On the typical video, long-form rose ${change(Math.min(...lfPair.map((r) => num(r.typical_video))))} to ${change(Math.max(...lfPair.map((r) => num(r.typical_video))))} in all eight sports. Shorts, counted the same way before and after, ran ${change(Math.min(...shPair.map((r) => num(r.typical_video))))} to ${change(Math.max(...shPair.map((r) => num(r.typical_video))))}.  Shorts are a different format, read at 12 to 14 days, so this weighs against a season-wide surge without ruling one out. Shorts fell on the typical video (${x(S.sh.typical_video)}, ${x(S.sh.tv_lo)} to ${x(S.sh.tv_hi)}); if viewers moved from Shorts to long-form, part of the long-form rise is real viewing, which this analysis cannot separate.`,
    chart: {
      kind: 'pairs',
      labels: pairSports,
      series: [
        { name: 'Long-form, one month old', values: lfPair.map((r) => num(r.typical_video)), lo: lfPair.map((r) => num(r.tv_lo)), hi: lfPair.map((r) => num(r.tv_hi)) },
        { name: 'Shorts, two weeks old', values: shPair.map((r) => num(r.typical_video)), lo: shPair.map((r) => num(r.tv_lo)), hi: shPair.map((r) => num(r.tv_hi)) },
      ],
      caption: `Typical video (geometric mean), so one big channel cannot dominate; slides 3 and 5 use views per video, so football reads ${change(seg('sport', 'Football').typical_video)} here and ${sportChange('Football')} there. Bar height is views after ÷ before for the same channels; labels show the change, and lines the range from channel sampling. Sports with at least 20 Shorts channels.`,
      source: 'lift_by_segment.csv',
    },
    notes: `No unchanged long-form comparison spans late summer into fall (appendix ${ap('nulls')}).`,
  },
  {
    id: 'by-sport',
    title: 'Every sport’s typical video rose; on views per video, running and cycling are within noise. Do not sell any one as the biggest gainer',
    lead: `Long-form views at one month old, each sport’s channels against their own earlier videos. Soccer ran above its own baseline in July, during the World Cup, and spiked again in the Sept 7 week, so do not read its ${sportChange('Soccer')} as counting alone (appendix ${ap('sportWeekly')}). Between seasons, ${N.hockeyChRose} of hockey channels rose, against about ${N.hockeyChNull} in a smaller no-change sample (${ap('channelsBySport')}). Named channels ran from ${x(exMin.ratio_of_means)} (${exMin.channel_title}, range ${x(exMin.lo)} to ${x(exMin.hi)}) to ${x(exMax.ratio_of_means)} (${exMax.channel_title}, whose summer had no games): price each creator on their own engaged share (${ap('named')}).`,
    chart: {
      kind: 'bars',
      labels: sports.map((r) => r.label),
      values: sports.map((r) => num(r.ratio_of_totals)),
      lo: sports.map((r) => num(r.rt_lo)),
      hi: sports.map((r) => num(r.rt_hi)),
      caption: `On the typical video all ${sports.length} sports rose, ${x(Math.min(...sports.map((r) => num(r.typical_video))))} to ${x(Math.max(...sports.map((r) => num(r.typical_video))))} (${ap('segments')}). Sorted by number of channels, largest first. Bar height is views after ÷ before; labels show the change, and lines the range from channel sampling. Channels per sport range from 14 to 171.`,
      source: 'lift_by_segment.csv',
    },
    notes: 'Sport is the channel’s main sport in Spot Sports’ catalog.',
  },
  {
    id: 'season-over-season',
    title: 'Cross-season public-view records mix two counts. Post-change videos are overrepresented in this sample’s top 1,000',
    cards: [
      { stat: `+${N.pooledPct}`, label: 'New videos vs the same creators’ summer videos', body: 'A new video’s first month runs far above the same creator’s earlier videos. Any recap that compares this fall with last fall on public views mixes two counts.' },
      { stat: N.top1000PostShare, label: 'Of the top 1,000 videos', body: `Among long-form videos published May 8 to July 26 or August 31 to September 29, each at one month old, those after the change are ${N.poolPostShare} of uploads but ${N.top1000PostShare} of the 1,000 most viewed. A uniform ${N.pooled} adjustment cuts their share to ${N.top1000ScaledShare}: a sensitivity to counting, not a measured correction. The windows also differ by season, summer against early fall, so part of the gap may be season.` },
      { stat: 'No blanket correction', label: `The ${N.pooledPct} rise is not a discount for your whole channel`, body: `Older videos contain views counted under different rules, and this study does not measure engaged views. For Monday’s report, show first-30-day engaged views against matching competition stages in 2025, and label public views separately. Lifetime-total scenarios are in appendix ${ap('lifetime')}.` },
    ],
    notes: 'Ranking: videos published May 8 to July 26 against August 31 to September 29, each read at one month old.',
  },
  {
    id: 'creators-teams',
    title: 'For sports creators, clubs, and leagues: report the season on engaged views, and label every count',
    lead: `Measured on ${N.channels} sports channels, including league and club channels, which ranged from no clear change (NBA, Manchester United) to ${x(S.chExamples.find((r) => r.channel_title === 'Major League Soccer').ratio_of_means)} (Major League Soccer, whose summer baseline overlapped the World Cup) (appendix ${ap('named')}).  Shorts already used the new rule, so keep long-form and Shorts separate and measure your own gap before estimating a whole-channel effect. Compare engaged views with matching 2025 weeks and competition stages; show public views only beside engaged views, both labeled.`,
    asks: [
      ['Season recaps by sport', 'Report line: “[stage, format]: X first-30-day engaged views, Y% vs the matching 2025 stage; public views Z, new count.” Football: weeks 1 to 4. MLB: same postseason rounds. Soccer: match stages; July’s World Cup is a different baseline. NBA and NHL: openers pending until day 30.'],
      ['Rate cards and media kits', `Name the count behind every number. New videos average ${N.pooled} the public views of the same channels’ summer videos (${x(S.lf.rt_lo)} to ${x(S.lf.rt_hi)}), including any real growth. Among the ${N.chCount} channels with five or more videos on each side, about ${N.chUnder125} moved less than 1.25x and ${N.chOver4} more than 4x: observed changes, not measured counting effects (appendix ${ap('channels')}). Before a sponsor asks, put your own day-30 public and engaged views side by side, and quote engaged first.`],
      ['Records and rankings', `Label records set after August 24 as records under the new count. Football’s opening weeks and the October NBA and NHL openers use a different count from 2025; before claiming a cross-season record, compare engaged views at the same video age.`],
    ],
    notes: 'Engaged views are not public; creators see them in YouTube Studio.',
  },
  {
    id: 'sponsors',
    title: 'Selling sponsorships: agree a CPM per 1,000 engaged views; convert public-view requests with each creator’s measured engaged share',
    stats: [
      { value: 'Fee = views × share ÷ 1,000 × CPM', label: 'Public views × engaged share ÷ 1,000 × engaged-view CPM; e.g. 1,000,000 × 70% ÷ 1,000 × $30 = $21,000. Engaged share is each creator’s day-30 engaged ÷ public views in YouTube Studio; this study could not see it. Keep an existing engaged-view rate; agree metric and rate before renewing a public-view contract', sub: 'For a guarantee, agree an engaged-view target and reconcile against actual engaged views' },
      { value: '$21,000', label: 'Hypothetical 70% engaged share: 1 million public views hold 700,000 engaged views. Paying $30,000 means a $42.86 engaged-view CPM; at an agreed $30, the fee is $21,000, $9,000 less', sub: 'The 70% share is hypothetical; substitute the creator’s measured share' },
    ],
    lead: `Do not use 1 ÷ ${N.pooled.replace('x', '')} to price a creator. Your engaged share: take your 10 most recent sponsored long-form videos published since August 24 that have reached day 30, and divide total engaged by total public views over each one’s first 30 days; disclose a smaller sample, and report Shorts separately. Football and soccer: base guarantees on comparable competition stages. NBA and NHL: mark opener guarantees provisional and rebase in late November, when October videos reach day 30 (${ap('calendar')}). Packages: long-form and Shorts separately; the ${N.pooledPct} is long-form only.`,
    notes: 'The $30 is an example price. We have not measured any creator’s engaged-view share.',
  },
  {
    id: 'triggers',
    title: 'What would change this read, and when to look',
    triggers: [
      { when: 'Late November 2026', what: `October videos, published as the NBA and NHL seasons start, reach one month old. Recheck the rise, and ask creators for public and engaged counts on the same videos. So far the Sept 7 week spiked to ${N.sep7Change}, led by soccer (appendix ${ap('sportWeekly')}); the Sept 21 week, at ${N.sep21Change}, is back near the Aug 31 week (${N.aug31Change}), and videos from Sept 14 on run ${N.newRuleNullChange.replace('−', '')} below the first two post-change weeks (appendix ${ap('nulls')}).` },
      { when: 'What would settle it', what: `What would settle it: public and engaged views on the same videos from a representative set of sports creators, matched by age. What we have: ${N.cutCount} re-cuts of public views all show a rise (+${N.sensLowPct} to +${N.sensHighPct}, appendix ${ap('sensitivity')}); none of them sees engaged views. Unexplained: the full step starts with videos published August 27, not August 24 (appendix ${ap('transition')}).` },
      { when: 'The assumption', what: `The evidence points to counting, but we cannot yet split the rise between counting and real viewing growth. The 74% rise cannot tell a creator’s engaged share or sponsorship discount: request public and engaged counts on the same sponsored videos, and agree the engaged-view CPM separately. Last year’s same weeks, the only long-form check that spans a season start, showed no rise (${N.lf2025}, ${N.lf2025Lo} to ${N.lf2025Hi}), though video ages differ widely (appendix ${ap('nulls')}).` },
    ],
    notes: 'The November date is when videos published in early October reach one month old.',
  },
  {
    id: 'pitch',
    layout: 'closing',
    title: 'Sports YouTube is our beat. Have a number that moved? Sporting Works turns it into a decision',
    lead: `Built on Spot Sports’ catalog of about ${N.catalogChannels} sports creator channels in ${N.catalogSports} sports (${N.channels} channels in ${sports.length} sports met the analysis bar), by Patrick Morris at Sporting Works with aftergrid, open-source analytics skills for the AI agent your team already uses.`,
    offers: [
      ['Season reporting', 'Season-over-season views, records, and rankings that hold up when the count changes.'],
      ['Sponsor-ready numbers', 'Rate cards and sponsor reports built on engaged views, by sport and channel size.'],
      ['The workflow', 'The same skills set up in your team’s agent, so the next analysis starts here.'],
    ],
    links: [['Email Patrick', CONTACT], ['aftergrid on GitHub', 'https://github.com/patrickjmorris/aftergrid'], ['How this analysis was built', 'https://github.com/patrickjmorris/aftergrid/blob/main/docs/examples/spotsports-youtube-how-it-was-built.md']],
    notes: 'Agent-made and AI-reviewed. Not human-approved.',
  },
];

const tbl = (title, source, head, rows, note) => ({ title, source, head, rows, note });
const ratioCells = (r) => [range(r, 'rt_lo', 'rt_hi', 'ratio_of_totals'), range(r, 'tv_lo', 'tv_hi', 'typical_video')];
const impactLabel = { 'creators': 'Creators', 'sponsors': 'Sponsors' };
const impactQuantity = (q) => q.startsWith('share of a post-change count') ? 'Scenario: share the old rule would have excluded, if counting explains the entire rise, 1 − 1/ratio' + (q.includes('typical') ? ', typical video' : ', pooled')
  : q.startsWith('price per public view') ? 'Scenario: public-view price that keeps the old-rule CPM, if counting explains the entire rise, 1/ratio'
  : q.startsWith('cost per old-rule view') ? 'Scenario: cost per old-rule view at an unchanged public-view price, if counting explains the entire rise' : cap(q);

export const appendix = [
  tbl(`${ap('catalog')}. ${catalogHeadline}`, 'sport_catalog.csv', ['Sport', 'Channels', 'Videos', 'Long-form share', 'Median long-form length', 'Share of long-form views'],
    S.catalog.map((r) => [r.sport, int(r.channels), int(r.videos), `${Math.round(num(r.long_form_share_of_videos) * 100)}%`, r.median_long_form_minutes ? `${Math.round(num(r.median_long_form_minutes))} min` : 'n/a', `${(num(r.share_of_stored_long_form_views) * 100).toFixed(1)}%`]),
    `Each channel is assigned its most common sport. Views are stored public counts at the last reading, all ages. Sports with fewer than 10 analyzable channels (${S.catalog.filter((r) => !sports.some((x) => x.label === r.sport)).map((r) => r.sport.toLowerCase()).join(', ')}) are not in slides 3 to 9.`),
  tbl(`${ap('calendar')}. Where each sport stood when the count changed, how much it rose, and the first fair comparison with 2025`, 'sports calendar; lift_by_segment.csv', ['Sport', 'August 24 to September 21', 'Rise, views per video', 'First like-for-like comparison with 2025, on engaged views'],
    [['Football', 'Season starting: college kickoff, then the NFL', sportChange('Football'), 'Weeks 1 to 4 of each season, same video age'],
      ['Basketball', 'NBA between seasons; WNBA playoffs', sportChange('Basketball'), 'October openers against last October’s'],
      ['Hockey', 'NHL between seasons; training camps', sportChange('Hockey'), 'October openers against last October’s'],
      ['Baseball', 'Final month of the regular season', sportChange('Baseball'), 'Postseason rounds against last year’s same rounds'],
      ['Soccer', 'European leagues starting; summer was World Cup season', sportChange('Soccer'), 'Same competition stage, not July'],
      ['All sports', 'Shorts counting unchanged', `+${N.pooledPct}`, 'Long-form only; ask for Shorts separately']],
    'Calendar positions are general knowledge, not data in this extract. Compare first-30-day engaged views from YouTube Studio, not public views.'),
  { key: 'sportWeekly', title: `${ap('sportWeekly')}. The weekly rise in the five largest sports`, source: 'sport_event_study.csv',
    lead: `Soccer was already above its baseline in July, during the World Cup’s final weeks: do not read its full ${sportChange('Soccer')} pooled rise as counting, or use it as a soccer pricing discount. Football’s season start coincides with the change; basketball and hockey avoid the NBA and NHL regular-season starts, but other calendar changes remain possible contributors.`,
    chart: { kind: 'line', gapAfter: '8/3', labels: sportWeeks.map(md), series: [sportSeries('Soccer'), sportSeries('Football'), sportSeries('Baseball'), sportSeries('Basketball'), sportSeries('Hockey')], marker: { at: '8/24', label: 'Aug 24' } },
    note: 'Views per video at one month old against each channel’s pre-change level. The thin August 10 week is left out.' },
  { key: 'weekly', title: `${ap('weekly')}. The weekly rise, all sports`, source: 'event_study.csv',
    chart: { kind: 'line', labels: weekly.map((r) => md(r.publish_start)), series: [{ name: 'Long-form', values: weekly.map((r) => num(r.ratio_of_totals)) }], marker: { at: '8/24', label: 'Aug 24: new count' }, pointLabels: ['9/7', '9/21'] },
    note: `Weeks before 7/20 were read before the change; ${N.jul20AfterShare} of the 7/20 week was read just after it; 7/27 to 8/17 straddle it.` },
  { key: 'channels', title: `${ap('channels')}. Channel by channel: how much each channel’s new videos changed`, source: 'channel_lift_distribution.csv',
    lead: `One ratio per channel with at least 5 videos on each side: ${N.chCount} channels across the change. Where nothing changed, channels center on no change; across the change, most moved up.`,
    chart: { kind: 'pairs', format: 'share', labels: [...new Set(S.chDist.map((r) => r.channel_ratio))],
      series: [{ name: 'Across the change', values: S.chDist.filter((r) => r.comparison.startsWith('switch')).map((r) => num(r.share)) },
        { name: 'Where nothing changed', values: S.chDist.filter((r) => r.comparison.startsWith('nothing')).map((r) => num(r.share)) }] },
    note: 'Share of channels in each band of mean views per new video over mean views per earlier video, at 28 to 30 days. Where nothing changed: published before vs after July 1, all read before August 24.' },
  { key: 'channelsBySport', title: `${ap('channelsBySport')}. Between seasons, ${N.hockeyChRose} of hockey channels and ${N.basketballChRose} of basketball channels rose. Football’s ${N.footballChRose} coincides with kickoff`, source: 'channel_lift_summary.csv',
    lead: `Share of channels whose new videos rose, across the change against a period where nothing changed. Audit season reports across every channel, not just a few breakouts. This shows breadth, not each channel’s counting effect. Football: ${N.footballCh} of ${int(seg('sport', 'Football').channels)} analyzed channels had 5 or more videos on each side.`,
    chart: { kind: 'pairs', format: 'share', labels: ['All sports', 'Soccer', 'Basketball', 'Baseball', 'Hockey', 'Football'],
      series: [{ name: 'Across the change', values: ['All sports', 'Soccer', 'Basketball', 'Baseball', 'Hockey', 'Football'].map((sp) => num(S.chSumm.find((r) => r.comparison.startsWith('switch') && r.sport === sp).share_rose)) },
        { name: 'Where nothing changed', values: ['All sports', 'Soccer', 'Basketball', 'Baseball', 'Hockey', 'Football'].map((sp) => num(S.chSumm.find((r) => r.comparison.startsWith('nothing') && r.sport === sp).share_rose)) }] },
    note: 'Channels with at least 5 videos on each side. Where nothing changed, sports have 14 to 43 channels each, so their shares are rough.' },
  tbl(`${ap('named')}. Named channels moved from ${x(exMin.ratio_of_means)} (${exMin.channel_title}) to ${x(exMax.ratio_of_means)} (${exMax.channel_title}): schedules and counting mix at the channel level`, 'channel_examples.csv', ['Sport', 'Channel', 'Videos before / after', 'New over earlier videos (range)'],
    S.chExamples.map((r) => [r.sport, r.channel_title, `${int(r.pre_videos)} / ${int(r.post_videos)}`, `${x(r.ratio_of_means)} (${x(r.lo)} to ${x(r.hi)})`]),
    'The five largest channels by stored long-form views in each of the five largest sports, with at least 5 videos on each side at 28 to 30 days. Mean views per new video over mean per earlier video; ranges resample each channel’s videos. A channel whose summer had no games, such as college football, mixes its season start with the count; Major League Soccer’s before window overlaps the World Cup summer. Use: ask each of these for its engaged share before renewing a package.'),
  { key: 'formats', title: `${ap('formats')}. ${words[fmtRows.filter((r) => num(r.rt_lo) > 1).length].replace(/^./, (c) => c.toUpperCase())} of ${words[fmtRows.length]} title-tagged formats rose clearly; ${fmtRows.filter((r) => num(r.rt_lo) <= 1).map((r) => r.format.toLowerCase()).join(' and ')} are within noise. No format is shown to differ`, source: 'format_lift.csv',
    lead: `Long-form videos tagged from their titles, all sports. Live streams and watchalongs rose ${change(fmtRows.find((r) => r.format.startsWith('Live')).ratio_of_totals)}; press conferences and interviews ${change(fmtRows.find((r) => r.format.startsWith('Press')).ratio_of_totals)}; the ranges overlap. Price formats from each creator’s engaged share, not from this chart.`,
    chart: { kind: 'bars', labels: fmtRows.map((r) => r.format), values: fmtRows.map((r) => num(r.ratio_of_totals)), lo: fmtRows.map((r) => num(r.rt_lo)), hi: fmtRows.map((r) => num(r.rt_hi)) },
    note: `Keyword rules on video titles, applied in the order shown; most long-form videos match no rule and are left out. Each format compares the same channels’ tagged videos before and after; formats with at least 10 such channels. Video titles are not published.` },
  { key: 'sportFormats', title: `${ap('sportFormats')}. Long-form rose in every sport; Shorts did not clearly rise in any, and basketball Shorts are mixed (${change(seg('shorts sport', 'Basketball').typical_video)} typical, ${change(seg('shorts sport', 'Basketball').ratio_of_totals)} views per video)`, source: 'lift_by_segment.csv',
    lead: `Basketball Shorts give opposite signals, ${change(seg('shorts sport', 'Basketball').typical_video)} on the typical video but ${change(seg('shorts sport', 'Basketball').ratio_of_totals)} on views per video, so a basketball package needs its own Shorts forecast. Football’s typical long-form rose ${change(seg('sport', 'Football').typical_video)} while its Shorts fell ${change(seg('shorts sport', 'Football').typical_video).replace('−', '')}; hockey ${change(seg('sport', 'Hockey').typical_video)} and ${change(seg('shorts sport', 'Hockey').typical_video)}. Do not promise Shorts delivery from long-form growth; set package guarantees from each creator’s counts by format.`,
    chart: { kind: 'pairs', labels: formatSports.map((r) => r.label),
      series: [{ name: 'Long-form, one month old', values: formatSports.map((r) => num(r.typical_video)) },
        { name: 'Shorts, two weeks old', values: formatSports.map((r) => num(seg('shorts sport', r.label).typical_video)) }] },
    note: `Bar height is views after ÷ before on the typical video. Sports with at least 10 Shorts channels; ranges are in appendix ${ap('segments')}.` },
  tbl(`${ap('ranks')}. Average within-week percentile shifts were small (${Math.min(...shiftVals(trialRows[0])).toFixed(1)} to +${Math.max(...shiftVals(trialRows[0])).toFixed(1)} points); individual ranking stability is not established`, 'trial_rank_check.csv', ['Sport', 'Across the change', 'Nothing changed: July 1 split', 'Nothing changed: Sept 14 split'],
    Object.keys(shifts(trialRows[0])).map((sp) => [sp, ...trialRows.map((r) => shifts(r)[sp])]),
    `For a ranking, hold sport, format, video age, and count definition constant; average shifts can hide large individual moves. Shift in each sport’s average percentile within its publish week, in points. Spread across sports: ${N.trialSwitchSd} at the change against ${N.trialNullLow} to ${N.trialNullHigh} where nothing changed.`),
  { key: 'length', title: `${ap('length')}. By video length: no length is shown to gain more than another`, source: 'lift_by_segment.csv',
    lead: `One-to-three-minute videos rose most, but differences between lengths are not established, and length does not identify format; for formats tagged from titles, see appendix ${ap('formats')}.`,
    chart: { kind: 'bars', labels: S.segments.filter((r) => r.segment_type === 'duration').map((r) => r.label), values: S.segments.filter((r) => r.segment_type === 'duration').map((r) => num(r.ratio_of_totals)), lo: S.segments.filter((r) => r.segment_type === 'duration').map((r) => num(r.rt_lo)), hi: S.segments.filter((r) => r.segment_type === 'duration').map((r) => num(r.rt_hi)) },
    note: 'Long-form views per video at one month old, against the same channels’ earlier videos of that length. Lines show the range from channel sampling.' },
  { key: 'size', title: `${ap('size')}. Every size third rose; the middle third also rose ${change(S.segments.filter((r) => r.segment_type.startsWith('null (pre'))[1].ratio_of_totals).replace('+', '')} in a separate no-change window`, source: 'lift_by_segment.csv',
    lead: `The middle third rose ${change(S.segments.filter((r) => r.segment_type.startsWith('channel size by Jan'))[1].ratio_of_totals).replace('+', '')} across the change and ${change(S.segments.filter((r) => r.segment_type.startsWith('null (pre'))[1].ratio_of_totals).replace('+', '')} in a separate no-change window. That warns against reading its full rise as counting; it does not measure how much was drift. Use each creator’s measured engaged share.`,
    chart: { kind: 'pairs', labels: ['Smallest third', 'Middle third', 'Largest third'],
      series: [{ name: 'Across the change', values: S.segments.filter((r) => r.segment_type.startsWith('channel size by Jan')).map((r) => num(r.ratio_of_totals)), lo: S.segments.filter((r) => r.segment_type.startsWith('channel size by Jan')).map((r) => num(r.rt_lo)), hi: S.segments.filter((r) => r.segment_type.startsWith('channel size by Jan')).map((r) => num(r.rt_hi)) },
        { name: 'Where nothing changed', values: S.segments.filter((r) => r.segment_type.startsWith('null (pre')).map((r) => num(r.ratio_of_totals)), lo: S.segments.filter((r) => r.segment_type.startsWith('null (pre')).map((r) => num(r.rt_lo)), hi: S.segments.filter((r) => r.segment_type.startsWith('null (pre')).map((r) => num(r.rt_hi)) }] },
    note: 'Size is each channel’s median lifetime views on long-form videos published January to April 2026, which sit outside both groups. Bar height is views after ÷ before.' },
  { divider: 'Method checks' },
  tbl(`${ap('primary')}. The typical video rose ${N.typical}; views per video rose ${N.pooled}`, 'primary_lift.csv', ['Comparison', 'Views per video', 'Typical video', 'Channels', 'Videos before / after'],
    [S.lf, S.sh].map((r) => [r.estimate.startsWith('long') ? 'Long-form, 28 to 30 days old' : 'Shorts, 12 to 14 days old', ...ratioCells(r), int(r.channels), `${int(r.pre_videos)} / ${int(r.post_videos)}`]),
    'Views per video weights each channel’s videos by their views. Typical video uses the log of views, so small videos count as much as hits. Ranges are 95% channel-resampling intervals. They assume viewing otherwise held steady.'),
  tbl(`${ap('transition')}. The step arrived with August 27 publishes, three days after the switch`, 'transition_lift.csv', ['Published', 'Views per video', 'Typical video', 'Channels', 'Videos'],
    S.transition.map((r) => [transitionLabel(r.published), ...ratioCells(r), int(r.channels), int(r.videos)]), 'Why the full step starts with August 27 publishes, not August 24, is unknown.'),
  tbl(`${ap('nulls')}. Where counting held still, views moved ${x(Math.min(...nullRows.map((r) => num(r.ratio_of_totals))))} to ${x(Math.max(...nullRows.map((r) => num(r.ratio_of_totals))))}, not ${N.pooled}`, 'null_comparisons.csv', ['Comparison', 'Views per video', 'Typical video', 'Channels', 'Counted as no-change'],
    S.nulls.map((r) => [nullLabel(r.comparison), ...ratioCells(r), int(r.channels), r.comparison.startsWith('long-form 28-30d: published 2026-08-31') ? 'Check only: fell' : r.in_null_spread === 'yes' ? 'Yes' : r.in_null_spread === 'no' ? 'No, unequal ages' : 'Check only']), null),
  tbl(`${ap('segments')}. Every sport’s typical long-form video rose ${x(Math.min(...sports.map((r) => num(r.typical_video))))} to ${x(Math.max(...sports.map((r) => num(r.typical_video))))}; no sport’s typical Short rose more than ${x(Math.max(...S.segments.filter((r) => r.segment_type === 'shorts sport').map((r) => num(r.typical_video))))}`, 'lift_by_segment.csv, segment_dispersion.csv', ['Group', 'Segment', 'Views per video', 'Typical video', 'Channels'],
    S.segments.filter((r) => r.segment_type === 'sport' || r.segment_type === 'shorts sport').map((r) => [groupLabel(r.segment_type), r.label, ...ratioCells(r), int(r.channels)]), `Spread across sports: ${N.sportSpreadSwitch} at the change against ${N.sportSpreadNull} where nothing changed (standard deviation of log ratios). Differences between segments are not established. Swimming and fantasy sports have the highest point estimates but the widest ranges, on 14 channels each; do not sell them as the biggest gainers.`),
  tbl(`${ap('sensitivity')}. ${N.cutCount} re-cuts of long-form put the rise at +${N.sensLowPct} to +${N.sensHighPct}; comparing with Shorts gives +${N.shortsCutLow} to +${N.shortsCutHigh}`, 'sensitivity.csv', ['Variant', 'Views per video', 'Typical video'],
    S.sensitivity.map((r) => [cap(r.variant), r.rt_lo ? range(r, 'rt_lo', 'rt_hi', 'ratio_of_totals') : x(r.ratio_of_totals), r.typical_video ? (r.tv_lo ? range(r, 'tv_lo', 'tv_hi', 'typical_video') : x(r.typical_video)) : 'n/a']),
    `${N.cutCount} cuts of long-form against itself give +${N.sensLowPct} to +${N.sensHighPct}. The two rows comparing long-form with Shorts give +${N.shortsCutLow} and +${N.shortsCutHigh}.`),
  tbl(`${ap('lifetime')}. Last season’s videos barely moved in central models, so most 2025 baseline views are old-count. Modeled uplift for 2025 videos: ${lt('published 2025', 'flat_rate')} to ${lt('published 2025', 'even_spread')} in two central scenarios; timestamp bounds span ${lt('published 2025', 'identified_min')} to ${lt('published 2025', 'identified_max')}`, 'stock_translation.csv, review_checks.csv', ['Videos', 'Stored views', 'Flat-rate scenario', 'Even-spread scenario', 'Widest the timestamps allow'],
    ['published on/after 2026-08-24', 'published 2026-07-26..08-23', 'published 2026-01-01..07-25', 'published 2025', 'all long-form'].map((g) => {
      const row = (a) => S.stock.find((r) => r.group === g && r.accrual === a && r.R_used === 'point');
      const p = (v) => `+${(num(v) * 100).toFixed(1)}%`;
      const lo = row('identified_min').lift_on_stored_total, hi = row('identified_max').lift_on_stored_total;
      return [groupName[g], int(row('flat_rate').stored_views), p(row('flat_rate').lift_on_stored_total), p(row('even_spread').lift_on_stored_total), lo === hi ? p(lo) : `${p(lo)} to ${p(hi)}`];
    }), `How much of each group’s stored views the new count added. Every column assumes one factor (${N.pooled}) for every view after the change. Older videos earned most of their views before it.`),
];
