import React, { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { MODELS, CHAT_MODELS, APP_VERSION, useAuthStore, useUIStore, useChatStore, useProfileStore, useMemoryStore, useUsageStore, supabase, fetchChats, fetchMessages, renameChat, deleteChat, abortGemini } from "./core";
import { useCanvasStore, extractFiles, PendingAttachment, readFileAsAttachment } from "./components";
import { ORB_COLORS, hdCSS, dwCSS, auCSS, stCSS, mmCSS, ldCSS, dtCSS, vcCSS, ibCSS, lockSvg } from "./styles";

export const usePinStore = create<any>((set, get) => ({
  pinned: (() => { try { return JSON.parse(localStorage.getItem("quix_pinned_v1") || "[]"); } catch { return []; } })(),
  toggle: (id: string) => { if (!id) return; const cur: string[] = get().pinned; const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; try { localStorage.setItem("quix_pinned_v1", JSON.stringify(next)); } catch {} set({ pinned: next }); },
}));
export const useImagineStore = create<any>((set) => ({ nonce: 0, bump: () => set((s: any) => ({ nonce: s.nonce + 1 })) }));
export const useUsagePageStore = create<any>((set) => ({ open: false, openPage: () => set({ open: true }), closePage: () => set({ open: false }) }));
export const useScreenPageStore = create<any>((set) => ({ open: false, openPage: () => set({ open: true }), closePage: () => set({ open: false }) }));

const rippleCSS = `.qx-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,.45);opacity:.6;transform:scale(0);animation:qx-rip .55s ease-out forwards;pointer-events:none}@keyframes qx-rip{to{transform:scale(1);opacity:0}}`;
export function shimmer(e: any) {
  const el = e?.currentTarget as HTMLElement;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const d = Math.max(rect.width, rect.height) * 2.5;
  const span = document.createElement("span");
  span.className = "qx-ripple";
  span.style.width = span.style.height = d + "px";
  const cx = e && e.clientX ? e.clientX : rect.left + rect.width / 2;
  const cy = e && e.clientY ? e.clientY : rect.top + rect.height / 2;
  span.style.left = cx - rect.left - d / 2 + "px";
  span.style.top = cy - rect.top - d / 2 + "px";
  if (!el.style.position || el.style.position === "static") el.style.position = "relative";
  const prevOver = el.style.overflow;
  el.style.overflow = "hidden";
  span.addEventListener("animationend", () => { span.remove(); el.style.overflow = prevOver; });
  el.appendChild(span);
}
export function shimmerThen(e: any, fn: () => void) { shimmer(e); setTimeout(fn, 180); }

function timeAgo(d: string): string { const diff = Math.max(0, Date.now() - new Date(d).getTime()); const m = Math.floor(diff / 60000); if (m < 1) return "Just now"; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; }
function msToReset(): number { const n = new Date(); const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0, 0)); return next.getTime() - n.getTime(); }
const pad2 = (n: number) => String(n).padStart(2, "0");

const usCSS = `#usage-screen{position:fixed;inset:0;z-index:160;background:#050508;display:flex;flex-direction:column;opacity:0;pointer-events:none;transform:translateY(30px);transition:opacity .35s ease,transform .35s ease}#usage-screen.show{opacity:1;pointer-events:all;transform:translateY(0)}.usage-timer{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px 16px}.usage-timer-val{font-family:'Syne',sans-serif;font-weight:700;font-size:18px;color:#fff;letter-spacing:.06em}`;
const dsCSS = `#display-screen{position:fixed;inset:0;z-index:160;background:#050508;display:flex;flex-direction:column;opacity:0;pointer-events:none;transform:translateY(30px);transition:opacity .35s ease,transform .35s ease}#display-screen.show{opacity:1;pointer-events:all;transform:translateY(0)}`;

