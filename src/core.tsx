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

export const APP_VERSION = "v2.1.0";
export const THINK_SEP = "---ANSWER---";
export const OBS_TAG = "[[OBS]]";
export const GUEST_THINKING_LIMIT = 3;
export const GEMINI_MODEL = "gemini-2.5-flash";
export const IMAGINE_URL = "https://quiximage.lovable.app/";
export const DEEPTHINK_URL = "https://quix-deepthink.lovable.app/";
export const CHAT_MODELS = ["flash", "lite", "coder", "thinking", "deepthink"];

export const MODELS: Record<string, { name: string; desc: string; key: string }> = {
  flash: { name: "Quix 3 Flash", desc: "Balanced intelligence for daily tasks", key: "VITE_GEMINI_FLASH_API_KEY" },
  lite: { name: "Quix 3 Lite", desc: "Instant replies", key: "VITE_GEMINI_LITE_API_KEY" },
  coder: { name: "Quix 3 Coder", desc: "Builds apps, teaches hacks", key: "VITE_GEMINI_CODER_API_KEY" },
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
function guestLimit(m: string): number { return m === "thinking" ? GUEST_THINKING_LIMIT : 0; }

export const useUsageStore = create<any>((set, get) => ({
  usage: readUsage(),
  limitFor: (m: string) => { const sess = useAuthStore.getState().session; return sess ? (LIMITS[m] ?? 30) : guestLimit(m); },
  remaining: (m: string) => Math.max(0, get().limitFor(m) - (get().usage[m] ?? 0)),
  consume: (m: string) => { const base = readUsage(); const u = { ...base, [m]: (base[m] ?? 0) + 1 }; try { localStorage.setItem("quix_usage_" + dayKey(), JSON.stringify(u)); } catch {} set({ usage: u }); },
  resolve: (m: string) => {
    const sess = useAuthStore.getState().session;
    if (!sess) { if (m === "thinking" && get().remaining("thinking") > 0) return "thinking"; return null; }
    if (get().remaining(m) > 0) return m;
    for (const f of FALLBACK[m] || []) if (get().remaining(f) > 0) return f;
    return null;
  },
}));

export const useMemoryStore = create<any>((set, get) => ({
  memories: [], loadedFor: null,
  loadFor: async (uid: string) => { if (get().loadedFor === uid) return; if (!sb) { set({ memories: [], loadedFor: uid }); return; } const { data } = await sb.from("memories").select("*").eq("user_id", uid).order("created_at", { ascending: true }); set({ memories: (data || []).map((r: any) => ({ id: r.id, text: r.text })), loadedFor: uid }); },
  addMemory: async (uid: string, text: string) => { const t = text.trim(); if (!t || !sb) return; const { data } = await sb.from("memories").insert({ user_id: uid, text: t, source: "manual" }).select().single(); if (data) set((s: any) => ({ memories: [...s.memories, { id: data.id, text: data.text }] })); },
  removeMemory: async (uid: string, id: string) => { if (!sb) return; await sb.from("memories").delete().eq("id", id); set((s: any) => ({ memories: s.memories.filter((m: any) => m.id !== id) })); },
  addAuto: async (uid: string, text: string) => {