// Diario de voz: record a short spoken entry, get it transcribed and corrected, track progress.
import { h, iconEl, toast } from '../ui.js';
import { monthCalendar, dayListModal, fmtHour, fmtLong } from '../calendar.js';
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
const calState = { month: null }; // month shown in the calendar; kept while you open an entry and come back

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
    historyBox.replaceChildren(...(all.length ? [h('span', { class: 'kicker', style: 'margin-top:8px' }, 'TUS GRABACIONES'), monthCalendar(all, { state: calState, noun: ['grabación', 'grabaciones'], onDay: (list, btn) => dayListModal(list, btn, { noun: ['grabación', 'grabaciones'], row: (e) => ({
      href: `#/diario?entrada=${encodeURIComponent(e.id)}`, head: `${fmtHour(e.at)} · ${fmtTime(e.seconds)}`, title: e.prompt,
      preview: e.result ? e.result.transcript : 'Sin analizar todavía', meta: e.result ? `${e.result.wpm} palabras/min · ${num(e.result.errorRate)} errores cada 100` : '' }) }) })] : []));
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
    // Prosody: what Gemini heard about rhythm, pauses and melody, plus the numbers measured here.
    const pz = r.prosody && r.prosody.length ? h('section', { class: 'card', style: 'gap:8px' },
      h('span', { class: 'kicker' }, 'PROSODIA Y RITMO'),
      typeof r.pauses === 'number' ? h('div', { class: 'row wrap', style: 'gap:6px' },
        h('span', { class: 'chip' }, `${r.pausesPerMin} pausas/min`), h('span', { class: 'chip' }, `pausa media ${String(r.pauseMean).replace('.', ',')} s`),
        r.artRate ? h('span', { class: 'chip' }, `${r.artRate} palabras/min sin pausas`) : null) : null,
      ...r.prosody.map((p) => h('div', { class: 'row', style: 'gap:8px;align-items:flex-start' },
        h('span', { class: 'chip', style: `flex:none;${p.ok ? 'background:var(--accent);color:var(--accent-ink)' : ''}` }, (p.aspect || 'prosodia').toUpperCase()),
        h('p', { class: 'small', style: 'line-height:1.45' }, p.ok ? '✓ ' : '', p.note)))) : '';
    const sounds = r.sounds.length ? h('section', { class: 'card', style: 'gap:6px' },
      h('span', { class: 'kicker' }, 'PRONUNCIACIÓN'),
      ...r.sounds.map((s) => h('p', { class: 'small' }, s.word ? h('b', {}, s.word + ': ') : '', s.note))) : '';
    result.replaceChildren(entryHead(entry), ...reviewView(r.transcript, r, {
      tag: '#Diario',
      heading: h('span', { class: 'kicker' }, 'LO QUE DIJISTE'),
      extra: [sounds, pz],
    }));
  }

  return { open, runAnalysis };
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
