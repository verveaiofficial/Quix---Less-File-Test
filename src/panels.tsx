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
const hdOverrideCSS = `#chat-header{background:transparent !important;backdrop-filter:blur(12px) saturate(150%);-webkit-backdrop-filter:blur(12px) saturate(150%)}`;
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
      <style>{hdOverrideCSS}</style>
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
              <button className="settings-circle shimmer-btn" onClick={(e) => shimmerThen(e, () => { setDrawerOpen(false); setTimeout(() => openSettingsFromDrawer(), 150); })} aria-label="Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82v-.01a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l.06-.06a2 2 0 1 1 2.83-2.83l.06-.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg></button>
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
    const sb = supabase(); if (!sb) { setErr("Auth not configured. Add Supabase env keys."); setIsSubmitting(false); return; }
    setErr(""); setNotice("");
    if (tab === "signup" && pass !== confirm) { setErr("Passwords don't match."); setIsSubmitting(false); return; }
    if (tab === "signin") {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      setIsSubmitting(false);
      if (error) setErr(error.message); else closeAuth();
    } else {
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
      setIsSubmitting(false);
      if (error) setErr(error.message); else if (!data?.session) { setNotice("Account created. Check your email and tap the confirmation link, then come back and sign in."); setTab("signin"); setPass(""); setConfirm(""); } else closeAuth();
    }
  };
  return (
    <>
      <style>{auCSS}</style>
      <div id="auth-screen" className={authOpen ? "show" : ""}>
        <button className="auth-back" onClick={closeAuth}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>Back</button>
        <div className="auth-logo">QUIX</div>
        <div className="auth-tagline">Your AI. Your space.</div>
        <div className="auth-tabs">
          <button className={`auth-tab ${tab === "signin" ? "active" : ""}`} onClick={() => { setTab("signin"); setNotice(""); }}>Sign in</button>
          <button className={`auth-tab ${tab === "signup" ? "active" : ""}`} onClick={() => { setTab("signup"); setNotice(""); }}>Sign up</button>
        </div>
        {notice && <div className="auth-notice" style={{ marginBottom: 12, width: "100%", maxWidth: 340 }}>{notice}</div>}
        {tab === "signin" ? (
          <div className="auth-form">
            <input className="auth-field" type="email" placeholder="Email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="auth-field" type="password" placeholder="Password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {err && <div className="auth-err">{err}</div>}
            <button className={`auth-submit ${isSubmitting ? "loading" : ""}`} onClick={submit} disabled={isSubmitting}>{isSubmitting ? "Signing in" : "Sign in"}</button>
            <div className="auth-switch">Don't have an account? <span onClick={() => setTab("signup")}>Sign up</span></div>
          </div>
        ) : (
          <div className="auth-form">
            <input className="auth-field" type="text" placeholder="Full name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="auth-field" type="email" placeholder="Email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="auth-field" type="password" placeholder="Password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <input className="auth-field" type="password" placeholder="Confirm password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {err && <div className="auth-err">{err}</div>}
            <button className={`auth-submit ${isSubmitting ? "loading" : ""}`} onClick={submit} disabled={isSubmitting}>{isSubmitting ? "Creating account" : "Create account"}</button>
            <div className="auth-switch">Already have an account? <span onClick={() => setTab("signin")}>Sign in</span></div>
          </div>
        )}
      </div>
    </>
  );
}
export function UsagePage() {
  const open = useUsagePageStore((s) => s.open);
  const close = useUsagePageStore((s) => s.closePage);
  const usage = useUsageStore((s) => s.usage);
  const limitFor = useUsageStore((s) => s.limitFor);
  const [left, setLeft] = useState(msToReset());
  useEffect(() => { const t = setInterval(() => setLeft(msToReset()), 1000); return () => clearInterval(t); }, []);
  const h = Math.floor(left / 3600000); const m = Math.floor((left % 3600000) / 60000); const s = Math.floor((left % 60000) / 1000);
  return (
    <>
      <style>{stCSS}</style>
      <style>{usCSS}</style>
      <div id="usage-screen" className={open ? "show" : ""}>
        <div className="set-header"><button className="set-back" onClick={close} aria-label="Back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button><div className="set-title">Usage</div></div>
        <div className="set-body">
          <div className="usage-timer">
            <span className="set-label" style={{ fontSize: 12 }}>Resets in</span>
            <span className="usage-timer-val">{pad2(h)}:{pad2(m)}:{pad2(s)}</span>
          </div>
          <div className="set-section">
            <div className="set-label">Today's usage by model</div>
            {CHAT_MODELS.map((mdl) => {
              const lim = limitFor(mdl);
              const leftCount = usage[mdl] ?? 0;
              return (
                <div className="limit-row" key={mdl}>
                  <div className="limit-top">
                    <span>{MODELS[mdl].name}</span>
                    <span>{lim < 0 ? "Unlimited" : lim === 0 ? "Sign in required" : `${leftCount}/${lim}`}</span>
                  </div>
                  <div className="limit-bar"><div className="limit-fill" style={{ width: lim < 0 ? 100 : lim === 0 ? 0 : `${Math.min(100, (leftCount / lim) * 100)}%` }} /></div>
                </div>
              );
            })}
          </div>
          <div className="mem-empty">Daily usage reset at midnight UTC.</div>
        </div>
      </div>
    </>
  );
}

