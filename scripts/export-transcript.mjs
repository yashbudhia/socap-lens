// Exports a Claude Code session log (JSONL) as a readable, redacted HTML transcript for sharing.
// usage: REDACT_WORDS="word1,word2" STOP_AT="text of a user message" node scripts/export-transcript.mjs <session.jsonl> <out.html>
// STOP_AT (optional) ends the export just before the first user message that starts with that text.
// Keeps: the user's typed messages, the assistant's visible replies, tool calls (name + what they did) and truncated tool results.
// Drops: system prompts and reminders, hook chatter, the agent's extended-thinking blocks, images.
// Redacts: bearer tokens and API-key-shaped strings, email addresses, phone-number-shaped digit runs, home directory paths,
// plus any literal words passed in REDACT_WORDS. Review the output before sharing it; this is a best effort, not a guarantee.
import fs from 'node:fs';
const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error('usage: node scripts/export-transcript.mjs <session.jsonl> <out.html>'); process.exit(1); }
const lines = fs.readFileSync(inFile, 'utf8').split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const words = (process.env.REDACT_WORDS || '').split(',').map(s => s.trim()).filter(Boolean);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function redact(t) {
  let s = String(t ?? '');
  for (const w of words) s = s.split(w).join('[redacted]');
  return s.replace(/Bearer\s+[A-Za-z0-9._\-]{10,}/g, 'Bearer [redacted]')
    .replace(/\b(sk|pk|rk|key|token|secret)[-_][A-Za-z0-9]{16,}\b/gi, '[redacted-key]')
    .replace(/\b[A-Za-z0-9_]*(API_KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*\s*=\s*\S+/g, m => m.replace(/=.*/, '=[redacted]'))
    .replace(/mongodb(\+srv)?:\/\/[^\s"']+/g, 'mongodb://[redacted]')
    .replace(/[A-Za-z0-9._%+-]+@(?!socialcap\.uk|sociallcapital\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email redacted]')
    .replace(/\+\d[\d\s().-]{8,}\d/g, '[number redacted]')
    .replace(/[A-Z]:\\Users\\[^\\\s"']+/g, '~').replace(/\/c\/Users\/[^/\s"']+/g, '~').replace(/\/home\/[^/\s"']+/g, '~');
}
function stripSystem(t) {
  return String(t ?? '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '').replace(/<command-message>[\s\S]*?<\/command-message>/g, '').replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/\[SYSTEM NOTIFICATION[\s\S]*?<\/task-notification>/g, '')
    .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '')
    .replace(/^\[Image[^\]]*\][^\n]*$/gm, '')
    .replace(/Stop hook feedback:[\s\S]*$/g, '').replace(/Stop hook blocking error[\s\S]*$/g, '')
    .replace(/^Skill \/\w+ is already loaded.*$/gm, '')
    .replace(/# Environment update[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/Note: .* changed on disk since you last read it[\s\S]*$/g, '')
    .replace(/Base directory for this skill:[\s\S]*$/g, '')
    .replace(/Only you see that command's output[^\n]*\n?/g, '').replace(/You used a single tool call this turn[^\n]*\n?/g, '')
    .replace(/The user hasn't heard from you in a while[^\n]*\n?/g, '').replace(/Shell cwd was reset[^\n]*\n?/g, '')
    .trim();
}

const items = []; const toolNames = new Map(); const stopAt = process.env.STOP_AT || '';
for (const j of lines) {
  if (j.isSidechain) continue;
  if (stopAt && j.type === 'user' && typeof j.message?.content === 'string' && stripSystem(j.message.content).startsWith(stopAt)) break;
  const c = j.message?.content;
  if (j.type === 'user') {
    if (typeof c === 'string') { const t = stripSystem(c); if (t) items.push({ k: 'user', t, ts: j.timestamp }); }
    else if (Array.isArray(c)) for (const b of c) {
      if (b.type === 'text') { const t = stripSystem(b.text); if (t) items.push({ k: 'user', t, ts: j.timestamp }); }
      else if (b.type === 'image') items.push({ k: 'user', t: '[attached a screenshot]', ts: j.timestamp });
      else if (b.type === 'tool_result') {
        const t = typeof b.content === 'string' ? b.content : (b.content || []).map(x => x.type === 'text' ? x.text : x.type === 'image' ? '[screenshot]' : '').join('\n');
        items.push({ k: 'result', tool: toolNames.get(b.tool_use_id) || 'tool', t: stripSystem(t), err: !!b.is_error });
      }
    }
  } else if (j.type === 'assistant' && Array.isArray(c)) {
    for (const b of c) {
      if (b.type === 'text' && b.text.trim()) items.push({ k: 'assistant', t: b.text, ts: j.timestamp });
      else if (b.type === 'tool_use') {
        toolNames.set(b.id, b.name); const i = b.input || {};
        const what = i.description || i.command || i.url || i.query || i.file_path || i.prompt || i.skill || i.pattern || '';
        items.push({ k: 'call', tool: b.name, what: String(what).slice(0, 220), input: JSON.stringify(i, null, 1), ts: j.timestamp });
      }
    }
  }
}
// attach results to calls, group consecutive calls
const merged = [];
for (const it of items) {
  const last = merged[merged.length - 1];
  if (it.k === 'result') { const g = last?.k === 'group' ? last.calls : last?.k === 'call' ? [last] : []; const open = g.find(c => !c.result); if (open) open.result = it; continue; }
  if (it.k === 'call' && last && (last.k === 'call' || last.k === 'group')) { merged.pop(); const g = last.k === 'group' ? last : { k: 'group', calls: [last] }; g.calls.push(it); merged.push(g); continue; }
  merged.push(it);
}

const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';
const md = t => esc(redact(t)).replace(/```([\s\S]*?)```/g, (m, code) => `<pre>${code.replace(/^\w*\n/, '')}</pre>`).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^- /gm, '• ').replace(/\n/g, '<br>');
const trunc = (t, n) => { t = redact(t); return t.length > n ? t.slice(0, n) + `\n… (${t.length - n} more characters)` : t; };
const callHtml = c => `<details class="call"><summary><span class="tn">${esc(c.tool.replace(/^mcp__[^_]+__/, ''))}</span> <span class="what">${esc(redact(c.what))}</span>${c.result?.err ? ' <span class="err">error</span>' : ''}</summary><div class="io"><div class="lbl">input</div><pre>${esc(trunc(c.input, 1200))}</pre>${c.result ? `<div class="lbl">result</div><pre>${esc(trunc(c.result.t, 1500))}</pre>` : ''}</div></details>`;

const first = lines.find(j => j.timestamp)?.timestamp;
const day = first ? new Date(first).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const counts = { user: merged.filter(m => m.k === 'user').length, calls: items.filter(i => i.k === 'call').length };

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Session transcript</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--paper:#F7F7F5;--surface:#fff;--rule:#E6E6E2;--ink:#1A1B1F;--ink-2:#5F6169;--ink-3:#8E9099;--blue-soft:#E9EEFC}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,system-ui,sans-serif;padding:0 20px 80px}
.col{max-width:820px;margin:0 auto}header{padding:48px 0 24px}h1{font-family:"Bricolage Grotesque",sans-serif;font-size:clamp(30px,5vw,44px);letter-spacing:-.03em;line-height:1.05;margin:0 0 12px}
.dek{color:var(--ink-2);margin:0;max-width:60ch}.dek a{color:var(--ink)}.meta{font-size:13px;color:var(--ink-3);margin-top:12px}
.msg{margin:22px 0;display:grid;grid-template-columns:64px 1fr;gap:12px}.msg .who{font-size:12.5px;color:var(--ink-3);padding-top:6px;text-align:right}
.msg.user .body{background:var(--blue-soft);border-radius:14px;padding:12px 16px;font-weight:500}
.msg.assistant .body{background:var(--surface);border:1px solid var(--rule);border-radius:14px;padding:12px 16px}
.body pre{background:#F1F1EE;border-radius:8px;padding:10px 12px;overflow:auto;font-size:12.5px;white-space:pre-wrap;word-break:break-word}.body code{background:#F1F1EE;border-radius:4px;padding:1px 5px;font-size:13px}
.group{margin:8px 0 8px 76px}.call{border-left:2px solid var(--rule);padding:2px 0 2px 12px;margin:4px 0;font-size:13px}
.call summary{cursor:pointer;list-style:none;color:var(--ink-2)}.call summary::-webkit-details-marker{display:none}.call .tn{font-weight:600;color:var(--ink)}.call .what{color:var(--ink-2)}.call .err{color:#B42318;font-weight:600}
.call .io{margin:6px 0 4px}.call .lbl{font-size:11px;color:var(--ink-3);margin:6px 0 2px}.call pre{background:#F1F1EE;border-radius:8px;padding:8px 10px;overflow:auto;font-size:12px;white-space:pre-wrap;word-break:break-word;max-height:360px;margin:0}
.t{font-size:11.5px;color:var(--ink-3);margin-left:8px;font-weight:400}
@media (max-width:600px){.msg{grid-template-columns:1fr;gap:4px}.msg .who{text-align:left}.group{margin-left:0}}
footer{margin-top:48px;padding-top:18px;border-top:1px solid var(--rule);color:var(--ink-3);font-size:13px}
</style></head><body><div class="col">
<header><h1>How the launch study was built</h1>
<p class="dek">The working session behind <a href="./">Anatomy of a viral launch</a>: every message I typed, every reply, and every tool call the agent made, in order. Tool calls are collapsed; open one to see its input and result.</p>
<p class="meta">${day}. ${counts.user} messages from me, ${counts.calls} tool calls by the agent (Claude Code). System prompts, the agent's private reasoning, and screenshots are not included. Keys, contact details and home paths are redacted.</p></header>
${merged.map(m => m.k === 'user' ? `<div class="msg user"><div class="who">Yash<span class="t">${fmtTime(m.ts)}</span></div><div class="body">${md(m.t)}</div></div>`
  : m.k === 'assistant' ? `<div class="msg assistant"><div class="who">Agent<span class="t">${fmtTime(m.ts)}</span></div><div class="body">${md(m.t)}</div></div>`
  : m.k === 'call' ? `<div class="group">${callHtml(m)}</div>` : `<div class="group">${m.calls.map(callHtml).join('')}</div>`).join('\n')}
<footer>Exported from the Claude Code session log with scripts/export-transcript.mjs in the repo.</footer>
</div></body></html>`;
fs.writeFileSync(outFile, html);
console.log('wrote', outFile, 'messages', counts.user, 'calls', counts.calls, 'bytes', html.length);
