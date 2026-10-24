import { DateTime } from 'luxon';
import recorded from './recorded.json';
import { selectLines } from './core/lines.js';
import { assemble, baselineRows } from './core/pipeline.js';
import { buildICS, googleLink } from './core/ics.js';
import { fmt, offsetLabel } from './core/convert.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const state = { mode: 'recorded', ex: null, rows: [], source: '', llm: null };
const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// ---------- time zone picker ----------
function fillZones() {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const top = [...new Set([BROWSER_TZ, 'Asia/Taipei', 'Asia/Tokyo', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'UTC'])];
  const opt = (z) => `<option value="${z}">${z.replace(/_/g, ' ')}</option>`;
  $('tz').innerHTML = `<optgroup label="Common">${top.map(opt).join('')}</optgroup><optgroup label="All">${all.filter((z) => !top.includes(z)).map(opt).join('')}</optgroup>`;
  $('tz').value = BROWSER_TZ;
}
const target = () => $('tz').value || BROWSER_TZ;

// ---------- rendering ----------
function highlight(line, quotes) {
  let marks = [];
  const low = line.toLowerCase();
  for (const q of quotes) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) continue;
    const i = low.indexOf(s);
    if (i >= 0) marks.push([i, i + s.length]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  let out = '';
  let at = 0;
  for (const [a, b] of marks) {
    if (a < at) continue;
    out += esc(line.slice(at, a)) + '<mark>' + esc(line.slice(a, b)) + '</mark>';
    at = b;
  }
  return out + esc(line.slice(at));
}

const p2 = (n) => String(n).padStart(2, '0');
function writtenAs(r) {
  const w = r.written;
  const d = DateTime.fromObject({ year: w.y, month: w.m, day: w.d });
  const time = r.noTime ? 'no time given' : `${p2(w.hh === 24 ? 0 : w.hh)}:${p2(w.mm)}${w.hh === 24 ? ' (end of day)' : ''}`;
  return `${d.toFormat('ccc d LLL yyyy')}, ${time}${r.zoneLabel ? ', ' + r.zoneLabel : ''}`;
}

function renderRows(res, { baseline = null, note = '' } = {}) {
  const tz = target();
  state.rows = res.rows;
  $('outTag').textContent = note;
  if (!res.rows.length) {
    $('rows').innerHTML = '<p class="empty">No dates found.</p>';
  } else {
    const card = (r) => {
      const quotes = [r.quote.date, r.quote.time, r.quote.zone, r.zoneText];
      const when = r.status === 'ok'
        ? `<div class="big">${esc(r.local.setZone(tz).toFormat('ccc d LLL, HH:mm'))}</div><div class="sub">${esc(r.local.setZone(tz).toFormat('yyyy'))} · ${esc(tz.replace(/_/g, ' '))} (${esc(offsetLabel(r.local.setZone(tz).offset))})</div>`
        : '<div class="big">Zone not stated</div><div class="sub">Not added to the calendar</div>';
      const alt = r.alt ? `<li>Other reading: ${esc(r.alt.setZone(tz).toFormat('ccc d LLL, HH:mm'))}</li>` : '';
      return `<article class="ev ${r.kind === 'deadline' ? 'deadline' : ''} ${r.status === 'ok' ? '' : 'nozone'}">
        <div><span class="ev-name">${esc(r.name)}</span><span class="ev-kind">${esc(r.kind)}</span></div>
        <div class="ev-when">${when}</div>
        <div class="ev-line">${highlight(r.line, quotes)}</div>
        <div class="ev-read">Code read: ${esc(writtenAs(r))}</div>
        ${r.notes.length || alt ? `<ul class="ev-notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}${alt}</ul>` : ''}
        ${r.status === 'ok' ? `<div class="ev-actions"><a href="${esc(googleLink(r, state.source))}" target="_blank" rel="noopener">Add to Google Calendar</a></div>` : ''}
      </article>`;
    };
    const ok = res.rows.filter((r) => r.status === 'ok');
    const nz = res.rows.filter((r) => r.status !== 'ok');
    $('rows').innerHTML = (ok.length ? ok.map(card).join('') : '<p class="empty">No date with a time zone on this page.</p>')
      + (nz.length ? `<details class="nz"><summary>${nz.length} date${nz.length > 1 ? 's' : ''} with no time zone on the page (kept off the calendar)</summary>${nz.map(card).join('')}</details>` : '');
  }
  $('dropped').innerHTML = res.dropped.length
    ? `<h3>Thrown out by the checker</h3><ul>${res.dropped.map((d) => `<li><b>${esc(d.name)}:</b> ${esc(d.why)}</li>`).join('')}</ul>` : '';
  $('baseline').innerHTML = baseline ? renderBaseline(baseline, res.rows) : '';
  const n = res.rows.filter((r) => r.status === 'ok').length;
  $('ics').disabled = !n;
  $('icsLabel').textContent = n ? `Download .ics (${n} event${n > 1 ? 's' : ''})` : 'Download .ics';
}

function renderBaseline(b, rows) {
  const ours = rows.filter((r) => r.status === 'ok').map((r) => r.local.setZone('Asia/Taipei'));
  const li = b.rows.map((x) => {
    const t = DateTime.fromFormat(x.taiwan || '', 'yyyy-LL-dd HH:mm', { zone: 'Asia/Taipei' });
    let verdict = '<span class="verdict-bad">not a date on the page</span>';
    if (t.isValid && ours.length) {
      const near = ours.reduce((a, o) => (Math.abs(o.diff(t).as('minutes')) < Math.abs(a.diff(t).as('minutes')) ? o : a));
      const mins = Math.round(t.diff(near).as('minutes'));
      if (mins === 0) verdict = '<span class="verdict-ok">same as code</span>';
      else if (Math.abs(mins) <= 36 * 60) {
        const a = Math.abs(mins);
        const txt = [Math.floor(a / 60) ? `${Math.floor(a / 60)} h` : '', a % 60 ? `${a % 60} min` : ''].filter(Boolean).join(' ');
        verdict = `<span class="verdict-bad">${txt} ${mins > 0 ? 'late' : 'early'}</span>`;
      }
      else if (Math.abs(Math.abs(t.year - near.year) - 1) === 0 && t.month === near.month) verdict = '<span class="verdict-bad">wrong year</span>';
    }
    return `<li><span>${esc(x.name)}</span><span>${esc(x.taiwan)} · ${verdict}</span></li>`;
  }).join('');
  return `<h3>Same Gemma, asked for Taiwan time directly</h3><p>Recorded in the same test run. Compared with the code's answer in Taiwan time.</p><ul>${li}</ul>`;
}

// ---------- recorded mode ----------
function showExample(ex) {
  state.ex = ex;
  state.source = ex.url;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.id === ex.id));
  $('text').value = ex.excerpt;
  $('text').readOnly = true;
  $('srcTag').innerHTML = `<a href="${esc(ex.url)}" target="_blank" rel="noopener">${esc(ex.site)}</a> · ${esc(ex.kind)}`;
  $('excerptSum').textContent = `What Gemma read: ${ex.excerpt.split('\n').length} lines`;
  $('excerpt').textContent = ex.excerpt;
  runRecorded();
}

