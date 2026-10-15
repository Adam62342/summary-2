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
  // shown instead of CHIPS when the panel is open on a YouTube video
  const YT_CHIPS = [
    ["Summarize", "Summarize this video in 5-7 concise bullet points. Do not include any timestamps."],
    ["Key moments", "Identify the most important moments across the ENTIRE video, from start to finish. Give 6-10 bullets total — never one per line, and do not stop partway through. Group related content into a single moment. Begin each bullet with that moment's [mm:ss] timestamp, then a short one-line description. Bold at most one key term per bullet."],
    ["Takeaways", "What are the main takeaways from this video? Answer in a few concise bullet points with no timestamps."],
    ["TL;DR", "Give a two-sentence TL;DR of this video. No timestamps."],
  ];
  const ICONS = {
    new: "M7 3H4.5A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5V9M11.3 2.7l2 2L8 10l-2.7.7L6 8z",
    close: "M4 4l8 8M12 4l-8 8",
    send: "M8 13V3M3.5 7.5L8 3l4.5 4.5",
    win: "M5.5 2.5h8v8M2.5 5.5h8v8h-8z",
    stop: "M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z",
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
@keyframes pgs-msg {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
#pgs-panel .pgs-answer { line-height: 1.5; }
#pgs-panel .pgs-msg p { margin: 0 0 10px; }
#pgs-panel .pgs-msg p:last-child { margin-bottom: 0; }
#pgs-panel .pgs-msg ul, #pgs-panel .pgs-msg ol { margin: 0 0 8px; padding-inline-start: 20px; }
#pgs-panel .pgs-msg ul:last-child, #pgs-panel .pgs-msg ol:last-child { margin-bottom: 0; }
#pgs-panel .pgs-msg li { margin: 0 0 9px; padding-inline-start: 3px; line-height: 1.5; }
#pgs-panel .pgs-msg li:last-child { margin-bottom: 0; }
#pgs-panel .pgs-msg li::marker { color: color-mix(in srgb, var(--pgs-fg) 40%, transparent); }

#pgs-panel .pgs-ug {
  align-self: flex-end; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
  max-width: 88%; transform-origin: bottom right;
}
#pgs-panel .pgs-ubub {
  padding: 8px 16px; border-radius: 20px 20px 6px 20px; white-space: pre-wrap;
  background: color-mix(in srgb, var(--pgs-fg) 12%, transparent);
}

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
/* "thinking" dots shown before the first token streams in */
#pgs-panel .pgs-dots { display: inline-flex; gap: 5px; align-items: center; padding: 3px 0 1px; }
#pgs-panel .pgs-dots i {
  width: 6px; height: 6px; border-radius: 50%;
  background: color-mix(in srgb, var(--pgs-fg) 50%, transparent);
  animation: pgs-bounce 1.25s ease-in-out infinite;
}
#pgs-panel .pgs-dots i:nth-child(2) { animation-delay: 0.16s; }
#pgs-panel .pgs-dots i:nth-child(3) { animation-delay: 0.32s; }
@keyframes pgs-bounce { 0%, 75%, 100% { opacity: 0.3; transform: translateY(0); } 38% { opacity: 0.95; transform: translateY(-4px); } }
/* a few lines pile up, then ease in together as one smooth block */
#pgs-panel .pgs-chunk-in { animation: pgs-chunk 0.65s var(--pgs-ease) both; }
@keyframes pgs-chunk { from { opacity: 0; filter: blur(1px); } to { opacity: 1; filter: blur(0); } }
#pgs-panel .pgs-mini {
  appearance: none; background: transparent; color: inherit; border: none; cursor: pointer;
  font: inherit; font-size: 12px; padding: 2px 8px; border-radius: 7px; opacity: 0.5;
}
#pgs-panel .pgs-mini:hover { opacity: 1; background: var(--pgs-soft); }

/* composer */
#pgs-panel .pgs-foot { flex: none; padding: 8px 12px 12px; animation: pgs-msg 0.45s var(--pgs-ease) both; }
#pgs-panel .pgs-foot[hidden] { display: none; }
#pgs-panel .pgs-composer {
  position: relative;
  display: flex; flex-direction: column; gap: 6px; padding: 12px 10px 10px 16px;
  border: 1px solid var(--pgs-line); border-radius: 14px; background: var(--pgs-soft);
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
#pgs-panel .pgs-row { position: relative; display: flex; align-items: center; gap: 8px; }
#pgs-panel .pgs-chips { flex: 1; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
#pgs-panel .pgs-chip {
  appearance: none; background: transparent; color: inherit; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--pgs-line); border-radius: 999px; padding: 3px 11px; font: inherit; font-size: 12px; opacity: 0.7;
}
#pgs-panel .pgs-chip:hover { opacity: 1; background: var(--pgs-soft); }
/* "+" add-context button + its popover menu */
#pgs-panel .pgs-add {
  appearance: none; flex: none; cursor: pointer; width: 26px; height: 26px; border-radius: 50%;
  border: 1px solid var(--pgs-line); background: transparent; color: inherit; opacity: 0.7;
  font: 400 18px/1 system-ui, sans-serif; display: grid; place-items: center; padding: 0 0 2px;
  transition: background-color 0.15s ease, opacity 0.15s ease, transform 0.15s var(--pgs-ease);
}
#pgs-panel .pgs-add:hover { opacity: 1; background: var(--pgs-soft); }
#pgs-panel .pgs-add:active { transform: scale(0.9); }
#pgs-panel .pgs-menu {
  position: absolute; bottom: calc(100% + 8px); left: 0; z-index: 10; min-width: 220px; max-width: 300px;
  max-height: 320px; overflow-y: auto; scrollbar-width: thin; padding: 6px;
  background: color-mix(in srgb, var(--pgs-bg) 96%, transparent); backdrop-filter: blur(30px) saturate(1.5);
  border: 1px solid var(--pgs-line); border-radius: 14px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  animation: pgs-msg 0.22s var(--pgs-ease) both;
}
#pgs-panel .pgs-menu-item {
  display: block; width: 100%; text-align: left; appearance: none; border: none; cursor: pointer;
  background: transparent; color: inherit; font: inherit; font-size: 13px; padding: 7px 10px; border-radius: 9px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#pgs-panel .pgs-menu-item:hover { background: var(--pgs-soft); }
#pgs-panel .pgs-menu-item.pgs-menu-active { background: var(--pgs-soft); }
#pgs-panel .pgs-menu-tab { display: flex; align-items: center; gap: 9px; }
#pgs-panel .pgs-menu-fav {
  flex: none; width: 16px; height: 16px; border-radius: 4px; object-fit: cover;
}
#pgs-panel .pgs-menu-fav-x {
  display: grid; place-items: center; font-size: 9px; font-weight: 700;
  background: color-mix(in srgb, var(--pgs-fg) 16%, transparent); color: var(--pgs-fg);
}
#pgs-panel .pgs-menu-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#pgs-panel .pgs-menu-sep { font-size: 11px; opacity: 0.5; padding: 8px 10px 3px; }
#pgs-panel .pgs-addnote { font-size: 12px; opacity: 0.6; padding: 4px 2px 0; animation: pgs-fade 0.3s ease both; }
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
#pgs-panel .pgs-win-btn { display: none; }
#pgs-panel.pgs-docked .pgs-win-btn { display: grid; }

/* stop button + inline bits */
#pgs-panel .pgs-svg-fill { fill: currentColor; stroke: none; }
#pgs-panel .pgs-answer code { font: 0.9em ui-monospace, Menlo, monospace; padding: 1px 5px; border-radius: 5px; background: var(--pgs-soft); }
#pgs-panel .pgs-ts {
  color: color-mix(in srgb, var(--pgs-fg) 58%, transparent); cursor: pointer; text-decoration: none;
  font-variant-numeric: tabular-nums; font-size: 0.85em; font-weight: 550; white-space: nowrap;
  background: color-mix(in srgb, var(--pgs-fg) 8%, transparent); border-radius: 5px; padding: 1px 5px;
  margin-inline-end: 3px; transition: color 0.12s ease, background 0.12s ease;
}
#pgs-panel .pgs-ts:hover { color: var(--pgs-fg); background: color-mix(in srgb, var(--pgs-fg) 16%, transparent); }
#pgs-panel .pgs-link {
  color: var(--pgs-accent); cursor: pointer; text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--pgs-accent) 35%, transparent); word-break: break-word;
}
#pgs-panel .pgs-link:hover { border-bottom-color: var(--pgs-accent); }
#pgs-panel .pgs-answer .pgs-h { font-weight: 650; font-size: 0.95em; margin: 14px 0 6px; opacity: 0.92; }
#pgs-panel .pgs-answer > .pgs-h:first-child { margin-top: 0; }

