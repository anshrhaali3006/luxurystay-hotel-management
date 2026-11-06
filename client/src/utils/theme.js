import React from 'react';

// Theme preference: 'light' | 'dark' | 'system'. Stored per browser; the page gets data-theme="light|dark".
const KEY = 'luxurystay_theme';
const EVENT = 'luxurystay-theme-change';
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function getThemePref() {
  try { const v = localStorage.getItem(KEY); return ['light', 'dark', 'system'].includes(v) ? v : 'light'; } catch { return 'light'; }
}
export const resolveTheme = (pref = getThemePref()) => (pref === 'system' ? (media()?.matches ? 'dark' : 'light') : pref);

export function applyTheme(pref = getThemePref()) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b1626' : '#10253f');
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* storage blocked: the choice just lasts until reload */ }
  applyTheme(pref);
  window.dispatchEvent(new Event(EVENT));
}

/** Call once at startup. Also follows the operating-system setting while the preference is 'system'. */
export function initTheme() {
  applyTheme();
  media()?.addEventListener?.('change', () => { if (getThemePref() === 'system') { applyTheme(); window.dispatchEvent(new Event(EVENT)); } });
}

/** React hook: { pref, resolved, setPref, toggle } and re-renders when the theme changes anywhere. */
export function useTheme() {
  const subscribe = React.useCallback((cb) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); }, []);
  const pref = React.useSyncExternalStore(subscribe, getThemePref, () => 'light');
  const resolved = resolveTheme(pref);
  return { pref, resolved, setPref: setThemePref, toggle: () => setThemePref(resolved === 'dark' ? 'light' : 'dark') };
}
