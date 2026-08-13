import React, { useEffect, useRef, useState } from "react";
import { MODELS, CHAT_MODELS, useAuthStore, useUIStore, useChatStore, abortGemini } from "./core";
import { useCanvasStore, extractFiles } from "./canvas";
import { ibCSS, lockSvg } from "./styles";
import { PendingAttachment, readFileAsAttachment } from "./ui";

export function ChatInputBar({ onSend, onDeepThinkSend, onDeepThinkStop, isDeepThink, dtRunning }: { onSend?: (t: string, a: PendingAttachment[]) => void; onDeepThinkSend?: (t: string) => void; onDeepThinkStop?: () => void; isDeepThink?: boolean; dtRunning?: boolean }) {
  const { activeModel, setActiveModel, isSending } = useChatStore();
  const messages = useChatStore((s) => s.messages);
  const canvasOn = useCanvasStore((s) => s.on);
  const setCanvasOn = useCanvasStore((s) => s.setOn);
  const openFilesList = useCanvasStore((s) => s.openFilesList);
  const [inputValue, setInputValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [spinClass, setSpinClass] = useState("");
  const [bottomOffset, setBottomOffset] = useState(0);
  const [listening, setListening] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const spinDir = useRef(1);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);
  const micBase = useRef("");
  const fileCount = extractFiles(messages).length;
  const session = useAuthStore((s) => s.session);
  const isGuest = !session;

  useEffect(() => { const g = () => { setMenuOpen(false); setModelMenuOpen(false); }; document.addEventListener("click", g); return () => document.removeEventListener("click", g); }, []);
  useEffect(() => { const r = () => { if (window.visualViewport) { const kb = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop; setBottomOffset(Math.max(0, kb)); } }; if (window.visualViewport) window.visualViewport.addEventListener("resize", r); return () => { if (window.visualViewport) window.visualViewport.removeEventListener("resize", r); }; }, []);

  const prevent = (e: any) => e.preventDefault();
  const toggleMic = () => { const w = window as any; const SR = w.SpeechRecognition || w.webkitSpeechRecognition; if (!SR) return; if (listening) { recRef.current?.stop(); setListening(false); return; } const rec = new SR(); rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false; micBase.current = inputValue; rec.onresult = (e: any) => { let t = ""; for (const r of e.results) t += r[0].transcript; setInputValue((micBase.current ? micBase.current + " " : "") + t); }; rec.onend = () => setListening(false); rec.onerror = () => setListening(false); recRef.current = rec; rec.start(); setListening(true); };
  const toggleUpload = (e: any) => { e.preventDefault(); e.stopPropagation(); setModelMenuOpen(false); setSpinClass(""); setTimeout(() => { const c = spinDir.current === 1 ? "spin-cw" : "spin-ccw"; setSpinClass(c); spinDir.current *= -1; }, 10); setMenuOpen((p) => !p); };
  const pick = async (files: FileList | null) => { if (!files) return; const parsed = await Promise.all(Array.from(files).map(readFileAsAttachment)); setAttachments((p) => [...p, ...parsed.filter((x): x is PendingAttachment => x !== null)]); };

  const hasText = inputValue.trim().length > 0;
  const showStop = isDeepThink ? !!dtRunning : isSending;
  const showMic = !showStop && !hasText;

  const pickModel = (id: string) => { if (isGuest && id !== "thinking") { setModelMenuOpen(false); useUIStore.getState().openAuth(); return; } setActiveModel(id); setModelMenuOpen(false); };
  const send = () => { const text = inputValue.trim(); if (!text) return; if (isDeepThink) { onDeepThinkSend?.(text); setInputValue(""); if (taRef.current) { taRef.current.blur(); taRef.current.style.height = "40px"; } return; } if (attachments.length === 0 && !text) return; onSend?.(text, attachments); setInputValue(""); setAttachments([]); if (taRef.current) { taRef.current.blur(); taRef.current.style.height = "40px"; } };
  const stop = () => { if (isDeepThink) { onDeepThinkStop?.(); return; } abortGemini(); window.dispatchEvent(new Event("quix-stop")); useChatStore.getState().setIsSending(false); };
  const mainAction = () => { if (showStop) return stop(); if (hasText) return send(); return toggleMic(); };

  return (
    <>
      <style>{ibCSS}</style>
      <input type="file" ref={fileRef} multiple style={{ display: "none" }} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input type="file" ref={imgRef} accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <div className="input-wrapper" style={{ bottom: `${bottomOffset}px` }}>
        <div className="input-bar">
          {!isDeepThink && attachments.length > 0 && (<div className="attach-row">{attachments.map((a) => (<div className="attach-chip" key={a.id}>{a.kind === "image" && a.previewUrl ? <img className="attach-thumb" src={a.previewUrl} alt={a.name} /> : null}<span>{a.name}</span><button className="attach-remove" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>×</button></div>))}</div>)}
          <textarea ref={taRef} placeholder={isDeepThink ? "Ask DeepThink..." : "Ask Quix..."} rows={1} value={inputValue} onChange={(e) => { setInputValue(e.target.value); if (taRef.current) { taRef.current.style.height = "40px"; taRef.current.style.height = Math.min(taRef.current.scrollHeight, 250) + "px"; } }} onBlur={() => { if (!menuOpen) setBottomOffset(0); }} />
          <div className="action-row">
            <div className="action-left">
              {!isDeepThink && (
                <div style={{ position: "relative" }}>
                  <button type="button" className={`plus-btn ${spinClass}`} onClick={toggleUpload} onMouseDown={prevent} onTouchStart={prevent} aria-label="Upload options"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
                  <div className={`pop-menu ${menuOpen ? "show" : ""}`} style={{ width: 180 }}>
                    <div className="upload-opt" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); fileRef.current?.click(); }} onMouseDown={prevent}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>Upload file</div>
                    <div className="upload-opt" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); imgRef.current?.click(); }} onMouseDown={prevent}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>Upload image</div>
                    <div className={`upload-opt ${canvasOn ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); setCanvasOn(!canvasOn); setMenuOpen(false); }} onMouseDown={prevent}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>Canvas{canvasOn && (<span className="cv-cross" onClick={(e) => { e.stopPropagation(); setCanvasOn(false); setMenuOpen(false); }}>×</span>)}</div>
                  </div>
                </div>
              )}
              <div style={{ position: "relative" }}>
                <button type="button" className={`model-btn ${modelMenuOpen ? "open" : ""}`} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setModelMenuOpen((p) => !p); }} onMouseDown={prevent} onTouchStart={prevent}>
                  <span>{MODELS[activeModel]?.name ?? "Quix 3 Flash"}</span>
                  <span className="mchev"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                </button>
                <div className={`pop-menu ${modelMenuOpen ? "show" : ""}`}>
                  {CHAT_MODELS.map((id) => {
                    const locked = isGuest && id !== "thinking";
                    // For DeepThink we don't show "Sign in" – only "Coming soon"
                    const showSignIn = locked && id !== "deepthink";
                    return (
                      <div key={id} className={`model-item ${locked ? "locked" : ""}`} onClick={(e) => { e.stopPropagation(); pickModel(id); }}>
                        {activeModel === id && !locked ? (<svg viewBox="0 0 24 24" fill="none" className="model-check" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>) : locked ? (<span dangerouslySetInnerHTML={{ __html: lockSvg }} />) : (<div style={{ width: 15, flexShrink: 0 }} />)}
                        <div className="model-item-content">
                          <span className="model-title">
                            {MODELS[id].name}
                            {id === "deepthink" && <span className="beta-tag">Coming soon</span>}
                            {showSignIn && <span style={{ color: "#ff8080", fontSize: 10, marginLeft: 4 }}>Sign in</span>}
                          </span>
                          <span className="model-desc">{MODELS[id].desc}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="action-right">
              {canvasOn && !isDeepThink && (<button type="button" className="cv-pill" onClick={() => openFilesList()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>Canvas{fileCount > 0 ? ` · ${fileCount}` : ""}</button>)}
              <button type="button" className={`send-btn ${showStop ? "stop" : ""} ${showMic ? (listening ? "mic listening" : "mic") : ""}`} onClick={mainAction} aria-label={showStop ? "Stop" : hasText ? "Send" : "Voice input"}>
                {showStop ? (<svg width="15" height="15" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>) : hasText ? (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>) : (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}