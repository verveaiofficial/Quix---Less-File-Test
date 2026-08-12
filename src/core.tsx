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

export const APP_VERSION = "v2.0.1";
export const THINK_SEP = "---ANSWER---";
export const OBS_TAG = "[[OBS]]";
export const GEMINI_MODEL = "gemini-2.5-flash";
export const IMAGINE_URL = "https://quiximage.lovable.app/";
export const DEEPTHINK_URL = "https://quix-deepthink.lovable.app/";
export const CHAT_MODELS = ["flash", "lite", "coder", "thinking", "deepthink"];

export const MODELS: Record<string, { name: string; desc: string; key: string }> = {
  flash: { name: "Quix 3 Flash", desc: "Balanced intelligence for daily tasks", key: "VITE_GEMINI_FLASH_API_KEY" },
  lite: { name: "Quix 3 Lite", desc: "Instant replies", key: "VITE_GEMINI_LITE_API_KEY" },
  coder: { name: "Quix 3 Coder", desc: "Build apps and sites", key: "VITE_GEMINI_CODER_API_KEY" },
  thinking: { name: "Quix 3.1 Thinking", desc: "Advanced reasoning", key: "VITE_GEMINI_THINKING_API_KEY" },
  deepthink: { name: "DeepThink", desc: "Live research + deep synthesis", key: "VITE_GEMINI_DEEPTHINK_API_KEY" },
};

const env = () => (import.meta as any).env || {};
export function apiKeyFor(model: string): string { const e = env(); const k = MODELS[model]?.key; return k ? e[k] || "" : ""; }
export const rid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const dayKey = () => new Date().toISOString().slice(0, 10);

export interface SourceItem { title: string; uri: string }
export interface AttachmentMeta { name: string; kind: "image" | "pdf" | "text"; previewUrl?: string }
export interface ChatMessage { id: string; role: "user" | "ai"; model: string; content: string; thoughts?: string; doneStreaming?: boolean; createdAt: number; status?: "thinking" | "streaming" | "done" | "error"; sources?: SourceItem[]; attachments?: AttachmentMeta[]; feedback?: "up" | "down"; }

let sb: any = null;
try { const e = env(); if (e.VITE_SUPABASE_URL && e.VITE_SUPABASE_ANON_KEY) { sb = createClient(e.VITE_SUPABASE_URL, e.VITE_SUPABASE_ANON_KEY); } } catch { sb = null; }
export const supabase = () => sb;

export const useAuthStore = create<any>((set) => ({
  session: null,
  init: () => { if (!sb) return; sb.auth.getSession().then(({ data }: any) => set({ session: data?.session || null })); sb.auth.onAuthStateChange((_e: any, s: any) => { set({ session: s }); }); },
  signOut: async () => { if (sb) await sb.auth.signOut(); set({ session: null }); },
}));

const FONT_KEY = "quix_font_scale";
function loadScale(): number { try { const v = parseFloat(localStorage.getItem(FONT_KEY) || "1"); return isNaN(v) ? 1 : v; } catch { return 1; } }
export const useUIStore = create<any>((set, get) => ({
  drawerOpen: false, authOpen: false, settingsOpen: false, viewMode: "chat", fontScale: loadScale(), drawerReturn: false,
  setDrawerOpen: (v: boolean) => set({ drawerOpen: v }),
  openAuth: () => set({ authOpen: true }),
  openSettings: () => set({ settingsOpen: true }),
  openAuthFromDrawer: () => set({ authOpen: true, drawerReturn: true }),
  openSettingsFromDrawer: () => set({ settingsOpen: true, drawerReturn: true }),
  closeAuth: () => { const r = get().drawerReturn; set({ authOpen: false, drawerReturn: false }); if (r) setTimeout(() => set({ drawerOpen: true }), 250); },
  closeSettings: () => { const r = get().drawerReturn; set({ settingsOpen: false, drawerReturn: false }); if (r) setTimeout(() => set({ drawerOpen: true }), 250); },
  setViewMode: (v: string) => set({ viewMode: v }),
  setFontScale: (s: number) => { const c = Math.min(1.3, Math.max(0.85, Math.round(s * 20) / 20)); try { localStorage.setItem(FONT_KEY, String(c)); } catch {} set({ fontScale: c }); },
}));

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

const PROF_KEY = "quix_profile_v1";
export const useProfileStore = create<any>((set) => ({
  profile: (() => { try { const raw = localStorage.getItem(PROF_KEY); if (raw) return { name: "", username: "", email: "", dob: "", avatar: null, ...JSON.parse(raw) }; } catch {} return { name: "", username: "", email: "", dob: "", avatar: null }; })(),
  setProfile: (patch: any) => set((s: any) => { const profile = { ...s.profile, ...patch }; try { localStorage.setItem(PROF_KEY, JSON.stringify(profile)); } catch {} return { profile }; }),
}));

