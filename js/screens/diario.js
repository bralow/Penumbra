// Diario de voz: record a short spoken entry, get it transcribed and corrected, track progress.
import { h, iconEl, toast, openModal, closeBtn } from '../ui.js';
import { practiceTabs } from './sombra.js';
import { SPEAK_PROMPTS, promptOfDay, analyze } from '../diario.js';
import { reviewView } from '../reviewview.js';
import { geminiReady } from '../gemini.js';
import { Player, Recorder } from '../audio.js';
import { unlockAudio, stopPcm } from '../pcm.js';
import { getSettings } from '../settings.js';
import { db } from '../db.js';
import { log } from '../progress.js';
import { takeHandoff } from './cultura.js';

const MAX = 120; // seconds
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtDate = (t) => new Date(t).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
const num = (x) => String(x).replace('.', ',');
const fmtHour = (t) => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const fmtLong = (t) => { const x = new Date(t).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return x.charAt(0).toUpperCase() + x.slice(1); };
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
let calMonth = null; // { y, m } shown in the calendar; kept while you open an entry and come back

// Small line chart of the last entries.
function spark(values, color) {
  const W = 140, H = 36, n = values.length;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${(n === 1 ? W / 2 : (i / (n - 1)) * (W - 8) + 4).toFixed(1)},${(H - 4 - ((v - lo) / span) * (H - 8)).toFixed(1)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('aria-hidden', 'true'); svg.style.flexShrink = '0';
  svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${pts.split(' ').pop().split(',')[0]}" cy="${pts.split(' ').pop().split(',')[1]}" r="3.5" fill="${color}"/>`;
  return svg;
}

export async function render(main) {
  const level = getSettings().level;
  const entryId = new URLSearchParams(location.hash.split('?')[1] || '').get('entrada');
  if (entryId) return entryPage(main, entryId, level);
  main.append(h('div', { class: 'between' }, practiceTabs('diario')));
  let prompt = takeHandoff() || promptOfDay();

  const promptEl = h('p', { style: 'font-size:17px;line-height:1.4;font-family:var(--display)' }, prompt);
  const another = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px' }, 'Otra consigna');
  const recBtn = h('button', { type: 'button', class: 'round rec', 'aria-label': 'Grabar' }, iconEl('mic'));
  const timeEl = h('span', { style: 'font-weight:700;font-variant-numeric:tabular-nums;color:var(--accent)' }, `0:00 / ${fmtTime(MAX)}`);
  const hint = h('span', { class: 'muted small', style: 'text-align:center' }, 'Tocá para grabar. Hablá tranquilo, hasta 2 minutos.');
  main.append(h('section', { class: 'card', style: 'gap:10px' },
    h('span', { class: 'kicker' }, `DIARIO · ${fmtDate(Date.now()).toUpperCase()}`), promptEl,
    h('div', { class: 'row' }, another),
    h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:8px;padding-top:6px' }, recBtn, timeEl, hint)));
  if (!geminiReady()) main.append(h('p', { class: 'muted small', style: 'text-align:center' }, 'Tus grabaciones se guardan igual. Para que la profe las escuche y corrija hace falta la clave de Gemini. ', h('a', { href: '#/perfil' }, 'Ir a Ajustes')));

  const result = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  const progressBox = h('div');
  const historyBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  main.append(result, progressBox, historyBox);

  let k = SPEAK_PROMPTS.indexOf(prompt);
  another.onclick = () => { k = (k + 1) % SPEAK_PROMPTS.length; prompt = SPEAK_PROMPTS[k]; promptEl.textContent = prompt; };

  // --- Recording
  const recorder = new Recorder(), mine = new Player();
  let tick = 0;
  const stopTick = () => { clearInterval(tick); tick = 0; };
  async function stopRecording() {
    stopTick();
    const seconds = (performance.now() - recorder.startedAt) / 1000;
    const blob = await recorder.stop();
    recBtn.classList.remove('live'); recBtn.replaceChildren(iconEl('mic')); recBtn.setAttribute('aria-label', 'Grabar');
    timeEl.textContent = `0:00 / ${fmtTime(MAX)}`;
    if (!blob || !blob.size || seconds < 2) { hint.textContent = 'Muy corto. Probá de nuevo.'; return; }
    const entry = { id: String(Date.now()), at: Date.now(), blob, seconds, prompt, result: null };
    await db.put('diario', entry);
    hint.textContent = 'Guardado.';
    await refresh();
    open(entry);
    if (geminiReady()) runAnalysis(entry);
  }
  recBtn.onclick = async () => {
    unlockAudio();
    if (recorder.recording) { await stopRecording(); return; }
    mine.pause(); stopPcm();
    try { await recorder.start(); } catch { toast('Necesito permiso para usar el micrófono'); return; }
    recBtn.classList.add('live'); recBtn.replaceChildren(iconEl('stop')); recBtn.setAttribute('aria-label', 'Terminar');
    hint.textContent = 'Grabando… tocá para terminar.';
    tick = setInterval(() => {
      const s = (performance.now() - recorder.startedAt) / 1000;
      timeEl.textContent = `${fmtTime(s)} / ${fmtTime(MAX)}`;
      if (s >= MAX) stopRecording();
    }, 250);
  };

  const { open, runAnalysis } = entryKit({ result, mine, level, refresh: () => refresh() });

  // --- Progress and past entries
  async function refresh() {
    const all = (await db.all('diario')).sort((a, b) => b.at - a.at);
    const done = all.filter((e) => e.result && e.result.words).slice(0, 14).reverse();
    progressBox.replaceChildren(done.length >= 2 ? h('section', { class: 'card', style: 'gap:10px' },
      h('span', { class: 'kicker' }, `TU PROGRESO · ÚLTIMAS ${done.length}`),
      h('div', { class: 'between', style: 'align-items:center;flex-wrap:nowrap' },
        h('div', { style: 'flex:1;min-width:0' }, h('b', {}, `${done[done.length - 1].result.wpm} palabras/min`), h('div', { class: 'muted small' }, `empezaste en ${done[0].result.wpm}`)),
        spark(done.map((e) => e.result.wpm), 'var(--accent)')),
      h('div', { class: 'between', style: 'align-items:center;flex-wrap:nowrap' },
        h('div', { style: 'flex:1;min-width:0' }, h('b', {}, `${num(done[done.length - 1].result.errorRate)} errores cada 100`), h('div', { class: 'muted small' }, `empezaste en ${num(done[0].result.errorRate)} · más bajo es mejor`)),
        spark(done.map((e) => e.result.errorRate), 'var(--native)'))) : '');
    historyBox.replaceChildren(...(all.length ? [h('span', { class: 'kicker', style: 'margin-top:8px' }, 'TUS GRABACIONES'), calendar(all)] : []));
  }
  await refresh();

  return () => { stopTick(); if (recorder.recording) recorder.stop(); mine.load(null); stopPcm(); };
}

// The pieces that show one entry (player, numbers, the teacher's review), shared by the Diario
// screen (right after recording) and the entry's own page.
function entryKit({ result, mine, level, refresh, onDelete }) {
  async function runAnalysis(entry) {
    result.replaceChildren(entryHead(entry), h('section', { class: 'card' }, h('p', { class: 'muted small' }, 'La profe está escuchando tu grabación…')));
    try {
      const r = await analyze(entry.blob, level, entry.prompt);
      if (!r.transcript) { toast('No se entendió la grabación. Probá hablar más cerca del teléfono.'); result.replaceChildren(entryHead(entry)); return; }
      entry.result = r;
      await db.put('diario', entry);
      log('diario', { wpm: r.wpm, errorRate: r.errorRate, words: r.words, kinds: r.changes.map((c) => c.lens) });
      open(entry);
      refresh();
    } catch (err) {
      result.replaceChildren(entryHead(entry), h('section', { class: 'card' }, h('p', { class: 'small' }, 'No pude analizarla: ' + (err.message || err))));
    }
  }

  function entryHead(entry) {
    const play = h('button', { type: 'button', class: 'round user', 'aria-label': 'Escuchar mi grabación' }, iconEl('play'));
    play.onclick = () => {
      stopPcm();
      if (mine.playing) { mine.pause(); return; }
      if (mine.entry !== entry.id) { mine.load(entry.blob); mine.entry = entry.id; }
      mine.play();
    };
    mine.el.onplay = () => { play.replaceChildren(iconEl('stop')); };
    mine.el.onpause = mine.el.onended = () => { play.replaceChildren(iconEl('play')); };
    const analyzeBtn = !entry.result && geminiReady() ? h('button', { type: 'button', class: 'btn' }, 'Analizar') : '';
    if (analyzeBtn) analyzeBtn.onclick = () => runAnalysis(entry);
    const del = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px' }, 'Borrar');
    del.onclick = async () => {
      if (!window.confirm('¿Borrar esta grabación?')) return;
      mine.pause(); await db.remove('diario', entry.id); result.replaceChildren(); if (onDelete) onDelete(); else refresh();
    };
    const r = entry.result;
    return h('section', { class: 'card', style: 'gap:10px' },
      h('div', { class: 'between' }, h('span', { class: 'kicker' }, fmtDate(entry.at).toUpperCase()), del),
      h('p', { class: 'muted small' }, entry.prompt),
      h('div', { class: 'row', style: 'gap:12px;align-items:center' }, play,
        h('div', { style: 'display:flex;flex-direction:column;gap:2px' },
          h('b', {}, 'Mi grabación'), h('span', { class: 'muted small' }, fmtTime(entry.seconds)))),
      r ? h('div', { class: 'row wrap', style: 'gap:18px' },
        metric(r.wpm, 'palabras/min'), metric(num(r.errorRate), 'errores cada 100'), metric(r.words, 'palabras')) : '',
      analyzeBtn);
  }
  const metric = (v, label) => h('div', { style: 'display:flex;flex-direction:column' },
    h('span', { style: 'font-family:var(--display);font-size:24px;font-weight:700' }, String(v)), h('span', { class: 'muted small' }, label));

  function open(entry) {
    const r = entry.result;
    if (!r) { result.replaceChildren(entryHead(entry)); return; }
    const sounds = r.sounds.length ? h('section', { class: 'card', style: 'gap:6px' },
      h('span', { class: 'kicker' }, 'PRONUNCIACIÓN'),
      ...r.sounds.map((s) => h('p', { class: 'small' }, s.word ? h('b', {}, s.word + ': ') : '', s.note))) : '';
    result.replaceChildren(entryHead(entry), ...reviewView(r.transcript, r, {
      tag: '#Diario',
      heading: h('span', { class: 'kicker' }, 'LO QUE DIJISTE'),
      extra: [sounds],
    }));
  }

  return { open, runAnalysis };
}

// --- Monthly calendar of recordings: days with entries in the accent colour; tap one to see that day's entries.
function calendar(all) {
  const byDay = new Map();
  for (const e of all) { const k = dayKey(e.at); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); }
  const now = new Date();
  const monthOf = (t) => { const d = new Date(t); return d.getFullYear() * 12 + d.getMonth(); };
  const withEntries = new Set(all.map((e) => monthOf(e.at)));
  const thisMonth = monthOf(now);
  // Months you can go to: this month and every past month with entries.
  const months = [...new Set([...withEntries, thisMonth])].filter((i) => i <= thisMonth).sort((a, b) => a - b);
  if (!calMonth || !months.includes(calMonth.y * 12 + calMonth.m)) { const i = monthOf(all[0].at) <= thisMonth ? monthOf(all[0].at) : thisMonth; calMonth = { y: Math.floor(i / 12), m: i % 12 }; }
  const box = h('section', { class: 'card cal', style: 'gap:10px' });
  const draw = () => {
    const { y, m } = calMonth, idx = y * 12 + m, pos = months.indexOf(idx);
    const inMonth = all.filter((e) => monthOf(e.at) === idx);
    const nDays = new Set(inMonth.map((e) => dayKey(e.at))).size;
    const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mes anterior con grabaciones', disabled: pos <= 0 }, iconEl('prev'));
    const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Mes siguiente', disabled: pos >= months.length - 1 }, iconEl('next'));
    const go = (i) => { if (i < 0 || i >= months.length) return; calMonth = { y: Math.floor(months[i] / 12), m: months[i] % 12 }; draw(); };
    prev.onclick = () => go(pos - 1); next.onclick = () => go(pos + 1);
    const grid = h('div', { class: 'cal-grid', role: 'group', 'aria-label': `Grabaciones de ${MONTHS[m]} de ${y}` },
      ...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => h('span', { class: 'cal-wd', 'aria-hidden': 'true' }, d)));
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // weeks start on Monday
    for (let i = 0; i < lead; i++) grid.append(h('span'));
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const list = byDay.get(`${y}-${m}-${d}`);
      const today = idx === thisMonth && d === now.getDate();
      if (!list) { grid.append(h('span', { class: `cal-day${today ? ' today' : ''}` }, String(d))); continue; }
      const b = h('button', { type: 'button', class: `cal-day on${today ? ' today' : ''}`, 'aria-haspopup': 'dialog', 'aria-label': `${d} de ${MONTHS[m]}: ${list.length} ${list.length > 1 ? 'grabaciones' : 'grabación'}` },
        String(d), list.length > 1 ? h('span', { class: 'cal-n', 'aria-hidden': 'true' }, String(list.length)) : null);
      b.onclick = () => dayModal(list, b);
      grid.append(b);
    }
    box.replaceChildren(
      h('div', { class: 'between', style: 'flex-wrap:nowrap' }, prev,
        h('div', { style: 'text-align:center;display:flex;flex-direction:column;gap:2px', 'aria-live': 'polite' },
          h('b', { style: 'font-family:var(--display);font-size:18px;text-transform:capitalize' }, `${MONTHS[m]} ${y}`),
          h('span', { class: 'muted small' }, inMonth.length ? `${inMonth.length} ${inMonth.length > 1 ? 'grabaciones' : 'grabación'} en ${nDays} día${nDays > 1 ? 's' : ''}` : 'Sin grabaciones este mes')),
        next),
      grid,
      h('p', { class: 'muted small', style: 'text-align:center' }, 'Tocá un día marcado para ver sus grabaciones.'));
  };
  draw();
  return box;
}

