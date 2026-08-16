import React, { useEffect, useRef, useState } from "react";
import {
  THINK_SEP, IMAGINE_URL, rid, ChatMessage, MODELS, CHAT_MODELS,
  useAuthStore, useUIStore, useChatStore, useUsageStore,
  createChat, insertMessage, askGeminiStream, runDeepThink, buildPrompt, runDailyMemorySync,
  stripObs, extractObs, saveObservation,
} from "./core";
import { CanvasPanel, useCanvasStore } from "./canvas";
import { globalCSS, layerCSS } from "./styles";
import { MessageList, PendingAttachment } from "./ui";
import { ChatHeader, MenuDrawer, AuthScreen, SettingsPage, LoadingScreen, MemoriesPage, useImagineStore } from "./panels";
import { ChatInputBar } from "./inputbar";

const CHAIN: Record<string, string[]> = {
  flash: ["flash", "lite"], lite: ["lite", "flash"], thinking: ["thinking", "flash", "lite"],
  coder: ["coder", "flash", "lite"],
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const { activeModel, addMessage, updateMessage, setIsSending } = useChatStore();
  const { viewMode, fontScale } = useUIStore();
  const session = useAuthStore((s) => s.session);
  const imagineNonce = useImagineStore((s) => s.nonce);
  const isDeepThink = viewMode === "chat" && activeModel === "deepthink";

  useEffect(() => { useAuthStore.getState().init(); }, []);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 7000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--font-scale', fontScale);
  }, [fontScale]);
  useEffect(() => { if (session?.user?.id) runDailyMemorySync(); }, [session]);

  const handleSend = async (text: string, attachments: PendingAttachment[]) => {
    if (useChatStore.getState().isSending) return;
    const usage = useUsageStore.getState();
    const sessNow = useAuthStore.getState().session;
    const startModel = usage.resolve(activeModel);
    if (!startModel) {
      const allOut = CHAT_MODELS.every((m) => usage.remaining(m) <= 0);
      const modelName = MODELS[activeModel]?.name ?? activeModel;
      addMessage({ id: rid(), role: "user", model: activeModel, content: text, createdAt: Date.now(), status: "done" });
      addMessage({ id: rid(), role: "ai", model: activeModel, content: !sessNow ? "You've used your free Thinking messages. Sign in to keep talking." : allOut ? "Daily limit reached for all models. Limits reset at midnight UTC." : `Daily ${modelName} limit reached. Limits reset at midnight UTC.`, createdAt: Date.now(), status: "error" });
      if (!sessNow) useUIStore.getState().openAuth();
      return;
    }
    const userMessage: ChatMessage = { id: rid