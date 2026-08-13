import React, { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { MODELS, CHAT_MODELS, APP_VERSION, useAuthStore, useUIStore, useChatStore, useProfileStore, useMemoryStore, useUsageStore, supabase, fetchChats, fetchMessages, renameChat, deleteChat } from "./core";
import { useCanvasStore } from "./canvas";
import { ORB_COLORS, hdCSS, dwCSS, auCSS, stCSS, memCSS, ldCSS, dtCSS, vcCSS } from "./styles";

export const usePinStore = create<any>((set, get) => ({
  pinned: (() => { try { return JSON.parse(localStorage.getItem("quix_pinned_v1") || "[]"); } catch { return []; } })(),
  toggle: (id: string) => { if (!id) return; const cur: string[] = get().pinned; const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]; try { localStorage.setItem("quix_pinned_v1", JSON.stringify(next)); } catch {} set({ pinned: next }); },
}));
export const useImagineStore = create<any>((set) => ({ nonce: 0, bump: () => set((s: any) => ({ nonce: s.nonce + 1 })) }));

export function shimmer(e: any) { const el = e.currentTarget as HTMLElement; el.classList.remove("shimmer"); void el.offsetWidth; el.classList.add("shimmer"); setTimeout(() => el.classList.remove("shimmer"), 500); }
export function shimmerThen(e: any, fn: () => void) { shimmer(e); setTimeout(fn, 450); }

