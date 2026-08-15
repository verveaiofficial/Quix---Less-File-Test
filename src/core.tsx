import { create } from "zustand";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import globalKnowledge from "../ai/knowledge/global-knowledge.md?raw";
import globalInstructions from "../ai/instructions/global-instructions.md?raw";
import flashMd from "../ai/models/flash/instructions.md?raw";
import liteMd from "../ai/models/lite/instructions.md?raw";
import coderMd from "../ai/models/coder/instructions.md?raw";
import thinkingMd from "../ai/models/thinking/instructions.md?raw";
import deepthinkMd from "../ai/models/deepthink/instructions.md?raw";

export const APP_VERSION = "v2.8.0";
export const THINK_SEP = "---ANSWER---";
export const OBS_TAG = "[[OBS]]";
export const GUEST_THINKING_LIMIT = 3;
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
export const IMAGINE_URL = "https://quiximage.lovable.app/";
export const CHAT_MODELS = ["flash", "lite", "coder", "thinking", "deepthink"];
export const DEEPTHINK_MAX_SEARCHES = 20;
export const DEEPTHINK_MIN_SEARCHES = 5;
export const DEEPTHINK_MIN_MS = 5 * 60 * 1000;
export const DEEPTHINK_MAX_MS = 8 * 60 * 1000;

export const MODELS: Record<string, { name: string; desc: string; key: string }> = {
  flash: { name: "Quix 3 Flash", desc: "Balanced intelligence for daily tasks", key: "VITE_GEMINI_FLASH_API_KEY" },
  lite: { name: "Quix 3 Lite", desc: "Instant replies", key: "VITE_GEMINI_LITE_API_KEY" },
  coder: { name: "Quix 3 Coder", desc: "Build apps and sites", key: "VITE_GEMINI_CODER_API_KEY" },
  thinking: { name: "Quix 3.1 Thinking", desc: "Advanced reasoning", key: "VITE_GEMINI_THINKING_API_KEY" },
  deepthink: { name: "DeepThink", desc: "5 minutes of deep research and reasoning", key: "VITE_GEMINI_DEEPTHINK_API_KEY" },
};

const env = () => (import.meta as any).env || {};
export function apiKeyFor(model: string): string { const e = env(); const k = MODELS[model]?.key; return k ? e[k] || "" : ""; }
// DeepThink supports up to 3 rotating keys — add VITE_GEMINI_DEEPTHINK_API_KEY_2 / _3 in Vercel
export function deepthinkKeys(): string[] {
  const e = env();
  return [e.VITE_GEMINI_DEEPTHINK_API_KEY, e.VITE_GEMINI_DEEPTHINK_API_KEY_2, e.VITE_GEMINI_DEEPTHINK_API_KEY_3].filter((k: any) => !!k);
}
export const rid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const dayKey = () => new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ================= TYPES ================= */
export interface SourceItem { title: string; uri: string }
export interface AttachmentMeta { name: string; kind: "image" | "pdf" | "text"; previewUrl?: string }
export interface ChatMessage {
  id: string; role: "user" | "ai"; model: string; content: string; thoughts?: string;
  doneStreaming?: boolean; createdAt: number; status?: "thinking" | "streaming" | "done" | "error";
  sources?: SourceItem[]; attachments?: AttachmentMeta[]; feedback?: "up" | "down"; thinkTime?: number;
}

/* ================= SUPABASE ================= */
let sb: any = null;
try { const e = env(); if (e.VITE_SUPABASE_URL && e.VITE_SUPABASE_ANON_KEY) { sb = createClient(e.VITE_SUPABASE_URL, e.VITE_SUPABASE_ANON_KEY); } } catch { sb = null; }
export const supabase = () => sb;

/* ================= AUTH ================= */
export const useAuthStore = create<any>((set) => ({
  session: null,
  init: () => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }: any) => set({ session: data?.session || null }));
    sb.auth.onAuthStateChange((_e: any, s: any) => { set({ session: s }); });
  },
  signOut: async () => { if (sb) await sb.auth.signOut(); set({ session: null }); },
}));

