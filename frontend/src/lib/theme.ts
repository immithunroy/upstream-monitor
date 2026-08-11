export type Theme = 'light' | 'dark';

const KEY = 'upstream_theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function setTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'light') root.classList.remove('dark');
  else root.classList.add('dark');
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
}

export function toggleTheme(): Theme {
  const next = getTheme() === 'light' ? 'dark' : 'light';
  setTheme(next);
  return next;
}
