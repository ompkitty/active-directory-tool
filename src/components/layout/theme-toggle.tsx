'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY, THEME_EVENT } from '@/lib/theme';

type Theme = 'light' | 'dark';

function getSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

// The server cannot know the theme, and the pre-hydration script may already
// have flipped the class. Returning a fixed server snapshot keeps the first
// client render byte-identical to the server markup; React then re-renders
// with the real value after hydration.
function getServerSnapshot(): Theme {
  return 'light';
}

function subscribe(onChange: () => void): () => void {
  document.addEventListener(THEME_EVENT, onChange);
  return () => document.removeEventListener(THEME_EVENT, onChange);
}

export function setTheme(next: Theme): void {
  document.documentElement.classList.toggle('dark', next === 'dark');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage may be unavailable (private mode); the class still applies.
  }
  document.dispatchEvent(new Event(THEME_EVENT));
}

/** Light/dark switch, synchronised with the class the init script applied. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => {
    setTheme(getSnapshot() === 'dark' ? 'light' : 'dark');
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="rounded-md border border-border px-2 py-1 text-xs text-foreground-muted hover:bg-muted"
    >
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  );
}