export function ScreenSizePage() {
  const open = useScreenPageStore((s) => s.open);
  const close = useScreenPageStore((s) => s.closePage);
  const { fontScale, setFontScale } = useUIStore();
  return (
    <>
      <style>{stCSS}</style>
      <style>{dsCSS}</style>
      <div id="display-screen" className={open ? "show" : ""}>
        <div className="set-header"><button className="set-back" onClick={close} aria-label="Back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button><div className="set-title">Screen size</div></div>
        <div className="set-body">
          <div className="set-section">
            <div className="set-label">Text size</div>
            <div className="font-row">
              <button className="font-btn" onClick={() => setFontScale(fontScale - 0.05)}>−</button>
              <span className="font-val">{Math.round(fontScale * 100)}%</span>
              <button className="font-btn" onClick={() => setFontScale(fontScale + 0.05)}>+</button>
            </div>
            <div className="mem-empty">Applies to the whole app instantly.</div>
          </div>
        </div>
      </div>
    </>
  );
}

export function SettingsPage() {
  const { settingsOpen, closeSettings, openMemories } = useUIStore();
  const { profile, setProfile } = useProfileStore();
  const { session, signOut } = useAuthStore();
  const { resetChat } = useChatStore();
  const memories = useMemoryStore((s) => s.memories);
  const loadFor = useMemoryStore((s) => s.loadFor);
  const openUsagePage = useUsagePageStore((s) => s.openPage);
  const openScreenPage = useScreenPageStore((s) => s.openPage);
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = session?.user?.id ?? null;
  useEffect(() => { if (uid) loadFor(uid); }, [uid, loadFor]);
  useEffect(() => {
    if (session?.user?.email && !profile.email) setProfile({ email: session.user.email });
    const meta = session?.user?.user_metadata as any;
    if (meta?.full_name && !profile.name) setProfile({ name: meta.full_name });
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
      canvas.width = size; canvas.height = size;
      let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;
      if (img.width > img.height) { srcX = (img.width - img.height) / 2; srcW = img.height; } else { srcY = (img.height - img.width) / 2; srcH = img.width; }
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onload = () => setProfile({ avatar: String(reader.result || "") });
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.85);
    };
    img.src = URL.createObjectURL(f);
  };

  return (
    <>
      <style>{stCSS}</style>
      <div id="settings-screen" className={settingsOpen ? "show" : ""}>
        <div className="set-header"><button className="set-back" onClick={closeSettings} aria-label="Back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button><div className="set-title">Profile & Settings</div></div>
        <div className="set-body">
          <div className="avatar-wrap">
            <button className="avatar" onClick={() => fileRef.current?.click()}>
              {profile.avatar ? (<img src={profile.avatar} alt="profile" />) : (<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>)}
            </button>
            <input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }} onChange={handleImageUpload} />
          </div>
          <div className="set-section">
            <div className="set-label">Profile</div>
            <input className="set-field" type="text" placeholder="Name" value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} />
            <input className="set-field" type="email" placeholder="Email" value={profile.email} onChange={(e) => setProfile({ email: e.target.value })} />
          </div>
          <div className="set-section">
            <div className="set-label">Settings</div>
            <button className="new-btn shimmer-btn" style={{ justifyContent: 'space-between' }} onClick={(e) => shimmerThen(e, () => openUsagePage())}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                Usage
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            {uid && (
              <button className="new-btn shimmer-btn" style={{ justifyContent: 'space-between' }} onClick={(e) => shimmerThen(e, () => openMemories())}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>
                  Memories{memories.length > 0 ? ` · ${memories.length}` : ""}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            )}
            <button className="new-btn shimmer-btn" style={{ justifyContent: 'space-between' }} onClick={(e) => shimmerThen(e, () => openScreenPage())}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" /></svg>
                Screen size
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          {session && (<div className="set-section"><button className="signout-big" onClick={async () => { await signOut(); resetChat(); }}>Sign out</button></div>)}
          <div className="watermark">Quix · {APP_VERSION}</div>
        </div>
      </div>
      <UsagePage />
      <ScreenSizePage />
    </>
  );
}

