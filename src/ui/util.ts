export function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** 'system' removes the override so the OS/browser preference (prefers-color-scheme)
 *  decides — 'light'/'dark' force it via the [data-theme] CSS blocks. */
export function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e1420' : '#f5f1e4');
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string): void {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1900);
}
