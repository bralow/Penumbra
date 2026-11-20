// Monthly calendar of saved entries (Diario recordings, Escribir texts) and the floating list of one day's
// entries. Days with entries are filled with the accent colour, with a count when there's more than one.
import { h, iconEl, openModal, closeBtn } from './ui.js';

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
export const fmtHour = (t) => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
export const fmtLong = (t) => { const x = new Date(t).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return x.charAt(0).toUpperCase() + x.slice(1); };
const monthOf = (t) => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };

// all: entries with .at (newest first). state: { month } object kept by the screen, so coming back keeps the month.
// noun: [singular, plural]. onDay(list, button) runs when a marked day is tapped.
export function monthCalendar(all, { state, noun, onDay }) {
  const [one, many] = noun;
  const byDay = new Map();
  for (const e of all) { const k = dayKey(e.at); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); }
  const now = new Date(), thisMonth = monthOf(now);
  // Months you can go to: this month and every past month with entries.
  const months = [...new Set([...all.map((e) => monthOf(e.at)), thisMonth])].filter((i) => i <= thisMonth).sort((a, b) => a - b);
  if (state.month == null || !months.includes(state.month)) state.month = Math.min(thisMonth, all.length ? monthOf(all[0].at) : thisMonth);
  const box = h('section', { class: 'card cal', style: 'gap:10px' });
  const draw = () => {
    const idx = state.month, y = Math.floor(idx / 12), m = idx % 12, pos = months.indexOf(idx);
    const inMonth = all.filter((e) => monthOf(e.at) === idx);
    const nDays = new Set(inMonth.map((e) => dayKey(e.at))).size;
    const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mes anterior', disabled: pos <= 0 }, iconEl('prev'));
    const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mes siguiente', disabled: pos >= months.length - 1 }, iconEl('next'));
    const go = (i) => { if (i < 0 || i >= months.length) return; state.month = months[i]; draw(); };
    prev.onclick = () => go(pos - 1); next.onclick = () => go(pos + 1);
    const grid = h('div', { class: 'cal-grid', role: 'group', 'aria-label': `${many} de ${MONTHS[m]} de ${y}` },
      ...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => h('span', { class: 'cal-wd', 'aria-hidden': 'true' }, d)));
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // weeks start on Monday
    for (let i = 0; i < lead; i++) grid.append(h('span'));
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const list = byDay.get(`${y}-${m}-${d}`);
      const today = idx === thisMonth && d === now.getDate();
      if (!list) { grid.append(h('span', { class: `cal-day${today ? ' today' : ''}` }, String(d))); continue; }
      const b = h('button', { type: 'button', class: `cal-day on${today ? ' today' : ''}`, 'aria-haspopup': 'dialog', 'aria-label': `${d} de ${MONTHS[m]}: ${list.length} ${list.length > 1 ? many : one}` },
        String(d), list.length > 1 ? h('span', { class: 'cal-n', 'aria-hidden': 'true' }, String(list.length)) : null);
      b.onclick = () => onDay(list, b);
      grid.append(b);
    }
    box.replaceChildren(
      h('div', { class: 'between', style: 'flex-wrap:nowrap' }, prev,
        h('div', { style: 'text-align:center;display:flex;flex-direction:column;gap:2px', 'aria-live': 'polite' },
          h('b', { style: 'font-family:var(--display);font-size:18px;text-transform:capitalize' }, `${MONTHS[m]} ${y}`),
          h('span', { class: 'muted small' }, inMonth.length ? `${inMonth.length} ${inMonth.length > 1 ? many : one} en ${nDays} día${nDays > 1 ? 's' : ''}` : `Sin ${many} este mes`)),
        next),
      grid,
      h('p', { class: 'muted small', style: 'text-align:center' }, `Tocá un día marcado para ver sus ${many}.`));
  };
  draw();
  return box;
}

// The entries of one day in a floating panel. row(e) -> { href, head, title, preview, meta }.
export function dayListModal(list, from, { noun, row }) {
  const sorted = [...list].sort((a, b) => a.at - b.at);
  openModal((api) => {
    api.box.setAttribute('aria-label', `${noun[1]} del ${fmtLong(sorted[0].at)}`);
    api.box.append(
      h('div', { class: 'row', style: 'gap:10px;align-items:center' },
        h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px' },
          h('span', { class: 'kicker' }, `${sorted.length} ${(sorted.length > 1 ? noun[1] : noun[0]).toUpperCase()}`),
          h('h2', { style: 'font-size:20px' }, fmtLong(sorted[0].at))),
        closeBtn(api.close)),
      ...sorted.map((e) => {
        const r = row(e);
        const a = h('a', { href: r.href, class: 'card', style: 'text-decoration:none;color:inherit;gap:4px;padding:12px 14px;background:var(--bg)' },
          h('div', { class: 'between', style: 'flex-wrap:nowrap' }, h('b', {}, r.head), h('span', { style: 'color:var(--accent);font-weight:700;font-size:13px' }, 'Ver →')),
          r.title ? h('span', { class: 'small', style: 'font-family:var(--display);font-weight:600;line-height:1.35' }, r.title) : null,
          r.preview ? h('span', { class: 'muted small', style: 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4' }, r.preview) : null,
          r.meta ? h('span', { class: 'muted', style: 'font-size:12px' }, r.meta) : null);
        a.onclick = () => api.close();
        return a;
      }));
  }, from);
}
