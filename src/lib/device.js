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
