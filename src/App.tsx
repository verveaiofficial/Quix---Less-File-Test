import React, { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import {
  MODELS, CHAT_MODELS, LIMITS, IMAGINE_URL, DEEPTHINK_URL, APP_VERSION, THINK_MAX_MS,
  rid, ChatMessage, SourceItem, AttachmentMeta,
  useAuthStore, useUIStore, useChatStore, useProfileStore, useMemoryStore, useUsageStore,
  supabase, createChat, insertMessage, fetchChats, fetchMessages, renameChat, deleteChat,
  askGeminiStream, abortGemini, buildPrompt, runDailyMemorySync, useStreamText, copyText,
  saveLocalMessages, clearLocalMessages, stripObs, extractObs, saveObservation,
} from "./core";
import { CanvasPanel, FileCard, InlineCodeBlock, useCanvasStore, extractFiles } from "./canvas";

const CHAIN: Record<string, string[]> = {
  flash: ["flash", "lite"], lite: ["lite", "flash"], thinking: ["thinking", "flash", "lite"],
  deepthink: ["deepthink", "flash", "lite"], coder: ["coder", "flash", "lite"],
};

/* ================= LOCAL CHAT HISTORY (guests) ================= */
const LOCAL_CHATS_KEY = "quix_local_chats";
function loadLocalChats(): any[] { try { const a = JSON.parse(localStorage.getItem(LOCAL_CHATS_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } }
function pushLocalChat(chat: any) { try { const a = loadLocalChats(); a.unshift(chat); localStorage.setItem(LOCAL_CHATS_KEY, JSON.stringify(a.slice(0, 20))); } catch {} }

/* ================= SMALL STORES ================= */
const PIN_KEY = "quix_pinned_v1";
const usePinStore = create<any>((set, get) => ({
  pinned: (() => { try { return JSON.parse(localStorage.getItem(PIN_KEY) || "[]"); } catch { return []; } })(),
  toggle: (id: string) => { if (!id) return; const cur: string[] = get().pinned; const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch {} set({ pinned: next }); },
}));
const useImagineStore = create<any>((set) => ({ nonce: 0, bump: () => set((s: any) => ({ nonce: s.nonce + 1 })) }));

function shimmer(e: any) { const el = e.currentTarget as HTMLElement; el.classList.remove("shimmer"); void el.offsetWidth; el.classList.add("shimmer"); setTimeout(() => el.classList.remove("shimmer"), 500); }
function shimmerThen(e: any, fn: () => void) { shimmer(e); setTimeout(fn, 450); }

function usePacedLines(full: string, active: boolean, linesPerSec = 2): string {
  const totalLines = useMemo(() => full.split("\n").length, [full]);
  const [shownLines, setShownLines] = useState(active ? 0 : Infinity);
  useEffect(() => {
    if (!active) { setShownLines(Infinity); return; }
    const id = setInterval(() => setShownLines((n) => Math.min(totalLines, n + linesPerSec)), 1000);
    return () => clearInterval(id);
  }, [active, totalLines, linesPerSec]);
  return full.split("\n").slice(0, shownLines).join("\n");
}

/* ================= GLOBAL CSS ================= */
const globalCSS = `
:root { color-scheme: dark; }
html, body { background: #000; }
.shimmer-btn { position: relative; overflow: hidden; }
.shimmer-btn::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 40%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent); transform: translateX(-100%); pointer-events: none; }
.shimmer-btn.shimmer::after { animation: shimmerSwipe .45s ease; }
@keyframes shimmerSwipe { from { transform: translateX(-100%); } to { transform: translateX(350%); } }
.md-wrap { display: flex; flex-direction: column; gap: 10px; }
.md-text { font-size: 15px; line-height: 1.65; color: #e5e7eb; word-wrap: break-word; }
.md-text h3, .md-text h4 { color: #fff; margin: 8px 0 4px; }
.md-text ul, .md-text ol { padding-left: 20px; margin: 4px 0; }
.md-text a { color: #7ab8ff; text-decoration: underline; }
.md-code { background: rgba(255,255,255,.08); border-radius: 6px; padding: 1px 6px; font-size: 13px; font-family: ui-monospace, monospace; }
.md-gap { height: 8px; }
`;

/* ================= MARKDOWN ================= */
function escapeHtml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inlineMd(s: string) {
  return s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>').replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}
function mdToHtml(src: string): string {
  const lines = escapeHtml(src).split("\n"); const out: string[] = []; let inUl = false, inOl = false;
  const close = () => { if (inUl) out.push("</ul>"); if (inOl) out.push("</ol>"); inUl = false; inOl = false; };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { close(); out.push('<div class="md-gap"></div>'); continue; }
    if (/^###\s/.test(t)) { close(); out.push(`<h4>${inlineMd(t.slice(4))}</h4>`); continue; }
    if (/^##\s/.test(t)) { close(); out.push(`<h3>${inlineMd(t.slice(3))}</h3>`); continue; }
    if (/^#\s/.test(t)) { close(); out.push(`<h3>${inlineMd(t.slice(2))}</h3>`); continue; }
    if (/^[-*]\s/.test(t)) { if (!inUl) { close(); out.push("<ul>"); inUl = true; } out.push(`<li>${inlineMd(t.slice(2))}</li>`); continue; }
    if (/^\d+[.)]\s/.test(t)) { if (!inOl) { close(); out.push("<ol>"); inOl = true; } out.push(`<li>${inlineMd(t.replace(/^\d+[.)]\s/, ""))}</li>`); continue; }
    close(); out.push(`<div>${inlineMd(t)}</div>`);
  }
  close(); return out.join("");
}
function MarkdownText({ text, mid, canvas }: { text: string; mid: string; canvas: boolean }) {
  const parts = text.split(/```/);
  return (
    <div className="md-wrap">
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const nl = part.indexOf("\n"); const lang = nl > -1 ? part.slice(0, nl).trim() : ""; const code = nl > -1 ? part.slice(nl + 1) : part;
          return canvas ? <FileCard key={i} lang={lang || "txt"} code={code} fid={`${mid}-${i}`} num={(i + 1) / 2} /> : <InlineCodeBlock key={i} lang={lang || "code"} code={code} />;
        }
        if (!part.trim()) return null;
        return <div key={i} className="md-text" dangerouslySetInnerHTML={{ __html: mdToHtml(part) }} />;
      })}
    </div>
  );
}

/* ================= BUBBLE ORB ================= */
const ORB_COLORS = ["#00f2ff", "#ff00c8", "#39ff14", "#6e5fff", "#ff0088", "#ffff00", "#00ffdd", "#a855f7"];
function BubbleIndicator({ size = 26, dimmed = false }: { size?: number; dimmed?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return;
    const W = size, H = size, R = size / 2, cx = R, cy = R;
    const blobs = ORB_COLORS.map((color, i) => ({ fx: 0.71 + i * 0.09, fy: 1.13 - i * 0.05, phase: i * 0.9, amp: 0.5, r: R * 0.75, color }));
    let t = 0, last = performance.now(), id = 0;
    const draw = (now: number) => {
      const dt = now - last; last = now;
      const s = (Math.sin(((now % 5000) / 5000) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      t += (0.12 + (2.2 - 0.12) * s) * dt * 0.001;
      ctx.clearRect(0, 0, W, H); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      const bg = ctx.createRadialGradient(cx * 0.84, cy * 0.76, 1, cx, cy, R);
      bg.addColorStop(0, "#1a1a2e"); bg.addColorStop(0.3, "#0f1f3d"); bg.addColorStop(0.55, "#2a1b4d"); bg.addColorStop(0.8, "#3d1f4d"); bg.addColorStop(1, "#0f2a3d");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = "screen";
      blobs.forEach((b) => {
        const bx = cx + Math.sin(b.fx * t + b.phase) * R * b.amp; const by = cy + Math.cos(b.fy * t + b.phase * 1.4) * R * b.amp;
        const br = b.r * (1 + 0.08 * Math.sin(b.fx * t * 2.3 + b.phase));
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, b.color + "cc"); g.addColorStop(0.35, b.color + "88"); g.addColorStop(0.7, b.color + "33"); g.addColorStop(1, b.color + "00");
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      });
      ctx.restore(); id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [size]);
  return (<canvas ref={ref} width={size} height={size} style={{ borderRadius: "50%", display: "block", flexShrink: 0, opacity: dimmed ? 0.35 : 1, filter: dimmed ? "grayscale(100%)" : "none", transition: "opacity .5s ease, filter .5s ease" }} />);
}

/* ================= THINKING STATUS ================= */
function faviconUrl(uri: string): string | null { try { return "https://www.google.com/s2/favicons?domain=" + new URL(uri).hostname + "&sz=32"; } catch { return null; } }
const qtsCSS = `
.qts-status { margin-bottom: 12px; width: 100%; }
.qts-head { display: flex; align-items: center; gap: 12px; padding: 6px 0; user-select: none; }
.qts-title-row { display: flex; align-items: baseline; gap: 6px; flex: 1; min-width: 0; }
.qts-title { font-size: 14.5px; font-weight: 600; color: #6b6f76; white-space: nowrap; line-height: 1.2; transition: color .3s ease; }
.qts-status.active .qts-title { color: #f5f5f5; }
.qts-status.done .qts-title { color: #8a8f96; }
.qts-meta { font-size: 13px; color: #55585e; line-height: 1.2; }
.qts-toggle { display: none; align-items: center; justify-content: center; width: 16px; height: 16px; color: #8a8f96; cursor: pointer; background: none; border: none; padding: 0; transition: transform .3s ease; }
.qts-status.done .qts-toggle { display: inline-flex; }
.qts-toggle.open { transform: rotate(180deg); }
.qts-toggle svg { stroke: currentColor; }
.qts-reason { margin: 2px 0 6px 12px; padding-left: 14px; border-left: 1px solid #2a2a2e; display: flex; flex-direction: column; gap: 10px; }
.qts-meta-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(255,255,255,.55); }
.qts-reason-icon { display: inline-flex; width: 12px; height: 12px; color: #8a8f96; flex-shrink: 0; }
.qts-reason-icon svg { display: block; stroke: currentColor; }
.qts-favstack { display: inline-flex; align-items: center; }
.qts-favstack img { width: 16px; height: 16px; border-radius: 50%; margin-left: -5px; border: 1px solid rgba(0,0,0,.8); background: #1c1c22; }
.qts-favstack img:first-child { margin-left: 0; }
.qts-thought { display: flex; gap: 8px; font-size: 12.5px; line-height: 1.65; color: rgba(255,255,255,.42); }
.qts-bullet { color: rgba(255,255,255,.35); flex-shrink: 0; }
`;
const searchIconSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const pageIconSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

function ThinkingStatus({ done, sources, thoughts }: { done: boolean; sources?: SourceItem[]; thoughts?: string }) {
  const [elapsed, setElapsed] = useState(0); const [expanded, setExpanded] = useState(true); const frozen = useRef<number | null>(null);
  useEffect(() => { if (done) return; const t = setInterval(() => setElapsed((p) => p + 1), 1000); return () => clearInterval(t); }, [done]);
  useEffect(() => { if (done && frozen.current === null) frozen.current = elapsed; }, [done, elapsed]);
  const finalTime = frozen.current ?? elapsed;
  const timeLabel = finalTime >= 60 ? `${Math.floor(finalTime / 60)}m ${finalTime % 60}s` : `${finalTime}s`;
  const thoughtParas = (thoughts || "").split(/\n+/).map((t) => t.trim()).filter(Boolean);
  const found = sources?.length ?? 0; const read = Math.min(4, found);
  const favs = (sources || []).slice(0, 4).map((s) => faviconUrl(s.uri)).filter(Boolean) as string[];
  const hasReason = thoughtParas.length > 0 || found > 0;
  return (
    <div className={`qts-status visible ${done ? "done" : "active"}`}>
      <style>{qtsCSS}</style>
      <div className="qts-head">
        <BubbleIndicator size={26} dimmed={done} />
        <div className="qts-title-row">
          <span className="qts-title">{done ? `Thought for ${timeLabel}` : "Thinking"}</span>
          {!done && <span className="qts-meta">{timeLabel}</span>}
          {done && hasReason && (<button className={`qts-toggle ${expanded ? "open" : ""}`} onClick={() => setExpanded((p) => !p)} aria-label="Toggle thought process"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></button>)}
        </div>
      </div>
      {(!done || expanded) && hasReason && (
        <div className="qts-reason">
          {found > 0 && (<div className="qts-meta-row"><span className="qts-reason-icon" dangerouslySetInnerHTML={{ __html: searchIconSvg }} /><span>Found {found} web pages</span>{favs.length > 0 && <span className="qts-favstack">{favs.map((f, i) => <img key={i} src={f} alt="" />)}</span>}</div>)}
          {read > 0 && (<div className="qts-meta-row"><span className="qts-reason-icon" dangerouslySetInnerHTML={{ __html: pageIconSvg }} /><span>Read {read} pages</span>{favs.length > 0 && <span className="qts-favstack">{favs.map((f, i) => <img key={i} src={f} alt="" />)}</span>}</div>)}
          {thoughtParas.map((t, i) => (<div className="qts-thought" key={i}><span className="qts-bullet">•</span><span>{t}</span></div>))}
        </div>
      )}
    </div>
  );
}

/* ================= USER MESSAGE ================= */
const umCSS = `
.um-wrap { align-self: flex-end; max-width: 85%; margin-left: auto; margin-bottom: 24px; display: flex; flex-direction: column; align-items: flex-end; }
.um-wrap .message-user { margin-bottom: 0; margin-left: 0; max-width: 100%; align-self: auto; }
.um-actions { display: flex; gap: 6px; margin-top: 6px; opacity: .5; transition: opacity .2s ease; }
.um-actions:hover { opacity: 1; }
.um-actions button { background: none; border: none; color: rgba(255,255,255,.7); cursor: pointer; padding: 3px 5px; border-radius: 6px; display: flex; align-items: center; }
.um-actions button:hover { background: rgba(255,255,255,.08); color: #fff; }
.um-actions svg { stroke: currentColor; }
`;
function UserMessage({ content, attachments, mid }: { content: string; attachments?: AttachmentMeta[]; mid: string }) {
  return (
    <div className="um-wrap" data-mid={mid}>
      <style>{umCSS}</style>
      <div className="message-user">
        {attachments && attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: content ? 10 : 0 }}>
            {attachments.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "rgba(255,255,255,0.7)", maxWidth: 160 }}>
                {a.kind === "image" && a.previewUrl ? (<img src={a.previewUrl} alt={a.name} style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />) : null}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
              </div>
            ))}
          </div>
        )}
        {content}
      </div>
      <div className="um-actions">
        <button onClick={() => copyText(content)} aria-label="Copy message"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg></button>
      </div>
    </div>
  );
}

/* ================= AI MESSAGE ================= */
const amCSS = `
.msg-actions { display: flex; gap: 4px; margin-top: 8px; opacity: .55; transition: opacity .2s ease; }
.msg-actions:hover { opacity: 1; }
.msg-actions button { background: none; border: none; cursor: pointer; padding: 4px 7px; border-radius: 8px; color: rgba(255,255,255,.6); display: flex; align-items: center; }
.msg-actions button:hover { background: rgba(255,255,255,.06); color: #fff; }
.msg-actions button.active { background: rgba(255,255,255,.1); color: #fff; }
.msg-actions svg { stroke: currentColor; }
`;
function AiMessage({ message, mid }: { message: ChatMessage; mid: string }) {
  const { updateMessage } = useChatStore();
  const canvasOn = useCanvasStore((s) => s.on);
  const hasCode = message.content.includes("```");
  const shouldStream = message.status === "streaming";
  const shown = useStreamText(message.content, shouldStream, 10);
  const isDone = message.status === "done" || message.status === "error";
  const isThinkingModel = message.model === "thinking" || message.model === "deepthink";
  const pacedThoughts = usePacedLines(message.thoughts || "", message.status === "thinking", 2);

  useEffect(() => {
    if (message.status !== "streaming") return;
    if (!message.doneStreaming) return;
    if (hasCode) {
      updateMessage(message.id, { status: "done" });
      useChatStore.getState().setIsSending(false);
      const { currentChatId } = useChatStore.getState(); const session = useAuthStore.getState().session;
      if (currentChatId && session) insertMessage(currentChatId, { ...message, status: "done" });
      return;
    }
    if (shown.length >= message.content.length) {
      const t = setTimeout(() => {
        updateMessage(message.id, { status: "done" });
        useChatStore.getState().setIsSending(false);
        const { currentChatId } = useChatStore.getState(); const session = useAuthStore.getState().session;
        if (currentChatId && session) insertMessage(currentChatId, { ...message, status: "done" });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [message, shown, hasCode, updateMessage]);

  useEffect(() => {
    const onStop = () => { const cur = useChatStore.getState().messages.find((m) => m.id === message.id); if (cur && cur.status === "streaming") { updateMessage(message.id, { content: shown, status: "done", doneStreaming: true }); useChatStore.getState().setIsSending(false); } };
    window.addEventListener("quix-stop", onStop);
    return () => window.removeEventListener("quix-stop", onStop);
  }, [shown, message.id, updateMessage]);

  return (
    <div className="message-ai" data-mid={mid}>
      <style>{amCSS}</style>
      <div className="ai-content">
        {isThinkingModel ? (<ThinkingStatus done={message.status !== "thinking"} sources={message.sources} thoughts={pacedThoughts} />) : (<BubbleIndicator dimmed={isDone} />)}
        <div style={{ width: "100%", maxWidth: 640 }}>
          {shouldStream && <MarkdownText text={shown} mid={mid} canvas={canvasOn} />}
          {message.status === "done" && <MarkdownText text={message.content} mid={mid} canvas={canvasOn} />}
          {message.status === "error" && (<p className="typing-text" style={{ color: "#ff8080" }}>{message.content}</p>)}
        </div>
      </div>
      {message.status === "done" && (
        <div className="msg-actions">
          <button className={message.feedback === "up" ? "active" : ""} onClick={() => updateMessage(message.id, { feedback: message.feedback === "up" ? undefined : "up" })} aria-label="Good response"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg></button>
          <button className={message.feedback === "down" ? "active" : ""} onClick={() => updateMessage(message.id, { feedback: message.feedback === "down" ? undefined : "down" })} aria-label="Bad response"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg></button>
          <button onClick={() => copyText(message.content)} aria-label="Copy response"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg></button>
        </div>
      )}
    </div>
  );
}

/* ================= MESSAGE LIST ================= */
const mlCSS = `
.message-scroll { position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; z-index: 1; }
.message-scroll::-webkit-scrollbar { width: 0; }
.message-container { width: 100%; max-width: 650px; margin: 0 auto; padding: 24px 20px 140px; display: flex; flex-direction: column; }
.message-user { align-self: flex-end; max-width: 85%; margin-left: auto; background-color: #1e1e20; color: #fff; padding: 12px 16px; border-radius: 18px 18px 4px 18px; font-size: 15px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; margin-bottom: 24px; }
.message-ai { align-self: flex-start; width: 100%; font-size: 16px; line-height: 1.6; color: #e5e7eb; margin-bottom: 24px; }
.ai-content { width: 100%; min-height: 32px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.typing-text { display: block; line-height: 1.6; color: #e5e7eb; white-space: pre-wrap; word-break: break-word; }
`;
function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const ref = useRef<HTMLDivElement>(null);
  const initialLast = useRef<string | null | undefined>(undefined);
  const lastScrolled = useRef<string | null>(null);
  useEffect(() => { const c = ref.current; if (c) c.scrollTop = c.scrollHeight; }, []);
  useEffect(() => {
    const c = ref.current; if (!c) return; const container = c.firstElementChild as HTMLElement; if (!container) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (initialLast.current === undefined) { initialLast.current = lastUser ? lastUser.id : null; return; }
    if (!lastUser) return; if (lastScrolled.current === lastUser.id) return;
    lastScrolled.current = lastUser.id;
    requestAnimationFrame(() => {
      const el = container.querySelector(`[data-mid="${lastUser.id}"]`) as HTMLElement; if (!el) return;
      const lastChild = container.lastElementChild as HTMLElement;
      const contentH = lastChild.offsetTop + lastChild.offsetHeight; const elTop = el.offsetTop;
      const need = elTop - 8 + c.clientHeight - contentH; const cur = parseFloat(getComputedStyle(container).paddingBottom) || 0;
      if (need > cur) container.style.paddingBottom = `${need}px`;
      requestAnimationFrame(() => { el.scrollIntoView({ block: "start", behavior: "smooth" }); });
      setTimeout(() => el.scrollIntoView({ block: "start", behavior: "smooth" }), 80);
    });
  }, [messages]);
  return (
    <>
      <style>{mlCSS}</style>
      <div className="message-scroll" ref={ref}>
        <div className="message-container">
          {messages.map((m) => m.role === "user" ? (<UserMessage key={m.id} mid={m.id} content={m.content} attachments={m.attachments} />) : (<AiMessage key={m.id} mid={m.id} message={m} />))}
        </div>
      </div>
    </>
  );
}

/* ================= INPUT BAR ================= */
export interface PendingAttachment { id: string; name: string; kind: "image" | "pdf" | "text"; mimeType: string; base64: string; text?: string; previewUrl?: string }
function readFileAsAttachment(file: File): Promise<PendingAttachment | null> {
  return new Promise((resolve) => {
    if (file.size > 4 * 1024 * 1024) return resolve(null);
    const isImage = file.type.startsWith("image/"); const isPdf = file.type === "application/pdf";
    const isText = file.type.startsWith("text/") || /\.(md|txt|json|js|ts|tsx|jsx|html|css|csv)$/i.test(file.name);
    const reader = new FileReader();
    if (isImage || isPdf) { reader.onload = () => { const result = String(reader.result || ""); resolve({ id: rid(), name: file.name, kind: isImage ? "image" : "pdf", mimeType: file.type, base64: result.split(",")[1] || "", previewUrl: isImage ? result : undefined }); }; reader.onerror = () => resolve(null); reader.readAsDataURL(file); }
    else if (isText) { reader.onload = () => resolve({ id: rid(), name: file.name, kind: "text", mimeType: file.type || "text/plain", base64: "", text: String(reader.result || "") }); reader.onerror = () => resolve(null); reader.readAsText(file); }
    else resolve(null);
  });
}

const ibCSS = `
.input-wrapper { position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 16px 14px 16px; background: linear-gradient(to top, #000 60%, transparent); z-index: 10; width: 100%; transition: bottom 0.05s linear; }
.input-bar { background: rgba(255,255,255,0.045); backdrop-filter: blur(40px) saturate(200%) brightness(1.1); -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.1); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset; border-radius: 16px; width: 100%; max-width: 650px; margin: 0 auto; padding: 14px 18px 12px 18px; display: flex; flex-direction: column; position: relative; }
.attach-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; position: relative; z-index: 1; }
.attach-chip { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 6px 10px; font-size: 12px; color: rgba(255,255,255,0.75); max-width: 200px; }
.attach-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attach-thumb { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; border: 1px solid rgba(255,255,255,0.15); }
.attach-remove { background: none; border: none; color: rgba(255,255,255,0.5); cursor: pointer; font-size: 14px; padding: 0 2px; }
textarea { background: transparent; border: none; outline: none; color: #fff; -webkit-text-fill-color: #fff; caret-color: #fff; font-size: 16px; font-family: inherit; width: 100%; resize: none; min-height: 40px; max-height: 250px; line-height: 1.5; margin-bottom: 6px; position: relative; z-index: 1; }
textarea::placeholder { color: rgba(255,255,255,0.35); -webkit-text-fill-color: rgba(255,255,255,0.35); }
.action-row { display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
.action-left { display: flex; align-items: center; gap: 0; }
.action-right { display: flex; align-items: center; gap: 8px; }
.plus-btn { background: transparent; border: none; outline: none; color: rgba(255,255,255,.85); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 50%; margin-left: -8px; }
.plus-btn.spin-cw svg { animation: spinCW 0.75s cubic-bezier(0.25,0,0.2,1) forwards; }
.plus-btn.spin-ccw svg { animation: spinCCW 0.75s cubic-bezier(0.25,0,0.2,1) forwards; }
@keyframes spinCW { from { transform: rotate(0); } to { transform: rotate(720deg); } }
@keyframes spinCCW { from { transform: rotate(0); } to { transform: rotate(-720deg); } }
.model-btn { display: flex; align-items: center; gap: 6px; background: transparent; border: none; border-radius: 20px; color: rgba(255,255,255,.85); font-size: 14px; font-weight: 500; font-family: inherit; padding: 6px 8px; cursor: pointer; white-space: nowrap; }
.model-btn .mchev { display: inline-flex; transition: transform .3s ease; color: rgba(255,255,255,.85); }
.model-btn.open .mchev { transform: rotate(180deg); }
.model-btn .mchev svg { stroke: currentColor; }
.pop-menu { position: absolute; bottom: calc(100% + 10px); left: 0; background: rgba(18,18,22,0.96); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; width: 240px; padding: 6px 4px; display: flex; flex-direction: column; gap: 4px; backdrop-filter: blur(40px); box-shadow: 0 16px 40px rgba(0,0,0,0.6); z-index: 60; opacity: 0; pointer-events: none; transform: translateY(8px) scale(0.96); transform-origin: bottom left; transition: opacity .22s, transform .22s; }
.pop-menu.show { opacity: 1; pointer-events: all; transform: translateY(0) scale(1); }
.model-item { padding: 10px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.model-item:hover { background: rgba(255,255,255,0.04); }
.model-item-content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.model-title { font-size: 13.5px; font-weight: 500; color: #fff; }
.model-desc { font-size: 11px; color: #9ba1a6; }
.model-check { width: 15px; height: 15px; stroke: #fff; stroke-width: 2.2; flex-shrink: 0; }
.beta-tag { color: #9ba1a6; margin-left: 3px; }
.upload-opt { display: flex; align-items: center; gap: 12px; padding: 13px 16px; cursor: pointer; font-size: 14px; color: rgba(255,255,255,0.8); }
.upload-opt:hover { background: rgba(255,255,255,0.08); }
.upload-opt.on { color: #7ab8ff; }
.upload-opt.on svg { stroke: #7ab8ff; }
.cv-cross { margin-left: auto; width: 22px; height: 22px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: #7ab8ff; font-size: 15px; }
.cv-pill { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 18px; border: 1px solid rgba(122,184,255,.4); background: rgba(122,184,255,.08); color: #7ab8ff; font-size: 12px; font-family: 'DM Sans', sans-serif; cursor: pointer; }
.cv-pill svg { stroke: currentColor; }
.send-btn { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.1); outline: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .15s ease; }
.send-btn:not(:disabled) { background: #fff; border-color: transparent; }
.send-btn:not(:disabled) svg { stroke: #000; }
.send-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.send-btn:disabled svg { stroke: rgba(255,255,255,0.6); }
.send-btn.stop { background: #fff; opacity: 1; cursor: pointer; }
.send-btn.stop:active { transform: scale(0.9); }
.send-btn.stop svg { fill: #000; stroke: none; }
.send-btn.mic { background: transparent; border-color: transparent; }
.send-btn.mic svg { stroke: rgba(255,255,255,.7); }
.send-btn.mic.listening svg { stroke: #7ab8ff; animation: micPulse 1s infinite; }
@keyframes micPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
`;

function ChatInputBar({ onSend, onDeepThinkSend, onDeepThinkStop, isDeepThink, dtRunning }: { onSend?: (t: string, a: PendingAttachment[]) => void; onDeepThinkSend?: (t: string) => void; onDeepThinkStop?: () => void; isDeepThink?: boolean; dtRunning?: boolean }) {
  const { activeModel, setActiveModel, isSending } = useChatStore();
  const messages = useChatStore((s) => s.messages);
  const canvasOn = useCanvasStore((s) => s.on);
  const setCanvasOn = useCanvasStore((s) => s.setOn);
  const openFilesList = useCanvasStore((s) => s.openFilesList);
  const [inputValue, setInputValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [spinClass, setSpinClass] = useState("");
  const [bottomOffset, setBottomOffset] = useState(0);
  const [listening, setListening] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const spinDir = useRef(1);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);
  const micBase = useRef("");
  const fileCount = extractFiles(messages).length;

  useEffect(() => { const g = () => { setMenuOpen(false); setModelMenuOpen(false); }; document.addEventListener("click", g); return () => document.removeEventListener("click", g); }, []);
  useEffect(() => { const r = () => { if (window.visualViewport) { const kb = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop; setBottomOffset(Math.max(0, kb)); } }; if (window.visualViewport) window.visualViewport.addEventListener("resize", r); return () => { if (window.visualViewport) window.visualViewport.removeEventListener("resize", r); }; }, []);

  const prevent = (e: any) => e.preventDefault();
  const toggleMic = () => {
    const w = window as any; const SR = w.SpeechRecognition || w.webkitSpeechRecognition; if (!SR) return;
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new SR(); rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false;
    micBase.current = inputValue;
    rec.onresult = (e: any) => { let t = ""; for (const r of e.results) t += r[0].transcript; setInputValue((micBase.current ? micBase.current + " " : "") + t); };
    rec.onend = () => setListening(false); rec.onerror = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  const toggleUpload = (e: any) => { e.preventDefault(); e.stopPropagation(); setModelMenuOpen(false); setSpinClass(""); setTimeout(() => { const c = spinDir.current === 1 ? "spin-cw" : "spin-ccw"; setSpinClass(c); spinDir.current *= -1; }, 10); setMenuOpen((p) => !p); };
  const pick = async (files: FileList | null) => { if (!files) return; const parsed = await Promise.all(Array.from(files).map(readFileAsAttachment)); setAttachments((p) => [...p, ...parsed.filter((x): x is PendingAttachment => x !== null)]); };

  const hasText = inputValue.trim().length > 0;
  const showStop = isDeepThink ? !!dtRunning : isSending;
  const showMic = !showStop && !hasText;

  const send = () => { const text = inputValue.trim(); if (!text) return; if (isDeepThink) { onDeepThinkSend?.(text); setInputValue(""); if (taRef.current) { taRef.current.blur(); taRef.current.style.height = "40px"; } return; } if (attachments.length === 0 && !text) return; onSend?.(text, attachments); setInputValue(""); setAttachments([]); if (taRef.current) { taRef.current.blur(); taRef.current.style.height = "40px"; } };
  const stop = () => { if (isDeepThink) { onDeepThinkStop?.(); return; } abortGemini(); window.dispatchEvent(new Event("quix-stop")); useChatStore.getState().setIsSending(false); };
  const mainAction = () => { if (showStop) return stop(); if (hasText) return send(); return toggleMic(); };

  return (
    <>
      <style>{ibCSS}</style>
      <input type="file" ref={fileRef} multiple style={{ display: "none" }} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input type="file" ref={imgRef} accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <div className="input-wrapper" style={{ bottom: `${bottomOffset}px` }}>
        <div className="input-bar">
          {!isDeepThink && attachments.length > 0 && (
            <div className="attach-row">
              {attachments.map((a) => (
                <div className="attach-chip" key={a.id}>
                  {a.kind === "image" && a.previewUrl ? <img className="attach-thumb" src={a.previewUrl} alt={a.name} /> : null}
                  <span>{a.name}</span>
                  <button className="attach-remove" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>×</button>
                </div>
              ))}
            </div>
          )}
          <textarea ref={taRef} placeholder={isDeepThink ? "Ask DeepThink..." : "Ask Quix..."} rows={1} value={inputValue} onChange={(e) => { setInputValue(e.target.value); if (taRef.current) { taRef.current.style.height = "40px"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 250) + "px"; } }} onBlur={() => { if (!menuOpen) setBottomOffset(0); }} />
          <div className="action-row">
            <div className="action-left">
              {!isDeepThink && (
                <div style={{ position: "relative" }}>
                  <button type="button" className={`plus-btn ${spinClass}`} onClick={toggleUpload} onMouseDown={prevent} onTouchStart={prevent} aria-label="Upload options"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                  <div className={`pop-menu ${menuOpen ? "show" : ""}`} style={{ width: 180 }}>
                    <div className="upload-opt" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); fileRef.current?.click(); }} onMouseDown={prevent}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>Upload file</div>
                    <div className="upload-opt" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); imgRef.current?.click(); }} onMouseDown={prevent}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>Upload image</div>
                    <div className={`upload-opt ${canvasOn ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); setCanvasOn(!canvasOn); setMenuOpen(false); }} onMouseDown={prevent}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>Canvas
                      {canvasOn && (<span className="cv-cross" onClick={(e) => { e.stopPropagation(); setCanvasOn(false); setMenuOpen(false); }}>×</span>)}
                    </div>
                  </div>
                </div>
              )}
              <div style={{ position: "relative" }}>
                <button type="button" className={`model-btn ${modelMenuOpen ? "open" : ""}`} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setModelMenuOpen((p) => !p); }} onMouseDown={prevent} onTouchStart={prevent}>
                  <span>{MODELS[activeModel]?.name ?? "Quix 3 Flash"}</span>
                  <span className="mchev"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                </button>
                <div className={`pop-menu ${modelMenuOpen ? "show" : ""}`}>
                  {CHAT_MODELS.map((id) => (
                    <div key={id} className="model-item" onClick={(e) => { e.stopPropagation(); setActiveModel(id); setModelMenuOpen(false); }}>
                      {activeModel === id ? (<svg viewBox="0 0 24 24" fill="none" className="model-check" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>) : (<div style={{ width: 15, flexShrink: 0 }} />)}
                      <div className="model-item-content">
                        <span className="model-title">{MODELS[id].name}{id === "deepthink" && <span className="beta-tag">Beta</span>}</span>
                        <span className="model-desc">{MODELS[id].desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="action-right">
              {canvasOn && !isDeepThink && (<button type="button" className="cv-pill" onClick={() => openFilesList()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>Canvas{fileCount > 0 ? ` · ${fileCount}` : ""}</button>)}
              <button type="button" className={`send-btn ${showStop ? "stop" : ""} ${showMic ? (listening ? "mic listening" : "mic") : ""}`} onClick={mainAction} aria-label={showStop ? "Stop" : hasText ? "Send" : "Voice input"}>
                {showStop ? (<svg width="15" height="15" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>) : hasText ? (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>) : (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= DEEPTHINK ================= */
const dtCSS = `.dt-frame { position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; border: none; background: #000; z-index: 5; display: block; }`;
function DeepThinkLayer({ frameRef }: { frameRef: React.RefObject<HTMLIFrameElement> }) {
  return (<><style>{dtCSS}</style><iframe ref={frameRef} className="dt-frame" src={DEEPTHINK_URL} title="DeepThink" /></>);
}

/* ================= HEADER ================= */
const hdCSS = `
#chat-header { position: fixed; top: 0; left: 0; right: 0; height: 56px; z-index: 30; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; background: rgba(18,18,22,0.94); border-bottom: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(40px) saturate(200%) brightness(1.1); -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.1); }
.header-center { flex: 1; display: flex; justify-content: center; align-items: center; position: relative; z-index: 1; }
.view-toggle { display: flex; align-items: center; gap: 4px; }
.view-btn { border: none; background: transparent; color: rgba(255,255,255,.35); font-size: 14px; font-weight: 500; font-family: 'DM Sans', sans-serif; padding: 6px 12px; border-radius: 20px; cursor: pointer; transition: color .3s ease; }
.view-btn.active { color: rgba(255,255,255,.85); }
.hdr-dots-btn { background: none; border: none; cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center; color: #fff; border-radius: 8px; width: 36px; height: 36px; position: relative; z-index: 1; }
.hdr-dots-btn.spinning svg { animation: spinOnce .5s ease; }
@keyframes spinOnce { from { transform: rotate(0); } to { transform: rotate(360deg); } }
.dots-container { position: relative; width: 18px; height: 18px; }
.dots-container span { position: absolute; background: currentColor; transition: all .32s cubic-bezier(0.4,0,0.2,1); }
.dots-container span:nth-child(1) { left: 0; top: 7.5px; width: 3px; height: 3px; border-radius: 50%; }
.dots-container span:nth-child(2) { left: 7.5px; top: 7.5px; width: 3px; height: 3px; border-radius: 50%; }
.dots-container span:nth-child(3) { left: 15px; top: 7.5px; width: 3px; height: 3px; border-radius: 50%; }
.hdr-dots-btn.active .dots-container span:nth-child(1) { left: 0; top: 8px; width: 18px; height: 1.5px; border-radius: 2px; transform: rotate(45deg); }
.hdr-dots-btn.active .dots-container span:nth-child(2) { opacity: 0; }
.hdr-dots-btn.active .dots-container span:nth-child(3) { left: 0; top: 8px; width: 18px; height: 1.5px; border-radius: 2px; transform: rotate(-45deg); }
#chat-options-menu { position: fixed; top: 64px; right: 14px; background: rgba(18,18,22,0.96); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; overflow: hidden; min-width: 180px; z-index: 25; opacity: 0; pointer-events: none; transition: opacity .18s; }
#chat-options-menu.show { opacity: 1; pointer-events: all; }
.chat-opt { padding: 14px 18px; cursor: pointer; font-size: 14px; color: rgba(255,255,255,.8); display: flex; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,.06); }
.chat-opt:last-child { border-bottom: none; }
.chat-opt:hover { background: rgba(255,255,255,0.04); }
.chat-opt.danger { color: #ff5f5f; }
#rename-modal { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.7); backdrop-filter: blur(6px); opacity: 0; pointer-events: none; transition: opacity .2s; }
#rename-modal.show { opacity: 1; pointer-events: all; }
.rename-box { background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.14); border-radius: 20px; padding: 24px 20px; width: calc(100% - 48px); max-width: 340px; }
.rename-box h3 { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 16px; }
.rename-input { width: 100%; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px 14px; color: #fff; font-size: 15px; outline: none; }
.rename-actions { display: flex; gap: 10px; margin-top: 14px; }
.rename-cancel, .rename-save { flex: 1; padding: 11px; border-radius: 10px; border: none; font-size: 14px; cursor: pointer; font-weight: 500; }
.rename-cancel { background: rgba(255,255,255,.07); color: rgba(255,255,255,.7); }
.rename-save { background: #fff; color: #000; }
`;
function ChatHeader() {
  const { chatTitle, setChatTitle, currentChatId, resetChat } = useChatStore();
  const { viewMode, setViewMode } = useUIStore();
  const { session } = useAuthStore();
  const pinned = usePinStore((s) => s.pinned);
  const togglePin = usePinStore((s) => s.toggle);
  const bumpImagine = useImagineStore((s) => s.bump);
  const openFilesList = useCanvasStore((s) => s.openFilesList);
  const [optOpen, setOptOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState("New Chat");
  const [spinning, setSpinning] = useState(false);
  useEffect(() => { const g = () => setOptOpen(false); window.addEventListener("click", g); return () => window.removeEventListener("click", g); }, []);
  const refreshImagine = (e: any) => { e.stopPropagation(); setSpinning(true); setTimeout(() => setSpinning(false), 550); bumpImagine(); };
  const isPinned = !!currentChatId && pinned.includes(currentChatId);
  return (
    <>
      <style>{hdCSS}</style>
      <div id="chat-header">
        <div style={{ width: 36, flexShrink: 0 }} />
        <div className="header-center">
          <div className="view-toggle">
            <button className={`view-btn ${viewMode === "chat" ? "active" : ""}`} onClick={() => setViewMode("chat")}>Chat</button>
            <button className={`view-btn ${viewMode === "imagine" ? "active" : ""}`} onClick={() => setViewMode("imagine")}>Imagine</button>
          </div>
        </div>
        {viewMode === "imagine" ? (
          <button className={`hdr-dots-btn ${spinning ? "spinning" : ""}`} onClick={refreshImagine} aria-label="Refresh Imagine"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg></button>
        ) : (
          <button className={`hdr-dots-btn ${optOpen ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setOptOpen((p) => !p); }} aria-label="Options"><div className="dots-container"><span /><span /><span /></div></button>
        )}
      </div>
      <div id="chat-options-menu" className={optOpen ? "show" : ""}>
        <div className="chat-opt shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); openFilesList(); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>Files in this chat</div>
        <div className="chat-opt shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); archiveCurrent(); resetChat(); clearLocalMessages(); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>New chat</div>
        <div className="chat-opt shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); if (currentChatId) togglePin(currentChatId); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 3h6l1 7 2 2H6l2-2z" /></svg>{isPinned ? "Unpin chat" : "Pin chat"}</div>
        <div className="chat-opt shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); setRenameVal(chatTitle); setRenameOpen(true); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>Rename chat</div>
        <div className="chat-opt danger shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); if (session && currentChatId) deleteChat(currentChatId); resetChat(); clearLocalMessages(); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>Delete chat</div>
      </div>
      <div id="rename-modal" className={renameOpen ? "show" : ""} onClick={() => setRenameOpen(false)}>
        <div className="rename-box" onClick={(e) => e.stopPropagation()}>
          <h3>Rename Chat</h3>
          <input className="rename-input" type="text" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { const t = renameVal.trim(); if (t) { setChatTitle(t); if (session && currentChatId) renameChat(currentChatId, t); } setRenameOpen(false); } }} />
          <div className="rename-actions">
            <button className="rename-cancel" onClick={() => setRenameOpen(false)}>Cancel</button>
            <button className="rename-save" onClick={() => { const t = renameVal.trim(); if (t) { setChatTitle(t); if (session && currentChatId) renameChat(currentChatId, t); } setRenameOpen(false); }}>Save</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= DRAWER ================= */
const dwCSS = `
#overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); backdrop-filter: blur(4px); z-index: 40; opacity: 0; pointer-events: none; transition: opacity .35s ease; }
#overlay.open { opacity: 1; pointer-events: all; }
@media (min-width:768px){ #overlay.open { opacity: 0; pointer-events: none; } }
#drawer { position: fixed; top: 0; left: 0; height: 100vh; height: 100lvh; width: 280px; background: rgba(20,20,24,0.92); backdrop-filter: blur(20px) saturate(160%); border-right: 1px solid rgba(255,255,255,0.12); z-index: 50; display: flex; flex-direction: column; overflow-y: auto; transform: translate3d(-100%,0,0); will-change: transform; transition: transform .35s cubic-bezier(.25,.46,.45,.94); }
#drawer.open { transform: translate3d(0,0,0); }
.drawer-inner { display: flex; flex-direction: column; min-height: 100%; position: relative; z-index: 1; }
.drawer-top { padding: 52px 20px 0; flex-shrink: 0; }
.drawer-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 20px 16px; }
.drawer-scroll::-webkit-scrollbar { width: 0; }
.brand { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 20px; letter-spacing: .14em; color: rgba(255,255,255,.95); margin-bottom: 24px; }
.new-btn { width: 100%; padding: 11px 16px; background: transparent; border: 1px solid rgba(255,255,255,0.25); border-radius: 12px; color: rgba(255,255,255,.9); font-size: 13px; font-family: 'DM Sans', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
input.new-btn { display: block; text-align: left; outline: none; }
input.new-btn::placeholder { color: rgba(255,255,255,.35); }
.hist-label { font-size: 10px; letter-spacing: .14em; color: rgba(255,255,255,.25); margin-bottom: 10px; padding-left: 4px; }
.hist-item { padding: 10px 12px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
.hist-item:hover { background: rgba(255,255,255,.06); }
.hist-item.current { background: rgba(255,255,255,.08); }
.hist-main { flex: 1; min-width: 0; }
.hist-title { font-size: 13px; color: rgba(255,255,255,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
.hist-time { font-size: 10px; color: rgba(255,255,255,.25); }
.hist-pin { color: rgba(255,255,255,.5); flex-shrink: 0; }
.hist-empty { font-size: 12px; color: rgba(255,255,255,.25); padding: 10px 12px; }
.drawer-footer { flex-shrink: 0; border-top: 1px solid rgba(255,255,255,.06); padding: 14px 20px 18px; display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 1; }
.signin-btn { width: 100%; padding: 11px 16px; background: transparent; border: 1px solid rgba(255,255,255,0.25); border-radius: 12px; color: rgba(255,255,255,.9); font-size: 13px; font-family: 'DM Sans', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 10px; }
.user-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.user-email { font-size: 12px; color: rgba(255,255,255,.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.signout-btn { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; color: rgba(255,255,255,.7); font-size: 12px; cursor: pointer; padding: 8px 12px; }
.profile-row { display: flex; align-items: center; gap: 10px; }
.settings-circle { width: 40px; height: 40px; flex-shrink: 0; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: rgba(255,255,255,.7); display: flex; align-items: center; justify-content: center; cursor: pointer; }
#open-btn { position: fixed; top: 12.75px; left: 16px; z-index: 60; background: none; border: none; outline: none; cursor: pointer; display: flex; flex-direction: column; gap: 5px; padding: 8px; transition: left .35s cubic-bezier(.25,.46,.45,.94); }
#open-btn.open { left: 236px; }
#open-btn span { display: block; height: 1.5px; background: rgba(255,255,255,.65); border-radius: 2px; transform-origin: center; transition: transform .25s, opacity .25s; }
#open-btn span:nth-child(1) { width: 18px; }
#open-btn span:nth-child(2) { width: 13px; }
#open-btn span:nth-child(3) { width: 18px; }
#open-btn.open span:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
#open-btn.open span:nth-child(2) { opacity: 0; }
#open-btn.open span:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }
`;
function timeAgo(d: string): string { const diff = Math.max(0, Date.now() - new Date(d).getTime()); const m = Math.floor(diff / 60000); if (m < 1) return "Just now"; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; }
function MenuDrawer() {
  const { drawerOpen, setDrawerOpen, openAuthFromDrawer, openSettingsFromDrawer } = useUIStore();
  const { resetChat, loadMessages, setCurrentChat, currentChatId } = useChatStore();
  const { session, signOut } = useAuthStore();
  const pinned = usePinStore((s) => s.pinned);
  const [chats, setChats] = useState<any[]>([]);
  const [localChats, setLocalChats] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => { if (drawerOpen && session) fetchChats().then(setChats); if (drawerOpen && !session) setLocalChats(loadLocalChats()); }, [drawerOpen, session]);
  const source = session ? chats : localChats;
  const filtered = query.trim() ? source.filter((c) => c.title?.toLowerCase().includes(query.trim().toLowerCase())) : source;
  const sorted = [...filtered].sort((a, b) => (pinned.includes(b.id) ? 1 : 0) - (pinned.includes(a.id) ? 1 : 0));
  return (
    <>
      <style>{dwCSS}</style>
      <div id="overlay" className={drawerOpen ? "open" : ""} onClick={() => setDrawerOpen(false)} />
      <div id="drawer" className={drawerOpen ? "open" : ""}>
        <div className="drawer-inner">
          <div className="drawer-top">
            <div className="brand">QUIX</div>
            {searchOpen ? (<input className="new-btn" placeholder="Search your chats..." value={query} autoFocus onChange={(e) => setQuery(e.target.value)} onBlur={() => { if (!query.trim()) setSearchOpen(false); }} />) : (
              <button className="new-btn" onClick={() => setSearchOpen(true)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>Search chats</button>
            )}
          </div>
          <div className="drawer-scroll">
            <div className="hist-label">Recent</div>
            {sorted.length > 0 ? (<div>{sorted.map((c) => (<div className={`hist-item ${c.id === currentChatId ? "current" : ""}`} key={c.id} onClick={async () => { if (session) { const msgs = await fetchMessages(c.id); loadMessages(msgs); setCurrentChat(c.id, c.title); } else { loadMessages(c.messages || []); setCurrentChat(c.id, c.title); } setDrawerOpen(false); }}><div className="hist-main"><div className="hist-title">{c.title}</div><div className="hist-time">{c.updated_at ? timeAgo(c.updated_at) : (c.savedAt ? timeAgo(c.savedAt) : "")}</div></div>{pinned.includes(c.id) && (<span className="hist-pin"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 3h6l1 7 2 2H6l2-2z" /></svg></span>)}</div>))}</div>) : (<div className="hist-empty">{query ? "No chats match your search." : "No chats yet. Your conversations will appear here once you start talking."}</div>)}
          </div>
          <div className="drawer-footer">
            {session ? (<div className="user-row"><span className="user-email">{session.user.email || "Signed in"}</span><button className="signout-btn" onClick={(e) => shimmerThen(e, async () => { await signOut(); resetChat(); })}>Sign out</button></div>) : (
              <button className="signin-btn shimmer-btn" onClick={(e) => shimmerThen(e, () => { setDrawerOpen(false); setTimeout(() => openAuthFromDrawer(), 150); })}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>Sign in</button>
            )}
            <div className="profile-row">
              <button className="signin-btn shimmer-btn" style={{ flex: 1 }} onClick={(e) => shimmerThen(e, () => { setDrawerOpen(false); setTimeout(() => openSettingsFromDrawer(), 150); })}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>Your profile</button>
              <button className="settings-circle shimmer-btn" onClick={(e) => shimmerThen(e, () => { setDrawerOpen(false); setTimeout(() => openSettingsFromDrawer(), 150); })} aria-label="Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></button>
            </div>
          </div>
        </div>
      </div>
      <button id="open-btn" className={drawerOpen ? "open" : ""} onClick={() => setDrawerOpen(!drawerOpen)} aria-label="Toggle Menu"><span /><span /><span /></button>
    </>
  );
}

/* ================= AUTH ================= */
const auCSS = `
#auth-screen { position: fixed; inset: 0; z-index: 200; background: rgba(255,255,255,0.045); backdrop-filter: blur(40px) saturate(200%) brightness(1.1); -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.1); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 24px; opacity: 0; pointer-events: none; transform: translateY(30px); transition: opacity .35s ease, transform .35s ease; }
#auth-screen.show { opacity: 1; pointer-events: all; transform: translateY(0); }
.auth-back { position: absolute; top: 18px; left: 16px; background: none; border: none; outline: none; cursor: pointer; color: rgba(255,255,255,.55); padding: 8px; display: flex; align-items: center; gap: 6px; font-size: 14px; font-family: 'DM Sans', sans-serif; transition: color .2s ease; }
.auth-back:hover { color: #fff; }
.auth-logo { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 28px; letter-spacing: .14em; color: #fff; margin-bottom: 8px; }
.auth-tagline { font-size: 13px; color: rgba(255,255,255,.35); margin-bottom: 36px; text-align: center; }
.auth-tabs { display: flex; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 4px; margin-bottom: 20px; width: 100%; max-width: 340px; position: relative; overflow: hidden; }
.auth-tab { flex: 1; padding: 10px; border: none; background: transparent; outline: none; color: rgba(255,255,255,.45); font-size: 13.5px; font-weight: 500; font-family: 'DM Sans', sans-serif; cursor: pointer; border-radius: 12px; transition: all .3s ease; position: relative; z-index: 1; }
.auth-tab.active { background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.14); color: rgba(255,255,255,.95); }
.auth-form { width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 12px; }
.auth-field { width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; color: rgba(255,255,255,.88); font-size: 15px; font-family: 'DM Sans', sans-serif; outline: none; }
.auth-field::placeholder { color: rgba(255,255,255,.28); }
.auth-submit { width: 100%; padding: 14px; background: #fff; color: #000; border: none; outline: none; border-radius: 14px; font-size: 15px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: background .25s ease; margin-top: 4px; }
.auth-submit:hover { background: #e8e8e8; }
.auth-switch { text-align: center; font-size: 13px; color: rgba(255,255,255,.35); margin-top: 4px; }
.auth-switch span { color: rgba(255,255,255,.8); cursor: pointer; text-decoration: underline; }
.auth-err { font-size: 12px; color: #ff8080; text-align: center; }
.auth-notice { font-size: 12.5px; color: #7ee2a8; background: rgba(126,226,168,0.08); border: 1px solid rgba(126,226,168,0.25); border-radius: 12px; padding: 10px 12px; text-align: center; line-height: 1.5; }
`;
function AuthScreen() {
  const { authOpen, closeAuth } = useUIStore();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(""); const [notice, setNotice] = useState("");
  const submit = async () => {
    const sb = supabase(); if (!sb) { setErr("Auth not configured. Add Supabase env keys."); return; }
    setErr(""); setNotice("");
    if (tab === "signup" && pass !== confirm) { setErr("Passwords don't match."); return; }
    if (tab === "signin") { const { error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) setErr(error.message); else closeAuth(); }
    else { const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name } } }); if (error) setErr(error.message); else if (!data?.session) { setNotice("Account created. Check your email and tap the confirmation link, then come back and sign in."); setTab("signin"); setPass(""); setConfirm(""); } else closeAuth(); }
  };
  return (
    <>
      <style>{auCSS}</style>
      <div id="auth-screen" className={authOpen ? "show" : ""}>
        <button className="auth-back" onClick={closeAuth}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>Back</button>
        <div className="auth-logo">QUIX</div>
        <div className="auth-tagline">Your AI. Your space.</div>
        <div className="auth-tabs">
          <button className={`auth-tab ${tab === "signin" ? "active" : ""}`} onClick={() => { setTab("signin"); setNotice(""); }}>Sign in</button>
          <button className={`auth-tab ${tab === "signup" ? "active" : ""}`} onClick={() => { setTab("signup"); setNotice(""); }}>Sign up</button>
        </div>
        {notice && <div className="auth-notice" style={{ marginBottom: 12, width: "100%", maxWidth: 340 }}>{notice}</div>}
        {tab === "signin" ? (
          <div className="auth-form">
            <input className="auth-field" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="auth-field" type="password" placeholder="Password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {err && <div className="auth-err">{err}</div>}
            <button className="auth-submit" onClick={submit}>Sign in</button>
            <div className="auth-switch">Don't have an account? <span onClick={() => setTab("signup")}>Sign up</span></div>
          </div>
        ) : (
          <div className="auth-form">
            <input className="auth-field" type="text" placeholder="Full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="auth-field" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="auth-field" type="password" placeholder="Password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <input className="auth-field" type="password" placeholder="Confirm password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {err && <div className="auth-err">{err}</div>}
            <button className="auth-submit" onClick={submit}>Create account</button>
            <div className="auth-switch">Already have an account? <span onClick={() => setTab("signin")}>Sign in</span></div>
          </div>
        )}
      </div>
    </>
  );
}

/* ================= SETTINGS ================= */
const stCSS = `
#settings-screen { position: fixed; inset: 0; z-index: 150; background: #050508; display: flex; flex-direction: column; opacity: 0; pointer-events: none; transform: translateY(30px); transition: opacity .35s ease, transform .35s ease; }
#settings-screen.show { opacity: 1; pointer-events: all; transform: translateY(0); }
.set-header { position: sticky; top: 0; display: flex; align-items: center; gap: 10px; padding: 16px; background: rgba(5,5,8,.92); backdrop-filter: blur(20px); z-index: 2; border-bottom: 1px solid rgba(255,255,255,.06); }
.set-back { background: none; border: none; cursor: pointer; color: rgba(255,255,255,.55); padding: 6px; display: flex; }
.set-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; letter-spacing: .1em; color: #fff; text-transform: uppercase; }
.set-body { padding: 10px 20px 30px; max-width: 520px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; }
.avatar-wrap { display: flex; justify-content: center; padding-top: 8px; }
.avatar { width: 88px; height: 88px; border-radius: 50%; border: 1px solid rgba(255,255,255,.15); background: linear-gradient(135deg, #1a1a2e, #2a1b4d); display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-size: 30px; font-weight: 800; color: rgba(255,255,255,.85); cursor: pointer; overflow: hidden; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.set-section { display: flex; flex-direction: column; gap: 12px; }
.set-label { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.3); }
.set-field { width: 100%; padding: 13px 16px; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; color: rgba(255,255,255,.88); font-size: 14.5px; font-family: 'DM Sans', sans-serif; outline: none; color-scheme: dark; }
.font-row { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 10px 12px; }
.font-btn { width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); background: rgba(255,255,255,.06); color: #fff; font-size: 17px; cursor: pointer; }
.font-val { font-size: 13px; color: rgba(255,255,255,.7); min-width: 52px; text-align: center; }
.limit-row { display: flex; flex-direction: column; gap: 6px; }
.limit-top { display: flex; justify-content: space-between; font-size: 12px; color: rgba(255,255,255,.6); }
.limit-bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.08); overflow: hidden; }
.limit-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #ffffff, rgba(255,255,255,0.45)); transition: width .3s ease; }
.mem-input-row { display: flex; gap: 8px; }
.mem-add { width: 46px; height: 46px; flex-shrink: 0; border-radius: 14px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.06); color: #fff; font-size: 18px; cursor: pointer; }
.mem-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 10px 12px; font-size: 13px; color: rgba(255,255,255,.75); }
.mem-item button { background: none; border: none; color: rgba(255,255,255,.4); font-size: 16px; cursor: pointer; }
.mem-empty { font-size: 12px; color: rgba(255,255,255,.3); }
.signout-big { width: 100%; padding: 12px; border-radius: 12px; border: 1px solid rgba(255,85,85,.35); background: rgba(255,85,85,.08); color: #ff5f5f; font-size: 14px; font-family: 'DM Sans', sans-serif; cursor: pointer; }
.watermark { font-size: 9.5px; color: rgba(255,255,255,.15); letter-spacing: .06em; text-align: center; padding: 6px 0 10px; }
`;
function SettingsPage() {
  const { settingsOpen, closeSettings, fontScale, setFontScale } = useUIStore();
  const { profile, setProfile } = useProfileStore();
  const { session, signOut } = useAuthStore();
  const { resetChat } = useChatStore();
  const { memories, loadFor, addMemory, removeMemory } = useMemoryStore();
  const usage = useUsageStore((s) => s.usage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [memInput, setMemInput] = useState("");
  const uid = session?.user?.id ?? null;
  useEffect(() => { if (uid) loadFor(uid); }, [uid, loadFor]);
  useEffect(() => { if (session?.user?.email && !profile.email) setProfile({ email: session.user.email }); const meta = session?.user?.user_metadata as any; if (meta?.full_name && !profile.name) setProfile({ name: meta.full_name }); }, [session]);
  return (
    <>
      <style>{stCSS}</style>
      <div id="settings-screen" className={settingsOpen ? "show" : ""}>
        <div className="set-header">
          <button className="set-back" onClick={closeSettings} aria-label="Back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button>
          <div className="set-title">Profile & Settings</div>
        </div>
        <div className="set-body">
          <div className="avatar-wrap">
            <button className="avatar" onClick={() => fileRef.current?.click()}>
              {profile.avatar ? (<img src={profile.avatar} alt="profile" />) : (<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>)}
            </button>
            <input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f || f.size > 1.5 * 1024 * 1024) return; const r = new FileReader(); r.onload = () => setProfile({ avatar: String(r.result || "") }); r.readAsDataURL(f); }} />
          </div>
          <div className="set-section">
            <div className="set-label">Profile</div>
            <input className="set-field" type="text" placeholder="Name" value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} />
            <input className="set-field" type="text" placeholder="Username" value={profile.username} onChange={(e) => setProfile({ username: e.target.value })} />
            <input className="set-field" type="email" placeholder="Email" value={profile.email} onChange={(e) => setProfile({ email: e.target.value })} />
            <input className="set-field" type="date" value={profile.dob} onChange={(e) => setProfile({ dob: e.target.value })} />
          </div>
          <div className="set-section">
            <div className="set-label">Daily message limits</div>
            {CHAT_MODELS.map((m) => { const lim = LIMITS[m]; const rem = Math.max(0, lim - (usage[m] ?? 0)); return (<div className="limit-row" key={m}><div className="limit-top"><span>{MODELS[m].name}</span><span>{rem}/{lim} left</span></div><div className="limit-bar"><div className="limit-fill" style={{ width: `${(rem / lim) * 100}%` }} /></div></div>); })}
            <div className="mem-empty">Limits reset at midnight UTC.</div>
          </div>
          {uid && (
            <div className="set-section">
              <div className="set-label">Memory</div>
              <div className="mem-input-row">
                <input className="set-field" type="text" placeholder="Teach Quix something about you..." value={memInput} onChange={(e) => setMemInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && memInput.trim()) { addMemory(uid, memInput); setMemInput(""); } }} />
                <button className="mem-add" onClick={() => { if (memInput.trim()) { addMemory(uid, memInput); setMemInput(""); } }}>+</button>
              </div>
              {memories.length > 0 ? (memories.map((m: any) => (<div className="mem-item" key={m.id}><span>{m.text}</span><button onClick={() => removeMemory(uid, m.id)}>×</button></div>))) : (<div className="mem-empty">No memories yet. Quix also writes automatic memories from your chats every day at midnight UTC.</div>)}
            </div>
          )}
          <div className="set-section">
            <div className="set-label">Screen size</div>
            <div className="font-row">
              <button className="font-btn" onClick={() => setFontScale(fontScale - 0.05)}>−</button>
              <span className="font-val">{Math.round(fontScale * 100)}%</span>
              <button className="font-btn" onClick={() => setFontScale(fontScale + 0.05)}>+</button>
            </div>
          </div>
          {uid && (<div className="set-section"><button className="signout-big" onClick={async () => { await signOut(); resetChat(); }}>Sign out</button></div>)}
          <div className="watermark">Quix · {APP_VERSION}</div>
        </div>
      </div>
    </>
  );
}

/* ================= LOADING ================= */
const ldCSS = `
#loader { position: fixed; inset: 0; background: #050508; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 999; will-change: transform; }
#loader.slide-out { transition: transform 0.4s cubic-bezier(0.7,0,1,0.7); transform: translateX(110%); }
.ld-center { display: flex; flex-direction: column; align-items: center; gap: 24px; transform: translateY(-130vh); }
.ld-center.drop { animation: dropFall 1.5s cubic-bezier(0.22,0.61,0.36,1) forwards; }
@keyframes dropFall { 0% { transform: translateY(-130vh); } 72% { transform: translateY(12px); } 86% { transform: translateY(-4px); } 100% { transform: translateY(0); } }
canvas { display: block; }
.quix-label { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 13px; letter-spacing: .38em; color: rgba(255,255,255,.3); text-transform: uppercase; opacity: 0; transition: opacity .5s ease; }
.quix-label.show { opacity: 1; }
.verve-brand { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); font-family: 'DM Sans', sans-serif; font-size: 11px; letter-spacing: .16em; color: rgba(255,255,255,.15); opacity: 0; transition: opacity .5s ease; }
.verve-brand.show { opacity: 1; }
.verve-brand span { color: rgba(255,255,255,.28); font-weight: 500; }
`;
function LoadingScreen() {
  const loaderRef = useRef<HTMLDivElement>(null); const centerRef = useRef<HTMLDivElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); const labelRef = useRef<HTMLDivElement>(null); const brandRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return;
    const W = 185, H = 185, R = 92, cx = 92, cy = 92; const INTRO_MS = 1500;
    const blobs = ORB_COLORS.map((color, i) => ({ fx: 0.71 + i * 0.09, fy: 1.13 - i * 0.05, phase: i * 0.9, amp: 0.5, r: 80 - i * 2, color }));
    const KF = [{ p: 0.0, oy: -170, rx: 38, ry: 52 }, { p: 0.32, oy: -8, rx: 36, ry: 58 }, { p: 0.46, oy: 4, rx: 118, ry: 42 }, { p: 0.68, oy: 0, rx: 96, ry: 88 }, { p: 1.0, oy: 0, rx: 92, ry: 92 }];
    const easeInCubic = (t: number) => t * t * t; const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3); const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const getClip = (p: number) => { let a = KF[0], b = KF[1]; for (let i = 0; i < KF.length - 1; i++) { if (p >= KF[i].p && p <= KF[i + 1].p) { a = KF[i]; b = KF[i + 1]; break; } } const span = b.p - a.p; const local = span === 0 ? 1 : (p - a.p) / span; const e = p < 0.44 ? easeInCubic(local) : easeOutCubic(local); return { oy: lerp(a.oy, b.oy, e), rx: lerp(a.rx, b.rx, e), ry: lerp(a.ry, b.ry, e) }; };
    const clipShape = (c: CanvasRenderingContext2D, ecx: number, ecy: number, rx: number, ry: number, fall: number) => { c.beginPath(); if (fall > 0.05) { const pointY = ecy - ry * 1.35; c.arc(ecx, ecy + ry * 0.1, ry * fall * 1.1 + rx * (1 - fall), Math.PI * 0.15, Math.PI * 0.85); c.bezierCurveTo(ecx - rx * 0.8, ecy - ry * 0.3, ecx - rx * 0.15, pointY + ry * 0.3, ecx, pointY); c.bezierCurveTo(ecx + rx * 0.15, pointY + ry * 0.3, ecx + rx * 0.8, ecy - ry * 0.3, ecx + rx * ((ry * fall * 1.1 + rx * (1 - fall)) / rx) * 0.95, ecy + ry * 0.1 - ry * fall); c.closePath(); } else { c.ellipse(ecx, ecy, rx, ry, 0, 0, Math.PI * 2); } };
    let bt = 0, last = performance.now(), id = 0; let introStart: number | null = null, introDone = false;
    const frame = (now: number) => {
      const dt = now - last; last = now;
      const s = (Math.sin(((now % 5000) / 5000) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      bt += (0.12 + (2.2 - 0.12) * s) * dt * 0.001;
      ctx.clearRect(0, 0, W, H); ctx.save();
      if (!introDone) { if (introStart === null) introStart = now; const p = Math.min(1, (now - introStart) / INTRO_MS); const { oy, rx, ry } = getClip(p); const fall = Math.max(0, Math.min(1, -oy / 140)); ctx.beginPath(); clipShape(ctx, cx, cy + oy, rx, ry, fall); ctx.clip(); if (p >= 1) { introDone = true; labelRef.current?.classList.add("show"); brandRef.current?.classList.add("show"); } } else { ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip(); }
      const bg = ctx.createRadialGradient(cx * 0.84, cy * 0.76, 4, cx, cy, R); bg.addColorStop(0, "#1a1a2e"); bg.addColorStop(0.3, "#0f1f3d"); bg.addColorStop(0.55, "#2a1b4d"); bg.addColorStop(0.8, "#3d1f4d"); bg.addColorStop(1, "#0f2a3d"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "screen";
      blobs.forEach((b) => { const bx = cx + Math.sin(b.fx * bt + b.phase) * R * b.amp; const by = cy + Math.cos(b.fy * bt + b.phase * 1.4) * R * b.amp; const br = b.r * (1 + 0.08 * Math.sin(b.fx * bt * 2.3 + b.phase)); const g = ctx.createRadialGradient(bx, by, 0, bx, by, br); g.addColorStop(0, b.color + "cc"); g.addColorStop(0.35, b.color + "88"); g.addColorStop(0.7, b.color + "33"); g.addColorStop(1, b.color + "00"); ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); });
      ctx.restore(); id = requestAnimationFrame(frame);
    };
    let startTimer: any = null; let slideTimer: any = null;
    startTimer = setTimeout(() => { centerRef.current?.classList.add("drop"); last = performance.now(); id = requestAnimationFrame(frame); }, 1000);
    slideTimer = setTimeout(() => { loaderRef.current?.classList.add("slide-out"); }, 6500);
    return () => { clearTimeout(startTimer); clearTimeout(slideTimer); cancelAnimationFrame(id); };
  }, []);
  return (
    <>
      <style>{ldCSS}</style>
      <div id="loader" ref={loaderRef}>
        <div className="ld-center" ref={centerRef}>
          <canvas ref={canvasRef} width={185} height={185} />
          <div className="quix-label" ref={labelRef}>QUIX</div>
        </div>
        <div className="verve-brand" ref={brandRef}>from <span>Verve</span></div>
      </div>
    </>
  );
}

/* ================= APP ================= */
const layerCSS = `
.qx-layer { position: fixed; top: 56px; left: 0; right: 0; bottom: 0; transition: transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94); will-change: transform; backface-visibility: hidden; background: #000; }
.qx-layer.center { transform: translate3d(0,0,0); }
.qx-layer.left { transform: translate3d(-100%,0,0); }
.qx-layer.right { transform: translate3d(100%,0,0); }
.qx-layer iframe { width: 100%; height: 100%; border: none; display: block; background: #000; }
`;

function archiveCurrent() {
  const st = useChatStore.getState();
  const sess = useAuthStore.getState().session;
  const msgs = st.messages;
  if (!msgs.length) return;
  if (sess?.user?.id) return; // logged-in: already saved incrementally to Supabase
  pushLocalChat({ id: st.currentChatId || rid(), title: st.chatTitle || "New Chat", messages: msgs, savedAt: new Date().toISOString() });
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [dtRunning, setDtRunning] = useState(false);
  const { activeModel, addMessage, updateMessage, isSending, setIsSending, setActiveModel } = useChatStore();
  const messages = useChatStore((s) => s.messages);
  const { viewMode, fontScale } = useUIStore();
  const session = useAuthStore((s) => s.session);
  const imagineNonce = useImagineStore((s) => s.nonce);
  const dtFrameRef = useRef<HTMLIFrameElement>(null);
  const isDeepThink = viewMode === "chat" && activeModel === "deepthink";

  useEffect(() => { useAuthStore.getState().init(); }, []);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 7000); return () => clearTimeout(t); }, []);
  useEffect(() => { (document.documentElement.style as any).zoom = String(fontScale); }, [fontScale]);
  useEffect(() => { if (session?.user?.id) runDailyMemorySync(); }, [session]);
  useEffect(() => { if (messages.length) saveLocalMessages(messages); }, [messages]);

  useEffect(() => {
    const h = (e: MessageEvent) => { if (e.origin !== "https://quix-deepthink.lovable.app") return; const d = e.data || {}; if (d.type === "deepthink:started") setDtRunning(true); if (d.type === "deepthink:complete" || d.type === "deepthink:stopped") setDtRunning(false); if (d.type === "deepthink:ready") setDtRunning(!!d.running); };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);

  const postToDeepThink = (msg: any) => { const cw = dtFrameRef.current?.contentWindow; if (cw) cw.postMessage(msg, DEEPTHINK_URL); };
  const handleDeepThinkSend = (text: string) => { const usage = useUsageStore.getState(); const rem = usage.remaining("deepthink"); if (rem <= 0) { const fallback = usage.resolve("deepthink"); if (fallback) setActiveModel(fallback); return; } usage.consume("deepthink"); postToDeepThink({ type: "deepthink:ask", question: text }); };
  const handleDeepThinkStop = () => { postToDeepThink({ type: "deepthink:stop" }); };

  const handleSend = async (text: string, attachments: PendingAttachment[]) => {
    if (useChatStore.getState().isSending) return;
    const usage = useUsageStore.getState();
    const startModel = usage.resolve(activeModel);
    const userMessage: ChatMessage = { id: rid(), role: "user", model: startModel || activeModel, content: text, createdAt: Date.now(), status: "done", attachments: attachments.map((a) => ({ name: a.name, kind: a.kind, previewUrl: a.previewUrl })) };
    const aiId = rid();
    if (!startModel) { addMessage(userMessage); addMessage({ id: aiId, role: "ai", model: activeModel, content: "Daily limit reached for all models. Limits reset at midnight UTC.", createdAt: Date.now(), status: "error" }); return; }
    if (startModel !== activeModel) setActiveModel(startModel);
    const sessionNow = useAuthStore.getState().session;
    let chatId = useChatStore.getState().currentChatId;
    if (sessionNow) { if (!chatId) { const title = text.slice(0, 40) || "New Chat"; chatId = await createChat(title); if (chatId) useChatStore.getState().setCurrentChat(chatId, title); } if (chatId) insertMessage(chatId, userMessage); }
    addMessage(userMessage);
    addMessage({ id: aiId, role: "ai", model: startModel, content: "", thoughts: "", createdAt: Date.now(), status: "thinking" });
    setIsSending(true);
    const chain = CHAIN[startModel] || [startModel, "flash", "lite"];

    const attempt = (i: number) => {
      if (i >= chain.length) { updateMessage(aiId, { content: "All models are out of quota for today. Limits reset at midnight UTC.", status: "error" }); setIsSending(false); return; }
      const m = chain[i];
      if (m !== useChatStore.getState().activeModel) setActiveModel(m);
      useUsageStore.getState().consume(m);
      const isThinkM = m === "thinking";
      const isCoderM = m === "coder";
      updateMessage(aiId, { model: m, status: "thinking", content: "", thoughts: "" });
      const history = useChatStore.getState().messages.filter((x) => x.id !== aiId && x.content.trim() !== "");
      let prompt = buildPrompt(m, text, history);
      if (isCoderM) prompt += `\n\n--- Coder protocol ---\nAlways write a brief friendly intro sentence FIRST, before any code block, explaining what you're about to build. Then output the code.`;
      if (useCanvasStore.getState().on) prompt += `\n\n--- Canvas mode ---\nWhen creating or editing any file (code, txt, md, etc.), always output it inside a fenced code block tagged with its language so it appears in the user's Canvas as a file card with preview and download.`;
      let gotText = false;
      // nativeThoughts cleanly separates reasoning (thoughts) from the answer (text) — no fragile separator parsing
      askGeminiStream(m, prompt, { search: isThinkM, nativeThoughts: isThinkM, attachments }, {
        onThoughts: (t) => { if (isThinkM) updateMessage(aiId, { thoughts: t }); },
        onText: (t) => {
          if (!gotText) { gotText = true; updateMessage(aiId, { content: stripObs(t), status: "streaming" }); }
          else updateMessage(aiId, { content: stripObs(t) });
        },
        onDone: (r) => {
          const raw = r.text || "";
          const obs = extractObs(raw);
          if (obs) saveObservation(obs);
          const clean = stripObs(raw);
          if (clean) {
            updateMessage(aiId, { content: clean, thoughts: r.thoughts, sources: r.sources, status: "streaming", doneStreaming: true });
          } else {
            attempt(i + 1);
          }
        },
      }).catch(() => { attempt(i + 1); });
    };
    attempt(0);
  };

  return (
    <div style={{ height: "100dvh", background: "#000", color: "#fff", overflow: "hidden", position: "relative" }}>
      <style>{globalCSS}</style>
      <style>{layerCSS}</style>
      <ChatHeader />
      <MenuDrawer />
      <AuthScreen />
      <SettingsPage />
      <CanvasPanel />
      <div className={`qx-layer ${viewMode === "chat" ? "center" : "left"}`}>
        {isDeepThink ? (<DeepThinkLayer frameRef={dtFrameRef} />) : (<MessageList />)}
        <ChatInputBar onSend={handleSend} onDeepThinkSend={handleDeepThinkSend} onDeepThinkStop={handleDeepThinkStop} isDeepThink={isDeepThink} dtRunning={dtRunning} />
      </div>
      <div className={`qx-layer ${viewMode === "imagine" ? "center" : "right"}`}>
        <iframe key={imagineNonce} src={IMAGINE_URL} title="Imagine 1.5" />
      </div>
      {loading && <LoadingScreen />}
    </div>
  );
}