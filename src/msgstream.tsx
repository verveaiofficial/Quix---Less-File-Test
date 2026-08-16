import React, { useEffect, useRef } from "react";
import { SourceItem } from "./core";
import { FileCard, InlineCodeBlock } from "./canvas";
import { ORB_COLORS } from "./styles";

export function BubbleIndicator({ size = 26, dimmed = false }: { size?: number; dimmed?: boolean }) { const ref = useRef<HTMLCanvasElement>(null); useEffect(() => { const canvas = ref.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return; const W = size, H = size, R = size / 2, cx = R, cy = R; const blobs = ORB_COLORS.map((color, i) => ({ fx: 0.71 + i * 0.09, fy: 1.13 - i * 0.05, phase: i * 0.9, amp: 0.5, r: R * 0.75, color })); let t = 0, last = performance.now(), id = 0; const draw = (now: number) => { const dt = now - last; last = now; const s = (Math.sin(((now % 5000) / 5000) * Math.PI * 2 - Math.PI / 2) + 1) / 2; t += (0.12 + (2.2 - 0.12) * s) * dt * 0.001; ctx.clearRect(0, 0, W, H); ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip(); const bg = ctx.createRadialGradient(cx * 0.84, cy * 0.76, 1, cx, cy, R); bg.addColorStop(0, "#1a1a2e"); bg.addColorStop(0.3, "#0f1f3d"); bg.addColorStop(0.55, "#2a1b4d"); bg.addColorStop(0.8, "#3d1f4d"); bg.addColorStop(1, "#0f2a3d"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = "screen"; blobs.forEach((b) => { const bx = cx + Math.sin(b.fx * t + b.phase) * R * b.amp; const by = cy + Math.cos(b.fy * t + b.phase * 1.4) * R * b.amp; const br = b.r * (1 + 0.08 * Math.sin(b.fx * t * 2.3 + b.phase)); const g = ctx.createRadialGradient(bx, by, 0, bx, by, br); g.addColorStop(0, b.color + "cc"); g.addColorStop(0.35, b.color + "88"); g.addColorStop(0.7, b.color + "33"); g.addColorStop(1, b.color + "00"); ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); }); ctx.restore(); id = requestAnimationFrame(draw); }; id = requestAnimationFrame(draw); return () => cancelAnimationFrame(id); }, [size]); return (<canvas ref={ref} width={size} height={size} style={{ borderRadius: "50%", display: "block", flexShrink: 0, opacity: dimmed ? 0.35 : 1, filter: dimmed ? "grayscale(100%)" : "none", transition: "opacity .5s ease, filter .5s ease" }} />); }

export function faviconUrl(uri: string): string | null { try { return "https://www.google.com/s2/favicons?domain=" + new URL(uri).hostname + "&sz=32"; } catch { return null; } }
export function domainOf(uri: string): string { try { return new URL(uri).hostname.replace(/^www\./, ""); } catch { return ""; } }

function escapeHtml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function inlineMd(s: string) { return s.replace(/\[\[CITE\|([^|]+)\|([^\]]+)\]\]/g, '<a style="display:inline-block;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.09);color:#9ba1a6;font-size:12px;text-decoration:none;margin:0 3px;vertical-align:middle;line-height:1.4;white-space:nowrap" href="$2" target="_blank" rel="noreferrer">$1</a>').replace(/`([^`]+)`/g, '<code class="md-code">$1</code>').replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>'); }
function citeReplace(text: string, sources: SourceItem[]): string {
  if (!sources || !sources.length) return text;
  return text.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (_m, grp: string) => {
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