/* ================= UI ================= */
const FONT_KEY = "quix_font_scale";
function loadScale(): number { try { const v = parseFloat(localStorage.getItem(FONT_KEY) || "1"); return isNaN(v) ? 1 : v; } catch { return 1; } }
export const useUIStore = create<any>((set, get) => ({
  drawerOpen: false, authOpen: false, settingsOpen: false, memoriesOpen: false, viewMode: "chat", fontScale: loadScale(), drawerReturn: false,
  setDrawerOpen: (v: boolean) => set({ drawerOpen: v }),
  openAuth: () => set({ authOpen: true }),
  openSettings: () => set({ settingsOpen: true }),
  openAuthFromDrawer: () => set({ authOpen: true, drawerReturn: true }),
  openSettingsFromDrawer: () => set({ settingsOpen: true, drawerReturn: true }),
  openMemories: () => set({ memoriesOpen: true }),
  closeMemories: () => set({ memoriesOpen: false }),
  closeAuth: () => { const r = get().drawerReturn; set({ authOpen: false, drawerReturn: false }); if (r) setTimeout(() => set({ drawerOpen: true }), 250); },
  closeSettings: () => { const r = get().drawerReturn; set({ settingsOpen: false, drawerReturn: false }); if (r) setTimeout(() => set({ drawerOpen: true }), 250); },
  setViewMode: (v: string) => set({ viewMode: v }),
  setFontScale: (s: number) => { const c = Math.min(1.3, Math.max(0.85, Math.round(s * 20) / 20)); try { localStorage.setItem(FONT_KEY, String(c)); } catch {} set({ fontScale: c }); },
}));

/* ================= CHAT ================= */
export const useChatStore = create<any>((set) => ({
  activeModel: "thinking", messages: [], isSending: false, currentChatId: null, chatTitle: "New Chat", draft: "",
  setActiveModel: (m: string) => set({ activeModel: m }),
  setIsSending: (v: boolean) => set({ isSending: v }),
  setDraft: (t: string) => set({ draft: t }),
  setCurrentChat: (id: string | null, title: string) => set({ currentChatId: id, chatTitle: title }),
  setChatTitle: (t: string) => set({ chatTitle: t }),
  addMessage: (m: ChatMessage) => set((s: any) => ({ messages: [...s.messages, m] })),
  updateMessage: (id: string, patch: any) => set((s: any) => ({ messages: s.messages.map((m: ChatMessage) => (m.id === id ? { ...m, ...patch } : m)) })),
  loadMessages: (messages: ChatMessage[]) => set({ messages }),
  resetChat: () => set({ messages: [], currentChatId: null, chatTitle: "New Chat" }),
}));

/* ================= PROFILE ================= */
const PROF_KEY = "quix_profile_v1";
let profileSaveTimer: any = null;
export function saveProfileToDB(profile: any) {
  if (profileSaveTimer) clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(async () => {
    const session = useAuthStore.getState().session;
    if (!session?.user?.id || !sb) return;
    try {
      await sb.from("profiles").upsert({ user_id: session.user.id, name: profile.name || "", email: profile.email || "", avatar: profile.avatar || null }, { onConflict: "user_id" });
    } catch {}
  }, 800);
}
export const useProfileStore = create<any>((set) => ({
  profile: (() => { try { const raw = localStorage.getItem(PROF_KEY); if (raw) { const p = { name: "", email: "", avatar: null, ...JSON.parse(raw) }; delete (p as any).username; return p; } } catch {} return { name: "", email: "", avatar: null }; })(),
  setProfile: (patch: any) => set((s: any) => {
    const profile = { ...s.profile, ...patch };
    try { localStorage.setItem(PROF_KEY, JSON.stringify(profile)); } catch {}
    saveProfileToDB(profile);
    return { profile };
  }),
}));

