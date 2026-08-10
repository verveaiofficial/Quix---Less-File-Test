import React, { useState } from "react";
import { create } from "zustand";
import { useChatStore, ChatMessage, copyText } from "./core";

/* ================= CANVAS STORE ================= */
export const useCanvasStore = create<any>((set) => ({
  on: false,
  open: false,
  selId: null as string | null,
  overrides: {} as Record<string, string>,
  setOn: (v: boolean) => set({ on: v }),
  setOpen: (v: boolean) => set({ open: v }),
  setSelId: (id: string | null) => set({ selId: id }),
  openFile: (id: string) => set({ open: true, selId: id }),
  setOverride: (id: string, code: string) =>
    set((s: any) => ({ overrides: { ...s.overrides, [id]: code } })),
}));

/* ================= FILE HELPERS ================= */
const EXT: Record<string, string> = {
  html: "html", htm: "html", js: "js", jsx: "jsx", ts: "ts", tsx: "tsx",
  css: "css", json: "json", md: "md", markdown: "md", txt: "txt",
  python: "py", py: "py", svg: "svg", xml: "xml", csv: "csv",
};

const MIME: Record<string, string> = {
  html: "text/html", js: "text/javascript", ts: "text/typescript",
  css: "text/css", json: "application/json", md: "text/markdown",
  txt: "text/plain", py: "text/x-python", svg: "image/svg+xml", csv: "text/csv",
};

export function extFor(lang: string): string {
  return EXT[lang.toLowerCase()] || "txt";
}

