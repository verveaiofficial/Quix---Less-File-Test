import React, { useEffect, useRef, useState } from "react";
import {
  MODELS,
  CHAT_MODELS,
  LIMITS,
  IMAGINE_URL,
  DEEPTHINK_URL,
  rid,
  ChatMessage,
  SourceItem,
  AttachmentMeta,
  useAuthStore,
  useUIStore,
  useChatStore,
  useProfileStore,
  useMemoryStore,
  useUsageStore,
  supabase,
  createChat,
  insertMessage,
  fetchChats,
  fetchMessages,
  renameChat,
  deleteChat,
  askGeminiStream,
  abortGemini,
  buildPrompt,
  runDailyMemorySync,
  useStreamText,
  copyText,
} from "./core";

const THINK_SEP = "---ANSWER---";

/* ================= GLOBAL / MD CSS ================= */
const globalCSS = `
:root { color-scheme: dark; }
html, body { background: #000; }
.md-wrap { display: flex; flex-direction: column; gap: 10px; }
.md-text { font-size: 15px; line-height: 1.65; color: #e5e7eb; word-wrap: break-word; }
.md-text h3, .md-text h4 { color: #fff; margin: 8px 0 4px; }
.md-text ul, .md-text ol { padding-left: 20px; margin: 4px 0; }
.md-text a { color: #7ab8ff; text-decoration: underline; }
.md-code { background: rgba(255,255,255,.08); border-radius: 6px; padding: 1px 6px; font-size: 13px; font-family: ui-monospace, monospace; }
.md-gap { height: 8px; }
.code-block { background: #0e0e10; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; overflow: hidden; }
.code-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,.05); font-size: 11px; color: #9ba1a6; }
.code-head button { background: none; border: none; color: #9ba1a6; cursor: pointer; font-size: 11px; padding: 2px 6px; }
.code-head button:hover { color: #fff; }
.code-block pre { margin: 0; padding: 12px; overflow-x: auto; font-size: 12.5px; line-height: 1.55; font-family: ui-monospace, monospace; color: #d5d5d5; }
`;