function runRecorded() {
  const ex = state.ex;
  const [y, m, d] = ex.ref.split('-').map(Number);
  const merged = { rows: [], dropped: [] };
  ex.chunks.forEach((c, i) => {
    const a = assemble(ex.reader[i], c, { page: ex.excerpt, ref: { year: y, month: m, day: d }, target: target() });
    merged.rows.push(...a.rows);
    merged.dropped.push(...a.dropped);
  });
  const base = { rows: ex.baseline.flatMap((t) => baselineRows(t).rows) };
  renderRows(merged, { baseline: base, note: `Recorded ${recorded.recordedOn} · page read on ${ex.ref}` });
}

function setMode(mode) {
  state.mode = mode;
  $('tab-recorded').classList.toggle('on', mode === 'recorded');
  $('tab-live').classList.toggle('on', mode === 'live');
  $('tab-recorded').setAttribute('aria-selected', mode === 'recorded');
  $('tab-live').setAttribute('aria-selected', mode === 'live');
  $('examples').classList.toggle('hidden', mode !== 'recorded');
  $('liveTools').classList.toggle('hidden', mode !== 'live');
  $('run').classList.toggle('hidden', mode !== 'live');
  if (mode === 'recorded') {
    $('status').textContent = 'Real Gemma outputs from my test run. The checker and the time zone code run live.';
    showExample(state.ex || recorded.examples[0]);
  } else {
    $('text').readOnly = false;
    if (state.ex && $('text').value === state.ex.excerpt) $('text').value = '';
    state.ex = null;
    $('srcTag').textContent = '';
    $('rows').innerHTML = '<p class="empty">Paste a rules page and press Find the dates.</p>';
    $('dropped').innerHTML = '';
    $('baseline').innerHTML = '';
    $('ics').disabled = true;
    $('outTag').textContent = '';
    liveStatus();
  }
}

// ---------- live mode ----------
async function liveStatus() {
  const { webgpuStatus, MODEL_LABEL } = await import('./llm.js');
  const s = await webgpuStatus();
  $('status').textContent = s.ok
    ? `${MODEL_LABEL}. Downloads once, then runs offline on your GPU.`
    : `${s.why} Live mode needs Chrome or Edge with WebGPU. The recorded runs work everywhere.`;
  $('run').disabled = !s.ok;
}

