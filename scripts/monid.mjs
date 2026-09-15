// Minimal monid.ai client used for the LinkedIn side of the study.
// Needs MONID_API_KEY in the environment. Every /run is billed, so callers log each run to data/linkedin/runs.jsonl.
import fs from 'node:fs';
const API = 'https://api.monid.ai/v1';
const KEY = process.env.MONID_API_KEY;
if (!KEY) throw new Error('MONID_API_KEY missing');
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
export async function post(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
export async function get(path) {
  const r = await fetch(API + path, { headers: H });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
export async function run(provider, endpoint, input, { label = '', maxWaitMs = 240_000 } = {}) {
  let j = await post('/run', { provider, endpoint, input });
  const id = j.id || j.runId || j.run?.id;
  const t0 = Date.now();
  while (j.status && !/COMPLETED|SUCCEEDED|FAILED|ERROR|TIMED_OUT|ABORTED/i.test(j.status) && Date.now() - t0 < maxWaitMs) {
    await new Promise(r => setTimeout(r, 3000));
    j = await get(`/runs/${id}`);
  }
  const cost = j.cost?.value ?? (j.billing?.actualCost != null ? j.billing.actualCost / 1e6 : null);
  fs.mkdirSync('data/linkedin', { recursive: true });
  fs.appendFileSync('data/linkedin/runs.jsonl', JSON.stringify({ at: new Date().toISOString(), label, provider, endpoint, id, status: j.status, cost }) + '\n');
  process.stderr.write(`[monid] ${label} ${provider}${endpoint} ${j.status} cost=${cost}\n`);
  return j;
}
