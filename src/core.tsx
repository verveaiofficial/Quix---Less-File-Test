export async function askGeminiStream(model: string, prompt: string, opts: { search?: boolean; nativeThoughts?: boolean; attachments?: any[] }, h: { onThoughts: (t: string) => void; onText: (t: string) => void; onDone: (r: GeminiResult) => void }): Promise<void> {
  const apiKey = apiKeyFor(model);
  if (!apiKey) throw new Error(`${MODELS[model]?.name || model} has no API key configured.`);
  const controller = new AbortController();
  const signal = controller.signal;
  const onStop = () => controller.abort();
  window.addEventListener("quix-stop", onStop, { once: true });
  const parts: any[] = [{ text: prompt }];
  (opts.attachments || []).forEach((a) => { if (a.kind === "text") parts.push({ text: `\n\n--- File: ${a.name} ---\n${a.text || ""}` }); else parts.push({ inline_data: { mime_type: a.mimeType, data: a.base64 } }); });
  const body: any = { contents: [{ parts }] };
  
  // Only enable web search for deepthink, not thinking
  const enableSearch = opts.search && model === "deepthink";
  if (enableSearch) body.tools = [{ google_search: {} }];
  if (opts.nativeThoughts) body.generationConfig = { thinkingConfig: { includeThoughts: true } };
  
  try {
    let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    if (!res.ok && enableSearch) { res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }), signal }); }
    if (!res.ok || !res.body) { const d = await res.json().catch(() => null); throw new Error(d?.error?.message || `${MODELS[model]?.name || model} request failed`); }
    // ... rest of function stays the same