// Hoy, the home screen ("Hoy completo" on the design canvas): today's reviews with the goal meters,
// then one suggestion per kind of practice, then progress (streak + activity heatmap) and the phrase of the day.
// Each block below the reviews can be hidden from Ajustes → Apariencia.
import { h, iconEl, toast, pageHead, wide } from '../ui.js';
import { db } from '../db.js';
import { getSettings } from '../settings.js';
import { transcribe } from '../ipa.js';
import { Player } from '../audio.js';
import { phonemeStatus, events } from '../progress.js';
import { dayNumber, cardFor } from './cultura.js';
import { CARDS } from '../culturadata.js';
import { buildQueue, settings as penSettings, dayStart } from '../penumbra.js';

export const HOY_BLOCKS = { cultura: 'Tarjeta del día', sombra: 'Sombra del día', charla: 'Charlá con Flor', atajos: 'Calentamiento y Vos', progreso: 'Tu progreso', frase: 'Frase del día' };

const PHRASES = [
  ['Che, ¿me pasás la yerba?', 'Hey, can you pass me the yerba?'],
  ['¿Querés que te pase a buscar mañana?', 'Want me to pick you up tomorrow?'],
  ['No te hagás drama, ya lo arreglamos.', 'Don’t make a fuss, we’ll fix it.'],
  ['Vení que te cuento una cosa.', 'Come here, I’ll tell you something.'],
  ['¿Tenés cambio para el colectivo?', 'Do you have change for the bus?'],
  ['Está re lindo el día para unos mates.', 'It’s a really nice day for some mate.'],
  ['Dale, nos vemos a las ocho en la esquina.', 'OK, see you at eight on the corner.'],
];
const DAY = 86400000;
const dayIndex = (n) => { const d = new Date(); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / DAY) % n; };
const key = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const NAMES = { sombra: 'Sombra', charla: 'Charla', vos: 'Vos', oido: 'Oído', ipa: 'IPA', traba: 'Trabalenguas', diario: 'Diario', escribir: 'Escribir', lookup: 'Lectura', podcast: 'Podcast', cultura: 'Cultura', crucigrama: 'Crucigrama', practica: 'Práctica', elision: 'Elisión', cognados: 'Cognados', calentamiento: 'Calentamiento' };

// Activity per day: cards reviewed, and minutes practised (each minute with any logged practice counts once).
export async function activity() {
  const days = new Map();
  const get = (t) => { const k = key(t); if (!days.has(k)) days.set(k, { cards: 0, pass: 0, minutes: new Set(), kinds: new Set() }); return days.get(k); };
  for (const r of await db.all('revlog')) { const d = get(r.ts); d.cards++; if (r.pass) d.pass++; d.minutes.add(Math.floor(r.ts / 60000)); }
  for (const e of events()) { if (e.type === 'repaso') continue; const d = get(e.t); d.minutes.add(Math.floor(e.t / 60000)); if (NAMES[e.type]) d.kinds.add(NAMES[e.type]); }
  return days;
}

// A one-tap sync button when Drive is connected but hasn't synced for a while (Google's session lasts an hour).
function syncChip() {
  const slot = h('span', {});
  import('../sync.js').then((m) => {
    if (!m.driveConnected() || m.canSyncSilently()) return;
    const st = m.syncState();
    if (st.lastSync && Date.now() - st.lastSync < 6 * 3600000) return;
    const b = h('button', { type: 'button', class: 'pill', 'aria-label': 'Sincronizar con Google Drive', style: 'min-height:36px;font-size:12px' }, '☁ Sincronizar');
    b.onclick = async () => { b.disabled = true; b.textContent = '☁ …'; try { await m.syncNow({ interactive: true }); b.remove(); toast('Sincronizado'); } catch (e) { b.disabled = false; b.textContent = '☁ Sincronizar'; toast(String(e.message || e)); } };
    slot.append(b);
  });
  return slot;
}