export function MemoriesPage() {
  const { memoriesOpen, closeMemories } = useUIStore();
  const { session } = useAuthStore();
  const { memories, loadFor, addMemory, removeMemory } = useMemoryStore();
  const [memInput, setMemInput] = useState("");
  const uid = session?.user?.id ?? null;
  useEffect(() => { if (uid && memoriesOpen) loadFor(uid); }, [uid, memoriesOpen, loadFor]);
  return (
    <>
      <style>{stCSS}</style>
      <style>{mmCSS}</style>
      <div id="memories-screen" className={memoriesOpen ? "show" : ""}>
        <div className="set-header"><button className="set-back" onClick={closeMemories} aria-label="Back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button><div className="set-title">Memories</div></div>
        <div className="set-body">
          {uid ? (
            <>
              <div className="set-section">
                <div className="set-label">Teach Quix</div>
                <div className="mem-input-row">
                  <input className="set-field" type="text" placeholder="Teach Quix something about you..." value={memInput} onChange={(e) => setMemInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && memInput.trim()) { addMemory(uid, memInput); setMemInput(""); } }} />
                  <button className="mem-add" onClick={() => { if (memInput.trim()) { addMemory(uid, memInput); setMemInput(""); } }}>+</button>
                </div>
              </div>
              <div className="set-section">
                <div className="set-label">All memories ({memories.length})</div>
                {memories.length > 0 ? (memories.map((m: any) => (<div className="mem-item" key={m.id}><span>{m.text}</span><button onClick={() => removeMemory(uid, m.id)}>×</button></div>))) : (<div className="mem-empty">No memories yet. Quix also writes automatic memories from your last 24h of chats at every midnight UTC.</div>)}
              </div>
            </>
          ) : (<div className="mem-empty">Sign in to use memories.</div>)}
        </div>
      </div>
    </>
  );
}