/* ----- attachment stack: page card (back) + selected text (on top); fans out on hover ----- */
#pgs-panel { --cw: 62px; --ch: 80px; --pgs-spring: cubic-bezier(0.34, 1.5, 0.64, 1); }
#pgs-panel .pgs-attach { display: block; }
#pgs-panel .pgs-attach[hidden] { display: none; }
#pgs-panel .pgs-stack {
  position: relative; max-width: 100%; height: calc(var(--ch) + 26px);
  width: calc(var(--cw) + (var(--n, 1) - 1) * 8px + 30px);
  transition: width 0.5s var(--pgs-spring);
}
#pgs-panel .pgs-stack:hover { width: calc(var(--n, 1) * (var(--cw) + 10px) + 18px); }
#pgs-panel .pgs-att { box-sizing: border-box; width: var(--cw); height: var(--ch); }
#pgs-panel .pgs-stack .pgs-att {
  position: absolute; z-index: calc(var(--i, 0) + 1);
  left: calc(15px + var(--i, 0) * 8px); top: calc(13px + var(--dy, 0px));
  transform: rotate(var(--rot, 0deg));
  transition: left 0.5s var(--pgs-spring), transform 0.5s var(--pgs-spring);
}
#pgs-panel .pgs-stack:hover .pgs-att {
  left: calc(9px + var(--i, 0) * (var(--cw) + 10px));
  transform: rotate(calc(var(--rot, 0deg) * 0.25));
}
#pgs-panel .pgs-att-in { animation: pgs-att-in 0.55s var(--pgs-spring) backwards; }
@keyframes pgs-att-in { from { opacity: 0; transform: translateY(16px) scale(0.6) rotate(0deg); } }
#pgs-panel .pgs-att-out { animation: pgs-att-out 0.22s ease forwards; pointer-events: none; }
@keyframes pgs-att-out { to { opacity: 0; transform: translateY(-10px) scale(0.6) rotate(0deg); } }
#pgs-panel .pgs-att-face {
  position: absolute; inset: 0; overflow: hidden; border-radius: 14px;
  background: color-mix(in srgb, var(--pgs-fg) 11%, var(--pgs-bg)); background-size: cover; background-position: center top;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--pgs-fg) 18%, transparent), 0 8px 18px rgba(0, 0, 0, 0.28);
}
#pgs-panel .pgs-att-face > .pgs-att-badge {
  position: absolute; left: 6px; bottom: 6px; width: 20px; height: 20px; border-radius: 6px; overflow: hidden;
  display: grid; place-items: center; background: var(--pgs-bg); font-size: 11px; font-weight: 700;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.4);
}
#pgs-panel .pgs-att-fav { width: 14px; height: 14px; border-radius: 3px; }
#pgs-panel .pgs-att-fallback { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; padding: 4px; }
#pgs-panel .pgs-att-fallback .pgs-att-badge { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--pgs-bg); font-size: 15px; font-weight: 700; overflow: hidden; }
#pgs-panel .pgs-att-fallback .pgs-att-fav { width: 20px; height: 20px; }
#pgs-panel .pgs-att-host { font-size: 9px; opacity: 0.7; text-align: center; word-break: break-all; line-height: 1.2; }
#pgs-panel .pgs-att-text .pgs-att-face,
#pgs-panel .pgs-att-clip .pgs-att-face,
#pgs-panel .pgs-att-moment .pgs-att-face { padding: 7px 7px 6px; background: color-mix(in srgb, var(--pgs-fg) 15%, var(--pgs-bg)); }
#pgs-panel .pgs-att-tag {
  font-size: 7.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
  opacity: 0.6; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#pgs-panel .pgs-att-q { font: 700 22px/0.8 Georgia, serif; opacity: 0.45; margin-bottom: 3px; }
#pgs-panel .pgs-att-snip {
  font-size: 8.5px; line-height: 1.32; opacity: 0.88; word-break: break-word; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical;
}
#pgs-panel .pgs-att-x {
  position: absolute; top: -7px; right: -7px; z-index: 3; width: 20px; height: 20px; border-radius: 50%; border: 0; padding: 0;
  background: var(--pgs-fg); color: var(--pgs-bg); font-size: 9px; line-height: 1; cursor: pointer;
  opacity: 0; transform: scale(0.6); pointer-events: none; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: opacity 0.15s ease, transform 0.3s var(--pgs-spring);
}
#pgs-panel .pgs-stack:hover .pgs-att:hover .pgs-att-x { opacity: 1; transform: scale(1); pointer-events: auto; }

/* the same cards inside a sent message */
#pgs-panel .pgs-sent { display: flex; justify-content: flex-end; gap: 10px; padding: 8px 6px 4px; }
#pgs-panel .pgs-sent .pgs-att { position: relative; flex: none; transform: rotate(var(--rot, 0deg)); }
#pgs-panel .pgs-sent .pgs-att-x { display: none; }

