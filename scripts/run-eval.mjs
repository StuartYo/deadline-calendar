// Usage: node scripts/run-eval.mjs <out-name> eval/testset.json
// Needs the built eval page served: `npx vite build --outDir <dir>` then `npx vite preview --outDir <dir> --port 5179`.
// Uses the installed Chrome with WebGPU on the discrete GPU. Runs in small batches and resumes,
// because a long WebGPU session in one tab can crash.
import { chromium } from 'playwright';
import fs from 'node:fs';

const [name, ...files] = process.argv.slice(2);
const items = files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const out = `eval/runs/${name}.json`;
const res = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { results: [] };
const done = new Set(res.results.map((r) => r.id));
const todo = items.filter((x) => !done.has(x.id));
const BATCH = 5;

for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH);
  const ctx = await chromium.launchPersistentContext('E:/_tmp_claude/hf26w2/profile', {
    channel: 'chrome', headless: false,
    args: ['--force_high_performance_gpu', '--enable-unsafe-webgpu', '--window-size=700,500'],
  });
  try {
    const page = await ctx.newPage();
    page.on('console', (m) => { const t = m.text(); if (/extract|rror/.test(t)) console.log('>', t.slice(0, 200)); });
    await page.goto('http://localhost:5179/eval.html');
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    const r = await page.evaluate(async (items) => await window.runEval(items), chunk);
    Object.assign(res, { model: r.model, ua: r.ua, at: res.at || r.at });
    res.results.push(...r.results);
    fs.writeFileSync(out, JSON.stringify(res, null, 1));
  } catch (e) {
    console.log('batch failed, will retry on next run:', e.message.split('\n')[0]);
  } finally {
    await ctx.close().catch(() => {});
  }
}
console.log('wrote', out, res.results.length, 'of', items.length);