/* ================= USAGE LIMITS (-1 = unlimited) ================= */
export const LIMITS: Record<string, number> = { flash: 30, lite: 50, thinking: 10, deepthink: -1, coder: 10 };
const FALLBACK: Record<string, string[]> = { flash: ["lite"], lite: ["flash"], thinking: ["flash", "lite"], deepthink: [], coder: ["flash", "lite"] };
function readUsage(): Record<string, number> { try { return JSON.parse(localStorage.getItem("quix_usage_" + dayKey()) || "{}"); } catch { return {}; } }
function guestLimit(m: string): number { return m === "thinking" ? GUEST_THINKING_LIMIT : 0; }

export const useUsageStore = create<any>((set, get) => ({
  usage: readUsage(),
  limitFor: (m: string) => { const sess = useAuthStore.getState().session; return sess ? (LIMITS[m] ?? 30) : guestLimit(m); },
  remaining: (m: string) => { const lim = get().limitFor(m); if (lim < 0) return Infinity; return Math.max(0, lim - (get().usage[m] ?? 0)); },
  consume: (m: string) => { const base = readUsage(); const u = { ...base, [m]: (base[m] ?? 0) + 1 }; try { localStorage.setItem("quix_usage_" + dayKey(), JSON.stringify(u)); } catch {} set({ usage: u }); },
  resolve: (m: string) => {
    if (get().remaining(m) > 0) return m;
    const sess = useAuthStore.getState().session;
    if (!sess) return null;
    for (const f of FALLBACK[m] || []) if (get().remaining(f) > 0) return f;
    return null;
  },
}));

/* ================= MEMORY ================= */
export const useMemoryStore = create<any>((set, get) => ({
  memories: [], loadedFor: null,
  loadFor: async (uid: string) => { if (get().loadedFor === uid) return; if (!sb) { set({ memories: [], loadedFor: uid }); return; } const { data } = await sb.from("memories").select("*").eq("user_id", uid).order("created_at", { ascending: true }); set({ memories: (data || []).map((r: any) => ({ id: r.id, text: r.text })), loadedFor: uid }); },
  addMemory: async (uid: string, text: string) => { const t = text.trim(); if (!t || !sb) return; const { data } = await sb.from("memories").insert({ user_id: uid, text: t, source: "manual" }).select().single(); if (data) set((s: any) => ({ memories: [...s.memories, { id: data.id, text: data.text }] })); },
  removeMemory: async (uid: string, id: string) => { if (!sb) return; await sb.from("memories").delete().eq("id", id); set((s: any) => ({ memories: s.memories.filter((m: any) => m.id !== id) })); },
  addAuto: async (uid: string, text: string) => { if (!sb) return; const { data } = await sb.from("memories").insert({ user_id: uid, text, source: "auto" }).select().single(); if (data) set((s: any) => ({ memories: [...s.memories, { id: data.id, text: data.text }] })); },
}));

export async function runDailyMemorySync() {
  const session = useAuthStore.getState().session;
  if (!session?.user?.id || !sb) return;
  const uid = session.user.id;
  const today = dayKey();
  const key = "quix_mem_sync_v2_" + uid;
  if (localStorage.getItem(key) === today) return;
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: msgs, error } = await sb.from("messages").select("role,content,created_at").gte("created_at", since).order("created_at", { ascending: true }).limit(60);
    if (error || !msgs) return;
    const userLines = msgs.filter((m: any) => m.role === "user").map((m: any) => m.content).filter((t: string) => t && t.trim());
    if (!userLines.length) { localStorage.setItem(key, today); return; }
    let summary = "";
    const prompt = "Below are this user's messages from the last 24 hours. Output 1-5 short bullet lines, each a standalone memory sentence about their preferences, mood, projects or facts. No intro, no markdown.\n\n" + userLines.join("\n").slice(0, 6000);
    const handlers = { onThoughts: () => {}, onText: (t: string) => { summary = t; }, onDone: (r: any) => { summary = r.text; } };
    try {
      await askGeminiStream("flash", prompt, { search: false }, handlers);
    } catch {
      summary = "";
      await askGeminiStream("lite", prompt, { search: false }, handlers);
    }
    const lines = summary.split("\n").map((l: string) => l.replace(/^[\s•\-–\d.)]+/, "").trim()).filter((l: string) => l.length > 8);
    for (const line of lines.slice(0, 5)) await useMemoryStore.getState().addAuto(uid, line);
    localStorage.setItem(key, today);
  } catch {}
}

