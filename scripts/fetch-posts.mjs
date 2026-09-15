// Fetch public post metadata for a list of x.com URLs via api.fxtwitter.com (no auth).
// usage: node scripts/fetch-posts.mjs data/wave_<slug>.urls.json data/wave_<slug>.posts.json
import fs from 'node:fs';
const [,, inFile, outFile] = process.argv;
const urls = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const out = { ...prev };
for (const u of urls) {
  const id = (u.match(/status\/(\d+)/) || [])[1];
  if (!id || (out[id] && (out[id].avatar_url || out[id].error))) continue;
  try {
    const r = await fetch(`https://api.fxtwitter.com/status/${id}`);
    const j = await r.json();
    if (!j.tweet) { out[id] = { id, error: j.message || r.status }; continue; }
    const t = j.tweet;
    out[id] = {
      id, url: t.url, author: t.author.screen_name, author_name: t.author.name, followers: t.author.followers,
      author_desc: t.author.description, avatar_url: t.author.avatar_url, created_at: new Date(t.created_timestamp * 1000).toISOString(),
      views: t.views, likes: t.likes, replies: t.replies, retweets: t.retweets, quotes: t.quotes, bookmarks: t.bookmarks,
      text: t.text, lang: t.lang, is_note: !!t.is_note_tweet,
      media: (t.media?.all || []).map(m => ({ type: m.type, duration: m.duration || null })),
      replying_to: t.replying_to || null, quote_of: t.quote?.id || null,
    };
    process.stdout.write(`${t.author.screen_name} ${t.views} ${t.likes}\n`);
  } catch (e) { out[id] = { id, error: String(e) }; }
  await new Promise(r => setTimeout(r, 250));
}
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log('saved', Object.keys(out).length);
