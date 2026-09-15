// usage: node scripts/urls.mjs <slug>  -> builds data/wave_<slug>.urls.json from data/wave_<slug>.txt and fetches posts
import fs from 'node:fs'; import { execSync } from 'node:child_process';
const slug = process.argv[2];
const u = [...new Set(fs.readFileSync(`data/wave_${slug}.txt`, 'utf8').trim().split(/\s+/).filter(Boolean))].map(h => h.startsWith('http') ? h : 'https://x.com' + h);
fs.writeFileSync(`data/wave_${slug}.urls.json`, JSON.stringify(u));
execSync(`node scripts/fetch-posts.mjs data/wave_${slug}.urls.json data/wave_${slug}.posts.json`, { stdio: 'inherit' });
