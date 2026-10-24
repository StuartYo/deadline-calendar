// Runs the same Gemma 4 E2B on every test item twice: once as the reader (copy quotes only)
// and once as the baseline (write the Taiwan time yourself). Replies are saved untouched;
// scoring happens in Node with the same code the site uses.
import { loadModel, ask, MODEL_ID } from './llm.js';
import { extractPrompt, baselinePrompt, EXTRACT_GRAMMAR, BASELINE_GRAMMAR } from './core/prompts.js';

const log = (s) => { document.getElementById('log').textContent += '\n' + s; console.log(s); };

window.runEval = async (items) => {
  await loadModel((p) => { if (p.progress === 1) log(p.text); }, { worker: false });
  const out = [];
  for (const it of items) {
    const reader = [];
    const baseline = [];
    for (const chunk of it.chunks) {
      reader.push(await ask(extractPrompt(chunk), { grammar: EXTRACT_GRAMMAR, maxTokens: 900 }));
      baseline.push(await ask(baselinePrompt(chunk, it.ref), { grammar: BASELINE_GRAMMAR, maxTokens: 900 }));
    }
    out.push({ id: it.id, reader, baseline });
    log(`${it.id} reader ${reader.map((r) => r.ms).join('+')}ms baseline ${baseline.map((r) => r.ms).join('+')}ms`);
  }
  return { model: MODEL_ID, at: new Date().toISOString(), ua: navigator.userAgent, results: out };
};
window.__ready = true;
