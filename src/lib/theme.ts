/** localStorage key for the chosen theme. */
export const THEME_STORAGE_KEY = 'ad-tool.theme';

/** Custom event used to keep the toggle in sync with the <html> class. */
export const THEME_EVENT = 'ad-tool:themechange';

/**
 * Applies the persisted theme before first paint to avoid a flash of the
 * wrong theme. Rendered with next/script strategy="beforeInteractive", so it
 * is injected into the document head from the server.
 */
export const THEME_INIT_SCRIPT = `(() => {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();`;
