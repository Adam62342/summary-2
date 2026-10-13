# Unblock Opacity Slider

A [Sine](https://github.com/CosmoCreeper/Sine) mod for [Zen Browser](https://zen-browser.app) that makes the **workspace theme opacity slider usable even when no color is selected** — and lets it actually control the background transparency.

## The problem

In Zen's theme picker, the opacity slider is hidden until you add an accent color. Two things cause this:

1. **It's hidden.** When no color is selected, Zen sets `invalidate-controls="true"` on the theme panel and its stylesheet hides the slider with `display: none`.
2. **It does nothing even if shown.** Zen's gradient code has a branch for the no-color case that returns a fixed background and never reads the opacity value:

   ```js
   if (themedColors.length === 0) {
     // returns a fixed background — currentOpacity is ignored here
   }
   ```

So un-hiding the slider with CSS alone makes it move but have no effect.

## The fix

This mod does both halves:

- **`chrome.css`** un-hides the slider:
  ```css
  #PanelUI-zen-gradient-generator[invalidate-controls="true"]
    #PanelUI-zen-gradient-generator-opacity { display: revert !important; }
  ```
- **`unblock-opacity.uc.js`** patches `nsZenThemePicker.prototype.getGradient` so that, when no color is selected, the background is built from the slider's opacity as its alpha (using the window's base chrome color). Any case *with* colors falls through to Zen's original behavior untouched.

Result: with no color picked, dragging the slider fades the workspace background from solid to transparent.

## Install (via Sine, from GitHub)

1. Create a GitHub repo named `zen-unblock-opacity-slider` and push these files to the `main` branch:
   - `theme.json`
   - `chrome.css`
   - `unblock-opacity.uc.js`
   - `README.md`
2. In **`theme.json`**, replace `YOUR_GITHUB_USERNAME` in `homepage` and `author` with your username. (`style`, `scripts`, and `readme` use relative paths, so they need no editing.)
3. In Zen, open **Settings → Sine**, and in *"add your own locally from a GitHub repo"* paste:
   ```
   https://github.com/YOUR_GITHUB_USERNAME/zen-unblock-opacity-slider
   ```
4. **Restart Zen** (scripts load at startup). Open a workspace's theme editor with no color selected and try the slider.

## Notes & caveats

- Needs a Zen restart whenever the script changes (userChrome scripts only load at startup).
- The opacity value is saved per workspace, so it persists across restarts.
- This patches Zen internals (`getGradient`, `getToolbarModifiedBaseRaw`, the `PanelUI-zen-gradient-generator` ids). They're stable today; a future Zen refactor could require a small update here. The script fails safe to Zen's original behavior if those internals change.
- On platforms that don't support chrome transparency, low opacity blends toward the base color instead of going see-through.

## License

MIT
