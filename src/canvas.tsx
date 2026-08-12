import React, { useState } from "react";
import { create } from "zustand";
import { useChatStore, ChatMessage } from "./core";

export const useCanvasStore = create<any>((set) => ({
  on: false, openList: false,
  setOn: (v: boolean) => set({ on: v }),
  openFilesList: () => set({ openList: true }),
  closeFilesList: () => set({ openList: false }),
}));

export function extractFiles(messages: ChatMessage[]): Array<{ lang: string; code: string; fid: string; num: number }> {
  const out: Array<{ lang: string; code: string; fid: string; num: number }> = [];
  messages.forEach((m, i) => {
    if (m.role !== "ai") return;
    const parts = (m.content || "").split(/```/);
    parts.forEach((part, j) => {
      if (j % 2 !== 1) return;
      const nl = part.indexOf("\n");
      const lang = nl > -1 ? part.slice(0, nl).trim() : "txt";
      const code = nl > -1 ? part.slice(nl + 1) : part;
      out.push({ lang, code, fid: `${m.id}-${j}`, num: (i + 1) * 100 + j });
    });
  });
  return out;
}

function copyText(t: string) {
  if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(t).catch(() => {}); return; }
  const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} document.body.removeChild(ta);
}

const fcCSS = `.file-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;margin:6px 0;max-width:400px}.file-icon{width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#7ab8ff;flex-shrink:0}.file-info{flex:1;min-width:0}.file-name{font-size:13px;color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}.file-meta{font-size:11px;color:rgba(255,255,255,.4)}.file-actions{display:flex;gap:6px}.file-btn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px 10px;font-size:11px;color:rgba(255,255,255,.7);cursor:pointer}.file-btn:hover{background:rgba(255,255,255,.1);color:#fff}`;

export function FileCard({ lang, code, fid, num }: { lang: string; code: string; fid: string; num: number }) {
  const ext = lang === "javascript" ? "js" : lang === "typescript" ? "ts" : lang;
  const fname = `file_${num}.${ext}`;
  return (
    <div className="file-card">
      <style>{fcCSS}</style>
      <div className="file-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
      <div className="file-info"><div className="file-name">{fname}</div><div className="file-meta">{code.split("\n").length} lines</div></div>
      <div className="file-actions">
        <button className="file-btn" onClick={() => copyText(code)}>Copy</button>
        <button className="file-btn" onClick={() => { const blob = new Blob([code], { type: "text/plain" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url); }}>Download</button>
      </div>
    </div>
  );
}

const icCSS = `.inline-code{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 12px;margin:6px 0;max-height:200px;overflow-y:auto}.inline-code pre{margin:0;font-size:13px;line-height:1.5;color:#e5e7eb;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace}.inline-code-lang{font-size:10px;color:rgba(255,255,255,.4);margin-bottom:4px;text-transform:uppercase}`;

export function InlineCodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="inline-code">
      <style>{icCSS}</style>
      <div className="inline-code-lang">{lang}</div>
      <pre>{code}</pre>
    </div>
  );
}

const cpCSS = `.canvas-panel{position:fixed;top:56px;right:0;bottom:0;width:320px;background:#0a0a0a;border-left:1px solid rgba(255,255,255,.1);z-index:40;transform:translateX(100%);transition:transform .3s ease;overflow-y:auto}.canvas-panel.open{transform:translateX(0)}.canvas-header{position:sticky;top:0;background:rgba(10,10,10,.95);backdrop-filter:blur(10px);padding:16px;border-bottom:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:space-between;z-index:2}.canvas-title{font-size:14px;font-weight:600;color:#fff}.canvas-close{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(255,255,255,.7)}.canvas-body{padding:16px}.canvas-empty{text-align:center;padding:40px 20px;color:rgba(255,255,255,.4);font-size:13px}`;

export function CanvasPanel() {
  const { on, openList, closeFilesList } = useCanvasStore();
  const messages = useChatStore((s) => s.messages);
  const files = extractFiles(messages);
  if (!on || !openList) return null;
  return (
    <>
      <style>{cpCSS}</style>
      <div className="canvas-panel open">
        <div className="canvas-header">
          <div className="canvas-title">Files ({files.length})</div>
          <button className="canvas-close" onClick={closeFilesList}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div className="canvas-body">
          {files.length === 0 ? (<div className="canvas-empty">No files yet.<br/>Ask Quix to create code or documents.</div>) : (files.map((f) => (<FileCard key={f.fid} {...f} />)))}
        </div>
      </div>
    </>
  );
}