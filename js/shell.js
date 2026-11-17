// The app frame around every screen: top bar, the side menu (a slide-out drawer on phones),
// and the live bits in them (greeting, level, cards due, Drive status, theme, sync).
import { getSettings, setSetting } from './settings.js';
import { toast } from './ui.js';

const $ = (id) => document.getElementById(id);
const wideQuery = window.matchMedia('(min-width: 1024px)');
export const isWide = () => wideQuery.matches;

const ago = (t) => { if (!t) return 'nunca'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

// --- Drawer (phones and narrow windows)
function setDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  $('menuBtn').setAttribute('aria-expanded', String(open));
  $('scrim').hidden = !open;
  if (open) { const a = document.querySelector('#nav .nav a[aria-current]') || document.querySelector('#nav .nav a'); if (a) a.focus(); }
}
export const closeDrawer = () => { if (document.body.classList.contains('drawer-open')) setDrawer(false); };

// --- Live pieces
function paintTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const b = $('themeBtn');
  b.innerHTML = dark ? SUN : MOON;
  b.setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
  b.title = b.getAttribute('aria-label');
}

function paintProfile() {
  const s = getSettings();
  $('navHello').textContent = s.name ? `¡Buenas, ${s.name}!` : '¡Buenas!';
  $('navLevel').textContent = `${s.level} → ${s.goal}`;
}

async function paintDue() {
  try {
    const { buildQueue } = await import('./penumbra.js');
    const q = await buildQueue();
    const due = q.reviews.length + q.fresh.length + q.counts.learning;
    const b = $('navDue');
    b.textContent = String(due);
    b.hidden = !due;
    b.setAttribute('aria-label', `${due} para repasar hoy`);
  } catch { /* storage not ready */ }
}

async function paintSync() {
  const { settings } = await import('./penumbra.js');
  $('navFsrs').textContent = `FSRS-5 · ${Math.round(settings().retention * 100)}% de retención`;
  try {
    const m = await import('./sync.js');
    const st = m.syncState(), on = m.driveConnected();
    const dot = $('navDriveDot'), text = $('navDrive'), when = $('navDriveWhen');
    dot.dataset.state = !on ? 'off' : st.busy ? 'busy' : st.error ? 'error' : 'on';
    text.textContent = !on ? 'Drive sin conectar' : st.busy ? 'Sincronizando…' : st.error ? 'Drive: falló el último intento' : 'Drive conectado';
    when.textContent = on && !st.busy ? ago(st.lastSync) : '';
    $('syncBtn').classList.toggle('busy', !!st.busy);
  } catch { /* offline first load */ }
}

async function syncClick() {
  const btn = $('syncBtn');
  const m = await import('./sync.js');
  if (!m.driveConnected()) { location.hash = '#/perfil?sync'; toast('Conectá Google Drive en Ajustes'); return; }
  if (btn.disabled) return;
  btn.disabled = true;
  try { await m.syncNow({ interactive: true }); toast('Sincronizado con Google Drive'); }
  catch (e) { toast(String(e.message || e)); }
  btn.disabled = false;
  paintSync();
}

// Called by the router on every screen change.
export function update(tab) {
  document.querySelectorAll('#nav .nav a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  closeDrawer();
  paintTheme(); paintProfile(); paintDue(); paintSync();
}

export function init({ version, onWideChange }) {
  $('appVer').textContent = version.split(' ')[0];
  $('menuBtn').onclick = () => setDrawer(!document.body.classList.contains('drawer-open'));
  $('navClose').onclick = () => setDrawer(false);
  $('scrim').onclick = () => setDrawer(false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  $('themeBtn').onclick = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    setSetting('theme', dark ? 'light' : 'dark');
    paintTheme();
    toast(dark ? 'Tema claro' : 'Tema oscuro (AMOLED)');
  };
  $('syncBtn').onclick = syncClick;
  window.addEventListener('penumbra:sync', paintSync);
  window.addEventListener('penumbra:changed', paintDue);
  wideQuery.addEventListener('change', () => { closeDrawer(); if (onWideChange) onWideChange(isWide()); });
  setInterval(paintSync, 60000);
  // Ajustes changes the theme, name and level in place: keep the frame in step.
  new MutationObserver(paintTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  ['change', 'click'].forEach((ev) => document.addEventListener(ev, () => requestAnimationFrame(paintProfile)));
}
