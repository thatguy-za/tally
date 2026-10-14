const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const visible = (list) => [...list].filter((el) => el.getClientRects().length > 0);

/**
 * Behaviour every modal dialog needs, in one place:
 * - moved to <body>, so a transformed or scrolling ancestor (the mobile nav
 *   menu, a card) can't clip it or trap it;
 * - keyboard focus moves into it when it opens, Tab and Shift+Tab stay inside
 *   it, and focus goes back to whatever opened it when it closes — without
 *   this, a keyboard or screen-reader user keeps tabbing through the page
 *   behind the dialog.
 * @param {HTMLElement} node
 */
export function modal(node) {
  const opener = /** @type {HTMLElement | null} */ (document.activeElement);
  document.body.appendChild(node);

  node.tabIndex = -1;
  // start on the first thing to fill in if there is one, else the first control
  const first =
    node.querySelector('[data-autofocus]') ||
    visible(node.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]),select,textarea'))[0] ||
    visible(node.querySelectorAll(FOCUSABLE))[0];
  /** @type {HTMLElement} */ (first || node).focus({ preventScroll: true });

  /** @param {KeyboardEvent} e */
  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const items = visible(node.querySelectorAll(FOCUSABLE));
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const firstEl = /** @type {HTMLElement} */ (items[0]);
    const lastEl = /** @type {HTMLElement} */ (items[items.length - 1]);
    const active = document.activeElement;
    if (e.shiftKey && (active === firstEl || active === node || !node.contains(active))) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && (active === lastEl || !node.contains(active))) {
      e.preventDefault();
      firstEl.focus();
    }
  }
  node.addEventListener('keydown', onKeydown);

  return {
    destroy() {
      node.removeEventListener('keydown', onKeydown);
      node.remove();
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    }
  };
}