async function runLive() {
  const text = $('text').value;
  if (!text.trim()) { $('status').textContent = 'Paste a page first.'; return; }
  const sel = selectLines(text);
  const excerpt = sel.chunks.join('\n');
  $('excerptSum').textContent = `What Gemma read: ${sel.lines.length} of ${sel.totalLines} lines`;
  $('excerpt').textContent = excerpt;
  if (!sel.chunks.length) { renderRows({ rows: [], dropped: [] }, { note: 'No line on the page has a date in it.' }); return; }
  $('run').disabled = true;
  try {
    const llm = await import('./llm.js');
    const { extractPrompt, EXTRACT_GRAMMAR } = await import('./core/prompts.js');
    await llm.loadModel((p) => { $('status').textContent = p.text; });
    const now = DateTime.now();
    const merged = { rows: [], dropped: [] };
    const t0 = performance.now();
    for (let i = 0; i < sel.chunks.length; i++) {
      $('status').textContent = `Gemma is reading part ${i + 1} of ${sel.chunks.length}…`;
      const r = await llm.ask(extractPrompt(sel.chunks[i]), { grammar: EXTRACT_GRAMMAR, maxTokens: 900 });
      const a = assemble(r.text, sel.chunks[i], { page: text, ref: { year: now.year, month: now.month, day: now.day }, target: target() });
      merged.rows.push(...a.rows);
      merged.dropped.push(...a.dropped);
    }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    $('status').textContent = `Done in ${secs} s on your GPU.`;
    renderRows(merged, { note: `${sel.lines.length} of ${sel.totalLines} lines read` });
  } catch (e) {
    $('status').textContent = `Something went wrong: ${e?.message || e}`;
  } finally {
    $('run').disabled = false;
  }
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html.replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/dt|\/dd|\/time)[^>]*>/gi, '$&\n'), 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return doc.body?.textContent || '';
}

async function fetchPage() {
  const url = $('url').value.trim();
  if (!url) return;
  state.source = url;
  $('status').textContent = 'Reading the page from your browser…';
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    $('text').value = htmlToText(await r.text()).replace(/\n\s*\n+/g, '\n');
    $('status').textContent = 'Page read. Press Find the dates.';
  } catch {
    $('status').textContent = "This site doesn't let other pages read it. Open it, press Ctrl+A and Ctrl+C, and paste here, or use the bookmark.";
  }
}

function bookmarklet() {
  const o = location.origin;
  const code = `(()=>{const o='${o}',t=document.body.innerText,u=location.href;try{navigator.clipboard.writeText(t)}catch(e){}const w=window.open(o+'/#from-bookmarklet');addEventListener('message',e=>{if(e.origin===o&&e.data==='deadline-calendar-ready')w.postMessage({text:t,url:u},o)})})()`;
  $('bm').href = 'javascript:' + encodeURIComponent(code);
  $('bm').addEventListener('click', (e) => { e.preventDefault(); $('status').textContent = 'Drag this link to your bookmarks bar, then click it while you are on a rules page.'; });
  if (location.hash === '#from-bookmarklet' && window.opener) {
    window.addEventListener('message', (e) => {
      if (e.data && typeof e.data.text === 'string') {
        setMode('live');
        $('text').value = e.data.text;
        $('url').value = e.data.url || '';
        state.source = e.data.url || '';
        $('status').textContent = `Got ${e.data.text.length.toLocaleString()} characters from ${e.data.url || 'the page'}. Press Find the dates.`;
      }
    });
    window.opener.postMessage('deadline-calendar-ready', '*');
  }
}

function downloadICS() {
  const ics = buildICS(state.rows, { source: state.source });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'deadlines.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- wire up ----------
fillZones();
$('examples').innerHTML = recorded.examples.map((e) => `<button class="chip" type="button" data-id="${esc(e.id)}">${esc(e.label)}</button>`).join('');
$('examples').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (b) showExample(recorded.examples.find((x) => x.id === b.dataset.id));
});
$('tab-recorded').addEventListener('click', () => setMode('recorded'));
$('tab-live').addEventListener('click', () => setMode('live'));
$('run').addEventListener('click', runLive);
$('fetch').addEventListener('click', fetchPage);
$('ics').addEventListener('click', downloadICS);
$('tz').addEventListener('change', () => { if (state.mode === 'recorded') runRecorded(); else if (state.rows.length) renderRows({ rows: state.rows, dropped: [] }); });
bookmarklet();
const start = new URLSearchParams(location.search).get('example');
state.ex = recorded.examples.find((x) => x.id === start) || recorded.examples[0];
setMode(location.hash === '#from-bookmarklet' ? 'live' : 'recorded');
