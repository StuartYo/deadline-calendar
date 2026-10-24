// Scores a saved Gemma run. Every number in the README and the write-up comes from the file this writes.
// Usage: node scripts/score.mjs eval/runs/<run>.json eval/testset.json [out.json]
import fs from 'node:fs';
import { DateTime } from 'luxon';
import { assemble, baselineRows } from '../src/core/pipeline.js';
import { fmt } from '../src/core/convert.js';

const [runFile, setFile, outFile = 'eval/results.json'] = process.argv.slice(2);
const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
const set = Object.fromEntries(JSON.parse(fs.readFileSync(setFile, 'utf8')).map((x) => [x.id, x]));
const ref = (s) => { const [year, month, day] = s.split('-').map(Number); return { year, month, day }; };
const T = (s) => DateTime.fromFormat(s, 'yyyy-LL-dd HH:mm', { zone: 'Asia/Taipei' });
const NEAR_HOURS = 36;

function grade(times, truth) {
  if (times.includes(truth)) return 'correct';
  const t = T(truth);
  // Near the right moment, or the right moment in the wrong year: the deadline was found and converted wrong.
  const near = times.filter((x) => {
    const d = T(x);
    return d.isValid && [0, 1, -1].some((k) => Math.abs(d.plus({ years: k }).diff(t, 'hours').hours) <= NEAR_HOURS);
  });
  return near.length ? 'wrong' : 'missing';
}

const items = [];
const totals = { reader: { correct: 0, wrong: 0, missing: 0 }, baseline: { correct: 0, wrong: 0, missing: 0 } };
const readerStats = { events: 0, rows_ok: 0, rows_no_zone: 0, dropped: 0, dropped_why: [], parse_fail: 0, notes: 0, ms: [] };
const baselineStats = { events: 0, parse_fail: 0, ms: [] };

for (const r of run.results) {
  const it = set[r.id];
  if (!it) continue;
  const page = it.chunks.join('\n');
  const rRows = [];
  r.reader.forEach((x, i) => {
    readerStats.ms.push(x.ms);
    const a = assemble(x.text, it.chunks[i], { page, ref: ref(it.ref), target: 'Asia/Taipei' });
    if (!a.parsed) readerStats.parse_fail++;
    readerStats.dropped += a.dropped.length;
    readerStats.dropped_why.push(...a.dropped.map((d) => `${r.id}: ${d.why}`));
    rRows.push(...a.rows);
  });
  readerStats.events += rRows.length;
  readerStats.rows_ok += rRows.filter((x) => x.status === 'ok').length;
  readerStats.rows_no_zone += rRows.filter((x) => x.status === 'no-zone').length;
  const bRows = [];
  r.baseline.forEach((x) => {
    baselineStats.ms.push(x.ms);
    const b = baselineRows(x.text);
    if (!b.parsed) baselineStats.parse_fail++;
    bRows.push(...b.rows);
  });
  baselineStats.events += bRows.length;
  const readerTimes = rRows.filter((x) => x.status === 'ok').map((x) => fmt(x.local));
  const baselineTimes = bRows.map((x) => x.taiwan);
  const rg = grade(readerTimes, it.truth_taiwan);
  const bg = grade(baselineTimes, it.truth_taiwan);
  totals.reader[rg]++;
  totals.baseline[bg]++;
  const hit = rRows.find((x) => x.status === 'ok' && fmt(x.local) === it.truth_taiwan);
  if (hit?.notes.length) readerStats.notes++;
  items.push({
    id: r.id, event: it.event, truth_taiwan: it.truth_taiwan, input_kind: it.input_kind,
    reader: { grade: rg, times: readerTimes, matched_line: hit?.line || null, notes: hit?.notes || [] },
    baseline: { grade: bg, times: baselineTimes },
  });
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const n = items.length;
const out = {
  model: run.model, run_at: run.at, run_file: runFile, n, near_window_hours: NEAR_HOURS,
  definitions: {
    correct: 'the Taiwan time in our records appears in the output, to the minute',
    wrong: 'not correct, but the output has a time within 36 hours of it, or within 36 hours of it a year off (the deadline was found and converted wrong)',
    missing: 'nothing within 36 hours',
  },
  totals,
  rates: {
    reader_correct: `${totals.reader.correct}/${n}`, baseline_correct: `${totals.baseline.correct}/${n}`,
    reader_pct: Math.round((100 * totals.reader.correct) / n), baseline_pct: Math.round((100 * totals.baseline.correct) / n),
  },
  reader_stats: { ...readerStats, median_ms: med(readerStats.ms), ms: undefined },
  baseline_stats: { ...baselineStats, median_ms: med(baselineStats.ms), ms: undefined },
  items,
};
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ totals, rates: out.rates, reader: out.reader_stats, baseline: out.baseline_stats }, null, 1));
for (const i of items) console.log(i.id.padEnd(20), i.truth_taiwan, 'R', i.reader.grade.padEnd(8), i.reader.times.join(',').slice(0, 60), '| B', i.baseline.grade.padEnd(8), i.baseline.times.join(',').slice(0, 70));
