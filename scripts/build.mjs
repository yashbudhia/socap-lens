// Aggregates data/*.json into data.json for the static site. Pure Node, no deps.
import fs from 'node:fs';
const rd = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const L = rd('data/launches.json'), B = rd('data/baseline.json');
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const pick = t => ({
  id: t.id, url: t.url, author: t.author.screen_name, author_name: t.author.name, avatar_url: t.author.avatar_url, followers: t.author.followers,
  created_at: new Date(t.created_timestamp * 1000).toISOString(), dow: DOW[new Date(t.created_timestamp*1000).getUTCDay()],
  utc_hour: +(new Date(t.created_timestamp*1000).getUTCHours() + new Date(t.created_timestamp*1000).getUTCMinutes()/60).toFixed(2),
  views: t.views, likes: t.likes, replies: t.replies, retweets: t.retweets, quotes: t.quotes, bookmarks: t.bookmarks,
  video_seconds: (t.media?.all || []).map(m => m.duration).filter(Boolean)[0] || null,
  media_type: (t.media?.all || [])[0]?.type || 'text', text: t.text,
});
const isGreen = s => /(^|\n)\s*>\s*be\b/i.test(s || '');
const launches = L.map(l => {
  const hero = pick(rd(`data/hero_${l.hero_id}.json`).tweet);
  const wave = Object.values(rd(`data/wave_${l.slug}.posts.json`)).filter(p => !p.error && p.id !== l.hero_id).map(p => ({
    id: p.id, url: p.url, author: p.author, author_name: p.author_name, avatar_url: p.avatar_url || null, followers: p.followers, created_at: p.created_at,
    lag_h: +((new Date(p.created_at) - new Date(hero.created_at)) / 3.6e6).toFixed(1),
    views: p.views, likes: p.likes, replies: p.replies, retweets: p.retweets, quotes: p.quotes, bookmarks: p.bookmarks, text: p.text, greentext: isGreen(p.text),
    kind: isGreen(p.text) ? 'lore' : /^@/.test(p.text || '') ? 'reply' : 'post',
  })).sort((a, b) => a.lag_h - b.lag_h);
  return { ...l, hero, wave, derived: {
    views_per_follower: +(hero.views / hero.followers).toFixed(1), reply_rate: +(hero.replies / hero.likes).toFixed(3),
    bookmark_rate: +(hero.bookmarks / hero.likes).toFixed(3), retweet_rate: +(hero.retweets / hero.likes).toFixed(3),
  } };
});
const baseline = B.map(b => { const hero = pick(rd(`data/base_${b.id}.json`).tweet); return { label: b.label, hero, derived: {
  views_per_follower: +(hero.views / hero.followers).toFixed(1), reply_rate: +(hero.replies / hero.likes).toFixed(3),
  bookmark_rate: +(hero.bookmarks / hero.likes).toFixed(3), retweet_rate: +(hero.retweets / hero.likes).toFixed(3) } }; });
const med = a => { a = [...a].filter(x => x != null).sort((x, y) => x - y); if (!a.length) return null; return a.length % 2 ? a[(a.length-1)/2] : (a[a.length/2-1] + a[a.length/2]) / 2; };
const stats = {
  socap: { n: launches.length, median_views: med(launches.map(l => l.hero.views)), median_views_per_follower: med(launches.map(l => l.derived.views_per_follower)),
    median_reply_rate: med(launches.map(l => l.derived.reply_rate)), median_video_seconds: med(launches.map(l => l.hero.video_seconds)),
    mon_tue_share: launches.filter(l => ['Mon','Tue'].includes(l.hero.dow)).length / launches.length,
    founder_account_share: launches.filter(l => l.hero_role === 'founder').length / launches.length },
  baseline: { n: baseline.length, median_views: med(baseline.map(l => l.hero.views)), median_views_per_follower: med(baseline.map(l => l.derived.views_per_follower)),
    median_reply_rate: med(baseline.map(l => l.derived.reply_rate)), median_video_seconds: med(baseline.map(l => l.hero.video_seconds)),
    mon_tue_share: baseline.filter(l => ['Mon','Tue'].includes(l.hero.dow)).length / baseline.length },
};
// roster: account -> launches
const roster = {};
for (const l of launches) for (const p of l.wave) { (roster[p.author] = roster[p.author] || { author: p.author, name: p.author_name, followers: p.followers, launches: new Set(), posts: 0, views: 0, lore: 0 }); const r = roster[p.author]; r.launches.add(l.slug); r.posts++; r.views += p.views || 0; if (p.greentext) r.lore++; }
const rosterArr = Object.values(roster).map(r => ({ ...r, launches: [...r.launches] })).sort((a, b) => b.launches.length - a.launches.length || b.views - a.views);
const allWave = launches.flatMap(l => l.wave.map(p => ({ ...p, slug: l.slug })));
const lore = allWave.filter(p => p.greentext), nonLore = allWave.filter(p => !p.greentext && p.kind === 'post' && p.lag_h >= 0);
stats.wave = { posts: allWave.length, accounts: rosterArr.length, lore_posts: lore.length, lore_launches: new Set(lore.map(p => p.slug)).size,
  median_lore_views: med(lore.map(p => p.views)), median_other_views: med(nonLore.map(p => p.views)),
  day_buckets: allWave.filter(p => p.lag_h >= 0 && p.lag_h < 168).reduce((a, p) => { const d = Math.floor(p.lag_h / 24); a[d] = (a[d] || 0) + 1; return a; }, {}) };
fs.writeFileSync('data.json', JSON.stringify({ generated_at: new Date().toISOString(), launches, baseline, stats, roster: rosterArr }, null, 1));
console.log(JSON.stringify(stats, null, 1));
