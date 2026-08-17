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

export const APP_VERSION = "v2.9.9";
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
export function deepthinkKeys(): string[] {
  const e = env();
  return [e.VITE_GEMINI_DEEPTHINK_API_KEY, e.VITE_GEMINI_DEEPTHINK_API_KEY_2, e.VITE_GEMINI_DEEPTHINK_API_KEY_3].filter((k: any) => !!k);
}
export const rid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const dayKey = () => new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ================= TYPES ================= */
export interface SourceItem { title: string; uri: string; desc?: string }
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
    sb.auth.getSession().then(({ data }: any) => { set({ session: data?.session || null }); syncUserStores(data?.session?.user?.id ?? null); });
    sb.auth.onAuthStateChange((_e: any, s: any) => { set({ session: s }); syncUserStores(s?.user?.id ?? null); });
  },
  signOut: async () => { if (sb) await sb.auth.signOut(); set({ session: null }); syncUserStores(null); },
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
const profKey = (uid: string) => `${PROF_KEY}_${uid}`;
const emptyProfile = () => ({ name: "", email: "", avatar: null });
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
  profile: emptyProfile(),
  loadedFor: null as string | null,
  loadFor: (uid: string | null) => {
    if (!uid) { set({ profile: emptyProfile(), loadedFor: null }); return; }
    try {
      const raw = localStorage.getItem(profKey(uid));
      const p = raw ? { ...emptyProfile(), ...JSON.parse(raw) } : emptyProfile();
      delete (p as any).username;
      set({ profile: p, loadedFor: uid });
    } catch { set({ profile: emptyProfile(), loadedFor: uid }); }
  },
  setProfile: (patch: any) => set((s: any) => {
    const profile = { ...s.profile, ...patch };
    const uid = useAuthStore.getState().session?.user?.id;
    if (uid) { try { localStorage.setItem(profKey(uid), JSON.stringify(profile)); } catch {} saveProfileToDB(profile); }
    return { profile };
  }),
}));

/* ================= USAGE (per-account, Supabase-backed) ================= */
export const LIMITS: Record<string, number> = { flash: 30, lite: 50, thinking: 10, deepthink: 1, coder: 10 };
const FALLBACK: Record<string, string[]> = { flash: ["lite"], lite: ["flash"], thinking: ["flash", "lite"], deepthink: [], coder: ["flash", "lite"] };
const usageKey = (uid: string | null) => "quix_usage_" + dayKey() + "_" + (uid || "guest");
function readUsageFor(uid: string | null): Record<string, number> { try { return JSON.parse(localStorage.getItem(usageKey(uid)) || "{}"); } catch { return {}; } }
function guestLimit(m: string): number { return m === "thinking" ? GUEST_THINKING_LIMIT : 0; }
function limitForSession(m: string): number { const sess = useAuthStore.getState().session; return sess ? (LIMITS[m] ?? 30) : guestLimit(m); }

// 'usage' exposed to the UI = messages LEFT (so the page reads left/total)
function computeLeft(used: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  CHAT_MODELS.forEach((m) => {
    const lim = limitForSession(m);
    out[m] = lim < 0 ? -1 : Math.max(0, lim - (used[m] ?? 0));
  });
  return out;
}

