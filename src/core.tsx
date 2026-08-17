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
export const GUESTTHINKINGLIMIT = 3;
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
export const IMAGINE_URL = "https://quiximage.lovable.app/";
export const CHAT_MODELS = ["flash", "lite", "coder", "thinking", "deepthink"];
export const DEEPTHINKMAXSEARCHES = 20;
export const DEEPTHINKMINSEARCHES = 5;
export const DEEPTHINKMINMS = 5  60  1000;
export const DEEPTHINKMAXMS = 8  60  1000;

export const MODELS: Record = {
  flash: { name: "Quix 3 Flash", desc: "Balanced intelligence for daily tasks", key: "VITEGEMINIFLASHAPIKEY" },
  lite: { name: "Quix 3 Lite", desc: "Instant replies", key: "VITEGEMINILITEAPIKEY" },
  coder: { name: "Quix 3 Coder", desc: "Build apps and sites", key: "VITEGEMINICODERAPIKEY" },
  thinking: { name: "Quix 3.1 Thinking", desc: "Advanced reasoning", key: "VITEGEMINITHINKINGAPIKEY" },
  deepthink: { name: "DeepThink", desc: "5 minutes of deep research and reasoning", key: "VITEGEMINIDEEPTHINKAPIKEY" },
};

const env = () => (import.meta as any).env || {};
export function apiKeyFor(model: string): string { const e = env(); const k = MODELS[model]?.key; return k ? e[k] || "" : ""; }
export function deepthinkKeys(): string[] { const e = env(); return [e.VITEGEMINIDEEPTHINKAPIKEY, e.VITEGEMINIDEEPTHINKAPIKEY2, e.VITEGEMINIDEEPTHINKAPIKEY3].filter((k: any) => !!k); }
export const rid = () => ${Date.now()}-${Math.random().toString(36).slice(2)};
export const dayKey = () => new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SourceItem { title: string; uri: string; desc?: string }
export interface AttachmentMeta { name: string; kind: "image" | "pdf" | "text"; previewUrl?: string }
export interface ChatMessage { id: string; role: "user" | "ai"; model: string; content: string; thoughts?: string; doneStreaming?: boolean; createdAt: number; status?: "thinking" | "streaming" | "done" | "error"; sources?: SourceItem[]; attachments?: AttachmentMeta[]; feedback?: "up" | "down"; thinkTime?: number; }

let sb: any = null;
try { const e = env(); if (e.VITESUPABASEURL && e.VITESUPABASEANONKEY) { sb = createClient(e.VITESUPABASEURL, e.VITESUPABASEANONKEY); } } catch { sb = null; }
export const supabase = () => sb;

export const useAuthStore = create((set) => ({
  session: null,
  init: () => { if (!sb) return; sb.auth.getSession().then(({ data }: any) => { set({ session: data?.session || null }); syncUserStores(data?.session?.user?.id ?? null); }); sb.auth.onAuthStateChange((_e: any, s: any) => { set({ session: s }); syncUserStores(s?.user?.id ?? null); }); },
  signOut: async () => { if (sb) await sb.auth.signOut(); set({ session: null }); syncUserStores(null); },
}));

const FONTKEY = "quixfont_scale";
function loadScale(): number { try { const v = parseFloat(localStorage.getItem(FONT_KEY) || "1"); return isNaN(v) ? 1 : v; } catch { return 1; } }
export const useUIStore = create((set, get) => ({
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

export const useChatStore = create((set) => ({
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

const PROFKEY = "quixprofile_v1";
const profKey = (uid: string) => ${PROFKEY}${uid}`;
const emptyProfile = () => ({ name: "", email: "", avatar: null });
let profileSaveTimer: any = null;
export function saveProfileToDB(profile: any) {
  if (profileSaveTimer) clearTimeout(profileSaveTimer);
  profileSaveTimer = setTimeout(async () => {
    const session = useAuthStore.getState().session;
    if (!session?.user?.id || !sb) return;
    try { await sb.from("profiles").upsert({ userid: session.user.id, name: profile.name || "", email: profile.email || "", avatar: profile.avatar || null }, { onConflict: "userid" }); } catch {}
  }, 800);
}
export const useProfileStore = create((set) => ({
  profile: emptyProfile(), loadedFor: null as string | null,
  loadFor: (uid: string | null) => { if (!uid) { set({ profile: emptyProfile(), loadedFor: null }); return; } try { const raw = localStorage.getItem(profKey(uid)); const p = raw ? { ...emptyProfile(), ...JSON.parse(raw) } : emptyProfile(); delete (p as any).username; set({ profile: p, loadedFor: uid }); } catch { set({ profile: emptyProfile(), loadedFor: uid }); } },
  setProfile: (patch: any) => set((s: any) => { const profile = { ...s.profile, ...patch }; const uid = useAuthStore.getState().session?.user?.id; if (uid) { try { localStorage.setItem(profKey(uid), JSON.stringify(profile)); } catch {} saveProfileToDB(profile); } return { profile }; }),
}));

/ USAGE — per-account, Supabase-backed; 'usage' = messages LEFT /
export const LIMITS: Record = { flash: 30, lite: 50, thinking: 10, deepthink: 1, coder: 10 };
const FALLBACK: Record = { flash: ["lite"], lite: ["flash"], thinking: ["flash", "lite"], deepthink: [], coder: ["flash", "lite"] };
const usageKey = (uid: string | null) => "quixusage" + dayKey() + "_" + (uid || "guest");
function readUsageFor(uid: string | null): Record { try { return JSON.parse(localStorage.getItem(usageKey(uid)) || "{}"); } catch { return {}; } }
function guestLimit(m: string): number { return m === "thinking" ? GUESTTHINKINGLIMIT : 0; }
function limitForSession(m: string): number { const sess = useAuthStore.getState().session; return sess ? (LIMITS[m] ?? 30) : guestLimit(m); }
function computeLeft(used: Record): Record { const out: Record = {}; CHAT_MODELS.forEach((m) => { const lim = limitForSession(m); out[m] = lim  | null> { if (!sb || !uid) return null; try { const { data, error } = await sb.from("usage").select("counts").eq("user_id", uid).eq("day", dayKey()).maybeSingle(); if (error) return null; return data && data.counts ? (data.counts as Record) :{}; } catch { return null; } }
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