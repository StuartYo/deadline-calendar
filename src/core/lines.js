// A rules page can be 40,000 characters; the model's window is 4,096 tokens.
// Code keeps only the lines that carry a date (plus a short label line above each),
// and both the model and the plain-model baseline read exactly this excerpt.
import { findDates, findTimes, norm } from './parse.js';
import { findZone } from './zones.js';

const MAX_LINE = 320;
export const CHUNK_CHARS = 2400;

export function hasDate(line) {
  return findDates(line).length > 0;
}

/** Split pasted text into clean lines. */
export function splitLines(text) {
  return (text || '').split(/\r?\n/).map(norm).filter(Boolean);
}

/** The excerpt: date lines, the short line above each, and any line that sets a zone for the page. */
export function selectLines(text) {
  const lines = splitLines(text);
  const keep = new Set();
  lines.forEach((l, i) => {
    const date = hasDate(l);
    const zoneTime = findTimes(l).length && findZone(l);
    if (date || zoneTime) {
      keep.add(i);
      if (i > 0 && lines[i - 1].length <= 60 && !hasDate(lines[i - 1])) keep.add(i - 1);
      if (!date && i > 0 && hasDate(lines[i - 1])) keep.add(i - 1);
      if (date && !findTimes(l).length && i + 1 < lines.length && findTimes(lines[i + 1]).length && !hasDate(lines[i + 1])) keep.add(i + 1);
    }
    if (/(all (dates and )?times|times are|deadlines are)/i.test(l) && findZone(l)) keep.add(i);
  });
  const picked = [...keep].sort((a, b) => a - b).map((i) => clip(lines[i]));
  // Drop exact repeats (pages often print the deadline in a banner and again below).
  const seen = new Set();
  const uniq = picked.filter((l) => (seen.has(l) ? false : (seen.add(l), true)));
  const chunks = [];
  let cur = '';
  for (const l of uniq) {
    if (cur && cur.length + l.length + 1 > CHUNK_CHARS) { chunks.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + l;
  }
  if (cur) chunks.push(cur);
  return { lines: uniq, chunks, totalLines: lines.length };
}

function clip(l) {
  if (l.length <= MAX_LINE) return l;
  const d = findDates(l)[0];
  const at = d ? Math.max(0, d.index - 120) : 0;
  return l.slice(at, at + MAX_LINE);
}