async function loadUsageFromDB(uid: string): Promise<Record<string, number> | null> {
  if (!sb || !uid) return null;
  try {
    const { data, error } = await sb.from("usage").select("counts").eq("user_id", uid).eq("day", dayKey()).maybeSingle();
    if (error) return null;
    return data && data.counts ? (data.counts as Record<string, number>) : {};
  } catch { return null; }
}
async function saveUsageToDB(uid: string, counts: Record<string, number>) {
  if (!sb || !uid) return;
  try {
    await sb.from("usage").upsert({ user_id: uid, day: dayKey(), counts, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
  } catch {}
}

export const useUsageStore = create<any>((set, get) => ({
  used: readUsageFor(null),
  usage: computeLeft(readUsageFor(null)),
  user: null as string | null,
  setUser: (uid: string | null) => {
    const local = readUsageFor(uid);
    set({ user: uid, used: local, usage: computeLeft(local) });
    if (uid) {
      loadUsageFromDB(uid).then((counts) => {
        if (counts && get().user === uid) set({ used: counts, usage: computeLeft(counts) });
      });
    }
  },
  limitFor: (m: string) => limitForSession(m),
  remaining: (m: string) => { const lim = get().limitFor(m); if (lim < 0) return Infinity; const left = get().usage[m]; return left == null ? lim : left; },
  consume: (m: string) => {
    const uid = get().user;
    const base = { ...get().used };
    const u = { ...base, [m]: (base[m] ?? 0) + 1 };
    if (uid) { saveUsageToDB(uid, u); } else { try { localStorage.setItem(usageKey(uid), JSON.stringify(u)); } catch {} }
    set({ used: u, usage: computeLeft(u) });
  },
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
  reset: () => set({ memories: [], loadedFor: null }),
  loadFor: async (uid: string) => { if (get().loadedFor === uid) return; if (!sb) { set({ memories: [], loadedFor: uid }); return; } const { data } = await sb.from("memories").select("*").eq("user_id", uid).order("created_at", { ascending: true }); set({ memories: (data || []).map((r: any) => ({ id: r.id, text: r.text })), loadedFor: uid }); },
  addMemory: async (uid: string, text: string) => { const t = text.trim(); if (!t || !sb) return; const { data } = await sb.from("memories").insert({ user_id: uid, text: t, source: "manual" }).select().single(); if (data) set((s: any) => ({ memories: [...s.memories, { id: data.id, text: data.text }] })); },
  removeMemory: async (uid: string, id: string) => { if (!sb) return; await sb.from("memories").delete().eq("id", id); set((s: any) => ({ memories: s.memories.filter((m: any) => m.id !== id) })); },
  addAuto: async (uid: string, text: string) => { if (!sb) return; const { data } = await sb.from("memories").insert({ user_id: uid, text, source: "auto" }).select().single(); if (data) set((s: any) => ({ memories: [...s.memories, { id: data.id, text: data.text }] })); },
}));

function syncUserStores(uid: string | null) {
  try { useProfileStore.getState().loadFor(uid); } catch {}
  try { useUsageStore.getState().setUser(uid); } catch {}
  try { useMemoryStore.getState().reset(); } catch {}
}

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

/* ================= HISTORY ================= */
export async function createChat(title: string): Promise<string | null> { if (!sb) return null; try { const { data, error } = await sb.from("chats").insert({ title }).select().single(); if (error) return null; return data.id; } catch { return null; } }
export async function insertMessage(chatId: string, msg: ChatMessage) { if (!sb) return; const base = { id: msg.id, chat_id: chatId, role: msg.role, model: msg.model, content: msg.content, status: "done", kind: "text" }; const extra = { thoughts: msg.thoughts || null, sources: msg.sources && msg.sources.length ? msg.sources : null, think_time: msg.thinkTime != null ? msg.thinkTime : null }; try { await sb.from("messages").insert({ ...base, ...extra }); } catch { try { await sb.from("messages").insert(base); } catch {} } try { await sb.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId); } catch {} }
export async function fetchChats(): Promise<any[]> { if (!sb) return []; try { const { data } = await sb.from("chats").select("*").order("updated_at", { ascending: false }).limit(50); return data || []; } catch { return []; } }
export async function fetchMessages(chatId: string): Promise<ChatMessage[]> { if (!sb) return []; try { const { data } = await sb.from("messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true }); return (data || []).map((m: any) => ({ id: m.id, role: m.role, model: m.model, content: m.content, thoughts: m.thoughts || undefined, sources: Array.isArray(m.sources) ? m.sources : undefined, thinkTime: m.think_time != null ? m.think_time : undefined, createdAt: new Date(m.created_at).getTime(), status: "done" })); } catch { return []; } }
export async function renameChat(id: string, title: string) { if (!sb) return; try { await sb.from("chats").update({ title }).eq("id", id); } catch {} }
export async function deleteChat(id: string)
{}; } catch { return null; } }
async function saveUsageToDB(uid: string, counts: Record<string, number>) { if (!sb || !uid) return; try { await sb.from("usage").upsert({ user_id: uid, day: dayKey(), counts, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" }); } catch {} }

export const useUsageStore = create<any>((set, get) => ({
  used: readUsageFor(null),
  usage: computeLeft(readUsageFor(null)),
  user: null as string | null,
  setUser: (uid: string | null) => {
    const local = readUsageFor(uid);
    set({ user: uid, used: local, usage: computeLeft(local) });
    if (uid) { loadUsageFromDB(uid).then((counts) => { if (counts && get().user === uid) set({ used: counts, usage: computeLeft(counts) }); }); }
  },
  limitFor: (m: string) => limitForSession(m),
  remaining: (m: string) => { const lim = get().limitFor(m); if (lim < 0) return Infinity; const left = get().usage[m]; return left == null ? lim : left; },
  consume: (m: string) => {
    const uid = get().user;
    const base = { ...get().used };
    const u = { ...base, [m]: (base[m] ?? 0) + 1 };
    if (uid) { saveUsageToDB(uid, u); } else { try { localStorage.setItem(usageKey(uid), JSON.stringify(u)); } catch {} }
    set({ used: u, usage: computeLeft(u) });
  },
  resolve: (m: string) => {
    if (get().remaining(m) > 0) return m;
    const sess = useAuthStore.getState().session;
    if (!sess) return null;
    for (const f of FALLBACK[m] || []) if (get().remaining(f) > 0) return f;
    return null;
  },
}));

export const useMemoryStore = create<any>((set, get) => ({
  memories: [], loadedFor: null,
  reset: () => set({ memories: [], loadedFor: null }),
  loadFor: async (uid: string) => { if (get().loadedFor === uid) return; if (!sb) { set({ memories: [], loadedFor: uid }); return; } const { data } = await sb.from("memories").select("*").eq("user_id", uid).order("created_at", { ascending: true