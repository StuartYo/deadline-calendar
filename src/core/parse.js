// Reads dates and clock times out of short quotes. Plain code, no model.
// Every function returns null instead of guessing.

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const monthOf = (s) => MONTH_NAMES.indexOf(s.slice(0, 3).toLowerCase()) + 1;

export const norm = (s) => (s || '').normalize('NFKC').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim();

/** Every date written in the text, in order. y is null when the text gives no year. */
export function findDates(text) {
  const s = norm(text);
  const out = [];
  const add = (index, len, y, m, d, how) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    if (out.some((o) => index < o.index + o.len && o.index < index + len)) return;
    out.push({ index, len, y, m, d, how });
  };
  let m;
  const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g;
  while ((m = iso.exec(s))) add(m.index, m[0].length, +m[1], +m[2], +m[3], 'iso');
  const reiwa = /令和\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
  while ((m = reiwa.exec(s))) add(m.index, m[0].length, 2018 + +m[1], +m[2], +m[3], 'cjk');
  const cjk = /(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
  while ((m = cjk.exec(s))) add(m.index, m[0].length, m[1] ? +m[1] : null, +m[2], +m[3], 'cjk');
  const mdy = new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d{2})\\b)?`, 'gi');
  while ((m = mdy.exec(s))) add(m.index, m[0].length, m[3] ? +m[3] : null, monthOf(m[1]), +m[2], 'name');
  const dmy = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS})\\.?\\b(?:,?\\s+(20\\d{2})\\b)?`, 'gi');
  while ((m = dmy.exec(s))) add(m.index, m[0].length, m[3] ? +m[3] : null, monthOf(m[2]), +m[1], 'name');
  const slash = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?![\d/])/g;
  while ((m = slash.exec(s))) {
    let a = +m[1], b = +m[2];
    let y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    if (a > 12 && b <= 12) add(m.index, m[0].length, y, b, a, 'day/month');
    else add(m.index, m[0].length, y, a, b, 'month/day');
  }
  return out.sort((x, y) => x.index - y.index);
}

/** Every clock time written in the text, in order, as 24-hour {hh, mm}. */
export function findTimes(text) {
  const s = norm(text);
  const out = [];
  const taken = (i, len) => out.some((o) => i < o.index + o.len && o.index < i + len);
  let m;
  const ampm = /\b(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*([ap])\.?\s?m\b\.?/gi;
  while ((m = ampm.exec(s))) {
    let h = +m[1];
    const mm = +(m[2] || 0);
    if (h < 1 || h > 12 || mm > 59) continue;
    const pm = m[3].toLowerCase() === 'p';
    if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
    out.push({ index: m.index, len: m[0].length, hh: h, mm, how: '12h' });
  }
  const h24 = /(?<![\d:])([01]?\d|2[0-4])[:：]([0-5]\d)(?::[0-5]\d)?(?![\d])/g;
  while ((m = h24.exec(s))) {
    if (taken(m.index, m[0].length)) continue;
    // "12:00-1:00 PM": a bare hour right before a pm range is part of that range.
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 12);
    let h = +m[1];
    if (/^\s*[-–~]\s*\d{1,2}(?::\d{2})?\s*p\.?\s?m/i.test(after) && h < 12) h += 12;
    if (h === 24 && +m[2] === 0) out.push({ index: m.index, len: m[0].length, hh: 24, mm: 0, how: '24h' });
    else if (h < 24) out.push({ index: m.index, len: m[0].length, hh: h, mm: +m[2], how: '24h' });
  }
  const ji = /(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/g;
  while ((m = ji.exec(s))) if (!taken(m.index, m[0].length) && +m[1] <= 24) out.push({ index: m.index, len: m[0].length, hh: +m[1], mm: +(m[2] || 0), how: 'cjk' });
  const words = /\b(noon|midday|midnight)\b/gi;
  while ((m = words.exec(s))) if (!taken(m.index, m[0].length)) out.push({ index: m.index, len: m[0].length, hh: m[1].toLowerCase() === 'midnight' ? 24 : 12, mm: 0, how: 'word' });
  return out.sort((x, y) => x.index - y.index);
}

/**
 * Fill in a missing year: the first date on or after (reference - 60 days).
 * A rules page read in October that says "January 31" means next January.
 */
export function guessYear(m, d, ref) {
  const r = new Date(Date.UTC(ref.year, ref.month - 1, ref.day));
  const floor = r.getTime() - 60 * 86400000;
  for (const y of [ref.year, ref.year + 1]) {
    if (Date.UTC(y, m - 1, d) >= floor) return y;
  }
  return ref.year + 1;
}