export const LIMITS: Record<string, number> = { flash: 30, lite: 50, thinking: 10, deepthink: 5, coder: 10 };
const FALLBACK: Record<string, string[]> = { flash: ["lite"], lite: ["flash"], thinking: ["flash", "lite"], deepthink: ["thinking", "flash", "lite"], coder: ["flash", "lite"] };
function readUsage(): Record<string, number> { try { return JSON.parse(localStorage.getItem("quix_usage_" + dayKey()) || "{}"); } catch { return {}; } }

export const useUsageStore = create<any>((set, get) => ({
  usage: readUsage(),
  limitFor: (m: string) => LIMITS[m] ?? 30,
  remaining: (m: string) => Math.max(0, (LIMITS[m] ?? 30) - (get().usage[m] ?? 0)),
  consume: (m: string) => { const base = readUsage(); const u = { ...base, [m]: (base[m] ?? 0) + 1 }; try { localStorage.setItem("quix_usage_" + dayKey(), JSON.stringify(u)); } catch {} set({ usage: u }); },
  resolve: (m: string) => { if (get().remaining(m) > 0) return m; for (const f of FALLBACK[m] || []) if (get().remaining(f) > 0) return f; return null; },
}));

export const useMemoryStore = create<any>((set, get) => ({
  memories: [], loadedFor: null,
  loadFor: async (uid: string) => { if (get().loadedFor === uid) return; if (!sb) { set({ memories: [], loadedFor: uid }); return; } const { data } = await sb.from("memories").select("*").eq("user_id", uid).order("created_at", { ascending: true }); set({ memories: (data || []).map((r: any) => ({ id: r.id, text: r.text })), loadedFor: uid }); },
  addMemory: async (uid: string, text: string) => { const t = text.trim(); if (!t || !sb) return; const { data } = await sb.from("memories").insert({ user_id: uid, text: t, source: "manual" }).select().single(); if (data) set((s: any) => ({ memories: [...s.memories, { id: data.id, text: data.text }] })); },
  removeMemory: async (uid: string, id: string) => { if (!sb) return; await sb.from("memories").delete().eq("id", id); set((s: any) => ({ memories: s.memories.filter((m: any) => m.id !== id) })); },
  addAuto: async (uid: string, text: string) => { if (!sb) return; const { data } = await sb.from("memories").insert({ user_id: uid, text, source: "auto" }).select().single(); if (data) set((s: any) => ({ memories: [...s.memories, { id: data.id, text: data.text }] })); },
}));

export async function runDailyMemorySync() {
  const session = useAuthStore.getState().session; if (!session?.user?.id || !sb) return;
  const uid = session.user.id; const today = dayKey(); const key = "quix_last_summary_" + uid;
  if (localStorage.getItem(key) === today) return;
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: msgs } = await sb.from("messages").select("role,content,created_at").eq("user_id", uid).gte("created_at", since).order("created_at", { ascending: true }).limit(60);
    const userLines = (msgs || []).filter((m: any) => m.role === "user").map((m: any) => m.content);
    if (!userLines.length) { localStorage.setItem(key, today); return; }
    let summary = "";
    await askGeminiStream("flash", "Below are this user's messages from the last 24 hours. Output 1-5 short bullet lines, each a standalone memory sentence. No intro, no markdown.\n\n" + userLines.join("\n").slice(0, 6000), { search: false }, { onThoughts: () => {}, onText: (t) => { summary = t; }, onDone: (r) => { summary = r.text; } });
    const lines = summary.split("\n").map((l: string) => l.replace(/^[\s•\-–\d.)]+/, "").trim()).filter((l: string) => l.length > 8);
    for (const line of lines.slice(0, 5)) await useMemoryStore.getState().addAuto(uid, line);
  } catch {}
  localStorage.setItem(key, today);
}

const OBS_LOCAL_KEY = "quix_observations";
export function stripObs(t: string): string { const i = t.indexOf(OBS_TAG); return i >= 0 ? t.slice(0, i) : t; }
export function extractObs(t: string): string { const i = t.indexOf(OBS_TAG); return i >= 0 ? t.slice(i + OBS_TAG.length).trim() : ""; }
export function saveObservationLocal(summary: string) { try { const arr = JSON.parse(localStorage.getItem(OBS_LOCAL_KEY) || "[]"); arr.push({ t: Date.now(), s: summary }); localStorage.setItem(OBS_LOCAL_KEY, JSON.stringify(arr.slice(-300))); } catch {} }
export async function saveObservation(summary: string) { const s = summary.trim(); if (!s) return; saveObservationLocal(s); if (sb) { try { await sb.from("observations").insert({ summary: s }); } catch {} } }