/* ================= OBSERVATIONS ================= */
const OBS_LOCAL_KEY = "quix_observations";
export function stripObs(t: string): string { const i = t.indexOf(OBS_TAG); return i >= 0 ? t.slice(0, i) : t; }
export function extractObs(t: string): string { const i = t.indexOf(OBS_TAG); return i >= 0 ? t.slice(i + OBS_TAG.length).trim() : ""; }
export function saveObservationLocal(summary: string) { try { const arr = JSON.parse(localStorage.getItem(OBS_LOCAL_KEY) || "[]"); arr.push({ t: Date.now(), s: summary }); localStorage.setItem(OBS_LOCAL_KEY, JSON.stringify(arr.slice(-300))); } catch {} }
export async function saveObservation(summary: string) {
  const s = summary.trim();
  if (!s) return;
  saveObservationLocal(s);
}

/* ================= HISTORY (persists thoughts + sources) ================= */
export async function createChat(title: string): Promise<string | null> { if (!sb) return null; try { const { data, error } = await sb.from("chats").insert({ title }).select().single(); if (error) return null; return data.id; } catch { return null; } }
export async function insertMessage(chatId: string, msg: ChatMessage) { if (!sb) return; const base = { id: msg.id, chat_id: chatId, role: msg.role, model: msg.model, content: msg.content, status: "done", kind: "text" }; const extra = { thoughts: msg.thoughts || null, sources: msg.sources && msg.sources.length ? msg.sources : null, think_time: msg.thinkTime != null ? msg.thinkTime : null }; try { await sb.from("messages").insert({ ...base, ...extra }); } catch { try { await sb.from("messages").insert(base); } catch {} } try { await sb.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId); } catch {} }
export async function fetchChats(): Promise<any[]> { if (!sb) return []; try { const { data } = await sb.from("chats").select("*").order("updated_at", { ascending: false }).limit(50); return data || []; } catch { return []; } }
export async function fetchMessages(chatId: string): Promise<ChatMessage[]> { if (!sb) return []; try { const { data } = await sb.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true }); return (data || []).map((m: any) => ({ id: m.id, role: m.role, model: m.model, content: m.content, thoughts: m.thoughts || undefined, sources: Array.isArray(m.sources) ? m.sources : undefined, thinkTime: m.think_time != null ? m.think_time : undefined, createdAt: new Date(m.created_at).getTime(), status: "done" })); } catch { return []; } }
export async function renameChat(id: string, title: string) { if (!sb) return; try { await sb.from("chats").update({ title }).eq("id", id); } catch {} }
export async function deleteChat(id: string) { if (!sb) return; try { await sb.from("chats").delete().eq("id", id); } catch {} }

/* ================= GEMINI ================= */
let controller: AbortController | null = null;
export function abortGemini() { if (controller) controller.abort(); controller = null; }
export interface GeminiResult { text: string; thoughts: string; sources: SourceItem[] }

