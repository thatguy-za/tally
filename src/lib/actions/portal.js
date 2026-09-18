/**
 * Moves a popover/modal element to `<body>` so it escapes any ancestor's
 * `overflow: hidden` or `transform` and can be positioned with real
 * viewport coordinates. Used by every anchored popover — CategorySelect,
 * ColorPicker, MonthCalendarPicker, PeriodPicker.
 *
 * Every `.card` on this app animates in with a persistent (fill-mode
 * "both") transform/opacity animation, which per spec makes it its own
 * stacking context for the rest of the page's life — trapping a normal
 * z-indexed popover inside it, so a later sibling card paints over it.
 * Portalling to `<body>` and positioning in document coordinates sidesteps
 * that entirely. Once at the body level, the popover's z-index (65) has to
 * clear every full-screen layer it might open on top of — notably the
 * onboarding overlay (z-index 60, see `.overlay` in app.css) — or it opens
 * "successfully" while rendering invisibly behind it.
 * @param {HTMLElement} node
 */
export function portal(node) {
  document.body.appendChild(node);
  return { destroy: () => node.remove() };
}
