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

export const APP_VERSION = "v2.3.0";
export const THINK_SEP = "---ANSWER---";
export const GUEST_THINKING_LIMIT = 3;
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
export const IMAGINE_URL = "https://quiximage.lovable.app/";
export const DEEPTHINK_URL = "https://quix-deepthink.lovable.app/";
export const CHAT_MODELS = ["flash", "lite", "coder", "thinking", "deepthink"];

export const MODELS: Record<string, { name: string; desc: string; key: string }> = {
  flash: { name: "Quix 3 Flash", desc: "Balanced intelligence for daily tasks", key: "VITE_GEMINI_FLASH_API_KEY" },
  lite: { name: "Quix 3 Lite", desc: "Instant replies", key: "VITE_GEMINI_LITE_API_KEY" },
  coder: { name: "Quix 3 Coder", desc: "Build apps and sites", key: "VITE_GEMINI_CODER_API_KEY" },
  thinking: { name: "Quix 3.1 Thinking", desc: "Advanced reasoning", key: "VITE_GEMINI_THINKING_API_KEY" },
  deepthink: { name: "DeepThink", desc: "5 minutes of deep research and reasoning", key: "VITE_GEMINI_DEEPTHINK_API_KEY" },
};

const env = () => (import.meta as any).env || {};
export function apiKeyFor(model: string): string { const e = env(); const k = MODELS[model]?.key; return k ? e[k] || "" : ""; }
export const rid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const dayKey = () => new Date().toISOString().slice(0, 10);

/* ================= TYPES ================= */
export interface SourceItem { title: string; uri: string }
export interface AttachmentMeta { name: string; kind: "image" | "pdf" | "text"; previewUrl?: string }
export interface ChatMessage {
  id: string; role: "user" | "ai"; model: string; content: string; thoughts?: string;
  doneStreaming?: boolean; createdAt: number; status?: "thinking" | "streaming" | "done" | "error";
  sources?: SourceItem[]; attachments?: AttachmentMeta[]; feedback?: "up" | "down";
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
  signOut: async () => { if (sb) await sb.auth.signOut(); useProfileStore.getState().reset(); set({ session: null }); },
}));

/* ================= UI ================= */
const FONT_KEY = "quix_font_scale";
function loadScale(): number { try { const v = parseFloat(localStorage.getItem(FONT_KEY) || "1"); return isNaN(v) ? 1 : v; } catch { return 1; } }
export const useUIStore = create<any>((set, get) => ({
  drawerOpen: false, authOpen: false, settingsOpen: false, memoriesOpen: false, viewMode: "chat", fontScale: loadScale(), drawerReturn: false,
  setDrawerOpen: (v: boolean) => set({ drawerOpen: v }),
  openAuth: () => set({ authOpen: true }),
  openSettings: () => set({ settingsOpen: true }),
  openMemories: () => set({ memoriesOpen: true }),
  openAuthFromDrawer: () => set({ authOpen: true, drawerReturn: true }),
  openSettingsFromDrawer: () => set({ settingsOpen: true, drawerReturn: true }),
  closeAuth: () => { const r = get().drawerReturn; set({ authOpen: false, drawerReturn: false }); if (r) setTimeout(() => set({ drawerOpen: true }), 250); },
  closeSettings: () => { const r = get().drawerReturn; set({ settingsOpen: false, drawerReturn: false }); if (r) setTimeout(() => set({ drawerOpen: true }), 250); },
  closeMemories: () => set({ memoriesOpen: false }),
  setViewMode: (v: string) => set({ viewMode: v }),
  setFontScale: (s: number) => { const c = Math.min(1.3, Math.max(0.85, Math.round(s * 20) / 20)); try { localStorage.setItem(FONT_KEY, String(c)); } catch {} set({ fontScale: c }); },
}));

/* ================= CHAT ================= */
export const useChatStore = create<any>((set) => ({
  activeModel: "thinking", messages: [], isSending: false, currentChatId: null, chatTitle: "New Chat", draft: "",
  setActiveModel: (m: string) => set({ activeModel: m }),
  setIsSending: (v: boolean) => set({ is