export async function askGeminiStream(model: string, prompt: string, opts: { search?: boolean; nativeThoughts?: boolean; attachments?: any[] }, h: { onThoughts: (t: string) => void; onText: (t: string) => void; onDone: (r: GeminiResult) => void }): Promise<void> {
  const apiKey = apiKeyFor(model);
  if (!apiKey) throw new Error(`NO API KEY FOR ${model.toUpperCase()}.`);
  controller = new AbortController();
  const signal = controller.signal;
  const parts: any[] = [{ text: prompt }];
  (opts.attachments || []).forEach((a) => { if (a.kind === "text") parts.push({ text: `\n\n--- File: ${a.name} ---\n${a.text || ""}` }); else parts.push({ inline_data: { mime_type: a.mimeType, data: a.base64 } }); });
  const body: any = { contents: [{ parts }] };
  if (opts.search) body.tools = [{ google_search: {} }];
  if (opts.nativeThoughts) body.generationConfig = { thinkingConfig: { includeThoughts: true } };
  try {
    let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    if (!res.ok && opts.search) { res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }), signal }); }
    if (!res.ok || !res.body) { const d = await res.json().catch(() => null); throw new Error(d?.error?.message || "Model request failed"); }
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", text = "", thoughts = ""; const sources: SourceItem[] = []; const seen = new Set<string>();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim(); if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim(); if (!payload) continue;
        try {
          const json = JSON.parse(payload);
          (json?.candidates?.[0]?.groundingMetadata?.groundingChunks || []).forEach((c: any) => { const uri = c?.web?.uri; if (uri && !seen.has(uri)) { seen.add(uri); sources.push({ title: c?.web?.title || uri, uri }); } });
          let td = "", xd = "";
          (json?.candidates?.[0]?.content?.parts || []).forEach((p: any) => { if (p?.thought) xd += p?.text || ""; else td += p?.text || ""; });
          if (xd) { thoughts += xd; h.onThoughts(thoughts); }
          if (td) { text += td; h.onText(text); }
        } catch {}
      }
    }
    h.onDone({ text, thoughts, sources });
  } finally { controller = null; }
}

/* ================= TAVILY SEARCH (direct + serverless fallback) ================= */
export interface TavilyResult { title: string; url: string; content: string }

function mapTavily(d: any): TavilyResult[] {
  return (d?.results || []).map((r: any) => ({ title: r.title || r.url, url: r.url, content: String(r.content || "").slice(0, 1200) }));
}

