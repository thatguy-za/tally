export const theme = $state({ value: 'system' });

export function initTheme() {
  try {
    theme.value = localStorage.getItem('theme') || 'system';
  } catch (e) {
    /* ignore */
  }
}

export function setTheme(v) {
  theme.value = v;
  try {
    if (v === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', v);
  } catch (e) {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    if (v === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = v;
  }
}

export function toggleTheme() {
  const effective =
    theme.value === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme.value;
  setTheme(effective === 'dark' ? 'light' : 'dark');
}