export async function createChat(title: string): Promise<string | null> { if (!sb) return null; try { const { data, error } = await sb.from("chats").insert({ title }).select().single(); if (error) return null; return data.id; } catch { return null; } }
export async function insertMessage(chatId: string, msg: ChatMessage) { if (!sb) return; try { await sb.from("messages").insert({ id: msg.id, chat_id: chatId, role: msg.role, model: msg.model, content: msg.content, status: "done", kind: "text" }); await sb.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId); } catch {} }
export async function fetchChats(): Promise<any[]> { if (!sb) return []; try { const { data } = await sb.from("chats").select("*").order("updated_at", { ascending: false }).limit(50); return data || []; } catch { return []; } }
export async function fetchMessages(chatId: string): Promise<ChatMessage[]> { if (!sb) return []; try { const { data } = await sb.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true }); return (data || []).map((m: any) => ({ id: m.id, role: m.role, model: m.model, content: m.content, createdAt: new Date(m.created_at).getTime(), status: "done" })); } catch { return []; } }
export async function renameChat(id: string, title: string) { if (!sb) return; try { await sb.from("chats").update({ title }).eq("id", id); } catch {} }
export async function deleteChat(id: string) { if (!sb) return; try { await sb.from("chats").delete().eq("id", id); } catch {} }

let controller: AbortController | null = null;
export function abortGemini() { if (controller) controller.abort(); controller = null; }
export interface GeminiResult { text: string; thoughts: string; sources: SourceItem[] }

export async function askGeminiStream(model: string, prompt: string, opts: { search?: boolean; nativeThoughts?: boolean; attachments?: any[] }, h: { onThoughts: (t: string) => void; onText: (t: string) => void; onDone: (r: GeminiResult) => void }): Promise<void> {
  const apiKey = apiKeyFor(model);
  if (!apiKey) throw new Error(`NO API KEY for ${model}.`);
  controller = new AbortController(); const signal = controller.signal;
  const parts: any[] = [{ text: prompt }];
  (opts.attachments || []).forEach((a) => { if (a.kind === "text") parts.push({ text: `\n\n--- File: ${a.name} ---\n${a.text || ""}` }); else parts.push({ inline_data: { mime_type: a.mimeType, data: a.base64 } }); });
  const body: any = { contents: [{ parts }] };
  if (opts.search) body.tools = [{ google_search: {} }];
  if (opts.nativeThoughts) body.generationConfig = { thinkingConfig: { includeThoughts: true } };
  try {
    let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    if (!res.ok && opts.search) { res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts }] }), signal }); }
    if (!res.ok || !res.body) { const d = await res.json().catch(() => null); throw new Error(d?.error?.message || "Gemini request failed"); }
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

const MODEL_MD: Record<string, string> = { flash: flashMd, lite: liteMd, coder: coderMd, thinking: thinkingMd, deepthink: deepthinkMd };
export function buildPrompt(model: string, text: string, history: ChatMessage[]): string {
  const blocks: string[] = ["# Global Knowledge\n" + globalKnowledge, "# Global Instructions\n" + globalInstructions, "# Model Instructions\n" + (MODEL_MD[model] || "")];
  const sess = useAuthStore.getState().session;
  if (sess?.user) { const meta = (sess.user.user_metadata || {}) as any; const name = meta.full_name || meta.name || ""; blocks.push(`--- User identity ---\n${name ? `Name: ${name}\n` : ""}${sess.user.email ? `Email: ${sess.user.email}\n` : ""}Use it naturally.`); }
  const uid = sess?.user?.id;
  if (uid) { const ms = useMemoryStore.getState(); if (ms.loadedFor !== uid) ms.loadFor(uid); const mems = useMemoryStore.getState().memories; if (mems.length) blocks.push("--- Memories about this user ---\n" + mems.map((m: any) => `• ${m.text}`).join("\n")); }
  const hist = history.slice(-10).map((m) => `${m.role === "user" ? "User" : "Quix"}: ${stripObs(m.content)}`).join("\n");
  if (hist) blocks.push(`--- Conversation so far ---\n${hist}`);
  blocks.push(`--- User message ---\n${text}`);
  blocks.push(`--- Internal observation ---\nAt the VERY END of your reply, silently append ONE line starting with ${OBS_TAG}. General observation about human behavior. Do NOT mention any specific user. Keep it 1-2 sentences.`);
  return blocks.filter(Boolean).join("\n\n");
}

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
  document.body.appendChild(ta); ta.select();