export async function render(main) {
  const s = getSettings();
  const hidden = new Set(s.hoyHidden || []);
  const goals = { reviews: 30, streak: 30, ...(s.goals || {}) };
  const pen = penSettings();
  const isWide = wide();
  const date = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  main.append(pageHead(date.toUpperCase(), s.name ? `¡Buenas, ${s.name}!` : '¡Buenas!', syncChip(),
    h('a', { href: '#/perfil', class: 'tag' }, h('span', { style: 'width:8px;height:8px;border-radius:50%;background:var(--accent)' }), `Nivel ${s.level} → ${s.goal}`)));

  // --- Today's numbers (FE-07): reviews, new cards, streak, retention against your goals
  const [q, days, cards] = await Promise.all([buildQueue(), activity(), db.all('cards')]);
  const due = q.reviews.length + q.fresh.length + q.counts.learning;
  const mins = Math.max(1, Math.round(due * 8 / 60));
  const today = days.get(key(Date.now())) || { cards: 0, pass: 0, minutes: new Set(), kinds: new Set() };
  const log = await db.all('revlog');
  const sod = dayStart();
  const newToday = new Set(log.filter((r) => r.ts >= sod && r.wasNew).map((r) => r.card)).size;
  const month = log.filter((r) => r.ts >= Date.now() - 30 * DAY && r.state === 'review');
  const retention = month.length ? Math.round((month.filter((r) => r.pass).length / month.length) * 100) : null;
  let streak = 0; for (let d = days.has(key(Date.now())) ? 0 : 1; days.has(key(Date.now() - d * DAY)); d++) streak++;
  const vault = cards.filter((c) => c.suspended === 'leech').length;
  const goalRet = Math.round(pen.retention * 100);

  const stat = (label, color, have, want, value, unit) => {
    const f = want ? Math.min(1, have / want) : 0;
    return h('div', { class: 'stat', role: 'meter', 'aria-label': label, 'aria-valuenow': String(have), 'aria-valuemin': '0', 'aria-valuemax': String(want) },
      h('span', { class: 'lab' }, label),
      h('span', { class: 'val', style: `color:var(${color})` }, value, ' ', h('small', {}, unit)),
      h('div', { class: 'bar', style: `color:var(${f >= 1 && color === '--accent' ? '--gold' : color})` }, h('div', { style: `width:${f * 100}%` })));
  };
  main.append(h('div', { class: 'stats' },
    stat('Repasos hoy', '--accent', today.cards, goals.reviews, String(today.cards), `/ ${goals.reviews}`),
    stat('Tarjetas nuevas', '--c-green', newToday, pen.newPerDay, String(newToday), `/ ${pen.newPerDay}`),
    stat('Racha actual', '--c-amber', streak, goals.streak, String(streak), `${streak === 1 ? 'día' : 'días'} · meta ${goals.streak}`),
    stat('Retención FSRS', '--c-violet', retention || 0, goalRet, retention === null ? '—' : `${retention}%`, `meta ${goalRet}%`)));

  const left = h('div', { class: 'col' }), right = h('div', { class: 'col' });
  main.append(h('div', { class: 'cols main-side' }, left, right));

  // --- Today's review
  left.append(h('section', { class: 'hero hero-big', style: 'gap:6px' },
    due ? h('span', { class: 'hero-num', 'aria-hidden': 'true' }, String(due)) : '',
    h('span', { class: 'kicker' }, 'PENUMBRA · REPASO DE HOY'),
    h('h2', { style: 'font-size:26px;font-weight:700;margin-top:4px' }, due ? `Tenés ${due} tarjeta${due === 1 ? '' : 's'} pendiente${due === 1 ? '' : 's'}` : 'Estás al día'),
    h('p', { class: 'small' }, due ? `${q.reviews.length} repaso · ${q.fresh.length} nuevas${q.counts.learning ? ` · ${q.counts.learning} aprendiendo` : ''} · ≈ ${mins} min` : 'No queda nada para hoy.',
      q.overdue ? h('span', { style: 'color:var(--gold-text)' }, ` · ${q.overdue} vencidas`) : ''),
    h('div', { class: 'row wrap', style: 'gap:10px;margin-top:12px' },
      h('a', { href: due ? '#/sesion' : '#/repaso', class: 'btn' }, iconEl('play'), due ? 'Empezar repaso' : 'Ver Penumbra'),
      h('a', { href: '#/sesion?modo=practica&set=todo&n=20', class: 'btn ghost' }, 'Práctica libre'),
      vault ? h('a', { href: '#/boveda', class: 'tag warn', style: 'margin-left:auto' }, `🔒 ${vault} en la bóveda`) : '')));

  // --- Card of the day
  if (!hidden.has('cultura')) {
    const n = dayNumber(), card = cardFor(n);
    left.append(h('a', { href: '#/cultura', class: 'card', style: 'text-decoration:none;color:inherit;gap:8px' },
      h('div', { class: 'between' }, h('span', { class: 'tag warn', style: 'font-size:11px;letter-spacing:.06em' }, `TARJETA DEL DÍA · ${card.cat.toUpperCase()}`),
        h('span', { class: 'muted small' }, `Tarjeta ${((n % CARDS.length) + CARDS.length) % CARDS.length + 1} de ${CARDS.length}`)),
      h('b', { style: 'font-family:var(--display);font-size:22px' }, card.title),
      h('span', { class: 'muted', style: 'font-size:14px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden' }, card.text),
      h('span', { style: 'font-weight:700;font-size:13px;color:var(--accent);padding-top:8px;border-top:1px solid var(--line)' }, 'Leer, escuchar y contestar →')));
  }

  // --- Shadowing of the day and chat with Flor, side by side on wide screens
  const clipCount = await db.count('clips');
  const duo = h('div', { class: 'pair' });
  if (!hidden.has('sombra')) duo.append(h('section', { class: 'hero', style: 'gap:8px;justify-content:space-between' },
    h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
      h('span', { class: 'kicker' }, 'SOMBRA DEL DÍA'),
      h('b', { style: 'font-family:var(--display);font-size:20px' }, clipCount ? '10 frases porteñas' : 'Sumá tus primeros clips'),
      h('p', { style: 'font-size:13px;line-height:1.45' }, clipCount ? 'Escuchá, grabá tu voz y comparala con la nativa, onda por onda.' : 'Importá el paquete de audios desde Ajustes para empezar.')),
    h('a', { class: 'btn', href: clipCount ? '#/sombra' : '#/perfil', style: 'margin-top:4px' }, clipCount ? 'Practicar Sombra' : 'Ir a Ajustes', iconEl('next'))));
  if (!hidden.has('charla')) duo.append(h('section', { class: 'card', style: 'gap:8px;justify-content:space-between' },
    h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
      h('span', { class: 'kicker', style: 'color:var(--c-green)' }, 'CHARLÁ CON FLOR'),
      h('b', { style: 'font-family:var(--display);font-size:20px' }, 'Tu compañera porteña'),
      h('p', { class: 'muted', style: 'font-size:13px;line-height:1.45' }, 'Practicá voseo y lunfardo por texto o en voz en vivo.')),
    h('a', { class: 'btn ghost', href: '#/charla', style: 'margin-top:4px' }, 'Iniciar charla', iconEl('next'))));
  if (duo.childElementCount) left.append(duo);

  // --- Warm-up and Vos
  if (!hidden.has('atajos')) {
    const tile = (href, title, sub) => h('a', { href, class: 'card', style: 'text-decoration:none;color:inherit;gap:6px;padding:14px' }, h('b', { style: 'font-family:var(--display);font-size:17px' }, title), h('span', { class: 'muted', style: 'font-size:12px;line-height:1.4' }, sub));
    left.append(h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px' },
      clipCount ? tile('#/calentamiento', 'Calentamiento', '5 frases en voz alta, dos minutos') : tile('#/oido', 'Oído', 'distinguí sonidos parecidos'),
      tile('#/vos', 'Vos en 2 minutos', 'tenés, querés, vení, decime')));
  }

  // --- Progress: totals, streak, activity heatmap (FE-06), sounds mastered
  if (!hidden.has('progreso')) {
    const mastered = phonemeStatus().filter((p) => p.level === 3).length;
    const notes = new Set(cards.map((c) => c.note)).size;
    const takes = events('sombra').filter((e) => e.recorded).length;
    const end = key(Date.now()), weeks = isWide ? 52 : 20;
    const first = end - ((weeks - 1) * 7 + new Date(end).getDay()) * DAY; // a Sunday, so rows are weekdays
    const level = (d) => { if (!d) return 0; const v = d.cards + d.minutes.size; return v === 0 ? 0 : v < 10 ? 1 : v < 25 ? 2 : v < 50 ? 3 : 4; };
    const shade = ['var(--chip)', 'color-mix(in srgb, var(--accent) 38%, var(--chip))', 'color-mix(in srgb, var(--accent) 58%, var(--chip))', 'color-mix(in srgb, var(--accent) 80%, var(--chip))', 'var(--accent)'];
    const detail = h('p', { class: 'small', 'aria-live': 'polite', style: 'min-height:18px;line-height:1.4' }, '');
    const grid = h('div', { class: 'heat', role: 'group', 'aria-label': `Actividad de las últimas ${weeks} semanas`, style: `gap:${isWide ? 2 : 3}px;grid-template-columns:repeat(${weeks},minmax(0,1fr))` });
    const describe = (t) => {
      const d = days.get(t);
      const when = new Date(t).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
      if (!d || (!d.cards && !d.minutes.size)) return `${when}: sin práctica`;
      const parts = [];
      if (d.cards) parts.push(`${d.cards} tarjeta${d.cards === 1 ? '' : 's'} (${Math.round((d.pass / d.cards) * 100)}% bien)`);
      parts.push(`≈ ${d.minutes.size} min de práctica`);
      if (d.kinds.size) parts.push([...d.kinds].join(', '));
      return `${when}: ${parts.join(' · ')}`;
    };
    for (let t = first; t <= end; t += DAY) {
      const lv = level(days.get(t));
      const b = h('button', { type: 'button', 'aria-label': describe(t), title: describe(t), 'aria-pressed': 'false', style: `background:${shade[lv]}${isWide ? ';border-radius:2px' : ''}` });
      b.onclick = () => { grid.querySelectorAll('[aria-pressed="true"]').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); detail.textContent = describe(t); };
      grid.append(b);
    }
    detail.textContent = describe(end);
    // Month names over the first week of each month.
    const months = h('div', { 'aria-hidden': 'true', style: `display:grid;grid-template-columns:repeat(${weeks},minmax(0,1fr));gap:${isWide ? 2 : 3}px;font-size:9px;color:var(--muted);height:12px` });
    let last = -1;
    for (let w = 0; w < weeks; w++) {
      const m = new Date(first + w * 7 * DAY).getMonth();
      const show = m !== last && (w > 0 || new Date(first).getDate() <= 7);
      months.append(h('span', { style: 'white-space:nowrap;overflow:visible' }, show ? new Date(first + w * 7 * DAY).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') : ''));
      last = m;
    }
    const legend = h('div', { class: 'row', style: 'gap:4px;justify-content:space-between', 'aria-hidden': 'true' }, h('span', { class: 'muted', style: 'font-size:11px' }, 'Menos'),
      h('span', { class: 'row', style: 'gap:4px' }, ...shade.map((c) => h('span', { style: `width:10px;height:10px;border-radius:3px;background:${c}` }))), h('span', { class: 'muted', style: 'font-size:11px' }, 'Más'));
    right.append(h('section', { class: 'card', style: 'gap:12px' },
      h('div', { class: 'between' }, h('h2', { style: 'font-size:17px' }, 'Tu progreso'), h('a', { href: '#/progreso', class: 'small', style: 'font-weight:700;text-decoration:none' }, 'Ver detalle')),
      h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
        h('div', { class: 'kv' }, h('span', {}, 'Sonidos porteños'), h('b', {}, `${mastered} / 9 dominados`)),
        h('div', { class: 'kv' }, h('span', {}, 'Tarjetas en Penumbra'), h('b', {}, `${notes} guardadas`)),
        h('div', { class: 'kv' }, h('span', {}, 'Tomas de Sombra'), h('b', {}, `${takes} grabadas`)),
        h('div', { class: 'kv' }, h('span', {}, 'Racha'), h('b', { style: 'display:flex;align-items:center;gap:4px' }, h('span', { style: 'color:var(--gold-text)', html: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.6 2 3 .5-2.5.5-5.5.5-8z"/></svg>' }), `${streak} día${streak === 1 ? '' : 's'}`))),
      h('div', { style: 'border-top:1px solid var(--line);padding-top:12px;display:flex;flex-direction:column;gap:6px' },
        h('div', { class: 'between' }, h('span', { class: 'kicker', style: 'color:var(--muted);font-size:10px' }, `ACTIVIDAD (ÚLTIMAS ${weeks} SEMANAS)`), h('span', { style: 'font-size:10px;color:var(--accent);font-family:ui-monospace,monospace' }, String(new Date().getFullYear()))),
        months, grid, legend, detail)));
  }

  // --- Phrase of the day
  const player = new Player();
  if (!hidden.has('frase')) {
    let text, back = '', blob = null;
    if (clipCount) {
      const clips = await db.all('clips');
      const short = clips.filter((c) => c.text.split(/\s+/).length <= 9);
      const pick = (short.length ? short : clips)[dayIndex(short.length || clips.length)];
      text = pick.text; blob = await db.audioFor(pick.id);
    } else [text, back] = PHRASES[dayIndex(PHRASES.length)];
    player.load(blob);
    const play = h('button', { type: 'button', class: 'pill', style: 'min-height:36px' }, '▶ Escuchar');
    play.onclick = async () => { if (blob) player.play(); else { const { phoneSay } = await import('../voz.js'); phoneSay(text); } };
    const save = h('button', { type: 'button', class: 'pill', style: 'min-height:36px' }, '+ Penumbra');
    save.onclick = async () => { await db.put('mazo', { front: text, ipa: transcribe(text), back, tag: '#FraseDelDía', audio: blob || undefined, created: Date.now() }); toast('Guardado en Penumbra'); };
    right.append(h('section', { class: 'card', style: 'gap:10px' },
      h('span', { class: 'kicker' }, 'FRASE DEL DÍA'),
      h('p', { lang: 'es-AR', style: 'font-family:var(--display);font-size:20px;line-height:1.35;font-weight:600' }, `«${text}»`),
      h('span', { class: 'ipa', style: 'color:var(--accent)' }, transcribe(text)),
      back ? h('span', { class: 'small', style: 'color:var(--muted2)' }, back) : '',
      h('div', { class: 'between' }, play, save)));
  }
  if (!right.childElementCount) right.remove();
  return () => player.load(null);
}
