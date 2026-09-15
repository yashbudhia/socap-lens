// One LinkedIn post search per launch via monid -> apify/harvestapi. Billed per result, so maxPosts is capped.
import fs from 'node:fs';
import { run } from './monid.mjs';
const Q = {
  'playerzero': { q: 'PlayerZero Engineering World Model Animesh Koratana', since: '2026-03-15' },
  'poly-ai':    { q: 'PolyAI $200M Nikola Mrkšić', since: '2026-02-10' },
  'airwallex':  { q: 'Airwallex Stripe $1.2 billion Jack Zhang', since: '2025-12-01' },
  'gamma':      { q: 'Gamma Series B $2.1B Grant Lee', since: '2025-11-03' },
  'cartesia':   { q: 'Cartesia Sonic-3 Karan Goel $100M', since: '2025-10-20' },
  'deel':       { q: 'Deel $17.3B Alex Bouaziz $300M', since: '2025-10-09' },
  'superblocks':{ q: 'Superblocks Clark Brad Menezes $60M', since: '2025-05-20' },
  'icon':       { q: 'Icon AI admaker Kennan Davison', since: '2025-01-28' },
};
const only = process.argv.slice(2);
for (const [slug, { q, since }] of Object.entries(Q)) {
  if (only.length && !only.includes(slug)) continue;
  const f = `data/linkedin/raw_${slug}.json`; if (fs.existsSync(f)) continue;
  const j = await run('apify', '/harvestapi/linkedin-post-search', { body: { searchQueries: [q], maxPosts: 30, sortBy: 'relevance', postedLimitDate: since } }, { label: slug });
  fs.writeFileSync(f, JSON.stringify(j, null, 1));
}
