import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { findDates, findTimes, guessYear } from '../src/core/parse.js';
import { findZone } from '../src/core/zones.js';
import { assemble } from '../src/core/pipeline.js';
import { fmt } from '../src/core/convert.js';
import { buildICS, fold } from '../src/core/ics.js';

const ref = (s) => { const [year, month, day] = s.split('-').map(Number); return { year, month, day }; };
const one = (date, time = '', zone = '', kind = 'deadline') => JSON.stringify({ events: [{ name: 'x', kind, date, time, zone }] });

// What a perfect reader would copy for each test item. If code can't turn these into the
// right Taiwan time, no model can help it.
const ORACLE = {
  'dev-week3': ['October 25', '11:59 PM', 'PDT'], 'dev-week2': ['October 18, 2026', '11:59 PM', 'PDT'],
  arbiter: ['December 20', '9:00pm', 'PST'], kiroween: ['December 4, 2026', '2:00 PM', 'Pacific Time'],
  'codex-twitchcon': ['Nov 2, 2026', '2:00pm', 'PST'], buildwithai: ['Oct 26, 2026', '5:00pm', 'EDT'],
  'buildwithai-results': ['November 04', '4:00pm', 'EST'], pumpkin: ['October 23', '11:45pm', 'EDT'],
  'pumpkin-results': ['October 26', '5:00pm', 'EDT'], hacknation: ['January 31', '9:00 AM', 'ET'],
  'hacknation-finals': ['February 6', '12:00', 'ET'], vultr: ['Nov 8, 2026', '22:00', 'UTC'],
  'ai-philosophy': ['October 31, 2026', '11:59pm', 'Anywhere on Earth'], anitya: ['28 October', '23:59', 'UTC'],
  'desall-horeca': ['29 October 2026', '1:59 PM', 'UTC'], 'desall-perfume': ['26 November 2026', '1:59 PM', 'UTC'],
  renderjuice: ['October 31, 2026', '23:59', 'UTC'], 'bound-jam': ['Nov 1', '18:00', 'CET'],
  'gemma4-paper': ['2026-11-12', '23:59', 'UTC'], 'zindi-bias': ['2026-10-31', '23:59', 'UTC'],
  hyperbloom: ['10/19', '17:00', 'EDT'], 'ugreen-nas': ['2026-11-15', '23:45', 'PST'],
};

describe('test set with perfect quotes', () => {
  const set = JSON.parse(fs.readFileSync('eval/testset.json', 'utf8'));
  for (const item of set) {
    const [d, t, z] = ORACLE[item.id];
    it_(item, d, t, z, item.event);
  }
  function it_(item, d, t, z, kind) {
    it(item.id, () => {
      const ex = item.chunks.join('\n');
      const { rows } = assemble(one(d, t, z, kind), ex, { ref: ref(item.ref) });
      expect(rows[0]?.status).toBe('ok');
      expect(fmt(rows[0].local)).toBe(item.truth_taiwan);
    });
  }
});

describe('parsing', () => {
  it('reads dates', () => {
    expect(findDates('Nov  2, 2026 @  2:00pm PST')[0]).toMatchObject({ y: 2026, m: 11, d: 2 });
    expect(findDates('2026年11月7日（土）23時59分')[0]).toMatchObject({ y: 2026, m: 11, d: 7 });
    expect(findDates('令和８年11月４日（水）')[0]).toMatchObject({ y: 2026, m: 11, d: 4 });
    expect(findDates('28 October (23:59 UTC)')[0]).toMatchObject({ y: null, m: 10, d: 28 });
  });
  it('reads times', () => {
    expect(findTimes('2:00pm')[0]).toMatchObject({ hh: 14, mm: 0 });
    expect(findTimes('12:00 a.m. PT')[0]).toMatchObject({ hh: 0 });
    expect(findTimes('12:00–1:00 PM ET')[0]).toMatchObject({ hh: 12, mm: 0 });
    expect(findTimes('23時59分')[0]).toMatchObject({ hh: 23, mm: 59 });
  });
  it('guesses next year for January read in October', () => {
    expect(guessYear(1, 31, { year: 2026, month: 10, day: 24 })).toBe(2027);
    expect(guessYear(10, 23, { year: 2026, month: 10, day: 24 })).toBe(2026);
  });
  it('knows zones', () => {
    expect(findZone('11:59pm Anywhere on Earth').zone.fixed).toBe(-720);
    expect(findZone('Codabench 15:55 GMT+8').zone.fixed).toBe(480);
    expect(findZone('2:00 PM Pacific Time').zone.iana).toBe('America/Los_Angeles');
  });
});

describe('checks', () => {
  it('drops a date that is not on the page', () => {
    const r = assemble(one('October 26, 2026', '11:59 PM', 'PDT'), 'October 25: Submissions due at 11:59 PM PDT', { ref: ref('2026-10-24') });
    expect(r.rows).toHaveLength(0);
    expect(r.dropped).toHaveLength(1);
  });
  it('ignores an invented zone and falls back to the line', () => {
    const r = assemble(one('Nov 1', '18:00', 'CEST'), 'Nov 1, 18:00 CET', { ref: ref('2026-10-23') });
    expect(fmt(r.rows[0].local)).toBe('2026-11-02 01:00');
  });
  it('flags PST written on a summer date and keeps the earlier time', () => {
    const r = assemble(one('August 1, 2026', '11:59 PM', 'PST'), 'Due August 1, 2026 at 11:59 PM PST', { ref: ref('2026-07-01') });
    expect(fmt(r.rows[0].local)).toBe('2026-08-02 14:59');
    expect(r.rows[0].notes.join(' ')).toMatch(/typo/);
  });
  it('uses Japan time for a Japanese page with no zone', () => {
    const r = assemble(one('2026年11月7日', '23時59分', ''), '投稿の締め切りは 2026年11月7日（土）23時59分', { ref: ref('2026-10-20') });
    expect(fmt(r.rows[0].local)).toBe('2026-11-07 22:59');
  });
  it('keeps a reworded date only when the page has the same date', () => {
    const r = assemble(one('October 29, 2026', '1:59 PM', 'UTC'), 'Upload phase: July 31, 2026 – 29 October 2026 (1:59 PM UTC)', { ref: ref('2026-10-18') });
    expect(fmt(r.rows[0].local)).toBe('2026-10-29 21:59');
    expect(r.rows[0].notes[0]).toMatch(/page writes "29 October 2026"/);
  });
  it('keeps the complete events of an answer that was cut off', () => {
    const raw = ['{"events": [', '  {"name": "Jam ends", "kind": "deadline", "date": "Nov 1, 18:00 CET", "time": "18:00", "zone": "CET"},', '  {"name": "Loop", "kind": "other", "date": "Nov'].join('\n');
    const r = assemble(raw, 'Nov 1, 18:00 CET', { ref: ref('2026-10-23') });
    expect(fmt(r.rows[0].local)).toBe('2026-11-02 01:00');
    expect(r.dropped[0].why).toMatch(/cut off/);
  });
  it('writes a valid calendar file', () => {
    const r = assemble(one('Nov 2, 2026', '2:00pm', 'PST'), 'Deadline: Nov 2, 2026 @ 2:00pm PST', { ref: ref('2026-10-24') });
    const ics = buildICS(r.rows, { source: 'https://example.com/rules' });
    expect(ics).toMatch(/DTEND:20261102T220000Z/);
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(fold('x'.repeat(200)).split('\r\n')).toHaveLength(3);
  });
});