export async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const key = env().VITE_TAVILY_API_KEY || "";
  if (!key) throw new Error("NO TAVILY API KEY (add VITE_TAVILY_API_KEY in Vercel).");
  const bodyBase = { query, search_depth: "advanced", max_results: 5 };
  const signal = controller ? controller.signal : undefined;
  try {
    let res = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` }, body: JSON.stringify(bodyBase), signal });
    if (res.status === 401 || res.status === 403) {
      res = await fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...bodyBase, api_key: key }), signal });
    }
    if (!res.ok) throw new Error("Tavily " + res.status);
    return mapTavily(await res.json());
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    const res = await fetch("/api/tavily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal });
    if (!res.ok) throw new Error("Search failed (" + res.status + ")");
    return mapTavily(await res.json());
  }
}

/* ================= DEEPTHINK AGENT ================= */
const SEARCH_RE = /\[\[SEARCH:?\s*([^\]\n]+?)\s*\]\]/i;
function fmtTime(sec: number): string { const m = Math.floor(sec / 60); const s = sec % 60; return `${m}:${s < 10 ? "0" : ""}${s}`; }

// meaningful work passes for the post-search phase (no more useless spinning)
const DEEPEN_STEPS = [
  "SYNTHESIS PASS: From everything found so far, draft a structured outline of the final answer (headings, key points, and which source numbers support them).",
  "CRITIQUE PASS: Attack your own outline. List weaknesses, missing angles, counter-arguments and unanswered sub-questions.",
  "ENHANCE PASS: Strengthen the draft — add concrete numbers, real examples, tricks, and actionable steps that resolve the critique.",
  "QUALITY PASS: Final polish plan — cut fluff, rank the strongest insights first, flag anything unverified.",
];

// rotates through keys; only cools down when ALL keys are rate-limited
async function geminiTurnStream(keys: string[], contents: any[], onText: (t: string) => void, onCooldown?: (sec: number) => Promise<void>, shouldStop?: () => boolean): Promise<string> {
  let rlStreak = 0;
  for (let attempt = 0; ; attempt++) {
    if (shouldStop && shouldStop()) throw new DOMException("Aborted", "AbortError");
    const apiKey = keys[attempt % keys.length];
    controller = new AbortController();
    const signal = controller.signal;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }), signal });
    if (res.status === 429 || res.status === 503) {
      rlStreak++;
      if (attempt > 14) throw new Error("Model is busy right now.");
      if (rlStreak < keys.length) { continue; } // another key is waiting — switch instantly, no cooldown
      const waitSec = Math.min(15 + rlStreak * 5, 45);
      if (onCooldown) { await onCooldown(waitSec); } else { await sleep(waitSec * 1000); }
      rlStreak = 0;
      continue;
    }
    rlStreak = 0;
    if (!res.ok || !res.body) { const d = await res.json().catch(() => null); throw new Error(d?.error?.message || "Model request failed"); }
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", text = "";
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim(); if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim(); if (!payload) continue;
        try {
          const json = JSON.parse(payload);
          (json?.candidates?.[0]?.content?.parts || []).forEach((p: any) => { if (!p?.thought && p?.text) { text += p.text; onText(text); } });
        } catch {}
      }
    }
    return text;
  }
}

function buildDeepThinkSystem(question: string, history: ChatMessage[]): string {
  const blocks: string[] = [];
  blocks.push("# DeepThink — Autonomous Research Agent\nYou are DeepThink, Quix's deep research mode. You autonomously research the live web for several minutes, then deliver one comprehensive, expert-level answer.");
  blocks.push("## SEARCH TOOL\nWhen you need live information, output a line EXACTLY like this and STOP right after it:\n[[SEARCH: your precise query]]\nThe system runs the search and returns numbered results. Never invent results.");
  blocks.push("## MANDATORY DEPTH\n- This is a LONG, exhaustive research session (target ~5 minutes). You are FORBIDDEN from writing a final answer until the system tells you enough time has passed.\n- You MUST run at least " + DEEPTHINK_MIN_SEARCHES + " searches, and you MAY run up to " + DEEPTHINK_MAX_SEARCHES + ".\n- FIRST output a short research plan as bullets (• ) listing 4-8 sub-questions covering every angle.\n- Then search each sub-question, refining and following up on interesting leads.\n- Cross-check important claims across multiple sources.\n- After searches are done, you will be asked to run synthesis/critique/enhance/quality passes — treat them seriously, they make the final answer great.");
  blocks.push("## BETWEEN SEARCHES\nThink out loud as short bullet lines starting with '• '. Identify gaps and pick the next query.");
  blocks.push("## FINAL ANSWER\nOnly when the system allows it, write the final answer in clean markdown WITHOUT any [[SEARCH:]] line. Cite sources inline like [1] using the numbered results you received. Make it thorough, practical and well-structured.");
  blocks.push("# Global Knowledge\n" + globalKnowledge);
  blocks.push("# Global Instructions\n" + globalInstructions);
  blocks.push("# DeepThink Instructions\n" + deepthinkMd);
  const sess = useAuthStore.getState().session;
  if (sess?.user) { const meta = (sess.user.user_metadata || {}) as any; const name = meta.full_name || meta.name || ""; blocks.push(`--- User identity ---\n${name ? `Name: ${name}\n` : ""}${sess.user.email ? `Email: ${sess.user.email}\n` : ""}Use it naturally.`); }
  const uid = sess?.user?.id;
  if (uid) { const ms = useMemoryStore.getState(); if (ms.loadedFor !== uid) ms.loadFor(uid); const mems = useMemoryStore.getState().memories; if (mems.length) blocks.push("--- Memories about this user ---\n" + mems.map((m: any) => `• ${m.text}`).join("\n")); }
  const hist = history.slice(-6).map((m) => `${m.role === "user" ? "User" : "Quix"}: ${stripObs(m.content)}`).join("\n");
  if (hist) blocks.push(`--- Conversation so far ---\n${hist}`);
  blocks.push(`--- USER'S RESEARCH QUESTION ---\n${question}`);
  blocks.push("Begin. Write your plan, then search, then keep going until told to answer.");
  return blocks.join("\n\n");
}

