# Deadline Calendar

Paste a contest rules page. Gemma 4 E2B runs in your browser and points at the dates. Plain code checks every quote against the page, converts the time zones with Luxon and writes an `.ics` file, or one Google Calendar link per date.

Live: https://deadline-calendar.vercel.app

## How it works

1. `src/core/lines.js` keeps only the lines that contain a date, plus the short label above each one. Both the reader and the baseline read exactly this excerpt.
2. Gemma 4 E2B (`gemma-4-E2B-it-q4f16_1-MLC`, WebLLM 0.2.86) copies each date, time and zone exactly as written. The answer is held to a grammar (`src/core/prompts.js`).
3. `src/core/pipeline.js` looks every quote up on the page. A date that isn't there is thrown out. If Gemma rewrote a date that is on the page in other words ("October 29, 2026" for "29 October 2026"), the page's own words are used and the row says so.
4. `src/core/parse.js` reads dates and times, `src/core/zones.js` maps zone words (PDT, CET, AoE, Pacific Time, 日本時間...) to offsets or tz regions, and `src/core/convert.js` does the conversion with Luxon. "PST" written on a summer date gets a warning and the earlier of the two readings.
5. `src/core/ics.js` writes the calendar file in UTC, with reminders 3 days and 3 hours before each deadline.

Nothing you paste is sent anywhere. The only downloads are the page, the WebLLM runtime and the model weights.

## Eval

`eval/testset.json` has 22 dates from 20 contests I entered or looked at in October 2026. Each truth value is the Taiwan time I had already worked out in my own notes at the time. Only the lines the model reads are stored, not the full pages.

Same Gemma 4 E2B, same excerpt, temperature 0, one run (`eval/runs/reader-vs-baseline.json`):

- **Baseline:** Gemma is told today's date and that Taiwan is UTC+8, and asked for every date in Taiwan time.
- **Reader:** Gemma copies quotes, code does the rest.

| Taiwan time exactly right | Run 1, code at `f96ac25` | Same outputs, current code |
|---|---|---|
| Gemma alone | 3 / 22 | 3 / 22 |
| Gemma copies, code converts | 20 / 22 | 22 / 22 |

The two misses in run 1 were code problems, fixed afterwards and re-scored on the same saved outputs, so the second column was tuned on this set. In both columns the reader never gave a wrong time for a date it found. See `eval/results.json`.

```
npm install
npm test                                   # 33 unit tests
node scripts/score.mjs eval/runs/reader-vs-baseline.json eval/testset.json
```

Running the model again needs Chrome with WebGPU: build the eval page, serve it with `npx vite preview --port 5179`, then `node scripts/run-eval.mjs <name> eval/testset.json`.

## License

MIT
