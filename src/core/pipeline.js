// Gemma's answer goes in, rows for the table and the calendar come out.
// Gemma only points at text. Every quote is looked up on the page; the date, the clock time,
// the zone, the year and the conversion are all worked out here.
import { findDates, findTimes, guessYear, norm } from './parse.js';
import { findZone, pageZoneHint, looksJapanese } from './zones.js';
import { convert, fmt } from './convert.js';

export function parseJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

const low = (s) => norm(s).toLowerCase();
export const inText = (quote, text) => !!norm(quote) && low(text).includes(low(quote));

// "GMT+8:00" must not be read as the clock time 8:00.
const OFFSET = /\b(?:UTC|GMT)\s*[+\-−]\s*\d{1,2}(?::?\d{2})?/gi;
const hideOffsets = (s) => norm(s).replace(OFFSET, (m) => ' '.repeat(m.length));

function nearestAfter(items, pos) {
  const after = items.filter((x) => x.index >= pos);
  return after[0] || items[items.length - 1] || null;
}

/**
 * raw: Gemma's JSON text. excerpt: the lines Gemma saw. page: the whole pasted text.
 * ref: {year, month, day} for filling in missing years. target: IANA zone of the reader.
 */
export function assemble(raw, excerpt, { page = excerpt, ref, target = 'Asia/Taipei' } = {}) {
  const parsed = parseJSON(raw);
  const events = Array.isArray(parsed?.events) ? parsed.events : [];
  const lines = excerpt.split('\n').map(norm);
  const rows = [];
  const dropped = [];

  for (const e of events) {
    const dq = norm(e.date);
    const name = norm(e.name) || 'Date';
    if (!dq) continue;
    if (!inText(dq, excerpt)) {
      dropped.push({ name, why: `Gemma quoted "${e.date}", but those words are not on the page.` });
      continue;
    }
    const line = lines.find((l) => low(l).includes(low(dq))) || dq;
    const lineIdx = lines.indexOf(line);
    const dates = findDates(dq);
    if (!dates.length) {
      dropped.push({ name, why: `"${e.date}" is on the page, but code found no date in it.` });
      continue;
    }
    const notes = [];
    const pick = e.kind === 'start' || dates.length === 1 ? dates[0] : dates[dates.length - 1];
    const datePos = low(line).indexOf(low(dq)) + pick.index;

    // Clock time: Gemma's quote if it is real, otherwise the time next to the date on the same line.
    let time = null;
    if (norm(e.time)) {
      if (inText(e.time, excerpt)) time = findTimes(hideOffsets(e.time))[0] || null;
      else notes.push(`Gemma gave the time "${e.time}", which is not on the page, so code ignored it.`);
    }
    if (!time) time = nearestAfter(findTimes(hideOffsets(line)), datePos);
    if (!time && lineIdx >= 0 && lineIdx + 1 < lines.length && !findDates(lines[lineIdx + 1]).length) {
      time = findTimes(hideOffsets(lines[lineIdx + 1]))[0] || null;
    }
    let noTime = false;
    if (!time) {
      time = { hh: 23, mm: 59 };
      noTime = true;
      notes.push('The page gives no clock time for this date. The calendar uses 23:59, the end of that day.');
    }

    // Zone: Gemma's quote if it is real, then the same line, the next line, a page-wide statement.
    let zone = null;
    let zoneWhy = '';
    if (norm(e.zone)) {
      if (inText(e.zone, excerpt)) zone = findZone(norm(e.zone));
      else notes.push(`Gemma gave the zone "${e.zone}", which is not on the page, so code ignored it.`);
    }
    if (!zone) zone = findZone(line.slice(Math.max(0, datePos))) || findZone(line);
    if (!zone && lineIdx >= 0 && lineIdx + 1 < lines.length && !findDates(lines[lineIdx + 1]).length) zone = findZone(lines[lineIdx + 1]);
    if (!zone) {
      const h = pageZoneHint(page);
      if (h) { zone = h; zoneWhy = `No zone next to this date. The page says "${h.sentence}".`; }
    }
    if (!zone && looksJapanese(page)) {
      zone = findZone('JST');
      zoneWhy = 'No zone written. The page is in Japanese, so this assumes Japan time.';
    }
    if (zoneWhy) notes.push(zoneWhy);
    if (zone?.zone?.note) notes.push(zone.zone.note);

    let y = pick.y;
    if (y == null) {
      y = guessYear(pick.m, pick.d, ref);
      notes.push(`No year next to this date. Code assumed ${y}.`);
    }
    const p = { y, m: pick.m, d: pick.d, hh: time.hh, mm: time.mm };
    const row = { name, kind: e.kind || 'other', line, quote: { date: e.date, time: e.time, zone: e.zone }, written: p, notes, noTime };
    if (!zone) {
      row.status = 'no-zone';
      row.notes.push('The page names no time zone for this date, so there is no way to convert it. Pick one by hand.');
      rows.push(row);
      continue;
    }
    const c = convert(p, zone.zone, target);
    if (!c.ok) { dropped.push({ name, why: c.notes[0] }); continue; }
    row.status = 'ok';
    row.zoneLabel = zone.zone.label;
    row.zoneText = zone.match;
    row.utc = c.utc;
    row.local = c.local;
    row.alt = c.alt;
    row.notes.push(...c.notes);
    rows.push(row);
  }

  // Same moment named twice (a banner and a schedule) becomes one row.
  const seen = new Map();
  const out = [];
  for (const r of rows) {
    const key = r.status === 'ok' ? fmt(r.utc) : `${r.name}|${r.line}`;
    if (seen.has(key)) continue;
    seen.set(key, true);
    out.push(r);
  }
  out.sort((a, b) => (a.utc && b.utc ? a.utc - b.utc : a.utc ? -1 : 1));
  return { rows: out, dropped, parsed: !!parsed };
}

/** Baseline rows: the model's own Taiwan times, taken as given. */
export function baselineRows(raw) {
  const parsed = parseJSON(raw);
  const events = Array.isArray(parsed?.events) ? parsed.events : [];
  return { rows: events.map((e) => ({ name: e.name, kind: e.kind, taiwan: e.taiwan_time })), parsed: !!parsed };
}