export function ChatHeader({ hidden }: { hidden?: boolean }) {
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
  if (hidden) return null;
  return (
    <>
      <style>{hdCSS}</style>
      <style>{rippleCSS}</style>
      <div id="chat-header">
        <div style={{ width: 36, flexShrink: 0 }} />
        <div className="header-center"><div className="view-toggle"><button className={`view-btn ${viewMode === "chat" ? "active" : ""}`} onClick={() => setViewMode("chat")}>Chat</button><button className={`view-btn ${viewMode === "imagine" ? "active" : ""}`} onClick={() => setViewMode("imagine")}>Imagine</button></div></div>
        {viewMode === "imagine" ? (<button className={`hdr-dots-btn ${spinning ? "spinning" : ""}`} onClick={refreshImagine} aria-label="Refresh Imagine"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg></button>) : (<button className={`hdr-dots-btn ${optOpen ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); setOptOpen((p) => !p); }} aria-label="Options"><div className="dots-container"><span /><span /><span /></div></button>)}
      </div>
      <div id="chat-options-menu" className={optOpen ? "show" : ""}>
        <div className="chat-opt shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); openFilesList(); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>Files in this chat</div>
        <div className="chat-opt shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); resetChat(); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>New chat</div>
        <div className="chat-opt shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); if (currentChatId) togglePin(currentChatId); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 3h6l1 7 2 2H6l2-2z" /></svg>{isPinned ? "Unpin chat" : "Pin chat"}</div>
        <div className="chat-opt shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); setRenameVal(chatTitle); setRenameOpen(true); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>Rename chat</div>
        <div className="chat-opt danger shimmer-btn" onClick={(e) => { e.stopPropagation(); shimmerThen(e, () => { setOptOpen(false); if (session && currentChatId) deleteChat(currentChatId); resetChat(); }); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>Delete chat</div>
      </div>
      <div id="rename-modal" className={renameOpen ? "show" : ""} onClick={() => setRenameOpen(false)}>
        <div className="rename-box" onClick={(e) => e.stopPropagation()}>
          <h3>Rename Chat</h3>
          <input className="rename-input" type="text" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { const t = renameVal.trim(); if (t) { setChatTitle(t); if (session && currentChatId) renameChat(currentChatId, t); } setRenameOpen(false); } }} />
          <div className="rename-actions"><button className="rename-cancel" onClick={() => setRenameOpen(false)}>Cancel</button><button className="rename-save" onClick={() => { const t = renameVal.trim(); if (t) { setChatTitle(t); if (session && currentChatId) renameChat(currentChatId, t); } setRenameOpen(false); }}>Save</button></div>
        </div>
      </div>
    </>
  );
}

export function MenuDrawer({ hidden }: { hidden?: boolean }) {
  const { drawerOpen, setDrawerOpen, openAuthFromDrawer, openSettingsFromDrawer } = useUIStore();
  const { resetChat, loadMessages, setCurrentChat, currentChatId } = useChatStore();
  const { session } = useAuthStore();
  const pinned = usePinStore((s) => s.pinned);
  const [chats, setChats] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => { if (drawerOpen && session) fetchChats().then(setChats); }, [drawerOpen, session]);
  const filtered = query.trim() ? chats.filter((c) => c.title?.toLowerCase().includes(query.trim().toLowerCase())) : chats;
  const sorted = [...filtered].sort((a, b) => (pinned.includes(b.id) ? 1 : 0) - (pinned.includes(a.id) ? 1 : 0));
  if (hidden) return null;
  return (
    <>
      <style>{dwCSS}</style>
      <div id="overlay" className={drawerOpen ? "open" : ""} onClick={() => setDrawerOpen(false)} />
      <div id="drawer" className={drawerOpen ? "open" : ""}>
        <div className="drawer-inner">
          <div className="drawer-top">
            <div className="brand">QUIX</div>
            {searchOpen ? (<input className="new-btn" placeholder="Search your chats..." value={query} autoFocus onChange={(e) => setQuery(e.target.value)} onBlur={() => { if (!query.trim()) setSearchOpen(false); }} />) : (<button className="new-btn" onClick={() => setSearchOpen(true)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>Search chats</button>)}
          </div>
          <div className="drawer-scroll">
            <div className="hist-label">Recent</div>
            {session ? (sorted.length > 0 ? (<div>{sorted.map((c) => (<div className={`hist-item ${c.id === currentChatId ? "current" : ""}`} key={c.id} onClick={async () => { const msgs = await fetchMessages(c.id); loadMessages(msgs); setCurrentChat(c.id, c.title); setDrawerOpen(false); }}><div className="hist-main"><div className="hist-title">{c.title}</div><div className="hist-time">{c.updated_at ? timeAgo(c.updated_at) : ""}</div></div>{pinned.includes(c.id) && (<span className="hist-pin"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 3h6l1 7 2 2H6l2-2z" /></svg></span>)}</div>))}</div>) : (<div className="hist-empty">{query ? "No chats match your search." : "No chats yet. Your conversations will appear here once you start talking."}</div>)) : (<div className="hist-empty">Sign in to save your chats.</div>)}
          </div>
          <div className="drawer-footer">
            {!session && (
              <button className="signin-btn shimmer-btn" onClick={(e) => shimmerThen(e, () => { setDrawerOpen(false); setTimeout(() => openAuthFromDrawer(), 150); })}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>
                Sign in
              </button>
            )}
            <div className="profile-row">
              <button className="signin-btn shimmer-btn" style={{ flex: 1 }} onClick={(e) => shimmerThen(e, () => { setDrawerOpen(false); setTimeout(() => openSettingsFromDrawer(), 150); })}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>Your profile</button>
              <button className="settings-circle shimmer-btn" onClick={(e) => shimmerThen(e, () => { setDrawerOpen(false); setTimeout(() => openSettingsFromDrawer(), 150); })} aria-label="Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82v-.01a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></button>
            </div>
          </div>
        </div>
      </div>
      <button id="open-btn" className={drawerOpen ? "open" : ""} onClick={() => setDrawerOpen(!drawerOpen)} aria-label="Toggle Menu"><span /><span /><span /></button>
    </>
  );
}

export function AuthScreen() {
  const { authOpen, closeAuth } = useUIStore();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(""); const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => { if (authOpen) { setTab("signin"); setName(""); setEmail(""); setPass(""); setConfirm(""); setErr(""); setNotice(""); setIsSubmitting(false); } }, [authOpen]);
  const submit = async () => {
    setIsSubmitting(true);
    const sb = supabase