/* magnetic corner snap */
#pgs-panel.pgs-snapping {
  transition: left 0.45s cubic-bezier(0.34, 1.45, 0.64, 1), top 0.45s cubic-bezier(0.34, 1.45, 0.64, 1),
    opacity 0.22s ease, transform 0.32s var(--pgs-ease), visibility 0s;
}

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
  // Apple's on-device model has a tiny context (chunk hard); other local models (Ollama/llama,
  // etc.) handle far more, so give them a big window to avoid slow multi-part map-reduce.
  const chunkSize = () => parseInt(pref("maxchars", ""), 10) || (provider() === "apple" ? 6000 : isLocal() ? 16000 : MAX_CHARS);

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

  // ---------- YouTube transcript ----------
  // On a video page the DOM text is just chrome/comments, so we read the captions instead.
  const ytId = (url) => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^(www|m|music)\./, "");
      if (host === "youtu.be") return (u.pathname.slice(1).match(/^[\w-]{11}/) || [])[0] || null;
      if (host !== "youtube.com") return null;
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      return m ? m[1] : null;
    } catch { return null; }
  };

  const ytTime = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s % 60).padStart(2, "0");
  };

  // Runs INSIDE the YouTube tab. Caption files are now bot-gated (pot token) and the get_transcript
  // API returns 400, but YouTube's own "Show transcript" panel still works because the page mints a
  // valid token itself. So we open that panel and read the rendered segments straight from the DOM.
  function extractYouTubeTranscript() {
    const send = (d) => sendAsyncMessage("page-summary:text", d);
    const win = content.wrappedJSObject;       // the page's real window/DOM — bypasses the Xray
    const pdoc = win.document;                 //   wrapper that hides custom-element contents
    const sleep = (ms) => new Promise((r) => content.setTimeout(r, ms));
    const toArr = (nl) => { const a = []; if (nl) for (let i = 0; i < nl.length; i++) a.push(nl[i]); return a; };
    const toMs = (txt) => {
      const p = (txt || "").trim().split(":").map(Number);
      if (!p.length || p.some((n) => isNaN(n))) return 0;
      const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0);
      return s * 1000;
    };
    let hostCount = 0;
    let panelPeek = "";
    const readSegs = () => {
      let hosts = toArr(pdoc.querySelectorAll("ytd-transcript-segment-renderer, yt-transcript-segment-renderer"));
      if (!hosts.length) hosts = toArr(pdoc.querySelectorAll("[class*='transcript-segment-renderer'], [class*='transcript-segment']"));
      hostCount = hosts.length;
      const out = [];
      for (const n of hosts) {
        const tsEl = n.querySelector(".segment-timestamp, [class*='timestamp']");
        const txEl = n.querySelector(".segment-text, [class*='segment-text']");
        let ts = ((tsEl && tsEl.textContent) || "").trim();
        let raw = ((txEl && txEl.textContent) || "").replace(/\s+/g, " ").trim();
        if (!raw) {
          // class names may have changed — fall back to the whole row and split off the timestamp
          raw = ((n.innerText || n.textContent) || "").replace(/\s+/g, " ").trim();
          const m = raw.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+([\s\S]+)$/);
          if (m) { ts = ts || m[1]; raw = m[2]; }
        }
        raw = raw.trim();
        if (raw) out.push([toMs(ts), raw]);
      }
      return out;
    };
    // DOM-tag-agnostic fallback: read the opened transcript panel's text and parse every line that
    // starts with an mm:ss timestamp. Survives YouTube renaming its segment elements.
    // Parse a transcript panel's visible text into [ms, text] rows. Handles both layouts: timestamp
    // and text on one line ("0:04 hello"), AND timestamp on its own line with the text following it
    // (YouTube commonly renders it that way) — otherwise we'd read zero rows and report "no captions".
    const parsePanelText = (txt) => {
      const rows = [];
      let cur = null;
      for (const raw of txt.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        const m = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
        if (m) { if (cur) rows.push(cur); cur = [toMs(m[1]), m[2].trim()]; }
        else if (cur) cur[1] = (cur[1] + " " + line).replace(/\s+/g, " ").trim();
      }
      if (cur) rows.push(cur);
      return rows.filter((r) => r[1]); // drop stray timestamps that never got any text
    };
    const readFromPanel = () => {
      const specific = pdoc.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
      const list = specific ? [specific] : [];
      for (const el of toArr(pdoc.querySelectorAll('ytd-engagement-panel-section-list-renderer,[class*="engagement-panel"],[class*="transcript"]'))) {
        if (el !== specific) list.push(el);
      }
      let best = [];
      for (const p of list) {
        const txt = ((p.innerText || p.textContent) || "").trim();
        if (!txt || !/\d{1,2}:\d{2}/.test(txt)) continue;
        const rows = parsePanelText(txt);
        if (!panelPeek && rows.length) panelPeek = txt.slice(0, 300);
        if (p === specific && rows.length >= 3) return rows; // the real transcript panel wins outright
        if (rows.length > best.length) best = rows;
      }
      return best.length >= 3 ? best : [];
    };
    // find the "Show transcript" button WITHOUT relying on English text — prefer the structural
    // location (description's transcript section), then fall back to a language-independent scan
    // of button/link/menu labels (covers the ⋯ actions-menu item on newer layouts)
    const WORDS = ["transcript", "přepis", "prepis", "transkript", "stenogram", "transcripción", "transcription", "trascrizione", "transkription", "文字起こし", "トランスクリプト", "字幕", "자막", "트랜스크립트", "расшифровка", "стенограма"];
    const hasWord = (el) => {
      const t = (((el.getAttribute && el.getAttribute("aria-label")) || "") + " " + (el.textContent || "")).toLowerCase();
      return WORDS.some((w) => t.includes(w));
    };
    const findBtn = () => {
      for (const s of [
        "ytd-video-description-transcript-section-renderer button",
        "ytd-video-description-transcript-section-renderer ytd-button-renderer",
        "[class*='transcript-section'] button",
        'button[aria-label*="transcript" i]',
        'button[aria-label*="přepis" i]',
      ]) { const b = pdoc.querySelector(s); if (b) return b; }
      for (const el of toArr(pdoc.querySelectorAll("button, tp-yt-paper-button, yt-button-shape button, ytd-button-renderer, a, ytd-menu-service-item-renderer, tp-yt-paper-item, yt-list-item-view-model"))) {
        if (hasWord(el)) return el;
      }
      return null;
    };
    // open the ⋯ "More actions" menu (next to Like/Share) so its "Show transcript" item renders
    const openMoreMenu = () => {
      for (const s of [
        'ytd-watch-metadata #actions ytd-menu-renderer button[aria-label*="More actions" i]',
        'button[aria-label*="More actions" i]',
        'button[aria-label*="Další akce" i]',
        'button[aria-label*="その他の操作" i]',
        'button[aria-label*="더보기" i]',
        'ytd-watch-metadata ytd-menu-renderer yt-icon-button',
        '#actions ytd-menu-renderer #button',
      ]) {
        const mb = pdoc.querySelector(s);
        if (mb) { try { (mb.tagName === "BUTTON" ? mb : (mb.querySelector && mb.querySelector("button")) || mb).click(); } catch (e) {} return true; }
      }
      return false;
    };

    (async () => {
      const info = { youtube: true, url: pdoc.location.href, title: (pdoc.title || "").replace(/\s*[-–—]\s*YouTube\s*$/, "") };
      try {
        try {
          const vd = (win.ytInitialPlayerResponse || {}).videoDetails || {};
          if (vd.title) info.title = vd.title;
          info.author = vd.author || "";
          info.seconds = +vd.lengthSeconds || 0;
        } catch (e) {}

        let segs = readSegs();
        if (!segs.length) segs = readFromPanel();
        if (!segs.length) {
          // expand the description so its transcript section renders (scope to the description's own
          // "…more"/"…více" expander so we don't accidentally hit a comment's expander)
          for (const sel of ["ytd-watch-metadata #expand", "#description #expand", "#description-inline-expander #expand", "ytd-text-inline-expander #expand", "tp-yt-paper-button#expand"]) {
            const ex = pdoc.querySelector(sel);
            if (ex) { try { ex.click(); } catch (e) {} info.expanded = true; break; }
          }
          // wait for the transcript button to render, then click the actual <button> inside it
          let btn = null;
          for (let i = 0; i < 20 && !btn; i++) { btn = findBtn(); if (!btn) await sleep(250); }
          // newer layouts hide "Show transcript" behind the ⋯ actions menu instead of the description
          if (!btn) {
            info.triedMenu = openMoreMenu();
            for (let i = 0; i < 16 && !btn; i++) { await sleep(200); btn = findBtn(); }
          }
          info.foundButton = !!btn;
          if (btn) {
            const clickIt = () => {
              const c = btn.tagName === "BUTTON" ? btn : (btn.querySelector && btn.querySelector("button")) || btn;
              try { c.click(); } catch (e) {}
            };
            clickIt();
            // read via the segment elements first, then the panel's raw text; keep polling until the
            // transcript stops growing, so we capture the whole thing (not a half-rendered first chunk)
            let stable = 0, reclicked = false;
            for (let i = 0; i < 52; i++) {
              await sleep(250);
              let r = readSegs();
              if (!r.length) { r = readFromPanel(); if (r.length) info.viaPanel = true; }
              if (r.length > segs.length) { segs = r; stable = 0; }
              else if (segs.length && ++stable >= 3) break; // held steady ~0.75s → fully loaded
              // if, after ~2s, nothing opened at all, the first click likely didn't register — retry
              // once (but only when no transcript panel has appeared, so we never toggle an open one shut)
              if (!segs.length && !reclicked && i === 8) {
                const op = pdoc.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
                const hasRows = op && /\d{1,2}:\d{2}/.test((op.innerText || op.textContent || ""));
                if (!hasRows) { reclicked = true; btn = findBtn() || btn; clickIt(); }
              }
            }
            // tidy up: close the panel we opened
            try {
              const panel = pdoc.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
              const close = panel && panel.querySelector('button[aria-label*="Close" i], button[aria-label*="Zavřít" i], button[aria-label*="閉じる"]');
              if (close) { try { close.click(); } catch (e) {} }
            } catch (e) {}
          }
        }
        info.hostCount = hostCount;
        info.panelPeek = panelPeek;
        info.segs = segs;
        if (!segs.length) info.noPanel = true;
        send(info);
      } catch (e) {
        info.error = String((e && e.message) || e);
        send(info);
      }
    })();
  }

  async function getYouTubeTranscript(browser, pageUrl, forceStamps) {
    const mm = browser.messageManager;
    const data = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { mm.removeMessageListener(MSG, listener); reject(new Error("timeout")); }, 30000);
      const listener = (m) => { clearTimeout(timer); mm.removeMessageListener(MSG, listener); resolve(m.data); };
      mm.addMessageListener(MSG, listener);
      mm.loadFrameScript("data:application/javascript," + encodeURIComponent(`(${extractYouTubeTranscript.toString()})()`), false);
    });
    console.log("[page-summary] yt transcript:", { segments: data?.segs?.length || 0, segmentRows: data?.hostCount, foundButton: data?.foundButton, expanded: data?.expanded, triedMenu: data?.triedMenu, viaPanel: data?.viaPanel, noPanel: data?.noPanel, panelPeek: data?.panelPeek, error: data?.error });
    if (data?.error) throw new Error(data.error);
    const segs = data?.segs || [];
    if (!segs.length) {
      const e = new Error("couldn't open a transcript for this video (it may not have captions)");
      e.noCaptions = true;
      throw e;
    }
    const stamps = forceStamps || pref("yttimestamps", "true") !== "false";
    const title = data.title || "YouTube video";
    // merge the granular ~2s caption lines into larger blocks: far less text (faster for a local
    // model) and far fewer timestamps, so a plain summary stays clean and "key moments" groups
    // naturally instead of firing a bullet every few seconds
    const blocks = [];
    let cur = null;
    for (const [t, text] of segs) {
      if (!cur || t - cur.t > 40000 || cur.text.length > 400) { cur = { t, text }; blocks.push(cur); }
      else cur.text += " " + text;
    }
    const lines = blocks.map((b) => (stamps ? `[${ytTime(b.t)}] ${b.text}` : b.text));
    // the video's real length — used to tell the model its upper bound and to drop any
    // timestamp it invents beyond the end of the video
    const seconds = data.seconds || (blocks.length ? Math.round(blocks[blocks.length - 1].t / 1000) : 0);
    const head =
      `Video title: ${title}` +
      (data.author ? `\nChannel: ${data.author}` : "") +
      (seconds ? `\nLength: ${ytTime(seconds * 1000)} (the video ends at ${ytTime(seconds * 1000)} — no timestamp can be later than this)` : "") +
      `\n\nThis is the spoken transcript of the video` +
      (stamps ? " (each line is prefixed with its real [mm:ss] timestamp — only ever cite timestamps copied exactly from these lines)" : "") + ":\n";
    return { title, url: pageUrl, text: head + lines.join("\n"), youtube: true, seconds };
  }

  async function getPageText(browser) {
    const vid = ytId(browser.currentURI.spec);
    if (vid) return getYouTubeTranscript(browser, browser.currentURI.spec); // throws on no transcript (handled by caller)
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

  async function* streamLLM(msgs, signal) {
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
        ? { model: model(), max_tokens: 1024, stream: true, system: SYSTEM, messages: msgs }
        : { model: model(), stream: true, messages: [{ role: "system", content: SYSTEM }, ...msgs] }
    );
    for await (const j of sseEvents(chunks(url, headers, body, signal))) {
      const d = anthropic ? (j.type === "content_block_delta" ? j.delta?.text : "") : j.choices?.[0]?.delta?.content;
      if (d) yield d;
    }
  }

  // ---------- context building ----------
  // Reduce long text to its most informative lines/sentences with a cheap local TF ranking (no
  // LLM), so a long video/page is summarized in ONE model pass instead of many slow map-reduce
  // calls. Keeps original order (and any leading [mm:ss] timestamps) so "key moments" still work.
  function condense(text, budget) {
    if (text.length <= budget) return text;
    let units = text.split("\n").map((s) => s.trim()).filter(Boolean);
    if (units.length < 6) units = (text.match(/[^.!?。！？]+[.!?。！？]+/g) || [text]).map((s) => s.trim()).filter(Boolean);
    const stop = new Set(
      "the and for with that this from which who his her their has have had not but also than then into over after before are was were been its they you your".split(" ")
    );
    const words = (s) => (s.toLowerCase().match(/[\p{L}']{3,}/gu) || []).filter((w) => !stop.has(w));
    const freq = new Map();
    for (const u of units) for (const w of words(u)) freq.set(w, (freq.get(w) || 0) + 1);
    const scored = units
      .map((u, i) => {
        const ws = words(u);
        return { u, i, score: ws.reduce((a, w) => a + (freq.get(w) || 0), 0) / Math.sqrt(ws.length || 1) };
      })
      .sort((a, b) => b.score - a.score);
    const picked = [];
    let used = 0;
    for (const s of scored) {
      if (used + s.u.length + 1 > budget) continue;
      picked.push(s);
      used += s.u.length + 1;
      if (used >= budget * 0.98) break;
    }
    picked.sort((a, b) => a.i - b.i);
    return picked.map((s) => s.u).join("\n");
  }

  function buildContext(page, signal, setStatus) {
    const size = chunkSize();
    if (page.text.length <= size) return page.text;
    setStatus("Condensing…");
    return condense(page.text, size);
  }

  // ---------- minimal markdown -> DOM ----------
  const tsToSeconds = (ts) => {
    const p = ts.split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0);
  };
  const TS_RE = /\[?\b(\d{1,2}:\d{2}(?::\d{2})?)\b\]?/g;
  // tokens inline() breaks on: **bold**, `code`, [md](link), and bare http(s) URLs
  const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<>()]+)/;

  // open a URL from an answer in a new tab (model output is untrusted → web principal)
  function openLink(url) {
    try { openWebLinkIn(url, "tab", { triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}) }); return; } catch (e) {}
    try { gBrowser.selectedTab = gBrowser.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}) }); } catch (e) {}
  }
  const linkEl = (url, text) => h("a", {
    className: "pgs-link", textContent: text, href: "#", title: url,
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); openLink(url.replace(/[.,;:]+$/, "")); },
  });

  // jump the video (in its tab) to a timestamp — no reload, just set the player's currentTime
  function seekVideo(browser, seconds) {
    if (!browser) return;
    try { const tab = gBrowser.getTabForBrowser(browser); if (tab) gBrowser.selectedTab = tab; } catch (e) {}
    const code = `(() => { try { const v = content.document.querySelector("video.html5-main-video, video"); if (v) { v.currentTime = ${Number(seconds) || 0}; if (v.paused) v.play(); } } catch (e) {} })()`;
    try { browser.messageManager.loadFrameScript("data:application/javascript," + encodeURIComponent(code), false); } catch (e) {}
  }

  // read the current playback position (seconds) of the tab's <video>, for the "this moment" card
  function getVideoTime(browser) {
    return new Promise((resolve) => {
      const mm = browser?.messageManager;
      if (!mm) { resolve(0); return; }
      const timer = setTimeout(() => { try { mm.removeMessageListener(MSG, l); } catch (e) {} resolve(0); }, 2500);
      const l = (m) => { clearTimeout(timer); mm.removeMessageListener(MSG, l); resolve(Number(m.data?.t) || 0); };
      mm.addMessageListener(MSG, l);
      const code = `(() => { try { const v = content.document.querySelector("video.html5-main-video, video"); sendAsyncMessage(${JSON.stringify(MSG)}, { t: v ? v.currentTime : 0 }); } catch (e) { sendAsyncMessage(${JSON.stringify(MSG)}, { t: 0 }); } })()`;
      try { mm.loadFrameScript("data:application/javascript," + encodeURIComponent(code), false); } catch (e) { clearTimeout(timer); resolve(0); }
    });
  }

  // seek is an optional (seconds) => void; when given, [mm:ss] / mm:ss become clickable jump links
  const inline = (s, seek) =>
    s.split(INLINE_RE).filter(Boolean).flatMap((t) => {
      if (t.startsWith("**") && t.endsWith("**") && t.length > 4) return [h("strong", { textContent: t.slice(2, -2) })];
      if (t.startsWith("`") && t.endsWith("`") && t.length > 2) return [h("code", { textContent: t.slice(1, -1) })];
      const md = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (md) return [linkEl(md[2], md[1])];
      if (/^https?:\/\//.test(t)) return [linkEl(t, t)];
      if (!seek) return [document.createTextNode(t)];
      const out = [];
      let last = 0, m;
      TS_RE.lastIndex = 0;
      while ((m = TS_RE.exec(t))) {
        if (m.index > last) out.push(document.createTextNode(t.slice(last, m.index)));
        const secs = tsToSeconds(m[1]);
        out.push(h("a", {
          className: "pgs-ts", textContent: m[1], href: "#", title: `Jump to ${m[1]}`,
          onclick: (e) => { e.preventDefault(); e.stopPropagation(); seek(secs); },
        }));
        last = m.index + m[0].length;
      }
      if (!out.length) return [document.createTextNode(t)];
      if (last < t.length) out.push(document.createTextNode(t.slice(last)));
      return out;
    });

  function renderMd(el, text, seek, fadeStart = Infinity) {
    el.replaceChildren();
    // render a line's content, wrapping only the characters newer than `fadeStart` in a fade
    // span so each freshly-streamed slice eases in (settled text re-renders solid, no flicker)
    const frag = (content, cStart) => {
      const from = fadeStart === Infinity ? Infinity : Math.max(0, fadeStart - cStart);
      if (from >= content.length) return inline(content, seek);
      if (from <= 0) return [h("span", { className: "pgs-chunk-in" }, ...inline(content, seek))];
      return [
        ...inline(content.slice(0, from), seek),
        h("span", { className: "pgs-chunk-in" }, ...inline(content.slice(from), seek)),
      ];
    };
    let list = null, kind = null, off = 0;
    for (const raw of text.split("\n")) {
      const start = off;
      off += raw.length + 1; // +1 for the "\n" we split on
      const line = raw.trim();
      const ul = line.match(/^[-*•]\s+(.*)/);
      const ol = line.match(/^\d+[.)]\s+(.*)/);
      const hd = line.match(/^#{1,4}\s+(.*)/);
      if (ul || ol) {
        const tag = ul ? "ul" : "ol";
        if (!list || kind !== tag) { list = h(tag); kind = tag; el.append(list); }
        const content = (ul || ol)[1];
        list.append(h("li", {}, ...frag(content, start + raw.indexOf(content))));
      } else if (hd) {
        list = null;
        el.append(h("p", { className: "pgs-h" }, ...frag(hd[1], start + raw.indexOf(hd[1]))));
      } else if (line) {
        list = null;
        el.append(h("p", {}, ...frag(line, start + raw.indexOf(line))));
      } else {
        list = null;
      }
    }
  }

  // The local model likes to invent [mm:ss] stamps past the end of the video. Scrub the answer
  // before it's shown: if the user wanted timestamps, drop any line that cites a time beyond the
  // video length (hallucinated); if they didn't, strip stamps out of the prose entirely.
  function scrubStamps(text, maxSeconds, wantTs) {
    const TOK = /\[?\b(\d{1,2}:\d{2}(?::\d{2})?)\b\]?/g;
    if (!wantTs) {
      return text
        .split("\n")
        .map((ln) => ln.replace(TOK, "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim())
        .join("\n");
    }
    if (!maxSeconds) return text;
    const limit = maxSeconds + 3; // small tolerance for rounding
    return text
      .split("\n")
      .filter((ln) => {
        TOK.lastIndex = 0;
        let m;
        while ((m = TOK.exec(ln))) if (tsToSeconds(m[1]) > limit) return false;
        return true;
      })
      .join("\n");
  }

  // ---------- attachment cards (page thumbnail + selected text), stacked with different tilts ----------
  const ATT_ROT = [-9, 8, -5, 11]; // resting tilt of each card in the stack, back to front
  const ATT_DY = [0, 3, -2, 4];
  const SENT_ROT = [-4, 3, -3, 4];

  function attCard(kind, data, onRemove) {
    const face = h("div", { className: "pgs-att-face" });
    let tip;
    if (kind === "page" || kind === "tab") {
      let hostName = "";
      try { hostName = new URL(data.url).hostname.replace(/^www\./, ""); } catch {}
      tip = `${data.label || hostName} — ${hostName}`;
      const badge = h("div", { className: "pgs-att-badge" });
      if (data.image) badge.append(h("img", { className: "pgs-att-fav", src: data.image }));
      else badge.textContent = (hostName[0] || "?").toUpperCase();
      if (data.thumb) {
        face.style.backgroundImage = `url("${data.thumb}")`;
        face.append(badge);
      } else {
        face.append(h("div", { className: "pgs-att-fallback" }, badge, h("div", { className: "pgs-att-host", textContent: hostName })));
      }
    } else {
      tip = (data.label ? data.label + " — " : "") + data.text.slice(0, 400);
      if (data.label) face.append(h("div", { className: "pgs-att-tag", textContent: data.label }));
      face.append(h("div", { className: "pgs-att-q", textContent: "“" }), h("div", { className: "pgs-att-snip", textContent: data.text.slice(0, 240) }));
    }
    const card = h("div", { className: `pgs-att pgs-att-${kind}`, title: tip }, face);
    if (onRemove) {
      card.append(h("button", {
        className: "pgs-att-x", textContent: "✕", title: "Remove",
        onclick: (e) => { e.stopPropagation(); onRemove(); },
      }));
    }
    return card;
  }

  // ---------- per-tab session ----------
  const sessions = new Map(); // host tab -> session
  const dock = { corner: "tr" }; // which corner of the page area the floating window is snapped to

  function makeSession(src) {
    let panel, logEl, input, sendBtn, attachEl, stackEl, closeBtn, winBtn;
    let started = false, stopped = false, generating = false, dragPos = null;
    let refSeq = 0, thumbUrl = "", thumbFor = "", thumbVer = 0, thumbBusy = false, thumbTimer = null;
    const attMap = new Map(); // attachment key -> card element (the stack is updated incrementally)
    let page = null, convo = [], refs = [], ctrl = null;
    let busy = false, gen = 0, closed = false, userHidden = false;
    let lastKey = ""; // page identity the chat currently reflects (to detect navigation to a new page/video)
    let ytRows = null; // cached [sec, text] transcript rows for the current video (for "this moment")
    let host = src; // the tab hosting the panel (changes when popped into its own split tab)
    let self = null;
    const hideTitle = `Hide (Esc or ${SHORTCUT}) — your chat is kept for this tab`;

    const srcUrl = () => {
      const uri = src.linkedBrowser?.currentURI;
      return uri && /^https?$/.test(uri.scheme) ? uri.spec : null;
    };
    // identity of the current page: the YouTube video id when on YouTube, else the URL minus its
    // #hash. Changes only when you actually move to a different page/video (not on seeks or #jumps).
    const srcKey = () => { const u = srcUrl(); return u ? (ytId(u) || u.split("#")[0]) : ""; };
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
    // Focus the textarea reliably: when the panel opens from the ⌘E keydown, focusing in the same
    // tick sometimes loses out to the browser handing focus back to the page — so retry next frame
    // and shortly after. (This is the "sometimes you can't type until you hit New chat" fix.)
    function focusInput() {
      if (!input) return;
      const go = () => { if (!closed && panel && !panel.hidden) { try { input.focus({ preventScroll: true }); } catch (e) {} } };
      go();
      requestAnimationFrame(go);
      setTimeout(go, 60);
    }

    // ----- text selected on the page becomes a reference card in the composer -----
    const mm = src.linkedBrowser?.messageManager;
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

    const pageData = () => {
      const url = srcUrl();
      if (!url) return null;
      let label = src.label || url;
      try {
        const hn = new URL(url).hostname.replace(/^www\./, "");
        if (/youtube\.com$|youtu\.be$/.test(hn)) label = label.replace(/\s*[-–—]\s*YouTube\s*$/, "");
      } catch {}
      return { url, label, image: src.image, thumb: thumbFor === url ? thumbUrl : "" };
    };

    // a small portrait snapshot of the page, used as the card's picture
    async function captureThumb() {
      const url = srcUrl();
      if (!url || thumbBusy || thumbFor === url || closed) return;
      thumbBusy = true;
      try {
        const b = src.linkedBrowser;
        const r = b.getBoundingClientRect();
        if (r.width < 50 || r.height < 50) return;
        const w = Math.min(r.width, r.height * 0.8);
        const scale = Math.min(1, 180 / w);
        const bmp = await b.drawSnapshot((r.width - w) / 2, 0, w, r.height, scale, "white");
        const c = document.createElementNS(NS, "canvas");
        c.width = bmp.width;
        c.height = bmp.height;
        c.getContext("2d").drawImage(bmp, 0, 0);
        if (srcUrl() === url) {
          thumbUrl = c.toDataURL("image/jpeg", 0.72);
          thumbFor = url;
          thumbVer++;
          renderAttach();
        }
        bmp.close?.();
      } catch (e) {
        console.warn("[page-summary] page thumbnail unavailable", e);
        thumbFor = url; // don't retry endlessly; the card falls back to the favicon design
      } finally {
        thumbBusy = false;
      }
    }

    // The attachment stack above the field: the page card (back) + selected-text cards (on top).
    // Cards are added/removed incrementally so only new cards animate; it fans out on hover.
    function renderAttach() {
      if (!stackEl) return;
      const url = !started ? srcUrl() : null;
      const items = [];
      if (url) {
        items.push({
          key: "page",
          sig: `${url}\n${src.label}\n${src.image}\n${thumbFor === url ? thumbVer : 0}`,
          make: () => attCard("page", pageData()),
        });
      }
      for (const r of refs) {
        items.push({
          key: r.id,
          sig: `${r.kind || "text"}\n${r.label || ""}\n${r.image || ""}\n${r.text}`,
          make: () => attCard(r.kind || "text", r, () => { refs = refs.filter((x) => x.id !== r.id); renderAttach(); }),
        });
      }
      const keep = new Set(items.map((i) => i.key));
      for (const [k, el] of attMap) {
        if (keep.has(k)) continue;
        attMap.delete(k);
        el.classList.add("pgs-att-out");
        setTimeout(() => el.remove(), 230);
      }
      items.forEach((it, idx) => {
        let el = attMap.get(it.key);
        if (!el) {
          el = it.make();
          el.classList.add("pgs-att-in");
          attMap.set(it.key, el);
          if (it.key === "page") stackEl.prepend(el); else stackEl.append(el);
        } else if (el._sig !== it.sig) {
          const nel = it.make();
          el.replaceWith(nel);
          attMap.set(it.key, nel);
          el = nel;
        }
        el._sig = it.sig;
        el.style.setProperty("--i", String(idx));
        el.style.setProperty("--rot", `${ATT_ROT[idx % ATT_ROT.length]}deg`);
        el.style.setProperty("--dy", `${ATT_DY[idx % ATT_DY.length]}px`);
      });
      stackEl.style.setProperty("--n", String(Math.max(1, items.length)));
      attachEl.hidden = !items.length;
      if (input) input.placeholder = ytId(srcUrl() || "") ? "Ask about this video…" : "Ask a question about this page…";
    }

    function addRef(text) {
      if (!text || text.length < 2) return;
      // growing/shrinking the same selection replaces its card instead of stacking
      const i = refs.findIndex((r) => (r.kind || "text") === "text" && (r.text.includes(text) || text.includes(r.text)));
      if (i >= 0) refs[i] = { id: refs[i].id, kind: "text", text };
      else refs.push({ id: ++refSeq, kind: "text", text });
      if (refs.length > 5) refs.shift();
      renderAttach();
    }

    // add a non-selection context card (another tab, pasted text, a video moment, …)
    function addContext(item) {
      if (!item || !item.text || !item.text.trim()) return;
      refs.push({ id: ++refSeq, ...item });
      if (refs.length > 5) refs.shift();
      renderAttach();
    }

    // ----- extra context sources (paste / another tab / a video moment) -----
    function readClipboard() {
      try {
        const xfer = Cc["@mozilla.org/widget/transferable;1"].createInstance(Ci.nsITransferable);
        xfer.init(null);
        for (const flavor of ["text/plain", "text/unicode"]) {
          try {
            xfer.addDataFlavor(flavor);
            Services.clipboard.getData(xfer, Services.clipboard.kGlobalClipboard);
            const o = {};
            xfer.getTransferData(flavor, o);
            const s = o.value?.QueryInterface?.(Ci.nsISupportsString)?.data;
            if (s) return s;
          } catch (e) {}
        }
      } catch (e) {}
      return "";
    }
    function pasteCard() {
      const t = readClipboard().replace(/\s+/g, " ").trim();
      if (!t) { flashNote("Clipboard is empty (or not text)."); return; }
      addContext({ kind: "clip", label: "Pasted", text: t.slice(0, 4000) });
    }

    async function addTab(tab) {
      if (!tab || tab === host) return;
      flashNote("Reading tab…", true);
      try {
        const data = await getPageText(tab.linkedBrowser);
        const text = (data?.text || "").replace(/\s+/g, " ").trim().slice(0, 6000);
        if (!text) { flashNote("Couldn't read that tab."); return; }
        clearNote();
        addContext({ kind: "tab", label: tab.label || data.title || "Tab", image: tab.image || "", url: data.url, text });
      } catch (e) {
        flashNote("Couldn't read that tab.");
      }
    }

    // When the panel opens on top of a split view, the other split pane(s) are rendered visible
    // alongside the active tab — attach them as context cards too, so ⌘E grabs the whole split.
    function attachSplitTabs() {
      let others = [];
      try {
        others = gBrowser.tabs.filter((t) =>
          t !== src && t !== host && !t.pending && t.linkedPanel && t.linkedBrowser &&
          /^https?$/.test(t.linkedBrowser.currentURI?.scheme || "") && paneVisible(t)
        );
      } catch (e) {}
      return Promise.all(others.slice(0, 3).map((t) => addTab(t)));
    }

    // fetch + cache the current video's timestamped transcript rows (first use pays the cost)
    async function ensureYtRows() {
      if (ytRows) return ytRows;
      const data = await getYouTubeTranscript(src.linkedBrowser, srcUrl(), true);
      const rows = [];
      for (const ln of (data?.text || "").split("\n")) {
        const m = ln.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/);
        if (m && m[2]) rows.push([tsToSeconds(m[1]), m[2]]);
      }
      ytRows = rows;
      return rows;
    }
    async function addMoment() {
      const url = srcUrl();
      if (!url || !ytId(url)) return;
      flashNote("Grabbing this moment…", true);
      let t = 0, rows = [];
      try {
        [t, rows] = await Promise.all([getVideoTime(src.linkedBrowser), ensureYtRows()]);
      } catch (e) { flashNote("Couldn't read the transcript for this video."); return; }
      if (!rows.length) { flashNote("No transcript available for this video."); return; }
      const W = 30; // seconds of context on each side of the playhead
      let near = rows.filter((r) => r[0] >= t - W && r[0] <= t + W);
      if (!near.length) { // fall back to the few rows closest to the playhead
        near = rows.slice().sort((a, b) => Math.abs(a[0] - t) - Math.abs(b[0] - t)).slice(0, 6).sort((a, b) => a[0] - b[0]);
      }
      const text = near.map((r) => r[1]).join(" ").replace(/\s+/g, " ").trim().slice(0, 2000);
      if (!text) { flashNote("Couldn't find transcript near this point."); return; }
      const label = `${ytTime(near[0][0] * 1000)}–${ytTime(near[near.length - 1][0] * 1000)}`;
      clearNote();
      addContext({ kind: "moment", label, text });
    }

    // small transient line under the composer for add-context status
    let noteEl = null, noteTimer = null;
    function clearNote() { clearTimeout(noteTimer); if (noteEl) { noteEl.remove(); noteEl = null; } }
    function flashNote(msg, sticky) {
      clearNote();
      if (!stackEl) return;
      noteEl = h("div", { className: "pgs-addnote", textContent: msg });
      attachEl?.parentNode?.insertBefore(noteEl, attachEl.nextSibling);
      if (!sticky) noteTimer = setTimeout(clearNote, 2600);
    }

    // tabs that are actually loaded (skip lazy/discarded/restored-but-unloaded tabs) and on the web
    function loadedTabs() {
      return gBrowser.tabs.filter((t) =>
        t !== host && t !== src && !t.pending && t.linkedPanel && t.linkedBrowser &&
        /^https?$/.test(t.linkedBrowser.currentURI?.scheme || "")
      );
    }
    // a menu row for a tab: favicon + title. mouseDown=true picks before the input loses focus (@ mode)
    function tabItem(t, onPick, mouseDown) {
      let fav;
      if (t.image) fav = h("img", { className: "pgs-menu-fav", src: t.image });
      else {
        let ch = "?";
        try { ch = (new URL(t.linkedBrowser.currentURI.spec).hostname.replace(/^www\./, "")[0] || "?").toUpperCase(); } catch {}
        fav = h("span", { className: "pgs-menu-fav pgs-menu-fav-x", textContent: ch });
      }
      const el = h("button", { className: "pgs-menu-item pgs-menu-tab", title: t.label || "" },
        fav, h("span", { className: "pgs-menu-label", textContent: (t.label || "Tab").slice(0, 60) }));
      if (mouseDown) el.addEventListener("mousedown", (e) => { e.preventDefault(); onPick(t); });
      else el.onclick = () => onPick(t);
      return el;
    }

    // "+" popover: paste text, add another open tab, or (on YouTube) grab the current moment
    let addMenuEl = null;
    const onDocDown = (e) => { if (addMenuEl && !addMenuEl.contains(e.target) && !e.target.closest(".pgs-add")) closeAddMenu(); };
    function closeAddMenu() {
      if (!addMenuEl) return;
      addMenuEl.remove(); addMenuEl = null;
      document.removeEventListener("pointerdown", onDocDown, true);
    }
    function openAddMenu(anchor) {
      if (addMenuEl) { closeAddMenu(); return; }
      closeMention();
      const items = [];
      const mi = (label, fn) => h("button", { className: "pgs-menu-item", textContent: label, onclick: () => { closeAddMenu(); fn(); } });
      if (ytId(srcUrl() || "")) items.push(mi("◉   This moment", addMoment));
      items.push(mi("⎘   Paste text", pasteCard));
      const tabs = loadedTabs();
      if (tabs.length) {
        items.push(h("div", { className: "pgs-menu-sep", textContent: "Add another tab  ·  or type @ in the box" }));
        for (const t of tabs.slice(0, 12)) items.push(tabItem(t, (tab) => { closeAddMenu(); addTab(tab); }));
      }
      addMenuEl = h("div", { className: "pgs-menu" }, ...items);
      anchor.parentNode.appendChild(addMenuEl);
      setTimeout(() => document.addEventListener("pointerdown", onDocDown, true), 0);
    }

    // typing "@" in the composer opens a live-filtered tab picker (@ + text narrows the list)
    let mentionEl = null, mentionStart = -1, mentionIdx = 0, mentionTabs = [], mentionQ = "";
    function closeMention() { if (mentionEl) { mentionEl.remove(); mentionEl = null; } mentionStart = -1; mentionTabs = []; }
    function updateMention() {
      if (!input) return;
      const v = input.value, caret = input.selectionStart ?? v.length;
      const m = v.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/);
      if (!m) { closeMention(); return; }
      closeAddMenu();
      mentionStart = caret - m[1].length - 1;
      mentionQ = m[1].toLowerCase();
      const all = loadedTabs();
      mentionTabs = all
        .filter((t) => !mentionQ || (t.label || "").toLowerCase().includes(mentionQ) || (t.linkedBrowser.currentURI?.spec || "").toLowerCase().includes(mentionQ))
        .slice(0, 10);
      if (!mentionTabs.length) { closeMention(); return; }
      mentionIdx = Math.max(0, Math.min(mentionIdx, mentionTabs.length - 1));
      renderMention();
    }
    function renderMention() {
      const head = h("div", { className: "pgs-menu-sep", textContent: mentionQ ? `Tabs matching “${mentionQ}”` : "Add a tab" });
      const rows = mentionTabs.map((t, i) => {
        const el = tabItem(t, pickMention, true);
        if (i === mentionIdx) el.classList.add("pgs-menu-active");
        return el;
      });
      if (!mentionEl) { mentionEl = h("div", { className: "pgs-menu pgs-menu-mention" }); input.closest(".pgs-composer").appendChild(mentionEl); }
      mentionEl.replaceChildren(head, ...rows);
    }
    function pickMention(t) {
      if (mentionStart >= 0 && input) {
        const v = input.value, caret = input.selectionStart ?? v.length;
        input.value = v.slice(0, mentionStart) + v.slice(caret);
        input.selectionStart = input.selectionEnd = mentionStart;
        autosize();
      }
      closeMention();
      input?.focus();
      if (t) addTab(t);
    }

    // ----- request building: every request is self-contained (small local models ignore history) -----
    const requestFor = () => {
      const last = convo.at(-1);
      const req = last?.content || pref("prompt", DEFAULT_PROMPT);
      let ctx = page.context ?? page.text.slice(0, chunkSize());
      // On YouTube every transcript line is prefixed with its [mm:ss] stamp (so "Key moments"
      // can cite times). For anything that isn't explicitly about timing, strip those stamps so
      // the model doesn't echo them into a plain summary.
      if (page.youtube && !/\btimestamp|\bmoment|\bchapter|time ?code|mm:ss|\bjump to\b/i.test(req)) {
        ctx = ctx
          .replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/gm, "")
          .replace(/ \(each line is prefixed with its \[mm:ss\] timestamp\)/, "");
      }
      const header = `Title: ${page.title}\nURL: ${page.url}\n\n${ctx}`;
      const refText = (rs) => rs.map((r) => `"${r.text.slice(0, 1500)}"`).join("\n");
      // label each attached card so the model can tell a tab from a selection from a video excerpt
      const refHead = (r) =>
        r.kind === "tab" ? `ANOTHER TAB THE USER ATTACHED (${r.label || "tab"})`
        : r.kind === "clip" ? "TEXT THE USER PASTED IN"
        : r.kind === "moment" ? `EXCERPT FROM THIS VIDEO (${r.label || "moment"})`
        : "TEXT THE USER SELECTED ON THE PAGE";
      const transcript = convo
        .slice(0, -1)
        .slice(-4)
        .map((m) =>
          `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 1200)}` +
          (m.refs?.length ? ` (about the selected text: ${refText(m.refs).slice(0, 400)})` : "")
        )
        .join("\n");
      const refsBlock = last?.refs?.length
        ? "\n\n" + last.refs.map((r) => `=== ${refHead(r)} ===\n${r.text.slice(0, 2000)}`).join("\n\n")
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
    const sizeFor = (r) => ({
      w: Math.min(parseInt(pref("width", "440"), 10) || 440, r.width - MARGIN * 2),
      hgt: Math.min(parseInt(pref("height", "620"), 10) || 620, r.height - MARGIN * 2),
    });
    const cornerPos = (c, r, w, hgt) => [
      c.includes("l") ? r.left + MARGIN : r.right - w - MARGIN,
      c.includes("t") ? r.top + MARGIN : r.bottom - hgt - MARGIN,
    ];

    function position() {
      if (!panel) return;
      if (host !== src) {
        const d = host.linkedBrowser.getBoundingClientRect();
        Object.assign(panel.style, {
          left: `${Math.round(d.left + 4)}px`, top: `${Math.round(d.top + 4)}px`, right: "auto",
          width: `${Math.round(d.width - 8)}px`, height: `${Math.round(d.height - 8)}px`,
        });
        return;
      }
      const r = gBrowser.selectedBrowser.getBoundingClientRect();
      const { w, hgt } = sizeFor(r);
      let left, top;
      if (dragPos) { // being dragged: follow the pointer, stay on screen
        left = Math.min(Math.max(dragPos.left, 0), window.innerWidth - w);
        top = Math.min(Math.max(dragPos.top, 0), window.innerHeight - 80);
        dragPos.left = left;
        dragPos.top = top;
      } else {
        [left, top] = cornerPos(dock.corner, r, w, hgt);
      }
      Object.assign(panel.style, {
        left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, right: "auto",
        width: `${Math.round(w)}px`, height: `${Math.round(hgt)}px`,
      });
    }

    // glide (with a little magnetic overshoot) to wherever dock.corner says
    function glideToCorner() {
      if (!panel) return;
      const p = panel;
      p.classList.add("pgs-snapping");
      position();
      setTimeout(() => p.classList.remove("pgs-snapping"), 480);
    }

    // let go of the window anywhere and it snaps to the nearest of the four corners
    function snapToCorner() {
      if (!panel) return;
      const r = gBrowser.selectedBrowser.getBoundingClientRect();
      const b = panel.getBoundingClientRect();
      const top = b.top + b.height / 2 < (r.top + r.bottom) / 2;
      const left = b.left + b.width / 2 < (r.left + r.right) / 2;
      dock.corner = (top ? "t" : "b") + (left ? "l" : "r");
      glideToCorner();
    }

    function enableDrag(head) {
      head.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("button") || host !== src) return;
        e.preventDefault();
        const b = panel.getBoundingClientRect();
        dragPos = { left: b.left, top: b.top };
        head.setPointerCapture(e.pointerId);
        panel.classList.remove("pgs-snapping");
        panel.classList.add("pgs-dragging");
        const move = (ev) => {
          if (!dragPos) return;
          dragPos.left += ev.movementX;
          dragPos.top += ev.movementY;
          position();
        };
        const up = (ev) => {
          try { head.releasePointerCapture(ev.pointerId); } catch {}
          head.removeEventListener("pointermove", move);
          head.removeEventListener("pointerup", up);
          head.removeEventListener("pointercancel", up);
          dragPos = null;
          panel?.classList.remove("pgs-dragging");
          snapToCorner();
        };
        head.addEventListener("pointermove", move);
        head.addEventListener("pointerup", up);
        head.addEventListener("pointercancel", up);
      });
      // double-click the header: back to the top-right corner
      head.addEventListener("dblclick", (e) => {
        if (e.target.closest("button") || host !== src) return;
        dock.corner = "tr";
        glideToCorner();
      });
    }

    function build() {
      const newBtn = h("button", { className: "pgs-icon", title: "New chat", onclick: () => newChat() }, icon("new"));
      closeBtn = h("button", {
        className: "pgs-icon", title: hideTitle,
        onclick: () => (host !== src ? gBrowser.removeTab(host) : dismiss()),
      }, icon("close"));
      winBtn = h("button", { className: "pgs-icon pgs-win-btn", title: "Back to window mode", onclick: () => unpop() }, icon("win"));
      const head = h("div", { className: "pgs-head", title: "Drag to move (it snaps to the nearest corner) · double-click to reset" },
        newBtn, h("div", { className: "pgs-head-right" }, winBtn, closeBtn));
      enableDrag(head);

      logEl = h("div", { className: "pgs-log" });
      stackEl = h("div", { className: "pgs-stack" });
      attachEl = h("div", { className: "pgs-attach", hidden: true }, stackEl);
      const isVid = !!ytId(srcUrl() || "");
      input = h("textarea", { className: "pgs-input", rows: 1, placeholder: isVid ? "Ask about this video…" : "Ask a question about this page…" });
      input.addEventListener("input", () => { autosize(); updateMention(); });
      input.addEventListener("blur", () => setTimeout(closeMention, 150));
      input.addEventListener("keydown", (e) => {
        if (mentionEl && mentionTabs.length) {
          if (e.key === "ArrowDown") { e.preventDefault(); mentionIdx = (mentionIdx + 1) % mentionTabs.length; renderMention(); return; }
          if (e.key === "ArrowUp") { e.preventDefault(); mentionIdx = (mentionIdx - 1 + mentionTabs.length) % mentionTabs.length; renderMention(); return; }
          if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); pickMention(mentionTabs[mentionIdx]); return; }
          if (e.key === "Escape") { e.preventDefault(); closeMention(); return; }
        }
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submit(); }
      });
      sendBtn = h("button", { className: "pgs-send", onclick: () => (busy ? stop() : submit()) });
      const addBtn = h("button", { className: "pgs-add", title: "Add context (tab, pasted text, video moment)", onclick: (e) => { e.stopPropagation(); openAddMenu(addBtn); } }, "+");
      const chips = h("div", { className: "pgs-chips" }, ...(isVid ? YT_CHIPS : CHIPS).map(([label, q]) =>
        h("button", { className: "pgs-chip", textContent: label, onclick: () => submit(q || pref("prompt", DEFAULT_PROMPT), { label }) })
      ));
      const foot = h("div", { className: "pgs-foot" },
        h("div", { className: "pgs-composer" }, attachEl, input, h("div", { className: "pgs-row" }, addBtn, chips, sendBtn)));

      panel = h("div", { id: "pgs-panel" }, head, logEl, foot);
      document.documentElement.append(panel);
      setBusy(false);
      position();
    }

    // ----- conversation -----
    // The page being chatted about sits in the composer as a card (with selected-text snippets
    // stacked on top of it) until you send. Re-render that pile when the tab/page changes.
    function refreshAttach() {
      if (started || closed) return;
      renderAttach();
      const url = srcUrl();
      if (url && url !== thumbFor) { clearTimeout(thumbTimer); thumbTimer = setTimeout(captureThumb, 1200); }
    }

    // Called on any top-level navigation in the source tab (including YouTube's in-page video
    // switches). If we actually moved to a different page/video, drop the cached page + chat so the
    // next request reads the NEW page; otherwise just refresh the attachment card/thumbnail.
    function onNav() {
      if (closed) return;
      const key = srcKey();
      if (key === lastKey) { refreshAttach(); return; }
      lastKey = key;
      if (started || convo.length || page) newChat(); // was chatting about the previous page — start fresh
      else refreshAttach(); // nothing sent yet; just reattach the new page
      const url = srcUrl();
      if (url) { clearTimeout(thumbTimer); thumbTimer = setTimeout(captureThumb, 1200); }
    }

    // your message in the chat: its attachments (page card first) as tilted cards, then the bubble
    const userMsg = (label, rs, pageAtt) => {
      const cards = [];
      if (pageAtt) cards.push(attCard("page", pageAtt));
      for (const r of rs) cards.push(attCard(r.kind || "text", r));
      cards.forEach((c, i) => c.style.setProperty("--rot", `${SENT_ROT[i % SENT_ROT.length]}deg`));
      return h("div", { className: "pgs-msg pgs-ug" },
        ...(cards.length ? [h("div", { className: "pgs-sent" }, ...cards)] : []),
        h("div", { className: "pgs-ubub", textContent: label }));
    };

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
      const block = h("div", { className: "pgs-msg pgs-ai pgs-streaming" });
      const answerEl = h("div", { className: "pgs-answer" });
      let dots = h("div", { className: "pgs-dots" }, h("i"), h("i"), h("i")); // "thinking" until first token
      block.append(answerEl, dots);
      logEl.append(block);
      scrollDown(true);
      let acc = "";
      // on a YouTube video, make [mm:ss] stamps in the answer clickable (jump the player)
      const seek = ytId(srcUrl() || "") ? (s) => seekVideo(src.linkedBrowser, s) : null;
      // did this request actually ask for timestamps? (mirrors the context stripping in requestFor)
      const wantTs = /\btimestamp|\bmoment|\bchapter|time ?code|mm:ss|\bjump to\b/i.test(convo.at(-1)?.content || "");
      const clean = (t) => (page?.youtube && seek ? scrubStamps(t, page.seconds, wantTs) : t);
      const dropDots = () => { if (dots) { dots.remove(); dots = null; } };
      // Reveal the answer in whole multi-line chunks: hold streamed text back until ~3 lines have
      // piled up, then render up to `end` and ease the new block in together (settled text stays
      // solid). This reads as "a few lines appear and smoothly fade in" rather than a live crawl.
      const CHUNK_LINES = 3;
      let shown = 0, lastPaint = 0;
      const paint = (end = acc.length) => {
        if (end <= shown) return;
        dropDots();
        const stick = nearBottom();
        renderMd(answerEl, acc.slice(0, end), seek, shown); // text past `shown` fades in as one chunk
        shown = end;
        if (stick) scrollDown(false);
      };
      // index just past the CHUNK_LINES-th newline after what's already shown (-1 if not enough yet)
      const chunkEnd = () => {
        let n = 0;
        for (let i = shown; i < acc.length; i++) {
          if (acc[i] === "\n" && ++n >= CHUNK_LINES) return i + 1;
        }
        return -1;
      };
      try {
        if (!llmReady()) {
          dropDots();
          acc = extractive(page.text) || "Couldn't find enough text on this page to summarize.";
          renderMd(answerEl, acc, seek);
          answerEl.append(h("div", { className: "pgs-note", textContent: "Offline summary. Add an API key (or a local model) in the mod settings for AI answers." }));
        } else {
          for await (const d of streamLLM(requestFor(), signal)) {
            acc = acc.length > 20 && d.startsWith(acc) ? d : acc + d; // tolerate cumulative streams
            const now = Date.now();
            const end = chunkEnd();
            if (end > 0) { lastPaint = now; paint(end); } // a full ~3-line chunk is ready
            else if (acc.length - shown >= 500) { lastPaint = now; paint(); } // one very long line
            else if (acc.length > shown && now - lastPaint >= 1800) { lastPaint = now; paint(); } // slow model, show life
          }
          paint(); // flush the trailing partial chunk (fades the last lines in)
          acc = clean(acc); // drop any timestamps invented past the end of the video
          renderMd(answerEl, acc, seek); // final solid pass, no fade boundary — so bold/links/timestamps never split mid-token
        }
        if (acc) convo.push({ role: "assistant", content: acc });
      } catch (e) {
        dropDots();
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
          // let the user retry without retyping: drop this errored block and run the request again
          block.append(h("div", { className: "pgs-actions" },
            h("button", {
              className: "pgs-mini", textContent: "Retry",
              onclick: () => { if (busy) return; block.remove(); generate(); },
            })));
          if (unreachable && !acc && convo.length === 1) {
            acc = extractive(page.text);
            const fb = h("div");
            renderMd(fb, acc, seek);
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
    }

    // the send arrow becomes ■ while working; this stops it and keeps what was already written
    function stop() {
      stopped = true;
      ctrl?.abort();
      if (!generating) { // still reading the page
        gen++;
        setBusy(false);
        logEl?.querySelectorAll(".pgs-status").forEach((n) => n.remove());
      }
    }

    function regenerate() {
      if (busy || !page) return;
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
      const isVid = !!ytId(url);
      const status = h("div", { className: "pgs-msg pgs-status", textContent: isVid ? "Fetching video captions…" : "Reading page…" });
      logEl.append(status);
      scrollDown(true);
      try {
        page = await getPageText(src.linkedBrowser);
      } catch (e) {
        if (closed || my !== gen) return;
        const msg = e.noCaptions
          ? "This video has no captions available, so there's no transcript to read."
          : `Couldn't read this ${isVid ? "video" : "page"}: ${e.message}`;
        status.replaceWith(h("p", { className: "pgs-msg pgs-error", textContent: msg }));
        setBusy(false);
        return;
      }
      if (closed || my !== gen) { if (!closed) page = null; return; }
      page.text = page.text.slice(0, MAX_CHARS * 2);
      ctrl = new AbortController();
      try {
        page.context = await buildContext(page, ctrl.signal, (t) => { status.textContent = t; });
      } catch (e) {
        if (e.name === "AbortError" || closed) { if (!closed) page = null; return; }
        page.context = page.text.slice(0, chunkSize()); // generate() will surface the real error
      }
      if (closed || my !== gen) { if (!closed) page = null; return; }
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
      const pageAtt = !started ? pageData() : null; // the page card travels with the first message
      started = true;
      renderAttach(); // the cards leave the text field...
      logEl.append(userMsg(opts.label || q, mine, pageAtt)); // ...and land in the chat with your request
      scrollDown(true);
      const entry = { role: "user", content: q, refs: mine };
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
      started = false;
      ytRows = null;
      closeAddMenu();
      closeMention();
      clearNote();
      setBusy(false);
      if (input) { input.value = ""; autosize(); }
      logEl.replaceChildren();
      renderAttach();
      focusInput();
    }

    // open an empty chat; the page is attached to the text field, nothing is read or sent until you ask
    function open() {
      if (!panel) build();
      newChat();
      lastKey = srcKey();
      focusInput();
      captureThumb();
      const splitDone = attachSplitTabs(); // grab the other split pane(s), if any
      // optional: immediately run the default summary instead of waiting for a prompt
      if (pref("autosummarize", "false") === "true" && srcUrl()) {
        const first = (ytId(srcUrl() || "") ? YT_CHIPS : CHIPS)[0];
        const q = first[1] || pref("prompt", DEFAULT_PROMPT);
        splitDone.then(() => { if (!closed && !started && !busy) submit(q, { label: first[0] }); });
      }
    }

    // the page was reloaded: the chat is deleted (in split-view mode its tab goes away too)
    function wipe() {
      if (closed) return;
      if (host !== src) { gBrowser.removeTab(host); return; } // TabClose then closes the session
      close();
    }

    // ----- visibility: sync() shows the panel only while its host tab is on screen -----
    function dockedVisible() {
      const sel = gBrowser.selectedTab;
      return (host === sel || src === sel || paneVisible(src)) && paneVisible(host);
    }
    function sync() {
      if (!panel || closed) return;
      const want = !userHidden && (host === src ? src === gBrowser.selectedTab : dockedVisible());
      panel.hidden = !want;
      if (want) position();
    }
    function dismiss() { userHidden = true; sync(); }
    function restore() { userHidden = false; sync(); focusInput(); }

    // ----- split-view tab mode -----
    function pop() {
      if (!panel || closed || host !== src) return;
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
      if (!panel || closed || host === src) return;
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
      closeAddMenu();
      closeMention();
      try { mm?.removeMessageListener(SEL_MSG, onSelection); } catch {}
      sessions.delete(host);
      if (!panel) return;
      const p = panel;
      if (immediate) p.remove();
      else { p.classList.add("pgs-out"); setTimeout(() => p.remove(), 180); }
    }

    self = {
      open, sync, dismiss, restore, position, close, pop, unpop, wipe, refreshAttach, onNav,
      get docked() { return host !== src; },
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

  // while a chat lives in its own split tab, keep it glued to its pane (split animations, resizes…)
  let ticker = null;
  const startTicker = () => {
    if (ticker) return;
    ticker = setInterval(() => {
      const docked = [...sessions.values()].filter((x) => x.docked);
      if (!docked.length) { clearInterval(ticker); ticker = null; return; }
      docked.forEach((x) => x.sync());
    }, 300);
  };

  function toggle() {
    const s = current();
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
  const onSelect = () => { syncAll(); setTimeout(syncAll, 120); setTimeout(syncAll, 450); };
  const onTabClose = (e) => sessions.get(e.target)?.close(true);
  const onResize = () => syncAll();

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
  gBrowser.tabContainer.addEventListener("TabClose", onTabClose);

  // Reloading a page deletes its chat. Two detectors: the "reload" location-change flag, and a
  // document load that starts for the very URL the tab is already showing.
  const WPL = Ci.nsIWebProgressListener;
  const progressListener = {
    onLocationChange(browser, webProgress, request, location, flags) {
      try {
        if (!webProgress.isTopLevel) return;
        const tab = gBrowser.getTabForBrowser(browser);
        const mine = [...sessions.values()].filter((x) => x.src === tab);
        if (!mine.length) return;
        if (flags & (WPL.LOCATION_CHANGE_RELOAD ?? 0x4)) mine.forEach((x) => x.wipe());
        else mine.forEach((x) => x.onNav()); // includes YouTube's in-page (same-document) video switches
      } catch (e) { console.warn("[page-summary] location listener", e); }
    },
    onStateChange(browser, webProgress, request, stateFlags) {
      try {
        if (!webProgress.isTopLevel || !(stateFlags & WPL.STATE_START) || !(stateFlags & WPL.STATE_IS_DOCUMENT)) return;
        const tab = gBrowser.getTabForBrowser(browser);
        const mine = [...sessions.values()].filter((x) => x.src === tab);
        if (!mine.length) return;
        const to = request.QueryInterface(Ci.nsIChannel).URI.spec.split("#")[0];
        if (to === browser.currentURI.spec.split("#")[0]) mine.forEach((x) => x.wipe());
      } catch {}
    },
  };
  gBrowser.addTabsProgressListener(progressListener);
  const onTabAttr = (e) => { for (const x of [...sessions.values()]) if (x.src === e.target) x.refreshAttach(); };
  gBrowser.tabContainer.addEventListener("TabAttrModified", onTabAttr);

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
      styleEl.remove();
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
      gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
      gBrowser.tabContainer.removeEventListener("TabClose", onTabClose);
      gBrowser.tabContainer.removeEventListener("TabAttrModified", onTabAttr);
      gBrowser.removeTabsProgressListener(progressListener);
      delete window.__pageSummary;
    },
  };
  console.log("[page-summary] loaded v1.9.34");
})();
