// ==UserScript==
// @name         Page Summary
// @description  Dia-style summary & chat panel for the current page
// @include      main
// ==/UserScript==

(() => {
  const ID = "page-summary";
  const PREF = "mod.page-summary.";
  const NS = "http://www.w3.org/1999/xhtml";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MSG = "page-summary:text";
  const MARGIN = 8;
  const MAX_CHARS = 24000;
  const DEFAULT_PROMPT = "Summarize this page into concise bullet points.";
  const SEL_MSG = "page-summary:selection";
  const SYSTEM_WEB =
    "You are a helpful, concise assistant. Write short paragraphs and markdown bullet lists, and bold only key terms. " +
    "When web search results are provided, cite them as [1], [2] right after the claims they support.";
  const SYSTEM =
    "You are a helpful assistant answering questions about a web page the user is viewing. Use the page content. " +
    "Be concise. When asked to summarize, reply in 5-8 concise markdown bullet points (bold only key terms) with no " +
    "preamble. If the page does not contain the answer, say so.";
  const CHIPS = [
    ["Summarize", ""], // empty prompt = the configurable summary instruction
    ["Key takeaways", "What are the key takeaways?"],
    ["Explain simply", "Explain this page in simple terms."],
    ["Action items", "List any action items or next steps from this page."],
  ];
  const ICONS = {
    new: "M7 3H4.5A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5V9M11.3 2.7l2 2L8 10l-2.7.7L6 8z",
    close: "M4 4l8 8M12 4l-8 8",
    send: "M8 13V3M3.5 7.5L8 3l4.5 4.5",
    split: "M2.5 3.5h11v9h-11zM8 3.5v9",
    win: "M5.5 2.5h8v8M2.5 5.5h8v8h-8z",
    stop: "M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z",
    chat: "M3 3h10a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H8.4L5.2 13.8v-2.6H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
    search: "M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.8 10.8l3.4 3.4",
    globe: "M8 14.2a6.2 6.2 0 1 0 0-12.4 6.2 6.2 0 0 0 0 12.4zM1.8 8h12.4M8 1.8c2.2 2.2 2.2 10.4 0 12.4M8 1.8c-2.2 2.2-2.2 10.4 0 12.4",
  };

  // ---------- styles (embedded so script and CSS always match) ----------
  const CSS = `
#pgs-panel {
  --pgs-fg: var(--toolbar-color, CanvasText);
  --pgs-bg: var(--arrowpanel-background, var(--toolbar-bgcolor, Canvas));
  --pgs-line: color-mix(in srgb, var(--pgs-fg) 11%, transparent);
  --pgs-soft: color-mix(in srgb, var(--pgs-fg) 7%, transparent);
  --pgs-accent: var(--zen-primary-color, #6c8cff);
  --pgs-ease: cubic-bezier(0.16, 1, 0.3, 1);
  position: fixed;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--pgs-fg);
  font: 14px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
  background: color-mix(in srgb, var(--pgs-bg) 94%, transparent);
  backdrop-filter: blur(30px) saturate(1.5);
  border: 1px solid var(--pgs-line);
  border-radius: 22px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35), 0 2px 10px rgba(0, 0, 0, 0.2);
  transform-origin: top right;
  transition: opacity 0.22s ease, transform 0.32s var(--pgs-ease), visibility 0s;
  animation: pgs-in 0.34s var(--pgs-ease);
}
/* hidden = the tab this panel belongs to isn't selected (kept alive, not re-animated) */
#pgs-panel[hidden] {
  display: flex;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px) scale(0.975);
  transition: opacity 0.14s ease, transform 0.14s ease, visibility 0s linear 0.14s;
}
#pgs-panel.pgs-out { animation: pgs-out 0.16s ease-in forwards; pointer-events: none; }
@keyframes pgs-in {
  from { opacity: 0; transform: translateY(-12px) scale(0.955); }
  to   { opacity: 1; transform: none; }
}
@keyframes pgs-out { to { opacity: 0; transform: translateY(-8px) scale(0.97); } }

#pgs-panel .pgs-svg {
  width: 16px; height: 16px; fill: none; stroke: currentColor;
  stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;
}

/* shared press / hover feel */
#pgs-panel .pgs-icon, #pgs-panel .pgs-chip,
#pgs-panel .pgs-mini, #pgs-panel .pgs-send {
  transition: background-color 0.15s ease, opacity 0.15s ease, transform 0.15s var(--pgs-ease);
}
#pgs-panel .pgs-icon:active, #pgs-panel .pgs-chip:active,
#pgs-panel .pgs-mini:active, #pgs-panel .pgs-send:active { transform: scale(0.92); }

/* header */
#pgs-panel .pgs-head {
  display: flex; align-items: center; justify-content: space-between; flex: none;
  padding: 12px 12px 4px;
  cursor: grab; user-select: none;
}
#pgs-panel.pgs-dragging { transition: none; box-shadow: 0 32px 70px rgba(0, 0, 0, 0.42), 0 2px 10px rgba(0, 0, 0, 0.2); }
#pgs-panel.pgs-dragging .pgs-head { cursor: grabbing; }
#pgs-panel .pgs-head button { cursor: pointer; }
#pgs-panel .pgs-icon {
  appearance: none; background: transparent; color: inherit; border: none; cursor: pointer;
  width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; opacity: 0.6;
}
#pgs-panel .pgs-icon:hover { opacity: 1; background: var(--pgs-soft); }
#pgs-panel .pgs-icon:hover .pgs-new { transform: rotate(-8deg); }
#pgs-panel .pgs-icon .pgs-svg { transition: transform 0.25s var(--pgs-ease); }

/* conversation */
#pgs-panel .pgs-log {
  flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scroll-behavior: auto;
  display: flex; flex-direction: column; gap: 16px; padding: 14px 20px 10px;
}
#pgs-panel .pgs-msg { animation: pgs-msg 0.4s var(--pgs-ease) both; }
#pgs-panel .pgs-card { animation-delay: 0.04s; }
#pgs-panel .pgs-card + .pgs-ug { animation-delay: 0.14s; }
#pgs-panel .pgs-card + .pgs-ug + * { animation-delay: 0.26s; }
@keyframes pgs-msg {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
#pgs-panel .pgs-msg p { margin: 0 0 8px; }
#pgs-panel .pgs-msg ul, #pgs-panel .pgs-msg ol { margin: 0 0 6px; padding-inline-start: 22px; }
#pgs-panel .pgs-msg li { margin: 0 0 8px; padding-inline-start: 2px; }
#pgs-panel .pgs-msg li::marker { color: color-mix(in srgb, var(--pgs-fg) 45%, transparent); }

#pgs-panel .pgs-ug {
  align-self: flex-end; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
  max-width: 88%; transform-origin: bottom right;
}
#pgs-panel .pgs-ubub {
  padding: 8px 16px; border-radius: 20px 20px 6px 20px; white-space: pre-wrap;
  background: color-mix(in srgb, var(--pgs-fg) 12%, transparent);
}

/* selected-text reference cards (composer + sent messages) */
#pgs-panel .pgs-refs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: -2px 0 2px; }
#pgs-panel .pgs-refs[hidden] { display: none; }
#pgs-panel .pgs-ref {
  position: relative; flex: none; display: flex; align-items: center; gap: 10px; max-width: 220px;
  padding: 6px 28px 6px 6px; border-radius: 14px; background: color-mix(in srgb, var(--pgs-fg) 9%, transparent);
  animation: pgs-msg 0.35s var(--pgs-ease) both;
}
#pgs-panel .pgs-ug .pgs-ref { padding-right: 14px; max-width: 280px; }
#pgs-panel .pgs-ref-ico {
  flex: none; width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
  background: color-mix(in srgb, #000 35%, transparent); color: #fff; font: 700 22px/1 Georgia, serif; padding-top: 6px; box-sizing: border-box;
}
#pgs-panel .pgs-ref-meta { min-width: 0; }
#pgs-panel .pgs-ref-kind { font-size: 11.5px; opacity: 0.5; line-height: 1.3; }
#pgs-panel .pgs-ref-text { font-size: 12.5px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#pgs-panel .pgs-ref-x {
  position: absolute; top: 5px; right: 5px; width: 18px; height: 18px; border-radius: 50%; border: none;
  background: transparent; color: inherit; font-size: 9px; cursor: pointer; opacity: 0; transition: opacity 0.15s ease;
}
#pgs-panel .pgs-ref:hover .pgs-ref-x { opacity: 0.7; }
#pgs-panel .pgs-ref-x:hover { opacity: 1; background: color-mix(in srgb, var(--pgs-fg) 14%, transparent); }

/* Dia-style page card */
#pgs-panel .pgs-card {
  align-self: flex-end; display: flex; align-items: center; gap: 12px; max-width: 78%;
  padding: 8px 18px 8px 8px; border-radius: 18px; background: var(--pgs-soft); transform-origin: bottom right;
}
#pgs-panel .pgs-card-ico {
  flex: none; width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
  background: color-mix(in srgb, #000 38%, transparent); font-weight: 700; font-size: 16px; color: #fff;
}
#pgs-panel .pgs-card-fav { width: 24px; height: 24px; border-radius: 6px; }
#pgs-panel .pgs-card-meta { min-width: 0; }
#pgs-panel .pgs-card-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; }
#pgs-panel .pgs-card-domain { font-size: 12.5px; opacity: 0.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

#pgs-panel .pgs-status { animation: pgs-msg 0.4s var(--pgs-ease) both, pgs-pulse 1.6s ease-in-out 0.5s infinite; }
@keyframes pgs-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.75; } }
#pgs-panel .pgs-note { font-size: 12px; opacity: 0.55; margin-top: 4px; }
#pgs-panel .pgs-error { color: #ff6b6b; word-break: break-word; }
#pgs-panel .pgs-streaming .pgs-answer > ul:last-child > li:last-child::after,
#pgs-panel .pgs-streaming .pgs-answer > ol:last-child > li:last-child::after,
#pgs-panel .pgs-streaming .pgs-answer > p:last-child::after {
  content: "▍"; margin-inline-start: 2px; opacity: 0.7; animation: pgs-blink 1s steps(2) infinite;
}
@keyframes pgs-blink { 50% { opacity: 0; } }
#pgs-panel .pgs-actions { display: flex; gap: 6px; margin-top: 4px; animation: pgs-fade 0.4s ease both; }
@keyframes pgs-fade { from { opacity: 0; } to { opacity: 1; } }
#pgs-panel .pgs-mini {
  appearance: none; background: transparent; color: inherit; border: none; cursor: pointer;
  font: inherit; font-size: 12px; padding: 2px 8px; border-radius: 7px; opacity: 0.5;
}
#pgs-panel .pgs-mini:hover { opacity: 1; background: var(--pgs-soft); }

/* composer */
#pgs-panel .pgs-foot { flex: none; padding: 8px 12px 12px; animation: pgs-msg 0.45s var(--pgs-ease) both; }
#pgs-panel .pgs-foot[hidden] { display: none; }
#pgs-panel .pgs-composer {
  display: flex; flex-direction: column; gap: 6px; padding: 12px 10px 10px 16px;
  border: 1px solid var(--pgs-line); border-radius: 20px; background: var(--pgs-soft);
  transition: border-color 0.2s ease, box-shadow 0.25s ease;
}
#pgs-panel .pgs-composer:focus-within {
  border-color: color-mix(in srgb, var(--pgs-fg) 30%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pgs-accent) 16%, transparent);
}
#pgs-panel .pgs-input,
#pgs-panel .pgs-input:hover,
#pgs-panel .pgs-input:focus,
#pgs-panel .pgs-input:focus-visible {
  appearance: none !important;
  -moz-default-appearance: none !important;
  background: transparent !important;
  background-color: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
  resize: none; width: 100%; box-sizing: border-box; color: inherit;
  font: inherit; margin: 0; padding: 0 !important; max-height: 120px;
  scrollbar-width: none;
}
#pgs-panel .pgs-input::placeholder { color: inherit; opacity: 0.45; }
#pgs-panel .pgs-row { display: flex; align-items: center; gap: 8px; }
#pgs-panel .pgs-chips { flex: 1; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
#pgs-panel .pgs-chip {
  appearance: none; background: transparent; color: inherit; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--pgs-line); border-radius: 999px; padding: 3px 11px; font: inherit; font-size: 12px; opacity: 0.7;
}
#pgs-panel .pgs-chip:hover { opacity: 1; background: var(--pgs-soft); }
#pgs-panel .pgs-send {
  appearance: none; border: none; cursor: pointer; flex: none; width: 30px; height: 30px; border-radius: 50%;
  display: grid; place-items: center; background: color-mix(in srgb, var(--pgs-fg) 88%, transparent); color: var(--pgs-bg);
}
#pgs-panel .pgs-send:not([disabled]):hover { transform: scale(1.08); }
#pgs-panel .pgs-send[disabled] { opacity: 0.3; cursor: default; }

#pgs-panel .pgs-head-right { display: flex; gap: 2px; }
#pgs-panel.pgs-docked {
  border-radius: var(--zen-native-inner-radius, 10px); box-shadow: none; animation: none;
  background: var(--pgs-bg); backdrop-filter: none;
}
#pgs-panel.pgs-docked .pgs-head { cursor: default; }
#pgs-panel.pgs-docked .pgs-split-btn { display: none; }
#pgs-panel .pgs-win-btn { display: none; }
#pgs-panel.pgs-docked .pgs-win-btn { display: grid; }

/* stop button + inline bits */
#pgs-panel .pgs-svg-fill { fill: currentColor; stroke: none; }
#pgs-panel .pgs-answer code { font: 0.9em ui-monospace, Menlo, monospace; padding: 1px 5px; border-radius: 5px; background: var(--pgs-soft); }
#pgs-panel .pgs-answer .pgs-h { font-weight: 650; margin-top: 4px; }

/* web sources + citations */
#pgs-panel .pgs-sources { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 0 0 14px; padding-bottom: 2px; }
#pgs-panel .pgs-src {
  flex: none; display: flex; align-items: center; gap: 8px; max-width: 220px; padding: 7px 14px 7px 9px;
  border-radius: 14px; background: var(--pgs-soft); cursor: pointer; transition: background-color 0.15s ease, transform 0.15s var(--pgs-ease);
}
#pgs-panel .pgs-src:hover { background: color-mix(in srgb, var(--pgs-fg) 13%, transparent); transform: translateY(-1px); }
#pgs-panel .pgs-src-n { font-size: 11px; opacity: 0.45; width: 8px; text-align: center; }
#pgs-panel .pgs-src-ico {
  position: relative; flex: none; width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--pgs-fg) 14%, transparent); font-size: 12px; font-weight: 700;
}
#pgs-panel .pgs-src-fav { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 6px; background: var(--pgs-bg); }
#pgs-panel .pgs-src-meta { min-width: 0; }
#pgs-panel .pgs-src-title { font-size: 12.5px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#pgs-panel .pgs-src-host { font-size: 11px; opacity: 0.5; line-height: 1.3; }
#pgs-panel .pgs-cite {
  display: inline-grid; place-items: center; box-sizing: border-box; min-width: 16px; height: 16px; margin-inline: 2px;
  padding: 0 4px; border-radius: 8px; font-size: 10.5px; font-weight: 600; vertical-align: 2px; cursor: pointer;
  background: color-mix(in srgb, var(--pgs-fg) 14%, transparent);
}
#pgs-panel .pgs-cite:hover { background: color-mix(in srgb, var(--pgs-fg) 26%, transparent); }

/* full-tab chat (Dia-style) */
#pgs-panel.pgs-full {
  --pgs-card: color-mix(in srgb, var(--pgs-bg), white 10%);
  border: 0; box-shadow: none; animation: none; backdrop-filter: none; background: var(--pgs-bg);
  border-radius: var(--zen-native-inner-radius, 10px);
}
#pgs-panel.pgs-full .pgs-head.pgs-crumb { justify-content: flex-start; gap: 8px; padding: 22px 30px 0; font-size: 14px; cursor: default; }
#pgs-panel .pgs-crumb-app { font-weight: 600; }
#pgs-panel .pgs-crumb-sep, #pgs-panel .pgs-crumb-title { opacity: 0.45; }
#pgs-panel.pgs-full .pgs-log { padding: 30px max(30px, calc((100% - 760px) / 2)) 150px; gap: 30px; font-size: 16px; line-height: 1.65; }
#pgs-panel.pgs-full .pgs-ubub { padding: 12px 24px; border-radius: 26px; font-size: 16px; }
#pgs-panel.pgs-full .pgs-foot { position: absolute; left: 0; right: 0; bottom: 24px; width: min(760px, calc(100% - 60px)); margin-inline: auto; padding: 0; animation: none; }
#pgs-panel.pgs-full .pgs-composer {
  flex-direction: row; align-items: center; gap: 10px; padding: 12px 12px 12px 26px; border: 0; border-radius: 30px;
  background: var(--pgs-card); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16), 0 0 0 1px var(--pgs-line);
}
#pgs-panel.pgs-full .pgs-composer:focus-within { box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 0 0 1px color-mix(in srgb, var(--pgs-fg) 26%, transparent); }
#pgs-panel.pgs-full .pgs-input { flex: 1; font-size: 16px; }
#pgs-panel.pgs-full .pgs-row { flex: none; }
#pgs-panel.pgs-full .pgs-chips { display: none; }

/* new-tab bar */
#pgs-nt {
  --pgs-fg: var(--toolbar-color, CanvasText);
  --pgs-bg: var(--arrowpanel-background, var(--toolbar-bgcolor, Canvas));
  --pgs-card: color-mix(in srgb, var(--pgs-bg), white 10%);
  --pgs-line: color-mix(in srgb, var(--pgs-fg) 11%, transparent);
  --pgs-ease: cubic-bezier(0.16, 1, 0.3, 1);
  position: fixed; z-index: 2147483000; box-sizing: border-box; display: flex; flex-direction: column; align-items: center;
  padding-top: 20vh; background: var(--pgs-bg); color: var(--pgs-fg);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; border-radius: var(--zen-native-inner-radius, 10px);
  animation: pgs-fade 0.25s ease both;
}
#pgs-nt[hidden] { display: none; }
#pgs-nt .pgs-svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.pgs-nt-orb {
  width: 68px; height: 68px; border-radius: 50%; margin-bottom: 38px; opacity: 0.7; animation: pgs-breathe 5s ease-in-out infinite;
  background: radial-gradient(circle at 36% 30%, color-mix(in srgb, var(--pgs-fg) 30%, transparent), color-mix(in srgb, var(--pgs-fg) 72%, transparent));
}
@keyframes pgs-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
.pgs-nt-card {
  width: min(660px, calc(100% - 48px)); box-sizing: border-box; padding: 12px 12px 12px; border-radius: 26px; background: var(--pgs-card);
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.14), 0 0 0 1px var(--pgs-line); animation: pgs-msg 0.4s var(--pgs-ease) both;
}
.pgs-nt-inrow { display: flex; align-items: center; gap: 14px; padding: 10px 14px 12px; }
.pgs-nt-inicon { opacity: 0.55; display: grid; }
#pgs-nt .pgs-nt-input,
#pgs-nt .pgs-nt-input:focus,
#pgs-nt .pgs-nt-input:focus-visible {
  appearance: none !important; background: transparent !important; border: 0 !important; outline: 0 !important; box-shadow: none !important;
  flex: 1; min-width: 0; padding: 0 !important; margin: 0; color: inherit; font: 500 19px/1.4 inherit;
}
#pgs-nt .pgs-nt-input::placeholder { color: inherit; opacity: 0.4; }
.pgs-nt-list { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
.pgs-nt-list[hidden] { display: none; }
.pgs-nt-row { display: flex; align-items: center; gap: 14px; padding: 11px 14px; border-radius: 13px; cursor: pointer; font-size: 16px; }
.pgs-nt-row .pgs-svg { opacity: 0.6; flex: none; }
.pgs-nt-row.pgs-sel { background: color-mix(in srgb, var(--pgs-fg) 9%, transparent); }
.pgs-nt-label { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pgs-nt-tail { opacity: 0.5; white-space: nowrap; }
.pgs-nt-kbd { margin-left: auto; opacity: 0.4; font-size: 13px; letter-spacing: 0.08em; white-space: nowrap; }
.pgs-nt-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 4px 0 14px; }
.pgs-nt-hint { font-size: 12.5px; opacity: 0.4; }
.pgs-nt-go {
  appearance: none; border: 0; cursor: pointer; border-radius: 999px; padding: 10px 20px; font: 600 15px inherit;
  background: var(--pgs-fg); color: var(--pgs-bg); transition: transform 0.15s var(--pgs-ease), opacity 0.15s ease;
}
.pgs-nt-go:hover { transform: scale(1.04); }
.pgs-nt-go:active { transform: scale(0.96); }
.pgs-nt-gokbd { opacity: 0.6; margin-left: 4px; }

@media (prefers-reduced-motion: reduce) {
  #pgs-panel, #pgs-panel * { animation-duration: 1ms !important; animation-delay: 0s !important; transition-duration: 1ms !important; }
}
`;

  const IS_MAC = navigator.platform.startsWith("Mac");
  const SHORTCUT = IS_MAC ? "⌘E" : "Ctrl+E";
  const isToggleKey = (e) =>
    e.code === "KeyE" && !e.altKey && !e.shiftKey &&
    (IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);

  window.__pageSummary?.destroy();

  // ---------- prefs ----------
  const pref = (k, d) => {
    try { return Services.prefs.getStringPref(PREF + k, d) || d; } catch { return d; }
  };
  const provider = () => pref("provider", "apple");
  const apiKey = () => pref("apikey", "").trim();
  const baseUrl = () =>
    (provider() === "apple"
      ? pref("applebase", "http://127.0.0.1:11435/v1")
      : pref("baseurl", "https://api.openai.com/v1")
    )
      .trim()
      .replace(/\/+$/, "")
      .replace(/^(https?:\/\/[^/]+)$/, provider() === "apple" ? "$1/v1" : "$1");
  const model = () =>
    pref("model", "") || ({ anthropic: "claude-haiku-5-5", apple: "apple.local" }[provider()] || "gpt-4o-mini");
  const llmReady = () =>
    provider() === "anthropic"
      ? !!apiKey()
      : provider() === "apple" || !!apiKey() || /localhost|127\.0\.0\.1/.test(baseUrl());
  // Apple's on-device model has a ~4k-token context, so long pages are read in chunks
  const isLocal = () => provider() === "apple" || /localhost|127\.0\.0\.1/.test(baseUrl());
  const chunkSize = () => parseInt(pref("maxchars", ""), 10) || (isLocal() ? 6000 : MAX_CHARS);

  // ---------- DOM helpers ----------
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElementNS(NS, tag);
    Object.assign(el, props);
    el.append(...kids);
    return el;
  };
  const icon = (name) => {
    const s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("viewBox", "0 0 16 16");
    s.setAttribute("class", name === "stop" ? "pgs-svg pgs-svg-fill" : "pgs-svg");
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", ICONS[name]);
    s.append(p);
    return s;
  };

  const styleEl = h("style", { id: "pgs-style", textContent: CSS });
  document.documentElement.append(styleEl);

  const pageUrl = () => {
    const uri = gBrowser.currentURI;
    return /^https?$/.test(uri.scheme) ? uri.spec : null;
  };

  // ---------- page text ----------
  function extractInContent() {
    const doc = content.document;
    const root = doc.querySelector("article, main, [role=main], #mw-content-text, #content") || doc.body;
    const skip = "nav, footer, aside, header, form, .navbox, .reflist, .references, .toc, #toc, .mw-editsection";
    const parts = [];
    for (const el of root.querySelectorAll("h1,h2,h3,p,li,blockquote")) {
      if (el.closest(skip)) continue;
      const t = el.textContent.replace(/\s+/g, " ").replace(/\[\d+\]/g, "").trim();
      if (t.length > 1) parts.push(t);
    }
    let text = parts.join("\n");
    if (text.length < 200) text = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
    sendAsyncMessage("page-summary:text", { title: doc.title, url: doc.location.href, text });
  }

  // Runs inside the page: reports text the user selects (after mouse/keyboard selection)
  function selectionWatcher() {
    let last = "";
    const read = () => {
      let t = "";
      try { t = (content.getSelection()?.toString() || "").replace(/\s+/g, " ").trim(); } catch {}
      if (!t) { last = ""; return; }
      if (t === last) return;
      last = t;
      sendAsyncMessage("page-summary:selection", { text: t.slice(0, 3000) });
    };
    addEventListener("mouseup", () => content.setTimeout(read, 40), true);
    addEventListener("keyup", () => content.setTimeout(read, 40), true);
  }

  async function getPageText(browser) {
    try {
      const mm = browser.messageManager;
      const data = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          mm.removeMessageListener(MSG, listener);
          reject(new Error("timeout"));
        }, 4000);
        const listener = (m) => {
          clearTimeout(timer);
          mm.removeMessageListener(MSG, listener);
          resolve(m.data);
        };
        mm.addMessageListener(MSG, listener);
        mm.loadFrameScript(
          "data:application/javascript," + encodeURIComponent(`(${extractInContent.toString()})()`),
          false
        );
      });
      if (data?.text) return data;
    } catch (e) {
      console.warn("[page-summary] frame script failed, trying reader mode", e);
    }
    const { ReaderMode } = ChromeUtils.importESModule("resource://gre/modules/ReaderMode.sys.mjs");
    const art = await ReaderMode.downloadAndParseDocument(browser.currentURI.spec);
    if (!art?.textContent) throw new Error("couldn't read this page");
    return { title: art.title, url: browser.currentURI.spec, text: art.textContent.replace(/\s+/g, " ") };
  }

  // ---------- offline extractive summarizer ----------
  function extractive(text, n = 6) {
    const sents = (text.replace(/\s+/g, " ").match(/[^.!?。！？]+[.!?。！？]+/g) || [])
      .map((s) => s.trim())
      .filter((s) => s.length > 30 && s.length < 400);
    if (sents.length <= n) return sents.map((s) => "- " + s).join("\n");
    const stop = new Set(
      "the and for with that this from which who his her their has have had not but also than then into over after before are was were been its they you your".split(" ")
    );
    const words = (s) => (s.toLowerCase().match(/[\p{L}']{3,}/gu) || []).filter((w) => !stop.has(w));
    const freq = new Map();
    for (const s of sents) for (const w of words(s)) freq.set(w, (freq.get(w) || 0) + 1);
    return sents
      .map((s, i) => {
        const ws = words(s);
        const score = (ws.reduce((a, w) => a + freq.get(w), 0) / Math.sqrt(ws.length || 1)) * (i < sents.length * 0.3 ? 1.15 : 1);
        return { s, i, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .sort((a, b) => a.i - b.i)
      .map((x) => "- " + x.s)
      .join("\n");
  }

  // ---------- networking ----------
  const httpError = (status, body) =>
    `${status} ${String(body).replace(/\s+/g, " ").slice(0, 200)}` +
    (status === 401 || status === 403 ? " (check the API key / access settings of your AI server)" : "");

  // afm-server documents Bearer auth, but its Xcode setup uses x-api-key, so send both
  const authHeaders = () =>
    apiKey()
      ? { authorization: `Bearer ${apiKey()}`, ...(provider() === "apple" ? { "x-api-key": apiKey() } : {}) }
      : {};

  async function* fetchChunks(url, headers, body, signal) {
    const res = await fetch(url, { method: "POST", signal, headers, body });
    if (!res.ok) throw new Error(httpError(res.status, await res.text()));
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield dec.decode(value, { stream: true });
    }
  }

  // Raw browser channel: unlike fetch(), it adds no Origin / Sec-Fetch-* headers, which some
  // local servers (like afm-server) may reject with 403.
  async function* channelChunks(url, headers, body, signal) {
    const { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
    let ch;
    try {
      ch = NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true }).QueryInterface(Ci.nsIHttpChannel);
      const sis = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
      sis.setUTF8Data(body);
      ch.QueryInterface(Ci.nsIUploadChannel2).explicitSetUploadStream(sis, "application/json", -1, "POST", false);
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() !== "content-type") ch.setRequestHeader(k, v, false);
      }
    } catch (e) {
      e.channelSetup = true;
      throw e;
    }

    const queue = [];
    let wake = null, done = false, failure = null, status = 0, full = "";
    const ping = () => { wake?.(); wake = null; };
    const dec = new TextDecoder();
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener", "nsIRequestObserver"]),
      onStartRequest() { try { status = ch.responseStatus; } catch {} },
      onDataAvailable(_req, stream, _offset, count) {
        const bin = NetUtil.readInputStreamToString(stream, count);
        const txt = dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)), { stream: true });
        full += txt;
        if (status < 400) { queue.push(txt); ping(); }
      },
      onStopRequest(_req, code) {
        if (signal.aborted) failure = new DOMException("aborted", "AbortError");
        else if (!Components.isSuccessCode(code) && !status) failure = new TypeError("network error");
        done = true;
        ping();
      },
    };
    signal.addEventListener("abort", () => {
      try { ch.cancel(Components.results.NS_BINDING_ABORTED); } catch {}
    }, { once: true });
    try {
      ch.asyncOpen(listener);
    } catch (e) {
      e.channelSetup = true;
      throw e;
    }

    for (;;) {
      while (queue.length) yield queue.shift();
      if (done) break;
      await new Promise((r) => (wake = r));
    }
    if (failure) throw failure;
    if (status >= 400) throw new Error(httpError(status, full));
  }

  async function* chunks(url, headers, body, signal) {
    if (provider() === "apple") {
      try {
        yield* channelChunks(url, headers, body, signal);
        return;
      } catch (e) {
        if (!e.channelSetup) throw e;
        console.warn("[page-summary] channel transport unavailable, using fetch", e);
      }
    }
    yield* fetchChunks(url, headers, body, signal);
  }

  async function* sseEvents(chunkIter) {
    let buf = "";
    for await (const c of chunkIter) {
      buf += c;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const d = line.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try { yield JSON.parse(d); } catch {}
      }
    }
  }

  async function* streamLLM(msgs, signal, system = SYSTEM) {
    const anthropic = provider() === "anthropic";
    const url = anthropic ? "https://api.anthropic.com/v1/messages" : baseUrl() + "/chat/completions";
    const headers = anthropic
      ? {
          "content-type": "application/json",
          "x-api-key": apiKey(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        }
      : { "content-type": "application/json", ...authHeaders() };
    const body = JSON.stringify(
      anthropic
        ? { model: model(), max_tokens: 1024, stream: true, system, messages: msgs }
        : { model: model(), stream: true, messages: [{ role: "system", content: system }, ...msgs] }
    );
    for await (const j of sseEvents(chunks(url, headers, body, signal))) {
      const d = anthropic ? (j.type === "content_block_delta" ? j.delta?.text : "") : j.choices?.[0]?.delta?.content;
      if (d) yield d;
    }
  }

  async function complete(msgs, signal, system = "You extract key facts tersely.") {
    const headers = { "content-type": "application/json", ...authHeaders() };
    const body = JSON.stringify({
      model: model(),
      stream: false,
      messages: [{ role: "system", content: system }, ...msgs],
    });
    let text = "";
    for await (const c of chunks(baseUrl() + "/chat/completions", headers, body, signal)) text += c;
    return JSON.parse(text).choices?.[0]?.message?.content || "";
  }

  // ---------- context building (chunked reading for small-context models) ----------
  function chunkText(text, size) {
    const out = [];
    let cur = "";
    for (const line of text.split("\n")) {
      if (cur && cur.length + line.length > size) { out.push(cur); cur = ""; }
      cur += (cur ? "\n" : "") + line.slice(0, size);
    }
    if (cur) out.push(cur);
    return out;
  }

  async function buildContext(page, signal, setStatus) {
    const size = chunkSize();
    if (!isLocal() || page.text.length <= size) return page.text.slice(0, size);
    let parts = chunkText(page.text, size);
    if (parts.length > 8) parts = Array.from({ length: 8 }, (_, i) => parts[Math.floor((i * parts.length) / 8)]);
    const notes = [];
    for (let i = 0; i < parts.length; i++) {
      setStatus(`Reading part ${i + 1} of ${parts.length}…`);
      notes.push(
        await complete(
          [{ role: "user", content: "List the key facts in this excerpt as 4-6 terse bullet points:\n\n" + parts[i] }],
          signal
        )
      );
    }
    return notes.join("\n").slice(0, size);
  }

  // ---------- free web search (no API key): DuckDuckGo results page + Wikipedia ----------
  async function searchDDG(q, signal) {
    const res = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), { signal, credentials: "omit" });
    if (!res.ok) throw new Error(`search ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const out = [];
    for (const el of doc.querySelectorAll(".result")) {
      if (el.classList.contains("result--ad")) continue;
      const a = el.querySelector("a.result__a");
      if (!a) continue;
      let url = a.getAttribute("href") || "";
      const m = url.match(/[?&]uddg=([^&]+)/);
      if (m) url = decodeURIComponent(m[1]);
      else if (url.startsWith("//")) url = "https:" + url;
      if (!/^https?:\/\//.test(url)) continue;
      const snippet = (el.querySelector(".result__snippet")?.textContent || "").replace(/\s+/g, " ").trim();
      out.push({ title: a.textContent.replace(/\s+/g, " ").trim(), url, snippet, host: new URL(url).hostname.replace(/^www\./, "") });
      if (out.length >= 8) break;
    }
    if (!out.length) throw new Error("no results (the search page may be asking for verification)");
    return out;
  }

  async function searchWiki(q, signal) {
    const u =
      "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=3&prop=extracts%7Cinfo" +
      "&exintro=1&explaintext=1&exlimit=3&inprop=url&format=json&formatversion=2&gsrsearch=" + encodeURIComponent(q);
    const res = await fetch(u, { signal, credentials: "omit" });
    if (!res.ok) throw new Error(`wikipedia ${res.status}`);
    const j = await res.json();
    return (j.query?.pages || [])
      .sort((x, y) => (x.index || 0) - (y.index || 0))
      .map((p) => ({
        title: `${p.title} – Wikipedia`,
        url: p.fullurl,
        snippet: (p.extract || "").replace(/\s+/g, " ").slice(0, 600),
        host: "en.wikipedia.org",
      }))
      .filter((r) => r.url);
  }

  async function webSearch(q, signal) {
    const [ddg, wiki] = await Promise.allSettled([searchDDG(q, signal), searchWiki(q, signal)]);
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    const a = ddg.status === "fulfilled" ? ddg.value : [];
    const w = wiki.status === "fulfilled" ? wiki.value : [];
    if (!a.length && !w.length) throw new Error(ddg.reason?.message || wiki.reason?.message || "no results");
    const seen = new Set();
    const out = [];
    for (const r of [...a.slice(0, 4), ...w.slice(0, 2), ...a.slice(4)]) {
      const key = r.host + new URL(r.url).pathname;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      if (out.length >= 5) break;
    }
    return out;
  }

  function sourcesRow(srcs) {
    const row = h("div", { className: "pgs-sources" });
    srcs.forEach((r, i) => {
      const ico = h("div", { className: "pgs-src-ico", textContent: (r.host[0] || "?").toUpperCase() });
      const img = h("img", { className: "pgs-src-fav", src: `https://icons.duckduckgo.com/ip3/${r.host}.ico` });
      img.onerror = () => img.remove();
      ico.append(img);
      row.append(h("div", { className: "pgs-src", title: r.title, onclick: () => openTrustedLinkIn(r.url, "tab") },
        h("span", { className: "pgs-src-n", textContent: String(i + 1) }), ico,
        h("div", { className: "pgs-src-meta" },
          h("div", { className: "pgs-src-title", textContent: r.title }),
          h("div", { className: "pgs-src-host", textContent: r.host }))));
    });
    return row;
  }

  // ---------- minimal markdown -> DOM ----------
  const inline = (s, sources) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d{1,2}\])/).filter(Boolean).map((t) => {
      if (t.startsWith("**") && t.endsWith("**") && t.length > 4) return h("strong", { textContent: t.slice(2, -2) });
      if (t.startsWith("`") && t.endsWith("`") && t.length > 2) return h("code", { textContent: t.slice(1, -1) });
      const c = t.match(/^\[(\d{1,2})\]$/);
      const src = c && sources?.[Number(c[1]) - 1];
      if (src) return h("span", { className: "pgs-cite", textContent: c[1], title: `${src.title} — ${src.host}`, onclick: () => openTrustedLinkIn(src.url, "tab") });
      return document.createTextNode(t);
    });

  function renderMd(el, text, sources) {
    el.replaceChildren();
    let list = null, kind = null;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      const ul = line.match(/^[-*•]\s+(.*)/);
      const ol = line.match(/^\d+[.)]\s+(.*)/);
      const hd = line.match(/^#{1,4}\s+(.*)/);
      if (ul || ol) {
        const tag = ul ? "ul" : "ol";
        if (!list || kind !== tag) { list = h(tag); kind = tag; el.append(list); }
        list.append(h("li", {}, ...inline((ul || ol)[1], sources)));
      } else if (hd) {
        list = null;
        el.append(h("p", { className: "pgs-h" }, ...inline(hd[1], sources)));
      } else if (line) {
        list = null;
        el.append(h("p", {}, ...inline(line, sources)));
      } else {
        list = null;
      }
    }
  }

  const chatDataUrl = (title) => {
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    return "data:text/html;charset=utf-8," + encodeURIComponent(
      `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><meta name="color-scheme" content="dark light">` +
      `<style>html{background:#1d1d1f}@media (prefers-color-scheme:light){html{background:#f5f5f7}}</style>`
    );
  };
  const CHAT_ICON =
    "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="${ICONS.chat}" fill="none" stroke="#8a8a8e" stroke-width="1.4" stroke-linejoin="round"/></svg>`
    );

  // ---------- per-tab session ----------
  const sessions = new Map(); // host tab -> session
  const offset = { x: 0, y: 0 }; // user drag offset from the default top-right spot

  function makeSession(src, opts = {}) {
    const web = !!opts.web; // full-tab web chat (no source page)
    let panel, logEl, input, sendBtn, refsEl, closeBtn, splitBtn, winBtn, cardEl;
    let cardUrl = null;
    let page = null, convo = [], refs = [], ctrl = null;
    let busy = false, gen = 0, closed = false, userHidden = false;
    let host = web ? opts.tab : src; // the tab hosting the panel (changes when popped into its own split tab)
    const isDocked = () => web || host !== src;
    let stopped = false, generating = false, titled = false, seenData = false, crumbTitle = null;
    let self = null;
    const hideTitle = `Hide (Esc or ${SHORTCUT}) — your chat is kept for this tab`;

    const srcUrl = () => {
      const uri = src?.linkedBrowser?.currentURI;
      return uri && /^https?$/.test(uri.scheme) ? uri.spec : null;
    };
    const setBusy = (b) => {
      busy = b;
      if (!sendBtn) return;
      sendBtn.replaceChildren(icon(b ? "stop" : "send"));
      sendBtn.title = b ? "Stop generating" : "Send";
      sendBtn.classList.toggle("pgs-stop", b);
    };
    const nearBottom = () => logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 80;
    const scrollDown = (smooth) => logEl?.scrollTo({ top: logEl.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    const autosize = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; };

    // ----- text selected on the page becomes a reference card in the composer -----
    const mm = src?.linkedBrowser?.messageManager;
    const onSelection = (m) => { if (panel && !panel.hidden && !closed) addRef(m.data?.text); };
    if (mm) {
      try {
        mm.loadFrameScript(
          "data:application/javascript," + encodeURIComponent(
            `if (typeof __pgsSel === "undefined") { var __pgsSel = true; (${selectionWatcher.toString()})(); }`
          ),
          true
        );
        mm.addMessageListener(SEL_MSG, onSelection);
      } catch (e) {
        console.warn("[page-summary] selection watcher failed", e);
      }
    }

    function refCard(ref, removable) {
      const card = h("div", { className: "pgs-ref", title: ref.text.slice(0, 400) },
        h("div", { className: "pgs-ref-ico", textContent: "\u201C" }),
        h("div", { className: "pgs-ref-meta" },
          h("div", { className: "pgs-ref-kind", textContent: "Selected text" }),
          h("div", { className: "pgs-ref-text", textContent: ref.text })));
      if (removable) {
        card.append(h("button", {
          className: "pgs-ref-x", textContent: "✕", title: "Remove",
          onclick: () => { refs = refs.filter((r) => r !== ref); renderRefs(); },
        }));
      }
      return card;
    }
    function renderRefs() {
      if (!refsEl) return;
      refsEl.replaceChildren(...refs.map((r) => refCard(r, true)));
      refsEl.hidden = !refs.length;
    }
    function addRef(text) {
      if (!text || text.length < 2) return;
      // growing/shrinking the same selection replaces its card instead of stacking
      const i = refs.findIndex((r) => r.text.includes(text) || text.includes(r.text));
      if (i >= 0) refs[i] = { text }; else refs.push({ text });
      if (refs.length > 3) refs.shift();
      renderRefs();
    }

    // ----- request building: every request is self-contained (small local models ignore history) -----
    const requestFor = () => {
      const last = convo.at(-1);
      const header = page ? `Title: ${page.title}\nURL: ${page.url}\n\n${page.context}` : "";
      const refText = (rs) => rs.map((r) => `"${r.text.slice(0, 1500)}"`).join("\n");
      const transcript = convo
        .slice(0, -1)
        .slice(-4)
        .map((m) =>
          `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 1200)}` +
          (m.refs?.length ? ` (about the selected text: ${refText(m.refs).slice(0, 400)})` : "")
        )
        .join("\n");
      if (web) {
        const srcs = last?.sources || [];
        const list = srcs.map((r, i) => `[${i + 1}] ${r.title} (${r.host})\n${r.snippet.slice(0, 500)}`).join("\n\n");
        return [{
          role: "user",
          content:
            (srcs.length
              ? "Answer the user's question using the web search results below. Add citations like [1] or [2] right after " +
                "the claims they support. Prefer the results; if they don't contain the answer, say so briefly instead of " +
                "guessing. Be concise.\n\n=== SEARCH RESULTS ===\n" + list
              : "Answer the user's question concisely from your own knowledge. If you are unsure, say so.") +
            (transcript ? `\n\n=== CONVERSATION SO FAR ===\n${transcript}` : "") +
            `\n\n=== QUESTION ===\n${last?.content || ""}`,
        }];
      }
      const refsBlock = last?.refs?.length
        ? `\n\n=== TEXT THE USER SELECTED ON THE PAGE (their request is about this) ===\n${refText(last.refs)}`
        : "";
      return [{
        role: "user",
        content:
          "Use the web page below to respond to the user's request. Be concise.\n\n=== PAGE ===\n" + header +
          refsBlock +
          (transcript ? `\n\n=== CONVERSATION SO FAR ===\n${transcript}` : "") +
          `\n\n=== REQUEST ===\n${last?.content || pref("prompt", DEFAULT_PROMPT)}`,
      }];
    };

    // ----- layout -----
    function position() {
      if (!panel) return;
      if (isDocked()) {
        const d = host.linkedBrowser.getBoundingClientRect();
        const i = web ? 0 : 4;
        Object.assign(panel.style, {
          left: `${Math.round(d.left + i)}px`, top: `${Math.round(d.top + i)}px`, right: "auto",
          width: `${Math.round(d.width - i * 2)}px`, height: `${Math.round(d.height - i * 2)}px`,
        });
        return;
      }
      const r = gBrowser.selectedBrowser.getBoundingClientRect();
      const w = Math.min(parseInt(pref("width", "440"), 10) || 440, r.width - MARGIN * 2);
      const hgt = Math.min(parseInt(pref("height", "620"), 10) || 620, r.height - MARGIN * 2);
      const baseLeft = r.right - w - MARGIN;
      const baseTop = r.top + MARGIN;
      const left = Math.min(Math.max(baseLeft + offset.x, 0), window.innerWidth - w);
      const top = Math.min(Math.max(baseTop + offset.y, 0), window.innerHeight - 80);
      offset.x = left - baseLeft;
      offset.y = top - baseTop;
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = "auto";
      panel.style.width = `${Math.round(w)}px`;
      panel.style.height = `${Math.round(hgt)}px`;
    }

    function enableDrag(head) {
      head.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("button") || isDocked()) return;
        e.preventDefault();
        head.setPointerCapture(e.pointerId);
        panel.classList.add("pgs-dragging");
        const move = (ev) => { offset.x += ev.movementX; offset.y += ev.movementY; position(); };
        const up = (ev) => {
          head.releasePointerCapture(ev.pointerId);
          panel.classList.remove("pgs-dragging");
          head.removeEventListener("pointermove", move);
          head.removeEventListener("pointerup", up);
          head.removeEventListener("pointercancel", up);
        };
        head.addEventListener("pointermove", move);
        head.addEventListener("pointerup", up);
        head.addEventListener("pointercancel", up);
      });
      head.addEventListener("dblclick", (e) => {
        if (e.target.closest("button") || isDocked()) return;
        offset.x = offset.y = 0;
        position();
      });
    }

    function buildWeb() {
      crumbTitle = h("span", { className: "pgs-crumb-title", textContent: "New chat" });
      const head = h("div", { className: "pgs-head pgs-crumb" },
        h("span", { className: "pgs-crumb-app", textContent: "Chat" }),
        h("span", { className: "pgs-crumb-sep", textContent: "/" }), crumbTitle);
      logEl = h("div", { className: "pgs-log" });
      input = h("textarea", { className: "pgs-input", rows: 1, placeholder: "Ask a question…" });
      input.addEventListener("input", autosize);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submit(); }
      });
      sendBtn = h("button", { className: "pgs-send", onclick: () => (busy ? stop() : submit()) });
      const foot = h("div", { className: "pgs-foot" }, h("div", { className: "pgs-composer" }, input, h("div", { className: "pgs-row" }, sendBtn)));
      panel = h("div", { id: "pgs-panel", className: "pgs-full" }, head, logEl, foot);
      document.documentElement.append(panel);
      setBusy(false);
      position();
    }

    function build() {
      if (web) return buildWeb();
      const newBtn = h("button", { className: "pgs-icon", title: "New chat", onclick: () => newChat() }, icon("new"));
      closeBtn = h("button", {
        className: "pgs-icon", title: hideTitle,
        onclick: () => (host !== src ? gBrowser.removeTab(host) : dismiss()),
      }, icon("close"));
      splitBtn = h("button", { className: "pgs-icon pgs-split-btn", title: "Open as a split-view tab", onclick: () => pop() }, icon("split"));
      winBtn = h("button", { className: "pgs-icon pgs-win-btn", title: "Back to window mode", onclick: () => unpop() }, icon("win"));
      const head = h("div", { className: "pgs-head", title: "Drag to move · double-click to reset" },
        newBtn, h("div", { className: "pgs-head-right" }, splitBtn, winBtn, closeBtn));
      enableDrag(head);

      logEl = h("div", { className: "pgs-log" });
      refsEl = h("div", { className: "pgs-refs", hidden: true });
      input = h("textarea", { className: "pgs-input", rows: 1, placeholder: "Ask a question about this page…" });
      input.addEventListener("input", autosize);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submit(); }
      });
      sendBtn = h("button", { className: "pgs-send", onclick: () => (busy ? stop() : submit()) });
      const chips = h("div", { className: "pgs-chips" }, ...CHIPS.map(([label, q]) =>
        h("button", { className: "pgs-chip", textContent: label, onclick: () => submit(q || pref("prompt", DEFAULT_PROMPT), { label }) })
      ));
      const foot = h("div", { className: "pgs-foot" },
        h("div", { className: "pgs-composer" }, refsEl, input, h("div", { className: "pgs-row" }, chips, sendBtn)));

      panel = h("div", { id: "pgs-panel" }, head, logEl, foot);
      document.documentElement.append(panel);
      setBusy(false);
      position();
    }

    // ----- conversation -----
    function pageCard(url) {
      const host_ = new URL(url).hostname.replace(/^www\./, "");
      const ico = h("div", { className: "pgs-card-ico" });
      if (src.image) ico.append(h("img", { className: "pgs-card-fav", src: src.image }));
      else ico.textContent = (host_[0] || "?").toUpperCase();
      const title = h("div", { className: "pgs-card-title", textContent: src.label || url });
      const card = h("div", { className: "pgs-msg pgs-card" }, ico,
        h("div", { className: "pgs-card-meta" }, title, h("div", { className: "pgs-card-domain", textContent: host_ })));
      card._title = title;
      return card;
    }

    const userMsg = (label, rs) =>
      h("div", { className: "pgs-msg pgs-ug" }, ...rs.map((r) => refCard(r, false)), h("div", { className: "pgs-ubub", textContent: label }));

    function actionsRow(getText) {
      const mini = (label, fn) => h("button", { className: "pgs-mini", textContent: label, onclick: fn });
      return h("div", { className: "pgs-actions" },
        mini("Copy", (e) => {
          Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(getText());
          e.target.textContent = "Copied";
          setTimeout(() => (e.target.textContent = "Copy"), 1200);
        }),
        mini("Regenerate", regenerate)
      );
    }

    async function generate() {
      ctrl?.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      const my = ++gen;
      stopped = false;
      generating = true;
      setBusy(true);
      const last = convo.at(-1);
      const sources = (web && last?.sources) || null;
      const block = h("div", { className: "pgs-msg pgs-ai pgs-streaming" });
      if (sources?.length) block.append(sourcesRow(sources));
      if (web && last && !sources?.length) {
        block.append(h("div", {
          className: "pgs-note",
          textContent: `Web search ${last.searchError ? `failed (${last.searchError})` : "found nothing"}. Answering from the model's own knowledge.`,
        }));
      }
      const answerEl = h("div", { className: "pgs-answer" });
      block.append(answerEl);
      logEl.append(block);
      scrollDown(true);
      let acc = "";
      try {
        if (!llmReady()) {
          acc = web
            ? "Add an AI model in the mod settings to get written answers. The top results are listed above."
            : extractive(page.text) || "Couldn't find enough text on this page to summarize.";
          renderMd(answerEl, acc);
          if (!web) answerEl.append(h("div", { className: "pgs-note", textContent: "Offline summary. Add an API key (or a local model) in the mod settings for AI answers." }));
        } else {
          for await (const d of streamLLM(requestFor(), signal, web ? SYSTEM_WEB : SYSTEM)) {
            const stick = nearBottom();
            acc = acc.length > 20 && d.startsWith(acc) ? d : acc + d; // tolerate cumulative streams
            renderMd(answerEl, acc, sources);
            if (stick) scrollDown(false);
          }
        }
        if (acc) convo.push({ role: "assistant", content: acc });
      } catch (e) {
        if (e.name === "AbortError") {
          if (stopped && acc) convo.push({ role: "assistant", content: acc }); // keep what was written
        } else {
          const unreachable = e instanceof TypeError;
          block.append(h("p", {
            className: "pgs-error",
            textContent: unreachable
              ? `Couldn't reach the AI server at ${baseUrl()}. Is it running?`
              : `Couldn't answer: ${e.message}`,
          }));
          if (unreachable && !acc && !web && convo.length === 1) {
            acc = extractive(page.text);
            const fb = h("div");
            renderMd(fb, acc);
            block.append(fb);
          }
        }
      }
      generating = false;
      if (closed || my !== gen) return;
      block.classList.remove("pgs-streaming");
      if (acc) block.append(actionsRow(() => acc));
      setBusy(false);
      scrollDown(true);
      if (web && !titled && acc && !stopped) { titled = true; makeTitle(convo.find((m) => m.role === "user")?.content || ""); }
    }

    function stop() {
      stopped = true;
      ctrl?.abort();
      if (!generating) { // still searching / reading the page
        gen++;
        setBusy(false);
        logEl?.querySelectorAll(".pgs-status").forEach((n) => n.remove());
      }
    }

    // web chat: search first, then answer from the results
    async function webTurn(entry) {
      ctrl?.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      const my = ++gen;
      setBusy(true);
      const status = h("div", { className: "pgs-msg pgs-status", textContent: "Searching the web…" });
      logEl.append(status);
      scrollDown(true);
      const prev = convo.filter((m) => m.role === "user").at(-1);
      const q = prev && entry.content.split(/\s+/).length < 4 ? `${prev.content} ${entry.content}` : entry.content;
      try {
        entry.sources = await webSearch(q, signal);
      } catch (e) {
        if (e.name === "AbortError" || closed || my !== gen) return;
        entry.sources = [];
        entry.searchError = e.message;
      }
      if (closed || my !== gen) return;
      status.remove();
      convo.push(entry);
      generate();
    }

    function loadChatPage(title) {
      const b = host.linkedBrowser;
      const url = chatDataUrl(`Chat · ${title}`);
      try {
        const triggeringPrincipal = Services.scriptSecurityManager.getSystemPrincipal();
        if (b.fixupAndLoadURIString) b.fixupAndLoadURIString(url, { triggeringPrincipal });
        else b.loadURI(Services.io.newURI(url), { triggeringPrincipal });
      } catch (e) {
        console.warn("[page-summary] couldn't load chat page", e);
      }
      try { gBrowser.setIcon(host, CHAT_ICON, undefined, Services.scriptSecurityManager.getSystemPrincipal()); } catch {}
    }

    async function makeTitle(q) {
      let t = q.replace(/\s+/g, " ").slice(0, 40);
      if (llmReady() && provider() !== "anthropic") {
        try {
          const out = await complete(
            [{ role: "user", content: `Write a 2-4 word title for this question. Reply with ONLY the title, no quotes or punctuation.\n\n${q.slice(0, 300)}` }],
            new AbortController().signal,
            "You write very short titles."
          );
          const clean = out.replace(/["“”.\n]/g, " ").replace(/\s+/g, " ").trim();
          if (clean && clean.length <= 48) t = clean;
        } catch {}
      }
      if (closed) return;
      if (crumbTitle) crumbTitle.textContent = t;
      loadChatPage(t);
    }

    function regenerate() {
      if (busy || (!web && !page)) return;
      const blocks = logEl.querySelectorAll(".pgs-ai");
      blocks[blocks.length - 1]?.remove();
      if (convo.at(-1)?.role === "assistant") convo.pop();
      generate();
    }

    // The first message loads the page text; later ones reuse it
    async function startFirst(entry) {
      const url = srcUrl();
      if (!url) {
        logEl.append(h("p", { className: "pgs-msg pgs-error", textContent: "Open a regular web page first, then ask about it." }));
        return;
      }
      ctrl?.abort();
      const my = ++gen;
      setBusy(true);
      if (cardUrl !== url) { const nc = pageCard(url); cardEl?.replaceWith(nc); cardEl = nc; cardUrl = url; }
      const status = h("div", { className: "pgs-msg pgs-status", textContent: "Reading page…" });
      logEl.append(status);
      scrollDown(true);
      try {
        page = await getPageText(src.linkedBrowser);
      } catch (e) {
        if (closed || my !== gen) return;
        status.replaceWith(h("p", { className: "pgs-msg pgs-error", textContent: `Couldn't read this page: ${e.message}` }));
        setBusy(false);
        return;
      }
      if (closed || my !== gen) return;
      if (page.title && cardEl) cardEl._title.textContent = page.title;
      page.text = page.text.slice(0, MAX_CHARS * 2);
      ctrl = new AbortController();
      try {
        page.context = await buildContext(page, ctrl.signal, (t) => { status.textContent = t; });
      } catch (e) {
        if (e.name === "AbortError" || closed) return;
        page.context = page.text.slice(0, chunkSize()); // generate() will surface the real error
      }
      if (closed || my !== gen) return;
      status.remove();
      convo.push(entry);
      generate();
    }

    function submit(text, opts = {}) {
      if (busy) return;
      let q = (text ?? input.value).trim();
      if (!q && !refs.length) return;
      if (!q) q = "Explain this.";
      if (text === undefined) { input.value = ""; autosize(); }
      const mine = refs;
      refs = [];
      renderRefs();
      logEl.append(userMsg(opts.label || q, mine));
      scrollDown(true);
      const entry = { role: "user", content: q, refs: mine };
      if (web) { webTurn(entry); return; }
      if (!page) { startFirst(entry); return; }
      convo.push(entry);
      generate();
    }

    function newChat() {
      ctrl?.abort();
      gen++;
      page = null;
      convo = [];
      refs = [];
      renderRefs();
      setBusy(false);
      if (input) { input.value = ""; autosize(); }
      logEl.replaceChildren();
      cardEl = null;
      cardUrl = null;
      const url = srcUrl();
      if (url) { cardEl = pageCard(url); cardUrl = url; logEl.append(cardEl); }
    }

    // full-tab web chat started from the new-tab bar
    function openWeb(text) {
      loadChatPage("New chat");
      build();
      submit(text);
    }

    // open an empty chat about the page (nothing is read or sent until you ask)
    function open() {
      if (!panel) build();
      newChat();
      input.focus();
    }

    // ----- visibility: sync() shows the panel only while its host tab is on screen -----
    function dockedVisible() {
      const sel = gBrowser.selectedTab;
      return (host === sel || src === sel || paneVisible(src)) && paneVisible(host);
    }
    function sync() {
      if (!panel || closed) return;
      if (web) {
        const spec = host.linkedBrowser?.currentURI?.spec || "";
        if (spec.startsWith("data:")) seenData = true;
        else if (seenData) { close(true); return; } // the tab navigated away from the chat page
      }
      const want = !userHidden && (web ? host === gBrowser.selectedTab : host === src ? src === gBrowser.selectedTab : dockedVisible());
      panel.hidden = !want;
      if (want) position();
    }
    function dismiss() { userHidden = true; sync(); }
    function restore() { userHidden = false; sync(); input?.focus(); }

    // ----- split-view tab mode -----
    function pop() {
      if (web || !panel || closed || host !== src) return;
      const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
      const title = `Chat · ${(page?.title || src.label || "page").slice(0, 40)}`;
      const url = "data:text/html;charset=utf-8," + encodeURIComponent(
        `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><meta name="color-scheme" content="dark light">` +
        `<style>html{background:#1d1d1f}@media (prefers-color-scheme:light){html{background:#f5f5f7}}</style>`
      );
      const chatTab = gBrowser.addTab(url, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        tabIndex: src._tPos != null ? src._tPos + 1 : undefined,
        skipAnimation: true,
      });
      sessions.delete(host);
      host = chatTab;
      sessions.set(chatTab, self);
      panel.classList.add("pgs-docked");
      closeBtn.title = "Close chat tab";
      const hint = () => logEl?.append(h("div", {
        className: "pgs-note",
        textContent: "Couldn't start split view automatically. Select the page's tab and press Ctrl+Alt+V to split it with this chat tab.",
      }));
      let tried = false;
      try {
        const zs = window.gZenViewSplitter;
        if (zs?.splitTabs) { zs.splitTabs([src, chatTab], "vsep", 1); tried = true; }
      } catch (e) {
        console.warn("[page-summary] split view failed", e);
      }
      if (!tried) { gBrowser.selectedTab = chatTab; hint(); }
      startTicker();
      for (const ms of [0, 150, 500, 1000]) setTimeout(() => self?.sync(), ms);
      if (tried) setTimeout(() => { if (!closed && !(paneVisible(src) && paneVisible(host))) hint(); }, 1500);
    }

    // back to the floating window on the page's own tab; the chat tab (and the split) goes away
    function unpop() {
      if (web || !panel || closed || host === src) return;
      const chatTab = host;
      sessions.delete(chatTab);
      host = src;
      sessions.set(src, self);
      panel.classList.remove("pgs-docked");
      closeBtn.title = hideTitle;
      gBrowser.selectedTab = src;
      gBrowser.removeTab(chatTab);
      for (const ms of [0, 150, 500]) setTimeout(() => self?.sync(), ms);
    }

    function close(immediate) {
      if (closed) return;
      closed = true;
      gen++;
      ctrl?.abort();
      try { mm?.removeMessageListener(SEL_MSG, onSelection); } catch {}
      sessions.delete(host);
      if (!panel) return;
      const p = panel;
      if (immediate) p.remove();
      else { p.classList.add("pgs-out"); setTimeout(() => p.remove(), 180); }
    }

    self = {
      open, openWeb, sync, dismiss, restore, position, close, pop, unpop,
      web,
      focus() { input?.focus(); },
      get docked() { return isDocked(); },
      get host() { return host; },
      get src() { return src; },
      get visible() { return !!panel && !panel.hidden; },
    };
    return self;
  }

  // ---------- window-level wiring ----------
  const paneVisible = (t) => {
    const b = t?.linkedBrowser;
    if (!b) return false;
    if (t === gBrowser.selectedTab) return true;
    const box = b.closest(".browserSidebarContainer") || b;
    const cs = getComputedStyle(box);
    const r = box.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 100 && r.height > 100;
  };
  const current = () =>
    [...sessions.values()].find((x) => x.host === gBrowser.selectedTab || x.src === gBrowser.selectedTab);

  let ticker = null;
  const startTicker = () => {}; // the global tick below keeps docked chats in place

  // ----- Dia-style new-tab bar: type, then pick Chat (web search + your model) or classic search -----
  const BLANK = new Set(["about:newtab", "about:blank", "about:home", "chrome://browser/content/blanktab.html"]);
  const looksLikeUrl = (q) => !/\s/.test(q) && /^(https?:\/\/)?(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/\S*)?$/i.test(q);
  let nt = null, ntRows = [], ntSel = 0, ntSugg = [], ntAbort = null, ntTimer = null, ntEngine = null, ntHold = 0;
  try { Services.search.getDefault().then((e) => (ntEngine = e)).catch(() => {}); } catch {}

  const isBlankTab = (t) => {
    const b = t?.linkedBrowser;
    if (!b || sessions.has(t) || t.hasAttribute("busy") || t.hasAttribute("pending")) return false;
    return BLANK.has(b.currentURI?.spec) && !b.webProgress?.isLoadingDocument;
  };
  const searchUrl = (q) => (ntEngine ? ntEngine.getSubmission(q).uri.spec : "https://duckduckgo.com/?q=" + encodeURIComponent(q));

  function openWebChat(text) {
    const tab = gBrowser.selectedTab;
    if (sessions.has(tab)) return;
    const ns = makeSession(null, { web: true, tab });
    sessions.set(tab, ns);
    ns.openWeb(text);
  }

  function ntMarkSel() {
    if (!nt) return;
    [...nt.list.children].forEach((c, i) => c.classList.toggle("pgs-sel", i === ntSel));
    const k = ntRows[ntSel]?.kind;
    nt.inIcon.replaceChildren(icon(k === "search" ? "search" : k === "url" ? "globe" : "chat"));
    nt.go.firstChild.textContent = (k === "search" ? "Search" : k === "url" ? "Open" : "Chat") + " ";
  }

  function ntRow(r, i, q) {
    const label = h("span", { className: "pgs-nt-label" });
    if (r.kind === "suggest" && r.text.toLowerCase().startsWith(q.toLowerCase())) {
      label.append(document.createTextNode(r.text.slice(0, q.length)), h("strong", { textContent: r.text.slice(q.length) }));
    } else {
      label.append(document.createTextNode(r.kind === "url" ? `Open ${r.text}` : r.text));
    }
    const tail = r.kind === "chat" ? " — Chat" : r.kind === "search" ? ` — ${ntEngine?.name || "Search"}` : "";
    const hint = r.kind === "chat" ? "⌃⌘↵" : r.kind === "search" ? "⇧⌘↵" : "";
    const row = h("div", { className: "pgs-nt-row", onclick: () => ntActivate(r) },
      icon(r.kind === "search" ? "search" : r.kind === "url" ? "globe" : "chat"), label);
    if (tail) row.append(h("span", { className: "pgs-nt-tail", textContent: tail }));
    if (hint) row.append(h("span", { className: "pgs-nt-kbd", textContent: hint }));
    row.addEventListener("mouseenter", () => { ntSel = i; ntMarkSel(); });
    return row;
  }

  function ntRender(keepSel) {
    if (!nt) return;
    const q = nt.input.value.trim();
    ntRows = [];
    if (q) {
      if (looksLikeUrl(q)) ntRows.push({ kind: "url", text: q });
      ntRows.push({ kind: "chat", text: q }, { kind: "search", text: q });
      for (const sg of ntSugg) if (sg.toLowerCase() !== q.toLowerCase()) ntRows.push({ kind: "suggest", text: sg });
    }
    if (!keepSel) ntSel = 0;
    ntSel = Math.max(0, Math.min(ntSel, ntRows.length - 1));
    nt.list.replaceChildren(...ntRows.map((r, i) => ntRow(r, i, q)));
    nt.list.hidden = !ntRows.length;
    ntMarkSel();
  }

  function ntSuggest() {
    clearTimeout(ntTimer);
    const q = nt.input.value.trim();
    if (!q) { ntSugg = []; return; }
    ntTimer = setTimeout(async () => {
      ntAbort?.abort();
      ntAbort = new AbortController();
      try {
        const res = await fetch("https://duckduckgo.com/ac/?type=list&q=" + encodeURIComponent(q), { signal: ntAbort.signal, credentials: "omit" });
        const j = await res.json();
        ntSugg = (j[1] || []).slice(0, 4);
        if (nt && nt.input.value.trim() === q) ntRender(true);
      } catch {}
    }, 140);
  }

  function ntActivate(r) {
    if (!r || !nt) return;
    const text = r.text;
    nt.input.value = "";
    ntSugg = [];
    ntHold = Date.now() + 1500; // don't flash the bar again while the tab starts loading
    if (r.kind === "url") openTrustedLinkIn(/^https?:\/\//i.test(text) ? text : "https://" + text, "current");
    else if (r.kind === "search") openTrustedLinkIn(searchUrl(text), "current");
    else openWebChat(text);
    nt.el.hidden = true;
  }

  function buildNt() {
    const inIcon = h("span", { className: "pgs-nt-inicon" }, icon("chat"));
    const input = h("input", { className: "pgs-nt-input", placeholder: "Search or ask anything", spellcheck: false, autocomplete: "off" });
    input.addEventListener("input", () => { ntSel = 0; ntRender(); ntSuggest(); });
    input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      const n = Math.max(1, ntRows.length);
      if (e.key === "ArrowDown") { e.preventDefault(); ntSel = (ntSel + 1) % n; ntMarkSel(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); ntSel = (ntSel - 1 + n) % n; ntMarkSel(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const q = input.value.trim();
        if (!q) return;
        if (e.metaKey && e.shiftKey) ntActivate({ kind: "search", text: q });
        else if (e.metaKey && e.ctrlKey) ntActivate({ kind: "chat", text: q });
        else ntActivate(ntRows[ntSel]);
      } else if (e.key === "Escape" && input.value) { input.value = ""; ntSugg = []; ntRender(); }
    });
    const list = h("div", { className: "pgs-nt-list", hidden: true });
    const go = h("button", { className: "pgs-nt-go", onclick: () => ntActivate(ntRows[ntSel]) },
      document.createTextNode("Chat "), h("span", { className: "pgs-nt-gokbd", textContent: "↵" }));
    const card = h("div", { className: "pgs-nt-card" },
      h("div", { className: "pgs-nt-inrow" }, inIcon, input), list,
      h("div", { className: "pgs-nt-bottom" }, h("span", { className: "pgs-nt-hint", textContent: "Chat searches the web, then answers with your local model" }), go));
    const el = h("div", { id: "pgs-nt", hidden: true }, h("div", { className: "pgs-nt-orb" }), card);
    document.documentElement.append(el);
    nt = { el, input, list, inIcon, go };
  }

  function updateNt() {
    const tab = gBrowser.selectedTab;
    const show = pref("newtab", "on") !== "off" && Date.now() > ntHold && isBlankTab(tab);
    if (!show) { if (nt && !nt.el.hidden) nt.el.hidden = true; return; }
    if (!nt) buildNt();
    const r = gBrowser.selectedBrowser.getBoundingClientRect();
    Object.assign(nt.el.style, {
      left: `${Math.round(r.left)}px`, top: `${Math.round(r.top)}px`,
      width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px`,
    });
    if (nt.el.hidden) {
      nt.el.hidden = false;
      nt.input.value = "";
      ntSugg = [];
      ntRender();
      setTimeout(() => nt?.input.focus(), 40);
    }
  }

  const tick = () => {
    updateNt();
    for (const x of [...sessions.values()]) if (x.docked) x.sync();
  };

  function toggle() {
    if (nt && !nt.el.hidden) { nt.input.focus(); return; }
    const s = current();
    if (s?.web) { s.focus(); return; }
    if (s) return s.visible ? s.dismiss() : s.restore(); // dismissed chats come back as they were
    const url = pageUrl();
    if (!url) return;
    const tab = gBrowser.selectedTab;
    const ns = makeSession(tab);
    sessions.set(tab, ns);
    ns.open();
  }

  const onKey = (e) => {
    if (isToggleKey(e)) { e.preventDefault(); e.stopPropagation(); toggle(); }
    else if (e.key === "Escape" && e.target?.closest?.("#pgs-panel")) { const c = current(); if (c && !c.docked) c.dismiss(); }
  };
  const syncAll = () => sessions.forEach((x) => x.sync());
  const onSelect = () => { syncAll(); updateNt(); setTimeout(syncAll, 120); setTimeout(syncAll, 450); };
  const onTabClose = (e) => sessions.get(e.target)?.close(true);
  const onResize = () => syncAll();

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
  gBrowser.tabContainer.addEventListener("TabClose", onTabClose);
  ticker = setInterval(tick, 300);

  // toolbar button (created once per session, shared across windows)
  const { CustomizableUI } = ChromeUtils.importESModule("resource:///modules/CustomizableUI.sys.mjs");
  if (!CustomizableUI.getWidget(ID)?.provider) {
    CustomizableUI.createWidget({
      id: ID,
      type: "button",
      label: "Summarize page",
      tooltiptext: `Summarize this page (${SHORTCUT})`,
      defaultArea: CustomizableUI.AREA_NAVBAR,
      onCommand(e) { e.target.ownerGlobal.__pageSummary?.toggle(); },
    });
  }

  window.__pageSummary = {
    toggle,
    destroy() {
      for (const s of [...sessions.values()]) s.close(true);
      clearInterval(ticker);
      clearTimeout(ntTimer);
      nt?.el.remove();
      styleEl.remove();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
      gBrowser.tabContainer.removeEventListener("TabClose", onTabClose);
      delete window.__pageSummary;
    },
  };
  console.log("[page-summary] loaded v1.6");
})();
