const KEY = 'cadencia.settings';
const DEFAULTS = { level: 'B1', goal: 'C1', speed: '0.75', theme: 'dark', accent: 'cian', accentHex: '#2AB4D6', density: 'comoda', name: '', hoyHidden: [], goals: { reviews: 30, streak: 30 } };

export function getSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  if (['theme', 'accent', 'accentHex', 'density'].includes(key)) applyTheme();
  return s;
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

// --- Accent colours. The presets have a tuned light and dark shade in app.css; a custom colour is
// adjusted here so text in that colour stays readable on the page (contrast of at least 3:1).
export const PRESETS = { cian: '#2AB4D6', azul: '#8FA8FF', menta: '#5EEAD4', ambar: '#FFB86B', lila: '#E9A8FF' };
export const validHex = (x) => /^#[0-9a-f]{6}$/i.test(String(x || '').trim());
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Mix toward black (light pages) or white (dark pages) until readable on that background.
export function readableAccent(hex, dark) {
  const bg = dark ? [0, 0, 0] : [255, 255, 255], to = dark ? 255 : 0;
  let c = rgb(hex);
  for (let i = 0; i < 20 && contrast(c, bg) < 3; i++) c = c.map((v) => v + (to - v) * 0.12);
  return toHex(c);
}
export const inkFor = (hex) => (lum(rgb(hex)) > 0.32 ? '#07070A' : '#FFFFFF');

export function applyTheme() {
  const { theme, accent, accentHex, density } = getSettings();
  const dark = theme === 'dark' || (theme === 'system' && media.matches);
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  const custom = accent === 'custom' && validHex(accentHex);
  root.dataset.accent = custom ? 'custom' : (PRESETS[accent] ? accent : 'cian');
  // The raw colour (cards with a photo behind them use it as is) and, for a custom colour, the page shade.
  const raw = custom ? accentHex : PRESETS[root.dataset.accent];
  root.style.setProperty('--accent-raw', raw);
  root.style.setProperty('--accent-raw-ink', inkFor(raw));
  if (custom) {
    const page = readableAccent(accentHex, dark);
    root.style.setProperty('--accent', page);
    root.style.setProperty('--accent-ink', inkFor(page));
  } else { root.style.removeProperty('--accent'); root.style.removeProperty('--accent-ink'); }
  root.dataset.density = density || 'comoda';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#000000' : '#F6F6F8';
}
media.addEventListener('change', applyTheme);
