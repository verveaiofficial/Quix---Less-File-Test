import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SourceItem } from "./core";
import { ORB_COLORS, qtsCSS, searchIconSvg } from "./styles";

function domainOf(uri: string): string { try { return new URL(uri).hostname.replace(/^www\./, ""); } catch { return ""; } }
function faviconUrl(uri: string): string | null { try { return "https://www.google.com/s2/favicons?domain=" + new URL(uri).hostname + "&sz=32"; } catch { return null; } }

const srCSS = `.src-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);z-index:40;opacity:0;pointer-events:none;transition:opacity .35s ease}.src-overlay.open{opacity:1;pointer-events:all}.src-drawer{position:fixed;top:0;left:0;height:100vh;height:100dvh;width:280px;background:rgba(20,20,24,.98);border-right:1px solid rgba(255,255,255,.12);box-shadow:8px 0 32px rgba(0,0,0,.45);z-index:50;display:flex;flex-direction:column;transform:translate3d(-100%,0,0);transition:transform .35s cubic-bezier(.25,.46,.45,.94);will-change:transform}.src-drawer.open{transform:translate3d(0,0,0)}.src-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 12px;font-family:'Syne',sans-serif;font-weight:700;font-size:14px;letter-spacing:.1em;color:#fff;text-transform:uppercase;flex-shrink:0}.src-head button{background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;padding:6px;display:flex}.src-list{flex:1;min-height:0;overflow-y:auto;padding:0 10px 20px;display:flex;flex-direction:column;gap:2px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}.src-list::-webkit-scrollbar{width:0}.src-item{display:flex;flex-direction:column;gap:6px;padding:12px 10px;border-radius:12px;text-decoration:none}.src-item:hover{background:rgba(255,255,255,.06)}.src-title{color:rgba(255,255,255,.92);font-size:13.5px;line-height:1.45;font-weight:500}.src-desc{color:rgba(255,255,255,.55);font-size:12.5px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.src-domain{display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.6);font-size:12px}.src-domain img{width:16px;height:16px;border-radius:50%;flex-shrink:0;background:#1c1c22}.qts-sources{display:flex;align-items:center;gap:10px;margin:6px 0 0 0;cursor:pointer;padding:4px 0;border-radius:8px}.qts-sources:active{opacity:.7}.qts-sources-label{font-size:15px;color:rgba(255,255,255,.6)}.qts-sources .qts-favstack img{width:20px;height:20px;margin-left:-6px}.qts-sources .qts-favstack img:first-child{margin-left:0}body.src-open #open-btn{opacity:0;pointer-events:none;transition:opacity .2s ease}`;

function fmtThink(sec: number): string { return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`; }

function OrbDimmed({ dimmed }: { dimmed: boolean }) { const ref = useRef<HTMLCanvasElement>(null); useEffect(() => { const canvas = ref.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return; const W = 26, H = 26, R = 13, cx = R, cy = R; const blobs = ORB_COLORS.map((color, i) => ({ fx: 0.71 + i * 0.09, fy: 1.13 - i * 0.05, phase: i * 0.9, amp: 0.5, r: R * 0.75, color })); let t = 0, last = performance.now(), id = 0; const draw = (now: number) => { const dt = now - last; last = now; const s = (Math.sin(((now % 5000) / 5000) * Math.PI * 2 - Math.PI / 2) + 1) / 2; t += (0.12 + (2.2 - 0.12) * s) * dt * 0.001; ctx.clearRect(0, 0, W, H); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip(); const bg = ctx.createRadialGradient(cx * 0.84, cy * 0.76, 1, cx, cy, R); bg.addColorStop(0, "#1a1a2e"); bg.addColorStop(0.3, "#0f1f3d"); bg.addColorStop(0.55, "#2a1b4d"); bg.addColorStop(0.8, "#3d1f4d"); bg.addColorStop(1, "#0f2a3d"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = "screen"; blobs.forEach((b) => { const bx = cx + Math.sin(b.fx * t + b.phase) * R * b.amp; const by = cy + Math.cos(b.fy * t + b.phase * 1.4) * R * b.amp; const br = b.r * (1 + 0.08 * Math.sin(b.fx * t * 2.3 + b.phase)); const g = ctx.createRadialGradient(bx, by, 0, bx, by, br); g.addColorStop(0, b.color + "cc"); g.addColorStop(0.35, b.color + "88"); g.addColorStop(0.7, b.color + "33"); g.addColorStop(1, b.color + "00"); ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); }); ctx.restore(); id = requestAnimationFrame(draw); }; id = requestAnimationFrame(draw); return () => cancelAnimationFrame(id); }, []); return (<canvas ref={ref} width={26} height={26} style={{ borderRadius: "50%", display: "block", flexShrink: 0, opacity: dimmed ? 0.35 : 1, filter: dimmed ? "grayscale(100%)" : "none", transition: "opacity .5s ease, filter .5s ease" }} />); }

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

// thoughts render LIVE as they stream from the model (no fake typewriter).
// `done` = model left the thinking phase; `finished` = whole message complete (collapse then).
export function ThinkingStatus({ done, finished, sources, thoughts, thinkTime }: { done: boolean; finished?: boolean; sources?: SourceItem[]; thoughts?: string; thinkTime?: number }) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  useEffect(() => { if (done) return; const t = setInterval(() => setElapsed((p) => p + 1), 1000); return () => clearInterval(t); }, [done]);
  useEffect(() => { if (finished) setExpanded(false); }, [finished]);
  const finalTime = thinkTime != null ? thinkTime : elapsed;
  const thoughtParas = (thoughts || "").split(/\n+/).map((t) => t.trim()).filter(Boolean);
  const found = sources?.length ?? 0;
  const favs = (sources || []).slice(0, 6).map((s) => faviconUrl(s.uri)).filter(Boolean) as string[];
  const hasReason = thoughtParas.length > 0 || found > 0;
  return (<div className={`qts-status visible ${done ? "done" : "active"}`}><style>{qtsCSS}</style><style>{srCSS}</style><div className="qts-head"><OrbDimmed dimmed={done} /><div className="qts-title-row"><span className="qts-title">{done ? (finalTime > 0 ? `Thought for ${fmtThink(finalTime)}` : "Thought") : "Thinking"}</span>{!done && <span className="qts-meta">{fmtThink(elapsed)}</span>}{hasReason && (<button className={`qts-toggle ${expanded ? "open" : ""}`} onClick={() => setExpanded((p) => !p)}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></button>)}</div></div>{found > 0 && (<div className="qts-sources" onClick={() => setSourcesOpen(true)}><span className="qts-sources-label">Sources</span>{favs.length > 0 && <span className="qts-favstack">{favs.map((f, i) => <img key={i} src={f} alt="" />)}</span>}</div>)}{sourcesOpen && <SourcesPanel sources={sources || []} onClose={() => setSourcesOpen(false)} />}{expanded && hasReason && (<div className="qts-reason">{found > 0 && (<div className="qts-meta-row"><span className="qts-reason-icon" dangerouslySetInnerHTML={{ __html: searchIconSvg }} /><span>Found {found} web pages</span></div>)}{thoughtParas.map((t, i) => (<div className="qts-thought" key={i}><span className="qts-bullet">•</span><span>{t}</span></div>))}</div>)}</div>);
}