/* ================= MARKDOWN ================= */
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMd(s: string) {
  return s
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function mdToHtml(src: string): string {
  const lines = escapeHtml(src).split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  const close = () => {
    if (inUl) out.push("</ul>");
    if (inOl) out.push("</ol>");
    inUl = false;
    inOl = false;
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) { close(); out.push('<div class="md-gap"></div>'); continue; }
    if (/^###\s/.test(t)) { close(); out.push(`<h4>${inlineMd(t.slice(4))}</h4>`); continue; }
    if (/^##\s/.test(t)) { close(); out.push(`<h3>${inlineMd(t.slice(3))}</h3>`); continue; }
    if (/^#\s/.test(t)) { close(); out.push(`<h3>${inlineMd(t.slice(2))}</h3>`); continue; }
    if (/^[-*]\s/.test(t)) { if (!inUl) { close(); out.push("<ul>"); inUl = true; } out.push(`<li>${inlineMd(t.slice(2))}</li>`); continue; }
    if (/^\d+[.)]\s/.test(t)) { if (!inOl) { close(); out.push("<ol>"); inOl = true; } out.push(`<li>${inlineMd(t.replace(/^\d+[.)]\s/, ""))}</li>`); continue; }
    close();
    out.push(`<div>${inlineMd(t)}</div>`);
  }
  close();
  return out.join("");
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const isHtml = /html/i.test(lang);
  const open = () => {
    const blob = new Blob([code], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  };
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{lang}</span>
        <span>
          {isHtml && <button onClick={open}>Open</button>}
          <button onClick={() => copyText(code)}>Copy</button>
        </span>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  const parts = text.split(/```/);
  return (
    <div className="md-wrap">
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const nl = part.indexOf("\n");
          const lang = nl > -1 ? part.slice(0, nl).trim() : "";
          const code = nl > -1 ? part.slice(nl + 1) : part;
          return <CodeBlock key={i} lang={lang || "code"} code={code} />;
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
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = size, H = size, R = size / 2, cx = R, cy = R;
    const blobs = ORB_COLORS.map((color, i) => ({
      fx: 0.71 + i * 0.09, fy: 1.13 - i * 0.05, phase: i * 0.9, amp: 0.5, r: R * 0.75, color,
    }));
    let t = 0, last = performance.now(), id = 0;
    const draw = (now: number) => {
      const dt = now - last;
      last = now;
      const s = (Math.sin(((now % 5000) / 5000) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      t += (0.12 + (2.2 - 0.12) * s) * dt * 0.001;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      const bg = ctx.createRadialGradient(cx * 0.84, cy * 0.76, 1, cx, cy, R);
      bg.addColorStop(0, "#1a1a2e");
      bg.addColorStop(0.3, "#0f1f3d");
      bg.addColorStop(0.55, "#2a1b4d");
      bg.addColorStop(0.8, "#3d1f4d");
      bg.addColorStop(1, "#0f2a3d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "screen";
      blobs.forEach((b) => {
        const bx = cx + Math.sin(b.fx * t + b.phase) * R * b.amp;
        const by = cy + Math.cos(b.fy * t + b.phase * 1.4) * R * b.amp;
        const br = b.r * (1 + 0.08 * Math.sin(b.fx * t * 2.3 + b.phase));
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, b.color + "cc");
        g.addColorStop(0.35, b.color + "88");
        g.addColorStop(0.7, b.color + "33");
        g.addColorStop(1, b.color + "00");
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      });
      ctx.restore();
      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, [size]);
  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{
        borderRadius: "50%", display: "block", flexShrink: 0,
        opacity: dimmed ? 0.35 : 1, filter: dimmed ? "grayscale(100%)" : "none",
        transition: "opacity .5s ease, filter .5s ease",
      }}
    />
  );
}

/* ================= THINKING STATUS ================= */
function faviconUrl(uri: string): string | null {
  try { return "https://www.google.com/s2/favicons?domain=" + new URL(uri).hostname + "&sz=32"; } catch { return null; }
}

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

const searchIconSvg =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const pageIconSvg =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

function ThinkingStatus({ done, sources, thoughts }: { done: boolean; sources?: SourceItem[]; thoughts?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const frozen = useRef<number | null>(null);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, [done]);

  useEffect(() => {
    if (done && frozen.current === null) frozen.current = elapsed;
  }, [done, elapsed]);

  const finalTime = frozen.current ?? elapsed;
  const timeLabel = finalTime >= 60 ? `${Math.floor(finalTime / 60)}m ${finalTime % 60}s` : `${finalTime}s`;

  const thoughtParas = (thoughts || "").split(/\n+/).map((t) => t.trim()).filter(Boolean);
  const found = sources?.length ?? 0;
  const read = Math.min(4, found);
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
          {done && hasReason && (
            <button className={`qts-toggle ${expanded ? "open" : ""}`} onClick={() => setExpanded((p) => !p)} aria-label="Toggle thought process">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          )}
        </div>
      </div>

      {(!done || expanded) && hasReason && (
        <div className="qts-reason">
          {found > 0 && (
            <div className="qts-meta-row">
              <span className="qts-reason-icon" dangerouslySetInnerHTML={{ __html: searchIconSvg }} />
              <span>Found {found} web pages</span>
              {favs.length > 0 && <span className="qts-favstack">{favs.map((f, i) => <img key={i} src={f} alt="" />)}</span>}
            </div>
          )}
          {read > 0 && (
            <div className="qts-meta-row">
              <span className="qts-reason-icon" dangerouslySetInnerHTML={{ __html: pageIconSvg }} />
              <span>Read {read} pages</span>
              {favs.length > 0 && <span className="qts-favstack">{favs.map((f, i) => <img key={i} src={f} alt="" />)}</span>}
            </div>
          )}
          {thoughtParas.map((t, i) => (
            <div className="qts-thought" key={i}>
              <span className="qts-bullet">•</span>
              <span>{t}</span>
            </div>
          ))}
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

function UserMessage({ content, attachments }: { content: string; attachments?: AttachmentMeta[] }) {
  return (
    <div className="um-wrap">
      <style>{umCSS}</style>
      <div className="message-user">
        {attachments && attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: content ? 10 : 0 }}>
            {attachments.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "rgba(255,255,255,0.7)", maxWidth: 160 }}>
                {a.kind === "image" && a.previewUrl ? (
                  <img src={a.previewUrl} alt={a.name} style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />
                ) : null}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
              </div>
            ))}
          </div>
        )}
        {content}
      </div>
      <div className="um-actions">
        <button onClick={() => useChatStore.getState().setDraft(content)} aria-label="Edit message">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
        </button>
        <button onClick={() => copyText(content)} aria-label="Copy message">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
        </button>
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

function AiMessage({ message }: { message: ChatMessage }) {
  const { updateMessage } = useChatStore();
  const shouldStream = message.status === "streaming";
  const shown = useStreamText(message.content, shouldStream, 10);
  const isDone = message.status === "done" || message.status === "error";
  const isThinkingModel = message.model === "thinking" || message.model === "deepthink";

  useEffect(() => {
    if (!shouldStream || !message.doneStreaming) return;
    if (shown.length >= message.content.length) {
      const t = setTimeout(() => {
        updateMessage(message.id, { status: "done" });
        useChatStore.getState().setIsSending(false);
        const { currentChatId } = useChatStore.getState();
        const session = useAuthStore.getState().session;
        if (currentChatId && session) insertMessage(currentChatId, { ...message, status: "done" });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [shouldStream, shown, message, updateMessage]);

  useEffect(() => {
    const onStop = () => {
      const cur = useChatStore.getState().messages.find((m) => m.id === message.id);
      if (cur && cur.status === "streaming") {
        updateMessage(message.id, { content: shown, status: "done", doneStreaming: true });
        useChatStore.getState().setIsSending(false);
      }
    };
    window.addEventListener("quix-stop", onStop);
    return () => window.removeEventListener("quix-stop", onStop);
  }, [shown, message.id, updateMessage]);

  return (
    <div className="message-ai">
      <style>{amCSS}</style>
      <div className="ai-content">
        {isThinkingModel ? (
          <ThinkingStatus done={message.status !== "thinking"} sources={message.sources} thoughts={message.thoughts} />
        ) : (
          <BubbleIndicator dimmed={isDone} />
        )}
        <div style={{ width: "100%", maxWidth: 640 }}>
          {message.status === "thinking" && !isThinkingModel && (
            <p className="typing-text" style={{ color: "rgba(255,255,255,0.35)" }}>Quix is warming up...</p>
          )}
          {shouldStream && (
            <p className="typing-text">
              {shown}
              {shown.length < message.content.length && <span className="stream-cursor" />}
            </p>
          )}
          {message.status === "done" && <MarkdownText text={message.content} />}
          {message.status === "error" && (
            <p className="typing-text" style={{ color: "#ff8080" }}>{message.content}</p>
          )}
        </div>
      </div>

      {message.status === "done" && (
        <div className="msg-actions">
          <button className={message.feedback === "up" ? "active" : ""} onClick={() => updateMessage(message.id, { feedback: message.feedback === "up" ? undefined : "up" })} aria-label="Good response">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
          </button>
          <button className={message.feedback === "down" ? "active" : ""} onClick={() => updateMessage(message.id, { feedback: message.feedback === "down" ? undefined : "down" })} aria-label="Bad response">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>
          </button>
          <button onClick={() => copyText(message.content)} aria-label="Copy response">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
          </button>
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
.stream-cursor { display: inline-block; width: 7px; height: 16px; background: rgba(255,255,255,0.7); margin-left: 3px; vertical-align: middle; animation: quixCursorBlink 1s steps(1) infinite; }
@keyframes quixCursorBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
`;

function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages]);
  return (
    <>
      <style>{mlCSS}</style>
      <div className="message-scroll" ref={ref}>
        <div className="message-container">
          {messages.map((m) =>
            m.role === "user" ? (
              <UserMessage key={m.id} content={m.content} attachments={m.attachments} />
            ) : (
              <AiMessage key={m.id} message={m} />
            )
          )}
        </div>
      </div>
    </>
  );
}

/* ================= INPUT BAR ================= */
export interface PendingAttachment {
  id: string;
  name: string;
  kind: "image" | "pdf" | "text";
  mimeType: string;
  base64: string;
  text?: string;
  previewUrl?: string;
}

function readFileAsAttachment(file: File): Promise<PendingAttachment | null> {
  return new Promise((resolve) => {
    if (file.size > 4 * 1024 * 1024) return resolve(null);
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    const isText = file.type.startsWith("text/") || /\.(md|txt|json|js|ts|tsx|jsx|html|css|csv)$/i.test(file.name);
    const reader = new FileReader();
    if (isImage || isPdf) {
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve({ id: rid(), name: file.name, kind: isImage ? "image" : "pdf", mimeType: file.type, base64: result.split(",")[1] || "", previewUrl: isImage ? result : undefined });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } else if (isText) {
      reader.onload = () => resolve({ id: rid(), name: file.name, kind: "text", mimeType: file.type || "text/plain", base64: "", text: String(reader.result || "") });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    } else resolve(null);
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
textarea::placeholder { color: rgba(255,255,255,0.28); }
.action-row { display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
.action-left { display: flex; align-items: center; gap: 0; }
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
.upload-opt:hover { background: rgba(255,255,255,0.08); color: #fff; }
.send-btn { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.1); outline: none; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .15s ease; }
.send-btn:not(:disabled) { background: #fff; border-color: transparent; }
.send-btn:not(:disabled) svg { stroke: #000; }
.send-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.send-btn:disabled svg { stroke: rgba(255,255,255,0.6); }
.send-btn.stop { background: #fff; opacity: 1; cursor: pointer; }
.send-btn.stop:active { transform: scale(0.9); }
.send-btn.stop svg { fill: #000; stroke: none; }
`;

function ChatInputBar({
  onSend,
  onDeepThinkSend,
  onDeepThinkStop,
  isDeepThink,
  dtRunning,
}: {
  onSend?: (t: string, a: PendingAttachment[]) => void;
  onDeepThinkSend?: (t: string) => void;
  onDeepThinkStop?: () => void;
  isDeepThink?: boolean;
  dtRunning?: boolean;
}) {
  const { activeModel, setActiveModel, draft, setDraft, isSending } = useChatStore();
  const [inputValue, setInputValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [spinClass, setSpinClass] = useState("");
  const [bottomOffset, setBottomOffset] = useState(0);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const spinDir = useRef(1);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draft) return;
    setInputValue(draft);
    setDraft("");
    setTimeout(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.style.height = "40px";
        taRef.current.style.height = Math.min(taRef.current.scrollHeight, 250) + "px";
      }
    }, 50);
  }, [draft, setDraft]);

  useEffect(() => {
    const g = () => { setMenuOpen(false); setModelMenuOpen(false); };
    document.addEventListener("click", g);
    return () => document.removeEventListener("click", g);
  }, []);

  useEffect(() => {
    const r = () => {
      if (window.visualViewport) {
        const kb = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
        setBottomOffset(Math.max(0, kb));
      }
    };
    if (window.visualViewport) window.visualViewport.addEventListener("resize", r);
    return () => { if (window.visualViewport) window.visualViewport.removeEventListener("resize", r); };
  }, []);

  const prevent = (e: any) => e.preventDefault();

  const toggleUpload = (e: any) => {
    e.stopPropagation();
    setModelMenuOpen(false);
    setSpinClass("");
    setTimeout(() => {
      const c = spinDir.current === 1 ? "spin-cw" : "spin-ccw";
      setSpinClass(c);
      spinDir.current *= -1;
    }, 10);
    setMenuOpen((p) => !p);
  };

  const pick = async (files: FileList | null) => {
    if (!files) return;
    const parsed = await Promise.all(Array.from(files).map(readFileAsAttachment));
    setAttachments((p) => [...p, ...parsed.filter((x): x is PendingAttachment => x !== null)]);
  };

  const dtHasText = inputValue.trim().length > 0;
  const showStop = isDeepThink ? !!dtRunning : isSending;

  const send = () => {
    const text = inputValue.trim();
    if (!text) return;

    if (isDeepThink) {
      onDeepThinkSend?.(text);
      setInputValue("");
      if (taRef.current) { taRef.current.blur(); taRef.current.style.height = "40px"; }
      return;
    }

    if (attachments.length === 0 && !text) return;
    onSend?.(text, attachments);
    setInputValue("");
    setAttachments([]);
    if (taRef.current) { taRef.current.blur(); taRef.current.style.height = "40px"; }
  };

  const stop = () => {
    if (isDeepThink) {
      onDeepThinkStop?.();
      return;
    }
    abortGemini();
    window.dispatchEvent(new Event("quix-stop"));
    useChatStore.getState().setIsSending(false);
  };

  const sendDisabled = isDeepThink
    ? !dtRunning && !inputValue.trim()
    : !isSending && !inputValue.trim() && attachments.length === 0;

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

          <textarea
            ref={taRef}
            placeholder={isDeepThink ? "Ask DeepThink..." : "Ask Quix..."}
            rows={1}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (taRef.current) {
                taRef.current.style.height = "40px";
                taRef.current.style.height = Math.min(taRef.current.scrollHeight, 250) + "px";
              }
            }}
            onBlur={() => { if (!menuOpen) setBottomOffset(0); }}
          />

          <div className="action-row">
            <div className="action-left">
              {!isDeepThink && (
                <div style={{ position: "relative" }}>
                  <button className={`plus-btn ${spinClass}`} onClick={toggleUpload} onMouseDown={prevent} onTouchStart={prevent} aria-label="Upload options">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  </button>
                  <div className={`pop-menu ${menuOpen ? "show" : ""}`} style={{ width: 180 }}>
                    <div className="upload-opt" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); fileRef.current?.click(); }} onMouseDown={prevent}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                      Upload file
                    </div>
                    <div className="upload-opt" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); imgRef.current?.click(); }} onMouseDown={prevent}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                      Upload image
                    </div>
                  </div>
                </div>
              )}

              <div style={{ position: "relative" }}>
                <button className={`model-btn ${modelMenuOpen ? "open" : ""}`} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setModelMenuOpen((p) => !p); }} onMouseDown={prevent} onTouchStart={prevent}>
                  <span>{MODELS[activeModel]?.name ?? "Quix 3 Flash"}</span>
                  <span className="mchev"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                </button>
                <div className={`pop-menu ${modelMenuOpen ? "show" : ""}`}>
                  {CHAT_MODELS.map((id) => (
                    <div key={id} className="model-item" onClick={(e) => { e.stopPropagation(); setActiveModel(id); setModelMenuOpen(false); }}>
                      {activeModel === id ? (
                        <svg viewBox="0 0 24 24" fill="none" className="model-check" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <div style={{ width: 15, flexShrink: 0 }} />
                      )}
                      <div className="model-item-content">
                        <span className="model-title">
                          {MODELS[id].name}
                          {id === "deepthink" && <span className="beta-tag">Beta</span>}
                        </span>
                        <span className="model-desc">{MODELS[id].desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              className={`send-btn ${showStop ? "stop" : ""}`}
              disabled={sendDisabled}
              onClick={showStop ? stop : send}
              aria-label={showStop ? "Stop" : "Send"}
            >
              {showStop ? (
                <svg width="15" height="15" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= DEEPTHINK LIVE IFRAME ================= */
const dtCSS = `
.dt-frame {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  width: 100%; height: 100%;
  border: none;
  background: #000;
  z-index: 5;
  display: block;
}
`;

function DeepThinkLayer({ frameRef }: { frameRef: React.RefObject<HTMLIFrameElement> }) {
  return (
    <>
      <style>{dtCSS}</style>
      <iframe ref={frameRef} className="dt-frame" src={DEEPTHINK_URL} title="DeepThink" />
    </>
  );
}

/* ================= HEADER ================= */
const hdCSS = `
#chat-header { position: fixed; top: 0; left: 0; right: 0; height: 56px; z-index: 30; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; background: rgba(18,18,22,0.94); border-bottom: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(40px) saturate(200%) brightness(1.1); -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.1); }
.header-center { flex: 1; display: flex; justify-content: center; align-items: center; position: relative; z-index: 1; }
.view-toggle { display: flex; align-items: center; gap: 4px; }
.view-btn { border: none; background: transparent; color: rgba(255,255,255,.35); font-size: 14px; font-weight: 500; font-family: 'DM Sans', sans-serif; padding: 6px 12px; border-radius: 20px; cursor: pointer; transition: color .3s ease; }
.view-btn.active { color: rgba(255,255,255,.85); }
.hdr-dots-btn { background: none; border: none; cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center; color: #fff; border-radius: 8px; width: 36px; height: 36px; position: relative; z-index: 1; }
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
  const [optOpen, setOptOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState("New Chat");

  useEffect(() => {
    const g = () => setOptOpen(false);
    window.addEventListener("click", g);
    return () => window.removeEventListener("click", g);
  }, []);

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
        <button className={`hdr-dots-btn ${optOpen ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setOptOpen((p) => !p); }} aria-label="Options">
          <div className="dots-container"><span /><span /><span /></div>
        </button>
      </div>

      <div id="chat-options-menu" className={optOpen ? "show" : ""}>
        <div className="chat-opt" onClick={(e) => { e.stopPropagation(); setOptOpen(false); resetChat(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New chat
        </div>
        <div className="chat-opt" onClick={(e) => { e.stopPropagation(); setOptOpen(false); setRenameVal(chatTitle); setRenameOpen(true); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          Rename chat
        </div>
        <div className="chat-opt danger" onClick={(e) => { e.stopPropagation(); setOptOpen(false); if (session && currentChatId) deleteChat(currentChatId); resetChat(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
          Delete chat
        </div>
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
#drawer { position: fixed; top: 0; left: 0; bottom: 0; width: 280px; background: rgba(20,20,24,0.92); backdrop-filter: blur(20px) saturate(160%); border-right: 1px solid rgba(255,255,255,0.12); z-index: 50; display: flex; flex-direction: column; transform: translate3d(-100%,0,0); will-change: transform; transition: transform .35s cubic-bezier(.25,.46,.45,.94); }
#drawer.open { transform: translate3d(0,0,0); }
.drawer-inner { display: flex; flex-direction: column; flex: 1; min-height: 0; position: relative; z-index: 1; }
.drawer-top { padding: 52px 20px 0; flex-shrink: 0; }
.drawer-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 20px 16px; }
.drawer-scroll::-webkit-scrollbar { width: 0; }
.brand { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 20px; letter-spacing: .14em; color: rgba(255,255,255,.95); margin-bottom: 24px; }
.new-btn { width: 100%; padding: 11px 16px; background: transparent; border: 1px solid rgba(255,255,255,0.25); border-radius: 12px; color: rgba(255,255,255,.9); font-size: 13px; font-family: 'DM Sans', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.search-field { width: 100%; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 10px 14px; color: #fff; font-size: 13px; outline: none; margin-bottom: 20px; }
.hist-label { font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.2); margin-bottom: 10px; padding-left: 4px; }
.hist-item { padding: 10px 12px; border-radius: 10px; cursor: pointer; }
.hist-item:hover { background: rgba(255,255,255,.06); }
.hist-item.current { background: rgba(255,255,255,.08); }
.hist-title { font-size: 13px; color: rgba(255,255,255,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
.hist-time { font-size: 10px; color: rgba(255,255,255,.25); }
.hist-empty { font-size: 12px; color: rgba(255,255,255,.25); padding: 10px 12px; }
.drawer-footer { flex-shrink: 0; border-top: 1px solid rgba(255,255,255,.06); padding: 14px 20px 18px; display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 1; }
.watermark { font-size: 9.5px; color: rgba(255,255,255,.15); letter-spacing: .06em; padding-left: 10px; }
.signin-btn { width: 100%; padding: 11px 16px; background: transparent; border: 1px solid rgba(255,255,255,0.25); border-radius: 12px; color: rgba(255,255,255,.9); font-size: 13px; font-family: 'DM Sans', sans-serif; cursor: pointer; display: flex; align-items: center; gap: 10px; }
.user-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.user-email { font-size: 12px; color: rgba(255,255,255,.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.signout-btn { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; color: rgba(255,255,255,.7); font-size: 12px; cursor: pointer; padding: 8px 12px; }
.profile-row { display: flex; align-items: center; gap: 10px; }
.settings-circle { width: 44px; height: 44px; flex-shrink: 0; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); background: transparent; color: rgba(255,255,255,.7); display: flex; align-items: center; justify-content: center; cursor: pointer; }
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

function timeAgo(d: string): string {
  const diff = Math.max(0, Date.now() - new Date(d).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MenuDrawer() {
  const { drawerOpen, setDrawerOpen, openAuthFromDrawer, openSettingsFromDrawer } = useUIStore();
  const { resetChat, loadMessages, setCurrentChat, currentChatId } = useChatStore();
  const { session, signOut } = useAuthStore();
  const [chats, setChats] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (drawerOpen && session) fetchChats().then(setChats);
  }, [drawerOpen, session]);

  const filtered = query.trim()
    ? chats.filter((c) => c.title?.toLowerCase().includes(query.trim().toLowerCase()))
    : chats;

  return (
    <>
      <style>{dwCSS}</style>
      <div id="overlay" className={drawerOpen ? "open" : ""} onClick={() => setDrawerOpen(false)} />
      <div id="drawer" className={drawerOpen ? "open" : ""}>
        <div className="drawer-inner">
          <div className="drawer-top">
            <div className="brand">QUIX</div>
            <button className="new-btn" onClick={() => setSearchOpen((p) => !p)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              Search chats
            </button>
            {searchOpen && (
              <input className="search-field" placeholder="Search your chats..." value={query} onChange={(e) => setQuery(e.target.value)} />
            )}
          </div>
          <div className="drawer-scroll">
            <div className="hist-label">Recent</div>
            {session ? (
              filtered.length > 0 ? (
                <div>
                  {filtered.map((c) => (
                    <div className={`hist-item ${c.id === currentChatId ? "current" : ""}`} key={c.id} onClick={async () => { const msgs = await fetchMessages(c.id); loadMessages(msgs); setCurrentChat(c.id, c.title); setDrawerOpen(false); }}>
                      <div className="hist-title">{c.title}</div>
                      <div className="hist-time">{timeAgo(c.updated_at)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="hist-empty">{query ? "No chats match your search." : "No chats yet. Your conversations will appear here once you start talking."}</div>
              )
            ) : (
              <div className="hist-empty">Sign in to save your chat history.</div>
            )}
          </div>
        </div>

        <div className="drawer-footer">
          {session ? (
            <div className="user-row">
              <span className="user-email">{session.user.email || "Signed in"}</span>
              <button className="signout-btn" onClick={async () => { await signOut(); resetChat(); setChats([]); }}>Sign out</button>
            </div>
          ) : (
            <button className="signin-btn" onClick={() => { setDrawerOpen(false); setTimeout(() => openAuthFromDrawer(), 150); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>
              Sign in
            </button>
          )}

          <div className="profile-row">
            <button className="signin-btn" style={{ flex: 1 }} onClick={() => { setDrawerOpen(false); setTimeout(() => openSettingsFromDrawer(), 150); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Your profile
            </button>
            <button className="settings-circle" onClick={() => { setDrawerOpen(false); setTimeout(() => openSettingsFromDrawer(), 150); }} aria-label="Settings">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
          </div>

          <div className="watermark">Quix · v2.0.0</div>
        </div>
      </div>

      <button id="open-btn" className={drawerOpen ? "open" : ""} onClick={() => setDrawerOpen(!drawerOpen)} aria-label="Toggle Menu">
        <span /><span /><span />
      </button>
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
.auth-tabs { display: flex; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 4px; margin-bottom: 20px; width: 100%; max-width: 340px; backdrop-filter: blur(40px) saturate(200%) brightness(1.1); -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.1); box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(0,0,0,0.3) inset; position: relative; overflow: hidden; }
.auth-tabs::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.01) 60%, transparent 100%); pointer-events: none; }
.auth-tab { flex: 1; padding: 10px; border: none; background: transparent; outline: none; color: rgba(255,255,255,.45); font-size: 13.5px; font-weight: 500; font-family: 'DM Sans', sans-serif; cursor: pointer; border-radius: 12px; transition: all .3s ease; position: relative; z-index: 1; }
.auth-tab.active { background: rgba(255,255,255,0.09); border: 1px solid rgba(255,255,255,0.14); color: rgba(255,255,255,.95); box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset; }
.auth-form { width: 100%; max-width: 340px; display: flex; flex-direction: column; gap: 12px; }
.auth-field { width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; color: rgba(255,255,255,.88); font-size: 15px; font-family: 'DM Sans', sans-serif; outline: none; backdrop-filter: blur(40px) saturate(200%) brightness(1.1); -webkit-backdrop-filter: blur(40px) saturate(200%) brightness(1.1); box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(0,0,0,0.3) inset; transition: border-color .3s, background .3s, box-shadow .3s; }
.auth-field::placeholder { color: rgba(255,255,255,.28); }
.auth-field:focus { border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.065); box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06), 0 1px 0 rgba(255,255,255,0.1) inset; }
.auth-submit { width: 100%; padding: 14px; background: #fff; color: #000; border: none; outline: none; border-radius: 14px; font-size: 15px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: background .25s ease; margin-top: 4px; }
.auth-submit:hover { background: #e8e8e8; }
.auth-switch { text-align: center; font-size: 13px; color: rgba(255,255,255,.35); margin-top: 4px; }
.auth-switch span { color: rgba(255,255,255,.8); cursor: pointer; text-decoration: underline; }
.auth-err { font-size: 12px; color: #ff8080; text-align: center; }
`;

function AuthScreen() {
  const { authOpen, closeAuth } = useUIStore();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  const submit = async () => {
    const sb = supabase();
    if (!sb) { setErr("Auth not configured. Add Supabase env keys."); return; }
    setErr("");
    if (tab === "signup" && pass !== confirm) { setErr("Passwords don't match."); return; }
    const { error } =
      tab === "signin"
        ? await sb.auth.signInWithPassword({ email, password: pass })
        : await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
    if (error) setErr(error.message);
    else closeAuth();
  };

  return (
    <>
      <style>{auCSS}</style>
      <div id="auth-screen" className={authOpen ? "show" : ""}>
        <button className="auth-back" onClick={closeAuth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <div className="auth-logo">QUIX</div>
        <div className="auth-tagline">Your AI. Your space.</div>
        <div className="auth-tabs">
          <button className={`auth-tab ${tab === "signin" ? "active" : ""}`} onClick={() => setTab("signin")}>Sign in</button>
          <button className={`auth-tab ${tab === "signup" ? "active" : ""}`} onClick={() => setTab("signup")}>Sign up</button>
        </div>
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
.set-body { padding: 10px 20px 50px; max-width: 520px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; }
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
`;

function SettingsPage() {
  const { settingsOpen, closeSettings, fontScale, setFontScale } = useUIStore();
  const { profile, setProfile } = useProfileStore();
  const { session } = useAuthStore();
  const { memories, loadFor, addMemory, removeMemory } = useMemoryStore();
  const usage = useUsageStore((s) => s.usage);
  const fileRef = useRef<HTMLInputElement>(null);
  const [memInput, setMemInput] = useState("");
  const uid = session?.user?.id ?? null;

  useEffect(() => { if (uid) loadFor(uid); }, [uid, loadFor]);

  useEffect(() => {
    if (session?.user?.email && !profile.email) setProfile({ email: session.user.email });
    const meta = session?.user?.user_metadata as any;
    if (meta?.full_name && !profile.name) setProfile({ name: meta.full_name });
  }, [session]);

  return (
    <>
      <style>{stCSS}</style>
      <div id="settings-screen" className={settingsOpen ? "show" : ""}>
        <div className="set-header">
          <button className="set-back" onClick={closeSettings} aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="set-title">Profile & Settings</div>
        </div>

        <div className="set-body">
          <div className="avatar-wrap">
            <button className="avatar" onClick={() => fileRef.current?.click()}>
              {profile.avatar ? (
                <img src={profile.avatar} alt="profile" />
              ) : (
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </button>
            <input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }} onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f || f.size > 1.5 * 1024 * 1024) return;
              const r = new FileReader();
              r.onload = () => setProfile({ avatar: String(r.result || "") });
              r.readAsDataURL(f);
            }} />
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
            {CHAT_MODELS.map((m) => {
              const lim = LIMITS[m];
              const rem = Math.max(0, lim - (usage[m] ?? 0));
              return (
                <div className="limit-row" key={m}>
                  <div className="limit-top">
                    <span>{MODELS[m].name}</span>
                    <span>{rem}/{lim} left</span>
                  </div>
                  <div className="limit-bar">
                    <div className="limit-fill" style={{ width: `${(rem / lim) * 100}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="mem-empty">Limits reset at midnight UTC.</div>
          </div>

          {uid && (
            <div className="set-section">
              <div className="set-label">Memory</div>
              <div className="mem-input-row">
                <input className="set-field" type="text" placeholder="Teach Quix something about you..." value={memInput} onChange={(e) => setMemInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && memInput.trim()) { addMemory(uid, memInput); setMemInput(""); } }} />
                <button className="mem-add" onClick={() => { if (memInput.trim()) { addMemory(uid, memInput); setMemInput(""); } }}>+</button>
              </div>
              {memories.length > 0 ? (
                memories.map((m: any) => (
                  <div className="mem-item" key={m.id}>
                    <span>{m.text}</span>
                    <button onClick={() => removeMemory(uid, m.id)}>×</button>
                  </div>
                ))
              ) : (
                <div className="mem-empty">No memories yet. Quix also writes automatic memories from your chats every day at midnight UTC.</div>
              )}
            </div>
          )}

          <div className="set-section">
            <div className="set-label">Settings</div>
            <div className="font-row">
              <button className="font-btn" onClick={() => setFontScale(fontScale - 0.05)}>−</button>
              <span className="font-val">{Math.round(fontScale * 100)}%</span>
              <button className="font-btn" onClick={() => setFontScale(fontScale + 0.05)}>+</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= LOADING (original) ================= */
const ldCSS = `
#loader { position: fixed; inset: 0; background: #050508; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 999; will-change: transform; }
#loader.slide-out { transition: transform 0.4s cubic-bezier(0.7,0,1,0.7); transform: translateX(110%); }
.ld-center { display: flex; flex-direction: column; align-items: center; gap: 24px; transform: translateY(-130vh); }
.ld-center.drop { animation: dropFall 1.5s cubic-bezier(0.22,0.61,0.36,1) forwards; }
@keyframes dropFall { 0% { transform: translateY(-130vh); } 72% { transform: translateY(12px); } 86% { transform: translateY(-4px); } 100% { transform: translateY(0); } }
canvas { display: block; }
.quix-label { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 13px; letter-spacing: .38em; color: rgba(255,255,255,.3); text-transform: uppercase; opacity: 0; transition: opacity .5s ease; }
.quix-label.show { opacity: 1; }
.verve-brand { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); font-family: 'DM Sans', sans-serif; font-size: 11px; letter-spacing: .16em; color: rgba(255,255,255,.15); text-transform: uppercase; opacity: 0; transition: opacity .5s ease; }
.verve-brand.show { opacity: 1; }
.verve-brand span { color: rgba(255,255,255,.28); font-weight: 500; }
`;

function LoadingScreen() {
  const loaderRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 185, H = 185, R = 92, cx = 92, cy = 92;
    const INTRO_MS = 1500;

    const blobs = ORB_COLORS.map((color, i) => ({
      fx: 0.71 + i * 0.09, fy: 1.13 - i * 0.05, phase: i * 0.9, amp: 0.5, r: 80 - i * 2, color,
    }));

    const KF = [
      { p: 0.0, oy: -170, rx: 38, ry: 52 },
      { p: 0.32, oy: -8, rx: 36, ry: 58 },
      { p: 0.46, oy: 4, rx: 118, ry: 42 },
      { p: 0.68, oy: 0, rx: 96, ry: 88 },
      { p: 1.0, oy: 0, rx: 92, ry: 92 },
    ];

    const easeInCubic = (t: number) => t * t * t;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const getClip = (p: number) => {
      let a = KF[0], b = KF[1];
      for (let i = 0; i < KF.length - 1; i++) {
        if (p >= KF[i].p && p <= KF[i + 1].p) { a = KF[i]; b = KF[i + 1]; break; }
      }
      const span = b.p - a.p;
      const local = span === 0 ? 1 : (p - a.p) / span;
      const e = p < 0.44 ? easeInCubic(local) : easeOutCubic(local);
      return { oy: lerp(a.oy, b.oy, e), rx: lerp(a.rx, b.rx, e), ry: lerp(a.ry, b.ry, e) };
    };

    const clipShape = (c: CanvasRenderingContext2D, ecx: number, ecy: number, rx: number, ry: number, fall: number) => {
      c.beginPath();
      if (fall > 0.05) {
        const pointY = ecy - ry * 1.35;
        c.arc(ecx, ecy + ry * 0.1, ry * fall * 1.1 + rx * (1 - fall), Math.PI * 0.15, Math.PI * 0.85);
        c.bezierCurveTo(ecx - rx * 0.8, ecy - ry * 0.3, ecx - rx * 0.15, pointY + ry * 0.3, ecx, pointY);
        c.bezierCurveTo(ecx + rx * 0.15, pointY + ry * 0.3, ecx + rx * 0.8, ecy - ry * 0.3, ecx + rx * ((ry * fall * 1.1 + rx * (1 - fall)) / rx) * 0.95, ecy + ry * 0.1 - ry * fall);
        c.closePath();
      } else {
        c.ellipse(ecx, ecy, rx, ry, 0, 0, Math.PI * 2);
      }
    };

    let bt = 0, last = performance.now(), id = 0;
    let introStart: number | null = null, introDone = false;

    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      const s = (Math.sin(((now % 5000) / 5000) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      bt += (0.12 + (2.2 - 0.12) * s) * dt * 0.001;

      ctx.clearRect(0, 0, W, H);
      ctx.save();

      if (!introDone) {
        if (introStart === null) introStart = now;
        const p = Math.min(1, (now - introStart) / INTRO_MS);
        const { oy, rx, ry } = getClip(p);
        const fall = Math.max(0, Math.min(1, -oy / 140));
        ctx.beginPath();
        clipShape(ctx, cx, cy + oy, rx, ry, fall);
        ctx.clip();
        if (p >= 1) {
          introDone = true;
          labelRef.current?.classList.add("show");
          brandRef.current?.classList.add("show");
        }
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();
      }

      const bg = ctx.createRadialGradient(cx * 0.84, cy * 0.76, 4, cx, cy, R);
      bg.addColorStop(0, "#1a1a2e");
      bg.addColorStop(0.3, "#0f1f3d");
      bg.addColorStop(0.55, "#2a1b4d");
      bg.addColorStop(0.8, "#3d1f4d");
      bg.addColorStop(1, "#0f2a3d");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = "screen";
      blobs.forEach((b) => {
        const bx = cx + Math.sin(b.fx * bt + b.phase) * R * b.amp;
        const by = cy + Math.cos(b.fy * bt + b.phase * 1.4) * R * b.amp;
        const br = b.r * (1 + 0.08 * Math.sin(b.fx * bt * 2.3 + b.phase));
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, b.color + "cc");
        g.addColorStop(0.35, b.color + "88");
        g.addColorStop(0.7, b.color + "33");
        g.addColorStop(1, b.color + "00");
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      });
      ctx.restore();
      id = requestAnimationFrame(frame);
    };

    let o = 0, i2 = 0;
    o = requestAnimationFrame(() => {
      i2 = requestAnimationFrame(() => {
        centerRef.current?.classList.add("drop");
        id = requestAnimationFrame(frame);
      });
    });

    const slide = setTimeout(() => loaderRef.current?.classList.add("slide-out"), 6400);

    return () => { cancelAnimationFrame(o); cancelAnimationFrame(i2); cancelAnimationFrame(id); clearTimeout(slide); };
  }, []);

  return (
    <>
      <style>{ldCSS}</style>
      <div id="loader" ref={loaderRef}>
        <div className="ld-center" ref={centerRef}>
          <canvas ref={canvasRef} width={185} height={185} />
          <div className="quix-label" ref={labelRef}>QUIX</div>
        </div>
        <div className="verve-brand" ref={brandRef}>From <span>Verve</span></div>
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

export default function App() {
  const [loading, setLoading] = useState(true);
  const [dtRunning, setDtRunning] = useState(false);
  const { activeModel, addMessage, updateMessage, isSending, setIsSending, setActiveModel } = useChatStore();
  const { viewMode, fontScale } = useUIStore();
  const session = useAuthStore((s) => s.session);

  const dtFrameRef = useRef<HTMLIFrameElement>(null);

  const isDeepThink = viewMode === "chat" && activeModel === "deepthink";

  useEffect(() => { useAuthStore.getState().init(); }, []);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 7000); return () => clearTimeout(t); }, []);
  useEffect(() => { (document.documentElement.style as any).zoom = String(fontScale); }, [fontScale]);
  useEffect(() => { if (session?.user?.id) runDailyMemorySync(); }, [session]);

  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== "https://quix-deepthink.lovable.app") return;
      const d = e.data || {};
      if (d.type === "deepthink:started") setDtRunning(true);
      if (d.type === "deepthink:complete" || d.type === "deepthink:stopped") setDtRunning(false);
      if (d.type === "deepthink:ready") setDtRunning(!!d.running);
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);

  const postToDeepThink = (msg: any) => {
    const cw = dtFrameRef.current?.contentWindow;
    if (cw) cw.postMessage(msg, DEEPTHINK_URL);
  };

  const handleDeepThinkSend = (text: string) => {
    const usage = useUsageStore.getState();
    const rem = usage.remaining("deepthink");
    if (rem <= 0) {
      const fallback = usage.resolve("deepthink");
      if (fallback) setActiveModel(fallback);
      return;
    }
    usage.consume("deepthink");
    postToDeepThink({ type: "deepthink:ask", question: text });
  };

  const handleDeepThinkStop = () => {
    postToDeepThink({ type: "deepthink:stop" });
  };

  const handleSend = async (text: string, attachments: PendingAttachment[]) => {
    if (isSending) return;

    const usage = useUsageStore.getState();
    const model = usage.resolve(activeModel);

    const userMessage: ChatMessage = {
      id: rid(), role: "user", model: model || activeModel, content: text, createdAt: Date.now(),
      status: "done", attachments: attachments.map((a) => ({ name: a.name, kind: a.kind, previewUrl: a.previewUrl })),
    };
    const aiId = rid();

    if (!model) {
      addMessage(userMessage);
      addMessage({ id: aiId, role: "ai", model: activeModel, content: "Daily limit reached for all models. Limits reset at midnight UTC.", createdAt: Date.now(), status: "error" });
      return;
    }

    if (model !== activeModel) setActiveModel(model);
    usage.consume(model);

    const isThink = model === "thinking";
    const sessionNow = useAuthStore.getState().session;
    let chatId = useChatStore.getState().currentChatId;
    if (sessionNow) {
      if (!chatId) {
        const title = text.slice(0, 40) || "New Chat";
        chatId = await createChat(title);
        if (chatId) useChatStore.getState().setCurrentChat(chatId, title);
      }
      if (chatId) insertMessage(chatId, userMessage);
    }

    addMessage(userMessage);
    addMessage({ id: aiId, role: "ai", model, content: "", thoughts: "", createdAt: Date.now(), status: "thinking" });
    setIsSending(true);

    try {
      const history = useChatStore.getState().messages.filter((m) => m.id !== aiId && m.content.trim() !== "");
      let prompt = buildPrompt(model, text, history);

      if (isThink) {
        prompt += `\n\n--- Thinking protocol (mandatory) ---\nFirst, output your step-by-step reasoning as short bullet lines, each starting with "• ".\nWhen your reasoning is complete, write a line containing exactly "${THINK_SEP}", then give the final answer in clean markdown.`;
      }

      let gotText = false;

      await askGeminiStream(
        model,
        prompt,
        { search: isThink, nativeThoughts: false, attachments },
        {
          onThoughts: (t) => {
            if (!isThink) updateMessage(aiId, { thoughts: t });
          },
          onText: (t) => {
            if (isThink) {
              const idx = t.indexOf(THINK_SEP);
              if (idx > -1) {
                gotText = true;
                updateMessage(aiId, {
                  thoughts: t.slice(0, idx).trim(),
                  content: t.slice(idx + THINK_SEP.length).replace(/^\n+/, ""),
                  status: "streaming",
                });
              } else {
                updateMessage(aiId, { thoughts: t.trim(), status: "thinking" });
              }
            } else {
              if (!gotText) { gotText = true; updateMessage(aiId, { content: t, status: "streaming" }); }
              else updateMessage(aiId, { content: t });
            }
          },
          onDone: (r) => {
            if (isThink) {
              const full = r.text || "";
              const idx = full.indexOf(THINK_SEP);
              if (idx > -1) {
                updateMessage(aiId, {
                  thoughts: full.slice(0, idx).trim(),
                  content: full.slice(idx + THINK_SEP.length).replace(/^\n+/, "") || "Done.",
                  sources: r.sources,
                  status: "streaming",
                  doneStreaming: true,
                });
              } else if (full) {
                updateMessage(aiId, { thoughts: "", content: full, sources: r.sources, status: "streaming", doneStreaming: true });
              } else {
                updateMessage(aiId, { content: "Quix got an empty answer. Try again.", status: "error" });
                setIsSending(false);
              }
              return;
            }
            if (!r.text) {
              updateMessage(aiId, { content: "Quix got an empty answer. Try again.", status: "error" });
              setIsSending(false);
              return;
            }
            updateMessage(aiId, { content: r.text, thoughts: r.thoughts, sources: r.sources, status: "streaming", doneStreaming: true });
          },
        }
      );
    } catch (err: any) {
      const aborted = err?.name === "AbortError";
      const cur = useChatStore.getState().messages.find((m) => m.id === aiId);
      if (aborted) {
        if (cur && cur.status !== "done") {
          updateMessage(aiId, { content: cur.content?.trim() ? cur.content : "Stopped.", status: "done", doneStreaming: true });
        }
      } else {
        updateMessage(aiId, { content: `Quix error: ${(err?.message || "request failed").slice(0, 300)}`, status: "error" });
      }
      setIsSending(false);
    } finally {
      const cur = useChatStore.getState().messages.find((m) => m.id === aiId);
      if (!cur || cur.status !== "streaming") setIsSending(false);
    }
  };

  return (
    <div style={{ height: "100dvh", background: "#000", color: "#fff", overflow: "hidden", position: "relative" }}>
      <style>{globalCSS}</style>
      <style>{layerCSS}</style>

      <ChatHeader />
      <MenuDrawer />
      <AuthScreen />
      <SettingsPage />

      <div className={`qx-layer ${viewMode === "chat" ? "center" : "left"}`}>
        {isDeepThink ? (
          <DeepThinkLayer frameRef={dtFrameRef} />
        ) : (
          <MessageList />
        )}
        <ChatInputBar
          onSend={handleSend}
          onDeepThinkSend={handleDeepThinkSend}
          onDeepThinkStop={handleDeepThinkStop}
          isDeepThink={isDeepThink}
          dtRunning={dtRunning}
        />
      </div>

      <div className={`qx-layer ${viewMode === "imagine" ? "center" : "right"}`}>
        <iframe src={IMAGINE_URL} title="Imagine 1.5" />
      </div>

      {loading && <LoadingScreen />}
    </div>
  );
}