import React, { useEffect, useRef, useState } from "react";
import {
  THINK_SEP, IMAGINE_URL, rid, ChatMessage,
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
  const { activeModel, addMessage, updateMessage, setIsSending, setActiveModel } = useChatStore();
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

    // ===== DEEPTHINK AGENT PATH =====
    if (startModel === "deepthink") {
      useUsageStore.getState().consume("deepthink");
      const t0 = Date.now();
      const history = useChatStore.getState().messages.filter((x) => x.id !== aiId && x.content.trim() !== "");
      runDeepThink(text, history, {
        onThoughts: (t) => updateMessage(aiId, { thoughts: t, status: "thinking" }),
        onSources: (s) => updateMessage(aiId, { sources: s }),
        onDone: (r) => {
          const raw = r.text || "";
          const obs = extractObs(raw) || `User asked DeepThink: "${text.slice(0, 140)}"`;
          saveObservation(obs);
          const full = stripObs(raw);
          updateMessage(aiId, { content: full || "Done.", thoughts: r.thoughts, sources: r.sources, status: "streaming", doneStreaming: true, thinkTime: Math.max(1, Math.round((Date.now() - t0) / 1000)) } as any);
          setIsSending(false);
        },
      }).catch((e: any) => {
        updateMessage(aiId, { content: `DeepThink error: ${e?.message || e}`, status: "error" });
        setIsSending(false);
      });
      return;
    }

    // ===== NORMAL MODELS PATH =====
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
      if (isThinkM) { prompt += "\n\n--- Thinking protocol (mandatory) ---\nThink out loud as short bullet lines, each starting with '• '. Stream these reasoning lines naturally, one after another.\nCover multiple angles: what the user really wants, edge cases, and your plan.\nWhen your reasoning is genuinely complete, write a line containing exactly '" + THINK_SEP + "', then give the final answer in clean markdown."; }
      if (isCoderM) { prompt += "\n\n--- Coder protocol ---\nAlways write a brief friendly intro sentence FIRST, before any code block, explaining what you're about to build. Then output the code."; }
      if (useCanvasStore.getState().on) { prompt += "\n\n--- Canvas mode ---\nWhen creating or editing any file (code, txt, md, etc.), always output it inside a fenced code block tagged with its language so it appears in the user's Canvas as a file card with preview and download."; }

      let thinkFrozen = false;
      const freezeThink = () => { if (thinkFrozen) return undefined; thinkFrozen = true; return Math.max(1, Math.round((Date.now() - t0) / 1000)); };

      askGeminiStream(m, prompt, { search: isThinkM, nativeThoughts: false, attachments }, {
        onThoughts: () => {},
        onText: (t) => {
          const idx = t.indexOf(THINK_SEP);
          if (idx > -1) { const tt = freezeThink(); updateMessage(aiId, { thoughts: t.slice(0, idx), content: stripObs(t.slice(idx + THINK_SEP.length).replace(/^\n+/, "")), status: "streaming", ...(tt != null ? { thinkTime: tt } : {}) } as any); }
          else { updateMessage(aiId, { thoughts: t, status: "thinking" }); }
        },
        onDone: (r) => {
          const raw = r.text || "";
          const obs = extractObs(raw) || `User asked: "${text.slice(0, 140)}"`;
          saveObservation(obs);
          const full = stripObs(raw);
          const idx = full.indexOf(THINK_SEP);
          const tt = freezeThink();
          if (idx > -1) { updateMessage(aiId, { thoughts: full.slice(0, idx), content: full.slice(idx + THINK_SEP.length).replace(/^\n+/, "") || "Done.", sources: r.sources, status: "streaming", doneStreaming: true, ...(tt != null ? { thinkTime: tt } : {}) } as any); }
          else if (full) { updateMessage(aiId, { content: full, sources: r.sources, status: "streaming", doneStreaming: true, ...(tt != null ? { thinkTime: tt } : {}) } as any); }
          else { attempt(i + 1); }
        },
      }).catch(() => { attempt(i + 1); });
    };
    attempt(0);
  };

  return (
    <div style={{ height: "100dvh", background: "#000", color: "#fff", overflow: "hidden", position: "relative" }}>
      <style>{globalCSS}</style>
      <style>{layerCSS}</style>
      <ChatHeader hidden={false} />
      <MenuDrawer hidden={false} />
      <AuthScreen />
      <SettingsPage />
      <MemoriesPage />
      <CanvasPanel />
      <div className={`qx-layer ${viewMode === "chat" ? "center" : "left"}`}>
        <MessageList />
        <ChatInputBar onSend={handleSend} isDeepThink={isDeepThink} />
      </div>
      <div className={`qx-layer ${viewMode === "imagine" ? "center" : "right"}`}>
        <iframe key={imagineNonce} src={IMAGINE_URL} title="Imagine 1.5" />
      </div>
      {loading && <LoadingScreen />}
    </div>
  );
}