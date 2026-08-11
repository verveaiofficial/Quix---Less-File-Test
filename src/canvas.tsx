import React, { useState } from "react";
import { create } from "zustand";
import { useChatStore, ChatMessage, copyText } from "./core";

/* ================= STORE ================= */
export const useCanvasStore = create<any>((set) => ({
  on: false,
  open: false,
  mode: "list" as "list" | "single",
  selId: null as string | null,
  overrides: {} as Record<string, string>,
  setOn: (v: boolean) => set({ on: v }),
  setOpen: (v: boolean) => set({ open: v }),
  openFilesList: () => set({ open: true, mode: "list" }),
  openFile: (id: string) => set({ open: true, mode: "single", selId: id }),
  setSelId: (id: string) => set({ selId: id }),
  setOverride: (id: string, code: string) =>
    set((s: any) => ({ overrides: { ...s.overrides, [id]: code } })),
}));

/* ================= HELPERS ================= */
const EXT: Record<string, string> = {
  html: "html", htm: "html", js: "js", jsx: "jsx", ts: "ts", tsx: "tsx",
  css: "css", json: "json", md: "md", markdown: "md", txt: "txt",
  python: "py", py: "py", svg: "svg", xml: "xml", csv: "csv",
};

export function extFor(lang: string): string {
  return EXT[lang.toLowerCase()] || "txt";
}

export function downloadFile(name: string, code: string, lang: string) {
  const mime =
    { html: "text/html", js: "text/javascript", css: "text/css", json: "application/json", md: "text/markdown", txt: "text/plain", py: "text/x-python", svg: "image/svg+xml", csv: "text/csv" }[extFor(lang)] || "text/plain";
  const blob = new Blob([code], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export interface CanvasFile { id: string; lang: string; name: string; code: string }

export function extractFiles(messages: ChatMessage[]): CanvasFile[] {
  const files: CanvasFile[] = [];
  messages.forEach((m) => {
    const parts = (m.content || "").split(/```/);
    for (let i = 1; i < parts.length; i += 2) {
      const block = parts[i];
      const nl = block.indexOf("\n");
      const lang = (nl > -1 ? block.slice(0, nl) : "").trim() || "txt";
      const code = nl > -1 ? block.slice(nl + 1) : block;
      files.push({ id: `${m.id}-${i}`, lang, name: `quix-file-${(i + 1) / 2}.${extFor(lang)}`, code });
    }
  });
  return files;
}

const FOLDER_ICON = "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z";

/* ================= INLINE CODE BLOCK (chat, canvas OFF) ================= */
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
      <div className="icb-head">
        <span>{lang}</span>
        <button onClick={() => copyText(code)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
          copy
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

/* ================= FILE CARD (chat, canvas ON) ================= */
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
      <span className="fc-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={FOLDER_ICON} /></svg>
      </span>
      <span className="fc-name">{name}</span>
      <span className="fc-view">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      </span>
    </div>
  );
}

/* ================= CANVAS PANEL ================= */
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
  return esc
    .replace(/^### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^## (.*)$/gm, "<h3>$1</h3>")
    .replace(/^# (.*)$/gm, "<h3>$1</h3>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
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
            {!sel ? (
              <div className="cv-empty">No file selected.</div>
            ) : (
              <>
                <div className="cv-bar">
                  <button className={`cv-tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")}>Code</button>
                  {canPreview && (
                    <button className={`cv-tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>Preview</button>
                  )}
                  <button className="cv-dots" onClick={(e) => { e.stopPropagation(); setMenuOpen((p) => !p); }} aria-label="File options">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                  </button>
                  <div className={`cv-menu ${menuOpen ? "show" : ""}`}>
                    <div className="cv-menu-item" onClick={() => { setMenuOpen(false); copyText(code); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                      Copy
                    </div>
                    <div className="cv-menu-item" onClick={() => { setMenuOpen(false); downloadFile(sel.name, code, sel.lang); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                      Download
                    </div>
                    <div className="cv-menu-item" onClick={() => { setMenuOpen(false); setTab("code"); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      Edit
                    </div>
                  </div>
                </div>

                <div className="cv-view">
                  {tab === "code" && (
                    <textarea className="cv-edit" value={code} onChange={(e) => setOverride(sel.id, e.target.value)} />
                  )}
                  {tab === "preview" && extFor(sel.lang) === "html" && <iframe title="preview" srcDoc={code} />}
                  {tab === "preview" && extFor(sel.lang) === "md" && (
                    <div className="cv-md" dangerouslySetInnerHTML={{ __html: miniMd(code) }} />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}