export function downloadFile(name: string, code: string, lang: string) {
  const mime = MIME[extFor(lang)] || "text/plain";
  const blob = new Blob([code], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function previewFile(code: string, lang: string) {
  const mime = extFor(lang) === "html" ? "text/html" : "text/plain";
  const blob = new Blob([code], { type: mime });
  window.open(URL.createObjectURL(blob), "_blank");
}

export interface CanvasFile {
  id: string;
  lang: string;
  name: string;
  code: string;
}

export function extractFiles(messages: ChatMessage[]): CanvasFile[] {
  const files: CanvasFile[] = [];
  messages.forEach((m) => {
    const parts = (m.content || "").split(/```/);
    for (let i = 1; i < parts.length; i += 2) {
      const block = parts[i];
      const nl = block.indexOf("\n");
      const lang = (nl > -1 ? block.slice(0, nl) : "").trim() || "txt";
      const code = nl > -1 ? block.slice(nl + 1) : block;
      files.push({
        id: `${m.id}-${i}`,
        lang,
        name: `quix-file-${(i + 1) / 2}.${extFor(lang)}`,
        code,
      });
    }
  });
  return files;
}

/* ================= MINI MD (for md preview) ================= */
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function miniMd(src: string): string {
  return escapeHtml(src)
    .replace(/^### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^## (.*)$/gm, "<h3>$1</h3>")
    .replace(/^# (.*)$/gm, "<h3>$1</h3>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

/* ================= CSS ================= */
const cvCSS = `
.cv-sheet { position: fixed; inset: 0; z-index: 140; background: #050508; display: flex; flex-direction: column; opacity: 0; pointer-events: none; transform: translateY(24px); transition: opacity .3s ease, transform .3s ease; }
.cv-sheet.show { opacity: 1; pointer-events: all; transform: translateY(0); }
.cv-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.08); }
.cv-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; letter-spacing: .1em; color: #fff; text-transform: uppercase; }
.cv-close { background: none; border: none; color: rgba(255,255,255,.6); font-size: 20px; cursor: pointer; padding: 4px 8px; }
.cv-files { display: flex; gap: 8px; overflow-x: auto; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,.06); }
.cv-files::-webkit-scrollbar { height: 0; }
.cv-chip { flex-shrink: 0; padding: 7px 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,.15); background: transparent; color: rgba(255,255,255,.6); font-size: 12px; font-family: ui-monospace, monospace; cursor: pointer; }
.cv-chip.active { background: #fff; color: #000; border-color: #fff; }
.cv-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 12px 16px 20px; }
.cv-tabs { display: flex; gap: 6px; margin-bottom: 10px; align-items: center; }
.cv-tab { padding: 7px 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,.15); background: transparent; color: rgba(255,255,255,.6); font-size: 12px; cursor: pointer; }
.cv-tab.active { background: rgba(255,255,255,.1); color: #fff; }
.cv-actions { margin-left: auto; display: flex; gap: 6px; }
.cv-act { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 10px; border: 1px solid rgba(255,255,255,.15); background: transparent; color: rgba(255,255,255,.7); cursor: pointer; }
.cv-act:hover { color: #fff; }
.cv-act svg { stroke: currentColor; }
.cv-view { flex: 1; min-height: 0; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; overflow: hidden; background: #0e0e10; }
.cv-view iframe { width: 100%; height: 100%; border: none; background: #fff; }
.cv-view pre { margin: 0; padding: 12px; height: 100%; overflow: auto; font-size: 12.5px; line-height: 1.55; font-family: ui-monospace, monospace; color: #d5d5d5; }
.cv-view .cv-md { padding: 12px; height: 100%; overflow: auto; font-size: 13.5px; line-height: 1.6; color: #e5e7eb; }
.cv-edit { width: 100%; height: 100%; border: none; outline: none; resize: none; background: #0e0e10; color: #d5d5d5; padding: 12px; font-size: 12.5px; line-height: 1.55; font-family: ui-monospace, monospace; }
.cv-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.3); font-size: 13px; }
`;

/* ================= PANEL (sheet only) ================= */
export function CanvasPanel() {
  const { open, setOpen, selId, setSelId, overrides, setOverride } = useCanvasStore();
  const messages = useChatStore((s) => s.messages);
  const [tab, setTab] = useState<"code" | "preview" | "edit">("code");

  const files = extractFiles(messages);
  const sel = files.find((f) => f.id === selId) || files[files.length - 1] || null;
  const code = sel ? overrides[sel.id] ?? sel.code : "";
  const canPreview = sel && (extFor(sel.lang) === "html" || extFor(sel.lang) === "md");

  return (
    <>
      <style>{cvCSS}</style>

      <div className={`cv-sheet ${open ? "show" : ""}`}>
        <div className="cv-header">
          <div className="cv-title">Files in this chat</div>
          <button className="cv-close" onClick={() => setOpen(false)} aria-label="Close files">×</button>
        </div>

        <div className="cv-files">
          {files.map((f) => (
            <button
              key={f.id}
              className={`cv-chip ${sel?.id === f.id ? "active" : ""}`}
              onClick={() => { setSelId(f.id); setTab("code"); }}
            >
              {f.name}
            </button>
          ))}
        </div>

        <div className="cv-body">
          {!sel ? (
            <div className="cv-empty">No files yet. Ask Quix to create one.</div>
          ) : (
            <>
              <div className="cv-tabs">
                <button className={`cv-tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")}>Code</button>
                {canPreview && (
                  <button className={`cv-tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>Preview</button>
                )}
                <button className={`cv-tab ${tab === "edit" ? "active" : ""}`} onClick={() => setTab("edit")}>Edit</button>
                <div className="cv-actions">
                  <button className="cv-act" onClick={() => copyText(code)} aria-label="Copy">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                  </button>
                  <button className="cv-act" onClick={() => downloadFile(sel.name, code, sel.lang)} aria-label="Download">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  </button>
                </div>
              </div>

              <div className="cv-view">
                {tab === "code" && <pre>{code}</pre>}
                {tab === "preview" && extFor(sel.lang) === "html" && <iframe title="preview" srcDoc={code} />}
                {tab === "preview" && extFor(sel.lang) === "md" && (
                  <div className="cv-md" dangerouslySetInnerHTML={{ __html: miniMd(code) }} />
                )}
                {tab === "edit" && (
                  <textarea
                    className="cv-edit"
                    value={code}
                    onChange={(e) => setOverride(sel.id, e.target.value)}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}