export function LoadingScreen() {
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

export function DeepThinkLayer({ frameRef }: { frameRef: React.RefObject<HTMLIFrameElement> }) {
  return (<><style>{dtCSS}</style><iframe ref={frameRef} className="dt-frame" src="https://quix-deepthink.lovable.app" title="DeepThink" /></>);
}

export function VoiceCallLayer({ onExit }: { onExit: () => void }) {
  return (
    <>
      <style>{vcCSS}</style>
      <div className="voice-call-layer">
        <button className="voice-call-exit" onClick={onExit} aria-label="Exit voice call"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
        <iframe className="voice-call-frame" src="https://quix-voice.vercel.app/" title="Voice Call" allow="microphone; camera" allowUserMedia />
      </div>
    </>
  );
}

// ================= INPUT BAR =================
const WAVE_BARS = 24;
const EMPTY_TEMPLATES = [
  { label: "Teach me hacks", prompt: "Teach me hacks" },
  { label: "Psychological tricks", prompt: "Psychological tricks" },
  { label: "Cute trends", prompt: "Teach me cute fashion trends" },
  { label: "Brainstorm", prompt: "Brainstorm some creative ideas for me" },
  { label: "Productivity", prompt: "How to be more productive" },
];
const ibFastCSS = `.input-wrapper{transition:none !important}.input-bar,.pop-menu,.voice-wave,.attach-row,.attach-chip,.morph-icon,.send-btn,.plus-btn,.model-btn,.cv-pill{transition-duration:.12s !important}`;

export function ChatInputBar({ onSend, isDeepThink }: { onSend?: (t: string, a: PendingAttachment[]) => void; isDeepThink?: boolean }) {
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
  const dropTimeoutRef = useRef<any>(null);
  const pendingDropRef = useRef<(() => void) | null>(null);
  const spinDir = useRef(1);
  const offsetRef = useRef(0);
  const forceDownRef = useRef(false);
  const messagesRef = useRef(messages);
  const centerBottomRef = useRef(0);
  const baseHeightRef = useRef(typeof window !== "undefined" ? window.innerHeight : 0);
  const wordRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
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
      const kbSize = Math.max(window.innerHeight - vv.height, baseHeightRef.current - window.innerHeight);
      if (kbSize < 120) {
        baseHeightRef.current = window.innerHeight;
        w.classList.remove("kb-open");
        if (footerRef.current) footerRef.current.classList.remove("kb-hidden");
        if (offsetRef.current !== 0 || forceDownRef.current) {
          offsetRef.current = 0;
          forceDownRef.current = false;
          w.style.removeProperty("transition");
          w.style.bottom = messagesRef.current.length === 0 ? (centerBottomRef.current > 0 ? `${centerBottomRef.current}px` : "calc(50vh - 180px)") : "0px";
        }
        return;
      }
      w.classList.add("kb-open");
      if (footerRef.current) footerRef.current.classList.add("kb-hidden");
      if (forceDownRef.current) return;
      const kbTop = vv.offsetTop + vv.height;
      const wr = w.getBoundingClientRect();
      const delta = wr.bottom - kbTop;
      if (Math.abs(delta) < 1) return;
      const next = Math.max(0, offsetRef.current + delta);
      offsetRef.current = next;
      w.style.bottom = `${next}px`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (messages.length !== 0) return;
    const fit = () => {
      const word = wordRef.current;
      const wrap = wrapRef.current;
      if (!word || !wrap) return;
      const bar = wrap.querySelector(".input-bar") as HTMLElement | null;
      if (!bar) return;
      word.style.fontSize = "";
      const target = bar.getBoundingClientRect().width;
      const w = word.getBoundingClientRect().width;
      if (!target || !w) return;
      const cur = parseFloat(getComputedStyle(word).fontSize);
      word.style.fontSize = (cur * target / w) + "px";
      const S = window.innerHeight;
      const H = wrap.offsetHeight;
      centerBottomRef.current = Math.max(10, Math.round((S - H) / 2));
      if (offsetRef.current === 0 && !forceDownRef.current) wrap.style.bottom = `${centerBottomRef.current}px`;
    };
    fit();
    const raf = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    let cancelled = false;
    if (document.fonts && (document.fonts as any).ready) (document.fonts as any).ready.then(() => { if (!cancelled) fit(); });
    return () => { cancelled = true; window.removeEventListener("resize", fit); cancelAnimationFrame(raf); };
  }, [messages.length]);

  useEffect(() => { const g = () => { setMenuOpen(false); setModelMenuOpen(false); }; document.addEventListener("click", g); return () => document.removeEventListener("click", g); }, []);
  useEffect(() => { return () => { listeningRef.current = false; try { recRef.current?.stop(); } catch {} if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current); if (dropTimeoutRef.current) clearTimeout(dropTimeoutRef.current); if (pendingDropRef.current) { window.removeEventListener("quix-msg-scroll-done", pendingDropRef.current); pendingDropRef.current = null; } }; }, []);

  const prevent = (e: any) => e.preventDefault();
  const resetVoiceRefs = () => { sessionTextRef.current = ""; interimTailRef.current = ""; committedRef.current = []; };
  const commitAndReset = () => {
    const chunk = [sessionTextRef.current, interimTailRef.current].filter(Boolean).join(" ").trim();
    if (chunk) committedRef.current.push(chunk);
    const full = committedRef.current.join(" ").trim();
    resetVoiceRefs();
    if (full) setInputValue((prev) => (prev ? prev + " " + full : full).trim());
  };
  const stopMic = () => { listeningRef.current = false; setListening(false); try { recRef.current?.stop(); } catch {} };
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
        if (e.results[i].isFinal) { latest = e.results[i][0].transcript; finalIdx = i; break; }
      }
      if (latest) sessionTextRef.current = latest.trim();
      let tail = "";
      for (let i = finalIdx + 1; i < e.results.length; i++) tail += e.results[i][0].transcript;
      interimTailRef.current = tail.trim();
    };
    rec.onend = () => {
      if (listeningRef.current) {
        const chunk = [sessionTextRef.current, interimTailRef.current].filter(Boolean).join(" ").trim();
        if (chunk) committedRef.current.push(chunk);
        sessionTextRef.current = "";
        interimTailRef.current = "";
        setTimeout(() => { if (listeningRef.current) { try { rec.start(); } catch {} } }, 120);
        return;
      }
      if (finishTimeoutRef.current) { clearTimeout(finishTimeoutRef.current); finishTimeoutRef.current = null; }
      if (finishingRef.current) { finishingRef.current = false; commitAndReset(); } else { resetVoiceRefs(); }
      setFinishing(false);
      setListening(false);
    };
    rec.onerror = (e: any) => { if (e && (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture")) { listeningRef.current = false; finishingRef.current = false; setFinishing(false); setListening(false); } };
    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    triggerSpin();
    try { rec.start(); } catch {}
  };
  const finishMic = () => {
    if (!listeningRef.current || finishingRef.current) return;
    listeningRef.current = false;
    finishingRef.current = true;
    setFinishing(true);
    try { recRef.current?.stop(); } catch { finishingRef.current = false; setFinishing(false); setListening(false); commitAndReset(); return; }
    finishTimeoutRef.current = setTimeout(() => {
      if (finishingRef.current) { finishingRef.current = false; setFinishing(false); setListening(false); commitAndReset(); }
    }, 2500);
  };
  const cancelMic = () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    finishingRef.current = false;
    try { recRef.current?.stop(); } catch {}
    resetVoiceRefs();
    setFinishing(false);
    setListening(false);
  };
  const toggleMic = () => { if (listeningRef.current) finishMic(); else startMic(); };
  const toggleUpload = (e: any) => { e.preventDefault(); e.stopPropagation(); setModelMenuOpen(false); triggerSpin(); setMenuOpen((p) => !p); };
  const pick = async (files: FileList | null) => { if (!files) return; const parsed = await Promise.all(Array.from(files).map(readFileAsAttachment)); setAttachments((p) => [...p, ...parsed.filter((x): x is PendingAttachment => x !== null)]); };
  const hasText = inputValue.trim().length > 0;
  const showStop = isSending;
  const showMic = listening || (!showStop && !hasText);
  const dropBar = () => {
    const w = wrapRef.current;
    if (!w) return;
    forceDownRef.current = true;
    offsetRef.current = 0;
    w.style.setProperty("transition", "bottom .3s cubic-bezier(.22,.61,.36,1)", "important");
    w.style.bottom = "0px";
  };
  const cancelPendingDrop = () => {
    if (pendingDropRef.current) { window.removeEventListener("quix-msg-scroll-done", pendingDropRef.current); pendingDropRef.current = null; }
    if (dropTimeoutRef.current) { clearTimeout(dropTimeoutRef.current); dropTimeoutRef.current = null; }
  };
  const finishDrop = () => { cancelPendingDrop(); if (taRef.current) taRef.current.blur(); dropBar(); };
  const pickModel = (id: string) => { if (isGuest && id !== "thinking") { setModelMenuOpen(false); useUIStore.getState().openAuth(); return; } setActiveModel(id); setModelMenuOpen(false); taRef.current?.blur(); };
  const send = () => {
    const text = inputValue.trim();
    if (!text) return;
    stopMic();
    if (attachments.length === 0 && !text) return;
    onSend?.(text, attachments);
    setInputValue("");
    setAttachments([]);
    if (taRef.current) taRef.current.style.height = "40px";
    const kbOpen = offsetRef.current > 0;
    if (!kbOpen) { finishDrop(); return; }
    const listener = () => finishDrop();
    pendingDropRef.current = listener;
    window.addEventListener("quix-msg-scroll-done", listener);
    dropTimeoutRef.current = setTimeout(finishDrop, 400);
  };
  const typeTemplate = (p: string) => {
    setInputValue(p);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.style.height = "40px";
        ta.style.height = Math.min(ta.scrollHeight, 250) + "px";
        ta.focus();
      }
    });
  };
  const stop = () => { abortGemini(); window.dispatchEvent(new Event("quix-stop")); useChatStore.getState().setIsSending(false); };
  const mainAction = () => { if (showStop) return stop(); if (finishing) return; if (listening) return finishMic(); if (hasText) return send(); return toggleMic(); };
  const sendIconKey = showStop ? "stop" : finishing ? "finishing" : listening ? "confirm" : showMic ? "mic" : "arrow";

  const emptyStateCSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
