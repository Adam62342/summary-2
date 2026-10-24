# Page Summary (Sine mod)

A Dia-style AI summary & chat panel for Zen / Firefox, loaded as a userChrome.js mod via Sine.
Press **⌘E** (macOS) / **Ctrl+E** (Windows/Linux), or click the toolbar button, to toggle it on
the current tab.

## What it does

- **Summarize & chat any page.** Reads the page's main text and streams a tight bullet summary into
  a native-looking side panel. Ask follow-up questions; Copy or Regenerate any answer; **Retry** if a
  request fails. Links in answers are clickable and open in a new tab. Optionally summarize
  automatically the moment the panel opens (setting).
- **Context cards.** The current page attaches to the composer as a small thumbnail card. Add more
  context with the **+** button next to the chips, or by selecting text on the page:
  - **Selected text** stacks on top as a quote-snippet card.
  - **Another open tab** — pick any loaded tab (shown with its favicon) and its readable text is
    attached as a card, so you can compare or cross-reference pages ("how does this differ from that
    one?"). Type **@** in the box to open the tab picker and keep typing to filter it.
  - **Pasted text** — drop whatever's on your clipboard in as a card.

  The pile fans out on hover and each card has a ✕ to remove it. Whatever's attached when you send
  travels into your message. Up to five cards at a time. If you open the panel on top of a **split
  view**, the whole split becomes one chat: it floats over both panes, stays visible whichever half
  you click, and attaches every pane as a card (so ⌘E grabs the split as a single environment).
- **YouTube video summaries.** On a video, it reads the video's own transcript instead of the page
  chrome. It opens YouTube's "Show transcript" panel and scrapes it directly, so it works regardless
  of interface language and without caption APIs. Works on watch pages, Shorts, and youtu.be links.
  - Chips: **Summarize**, **Key moments**, **Takeaways**, **TL;DR**.
  - **Key moments** are grouped across the whole video and prefixed with clickable **[mm:ss]**
    timestamps that seek the player. Invented/out-of-range timestamps are filtered out.
  - Plain summaries stay timestamp-free; timestamps only show when you ask for moments.
  - Switch to a different video in the same tab and it re-reads the new one automatically.
  - Toggle whether the transcript keeps timestamps in the mod's settings.
- **Smooth streaming.** Animated "thinking" dots appear before the first token, then the answer
  eases in a few lines at a time rather than character-by-character.
- **Movable window.** Drag the header to move it; it snaps to the nearest corner. Double-click the
  header to reset to the top-right.

## AI backends

Set these in the mod's settings (Sine → this mod → preferences):

- **Apple Intelligence (default).** Runs on-device via afm-server (`http://127.0.0.1:11435/v1`,
  model `apple.local`). No API key. Long pages are condensed to fit the small on-device context.
- **Anthropic (Claude).** Needs an API key.
- **Any OpenAI-compatible endpoint** — OpenAI, Gemini, Groq, Ollama, etc. Point the base URL at your
  server (e.g. a local Ollama running Llama 3.2 3B) and set a key if it needs one.
- **No key / server unreachable.** Falls back to an instant offline extractive summarizer (no
  network).

## Settings

Provider · API key · model · OpenAI-compatible base URL · afm-server URL · panel width/height ·
summary instruction · max characters sent to the model · keep YouTube [mm:ss] timestamps ·
summarize automatically on open.

## Notes

- The API key is stored as a plain-text preference in your Firefox profile, not in this repo.
- Files: `page-summary.uc.js` (all logic + styles), `theme.json`, `preferences.json`, `chrome.css`.
