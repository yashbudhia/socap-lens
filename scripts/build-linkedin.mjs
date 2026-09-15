// Normalises the raw LinkedIn search results into data/linkedin.json: per launch, posts within -2..+14 days of the X hero post.
import fs from 'node:fs';
const L = JSON.parse(fs.readFileSync('data/launches.json', 'utf8'));
const D = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const FOUNDER = { playerzero: /koratana/i, 'wispr-flow': /tankots|kothari/i, 'poly-ai': /mrk|polyai/i, airwallex: /jack-zhang|jack zhang/i, gamma: /grantlee|grant lee/i, cartesia: /krandiash|karan goel/i, deel: /bouaziz/i, superblocks: /menezes/i, icon: /kennan|icon/i };
const out = { generated_at: new Date().toISOString(), launches: [] };
for (const l of L) {
  const f = `data/linkedin/raw_${l.slug}.json`; if (!fs.existsSync(f)) continue;
  const j = JSON.parse(fs.readFileSync(f, 'utf8')); const raw = j.output?.items || j.output?.results || j.output || [];
  const hero = D.launches.find(x => x.slug === l.slug).hero; const t0 = new Date(hero.created_at);
  const posts = raw.map(p => {
    const at = new Date(p.postedAt?.date || p.postedAt?.timestamp || p.postedAt);
    const a = p.author || {};
    return { id: p.id, url: p.linkedinUrl, at: at.toISOString(), lag_h: +((at - t0) / 3.6e6).toFixed(2),
      author: a.name || a.universalName || a.publicIdentifier || '', author_id: a.publicIdentifier || a.universalName || '', author_url: (a.linkedinUrl || '').split('?')[0], author_info: a.info || '', author_type: a.type || '', avatar_url: a.avatar?.url || null,
      likes: p.engagement?.likes ?? null, comments: p.engagement?.comments ?? null, shares: p.engagement?.shares ?? null,
      text: p.content || '', has_video: !!p.postVideo, has_image: !!(p.postImages && p.postImages.length), is_repost: p.type !== 'post' && !!p.type, brand_partnership: /brand partnership/i.test(a.info || ''), query: p.query };
  }).filter(p => !isNaN(new Date(p.at)));
  const window = posts.filter(p => p.lag_h >= -48 && p.lag_h <= 24 * 14).sort((a, b) => a.lag_h - b.lag_h);
  const heroLi = window.find(p => FOUNDER[l.slug].test(p.author_id + ' ' + p.author + ' ' + p.author_url) && !p.is_repost) || null;
  out.launches.push({ slug: l.slug, client: l.client, x_hero: { author: hero.author, created_at: hero.created_at, views: hero.views, likes: hero.likes, replies: hero.replies, retweets: hero.retweets }, searched: posts.length, in_window: window.length, linkedin_hero: heroLi, wave: window.filter(p => p !== heroLi) });
}
out.cost_usd = fs.existsSync('data/linkedin/runs.jsonl') ? fs.readFileSync('data/linkedin/runs.jsonl','utf8').trim().split('\n').map(l => JSON.parse(l).cost || 0).reduce((a, c) => a + c, 0) : null;
fs.writeFileSync('data/linkedin.json', JSON.stringify(out, null, 1));
for (const l of out.launches) {
  console.log(`\n== ${l.client}: ${l.searched} found, ${l.in_window} in window`);
  if (l.linkedin_hero) { const h = l.linkedin_hero; console.log(`  LI hero: ${h.author} lag ${h.lag_h}h likes ${h.likes} comments ${h.comments} shares ${h.shares} video=${h.has_video} | ${h.text.replace(/\n/g, ' ').slice(0, 80)}`); } else console.log('  LI hero: not found');
  l.wave.forEach(p => console.log(`  ${String(p.lag_h).padStart(7)}h ${String(p.likes).padStart(6)} ${String(p.comments).padStart(5)} ${p.author.padEnd(22).slice(0, 22)} ${p.is_repost ? '[repost] ' : ''}${p.text.replace(/\n/g, ' ').slice(0, 70)}`));
}
