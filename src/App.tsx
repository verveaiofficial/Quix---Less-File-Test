import React, { useEffect, useRef, useState } from "react";
import { THINK_SEP, IMAGINE_URL, DEEPTHINK_URL, rid, ChatMessage, useAuthStore, useUIStore, useChatStore, useUsageStore, createChat, insertMessage, askGeminiStream, buildPrompt, runDailyMemorySync, stripObs, extractObs, saveObservation } from "./core";
import { CanvasPanel, useCanvasStore } from "./canvas";
import { globalCSS, layerCSS } from "./styles";
import { MessageList, PendingAttachment } from "./ui";
import { ChatHeader, MenuDrawer, AuthScreen, SettingsPage, LoadingScreen, DeepThinkLayer, useImagineStore } from "./panels";
import { ChatInputBar } from "./inputbar";

const CHAIN: Record<string, string[]> = { flash: ["flash", "lite"], lite: ["lite", "flash"], thinking: ["thinking", "flash", "lite"], deepthink: ["deepthink", "flash", "lite"], coder: ["coder", "flash", "lite"] };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [dtRunning, setDtRunning] = useState(false);
  const { activeModel, addMessage, updateMessage, setIsSending, setActiveModel } = useChatStore();
  const { viewMode, fontScale } = useUIStore();
  const session = useAuthStore((s) => s.session);
  const imagineNonce = useImagineStore((s) => s.nonce);
  const dtFrameRef = useRef<HTMLIFrameElement>(null);
  const isDeepThink = viewMode === "chat" && activeModel === "deepthink";

  useEffect(() => { useAuthStore.getState().init(); }, []);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 7000); return () => clearTimeout(t); }, []);
  useEffect(() => { (document.documentElement.style as any).zoom = String(fontScale); }, [fontScale]);
  useEffect(() => { if (session?.user?.id) runDailyMemorySync(); }, [session]);
  useEffect(() => {
    const h = (e: MessageEvent) => { if (e.origin !== "https://quix-deepthink.lovable.app") return; const d = e.data || {}; if (d.type === "deepthink:started") setDtRunning(true); if (d.type === "deepthink:complete" || d.type === "deepthink:stopped") setDtRunning(false); if (d.type === "deepthink:ready") setDtRunning(!!d.running); };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);

  const postToDeepThink = (msg: any) => { const cw = dtFrameRef.current?.contentWindow; if (cw) cw.postMessage(msg, DEEPTHINK_URL); };
  const handleDeepThinkSend = (text: string) => { const usage = useUsageStore.getState(); const rem = usage.remaining("deepthink"); if (rem <= 0) { const fallback = usage.resolve("deepthink"); if (fallback) setActiveModel(fallback); else useUIStore.getState().openAuth(); return; } usage.consume("deepthink"); postToDeepThink({ type: "deepthink:ask", question: text }); };
  const handleDeepThinkStop = () => { postToDeepThink({ type: "deepthink:stop" }); };

  const handleSend = async (text: string, attachments: PendingAttachment[]) => {
    if (useChatStore.getState().isSending) return;
    const usage = useUsageStore.getState();
    const sessNow = useAuthStore.getState().session;
    const startModel = usage.resolve(activeModel);
    if (!startModel) {
      addMessage({ id: rid(), role: "user", model: activeModel, content: text, createdAt: Date.now(), status: "done" });
      addMessage({ id: rid(), role: "ai", model: activeModel, content: sessNow ? "Daily limit reached for all models. Limits reset at midnight UTC." : "You've used your free Thinking messages. Sign in to keep talking.", createdAt: Date.now(), status: "error" });
      if (!sessNow) useUIStore.getState().openAuth();
      return;
    }
    const userMessage: ChatMessage = { id: rid(), role: "user", model: startModel, content: text, createdAt: Date.now(), status: "done", attachments: attachments.map((a) => ({ name: a.name, kind: a.kind, previewUrl: a.previewUrl })) };
    const aiId = rid();
    if (startModel !== activeModel) setActiveModel(startModel);
    let chatId = useChatStore.getState().currentChatId;
    if (sessNow) { if (!chatId) { const title = text.slice(0, 40) || "New Chat"; chatId = await createChat(title); if (chatId) useChatStore.getState().setCurrentChat(chatId, title); } if (chatId) insertMessage(chatId, userMessage); }
    addMessage(userMessage);
    addMessage({ id: aiId, role: "ai", model: startModel, content: "", thoughts: "", createdAt: Date.now(), status: "thinking" } as any);
    setIsSending(true);
    const chain = CHAIN[startModel] || [startModel, "flash", "lite"];
    const attempt = (i: number) => {
      if (i >= chain.length) { updateMessage(aiId, { content: "All models are out of quota for today.", status: "error" }); setIsSending(false); return; }
      const m = chain[i];
      if (m !== useChatStore.getState().activeModel) setActiveModel(m);
      useUsageStore.getState().consume(m);
      const isThinkM = m === "thinking";
      const isCoderM = m === "coder";
      const t0 = Date.now();
      updateMessage(aiId, { model: m, status: "thinking", content: "", thoughts: "", thinkStart: t0 } as any);
      const history = useChatStore.getState().messages.filter((x) => x.id !== aiId && x.content.trim() !== "");
      let prompt = buildPrompt(m, text, history);
      if (isThinkM) prompt += `\n\n--- Thinking