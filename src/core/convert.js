// Time zone math. Luxon and the browser's time zone database do the work,
// so daylight saving dates come from the tz database, not from a model's memory.
import { DateTime, FixedOffsetZone } from 'luxon';

export const offsetLabel = (mins) => {
  const s = mins >= 0 ? '+' : '−';
  const a = Math.abs(mins);
  return `UTC${s}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
};

function build(p, zone) {
  let dt = DateTime.fromObject({ year: p.y, month: p.m, day: p.d, hour: p.hh === 24 ? 0 : p.hh, minute: p.mm }, { zone });
  if (p.hh === 24) dt = dt.plus({ days: 1 });
  return dt;
}

/**
 * p: {y, m, d, hh, mm} as written on the page. zone: from findZone().zone.
 * Returns the moment in UTC, the same moment on the reader's clock, and notes
 * for anything a person should look at twice.
 */
export function convert(p, zone, target = 'Asia/Taipei') {
  const notes = [];
  let main;
  let other = null;
  if (zone.fixed != null) {
    main = build(p, FixedOffsetZone.instance(zone.fixed));
    if (zone.family) {
      const wall = build(p, zone.family);
      if (wall.isValid && wall.offset !== zone.fixed) {
        other = wall;
        notes.push(`The page says ${zone.label.split(' ')[0]}, but on that date ${zone.family.split('/')[1].replace('_', ' ')} clocks are on ${offsetLabel(wall.offset)}. One of the two is a typo on the page. The calendar gets the earlier time.`);
      }
    }
  } else {
    main = build(p, zone.iana);
    const back = main.setZone(zone.iana);
    if (back.hour !== (p.hh === 24 ? 0 : p.hh) || back.minute !== p.mm) {
      notes.push('That clock time is skipped by a daylight saving change. Luxon moved it forward.');
    }
  }
  if (!main.isValid) return { ok: false, notes: [`Could not read that date (${main.invalidExplanation || 'invalid'}).`] };
  let chosen = main;
  let alt = null;
  if (other) {
    if (other < main) { chosen = other; alt = main; } else { alt = other; }
  }
  return {
    ok: true,
    utc: chosen.toUTC(),
    local: chosen.setZone(target),
    sourceOffset: chosen.offset,
    alt: alt ? alt.setZone(target) : null,
    notes,
  };
}

export const fmt = (dt) => dt.toFormat('yyyy-LL-dd HH:mm');
