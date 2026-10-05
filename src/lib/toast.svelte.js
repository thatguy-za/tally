export const toasts = $state([]);

let seq = 0;

/**
 * @param {string} message
 * @param {{ type?: 'success' | 'info' | 'update', duration?: number, onClick?: () => void, dismissible?: boolean }} [opts]
 *   `onClick` replaces the default tap-to-dismiss behaviour — for a toast that
 *   is itself an action (e.g. "a new version is ready", tap to reload).
 *   `dismissible` adds a close button, for a toast whose body does something
 *   other than dismiss it and that doesn't time out.
 */
export function toast(message, opts = {}) {
  if (!message) return;
  const t = { id: ++seq, message, type: opts.type ?? 'success', onClick: opts.onClick, dismissible: !!opts.dismissible };
  toasts.push(t);
  const ttl = opts.duration ?? 3400;
  if (ttl > 0) setTimeout(() => dismiss(t.id), ttl);
  return t.id;
}

export function dismiss(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i > -1) toasts.splice(i, 1);
}