.empty-bg{position:absolute;left:0;right:0;top:-64px;bottom:0;background-color:#050508;background-image:radial-gradient(circle at 0% 0%,rgba(255,255,255,.08) 0%,rgba(255,255,255,.03) 25%,transparent 50%),radial-gradient(circle at 100% 100%,rgba(255,255,255,.08) 0%,rgba(255,255,255,.03) 25%,transparent 50%);background-attachment:fixed;pointer-events:none;z-index:0}
.input-wrapper.empty-state{display:flex !important;flex-direction:column !important;align-items:center !important;background:none !important;padding:0 16px 12px 16px !important}
.input-wrapper.kb-open{padding-bottom:0 !important}
.input-wrapper.kb-open .empty-templates{display:none}
.empty-word{position:relative;font-family:'Syne',sans-serif;font-size:clamp(4rem,21vw,11rem);font-weight:800;line-height:1;letter-spacing:.05em;color:#fff;user-select:none;-webkit-user-select:none;white-space:nowrap;margin:0 0 22px;animation:gBase 2.6s infinite}
.empty-word .letter{display:inline-block}
.empty-word::before,.empty-word::after{content:attr(data-text);position:absolute;left:0;top:0;width:100%;opacity:0;pointer-events:none;color:#fff}
.empty-word::before{animation:gA 2.6s infinite steps(1,end)}
.empty-word::after{color:#666;animation:gB 2.6s infinite steps(1,end)}
@keyframes gBase{0%,85%,96%,100%{transform:none}86%{transform:translate(-5px,1px) skewX(3deg)}89%{transform:translate(4px,-2px)}92%{transform:translate(-3px,0) skewX(-4deg)}}
@keyframes gA{0%,84%,96%,100%{opacity:0}85%{opacity:.9;clip-path:inset(6% 0 64% 0);transform:translate(-8px,-3px)}88%{opacity:.9;clip-path:inset(52% 0 12% 0);transform:translate(7px,2px)}91%{opacity:.9;clip-path:inset(28% 0 42% 0);transform:translate(-6px,1px)}94%{opacity:.9;clip-path:inset(72% 0 4% 0);transform:translate(5px,-2px)}}
@keyframes gB{0%,84%,96%,100%{opacity:0}86%{opacity:.7;clip-path:inset(60% 0 8% 0);transform:translate(8px,3px)}89%{opacity:.7;clip-path:inset(10% 0 66% 0);transform:translate(-7px,-2px)}92%{opacity:.7;clip-path:inset(38% 0 30% 0);transform:translate(6px,-1px)}95%{opacity:.7;clip-path:inset(4% 0 78% 0);transform:translate(-5px,2px)}}
.empty-templates{width:100%;max-width:650px;margin:14px auto 0;display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.tpl-chip{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:10px 12px;font-size:12.5px;font-family:inherit;color:rgba(255,255,255,.92);cursor:pointer;white-space:nowrap;transition:background .15s ease,border-color .15s ease}
.tpl-chip:active{background:rgba(255,255,255,.14)}
@media (hover:hover){.tpl-chip:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25)}}
.empty-footer{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:12px;padding:0 16px calc(16px + env(safe-area-inset-bottom,0px));z-index:5;pointer-events:none;transition:opacity .2s ease}
.empty-footer.kb-hidden{opacity:0}
.footer-brand{font-family:'Syne',sans-serif;font-weight:700;font-size:14px;letter-spacing:.08em;color:rgba(255,255,255,.6);pointer-events:auto;user-select:none}
.footer-socials{display:flex;align-items:center;gap:18px;pointer-events:auto}
.footer-socials a{color:rgba(255,255,255,.45);display:flex;align-items:center;justify-content:center;transition:color .15s ease}
.footer-socials a:hover,.footer-socials a:active{color:rgba(255,255,255,.9)}
`;

  return (
    <>
      <style>{ibCSS}</style>
      <style>{ibFastCSS}</style>
      <style>{emptyStateCSS}</style>
      <input type="file" ref={fileRef} multiple style={{ display: "none" }} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input type="file" ref={imgRef} accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {messages.length === 0 && <div className="empty-bg" />}
      {messages.length === 0 && (
        <div className="empty-footer" ref={footerRef}>
          <div className="footer-brand">Verve</div>
          <div className="footer-socials">
            <a href="https://discord.gg/6D2EKEYfC3" target="_blank" rel="noopener noreferrer" aria-label="Discord"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.369a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037 19.736 19.736 0 00-4.885 1.515.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.099.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg></a>
            <a href="https://www.instagram.com/quixai3?igsi=NTdjem9zOXc4Mjli" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg></a>
            <a href="https://www.reddit.com/u/Quix-AI/s/1MYhtTvmt8" target="_blank" rel="noopener noreferrer" aria-label="Reddit"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="14.5" r="6" /><circle cx="9.7" cy="13.5" r="0.9" fill="currentColor" stroke="none" /><circle cx="14.3" cy="13.5" r="0.9" fill="currentColor" stroke="none" /><path d="M9.7 16.6c1.4.9 3.2.9 4.6 0" /><path d="M12 8.5l.9-3.2 2.8.8" /><circle cx="16.3" cy="6.3" r="1.1" /><circle cx="5.2" cy="13" r="1.5" /><circle cx="18.8" cy="13" r="1.5" /></svg></a>
            <a href="https://x.com/QuixAI3" target="_blank" rel="noopener noreferrer" aria-label="X"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" /></svg></a>
            <a href="mailto:verveofficial@atomicmail.io" aria-label="Email"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg></a>
          </div>
        </div>
      )}
      <div className={`input-wrapper ${messages.length === 0 ? "empty-state" : ""}`} ref={wrapRef} style={{ bottom: messages.length === 0 ? "calc(50vh - 180px)" : 0 }}>
        {messages.length === 0 && (
          <div className="empty-word" data-text="QUIX" ref={wordRef}>
            <span className="letter">Q</span><span className="letter">U</span><span className="letter">I</span><span className="letter">X</span>
          </div>
        )}
        <div className={`input-bar ${listening ? "listening" : ""}`}>
          {!isDeepThink && attachments.length > 0 && (<div className="attach-row">{attachments.map((a) => (<div className="attach-chip" key={a.id}>{a.kind === "image" && a.previewUrl ? <img className="attach-thumb" src={a.previewUrl} alt={a.name} /> : null}<span>{a.name}</span><button className="attach-remove" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>×</button></div>))}</div>)}
          {listening ? (
            <div className="voice-wave" aria-hidden="true">
              {Array.from({ length: WAVE_BARS }).map((_, i) => (<span key={i} style={{ animationDelay: `${(i % 8) * 0.09}s` }} />))}
            </div>
          ) : (
            <textarea ref={taRef} placeholder={isDeepThink ? "Ask DeepThink to research..." : "Ask Quix..."} rows={1} value={inputValue} onFocus={() => { cancelPendingDrop(); forceDownRef.current = false; if (wrapRef.current) wrapRef.current.style.removeProperty("transition"); }} onChange={(e) => { setInputValue(e.target.value); if (taRef.current) { taRef.current.style.height = "40px"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 250) + "px"; } }} />
          )}
          <div className="action-row">
            <div className="action-left">
              {!isDeepThink && (
                <div style={{ position: "relative" }}>
                  <button type="button" className={`plus-btn ${spinClass}`} onClick={listening ? cancelMic : toggleUpload} onMouseDown={prevent} onTouchStart={prevent} disabled={finishing} aria-label={listening ? "Cancel voice input" : "Upload options"}>
                    <span className="morph-icon" key={listening ? "cancel" : "plus"}>
                      {listening ? (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>) : (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>)}
                    </span>
                  </button>
                  <div className={`pop-menu ${menuOpen ? "show" : ""}`} style={{ width: 180 }}>
                    <div className="upload-opt" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); fileRef.current?.click(); }} onMouseDown={prevent}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>Upload file</div>
                    <div className="upload-opt" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); imgRef.current?.click(); }} onMouseDown={prevent}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>Upload image</div>
                    <div className={`upload-opt ${canvasOn ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); setCanvasOn(!canvasOn); setMenuOpen(false); }} onMouseDown={prevent}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>Canvas{canvasOn && (<span className="cv-cross" onClick={(e) => { e.stopPropagation(); setCanvasOn(false); setMenuOpen(false); }}>×</span>)}</div>
                  </div>
                </div>
              )}
              {!listening && (
                <div style={{ position: "relative" }}>
                  <button type="button" className={`model-btn ${modelMenuOpen ? "open" : ""}`} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setModelMenuOpen((p) => !p); taRef.current?.blur(); }} onMouseDown={prevent} onTouchStart={prevent}>
                    <span>{MODELS[activeModel]?.name ?? "Quix 3 Flash"}</span>
                    <span className="mchev"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                  </button>
                  <div className={`pop-menu ${modelMenuOpen ? "show" : ""}`}>
                    {CHAT_MODELS.map((id) => {
                      const locked = isGuest && id !== "thinking";
                      return (
                        <div key={id} className={`model-item ${locked ? "locked" : ""}`} onClick={(e) => { e.stopPropagation(); if (locked) return; pickModel(id); }}>
                          {activeModel === id && !locked ? (<svg viewBox="0 0 24 24" fill="none" className="model-check" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>) : locked ? (<span dangerouslySetInnerHTML={{ __html: lockSvg }} />) : (<div style={{ width: 15, flexShrink: 0 }} />)}
                          <div className="model-item-content">
                            <span className="model-title">{MODELS[id].name}{id === "deepthink" && <span className="beta-tag"> Beta</span>}{locked && <span style={{ color: "#ff8080", fontSize: 10, marginLeft: 4 }}>Sign in</span>}</span>
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
              {canvasOn && !isDeepThink && !listening && (<button type="button" className="cv-pill" onClick={() => openFilesList()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>Canvas{fileCount > 0 ? ` · ${fileCount}` : ""}</button>)}
              <button type="button" className={`send-btn ${showStop ? "stop" : ""} ${finishing ? "finishing" : ""} ${showMic ? (listening ? "mic listening" : "mic") : ""}`} onClick={mainAction} disabled={finishing} aria-label={showStop ? "Stop" : finishing ? "Finishing up" : listening ? "Confirm voice input" : hasText ? "Send" : "Voice input"}>
                <span className="morph-icon" key={sendIconKey}>
                  {showStop ? (<svg width="15" height="15" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>) : finishing ? (<svg width="16" height="16" viewBox="0 0 24 24" className="spin-loader"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="42 100" /></svg>) : listening ? (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>) : showMic ? (<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="10" width="2.6" height="4" rx="1.3" /><rect x="9.2" y="6" width="2.6" height="12" rx="1.3" /><rect x="14.4" y="8" width="2.6" height="8" rx="1.3" /><rect x="19.6" y="10.5" width="2.6" height="3" rx="1.3" /></svg>) : (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>)}
                </span>
              </button>
            </div>
          </div>
        </div>
        {messages.length === 0 && (
          <div className="empty-templates">
            {EMPTY_TEMPLATES.map((t) => (<button type="button" className="tpl-chip" key={t.label} onClick={() => typeTemplate(t.prompt)}>{t.label}</button>))}
          </div>
        )}
      </div>
    </>
  );
}