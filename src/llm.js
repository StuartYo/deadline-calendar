// Thin wrapper around WebLLM. The model runs on the visitor's GPU through WebGPU;
// after the first download the weights live in the browser cache and work offline.
import { CreateMLCEngine, CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm';

export const MODEL_ID = 'gemma-4-E2B-it-q4f16_1-MLC';
export const MODEL_LABEL = 'Gemma 4 E2B (4-bit, about 2.8 GB)';

let engine = null;

export async function webgpuStatus() {
  if (!('gpu' in navigator)) return { ok: false, why: 'This browser has no WebGPU.' };
  try {
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { ok: false, why: 'WebGPU is present but no GPU adapter was found.' };
    if (!a.features.has('shader-f16')) return { ok: false, why: 'This GPU lacks 16-bit float shaders, which the model needs.' };
    return { ok: true, vendor: a.info?.vendor || '' };
  } catch (e) {
    return { ok: false, why: String(e?.message || e) };
  }
}

export async function loadModel(onProgress, { worker = true } = {}) {
  if (engine) return engine;
  const cfg = { initProgressCallback: (p) => onProgress?.(p) };
  const chat = { sliding_window_size: -1 };
  engine = worker
    ? await CreateWebWorkerMLCEngine(new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), MODEL_ID, cfg, chat)
    : await CreateMLCEngine(MODEL_ID, cfg, chat);
  return engine;
}

export async function ask(prompt, { maxTokens = 700, schema = null, grammar = null } = {}) {
  if (!engine) throw new Error('Model not loaded');
  const t0 = performance.now();
  const r = await engine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: maxTokens,
    ...(grammar ? { response_format: { type: 'grammar', grammar } } : schema ? { response_format: { type: 'json_object', schema: JSON.stringify(schema) } } : {}),
  });
  await engine.resetChat?.();
  return { text: r.choices[0].message.content, ms: Math.round(performance.now() - t0), usage: r.usage };
}
