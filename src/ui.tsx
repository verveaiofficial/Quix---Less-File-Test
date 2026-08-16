import React, { useEffect, useRef, useState } from "react";
import { ChatMessage, AttachmentMeta, useChatStore, useAuthStore, insertMessage, useStreamText, copyText, rid } from "./core";
import { useCanvasStore } from "./canvas";
import { umCSS, amCSS, mlCSS } from "./styles";
import { MarkdownText, BubbleIndicator } from "./msgstream";
import { ThinkingStatus } from "./thoughts";

export { MarkdownText, BubbleIndicator, faviconUrl, domainOf } from "./msgstream";
export { ThinkingStatus } from "./thoughts";

export function UserMessage({ content, attachments, mid }: { content: string; attachments?: AttachmentMeta[]; mid: string }) { return (<div className="um-wrap" data-mid={mid}><style>{umCSS}</style><div className="message-user">{attachments && attachments.length > 0 && (<div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: content ? 10 : 0 }}>{attachments.map((a, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "rgba(255,255,255,0.7)", maxWidth: 160 }}>{a.kind === "image" && a.previewUrl ? (<img src={a.previewUrl} alt={a.name} style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }} />) : null}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span></div>))}</div>)}{content}</div><div className="um-actions"><button onClick={() => copyText(content)}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg></button></div></div>); }

export function AiMessage({ message, mid }: { message: ChatMessage & { thinkTime?: number }; mid: string }) {
  const { updateMessage } = useChatStore();
  const canvasOn = useCanvasStore((s) => s.on);
  const hasCode = message.content.includes("```");
  const shouldStream = message.status === "streaming";
  const shown = useStreamText(message.content, shouldStream, 10, 2);
  const isDone = message.status === "done" || message.status === "error";
  const isThinkingModel = message.model === "thinking" || message.model === "deepthink";
  useEffect(() => { if (message.status !== "streaming") return; if (!message.doneStreaming) return; if (hasCode) { updateMessage(message.id, { status: "done" }); useChatStore.getState().setIsSending(false); const { currentChatId } = useChatStore.getState(); const session = useAuthStore.getState().session; if (currentChatId && session) insertMessage(currentChatId, { ...message, status: "done" }); return; } if (shown.length >= message.content.length) { const t = setTimeout(() => { updateMessage(message.id, { status: "done" }); useChatStore.getState().setIsSending(false); const { currentChatId } = useChatStore.getState(); const session = useAuthStore.getState().session; if (currentChatId && session) insertMessage(currentChatId, { ...message, status: "done" }); }, 150); return () => clearTimeout(t); } }, [message, shown, hasCode, updateMessage]);
  useEffect(() => { const onStop = () => { const cur = useChatStore.getState().messages.find((m) => m.id === message.id); if (cur && cur.status === "streaming") { updateMessage(message.id, { content: shown, status: "done", doneStreaming: true }); useChatStore.getState().setIsSending(false); } }; window.addEventListener("quix-stop", onStop); return () => window.removeEventListener("quix-stop", onStop); }, [shown, message.id, updateMessage]);
  return (<div className="message-ai" data-mid={mid}><style>{amCSS}</style><div className="ai-content">{isThinkingModel ? (<ThinkingStatus done={message.status !== "thinking"} finished={isDone} sources={message.sources} thoughts={message.thoughts} thinkTime={message.thinkTime} />) : (<BubbleIndicator dimmed={isDone} />)}<div style={{ width: "100%", maxWidth: 640 }}>{shouldStream && <MarkdownText text={shown} mid={mid} canvas={canvasOn} sources={message.sources} />}{(message.status === "done" || message.status === "error") && <MarkdownText text={message.content} mid={mid} canvas={canvasOn} sources={message.sources} />}</div></div>{message.status === "done" && (<div className="msg-actions"><button className={message.feedback === "up" ? "active" : ""} onClick={() => updateMessage(message.id, { feedback: message.feedback === "up" ? undefined : "up" })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg></button><button className={message.feedback === "down" ? "active" : ""} onClick={() => updateMessage(message.id, { feedback: message.feedback === "down" ? undefined : "down" })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg></button><button onClick={() => copyText(message.content)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg></button></div>)}</div>);
}

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const ref = useRef<HTMLDivElement>(null);
  const scrolledUserIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    
    if (lastUser && !scrolledUserIds.current.has(lastUser.id)) {
      scrolledUserIds.current.add(lastUser.id);
      requestAnimationFrame(() => {
        const el = c.querySelector(`[data-mid="${lastUser.id}"]`) as HTMLElement;
        if (!el) return;
        
        const cRect = c.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const header = document.querySelector('#chat-header') as HTMLElement;
        const headerRect = header ? header.getBoundingClientRect() : { top: 0, height: 0 };
        
        const elTopInContainer = elRect.top - cRect.top + c.scrollTop;
        const desiredScroll = elTopInContainer - headerRect.height - 8;
        
        c.scrollTo({ top: Math.max(0, desiredScroll), behavior: "smooth" });
      });
    }
  }, [messages]);

  return (<><style>{mlCSS}</style><div className="message-scroll" ref={ref}><div className="message-container">{messages.map((m) => m.role === "user" ? (<UserMessage key={m.id} mid={m.id} content={m.content} attachments={m.attachments} />) : (<AiMessage key={m.id} mid={m.id} message={m as any} />))}</div></div></>);
}

export interface PendingAttachment { id: string; name: string; kind: "image" | "pdf" | "text"; mimeType: string; base64: string; text?: string; previewUrl?: string }
export function readFileAsAttachment(file: File): Promise<PendingAttachment | null> { return new Promise((resolve) => { if (file.size > 4 * 1024 * 1024) return resolve(null); const isImage = file.type.startsWith("image/"); const isPdf = file.type === "application/pdf"; const isText = file.type.startsWith("text/") || /\.(md|txt|json|js|ts|tsx|jsx|html|css|csv)$/i.test(file.name); const reader = new FileReader(); if (isImage || isPdf) { reader.onload = () => { const result = String(reader.result || ""); resolve({ id: rid(), name: file.name, kind: isImage ? "image" : "pdf", mimeType: file.type, base64: result.split(",")[1] || "", previewUrl: isImage ? result : undefined }); }; reader.onerror = () => resolve(null); reader.readAsDataURL(file); } else if (isText) { reader.onload = () => resolve({ id: rid(), name: file.name, kind: "text", mimeType: file.type || "text/plain", base64: "", text: String(reader.result || "") }); reader.onerror = () => resolve(null); reader.readAsText(file); } else resolve(null); }); }