/**
 * Copy text to the clipboard. The async clipboard only exists on a secure
 * page (https or localhost), and plenty of self-hosted installs are plain http,
 * so fall back to the old select-and-copy route there.
 * @param {string} text
 * @returns {Promise<boolean>} whether it was copied
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* denied — try the fallback */
  }
  try {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand('copy');
    box.remove();
    return ok;
  } catch {
    return false;
  }
}
