// iCalendar file and Google Calendar links. All times are written in UTC (the trailing Z),
// so any calendar app shows them in its own zone without needing a VTIMEZONE block.

import { DateTime } from 'luxon';

const stamp = (dt) => dt.toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");

export const escapeText = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets, as RFC 5545 asks. */
export function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75;
    if (curLen + n > limit) { parts.push(cur); cur = ''; curLen = 0; }
    cur += ch;
    curLen += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

function details(row, source) {
  const bits = [`On the page: ${row.line}`];
  if (row.zoneLabel) bits.push(`Read as ${row.zoneLabel}.`);
  for (const n of row.notes) bits.push(n);
  if (source) bits.push(`Source: ${source}`);
  return bits.join('\n');
}

/** rows: status 'ok' rows from assemble(). alarms: minutes before the event. */
export function buildICS(rows, { source = '', alarms = [3 * 24 * 60, 3 * 60], now } = {}) {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//deadline-calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const dtstamp = stamp(now || DateTime.utc());
  rows.filter((r) => r.status === 'ok').forEach((r, i) => {
    const end = r.utc;
    const start = end.minus({ minutes: 30 });
    out.push('BEGIN:VEVENT');
    out.push(`UID:${stamp(end)}-${i}-${hash(r.name + r.line)}@deadline-calendar`);
    out.push(`DTSTAMP:${dtstamp}`);
    out.push(`DTSTART:${stamp(start)}`);
    out.push(`DTEND:${stamp(end)}`);
    out.push(fold(`SUMMARY:${escapeText(r.name)}`));
    out.push(fold(`DESCRIPTION:${escapeText(details(r, source))}`));
    if (/^https?:\/\//.test(source)) out.push(fold(`URL:${source}`));
    for (const a of r.kind === 'deadline' ? alarms : []) {
      out.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${escapeText(r.name)}`), `TRIGGER:-PT${a}M`, 'END:VALARM');
    }
    out.push('END:VEVENT');
  });
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}

/** A link that opens Google Calendar's "new event" form. Nothing is sent until you click it. */
export function googleLink(row, source = '') {
  const end = row.utc;
  const start = end.minus({ minutes: 30 });
  const q = new URLSearchParams({ action: 'TEMPLATE', text: row.name, dates: `${stamp(start)}/${stamp(end)}`, details: details(row, source) });
  return `https://calendar.google.com/calendar/render?${q}`;
}

function hash(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
