/**
 * iPhone, iPod and iPad. iPadOS 13+ reports itself as a Mac in its user
 * agent, so a "Mac" that also has a touch screen is an iPad.
 * @param {{ userAgent?: string, platform?: string, maxTouchPoints?: number }} nav
 */
export function isIOS(nav) {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/.test(nav.userAgent || '')) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

/** Running as an installed home-screen app, not in a browser tab. */
export function isStandalone(win) {
  if (!win) return false;
  return !!win.navigator?.standalone || !!win.matchMedia?.('(display-mode: standalone)').matches;
}

/** Offer the "Add to Home Screen" tip: on iOS, in the browser, and not already waved away. */
export const shouldOfferInstall = ({ ios, standalone, dismissed }) => !!ios && !standalone && !dismissed;
