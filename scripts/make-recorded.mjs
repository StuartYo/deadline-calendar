// Builds src/recorded.json for the site's "Recorded runs" tab from the saved eval run.
// Only the excerpt Gemma read is kept, never the whole third-party page.
import fs from 'node:fs';
const run = JSON.parse(fs.readFileSync('eval/runs/reader-vs-baseline.json', 'utf8'));
const set = Object.fromEntries(JSON.parse(fs.readFileSync('eval/testset.json', 'utf8')).map((x) => [x.id, x]));
const PICK = [
  ['bound-jam', 'Bound Jam', 'itch.io', 'CET, and a timer with no zone'],
  ['dev-week3', 'This DEV challenge', 'DEV', 'PDT, no year'],
  ['codex-twitchcon', 'Codex x TwitchCon', 'Devpost', 'PST after the clocks change'],
  ['buildwithai', 'Build With AI', 'Devpost', 'EDT and EST on one page'],
  ['ai-philosophy', 'AI Philosophy essay', 'contest site', 'Anywhere on Earth'],
  ['hacknation', 'Hack-Nation', 'Luma', 'January, read in October'],
  ['anitya', 'Anitya World Jam', 'itch.io', 'two lines that disagree'],
  ['desall-horeca', 'Desall brief', 'Desall', 'Gemma rewords the date'],
];
const examples = PICK.map(([id, label, site, kind]) => {
  const it = set[id];
  const r = run.results.find((x) => x.id === id);
  return { id, label, site, kind, url: it.url, ref: it.ref, chunks: it.chunks, excerpt: it.chunks.join('\n'),
    reader: r.reader.map((x) => x.text), baseline: r.baseline.map((x) => x.text) };
});
fs.writeFileSync('src/recorded.json', JSON.stringify({ model: run.model, recordedOn: run.at.slice(0, 10), examples }, null, 1));
console.log('recorded', examples.length);
