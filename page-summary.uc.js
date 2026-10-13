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
    split: "M2.5 3.5h11v9h-11zM8 3.5v9",
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
#pgs-panel .pgs-card { animation-delay: 0.04s; }
#pgs-panel .pgs-card + .pgs-ug { animation-delay: 0.14s; }
#pgs-panel .pgs-card + .pgs-ug + * { animation-delay: 0.26s; }
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

/* selected-text reference cards (composer stack + sent messages) */
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
/* each freshly-streamed slice eases in (overlapping slices make a smooth wave, not a pop) */
#pgs-panel .pgs-chunk-in { animation: pgs-chunk 0.55s var(--pgs-ease) both; }
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
#pgs-panel .pgs-ts {
  color: color-mix(in srgb, var(--pgs-fg) 58%, transparent); cursor: pointer; text-decoration: none;
  font-variant-numeric: tabular-nums; font-size: 0.85em; font-weight: 550; white-space: nowrap;
  background: color-mix(in srgb, var(--pgs-fg) 8%, transparent); border-radius: 5px; padding: 1px 5px;
  margin-inline-end: 3px; transition: color 0.12s ease, background 0.12s ease;
}
#pgs-panel .pgs-ts:hover { color: var(--pgs-fg); background: color-mix(in srgb, var(--pgs-fg) 16%, transparent); }
#pgs-panel .pgs-answer .pgs-h { font-weight: 650; font-size: 0.95em; margin: 14px 0 6px; opacity: 0.92; }
#pgs-panel .pgs-answer > .pgs-h:first-child { margin-top: 0; }

/* the page card: attached in the composer stack until you send, then part of your message */
#pgs-panel .pgs-card.pgs-attached {
  align-self: flex-start; max-width: 100%; padding: 6px 16px 6px 6px; border-radius: 14px;
  background: color-mix(in srgb, var(--pgs-fg) 9%, transparent); animation: pgs-msg 0.35s var(--pgs-ease) both;
}
#pgs-panel .pgs-attached .pgs-card-ico { width: 38px; height: 38px; border-radius: 10px; font-size: 15px; }
#pgs-panel .pgs-attached .pgs-card-fav { width: 20px; height: 20px; }
#pgs-panel .pgs-attached .pgs-card-title { font-size: 13px; }
#pgs-panel .pgs-attached .pgs-card-domain { font-size: 11.5px; }
#pgs-panel .pgs-ug .pgs-card { max-width: 100%; }

/* ----- whimsical attachment stack: page card + selected-text snippets ----- */
/* A tidy pile of rotated cards that fans open into a straight, readable column on hover. */
#pgs-panel .pgs-stack {
  display: flex; flex-direction: column; align-items: flex-start;
  --pgs-h: 54px; --pgs-gap: 9px; --pgs-w: 210px;
  width: 100%;
  margin: 2px 0 6px;
}
#pgs-panel .pgs-stack[hidden] { display: none; }
/* Collapsed: cards are pulled onto one another (negative margins) into a fanned pile. The front
   card (first in the DOM, newest context) sits flat and solid on top; each card behind pivots from
   its bottom-left corner so its right side lifts up and peeks above the front card — a visible fan,
   even without hovering. On hover the negative margins open to real gaps, sliding every card into
   its own row (so the cards behind can never stay hidden). */
