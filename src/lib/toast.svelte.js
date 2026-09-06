export const toasts = $state([]);

let seq = 0;

/**
 * @param {string} message
 * @param {{ type?: 'success' | 'info', duration?: number }} [opts]
 */
export function toast(message, opts = {}) {
  if (!message) return;
  const t = { id: ++seq, message, type: opts.type ?? 'success' };
  toasts.push(t);
  const ttl = opts.duration ?? 3400;
  if (ttl > 0) setTimeout(() => dismiss(t.id), ttl);
  return t.id;
}

export function dismiss(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i > -1) toasts.splice(i, 1);
}
