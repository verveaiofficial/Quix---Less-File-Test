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
  const listeningRef = useRef(false);
  const sessionTextRef = useRef("");
  const interimTailRef = useRef("");
  const committedRef = useRef<string[]>([]);
  const spinDir = useRef(1);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<any>(null);
  const fileCount = extractFiles(messages).length;
  const session = useAuthStore((s) => s.session);
  const isGuest = !session;

  useEffect(() => { const g = () => { setMenuOpen(false); setModelMenuOpen(false); }; document.addEventListener("click", g); return () => document.removeEventListener("click", g); }, []);
  useEffect(() => { const r = () => { if (window.visualViewport) { const kb = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop; setBottomOffset(Math.max(0, kb)); } }; if (window.visualViewport) window.visualViewport.addEventListener("resize", r); return () => { if (window.visualViewport) window.visualViewport.removeEventListener("resize", r); }; }, []);
  useEffect(() => { return () => { listeningRef.current = false; try { recRef.current?.stop(); } catch {} }; }, []);

  const prevent = (e: any) => e.preventDefault();
  const stopMic = () => { listeningRef.current = false; setListening(false); try { recRef.current?.stop(); } catch {} };
  const startMic = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    sessionTextRef.current = "";
    interimTailRef.current = "";
    committedRef.current = [];
    rec.onresult = (e: any) => {
      // This engine resends the FULL cumulative sentence as a new "final"
      // result on every pause, rather than just the new delta — so we only
      // keep the most recent final entry (it already contains everything
      // said so far this session) instead of joining every final we've seen.
      let latest = "";
      let finalIdx = -1;
      for (let i = e.results.length - 1; i >= 0; i--) {
        if (e.results[i].isFinal) { latest = e.results[i][0].transcript; finalIdx = i; break; }
      }
      if (latest) sessionTextRef.current = latest.trim();
      // Anything after the last final result is still in-progress speech —
      // keep it as a tail so it isn't lost if the session ends before it
      // gets finalized (this was causing the last few words to go missing).
      let tail = "";
      for (let i = finalIdx + 1; i < e.results.length; i++) tail += e.results[i][0].transcript;
      interimTailRef.current = tail.trim();
    };
    rec.onend = () => {
      if (listeningRef.current) {
        // Session is restarting — bank this session's cumulative text
        // (plus any not-yet-finalized tail), then start a fresh session.
        const chunk = [sessionTextRef.current, interimTailRef.current].filter(Boolean).join(" ").trim();
        if (chunk) committedRef.current.push(chunk);
        sessionTextRef.current = "";
        interimTailRef.current = "";
        setTimeout(() => { if (listeningRef.current) { try { rec.start(); } catch {} } }, 120);
      } else {
        setListening(false);
      }
    };
    rec.onerror = (e: any) => { if (e && (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture")) { listeningRef.current = false; setListening(false); } };
    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    try { rec.start(); } catch {}
  };
  const finishMic = () => {
    listeningRef.current = false;
    try { recRef.current?.stop(); } catch {}
    setListening(false);
    const chunk = [sessionTextRef.current, interimTailRef.current].filter(Boolean).join(" ").trim();
    if (chunk) committedRef.current.push(chunk);
    sessionTextRef.current = "";
    interimTailRef.current = "";
    const full = committedRef.current.join(" ").trim();
    committedRef.current = [];
    if (full) setInputValue(prev => (prev ? prev + " " + full : full).trim());
  };
  const cancelMic = () => {
    listeningRef.current = false;
    try { recRef.current?.stop(); } catch {}
    setListening(false);
    sessionTextRef.current = "";
    interimTailRef.current = "";
    committedRef.current = [];
  };
  const toggleMic = () => { if (listeningRef.current) finishMic(); else startMic(); };
  const toggleUpload = (e: any) => { e.preventDefault(); e.stopPropagation(); setModelMenuOpen(false); setSpinClass(""); setTimeout(() => { const c = spinDir.current === 1 ? "spin-cw" : "spin-ccw"; setSpinClass(c); spinDir.current *= -1; }, 10); setMenuOpen((p) => !p); };
  const pick = async (files: FileList | null) => { if (!files) return; const parsed = await Promise.all(Array.from(files).map(readFileAsAttachment)); setAttachments((p) => [...p, ...parsed.filter((x): x is PendingAttachment => x !== null)]); };

  const hasText = inputValue.trim().length > 0;
  const showStop = isDeepThink ? !!dtRunning : isSending;
  const showMic = listening || (!showStop && !hasText);

  const pickModel = (id: string) => { if (isGuest && id !== "thinking") { setModelMenuOpen(false); useUIStore.getState().openAuth(); return; } setActiveModel(id); setModelMenuOpen(false); taRef.current?.blur(); };
  const send = () => { const text = inputValue.trim(); if (!text) return; stopMic(); if (isDeepThink) { onDeepThinkSend?.(text); setInputValue(""); if (taRef.current) { taRef.current.blur(); taRef.current.style.height = "40px"; } return; } if (attachments.length === 0 && !text) return; onSend?.(text, attachments); setInputValue(""); setAttachments([]); if (taRef.current) { taRef.current.blur(); taRef.current.style.height = "40px"; } };
  const stop = () => { if (isDeepThink) { onDeepThinkStop?.(); return; } abortGemini(); window.dispatchEvent(new Event("quix-stop")); useChatStore.getState().setIsSending(false); };
  const mainAction = () => { if (showStop) return stop(); if (listening) return finishMic(); if (hasText) return send(); return toggleMic(); };

  return (
    <>
      <style>{ibCSS}</style>
      <input type="file" ref={fileRef} multiple style={{ display: "none" }} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input type="file" ref={imgRef} accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <div className="input-wrapper" style={{ bottom: `${bottomOffset}px` }}>
        <div className={`input-bar ${listening ? "listening" : ""}`}>
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
                <button type="button" className={`model-btn ${modelMenuOpen ? "open" : ""}`} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setModelMenuOpen((p) => !p); taRef.current?.blur(); }} onMouseDown={prevent} onTouchStart={prevent}>
                  <span>{MODELS[activeModel]?.name ?? "Quix 3 Flash"}</span>
                  <span className="mchev"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span>
                </button>
                <div className={`pop-menu ${modelMenuOpen ? "show" : ""}`}>
                  {CHAT_MODELS.map((id) => {
                    const locked = (isGuest && id !== "thinking") || id === "deepthink";
                    return (
                      <div key={id} className={`model-item ${locked ? "locked" : ""}`} onClick={(e) => { e.stopPropagation(); if (locked) return; pickModel(id); }}>
                        {activeModel === id && !locked ? (<svg viewBox="0 0 24 24" fill="none" className="model-check" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>) : locked ? (<span dangerouslySetInnerHTML={{ __html: lockSvg }} />) : (<div style={{ width: 15, flexShrink: 0 }} />)}
                        <div className="model-item-content">
                          <span className="model-title">{MODELS[id].name}{id === "deepthink" && <span className="beta-tag"> Coming soon</span>}{locked && id !== "deepthink" && <span style={{ color: "#ff8080", fontSize: 10, marginLeft: 4 }}>Sign in</span>}</span>
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
              {listening && (<button type="button" className="mic-cancel-btn" onClick={cancelMic} aria-label="Cancel voice input"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>)}
              <button type="button" className={`send-btn ${showStop ? "stop" : ""} ${showMic ? (listening ? "mic listening" : "mic") : ""}`} onClick={mainAction} aria-label={showStop ? "Stop" : listening ? "Confirm voice input" : hasText ? "Send" : "Voice input"}>
                {showStop ? (<svg width="15" height="15" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>) : listening ? (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>) : showMic ? (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>) : (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}