#pgs-panel .pgs-stack-card {
  box-sizing: border-box; height: var(--pgs-h);
  margin-top: calc(-1 * var(--pgs-h));
  z-index: calc(100 - var(--pgs-i, 0));
  transform-origin: 0% 100%;
  transform:
    translateY(calc(var(--pgs-i, 0) * -4px))
    rotate(var(--pgs-rot, 0deg))
    scale(calc(1 - var(--pgs-i, 0) * 0.04));
  opacity: calc(1 - var(--pgs-i, 0) * 0.12);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.24);
  transition: margin-top 0.42s var(--pgs-ease), transform 0.42s var(--pgs-ease),
    opacity 0.38s ease, box-shadow 0.3s ease;
  animation: pgs-msg 0.35s var(--pgs-ease) both;
}
#pgs-panel .pgs-stack-card:first-child { margin-top: 0; }
/* a compact card hugging the left of the field (both card types) */
#pgs-panel .pgs-stack .pgs-card.pgs-attached,
#pgs-panel .pgs-stack .pgs-ref {
  width: var(--pgs-w); max-width: calc(100% - 6px);
  background: color-mix(in srgb, var(--pgs-bg) 90%, var(--pgs-fg));
  border: 1px solid var(--pgs-line); border-radius: 14px;
}
#pgs-panel .pgs-stack .pgs-card.pgs-attached { padding: 7px 14px 7px 7px; }
#pgs-panel .pgs-stack .pgs-ref { padding: 7px 30px 7px 7px; }
/* hover the pile: open the gaps, straighten and solidify every card into its own row */
#pgs-panel .pgs-stack:hover .pgs-stack-card {
  margin-top: var(--pgs-gap);
  transform: none; opacity: 1;
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.2);
}
#pgs-panel .pgs-stack:hover .pgs-stack-card:first-child { margin-top: 0; }

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
    const readSegs = () => {
      const hosts = toArr(pdoc.querySelectorAll("ytd-transcript-segment-renderer"));
      hostCount = hosts.length;
      const out = [];
      for (const n of hosts) {
        const tsEl = n.querySelector(".segment-timestamp");
        const txEl = n.querySelector(".segment-text");
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
    // find the "Show transcript" button WITHOUT relying on English text — prefer the structural
    // location in the description's transcript section (language-independent)
    const findBtn = () => {
      let b = pdoc.querySelector("ytd-video-description-transcript-section-renderer button, ytd-video-description-transcript-section-renderer ytd-button-renderer");
      if (b) return b;
      b = pdoc.querySelector('button[aria-label*="transcript" i]');
      if (b) return b;
      const words = ["transcript", "přepis", "文字起こし", "トランスクリプト", "transcripción", "transcription", "transkript", "stenogram"];
      for (const el of toArr(pdoc.querySelectorAll("button, tp-yt-paper-button, yt-button-shape button, a"))) {
        const t = (((el.getAttribute && el.getAttribute("aria-label")) || "") + " " + (el.textContent || "")).toLowerCase();
        if (words.some((w) => t.includes(w))) return el;
      }
      return null;
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
        if (!segs.length) {
          // expand the description so its transcript section renders (scope to the description's own
          // "…more"/"…více" expander so we don't accidentally hit a comment's expander)
          for (const sel of ["ytd-watch-metadata #expand", "#description #expand", "#description-inline-expander #expand", "ytd-text-inline-expander #expand", "tp-yt-paper-button#expand"]) {
            const ex = pdoc.querySelector(sel);
            if (ex) { try { ex.click(); } catch (e) {} break; }
          }
          // wait for the transcript button to render, then click the actual <button> inside it
          let btn = null;
          for (let i = 0; i < 28 && !btn; i++) { btn = findBtn(); if (!btn) await sleep(250); }
          info.foundButton = !!btn;
          if (btn) {
            const c = btn.tagName === "BUTTON" ? btn : (btn.querySelector && btn.querySelector("button")) || btn;
            try { c.click(); } catch (e) {}
            for (let i = 0; i < 48 && !segs.length; i++) { await sleep(250); segs = readSegs(); }
            // tidy up: close the panel we opened
            try {
              const panel = pdoc.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
              const close = panel && panel.querySelector('button[aria-label*="Close" i], button[aria-label*="Zavřít" i], button[aria-label*="閉じる"]');
              if (close) { try { close.click(); } catch (e) {} }
            } catch (e) {}
          }
        }
        info.hostCount = hostCount;
        info.segs = segs;
        if (!segs.length) info.noPanel = true;
        send(info);
      } catch (e) {
        info.error = String((e && e.message) || e);
        send(info);
      }
    })();
  }

  async function getYouTubeTranscript(browser, pageUrl) {
    const mm = browser.messageManager;
    const data = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { mm.removeMessageListener(MSG, listener); reject(new Error("timeout")); }, 25000);
      const listener = (m) => { clearTimeout(timer); mm.removeMessageListener(MSG, listener); resolve(m.data); };
      mm.addMessageListener(MSG, listener);
      mm.loadFrameScript("data:application/javascript," + encodeURIComponent(`(${extractYouTubeTranscript.toString()})()`), false);
    });
    console.log("[page-summary] yt transcript:", { segments: data?.segs?.length || 0, segmentRows: data?.hostCount, foundButton: data?.foundButton, noPanel: data?.noPanel, error: data?.error });
    if (data?.error) throw new Error(data.error);
    const segs = data?.segs || [];
    if (!segs.length) {
      const e = new Error("couldn't open a transcript for this video (it may not have captions)");
      e.noCaptions = true;
      throw e;
    }
    const stamps = pref("yttimestamps", "true") !== "false";
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

  // jump the video (in its tab) to a timestamp — no reload, just set the player's currentTime
  function seekVideo(browser, seconds) {
    if (!browser) return;
    try { const tab = gBrowser.getTabForBrowser(browser); if (tab) gBrowser.selectedTab = tab; } catch (e) {}
    const code = `(() => { try { const v = content.document.querySelector("video.html5-main-video, video"); if (v) { v.currentTime = ${Number(seconds) || 0}; if (v.paused) v.play(); } } catch (e) {} })()`;
    try { browser.messageManager.loadFrameScript("data:application/javascript," + encodeURIComponent(code), false); } catch (e) {}
  }

  // seek is an optional (seconds) => void; when given, [mm:ss] / mm:ss become clickable jump links
  const inline = (s, seek) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/).filter(Boolean).flatMap((t) => {
      if (t.startsWith("**") && t.endsWith("**") && t.length > 4) return [h("strong", { textContent: t.slice(2, -2) })];
      if (t.startsWith("`") && t.endsWith("`") && t.length > 2) return [h("code", { textContent: t.slice(1, -1) })];
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

  // ---------- per-tab session ----------
  const sessions = new Map(); // host tab -> session
  const dock = { corner: "tr" }; // which corner of the page area the floating window is snapped to

  function makeSession(src) {
    let panel, logEl, input, sendBtn, stackEl, closeBtn, splitBtn, winBtn, cardEl;
    let started = false, stopped = false, generating = false, dragPos = null;
    let page = null, convo = [], refs = [], ctrl = null;
    let busy = false, gen = 0, closed = false, userHidden = false;
    let host = src; // the tab hosting the panel (changes when popped into its own split tab)
    let self = null;
    const hideTitle = `Hide (Esc or ${SHORTCUT}) — your chat is kept for this tab`;

    const srcUrl = () => {
      const uri = src.linkedBrowser?.currentURI;
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

    function refCard(ref, removable) {
      const card = h("div", { className: "pgs-ref", title: ref.text.slice(0, 400) },
        h("div", { className: "pgs-ref-ico", textContent: "\u201C" }),
        h("div", { className: "pgs-ref-meta" },
          h("div", { className: "pgs-ref-kind", textContent: "Selected text" }),
          h("div", { className: "pgs-ref-text", textContent: ref.text })));
      if (removable) {
        card.append(h("button", {
          className: "pgs-ref-x", textContent: "✕", title: "Remove",
          onclick: () => { refs = refs.filter((r) => r !== ref); renderStack(); },
        }));
      }
      return card;
    }
    // Each context is a card: the page, plus any selected-text snippets. The newest context sits
    // on top (fully visible); the rest tuck behind it with a tilt for depth (see IMG_0034).
    // Order, front -> back: newest snippet, ... oldest snippet, page card.
    function renderStack() {
      if (!stackEl) return;
      const cards = [];
      for (let k = refs.length - 1; k >= 0; k--) {
        const rc = refCard(refs[k], true);
        rc.classList.add("pgs-stack-card");
        cards.push(rc);
      }
      const url = started ? null : srcUrl();
      if (url) {
        const pc = pageCard(url, true);
        pc.classList.add("pgs-stack-card");
        cards.push(pc);
      }
      // front card sits flat; each card further back leans a touch more to the left (fanned deck)
      cards.forEach((card, i) => {
        card.style.setProperty("--pgs-i", String(i));
        card.style.setProperty("--pgs-rot", (i === 0 ? 0 : -(4 + i * 2)).toFixed(2) + "deg");
      });
      stackEl.replaceChildren(...cards);
      stackEl.hidden = !cards.length;
    }
    function addRef(text) {
      if (!text || text.length < 2) return;
      // growing/shrinking the same selection replaces its card instead of stacking
      const i = refs.findIndex((r) => r.text.includes(text) || text.includes(r.text));
      if (i >= 0) refs[i] = { text }; else refs.push({ text });
      if (refs.length > 3) refs.shift();
      renderStack();
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
      const transcript = convo
        .slice(0, -1)
        .slice(-4)
        .map((m) =>
          `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 1200)}` +
          (m.refs?.length ? ` (about the selected text: ${refText(m.refs).slice(0, 400)})` : "")
        )
        .join("\n");
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
      splitBtn = h("button", { className: "pgs-icon pgs-split-btn", title: "Open as a split-view tab", onclick: () => pop() }, icon("split"));
      winBtn = h("button", { className: "pgs-icon pgs-win-btn", title: "Back to window mode", onclick: () => unpop() }, icon("win"));
      const head = h("div", { className: "pgs-head", title: "Drag to move (it snaps to the nearest corner) · double-click to reset" },
        newBtn, h("div", { className: "pgs-head-right" }, splitBtn, winBtn, closeBtn));
      enableDrag(head);

      logEl = h("div", { className: "pgs-log" });
      stackEl = h("div", { className: "pgs-stack", hidden: true });
      const isVid = !!ytId(srcUrl() || "");
      input = h("textarea", { className: "pgs-input", rows: 1, placeholder: isVid ? "Ask about this video…" : "Ask a question about this page…" });
      input.addEventListener("input", autosize);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submit(); }
      });
      sendBtn = h("button", { className: "pgs-send", onclick: () => (busy ? stop() : submit()) });
      const chips = h("div", { className: "pgs-chips" }, ...(isVid ? YT_CHIPS : CHIPS).map(([label, q]) =>
        h("button", { className: "pgs-chip", textContent: label, onclick: () => submit(q || pref("prompt", DEFAULT_PROMPT), { label }) })
      ));
      const foot = h("div", { className: "pgs-foot" },
        h("div", { className: "pgs-composer" }, stackEl, input, h("div", { className: "pgs-row" }, chips, sendBtn)));

      panel = h("div", { id: "pgs-panel" }, head, logEl, foot);
      document.documentElement.append(panel);
      setBusy(false);
      position();
    }

    // ----- conversation -----
    function pageCard(url, attached) {
      const hostName = new URL(url).hostname.replace(/^www\./, "");
      const ico = h("div", { className: "pgs-card-ico" });
      if (src.image) ico.append(h("img", { className: "pgs-card-fav", src: src.image }));
      else ico.textContent = (hostName[0] || "?").toUpperCase();
      let label = src.label || url;
      if (/youtube\.com$|youtu\.be$/.test(hostName)) label = label.replace(/\s*[-–—]\s*YouTube\s*$/, "");
      const title = h("div", { className: "pgs-card-title", textContent: label });
      const card = h("div", { className: attached ? "pgs-card pgs-attached" : "pgs-card" }, ico,
        h("div", { className: "pgs-card-meta" }, title, h("div", { className: "pgs-card-domain", textContent: hostName })));
      card._title = title;
      return card;
    }

    // The page being chatted about sits in the composer as a card (with selected-text snippets
    // stacked on top of it) until you send. Re-render that pile when the tab/page changes.
    const refreshAttach = () => { if (!closed) renderStack(); };

    // your message in the chat: page card (first message only) + selected-text cards + the bubble
    const userMsg = (label, rs, card) =>
      h("div", { className: "pgs-msg pgs-ug" }, ...(card ? [card] : []), ...rs.map((r) => refCard(r, false)),
        h("div", { className: "pgs-ubub", textContent: label }));

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
      // repaint on a chunk cadence (not per token) so text fades in by the chunk, not per letter
      let shown = 0, lastPaint = 0;
      const paint = () => {
        dropDots();
        const stick = nearBottom();
        renderMd(answerEl, acc, seek, shown); // only lines past `shown` animate in
        shown = acc.length;
        if (stick) scrollDown(false);
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
            if (now - lastPaint >= 80) { lastPaint = now; paint(); }
          }
          paint(); // flush the buffered tail (fades the last chunk in)
          const cleaned = clean(acc); // drop any timestamps invented past the end of the video
          if (cleaned !== acc) { acc = cleaned; renderMd(answerEl, acc, seek); }
          else acc = cleaned;
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
      if (page.title && cardEl) cardEl._title.textContent = page.title;
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
      renderStack();
      let card = null;
      if (!started) { // the attached page card moves from the text field into the chat, together with your message
        started = true;
        const url = srcUrl();
        if (url) { card = pageCard(url, false); cardEl = card; }
        renderStack();
      }
      logEl.append(userMsg(opts.label || q, mine, card));
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
      cardEl = null;
      renderStack();
      setBusy(false);
      if (input) { input.value = ""; autosize(); }
      logEl.replaceChildren();
    }

    // open an empty chat; the page is attached to the text field, nothing is read or sent until you ask
    function open() {
      if (!panel) build();
      newChat();
      input.focus();
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
    function restore() { userHidden = false; sync(); input?.focus(); }

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
      try { mm?.removeMessageListener(SEL_MSG, onSelection); } catch {}
      sessions.delete(host);
      if (!panel) return;
      const p = panel;
      if (immediate) p.remove();
      else { p.classList.add("pgs-out"); setTimeout(() => p.remove(), 180); }
    }

    self = {
      open, sync, dismiss, restore, position, close, pop, unpop, wipe, refreshAttach,
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
        else if (!(flags & (WPL.LOCATION_CHANGE_SAME_DOCUMENT ?? 0x1))) mine.forEach((x) => x.refreshAttach());
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
  console.log("[page-summary] loaded v1.9.20");
})();
