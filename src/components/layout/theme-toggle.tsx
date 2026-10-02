'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'ad-tool.theme';

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/** Light/dark switch. Initial value follows the OS unless the user chose. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage may be unavailable (private mode); the class still applies.
    }
  }, [theme]);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="rounded-md border border-border px-2 py-1 text-xs text-foreground-muted hover:bg-muted"
    >
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}
