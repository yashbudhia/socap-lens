import fs from 'node:fs';
const [,, slug, heroIso] = process.argv; const hero = new Date(heroIso);
const w = JSON.parse(fs.readFileSync(`data/wave_${slug}.posts.json`, 'utf8'));
Object.values(w).filter(p => !p.error).map(p => ({ a: p.author, f: p.followers, lag: ((new Date(p.created_at) - hero) / 3.6e6).toFixed(1), v: p.views, l: p.likes, t: (p.text || '').replace(/\n/g, ' ').slice(0, 90) })).sort((x, y) => x.lag - y.lag).forEach(r => console.log(r.lag.padStart(7), String(r.f).padStart(7), String(r.v).padStart(8), String(r.l).padStart(6), r.a.padEnd(16), r.t));
