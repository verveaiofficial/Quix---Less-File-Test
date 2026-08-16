// ui.tsx - Consolidated UI components
import React, { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { createPortal } from "react-dom";
import {
  SourceItem,
  ChatMessage,
  AttachmentMeta,
  useChatStore,
  useAuthStore,
  useUIStore,
  useProfileStore,
  useMemoryStore,
  useUsageStore,
  insertMessage,
  useStreamText,
  copyText,
  rid,
  fetchChats,
  fetchMessages,
  renameChat,
  deleteChat,
  MODELS,
  CHAT_MODELS,
  APP_VERSION,
  abortGemini,
  supabase
} from "./core";
import {
  ibCSS,
  hdCSS,
  dwCSS,
  auCSS,
  stCSS,
  mmCSS,
  ldCSS,
  umCSS,
  amCSS,
  mlCSS,
  qtsCSS,
  lockSvg,
  searchIconSvg,
  ORB_COLORS
} from "./styles";

/* ================= CANVAS ================= */

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
    set((s: any) => ({ overrides: { ...s.overrides, [id]: code } }))
}));

const EXT: Record<string, string> = {
  html: "html",
  htm: "html",
  js: "js",
  jsx: "jsx",
  ts: "ts",
  tsx: "tsx",
  css: "css",
  json: "json",
  md: "md",
  markdown: "md",
  txt: "txt",
  python: "py",
  py: "py",
  svg: "svg",
  xml: "xml",
  csv: "csv"
};

export function extFor(lang: string): string {
  return EXT[lang.toLowerCase()] || "txt";
}

export function downloadFile(name: string, code: string, lang: string) {
  const mime =
    {
      html: "text/html",
      js: "text/javascript",
      css: "text/css",
      json: "application/json",
      md: "text/markdown",
      txt: "text/plain",
      py: "text/x-python",
      svg: "image/svg+xml",
      csv: "text/csv"
    }[extFor(lang)] || "text/plain";

  const blob = new Blob([code], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
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
        code
      });
    }
  });

  return files;
}

const FOLDER_ICON =
  "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z";

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
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          copy
        </button>
      </div>
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

