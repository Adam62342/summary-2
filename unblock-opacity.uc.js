// Unblock Opacity Slider — Zen (Sine) userChrome script
//
// Problem: when no accent color is selected, Zen's gradient code takes a
// branch that returns a fixed background and never reads the opacity value,
// so the (now-visible) opacity slider does nothing.
//
// Fix: patch nsZenThemePicker.prototype.getGradient so that when the color
// list is empty, the background is built from `currentOpacity` as the alpha.
// For any case WITH colors, we defer to Zen's original implementation.

(function () {
  "use strict";

  // Patch the shared prototype once; every window's gZenThemePicker instance
  // inherits it, and private-field access in the original still works because
  // we call it with the real instance as `this`.
  function tryPatch() {
    const picker = window.gZenThemePicker;
    if (!picker) return false;

    const proto = Object.getPrototypeOf(picker);
    if (!proto || typeof proto.getGradient !== "function") return false;
    if (proto.__unblockOpacityPatched) return true;

    const originalGetGradient = proto.getGradient;

    proto.getGradient = function (colors, forToolbar = false) {
      // Only change behavior when there is no color selected.
      if (!colors || colors.length === 0) {
        try {
          // getToolbarModifiedBaseRaw() -> [r, g, b, a]; use the window's
          // base chrome color (dark: 23,23,26 / light: 240,240,244).
          const base = this.getToolbarModifiedBaseRaw().slice(0, 3);
          let alpha =
            typeof this.currentOpacity === "number" ? this.currentOpacity : 1;
          alpha = Math.max(0, Math.min(1, alpha)); // clamp to 0..1
          return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha})`;
        } catch (e) {
          // If anything about Zen's internals changed, fail safe to original.
          return originalGetGradient.call(this, colors, forToolbar);
        }
      }
      return originalGetGradient.call(this, colors, forToolbar);
    };

    proto.__unblockOpacityPatched = true;

    // Re-render the current workspace so the effect shows immediately.
    try {
      picker.updateCurrentWorkspace?.();
    } catch (e) {}

    return true;
  }

  // gZenThemePicker may not exist yet at script load; retry briefly.
  if (!tryPatch()) {
    let attempts = 0;
    const timer = setInterval(() => {
      if (tryPatch() || ++attempts > 100) clearInterval(timer);
    }, 300);
  }
})();