function timeAgo(d: string): string { const diff = Math.max(0, Date.now() - new Date(d).getTime()); const m = Math.floor(diff / 60000); if (m < 1) return "Just now"; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; }

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
  const { session, signOut } = useAuthStore();
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
            {session ? (sorted.length > 0 ? (<div>{sorted.map((c) => (<div className={`hist-item ${c.id === currentChatId ? "current" : ""}`} key={c.id} onClick={async () => { const msgs = await fetchMessages(c.id); loadMessages(msgs); setCurrentChat(c.id, c.title); setDrawerOpen(false); }}><div className="hist-main"><div className="hist-title">{c.title}</div><div className="hist-time">{c.updated_at ? timeAgo(c.updated_at) : ""}</div></div>{pinned.includes(c.id) && (<span className="hist-pin"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 3h6l1 7 2 2H6l2-2z" /></svg></span>)}</div>))}</div>) : (<div className="hist-empty">{query ? "No chats match your search." : "No chats yet. Your conversations will appear here once you start talking."}</div>)) : (<div className="hist-empty">Sign in to save your chats.</div>)}
          </div>
          <div className="drawer-footer">
            {session ? (<div className="user-row"><span className="user-email">{session.user.email || "Signed in"}</span><button className="signout-btn" onClick={(e) => shimmerThen(e, async () => { await signOut(); resetChat(); })}>Sign out</button></div>) : (<button className="signin-btn shimmer-btn" onClick={(e) => shimmerThen(e, () => { setDrawerOpen(false); setTimeout(() => openAuthFromDrawer(), 150); })}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>Sign in</button>)}
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

export function AuthScreen() {
  const { authOpen, closeAuth } = useUIStore();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(""); const [notice, setNotice] = useState(""); const [loading, setLoading] = useState(false);
  useEffect(() => { if (!authOpen) { setName(""); setEmail(""); setPass(""); setConfirm(""); setErr(""); setNotice(""); setLoading(false); } }, [authOpen]);
  const submit = async () => {
    if (loading) return;
    const sb = supabase(); if (!sb) { setErr("Auth not configured. Add Supabase env keys."); return; }
    setErr(""); setNotice(""); setLoading(true);
    try {
      if (tab === "signup" && pass !== confirm) { setErr("Passwords don't match."); setLoading(false); return; }
      if (tab === "signin") { const { error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) setErr(error.message); else closeAuth(); }
      else { const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name } } }); if (error) setErr(error.message); else if (!data?.session) { setNotice("Account created. Check your email and tap the confirmation link, then come back and sign in."); setTab("signin"); setPass(""); setConfirm(""); } else closeAuth(); }
    } catch { setErr("Something went wrong."); }
    setLoading(false);
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
            <input className="auth-field" type="email" placeholder="Email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="auth-field" type="password" placeholder="Password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {err && <div className="auth-err">{err}</div>}
            <button className={`auth-submit ${loading ? "shimmer-loading" : ""}`} onClick={submit} disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
            <div className="auth-switch">Don't have an account? <span onClick={() => setTab("signup")}>Sign up</span></div>
          </div>
        ) : (
          <div className="auth-form">
            <input className="auth-field" type="text" placeholder="Full name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="auth-field" type="email" placeholder="Email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="auth-field" type="password" placeholder="Password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
            <input className="auth-field" type="password" placeholder="Confirm password" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
            {err && <div className="auth-err">{err}</div>}
            <button className={`auth-submit ${loading ? "shimmer-loading" : ""}`} onClick={submit} disabled={loading}>{loading ? "Creating account..." : "Create account"}</button>
            <div className="auth-switch">Already have an account? <span onClick={() => setTab("signin")}>Sign in</span></div>
          </div>
        )}
      </div>
    </>
  );
}

export function SettingsPage() {
  const { settingsOpen, closeSettings, fontScale, setFontScale, openMemories } = useUIStore();
  const { profile, setProfile } = useProfileStore();
  const { session, signOut } = useAuthStore();
  const { resetChat } = useChatStore();
  const usage = useUsageStore((s) => s.usage);
  const limitFor = useUsageStore((s) => s.limitFor);
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = session?.user?.id ?? null;
  useEffect(() => { if (session?.user?.email && !profile.email) setProfile({ email: session.user.email }); const meta = session?.user?.user_metadata as any; if (meta?.full_name && !profile.name) setProfile({ name: meta.full_name }); }, [session]);
  return (
    <>
      <style>{stCSS}</style>
      <div id="settings-screen" className={settingsOpen ? "show" : ""}>
        <div className="set-header"><button className="set-back" onClick={closeSettings} aria-label="Back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button><div className="set-title">Profile & Settings</div></div>
        <div className="set-body">
          <div className="avatar-wrap">
            <button className="avatar" onClick={() => fileRef.current?.click()}>
              {profile.avatar ? (<img src={profile.avatar} alt="profile" />) : (<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>)}
            </button>
            <input type="file" accept="image/*" ref={fileRef} style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f || f.size > 1.5 * 1024 * 1024) return; const img = new Image(); const url = URL.createObjectURL(f); img.onload = () => { const c = document.createElement("canvas"); const s = Math.min(256, img.width, img.height); c.width = s; c.height = s; const ctx = c.getContext("2d"); ctx?.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, s, s); setProfile({ avatar: c.toDataURL("image/jpeg", 0.8) }); URL.revokeObjectURL(url); }; img.src = url; }} />
          </div>
          <div className="set-section">
            <div className="set-label">Profile</div>
            <input className="set-field" type="text" placeholder="Name" autoComplete="off" value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} />
            <input className="set-field" type="text" placeholder="Username" autoComplete="off" value={profile.username} onChange={(e) => setProfile({ username: e.target.value })} />
            <input className="set-field" type="email" placeholder="Email" autoComplete="off" value={profile.email} onChange={(e) => setProfile({ email: e.target.value })} />
          </div>
          <div className="set-section">
            <div className="set-label">Daily message limits</div>
            {CHAT_MODELS.map((m) => { const lim = limitFor(m); const rem = Math.max(0, lim - (usage[m] ?? 0)); return (<div className="limit-row" key={m}><div className="limit-top"><span>{MODELS[m].name}</span><span>{lim === 0 ? "Sign in required" : `${rem}/${lim} left`}</span></div><div className="limit-bar"><div className="limit-fill" style={{ width: lim === 0 ? 0 : `${(rem / lim) * 100}%` }} /></div></div>); })}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.3)" }}>Limits reset at midnight UTC.</div>
          </div>
          {uid && (
            <div className="set-section">
              <div className="set-label">Memory</div>
                            <button className="mem-btn" onClick={() => { closeSettings(); setTimeout(() => openMemories(), 200); }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></svg>
                  <span>Memories</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
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

export function MemoriesPage() {
  const { memoriesOpen, closeMemories } = useUIStore();
  const { session } = useAuthStore();
  const { memories, loadFor, addMemory, removeMemory } = useMemoryStore();
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const uid = session?.user?.id ?? null;
  useEffect(() => { if (uid && memoriesOpen) loadFor(uid); }, [uid, memoriesOpen, loadFor]);
  const handleAdd = async () => {
    if (!input.trim() || !uid || adding) return;
    setAdding(true);
    await addMemory(uid, input.trim());
    setInput("");
    setAdding(false);
  };
  return (
    <>
      <style>{memCSS}</style>
      <div id="memories-screen" className={memoriesOpen ? "show" : ""}>
        <div className="mem-header">
          <button className="mem-back" onClick={closeMemories} aria-label="Back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg></button>
          <div className="mem-title">Memories</div>
        </div>
        <div className="mem-body">
          <div className="mem-input-row">
            <input className="mem-input" type="text" placeholder="Teach Quix something about you..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} autoComplete="off" />
            <button className="mem-add" onClick={handleAdd} disabled={adding || !input.trim()}>{adding ? "..." : "+"}</button>
          </div>
          <div className="mem-list">
            {memories.length === 0 ? (<div className="mem-empty">No memories yet. Quix also writes automatic memories from your last 24h of chats at every midnight UTC.</div>) : (memories.map((m: any) => (<div className="mem-item" key={m.id}><div style={{ flex: 1 }}><div>{m.text}</div></div><button onClick={() => uid && removeMemory(uid, m.id)}>×</button></div>)))}
          </div>
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