// Time zone words as they appear on contest pages, mapped to what they mean.
// fixed: a UTC offset in minutes, exactly as written (PST is always UTC-8).
// iana: a region whose offset depends on the date (Pacific Time is UTC-8 or UTC-7).
// family: for fixed abbreviations, the region they belong to, so we can notice
//         "PST" written on a date when Pacific clocks are on PDT.

const t = (fixed, label, family) => ({ fixed, label, family });
const r = (iana, label) => ({ iana, label });

const TABLE = [
  [/anywhere on earth|\bAoE\b/i, () => t(-720, 'Anywhere on Earth (UTC−12)')],
  [/\b(?:UTC|GMT)\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?(?!\d)/i, (m) => {
    const sign = m[1] === '+' ? 1 : -1;
    const mins = sign * (Number(m[2]) * 60 + Number(m[3] || 0));
    return t(mins, `UTC${sign > 0 ? '+' : '−'}${m[2]}${m[3] ? ':' + m[3] : ''}`);
  }],
  [/Pacific Daylight Time|\bPDT\b/i, () => t(-420, 'PDT (UTC−7)', 'America/Los_Angeles')],
  [/Pacific Standard Time|\bPST\b/i, () => t(-480, 'PST (UTC−8)', 'America/Los_Angeles')],
  [/Pacific Time|\bPT\b|\bPacific\b/, () => r('America/Los_Angeles', 'Pacific Time')],
  [/Eastern Daylight Time|\bEDT\b/i, () => t(-240, 'EDT (UTC−4)', 'America/New_York')],
  [/Eastern Standard Time|\bEST\b/i, () => t(-300, 'EST (UTC−5)', 'America/New_York')],
  [/Eastern Time|\bET\b|\bEastern\b/, () => r('America/New_York', 'Eastern Time')],
  [/Central Daylight Time|\bCDT\b/i, () => t(-300, 'CDT (UTC−5)', 'America/Chicago')],
  [/Central European Summer Time|\bCEST\b/i, () => t(120, 'CEST (UTC+2)', 'Europe/Berlin')],
  [/Central European Time|\bCET\b/i, () => t(60, 'CET (UTC+1)', 'Europe/Berlin')],
  [/Central Standard Time|\bCST\b/i, () => ({ ...t(-360, 'CST (US Central, UTC−6)', 'America/Chicago'), note: 'CST can also mean China Standard Time (UTC+8). Read here as US Central.' })],
  [/Central Time|\bCT\b/, () => r('America/Chicago', 'US Central Time')],
  [/Mountain Daylight Time|\bMDT\b/i, () => t(-360, 'MDT (UTC−6)', 'America/Denver')],
  [/Mountain Standard Time|\bMST\b/i, () => t(-420, 'MST (UTC−7)', 'America/Denver')],
  [/Mountain Time|\bMT\b/, () => r('America/Denver', 'Mountain Time')],
  [/British Summer Time|\bBST\b/i, () => t(60, 'BST (UTC+1)', 'Europe/London')],
  [/UK time|London time/i, () => r('Europe/London', 'UK time')],
  [/Eastern European Summer Time|\bEEST\b/i, () => t(180, 'EEST (UTC+3)', 'Europe/Athens')],
  [/Eastern European Time|\bEET\b/i, () => t(120, 'EET (UTC+2)', 'Europe/Athens')],
  [/hora canaria|Canary/i, () => r('Atlantic/Canary', 'Canary Islands time')],
  [/\bWEST\b/, () => t(60, 'WEST (UTC+1)', 'Europe/Lisbon')],
  [/\bWET\b/, () => t(0, 'WET (UTC+0)', 'Europe/Lisbon')],
  [/India Standard Time|\bIST\b/i, () => ({ ...t(330, 'IST (India, UTC+5:30)'), note: 'IST can also mean Irish or Israel time. Read here as India.' })],
  [/Japan Standard Time|\bJST\b|日本時間|日本时间/i, () => t(540, 'JST (UTC+9)')],
  [/Korea Standard Time|\bKST\b/i, () => t(540, 'KST (UTC+9)')],
  [/\bHKT\b|Hong Kong Time/i, () => t(480, 'HKT (UTC+8)')],
  [/\bSGT\b|Singapore Time/i, () => t(480, 'SGT (UTC+8)')],
  [/Beijing Time|北京時間|北京时间/i, () => t(480, 'Beijing time (UTC+8)')],
  [/Taiwan Time|台灣時間|臺灣時間|台北時間/i, () => t(480, 'Taiwan time (UTC+8)')],
  [/\bAEDT\b/, () => t(660, 'AEDT (UTC+11)', 'Australia/Sydney')],
  [/\bAEST\b/, () => t(600, 'AEST (UTC+10)', 'Australia/Sydney')],
  [/\bNZDT\b/, () => t(780, 'NZDT (UTC+13)', 'Pacific/Auckland')],
  [/\bNZST\b/, () => t(720, 'NZST (UTC+12)', 'Pacific/Auckland')],
  [/Coordinated Universal Time|\bUTC\b|\bGMT\b|\bZulu\b/i, () => t(0, 'UTC')],
];

/** Find the first time zone word in a piece of text. Returns {zone, match, index} or null. */
export function findZone(text) {
  if (!text) return null;
  let best = null;
  for (const [re, make] of TABLE) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index || (m.index === best.index && m[0].length > best.match.length))) {
      best = { zone: make(m), match: m[0], index: m.index };
    }
  }
  return best;
}

/** Lines like "All times are in Pacific Time" that set a zone for the whole page. */
export function pageZoneHint(text) {
  const re = /(?:all (?:dates and )?times|times (?:are|shown)|all deadlines|deadlines are)[^.\n]{0,60}/gi;
  let m;
  while ((m = re.exec(text))) {
    const z = findZone(m[0]);
    if (z) return { ...z, sentence: m[0].trim() };
  }
  return null;
}

/** Pages written in Japanese almost always mean Japan time when they name no zone. */
export function looksJapanese(text) {
  return /[぀-ヿ]/.test(text || '');
}
