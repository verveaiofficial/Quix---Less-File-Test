import React, { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { createPortal } from "react-dom";
import { SourceItem, ChatMessage, AttachmentMeta, useChatStore, useAuthStore, insertMessage, useStreamText, copyText, rid } from "./core";
import { ORB_COLORS, qtsCSS, searchIconSvg, umCSS, amCSS, mlCSS } from "./styles";

// ================= CANVAS =================
export const useCanvasStore = create<any>((set) => ({
  on: false, open: false, mode: "list" as "list" | "single", selId: null as string | null, overrides: {} as Record<string, string>,
  setOn: (v: boolean) => set({ on: v }),
  setOpen: (v: boolean) => set({ open: v }),
  openFilesList: () => set({ open: true, mode: "list" }),
  openFile: (id: string) => set({ open: true, mode: "single", selId: id }),
  setSelId: (id: string) => set({ selId: id }),
  setOverride: (id: string, code: string) => set((s: any) => ({ overrides: { ...s.overrides, [id]: code } })),
}));

const EXT: Record<string, string> = { html: "html", htm: "html", js: "js", jsx: "jsx", ts: "ts", tsx: "tsx", css: "css", json: "json", md: "md", markdown: "md", txt: "txt", python: "py", py: "py", svg: "svg", xml: "xml", csv: "csv" };
export function extFor(lang: string): string { return EXT[lang.toLowerCase()] || "txt"; }
export function downloadFile(name: string, code: string, lang: string) {
  const mime = { html: "text/html", js: "text/javascript", css: "text/css", json: "application/json", md: "text/markdown", txt: "text/plain", py: "text/x-python", svg: "image/svg+xml", csv: "text/csv" }[extFor(lang)] || "text/plain";
  const blob = new Blob([code], { type: mime }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
}
export interface CanvasFile { id: string; lang: string; name: string; code: string }
export function extractFiles(messages: ChatMessage[]): CanvasFile[] {
  const files: CanvasFile[] = [];
  messages.forEach((m) => { const parts = (m.content || "").split(/```/); for (let i = 1; i < parts.length; i += 2) { const block = parts[i]; const nl = block.indexOf("\n"); const lang = (nl > -1 ? block.slice(0, nl) : "").trim() || "txt"; const code = nl > -1 ? block.slice(nl + 1) : block; files.push({ id: `${m.id}-${i}`, lang, name: `quix-file-${(i + 1) / 2}.${extFor(lang)}`, code }); } });
  return files;
}

const FOLDER_ICON = "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z";

const icbCSS = `
.icb { background: #0e0e10; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; overflow: hidden; }
.icb-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,.05); font-size: 11px; color: #9ba1a6; }
.icb-head button { display: flex; align-items: center; gap: 5px; background: none; border: none; color: #9ba1a6; cursor: pointer; font-size: 11px; }
.icb-head button:hover { color: #fff; }
.icb pre { margin: 0; padding: 12px; overflow-x: auto; font-size: 12.5px; line-height: 1.55; font-family: ui-monospace, monospace; color: #d5d5d5; max-height: 320px; }
`;

export function InlineCodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="icb">
      <style>{icbCSS}</style>
      <div className="icb-head"><span>{lang}</span><button onClick={() => copyText(code)}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>copy</button></div>
      <pre>{code}</pre>
    </div>
  );
}

const fcCSS = `
.file-card { display: flex; align-items: center; gap: 10px; background: #0e0e10; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 12px 14px; cursor: pointer; transition: border-color .2s ease; }
.file-card:hover { border-color: rgba(255,255,255,.28); }
.fc-icon { color: #9ba1a6; display: flex; flex-shrink: 0; }
.fc-icon svg { stroke: currentColor; }
.fc-name { flex: 1; min-width: 0; font-size: 13px; font-family: ui-monospace, monospace; color: #d5d5d5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fc-view { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px; border: 1px solid rgba(255,255,255,.12); background: transparent; color: #9ba1a6; cursor: pointer; flex-shrink: 0; }
.fc-view:hover { color: #fff; }
.fc-view svg { stroke: currentColor; }
`;

export function FileCard({ lang, code, fid, num }: { lang: string; code: string; fid: string; num: number }) {
  const openFile = useCanvasStore((s) => s.openFile);
  const name = `quix-file-${num}.${extFor(lang)}`;
  return (
    <div className="file-card" onClick={() => openFile(fid)}>
      <style>{fcCSS}</style>
      <span className="fc-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={FOLDER_ICON} /></svg></span>
      <span className="fc-name">{name}</span>
      <span className="fc-view"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg></span>
    </div>
  );
}

const cvCSS = `
.cv-sheet { position: fixed; inset: 0; z-index: 140; background: #050508; display: flex; flex-direction: column; opacity: 0; pointer-events: none; transform: translateY(24px); transition: opacity .3s ease, transform .3s ease; }
.cv-sheet.show { opacity: 1; pointer-events: all; transform: translateY(0); }
.cv-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid rgba(255,255,255,.08); }
.cv-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 14px; letter-spacing: .12em; color: #fff; text-transform: uppercase; }
.cv-close { background: none; border: none; color: rgba(255,255,255,.6); font-size: 20px; cursor: pointer; padding: 4px 8px; }
.cv-list { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
.cv-row { display: flex; align-items: center; gap: 12px; background: #0e0e10; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 14px; cursor: pointer; }
.cv-row:hover { border-color: rgba(255,255,255,.28); }
.cv-row-name { flex: 1; font-size: 13px; font-family: ui-monospace, monospace; color: #d5d5d5; }
.cv-row svg { stroke: #9ba1a6; }
.cv-single { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 12px 16px 20px; }
.cv-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; position: relative; }
.cv-tab { padding: 8px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,.15); background: transparent; color: rgba(255,255,255,.6); font-size: 12px; cursor: pointer; }
.cv-tab.active { background: rgba(255,255,255,.1); color: #fff; }
.cv-dots { margin-left: auto; width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); background: transparent; color: rgba(255,255,255,.7); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.cv-menu { position: absolute; top: 40px; right: 0; background: rgba(18,18,22,0.97); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; min-width: 150px; z-index: 5; opacity: 0; pointer-events: none; transform: translateY(-6px); transition: opacity .18s, transform .18s; }
.cv-menu.show { opacity: 1; pointer-events: all; transform: translateY(0); }
.cv-menu-item { display: flex; align-items: center; gap: 10px; padding: 12px 16px; font-size: 13px; color: rgba(255,255,255,.8); cursor: pointer; }
.cv-menu-item:hover { background: rgba(255,255,255,.05); }
.cv-menu-item svg { stroke: currentColor; }
.cv-view { flex: 1; min-height: 0; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; overflow: hidden; background: #0e0e10; }
.cv-view iframe { width: 100%; height: 100%; border: none; background: #fff; }
.cv-view pre { margin: 0; padding: 14px; height: 100%; overflow: auto; font-size: 13px; line-height: 1.6; font-family: ui-monospace, monospace; color: #d5d5d5; }
.cv-view .cv-md { padding: 14px; height: 100%; overflow: auto; font-size: 14px; line-height: 1.6; color: #e5e7eb; }
.cv-edit { width: 100%; height: 100%; border: none; outline: none; resize: none; background: #0e0e10; color: #d5d5d5; padding: 14px; font-size: 13px; line-height: 1.6; font-family: ui-monospace, monospace; }
.cv-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.3); font-size: 13px; }
`;

function miniMd(src: string): string {
  const esc = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/^### (.*)$/gm, "<h4>$1</h4>").replace(/^## (.*)$/gm, "<h3>$1</h3>").replace(/^# (.*)$/gm, "<h3>$1</h3>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
}

export function CanvasPanel() {
  const { open, mode, selId, setOpen, openFile, overrides, setOverride } = useCanvasStore();
  const messages = useChatStore((s) => s.messages);
  const [tab, setTab] = useState<"code" | "preview">("preview");
  const [menuOpen, setMenuOpen] = useState(false);
  const files = extractFiles(messages);
  const sel = files.find((f) => f.id === selId) || files[files.length - 1] || null;
  const code = sel ? overrides[sel.id] ?? sel.code : "";
  const canPreview = sel && (extFor(sel.lang) === "html" || extFor(sel.lang) === "md");

  return (
    <>
      <style>{cvCSS}</style>
      <div className={`cv-sheet ${open ? "show" : ""}`}>
        <div className="cv-header">
          <div className="cv-title">{mode === "list" ? "Files in this chat" : sel?.name || "File"}</div>
          <button className="cv-close" onClick={() => setOpen(false)}>×</button>
        </div>
        {mode === "list" ? (
          <div className="cv-list">
            {files.length === 0 && <div className="cv-empty">No files yet. Ask Quix to build something.</div>}
            {files.map((f) => (
              <div className="cv-row" key={f.id} onClick={() => openFile(f.id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={FOLDER_ICON} /></svg>
                <span className="cv-row-name">{f.name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </div>
            ))}
          </div>
        ) : (
          <div className="cv-single">
            {!sel ? (<div className="cv-empty">No file selected.</div>) : (
              <>
                <div className="cv-bar">
                  <button className={`cv-tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")}>Code</button>
                  {canPreview && (<button className={`cv-tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>Preview</button>)}
                  <button className="cv-dots" onClick={(e) => { e.stopPropagation(); setMenuOpen((p) => !p); }} aria-label="File options">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                  </button>
                  <div className={`cv-menu ${menuOpen ? "show" : ""}`}>
                    <div className="cv-menu-item" onClick={() => { setMenuOpen(false); copyText(code); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>Copy</div>
                    <div className="cv-menu-item" onClick={() => { setMenuOpen(false); downloadFile(sel.name, code, sel.lang); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>Download</div>
                    <div className="cv-menu-item" onClick={() => { setMenuOpen(false); setTab("code"); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>Edit</div>
                  </div>
                </div>
                <div className="cv-view">
                  {tab === "code" && (<textarea className="cv-edit" value={code} onChange={(e) => setOverride(sel.id, e.target.value)} />)}
                  {tab === "preview" && extFor(sel.lang) === "html" && <iframe title="preview" srcDoc={code} />}
                  {tab === "preview" && extFor(sel.lang) === "md" && (<div className="cv-md" dangerouslySetInnerHTML={{ __html: miniMd(code) }} />)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ================= MSGSTREAM =================
export function BubbleIndicator({ size = 26, dimmed = false }: { size?: number; dimmed?: boolean }) { const ref = useRef<HTMLCanvasElement>(null); useEffect(() => { const canvas = ref.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return; const W = size, H = size, R = size / 2, cx = R, cy = R; const blobs = ORB_COLORS.map((color, i) => ({ fx: 0.71 + i * 0.09, fy: 1.13 - i * 0.05, phase: i * 0.9, amp: 0.5, r: R * 0.75, color })); let t = 0, last = performance.now(), id = 0; const draw = (now: number) => { const dt = now - last; last = now; const s = (Math.sin(((now % 5000) / 5000) * Math.PI * 2 - Math.PI / 2) + 1) / 2; t += (0.12 + (2.2 - 0.12) * s) * dt * 0.001; ctx.clearRect(0, 0, W, H); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip(); const bg = ctx.createRadialGradient(cx * 0.84, cy * 0.76, 1, cx, cy, R); bg.addColorStop(0, "#1a1a2e"); bg.addColorStop(0.3, "#0f1f3d"); bg.addColorStop(0.55, "#2a1b4d"); bg.addColorStop(0.8, "#3d1f4d"); bg.addColorStop(1, "#0f2a3d"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = "screen"; blobs.forEach((b) => { const bx = cx + Math.sin(b.fx * t + b.phase) * R * b.amp; const by = cy + Math.cos(b.fy * t + b.phase * 1.4) * R * b.amp; const br = b.r * (1 + 0.08 * Math.sin(b.fx * t * 2.3 + b.phase)); const g = ctx.createRadialGradient(bx, by, 0, bx, by, br); g.addColorStop(0, b.color + "cc"); g.addColorStop(0.35, b.color + "88"); g.addColorStop(0.7, b.color + "33"); g.addColorStop(1, b.color + "00"); ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); }); ctx.restore(); id = requestAnimationFrame(draw); }; id = requestAnimationFrame(draw); return () => cancelAnimationFrame(id); }, [size]); return (<canvas ref={ref} width={size} height={size} style={{ borderRadius: "50%", display: "block", flexShrink: 0, opacity: dimmed ? 0.35 : 1, filter: dimmed ? "grayscale(100%)" : "none", transition: "opacity .5s ease, filter .5s ease" }} />); }

export function faviconUrl(uri: string): string | null { try { return "https://www.google.com/s2/favicons?domain=" + new URL(uri).hostname + "&sz=32"; } catch { return null; } }
export function domainOf(uri: string): string { try { return new URL(uri).hostname.replace(/^www\./, ""); } catch { return ""; } }

function escapeHtml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inlineMd(s: string) { return s.replace(/\[\[CITE\|([^|]+)\|([^\]]+)\]\]/g, '<a style="display:inline-block;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.09);color:#9ba1a6;font-size:12px;text-decoration:none;margin:0 3px;vertical-align:middle;line-height:1.4;white-space:nowrap" href="$2" target="_blank" rel="noreferrer">$1</a>').replace(/`([^`]+)`/g, '<code class="md-code">$1</code>').replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>'); }
function citeReplace(text: string, sources: SourceItem[]): string {
  if (!sources || !sources.length) return text;
  return text.replace(/\((\d+(?:\s*,\s*\d+)*)\)/g, (_m, grp: string) => {
    const nums = grp.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n));
    const byDomain: { domain: string; url: string; count: number }[] = [];
    nums.forEach((n) => {
      const s = sources[n - 1];
      if (!s) return;
      const dom = domainOf(s.uri) || "source";
      const existing = byDomain.find((d) => d.domain === dom);
      if (existing) { existing.count++; } else { byDomain.push({ domain: dom, url: s.uri, count: 1 }); }
    });
    if (!byDomain.length) return _m;
    return " " + byDomain.map((d) => `[[CITE|${d.domain}${d.count > 1 ? ` +${d.count - 1}` : ""}|${d.url}]]`).join(" ") + " ";
  });
}
function mdToHtml(src: string): string { const lines = escapeHtml(src).split("\n"); const out: string[] = []; let inUl = false, inOl = false; const close = () => { if (inUl) out.push("</ul>"); if (inOl) out.push("</ol>"); inUl = false; inOl = false; }; for (const line of lines) { const t = line.trim(); if (!t) { close(); out.push('<div class="md-gap"></div>'); continue; } if (/^###\s/.test(t)) { close(); out.push(`<h4>${inlineMd(t.slice(4))}</h4>`); continue; } if (/^##\s/.test(t)) { close(); out.push(`<h3>${inlineMd(t.slice(3))}</h3>`); continue; } if (/^#\s/.test(t)) { close(); out.push(`<h3>${inlineMd(t.slice(2))}</h3>`); continue; } if (/^[-*]\s/.test(t)) { if (!inUl) { close(); out.push("<ul>"); inUl = true; } out.push(`<li>${inlineMd(t.slice(2))}</li>`); continue; } if (/^\d+[.)]\s/.test(t)) { if (!inOl) { close(); out.push("<ol>"); inOl = true; } out.push(`<li>${inlineMd(t.replace(/^\d+[.)]\s/, ""))}</li>`); continue; } close(); out.push(`<div>${inlineMd(t)}</div>`); } close(); return out.join(""); }

export function MarkdownText({ text, mid, canvas, sources }: { text: string; mid: string; canvas: boolean; sources?: SourceItem[] }) { const parts = text.split(/```/); return (<div className="md-wrap">{parts.map((part, i) => { if (i % 2 === 1) { const nl = part.indexOf("\n"); const lang = nl > -1 ? part.slice(0, nl).trim() : ""; const code = nl > -1 ? part.slice(nl + 1) : part; return canvas ? <FileCard key={i} lang={lang || "txt"} code={code} fid={`${mid}-${i}`} num={(i + 1) / 2} /> : <InlineCodeBlock key={i} lang={lang || "code"} code={code} />; } if (!part.trim()) return null; return <div key={i} className="md-text" dangerouslySetInnerHTML={{ __html: mdToHtml(citeReplace(part, sources || [])) }} />; })}</div>); }

// ================= THOUGHTS =================
const srCSS = `.src-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:40;opacity:0;pointer-events:none;transition:opacity .35s ease}.src-overlay.open{opacity:1;pointer-events:all}.src-drawer{position:fixed;top:0;left:0;height:100vh;height:100dvh;width:280px;background:rgba(20,20,24,.98);border-right:1px solid rgba(255,255,255,.12);box-shadow:8px 0 32px rgba(0,0,0,.45);z-index:50;display:flex;flex-direction:column;transform:translate3d(-100%,0,0);transition:transform .35s cubic-bezier(.25,.46,.45,.94);will-change:transform}.src-drawer.open{transform:translate3d(0,0,0)}.src-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 12px;font-family:'Syne',sans-serif;font-weight:700;font-size:14px;letter-spacing:.1em;color:#fff;text-transform:uppercase;flex-shrink:0}.src-head button{background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;padding:6px;display:flex}.src-list{flex:1;min-height:0;overflow-y:auto;padding:0 10px 20px;display:flex;flex-direction:column;gap:2px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}.src-list::-webkit-scrollbar{width:0}.src-item{display:flex;flex-direction:column;gap:6px;padding:12px 10px;border-radius:12px;text-decoration:none}.src-item:hover{background:rgba(255,255,255,.06)}.src-title{color:rgba(255,255,255,.92);font-size:13.5px;line-height:1.45;font-weight:500}.src-desc{color:rgba(255,255,255,.55);font-size:12.5px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.src-domain{display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.6);font-size:12px}.src-domain img{width:16px;height:16px;border-radius:50%;flex-shrink:0;background:#1c1c22}.qts-sources{display:flex;align-items:center;gap:10px;margin:6px 0 0 0;cursor:pointer;padding:4px 0;border-radius:8px}.qts-sources:active{opacity:.7}.qts-sources-label{font-size:15px;color:rgba(255,255,255,.6)}.qts-sources .qts-favstack img{width:20px;height:20px;margin-left:-6px}.qts-sources .qts-favstack img:first-child{margin-left:0}body.src-open #open-btn{opacity:0;pointer-events:none;transition:opacity .2s ease}`;

function fmtThink(sec: number): string { return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`; }

function SourcesPanel({ sources, onClose }: { sources: SourceItem[]; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.body.classList.add("src-open");
    const t = requestAnimationFrame(() => setOpen(true));
    return () => { document.body.classList.remove("src-open"); cancelAnimationFrame(t); };
  }, []);
  const close = () => { setOpen(false); setTimeout(onClose, 360); };
  return createPortal((<>
    <div className={`src-overlay ${open ? "open" : ""}`} onClick={close} />
    <div className={`src-drawer ${open ? "open" : ""}`}>
      <div className="src-head"><span>Sources · {sources.length}</span><button onClick={close} aria-label="Close sources"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button></div>
      <div className="src-list">{sources.map((s, i) => { const f = faviconUrl(s.uri); return (<a key={i} className="src-item" href={s.uri} target="_blank" rel="noreferrer"><span className="src-title">{s.title}</span>{s.desc ? <span className="src-desc">{s.desc}</span> : null}<span className="src-domain">{f ? <img src={f} alt="" /> : null}{domainOf(s.uri)}</span></a>); })}</div>
    </div>
  </>), document.body);
}

export function ThinkingStatus({ done, finished, sources, thoughts, thinkTime }: { done: boolean; finished?: boolean; sources?: SourceItem[]; thoughts?: string; thinkTime?: number }) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  useEffect(() => { if (done) return; const t = setInterval(() => setElapsed((p) => p + 1), 1000); return () => clearInterval(t); }, [done]);
  useEffect(() => { if (done) setExpanded(false); }, [done]);
  const finalTime = thinkTime != null ? thinkTime : elapsed;
  const thoughtParas = (thoughts || "").split(/\n+/).map((t) => t.trim()).filter(Boolean);
  const found = sources?.length ?? 0;
  const favs = (sources || []).slice(0, 6).map((s) => faviconUrl(s.uri)).filter(Boolean) as string[];
  const hasReason = thoughtParas.length > 0 || found > 0;
  return (
    <div className={`qts-status visible ${done ? "done" : "active"}`}>
      <style>{qtsCSS}</style>
      <style>{srCSS}</style>
      <div className="qts-head">
        <BubbleIndicator size={26} dimmed={finished} />
        <div className="qts-title-row">
          <span className="qts-title">{done ? (finalTime > 0 ? `Thought for ${fmtThink(finalTime)}` : "Thought") : "Thinking"}</span>
          {!done && <span className="qts-meta">{fmtThink(elapsed)}</span>}
          {hasReason && (
            <button className={`qts-toggle ${expanded ? "open" : ""}`} onClick={() => setExpanded((p) => !p)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          )}
        </div>
      </div>
      {found > 0 && (
        <div className="qts-sources" onClick={() => setSourcesOpen(true)}>
          <span className="qts-sources-label">Sources</span>
          {favs.length > 0 && <span className="qts-favstack">{favs.map((f, i) => <img key={i} src={f} alt="" />)}</span>}
        </div>
      )}
      {sourcesOpen && <SourcesPanel sources={sources || []} onClose={() => setSourcesOpen(false)} />}
      {expanded && hasReason && (
        <div className="qts-reason">
          {found > 0 && (
            <div className="qts-meta-row">
              <span className="qts-reason-icon" dangerouslySetInnerHTML={{ __html: searchIconSvg }} />
              <span>Found {found} web pages</span>
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

// ================= UI (MESSAGES) =================
function fastScroll(el: HTMLElement, to: number, duration = 220) {
  const anyEl = el as any;
  if (anyEl._fsRaf) cancelAnimationFrame(anyEl._fsRaf);
  const start = el.scrollTop;
  const diff = to - start;
  if (Math.abs(diff) < 2) { el.scrollTop = to; return; }
  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    el.scrollTop = start + diff * ease(p);
    if (p < 1) anyEl._fsRaf = requestAnimationFrame(step); else anyEl._fsRaf = null;
  };
  anyEl._fsRaf = requestAnimationFrame(step);
}

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
    const container = c.firstElementChild as HTMLElement;
    if (!container) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || scrolledUserIds.current.has(lastUser.id)) return;
    scrolledUserIds.current.add(lastUser.id);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = container.querySelector(`[data-mid="${lastUser.id}"]`) as HTMLElement;
      if (!el) return;
      const header = document.querySelector("#chat-header") as HTMLElement | null;
      const cRect = c.getBoundingClientRect();
      const hRect = header ? header.getBoundingClientRect() : null;
      const gap = hRect ? Math.max(0, hRect.bottom - cRect.top) : 0;

      let cur = parseFloat(getComputedStyle(container).paddingBottom) || 0;
      if (cur < 110) { container.style.paddingBottom = "110px"; cur = 110; }

      const elRect = el.getBoundingClientRect();
      const elTop = elRect.top - cRect.top + c.scrollTop;
      const lastChild = container.lastElementChild as HTMLElement;
      const lastRect = lastChild.getBoundingClientRect();
      const contentBottom = lastRect.bottom - cRect.top + c.scrollTop;

      const desired = Math.max(0, elTop - gap - 8);
      const need = desired + c.clientHeight - contentBottom;
      if (need > 1) container.style.paddingBottom = `${cur + need}px`;

      fastScroll(c, desired, 220);
    }));
  }, [messages]);

  return (<><style>{mlCSS}</style><div className="message-scroll" ref={ref}><div className="message-container">{messages.map((m) => m.role === "user" ? (<UserMessage key={m.id} mid={m.id} content={m.content} attachments={m.attachments} />) : (<AiMessage key={m.id} mid={m.id} message={m as any} />))}</div></div></>);
}

export interface PendingAttachment { id: string; name: string; kind: "image" | "pdf" | "text"; mimeType: string; base64: string; text?: string; previewUrl?: string }
export function readFileAsAttachment(file: File): Promise<PendingAttachment | null> { return new Promise((resolve) => { if (file.size > 4 * 1024 * 1024) return resolve(null); const isImage = file.type.startsWith("image/"); const isPdf = file.type === "application/pdf"; const isText = file.type.startsWith("text/") || /\.(md|txt|json|js|ts|tsx|jsx|html|css|csv)$/i.test(file.name); const reader = new FileReader(); if (isImage || isPdf) { reader.onload = () => { const result = String(reader.result || ""); resolve({ id: rid(), name: file.name, kind: isImage ? "image" : "pdf", mimeType: file.type, base64: result.split(",")[1] || "", previewUrl: isImage ? result : undefined }); }; reader.onerror = () => resolve(null); reader.readAsDataURL(file); } else if (isText) { reader.onload = () => resolve({ id: rid(), name: file.name, kind: "text", mimeType: file.type || "text/plain", base64: "", text: String(reader.result || "") }); reader.onerror = () => resolve(null); reader.readAsText(file); } else resolve(null); }); }