/**
 * Applies the persisted theme before first paint to avoid a flash of the
 * wrong theme. Kept inline in the document head; no secrets involved.
 */
export const THEME_INIT_SCRIPT = `(() => {
  try {
    var stored = localStorage.getItem('ad-tool.theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();`;