export function FileCard({
  lang,
  code,
  fid,
  num
}: {
  lang: string;
  code: string;
  fid: string;
  num: number;
}) {
  const openFile = useCanvasStore((s) => s.openFile);
  const name = `quix-file-${num}.${extFor(lang)}`;

  return (
    <div className="file-card" onClick={() => openFile(fid)}>
      <style>{fcCSS}</style>
      <span className="fc-icon">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={FOLDER_ICON} />
        </svg>
      </span>
      <span className="fc-name">{name}</span>
      <span className="fc-view">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
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
  const esc = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return esc
    .replace(/^### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^## (.*)$/gm, "<h3>$1</h3>")
    .replace(/^# (.*)$/gm, "<h3>$1</h3>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

export function CanvasPanel() {
  const { open, mode, selId, setOpen, openFile, overrides, setOverride } =
    useCanvasStore();
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
          <div className="cv-title">
            {mode === "list" ? "Files in this chat" : sel?.name || "File"}
          </div>
          <button className="cv-close" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>

        {mode === "list" ? (
          <div className="cv-list">
            {files.length === 0 && (
              <div className="cv-empty">No files yet. Ask Quix to build something.</div>
            )}

            {files.map((f) => (
              <div className="cv-row" key={f.id} onClick={() => openFile(f.id)}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={FOLDER_ICON} />
                </svg>
                <span className="cv-row-name">{f.name}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
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
                  <button
                    className={`cv-tab ${tab === "code" ? "active" : ""}`}
                    onClick={() => setTab("code")}
                  >
                    Code
                  </button>

                  {canPreview && (
                    <button
                      className={`cv-tab ${tab === "preview" ? "active" : ""}`}
                      onClick={() => setTab("preview")}
                    >
                      Preview
                    </button>
                  )}

                  <button
                    className="cv-dots"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen((p) => !p);
                    }}
                    aria-label="File options"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="19" cy="12" r="1.6" />
                    </svg>
                  </button>

                  <div className={`cv-menu ${menuOpen ? "show" : ""}`}>
                    <div
                      className="cv-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        copyText(code);
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                      Copy
                    </div>

                    <div
                      className="cv-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        downloadFile(sel.name, code, sel.lang);
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download
                    </div>

                    <div
                      className="cv-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        setTab("code");
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </div>
                  </div>
                </div>

                <div className="cv-view">
                  {tab === "code" && (
                    <textarea
                      className="cv-edit"
                      value={code}
                      onChange={(e) => setOverride(sel.id, e.target.value)}
                    />
                  )}

                  {tab === "preview" && extFor(sel.lang) === "html" && (
                    <iframe title="preview" srcDoc={code} />
                  )}

                  {tab === "preview" && extFor(sel.lang) === "md" && (
                    <div
                      className="cv-md"
                      dangerouslySetInnerHTML={{ __html: miniMd(code) }}
                    />
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

/* ================= SHARED PANEL STORES / HELPERS ================= */

export const usePinStore = create<any>((set, get) => ({
  pinned: (() => {
    try {
      return JSON.parse(localStorage.getItem("quix_pinned_v1") || "[]");
    } catch {
      return [];
    }
  })(),
  toggle: (id: string) => {
    if (!id) return;
    const cur: string[] = get().pinned;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try {
      localStorage.setItem("quix_pinned_v1", JSON.stringify(next));
    } catch {}
    set({ pinned: next });
  }
}));

export const useImagineStore = create<any>((set) => ({
  nonce: 0,
  bump: () => set((s: any) => ({ nonce: s.nonce + 1 }))
}));

export function shimmer(e: any) {
  const el = e.currentTarget as HTMLElement;
  el.classList.remove("shimmer");
  void el.offsetWidth;
  el.classList.add("shimmer");
  setTimeout(() => el.classList.remove("shimmer"), 500);
}

export function shimmerThen(e: any, fn: () => void) {
  shimmer(e);
  setTimeout(fn, 450);
}

function timeAgo(d: string): string {
  const diff = Math.max(0, Date.now() - new Date(d).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ================= MESSAGE STREAM / MARKDOWN ================= */

export function BubbleIndicator({
  size = 26,
  dimmed = false
}: {
  size?: number;
  dimmed?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = size;
    const H = size;
    const R = size / 2;
    const cx = R;
    const cy = R;

    const blobs = ORB_COLORS.map((color, i) => ({
      fx: 0.71 + i * 0.09,
      fy: 1.13 - i * 0.05,
      phase: i * 0.9,
      amp: 0.5,
      r: R * 0.75,
      color
    }));

    let t = 0;
    let last = performance.now();
    let id = 0;

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
        borderRadius: "50%",
        display: "block",
        flexShrink: 0,
        opacity: dimmed ? 0.35 : 1,
        filter: dimmed ? "grayscale(100%)" : "none",
        transition: "opacity .5s ease, filter .5s ease"
      }}
    />
  );
}

export function faviconUrl(uri: string): string | null {
  try {
    return "https://www.google.com/s2/favicons?domain=" + new URL(uri).hostname + "&sz=32";
  } catch {
    return null;
  }
}

export function domainOf(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMd(s: string) {
  return s
    .replace(
      /\[\[CITE\|([^|]+)\|([^\]]+)\]\]/g,
      '<a style="display:inline-block;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.09);color:#9ba1a6;font-size:12px;text-decoration:none;margin:0 3px;vertical-align:middle;line-height:1.4;white-space:nowrap" href="$2" target="_blank" rel="noreferrer">$1</a>'
    )
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    );
}

function citeReplace(text: string, sources: SourceItem[]): string {
  if (!sources || !sources.length) return text;

  return text.replace(/\((\d+(?:\s*,\s*\d+)*)\)/g, (_m, grp: string) => {
    const nums = grp
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !isNaN(n));

    const byDomain: { domain: string; url: string; count: number }[] = [];

    nums.forEach((n) => {
      const s = sources[n - 1];
      if (!s) return;

      const dom = domainOf(s.uri) || "source";
      const existing = byDomain.find((d) => d.domain === dom);

      if (existing) {
        existing.count++;
      } else {
        byDomain.push({ domain: dom, url: s.uri, count: 1 });
      }
    });

    if (!byDomain.length) return _m;

    return (
      " " +
      byDomain
        .map(
          (d) =>
            `[[CITE|${d.domain}${d.count > 1 ? ` +${d.count - 1}` : ""}|${d.url}]]`
        )
        .join(" ") +
      " "
    );
  });
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

    if (!t) {
      close();
      out.push('<div class="md-gap"></div>');
      continue;
    }

    if (/^###\s/.test(t)) {
      close();
      out.push(`<h4>${inlineMd(t.slice(4))}</h4>`);
      continue;
    }

    if (/^##\s/.test(t)) {
      close();
      out.push(`<h3>${inlineMd(t.slice(3))}</h3>`);
      continue;
    }

    if (/^#\s/.test(t)) {
      close();
      out.push(`<h3>${inlineMd(t.slice(2))}</h3>`);
      continue;
    }

    if (/^[-*]\s/.test(t)) {
      if (!inUl) {
        close();
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inlineMd(t.slice(2))}</li>`);
      continue;
    }

    if (/^\d+[.)]\s/.test(t)) {
      if (!inOl) {
        close();
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inlineMd(t.replace(/^\d+[.)]\s/, ""))}</li>`);
      continue;
    }

    close();
    out.push(`<div>${inlineMd(t)}</div>`);
  }

  close();
  return out.join("");
}

export function MarkdownText({
  text,
  mid,
  canvas,
  sources
}: {
  text: string;
  mid: string;
  canvas: boolean;
  sources?: SourceItem[];
}) {
  const parts = text.split(/```/);

  return (
    <div className="md-wrap">
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const nl = part.indexOf("\n");
          const lang = nl > -1 ? part.slice(0, nl).trim() : "";
          const code = nl > -1 ? part.slice(nl + 1) : part;

          return canvas ? (
            <FileCard
              key={i}
              lang={lang || "txt"}
              code={code}
              fid={`${mid}-${i}`}
              num={(i + 1) / 2}
            />
          ) : (
            <InlineCodeBlock key={i} lang={lang || "code"} code={code} />
          );
        }

        if (!part.trim()) return null;

        return (
          <div
            key={i}
            className="md-text"
            dangerouslySetInnerHTML={{
              __html: mdToHtml(citeReplace(part, sources || []))
            }}
          />
        );
      })}
    </div>
  );
}

/* ================= THINKING / SOURCES ================= */

const srCSS = `.src-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:40;opacity:0;pointer-events:none;transition:opacity .35s ease}.src-overlay.open{opacity:1;pointer-events:all}.src-drawer{position:fixed;top:0;left:0;height:100vh;height:100dvh;width:280px;background:rgba(20,20,24,.98);border-right:1px solid rgba(255,255,255,.12);box-shadow:8px 0 32px rgba(0,0,0,.45);z-index:50;display:flex;flex-direction:column;transform:translate3d(-100%,0,0);transition:transform .35s cubic-bezier(.25,.46,.45,.94);will-change:transform}.src-drawer.open{transform:translate3d(0,0,0)}.src-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 12px;font-family:'Syne',sans-serif;font-weight:700;font-size:14px;letter-spacing:.1em;color:#fff;text-transform:uppercase;flex-shrink:0}.src-head button{background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;padding:6px;display:flex}.src-list{flex:1;min-height:0;overflow-y:auto;padding:0 10px 20px;display:flex;flex-direction:column;gap:2px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}.src-list::-webkit-scrollbar{width:0}.src-item{display:flex;flex-direction:column;gap:6px;padding:12px 10px;border-radius:12px;text-decoration:none}.src-item:hover{background:rgba(255,255,255,.06)}.src-title{color:rgba(255,255,255,.92);font-size:13.5px;line-height:1.45;font-weight:500}.src-desc{color:rgba(255,255,255,.55);font-size:12.5px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.src-domain{display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.6);font-size:12px}.src-domain img{width:16px;height:16px;border-radius:50%;flex-shrink:0;background:#1c1c22}.qts-sources{display:flex;align-items:center;gap:10px;margin:6px 0 0 0;cursor:pointer;padding:4px 0;border-radius:8px}.qts-sources:active{opacity:.7}.qts-sources-label{font-size:15px;color:rgba(255,255,255,.6)}.qts-sources .qts-favstack img{width:20px;height:20px;margin-left:-6px}.qts-sources .qts-favstack img:first-child{margin-left:0}body.src-open #open-btn{opacity:0;pointer-events:none;transition:opacity .2s ease}`;

function fmtThink(sec: number): string {
  return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
}

function SourcesPanel({
  sources,
  onClose
}: {
  sources: SourceItem[];
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("src-open");
    const t = requestAnimationFrame(() => setOpen(true));
    return () => {
      document.body.classList.remove("src-open");
      cancelAnimationFrame(t);
    };
  }, []);

  const close = () => {
    setOpen(false);
    setTimeout(onClose, 360);
  };

  return createPortal(
    <>
      <div className={`src-overlay ${open ? "open" : ""}`} onClick={close} />
      <div className={`src-drawer ${open ? "open" : ""}`}>
        <div className="src-head">
          <span>Sources · {sources.length}</span>
          <button onClick={close} aria-label="Close sources">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="src-list">
          {sources.map((s, i) => {
            const f = faviconUrl(s.uri);

            return (
              <a
                key={i}
                className="src-item"
                href={s.uri}
                target="_blank"
                rel="noreferrer"
              >
                <span className="src-title">{s.title}</span>
                {s.desc ? <span className="src-desc">{s.desc}</span> : null}
                <span className="src-domain">
                  {f ? <img src={f} alt="" /> : null}
                  {domainOf(s.uri)}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </>,
    document.body
  );
}

export function ThinkingStatus({
  done,
  finished,
  sources,
  thoughts,
  thinkTime
}: {
  done: boolean;
  finished?: boolean;
  sources?: SourceItem[];
  thoughts?: string;
  thinkTime?: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, [done]);

  useEffect(() => {
    if (done) setExpanded(false);
  }, [done]);

  const finalTime = thinkTime != null ? thinkTime : elapsed;
  const thoughtParas = (thoughts || "")
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const found = sources?.length ?? 0;
  const favs = (sources || [])
    .slice(0, 6)
    .map((s) => faviconUrl(s.uri))
    .filter(Boolean) as string[];

  const hasReason = thoughtParas.length > 0 || found > 0;

  return (
    <div className={`qts-status visible ${done ? "done" : "active"}`}>
      <style>{qtsCSS}</style>
      <style>{srCSS}</style>

      <div className="qts-head">
        <BubbleIndicator size={26} dimmed={finished} />
        <div className="qts-title-row">
          <span className="qts-title">
            {done ? (finalTime > 0 ? `Thought for ${fmtThink(finalTime)}` : "Thought") : "Thinking"}
          </span>
          {!done && <span className="qts-meta">{fmtThink(elapsed)}</span>}
          {hasReason && (
            <button
              className={`qts-toggle ${expanded ? "open" : ""}`}
              onClick={() => setExpanded((p) => !p)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {found > 0 && (
        <div className="qts-sources" onClick={() => setSourcesOpen(true)}>
          <span className="qts-sources-label">Sources</span>
          {favs.length > 0 && (
            <span className="qts-favstack">
              {favs.map((f, i) => (
                <img key={i} src={f} alt="" />
              ))}
            </span>
          )}
        </div>
      )}

      {sourcesOpen && (
        <SourcesPanel sources={sources || []} onClose={() => setSourcesOpen(false)} />
      )}

      {expanded && hasReason && (
        <div className="qts-reason">
          {found > 0 && (
            <div className="qts-meta-row">
              <span
                className="qts-reason-icon"
                dangerouslySetInnerHTML={{ __html: searchIconSvg }}
              />
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

/* ================= MESSAGES ================= */

function fastScroll(el: HTMLElement, to: number, duration = 220) {
  const anyEl = el as any;
  if (anyEl._fsRaf) cancelAnimationFrame(anyEl._fsRaf);

  const start = el.scrollTop;
  const diff = to - start;

  if (Math.abs(diff) < 2) {
    el.scrollTop = to;
    return;
  }

  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);

  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    el.scrollTop = start + diff * ease(p);
    if (p < 1) anyEl._fsRaf = requestAnimationFrame(step);
    else anyEl._fsRaf = null;
  };

  anyEl._fsRaf = requestAnimationFrame(step);
}

export interface PendingAttachment {
  id: string;
  name: string;
  kind: "image" | "pdf" | "text";
  mimeType: string;
  base64: string;
  text?: string;
  previewUrl?: string;
}

export function readFileAsAttachment(file: File): Promise<PendingAttachment | null> {
  return new Promise((resolve) => {
    if (file.size > 4 * 1024 * 1024) return resolve(null);

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    const isText =
      file.type.startsWith("text/") ||
      /\.(md|txt|json|js|ts|tsx|jsx|html|css|csv)$/i.test(file.name);

    const reader = new FileReader();

    if (isImage || isPdf) {
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve({
          id: rid(),
          name: file.name,
          kind: isImage ? "image" : "pdf",
          mimeType: file.type,
          base64: result.split(",")[1] || "",
          previewUrl: isImage ? result : undefined
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } else if (isText) {
      reader.onload = () =>
        resolve({
          id: rid(),
          name: file.name,
          kind: "text",
          mimeType: file.type || "text/plain",
          base64: "",
          text: String(reader.result || "")
        });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    } else {
      resolve(null);
    }
  });
}

export function UserMessage({
  content,
  attachments,
  mid
}: {
  content: string;
  attachments?: AttachmentMeta[];
  mid: string;
}) {
  return (
    <div className="um-wrap" data-mid={mid}>
      <style>{umCSS}</style>

      <div className="message-user">
        {attachments && attachments.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: content ? 10 : 0
            }}
          >
            {attachments.map((a, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                  maxWidth: 160
                }}
              >
                {a.kind === "image" && a.previewUrl ? (
                  <img
                    src={a.previewUrl}
                    alt={a.name}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      objectFit: "cover"
                    }}
                  />
                ) : null}
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {a.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {content}
      </div>

      <div className="um-actions">
        <button onClick={() => copyText(content)}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function AiMessage({
  message,
  mid
}: {
  message: ChatMessage & { thinkTime?: number };
  mid: string;
}) {
  const { updateMessage } = useChatStore();
  const canvasOn = useCanvasStore((s) => s.on);

  const hasCode = message.content.includes("```");
  const shouldStream = message.status === "streaming";
  const shown = useStreamText(message.content, shouldStream, 10, 2);
  const isDone = message.status === "done" || message.status === "error";
  const isThinkingModel = message.model === "thinking" || message.model === "deepthink";

  useEffect(() => {
    if (message.status !== "streaming") return;
    if (!message.doneStreaming) return;

    if (hasCode) {
      updateMessage(message.id, { status: "done" });
      useChatStore.getState().setIsSending(false);

      const { currentChatId } = useChatStore.getState();
      const session = useAuthStore.getState().session;

      if (currentChatId && session) {
        insertMessage(currentChatId, { ...message, status: "done" });
      }

      return;
    }

    if (shown.length >= message.content.length) {
      const t = setTimeout(() => {
        updateMessage(message.id, { status: "done" });
        useChatStore.getState().setIsSending(false);

        const { currentChatId } = useChatStore.getState();
        const session = useAuthStore.getState().session;

        if (currentChatId && session) {
          insertMessage(currentChatId, { ...message, status: "done" });
        }
      }, 150);

      return () => clearTimeout(t);
    }
  }, [message, shown, hasCode, updateMessage]);

  useEffect(() => {
    const onStop = () => {
      const cur = useChatStore.getState().messages.find((m) => m.id === message.id);

      if (cur && cur.status === "streaming") {
        updateMessage(message.id, {
          content: shown,
          status: "done",
          doneStreaming: true
        });
        useChatStore.getState().setIsSending(false);
      }
    };

    window.addEventListener("quix-stop", onStop);
    return () => window.removeEventListener("quix-stop", onStop);
  }, [shown, message.id, updateMessage]);

  return (
    <div className="message-ai" data-mid={mid}>
      <style>{amCSS}</style>

      <div className="ai-content">
        {isThinkingModel ? (
          <ThinkingStatus
            done={message.status !== "thinking"}
            finished={isDone}
            sources={message.sources}
            thoughts={message.thoughts}
            thinkTime={message.thinkTime}
          />
        ) : (
          <BubbleIndicator dimmed={isDone} />
        )}

        <div style={{ width: "100%", maxWidth: 640 }}>
          {shouldStream && (
            <MarkdownText
              text={shown}
              mid={mid}
              canvas={canvasOn}
              sources={message.sources}
            />
          )}

          {(message.status === "done" || message.status === "error") && (
            <MarkdownText
              text={message.content}
              mid={mid}
              canvas={canvasOn}
              sources={message.sources}
            />
          )}
        </div>
      </div>

      {message.status === "done" && (
        <div className="msg-actions">
          <button
            className={message.feedback === "up" ? "active" : ""}
            onClick={() =>
              updateMessage(message.id, {
                feedback: message.feedback === "up" ? undefined : "up"
              })
            }
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 10v12" />
              <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
            </svg>
          </button>

          <button
            className={message.feedback === "down" ? "active" : ""}
            onClick={() =>
              updateMessage(message.id, {
                feedback: message.feedback === "down" ? undefined : "down"
              })
            }
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 14V2" />
              <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
            </svg>
          </button>

          <button onClick={() => copyText(message.content)}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
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

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = container.querySelector(`[data-mid="${lastUser.id}"]`) as HTMLElement;
        if (!el) return;

        const header = document.querySelector("#chat-header") as HTMLElement | null;
        const cRect = c.getBoundingClientRect();
        const hRect = header ? header.getBoundingClientRect() : null;
        const gap = hRect ? Math.max(0, hRect.bottom - cRect.top) : 0;

        let cur = parseFloat(getComputedStyle(container).paddingBottom) || 0;
        if (cur < 110) {
          container.style.paddingBottom = "110px";
          cur = 110;
        }

        const elRect = el.getBoundingClientRect();
        const elTop = elRect.top - cRect.top + c.scrollTop;
        const lastChild = container.lastElementChild as HTMLElement;
        const lastRect = lastChild.getBoundingClientRect();
        const contentBottom = lastRect.bottom - cRect.top + c.scrollTop;

        const desired = Math.max(0, elTop - gap - 8);
        const need = desired + c.clientHeight - contentBottom;

        if (need > 1) container.style.paddingBottom = `${cur + need}px`;

        fastScroll(c, desired, 220);
      })
    );
  }, [messages]);

  return (
    <>
      <style>{mlCSS}</style>
      <div className="message-scroll" ref={ref}>
        <div className="message-container">
          {messages.map((m) =>
            m.role === "user" ? (
              <UserMessage
                key={m.id}
                mid={m.id}
                content={m.content}
                attachments={m.attachments}
              />
            ) : (
              <AiMessage key={m.id} mid={m.id} message={m as any} />
            )
          )}
        </div>
      </div>
    </>
  );
}

/* ================= HEADER / DRAWER / AUTH / SETTINGS / MEMORIES / LOADER ================= */

export function ChatHeader({ hidden }: { hidden?: boolean }) {
  const { chatTitle, setChatTitle, currentChatId, resetChat } = useChatStore();
  const { viewMode, setViewMode } = useUIStore();
  const session = useAuthStore((s) => s.session);
  const pinned = usePinStore((s) => s.pinned);
  const togglePin = usePinStore((s) => s.toggle);
  const bumpImagine = useImagineStore((s) => s.bump);
  const openFilesList = useCanvasStore((s) => s.openFilesList);

  const [optOpen, setOptOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState("New Chat");
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    const g = () => setOptOpen(false);
    window.addEventListener("click", g);
    return () => window.removeEventListener("click", g);
  }, []);

  const refreshImagine = (e: any) => {
    e.stopPropagation();
    setSpinning(true);
    setTimeout(() => setSpinning(false), 550);
    bumpImagine();
  };

  const isPinned = !!currentChatId && pinned.includes(currentChatId);

  if (hidden) return null;

  return (
    <>
      <style>{hdCSS}</style>

      <div id="chat-header">
        <div style={{ width: 36, flexShrink: 0 }} />

        <div className="header-center">
          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === "chat" ? "active" : ""}`}
              onClick={() => setViewMode("chat")}
            >
              Chat
            </button>
            <button
              className={`view-btn ${viewMode === "imagine" ? "active" : ""}`}
              onClick={() => setViewMode("imagine")}
            >
              Imagine
            </button>
          </div>
        </div>

        {viewMode === "imagine" ? (
          <button
            className={`hdr-dots-btn ${spinning ? "spinning" : ""}`}
            onClick={refreshImagine}
            aria-label="Refresh Imagine"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        ) : (
          <button
            className={`hdr-dots-btn ${optOpen ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setOptOpen((p) => !p);
            }}
            aria-label="Options"
          >
            <div className="dots-container">
              <span />
              <span />
              <span />
            </div>
          </button>
        )}
      </div>

      <div id="chat-options-menu" className={optOpen ? "show" : ""}>
        <div
          className="chat-opt shimmer-btn"
          onClick={(e) => {
            e.stopPropagation();
            shimmerThen(e, () => {
              setOptOpen(false);
              openFilesList();
            });
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
          Files in this chat
        </div>

        <div
          className="chat-opt shimmer-btn"
          onClick={(e) => {
            e.stopPropagation();
            shimmerThen(e, () => {
              setOptOpen(false);
              resetChat();
            });
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New chat
        </div>

        <div
          className="chat-opt shimmer-btn"
          onClick={(e) => {
            e.stopPropagation();
            shimmerThen(e, () => {
              setOptOpen(false);
              if (currentChatId) togglePin(currentChatId);
            });
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 17v5" />
            <path d="M9 3h6l1 7 2 2H6l2-2z" />
          </svg>
          {isPinned ? "Unpin chat" : "Pin chat"}
        </div>

        <div
          className="chat-opt shimmer-btn"
          onClick={(e) => {
            e.stopPropagation();
            shimmerThen(e, () => {
              setOptOpen(false);
              setRenameVal(chatTitle);
              setRenameOpen(true);
            });
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Rename chat
        </div>

        <div
          className="chat-opt danger shimmer-btn"
          onClick={(e) => {
            e.stopPropagation();
            shimmerThen(e, () => {
              setOptOpen(false);
              if (session && currentChatId) deleteChat(currentChatId);
              resetChat();
            });
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
          </svg>
          Delete chat
        </div>
      </div>

      <div id="rename-modal" className={renameOpen ? "show" : ""} onClick={() => setRenameOpen(false)}>
        <div className="rename-box" onClick={(e) => e.stopPropagation()}>
          <h3>Rename Chat</h3>

          <input
            className="rename-input"
            type="text"
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const t = renameVal.trim();
                if (t) {
                  setChatTitle(t);
                  if (session && currentChatId) renameChat(currentChatId, t);
                }
                setRenameOpen(false);
              }
            }}
          />

          <div className="rename-actions">
            <button className="rename-cancel" onClick={() => setRenameOpen(false)}>
              Cancel
            </button>
            <button
              className="rename-save"
              onClick={() => {
                const t = renameVal.trim();
                if (t) {
                  setChatTitle(t);
                  if (session && currentChatId) renameChat(currentChatId, t);
                }
                setRenameOpen(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function MenuDrawer({ hidden }: { hidden?: boolean }) {
  const { drawerOpen, setDrawerOpen, openAuthFromDrawer, openSettingsFromDrawer } =
    useUIStore();
  const { resetChat, loadMessages, setCurrentChat, currentChatId } = useChatStore();
  const session = useAuthStore((s) => s.session);
  const pinned = usePinStore((s) => s.pinned);

  const [chats, setChats] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (drawerOpen && session) fetchChats().then(setChats);
  }, [drawerOpen, session]);

  const filtered = query.trim()
    ? chats.filter((c) => c.title?.toLowerCase().includes(query.trim().toLowerCase()))
    : chats;

  const sorted = [...filtered].sort(
    (a, b) =>
      (pinned.includes(b.id) ? 1 : 0) - (pinned.includes(a.id) ? 1 : 0)
  );

  if (hidden) return null;

  return (
    <>
      <style>{dwCSS}</style>

      <div id="overlay" className={drawerOpen ? "open" : ""} onClick={() => setDrawerOpen(false)} />

      <div id="drawer" className={drawerOpen ? "open" : ""}>
        <div className="drawer-inner">
          <div className="drawer-top">
            <div className="brand">QUIX</div>

            {searchOpen ? (
              <input
                className="new-btn"
                placeholder="Search your chats..."
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => {
                  if (!query.trim()) setSearchOpen(false);
                }}
              />
            ) : (
              <button className="new-btn" onClick={() => setSearchOpen(true)}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Search chats
              </button>
            )}
          </div>

          <div className="drawer-scroll">
            <div className="hist-label">Recent</div>

            {session ? (
              sorted.length > 0 ? (
                <div>
                  {sorted.map((c) => (
                    <div
                      className={`hist-item ${c.id === currentChatId ? "current" : ""}`}
                      key={c.id}
                      onClick={async () => {
                        const msgs = await fetchMessages(c.id);
                        loadMessages(msgs);
                        setCurrentChat(c.id, c.title);
                        setDrawerOpen(false);
                      }}
                    >
                      <div className="hist-main">
                        <div className="hist-title">{c.title}</div>
                        <div className="hist-time">
                          {c.updated_at ? timeAgo(c.updated_at) : ""}
                        </div>
                      </div>

                      {pinned.includes(c.id) && (
                        <span className="hist-pin">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 17v5" />
                            <path d="M9 3h6l1 7 2 2H6l2-2z" />
                          </svg>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="hist-empty">
                  {query
                    ? "No chats match your search."
                    : "No chats yet. Your conversations will appear here once you start talking."}
                </div>
              )
            ) : (
              <div className="hist-empty">Sign in to save your chats.</div>
            )}
          </div>

          <div className="drawer-footer">
            {!session && (
              <button
                className="signin-btn shimmer-btn"
                onClick={(e) =>
                  shimmerThen(e, () => {
                    setDrawerOpen(false);
                    setTimeout(() => openAuthFromDrawer(), 150);
                  })
                }
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Sign in
              </button>
            )}

            <div className="profile-row">
              <button
                className="signin-btn shimmer-btn"
                style={{ flex: 1 }}
                onClick={(e) =>
                  shimmerThen(e, () => {
                    setDrawerOpen(false);
                    setTimeout(() => openSettingsFromDrawer(), 150);
                  })
                }
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Your profile
              </button>

              <button
                className="settings-circle shimmer-btn"
                onClick={(e) =>
                  shimmerThen(e, () => {
                    setDrawerOpen(false);
                    setTimeout(() => openSettingsFromDrawer(), 150);
                  })
                }
                aria-label="Settings"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82v-.01a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l.06-.06a2 2 0 1 1 2.83-2.83l-.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <button
        id="open-btn"
        className={drawerOpen ? "open" : ""}
        onClick={() => setDrawerOpen(!drawerOpen)}
        aria-label="Toggle Menu"
      >
        <span />
        <span />
        <span />
      </button>
    </>
  );
}

export function AuthScreen() {
  const { authOpen, closeAuth } = useUIStore();

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (authOpen) {
      setErr("");
      setNotice("");
    }
  }, [authOpen]);

  const submit = async () => {
    setErr("");
    setNotice("");

    const sb = supabase();
    if (!sb) {
      setErr("Auth is not configured.");
      return;
    }

    if (!email.trim() || !pass) {
      setErr("Enter email and password.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (tab === "signin") {
        const { error } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password: pass
        });

        if (error) {
          setErr(error.message);
        } else {
          closeAuth();
        }
      } else {
        if (!name.trim()) {
          setErr("Enter your name.");
          return;
        }

        if (pass.length < 6) {
          setErr("Password must be at least 6 characters.");
          return;
        }

        if (pass !== confirm) {
          setErr("Passwords do not match.");
          return;
        }

        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password: pass,
          options: {
            data: {
              full_name: name.trim()
            }
          }
        });

        if (error) {
          setErr(error.message);
        } else if (data?.session) {
          closeAuth();
        } else {
          setNotice("Check your email to confirm your account.");
        }
      }
    } catch (e: any) {
      setErr(e?.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <style>{auCSS}</style>

      <div id="auth-screen" className={authOpen ? "show" : ""}>
        <button className="auth-back" onClick={closeAuth}>
          ← Back
        </button>

        <div className="auth-logo">QUIX</div>
        <div className="auth-tagline">Your AI companion</div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === "signin" ? "active" : ""}`}
            onClick={() => setTab("signin")}
          >
            Sign in
          </button>
          <button
            className={`auth-tab ${tab === "signup" ? "active" : ""}`}
            onClick={() => setTab("signup")}
          >
            Sign up
          </button>
        </div>

        {tab === "signin" ? (
          <div className="auth-form">
            <input
              className="auth-field"
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="auth-field"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />

            {err && <div className="auth-err">{err}</div>}
            {notice && <div className="auth-notice">{notice}</div>}

            <button
              className={`auth-submit ${isSubmitting ? "loading" : ""}`}
              onClick={submit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in" : "Sign in"}
            </button>

            <div className="auth-switch">
              Don't have an account? <span onClick={() => setTab("signup")}>Sign up</span>
            </div>
          </div>
        ) : (
          <div className="auth-form">
            <input
              className="auth-field"
              type="text"
              placeholder="Full name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="auth-field"
              type="email"
              placeholder="Email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="auth-field"
              type="password"
              placeholder="Password"
              autoComplete="new-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            <input
              className="auth-field"
              type="password"
              placeholder="Confirm password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />

            {err && <div className="auth-err">{err}</div>}
            {notice && <div className="auth-notice">{notice}</div>}

            <button
              className={`auth-submit ${isSubmitting ? "loading" : ""}`}
              onClick={submit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating account" : "Create account"}
            </button>

            <div className="auth-switch">
              Already have an account? <span onClick={() => setTab("signin")}>Sign in</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function SettingsPage() {
  const { settingsOpen, closeSettings, fontScale, setFontScale, openMemories } =
    useUIStore();
  const { profile, setProfile } = useProfileStore();
  const { session, signOut } = useAuthStore();
  const loadMemories = useMemoryStore((s) => s.loadFor);
  const usage = useUsageStore((s) => s.usage);
  const limitFor = useUsageStore((s) => s.limitFor);

  const fileRef = useRef<HTMLInputElement>(null);
  const uid = session?.user?.id ?? null;

  useEffect(() => {
    if (uid) loadMemories(uid);
  }, [uid, loadMemories]);

  useEffect(() => {
    if (session?.user?.email && !profile.email) {
      setProfile({ email: session.user.email });
    }

    const meta = session?.user?.user_metadata as any;
    if (meta?.full_name && !profile.name) {
      setProfile({ name: meta.full_name });
    }
  }, [session]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";

    if (!f || f.size > 1.5 * 1024 * 1024) return;

    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const size = 256;
      canvas.width = size;
      canvas.height = size;

      let srcX = 0;
      let srcY = 0;
      let srcW = img.width;
      let srcH = img.height;

      if (img.width > img.height) {
        srcX = (img.width - img.height) / 2;
        srcW = img.height;
      } else {
        srcY = (img.height - img.width) / 2;
        srcH = img.width;
      }

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
      setProfile({ avatar: canvas.toDataURL("image/jpeg", 0.85) });
    };

    img.src = URL.createObjectURL(f);
  };

  return (
    <>
      <style>{stCSS}</style>

      <div id="settings-screen" className={settingsOpen ? "show" : ""}>
        <div className="set-header">
          <button className="set-back" onClick={closeSettings} aria-label="Back">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="set-title">Settings</div>
        </div>

        <div className="set-body">
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            style={{ display: "none" }}
            onChange={handleImageUpload}
          />

          <div className="avatar-wrap">
            <button className="avatar" onClick={() => fileRef.current?.click()}>
              {profile.avatar ? (
                <img src={profile.avatar} alt="avatar" />
              ) : (
                (profile.name?.[0] || session?.user?.email?.[0] || "Q").toUpperCase()
              )}
            </button>
          </div>

          <div className="set-section">
            <div className="set-label">Name</div>
            <input
              className="set-field"
              value={profile.name || ""}
              onChange={(e) => setProfile({ name: e.target.value })}
              placeholder="Your name"
            />
          </div>

          <div className="set-section">
            <div className="set-label">Email</div>
            <input
              className="set-field"
              value={profile.email || ""}
              onChange={(e) => setProfile({ email: e.target.value })}
              placeholder="Email"
            />
          </div>

          <div className="set-section">
            <div className="set-label">Font size</div>
            <div className="font-row">
              <button className="font-btn" onClick={() => setFontScale(fontScale - 0.05)}>
                −
              </button>
              <div className="font-val">{Math.round(fontScale * 100)}%</div>
              <button className="font-btn" onClick={() => setFontScale(fontScale + 0.05)}>
                +
              </button>
            </div>
          </div>

          <div className="set-section">
            <div className="set-label">Daily usage</div>

            {CHAT_MODELS.map((m) => {
              const lim = limitFor(m);
              const used = usage[m] ?? 0;
              const pct = lim > 0 ? Math.min(100, (used / lim) * 100) : 0;

              return (
                <div className="limit-row" key={m}>
                  <div className="limit-top">
                    <span>{MODELS[m]?.name}</span>
                    <span>{lim > 0 ? `${used}/${lim}` : "∞"}</span>
                  </div>
                  <div className="limit-bar">
                    <div className="limit-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <button
            className="signout-big"
            style={{
              borderColor: "rgba(255,255,255,.25)",
              background: "rgba(255,255,255,.06)",
              color: "#fff"
            }}
            onClick={openMemories}
          >
            Memories
          </button>

          {session ? (
            <button
              className="signout-big"
              onClick={async () => {
                await signOut();
                closeSettings();
              }}
            >
              Sign out
            </button>
          ) : (
            <button
              className="signout-big"
              style={{
                borderColor: "rgba(255,255,255,.25)",
                background: "rgba(255,255,255,.06)",
                color: "#fff"
              }}
              onClick={() => {
                closeSettings();
                useUIStore.getState().openAuth();
              }}
            >
              Sign in
            </button>
          )}

          <div className="watermark">QUIX {APP_VERSION}</div>
        </div>
      </div>
    </>
  );
}

export function MemoriesPage() {
  const { memoriesOpen, closeMemories } = useUIStore();
  const session = useAuthStore((s) => s.session);
  const memories = useMemoryStore((s) => s.memories);
  const loadFor = useMemoryStore((s) => s.loadFor);
  const addMemory = useMemoryStore((s) => s.addMemory);
  const removeMemory = useMemoryStore((s) => s.removeMemory);

  const [text, setText] = useState("");
  const uid = session?.user?.id ?? null;

  useEffect(() => {
    if (memoriesOpen && uid) loadFor(uid);
  }, [memoriesOpen, uid, loadFor]);

  const add = async () => {
    if (!text.trim() || !uid) return;
    await addMemory(uid, text.trim());
    setText("");
  };

  return (
    <>
      <style>{mmCSS}</style>
      <style>{stCSS}</style>

      <div id="memories-screen" className={memoriesOpen ? "show" : ""}>
        <div className="set-header">
          <button className="set-back" onClick={closeMemories} aria-label="Back">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="set-title">Memories</div>
        </div>

        <div className="set-body">
          {!uid && <div className="mem-empty">Sign in to save memories.</div>}

          {uid && (
            <div className="mem-input-row">
              <input
                className="set-field"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                }}
                placeholder="Add a memory..."
              />
              <button className="mem-add" onClick={add}>
                +
              </button>
            </div>
          )}

          {memories.length === 0 ? (
            <div className="mem-empty">No memories yet.</div>
          ) : (
            memories.map((m: any) => (
              <div className="mem-item" key={m.id}>
                <span>{m.text}</span>
                <button onClick={() => uid && removeMemory(uid, m.id)}>×</button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export function LoadingScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 185;
    const H = 185;
    const R = W / 2;
    const cx = R;
    const cy = R;

    const blobs = ORB_COLORS.map((color, i) => ({
      fx: 0.71 + i * 0.09,
      fy: 1.13 - i * 0.05,
      phase: i * 0.9,
      amp: 0.5,
      r: R * 0.75,
      color
    }));

    let t = 0;
    let last = performance.now();
    let id = 0;

    const draw = (now: number) => {
      const dt = now - last;
      last = now;
      t += 0.7 * dt * 0.001;

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

    const startTimer = setTimeout(() => {
      centerRef.current?.classList.add("drop");
      labelRef.current?.classList.add("show");
      brandRef.current?.classList.add("show");
      id = requestAnimationFrame(draw);
    }, 1000);

    const slideTimer = setTimeout(() => {
      loaderRef.current?.classList.add("slide-out");
    }, 6500);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(slideTimer);
      cancelAnimationFrame(id);
    };
  }, []);

  return (
    <>
      <style>{ldCSS}</style>

      <div id="loader" ref={loaderRef}>
        <div className="ld-center" ref={centerRef}>
          <canvas ref={canvasRef} width={185} height={185} />
          <div className="quix-label" ref={labelRef}>
            QUIX
          </div>
        </div>

        <div className="verve-brand" ref={brandRef}>
          from <span>Verve</span>
        </div>
      </div>
    </>
  );
}

/* ================= INPUT BAR ================= */

const WAVE_BARS = 24;

const ibFastCSS = `.input-wrapper{transition:none !important}.input-bar,.pop-menu,.voice-wave,.attach-row,.attach-chip,.morph-icon,.send-btn,.plus-btn,.model-btn,.cv-pill{transition-duration:.12s !important}`;

export function ChatInputBar({
  onSend,
  isDeepThink
}: {
  onSend?: (t: string, a: PendingAttachment[]) => void;
  isDeepThink?: boolean;
}) {
  const { activeModel, setActiveModel, isSending } = useChatStore();
  const messages = useChatStore((s) => s.messages);
  const canvasOn = useCanvasStore((s) => s.on);
  const setCanvasOn = useCanvasStore((s) => s.setOn);
  const openFilesList = useCanvasStore((s) => s.openFilesList);

  const [inputValue, setInputValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [spinClass, setSpinClass] = useState("");
  const [listening, setListening] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const listeningRef = useRef(false);
  const finishingRef = useRef(false);
  const sessionTextRef = useRef("");
  const interimTailRef = useRef("");
  const committedRef = useRef<string[]>([]);
  const finishTimeoutRef = useRef<any>(null);
  const spinDir = useRef(1);
  const offsetRef = useRef(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);

  const fileCount = extractFiles(messages).length;
  const session = useAuthStore((s) => s.session);
  const isGuest = !session;

  useEffect(() => {
    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);

      const w = wrapRef.current;
      if (!w || !window.visualViewport) return;

      const vv = window.visualViewport;
      const kbSize = window.innerHeight - vv.height;

      if (kbSize < 120 && offsetRef.current === 0) return;

      const kbTop = vv.offsetTop + vv.height;
      const wr = w.getBoundingClientRect();
      const delta = wr.bottom - kbTop;

      if (kbSize < 120) {
        if (offsetRef.current !== 0) {
          offsetRef.current = 0;
          w.style.bottom = "0px";
        }
        return;
      }

      if (Math.abs(delta) < 1) return;

      const next = Math.max(0, offsetRef.current + delta);
      offsetRef.current = next;
      w.style.bottom = `${next}px`;
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const g = () => {
      setMenuOpen(false);
      setModelMenuOpen(false);
    };

    document.addEventListener("click", g);
    return () => document.removeEventListener("click", g);
  }, []);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      try {
        recRef.current?.stop();
      } catch {}
      if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    };
  }, []);

  const prevent = (e: any) => e.preventDefault();

  const resetVoiceRefs = () => {
    sessionTextRef.current = "";
    interimTailRef.current = "";
    committedRef.current = [];
  };

  const commitAndReset = () => {
    const chunk = [sessionTextRef.current, interimTailRef.current]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (chunk) committedRef.current.push(chunk);

    const full = committedRef.current.join(" ").trim();
    resetVoiceRefs();

    if (full) {
      setInputValue((prev) => (prev ? prev + " " + full : full).trim());
    }
  };

  const stopMic = () => {
    listeningRef.current = false;
    setListening(false);

    try {
      recRef.current?.stop();
    } catch {}
  };

  const triggerSpin = () => {
    setSpinClass("");

    setTimeout(() => {
      const c = spinDir.current === 1 ? "spin-cw" : "spin-ccw";
      setSpinClass(c);
      spinDir.current *= -1;
    }, 10);
  };

  const startMic = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    resetVoiceRefs();

    rec.onresult = (e: any) => {
      let latest = "";
      let finalIdx = -1;

      for (let i = e.results.length - 1; i >= 0; i--) {
        if (e.results[i].isFinal) {
          latest = e.results[i][0].transcript;
          finalIdx = i;
          break;
        }
      }

      if (latest) sessionTextRef.current = latest.trim();

      let tail = "";
      for (let i = finalIdx + 1; i < e.results.length; i++) {
        tail += e.results[i][0].transcript;
      }

      interimTailRef.current = tail.trim();
    };

    rec.onend = () => {
      if (listeningRef.current) {
        const chunk = [sessionTextRef.current, interimTailRef.current]
          .filter(Boolean)
          .join(" ")
          .trim();

        if (chunk) committedRef.current.push(chunk);

        sessionTextRef.current = "";
        interimTailRef.current = "";

        setTimeout(() => {
          if (listeningRef.current) {
            try {
              rec.start();
            } catch {}
          }
        }, 120);

        return;
      }

      if (finishTimeoutRef.current) {
        clearTimeout(finishTimeoutRef.current);
        finishTimeoutRef.current = null;
      }

      if (finishingRef.current) {
        finishingRef.current = false;
        commitAndReset();
      } else {
        resetVoiceRefs();
      }

      setFinishing(false);
      setListening(false);
    };

    rec.onerror = (e: any) => {
      if (
        e &&
        (e.error === "not-allowed" ||
          e.error === "service-not-allowed" ||
          e.error === "audio-capture")
      ) {
        listeningRef.current = false;
        finishingRef.current = false;
        setFinishing(false);
        setListening(false);
      }
    };

    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    triggerSpin();

    try {
      rec.start();
    } catch {}
  };

  const finishMic = () => {
    if (!listeningRef.current || finishingRef.current) return;

    listeningRef.current = false;
    finishingRef.current = true;
    setFinishing(true);

    try {
      recRef.current?.stop();
    } catch {
      finishingRef.current = false;
      setFinishing(false);
      setListening(false);
      commitAndReset();
      return;
    }

    finishTimeoutRef.current = setTimeout(() => {
      if (finishingRef.current) {
        finishingRef.current = false;
        setFinishing(false);
        setListening(false);
        commitAndReset();
      }
    }, 2500);
  };

  const cancelMic = () => {
    if (!listeningRef.current) return;

    listeningRef.current = false;
    finishingRef.current = false;

    try {
      recRef.current?.stop();
    } catch {}

    resetVoiceRefs();
    setFinishing(false);
    setListening(false);
  };

  const toggleMic = () => {
    if (listeningRef.current) finishMic();
    else startMic();
  };

  const toggleUpload = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setModelMenuOpen(false);
    triggerSpin();
    setMenuOpen((p) => !p);
  };

  const pick = async (files: FileList | null) => {
    if (!files) return;

    const parsed = await Promise.all(
      Array.from(files).map(readFileAsAttachment)
    );

    setAttachments((p) => [
      ...p,
      ...parsed.filter((x): x is PendingAttachment => x !== null)
    ]);
  };

  const hasText = inputValue.trim().length > 0;
  const showStop = isSending;
  const showMic = listening || (!showStop && !hasText);

  const pickModel = (id: string) => {
    if (isGuest && id !== "thinking") {
      setModelMenuOpen(false);
      useUIStore.getState().openAuth();
      return;
    }

    setActiveModel(id);
    setModelMenuOpen(false);
    taRef.current?.blur();
  };

  const send = () => {
    const text = inputValue.trim();
    if (!text) return;

    stopMic();

    if (attachments.length === 0 && !text) return;

    onSend?.(text, attachments);
    setInputValue("");
    setAttachments([]);

    if (taRef.current) {
      taRef.current.blur();
      taRef.current.style.height = "40px";
    }
  };

  const stop = () => {
    abortGemini();
    window.dispatchEvent(new Event("quix-stop"));
    useChatStore.getState().setIsSending(false);
  };

  const mainAction = () => {
    if (showStop) return stop();
    if (finishing) return;
    if (listening) return finishMic();
    if (hasText) return send();
    return toggleMic();
  };

  const sendIconKey = showStop
    ? "stop"
    : finishing
      ? "finishing"
      : listening
        ? "confirm"
        : showMic
          ? "mic"
          : "arrow";

  return (
    <>
      <style>{ibCSS}</style>
      <style>{ibFastCSS}</style>

      <input
        type="file"
        ref={fileRef}
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      <input
        type="file"
        ref={imgRef}
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="input-wrapper" ref={wrapRef} style={{ bottom: 0 }}>
        <div className={`input-bar ${listening ? "listening" : ""}`}>
          {!isDeepThink && attachments.length > 0 && (
            <div className="attach-row">
              {attachments.map((a) => (
                <div className="attach-chip" key={a.id}>
                  {a.kind === "image" && a.previewUrl ? (
                    <img className="attach-thumb" src={a.previewUrl} alt={a.name} />
                  ) : null}
                  <span>{a.name}</span>
                  <button
                    className="attach-remove"
                    onClick={() =>
                      setAttachments((p) => p.filter((x) => x.id !== a.id))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {listening ? (
            <div className="voice-wave" aria-hidden="true">
              {Array.from({ length: WAVE_BARS }).map((_, i) => (
                <span key={i} style={{ animationDelay: `${(i % 8) * 0.09}s` }} />
              ))}
            </div>
          ) : (
            <textarea
              ref={taRef}
              placeholder={isDeepThink ? "Ask DeepThink to research..." : "Ask Quix..."}
              rows={1}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);

                if (taRef.current) {
                  taRef.current.style.height = "40px";
                  taRef.current.style.height =
                    Math.min(taRef.current.scrollHeight, 250) + "px";
                }
              }}
            />
          )}

          <div className="action-row">
            <div className="action-left">
              {!isDeepThink && (
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className={`plus-btn ${spinClass}`}
                    onClick={listening ? cancelMic : toggleUpload}
                    onMouseDown={prevent}
                    onTouchStart={prevent}
                    disabled={finishing}
                    aria-label={listening ? "Cancel voice input" : "Upload options"}
                  >
                    <span className="morph-icon" key={listening ? "cancel" : "plus"}>
                      {listening ? (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      ) : (
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      )}
                    </span>
                  </button>

                  <div className={`pop-menu ${menuOpen ? "show" : ""}`} style={{ width: 180 }}>
                    <div
                      className="upload-opt"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        fileRef.current?.click();
                      }}
                      onMouseDown={prevent}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      Upload file
                    </div>

                    <div
                      className="upload-opt"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        imgRef.current?.click();
                      }}
                      onMouseDown={prevent}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      Upload image
                    </div>

                    <div
                      className={`upload-opt ${canvasOn ? "on" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCanvasOn(!canvasOn);
                        setMenuOpen(false);
                      }}
                      onMouseDown={prevent}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                      </svg>
                      Canvas
                      {canvasOn && (
                        <span
                          className="cv-cross"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCanvasOn(false);
                            setMenuOpen(false);
                          }}
                        >
                          ×
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!listening && (
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className={`model-btn ${modelMenuOpen ? "open" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      setModelMenuOpen((p) => !p);
                      taRef.current?.blur();
                    }}
                    onMouseDown={prevent}
                    onTouchStart={prevent}
                  >
                    <span>{MODELS[activeModel]?.name ?? "Quix 3 Flash"}</span>
                    <span className="mchev">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </button>

                  <div className={`pop-menu ${modelMenuOpen ? "show" : ""}`}>
                    {CHAT_MODELS.map((id) => {
                      const locked = isGuest && id !== "thinking";

                      return (
                        <div
                          key={id}
                          className={`model-item ${locked ? "locked" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (locked) return;
                            pickModel(id);
                          }}
                        >
                          {activeModel === id && !locked ? (
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              className="model-check"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : locked ? (
                            <span dangerouslySetInnerHTML={{ __html: lockSvg }} />
                          ) : (
                            <div style={{ width: 15, flexShrink: 0 }} />
                          )}

                          <div className="model-item-content">
                            <span className="model-title">
                              {MODELS[id].name}
                              {id === "deepthink" && <span className="beta-tag"> Beta</span>}
                              {locked && (
                                <span
                                  style={{
                                    color: "#ff8080",
                                    fontSize: 10,
                                    marginLeft: 4
                                  }}
                                >
                                  Sign in
                                </span>
                              )}
                            </span>
                            <span className="model-desc">{MODELS[id].desc}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="action-right">
              {canvasOn && !isDeepThink && !listening && (
                <button type="button" className="cv-pill" onClick={() => openFilesList()}>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  </svg>
                  Canvas{fileCount > 0 ? ` · ${fileCount}` : ""}
                </button>
              )}

              <button
                type="button"
                className={`send-btn ${showStop ? "stop" : ""} ${finishing ? "finishing" : ""} ${
                  showMic ? (listening ? "mic listening" : "mic") : ""
                }`}
                onClick={mainAction}
                disabled={finishing}
                aria-label={
                  showStop
                    ? "Stop"
                    : finishing
                      ? "Finishing up"
                      : listening
                        ? "Confirm voice input"
                        : hasText
                          ? "Send"
                          : "Voice input"
                }
              >
                <span className="morph-icon" key={sendIconKey}>
                  {showStop ? (
                    <svg width="15" height="15" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2.5" />
                    </svg>
                  ) : finishing ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" className="spin-loader">
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray="42 100"
                      />
                    </svg>
                  ) : listening ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : showMic ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="4" y="10" width="2.6" height="4" rx="1.3" />
                      <rect x="9.2" y="6" width="2.6" height="12" rx="1.3" />
                      <rect x="14.4" y="8" width="2.6" height="8" rx="1.3" />
                      <rect x="19.6" y="10.5" width="2.6" height="3" rx="1.3" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}