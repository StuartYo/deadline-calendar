// Usage: node scripts/build-testset.mjs <testset_source.json> <out_private.json>
// Writes eval/testset.json (only the excerpt the model reads, never the full third-party page)
// and a private copy with the source file paths.
import fs from 'node:fs';
import { selectLines } from '../src/core/lines.js';

const [src, priv] = process.argv.slice(2);
const items = JSON.parse(fs.readFileSync(src, 'utf8'));
const pub = [];
const full = [];
for (const it of items) {
  const { chunks, totalLines } = selectLines(it.text);
  const base = { id: it.id, event: it.event, truth_taiwan: it.truth, ref: it.ref, url: it.url, input_kind: it.input_kind, chunks };
  pub.push(base);
  full.push({ ...base, source_file: it.source_file, truth_record: it.truth_record, page_lines: totalLines, page_chars: it.text.length });
}
fs.writeFileSync('eval/testset.json', JSON.stringify(pub, null, 1));
fs.writeFileSync(priv, JSON.stringify(full, null, 1));
for (const f of full) console.log(f.id, f.page_chars, '->', f.chunks.map((c) => c.length).join('+'));