export async function runDeepThink(question: string, history: ChatMessage[], h: { onThoughts: (t: string) => void; onSources: (s: SourceItem[]) => void; onDone: (r: GeminiResult) => void }): Promise<void> {
  const keys = deepthinkKeys();
  if (!keys.length) throw new Error("NO API KEY FOR DEEPTHINK.");
  const started = Date.now();
  const sources: SourceItem[] = [];
  const seen = new Set<string>();
  let searchCount = 0;
  let nudges = 0;
  let log = "";
  let finalText = "";
  let stopped = false;
  const onStop = () => { stopped = true; try { if (controller) controller.abort(); } catch {} };
  window.addEventListener("quix-stop", onStop);
  const cool = (sec: number) => new Promise<void>((resolve) => {
    let remaining = sec;
    log += `• Cooling down... ${remaining}s\n`;
    h.onThoughts(log);
    const iv = setInterval(() => {
      if (stopped) { clearInterval(iv); resolve(); return; }
      remaining--;
      if (remaining <= 0) {
        clearInterval(iv);
        log = log.replace(/• Cooling down\.{3} \d+s\n$/, "• Cooldown over — resuming research...\n");
        h.onThoughts(log);
        resolve();
      } else {
        log = log.replace(/• Cooling down\.{3} \d+s\n$/, `• Cooling down... ${remaining}s\n`);
        h.onThoughts(log);
      }
    }, 1000);
  });
  const chk = () => stopped;
  const contents: any[] = [{ role: "user", parts: [{ text: buildDeepThinkSystem(question, history) }] }];
  try {
    while (true) {
      if (stopped) { finalText = finalText || "Research stopped."; break; }
      const elapsedMs = Date.now() - started;
      const overTime = elapsedMs > DEEPTHINK_MAX_MS;
      const underMin = elapsedMs < DEEPTHINK_MIN_MS;
      const turn = await geminiTurnStream(keys, contents, (t) => h.onThoughts(log + t), cool, chk);
      if (stopped) { finalText = finalText || "Research stopped."; break; }
      const m = turn.match(SEARCH_RE);
      const turnClean = turn.replace(SEARCH_RE, "").trim();

      // 1) model wants to search and still allowed -> do it
      if (m && searchCount < DEEPTHINK_MAX_SEARCHES && !overTime) {
        const query = m[1].trim();
        const before = turn.slice(0, m.index).trim();
        searchCount++;
        log += (before ? before + "\n" : "") + `• Searching web (${searchCount}/${DEEPTHINK_MAX_SEARCHES}): "${query}"\n`;
        h.onThoughts(log);
        contents.push({ role: "model", parts: [{ text: turn }] });
        try {
          const results = await tavilySearch(query);
          if (stopped) { finalText = finalText || "Research stopped."; break; }
          results.forEach((r) => { if (!seen.has(r.url)) { seen.add(r.url); sources.push({ title: r.title, uri: r.url }); } });
          h.onSources([...sources]);
          const block = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`).join("\n\n");
          contents.push({ role: "user", parts: [{ text: `SEARCH RESULTS for "${query}":\n${block || "(no results)"}\n\nAnalyze these results in bullets, then continue with another [[SEARCH: query]] for an unexplored angle. Do NOT write the final answer yet.` }] });
        } catch (e: any) {
          if (e?.name === "AbortError" || stopped) { finalText = finalText || "Research stopped."; break; }
          contents.push({ role: "user", parts: [{ text: `Search failed (${e?.message || "error"}). Continue with what you know or try another query.` }] });
        }
        continue;
      }

      // 2) under minimum time -> run a real work pass (synthesis/critique/enhance/quality)
      if (underMin && !overTime && nudges < 60) {
        const stepIdx = nudges % DEEPEN_STEPS.length;
        nudges++;
        if (turnClean) log += turnClean + "\n";
        const elapsedSec = Math.round(elapsedMs / 1000);
        log += `• ${fmtTime(elapsedSec)} — deepening pass ${nudges} (${searchCount} searches done)...\n`;
        h.onThoughts(log);
        const needSearches = searchCount < DEEPTHINK_MIN_SEARCHES;
        contents.push({ role: "model", parts: [{ text: turn }] });
        contents.push({ role: "user", parts: [{ text: `NOT ENOUGH RESEARCH TIME YET — ${elapsedSec}s of ${Math.round(DEEPTHINK_MIN_MS / 1000)}s minimum. Do NOT write the final answer yet. ${needSearches ? "Run more searches first ([[SEARCH: query]]). " : ""}${DEEPEN_STEPS[stepIdx]}` }] });
        for (let s = 0; s < 15; s++) { if (stopped) break; await sleep(1000); }
        continue;
      }

      // 3) model wants to search but limits hit -> force final answer
      if (m) {
        if (turnClean) log += turnClean + "\n";
        contents.push({ role: "model", parts: [{ text: turn }] });
        contents.push({ role: "user", parts: [{ text: (overTime ? "Time limit reached. " : "Search limit reached. ") + "Write your final answer now in clean markdown." }] });
        finalText = (await geminiTurnStream(keys, contents, (t) => h.onThoughts(log + t), cool, chk)).replace(SEARCH_RE, "");
        break;
      }

      // 4) enough time passed and model wrote an answer -> done
      finalText = turn.replace(SEARCH_RE, "");
      break;
    }
  } catch (e: any) {
    if (!finalText) finalText = (stopped || e?.name === "AbortError") ? "Research stopped." : "DeepThink hit a temporary roadblock and couldn't finish. Give it another try in a minute.";
  } finally {
    controller = null;
    window.removeEventListener("quix-stop", onStop);
  }
  h.onThoughts(log);
  h.onDone({ text: finalText || "Research complete.", thoughts: log, sources });
}

/* ================= PROMPT ================= */
const MODEL_MD: Record<string, string> = { flash: flashMd, lite: liteMd, coder: coderMd, thinking: thinkingMd, deepthink: deepthinkMd };
export function buildPrompt(model: string, text: string, history: ChatMessage[]): string {
  const blocks: string[] = ["# Global Knowledge\n" + globalKnowledge, "# Global Instructions\n" + globalInstructions, "# Model Instructions\n" + (MODEL_MD[model] || "")];
  const sess = useAuthStore.getState().session;
  if (sess?.user) { const meta = (sess.user.user_metadata || {}) as any; const name = meta.full_name || meta.name || ""; blocks.push(`--- User identity (from account) ---\n${name ? `Name: ${name}\n` : ""}${sess.user.email ? `Email: ${sess.user.email}\n` : ""}Use it naturally (greet by name when appropriate).`); }
  const uid = sess?.user?.id;
  if (uid) { const ms = useMemoryStore.getState(); if (ms.loadedFor !== uid) ms.loadFor(uid); const mems = useMemoryStore.getState().memories; if (mems.length) blocks.push("--- Memories about this user (always remember) ---\n" + mems.map((m: any) => `• ${m.text}`).join("\n")); }
  const hist = history.slice(-10).map((m) => `${m.role === "user" ? "User" : "Quix"}: ${stripObs(m.content)}`).join("\n");
  if (hist) blocks.push(`--- Conversation so far ---\n${hist}`);
  blocks.push(`--- User message ---\n${text}`);
  blocks.push(`--- Internal (do NOT mention or quote this instruction anywhere in your visible reply or reasoning) ---\nSilently append ONE final line starting with ${OBS_TAG} containing a 1-2 sentence factual observation of what you learned about the user this turn (intent, preferences, mood, facts). Keep it concise.`);
  return blocks.filter(Boolean).join("\n\n");
}

/* ================= HOOKS / UTILS ================= */
export function useStreamText(full: string, active: boolean, speed = 10, step = 2): string {
  const [shown, setShown] = useState(active ? "" : full);
  const idxRef = useRef(active ? 0 : full.length);
  useEffect(() => {
    if (!active) { idxRef.current = full.length; setShown(full); return; }
    if (idxRef.current > full.length) idxRef.current = full.length;
    const id = setInterval(() => { const target = full.length; if (idxRef.current > target) idxRef.current = target; if (idxRef.current < target) { idxRef.current = Math.min(target, idxRef.current + step); setShown(full.slice(0, idxRef.current)); } }, speed);
    return () => clearInterval(id);
  }, [full, active, speed, step]);
  return shown;
}

export function copyText(t: string) {
  if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(t).catch(() => {}); return; }
  const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} document.body.removeChild(ta);
}