// The entries of one day, in a floating panel; each opens on its own page.
function dayModal(list, from) {
  const sorted = [...list].sort((a, b) => a.at - b.at);
  openModal((api) => {
    api.box.setAttribute('aria-label', `Grabaciones del ${fmtLong(sorted[0].at)}`);
    api.box.append(
      h('div', { class: 'row', style: 'gap:10px;align-items:center' },
        h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px' },
          h('span', { class: 'kicker' }, `${sorted.length} ${sorted.length > 1 ? 'GRABACIONES' : 'GRABACIÓN'}`),
          h('h2', { style: 'font-size:20px' }, fmtLong(sorted[0].at))),
        closeBtn(api.close)),
      ...sorted.map((e) => {
        const a = h('a', { href: `#/diario?entrada=${encodeURIComponent(e.id)}`, class: 'card', style: 'text-decoration:none;color:inherit;gap:4px;padding:12px 14px;background:var(--bg)' },
          h('div', { class: 'between', style: 'flex-wrap:nowrap' }, h('b', {}, `${fmtHour(e.at)} · ${fmtTime(e.seconds)}`), h('span', { style: 'color:var(--accent);font-weight:700;font-size:13px' }, 'Ver →')),
          h('span', { class: 'small', style: 'font-family:var(--display);font-weight:600;line-height:1.35' }, e.prompt),
          h('span', { class: 'muted small', style: 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4' }, e.result ? e.result.transcript : 'Sin analizar todavía'),
          e.result ? h('span', { class: 'muted', style: 'font-size:12px' }, `${e.result.wpm} palabras/min · ${num(e.result.errorRate)} errores cada 100`) : null);
        a.onclick = () => api.close();
        return a;
      }));
  }, from);
}

// --- One entry on its own page: everything the Diario shows for it, and a way back to the calendar.
async function entryPage(main, id, level) {
  const back = h('a', { href: '#/diario', class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none;flex:none', 'aria-label': 'Volver al Diario' }, '← Diario');
  const entry = await db.get('diario', id);
  if (!entry) {
    main.append(h('div', { class: 'row', style: 'gap:12px' }, back, h('h1', { style: 'font-size:24px' }, 'Diario')),
      h('section', { class: 'card empty' }, h('p', { class: 'muted' }, 'Esta grabación ya no está: se borró o todavía no llegó desde el otro dispositivo.')));
    return () => {};
  }
  main.append(h('div', { class: 'row', style: 'gap:12px;min-width:0;flex-wrap:nowrap;align-items:center' }, back,
    h('div', { style: 'min-width:0;display:flex;flex-direction:column;gap:2px' },
      h('h1', { style: 'font-size:22px;line-height:1.2' }, fmtLong(entry.at)),
      h('span', { class: 'muted small' }, `${fmtHour(entry.at)} · ${fmtTime(entry.seconds)}`))));
  const result = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  main.append(result);
  const mine = new Player();
  const kit = entryKit({ result, mine, level, refresh: () => {}, onDelete: () => { location.hash = '#/diario'; } });
  kit.open(entry);
  return () => { mine.load(null); stopPcm(); };
}
