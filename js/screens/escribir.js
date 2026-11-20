// Escribir: write a short text, get it reviewed through several lenses, see the changes word by word.
import { h, toast } from '../ui.js';
import { practiceTabs } from './sombra.js';
import { promptFor, review } from '../escribir.js';
import { reviewView, diffView, changeCard } from '../reviewview.js';
import { geminiReady } from '../gemini.js';
import { unlockAudio, stopPcm } from '../pcm.js';
import { checkVoseo, applyVoseo } from '../vosfix.js';
import { getSettings } from '../settings.js';
import { log } from '../progress.js';
import { takeHandoff } from './cultura.js';
import { monthCalendar, dayListModal, fmtHour, fmtLong } from '../calendar.js';

const KEY = 'cadencia.escribir';
const load = () => { try { return { draft: '', prompt: null, history: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { draft: '', prompt: null, history: [] }; } };
const save = (patch) => { const v = { ...load(), ...patch }; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ } return v; };
const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const calState = { month: null }; // month shown in the calendar; kept while you open a text and come back
const HISTORY = 300;

export async function render(main) {
  const level = getSettings().level;
  const at = new URLSearchParams(location.hash.split('?')[1] || '').get('texto');
  if (at) return entryPage(main, Number(at));
  main.append(h('div', { class: 'between' }, practiceTabs('escribir')));
  let st = load();
  const handed = takeHandoff();
  if (handed) st = save({ prompt: { text: handed, index: -1, level } });
  else if (!st.prompt || st.prompt.level !== level) st = save({ prompt: { ...promptFor(level), level } });

  // --- Prompt and editor
  const promptText = h('p', { style: 'font-size:17px;line-height:1.4;font-family:var(--display)' }, st.prompt.text);
  const another = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px' }, 'Otra consigna');
  const free = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px' }, 'Tema libre');
  const input = h('textarea', { rows: '7', placeholder: 'Escribí acá, aunque sea con errores…', 'aria-label': 'Tu texto', lang: 'es-AR', spellcheck: 'false',
    style: 'width:100%;border-radius:14px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:12px;font:inherit;font-size:16px;line-height:1.5;resize:vertical' });
  input.value = st.draft;
  const count = h('span', { class: 'muted small' });
  const check = h('button', { type: 'button', class: 'btn' }, geminiReady() ? 'Revisar' : 'Revisar voseo');
  const paintCount = () => { count.textContent = `${words(input.value)} palabras`; };
  paintCount();
  main.append(h('section', { class: 'card', style: 'gap:10px' },
    h('span', { class: 'kicker' }, `CONSIGNA · ${level}`), promptText,
    h('div', { class: 'row wrap', style: 'gap:6px' }, another, free),
    input,
    h('div', { class: 'between' }, count, check)));
  if (!geminiReady()) {
    main.append(h('p', { class: 'muted small', style: 'text-align:center' }, 'Sin clave de Gemini solo reviso el voseo. ', h('a', { href: '#/perfil' }, 'Agregar la clave en Ajustes')));
  }

  const result = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  const historyBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  main.append(result, historyBox);

  another.onclick = () => { st = save({ prompt: { ...promptFor(level, st.prompt.index), level } }); promptText.textContent = st.prompt.text; };
  free.onclick = () => { st = save({ prompt: { text: 'Escribí sobre lo que quieras.', index: -1, level } }); promptText.textContent = st.prompt.text; };
  input.oninput = () => { paintCount(); save({ draft: input.value }); };

  // --- Review
  check.onclick = async () => {
    unlockAudio();
    const text = input.value.trim();
    if (words(text) < 3) { toast('Escribí al menos una frase.'); return; }
    if (!geminiReady()) { showLocal(text); return; }
    check.disabled = true; check.textContent = 'Revisando…';
    result.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted small' }, 'La profe está leyendo tu texto…')));
    try {
      const r = await review(text, level, st.prompt.index >= 0 ? st.prompt.text : '');
      const entry = { text, prompt: st.prompt.text, result: r, at: Date.now() };
      st = save({ history: [entry, ...st.history.filter((e) => e.text !== text)].slice(0, HISTORY) });
      log('escribir', { words: words(text), changes: r.changes.length, kinds: r.changes.map((c) => c.lens) });
      showResult(entry);
      drawHistory();
    } catch (err) {
      result.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'small' }, 'No pude revisar: ' + (err.message || err))));
    }
    check.disabled = false; check.textContent = 'Revisar';
  };

  // Offline: the voseo checker that already lives in the app.
  function showLocal(text) {
    const fixes = checkVoseo(text);
    const fixed = applyVoseo(text, fixes);
    result.replaceChildren(h('section', { class: 'card', style: 'gap:10px' },
      h('span', { class: 'kicker' }, 'VOSEO'),
      fixes.length ? diffView(text, fixed) : h('p', {}, '✓ No encontré formas de tú. ¡Bien!'),
      ...fixes.map((f) => changeCard({ original: f.original, better: f.suggestion, lens: 'voseo', why: f.note }, '#Escribir'))));
  }

  // --- Result
  function showResult(entry) {
    result.replaceChildren(...reviewView(entry.text, entry.result, {
      tag: '#Escribir',
      reuse: (corrected) => { input.value = corrected; save({ draft: input.value }); paintCount(); input.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    }));
  }

  // --- Past texts: a monthly calendar; a day opens its texts, each text has its own page.
  function drawHistory() {
    if (!st.history.length) { historyBox.replaceChildren(); return; }
    const all = [...st.history].sort((a, b) => b.at - a.at);
    const noun = ['texto', 'textos'];
    historyBox.replaceChildren(h('span', { class: 'kicker', style: 'margin-top:8px' }, 'TUS TEXTOS'),
      monthCalendar(all, { state: calState, noun, onDay: (list, btn) => dayListModal(list, btn, { noun, row: (e) => ({
        href: `#/escribir?texto=${e.at}`, head: `${fmtHour(e.at)} · ${words(e.text)} palabras`, title: e.prompt,
        preview: e.text, meta: `${e.result.changes.length} cambio${e.result.changes.length === 1 ? '' : 's'}${e.result.level ? ` · nivel ${e.result.level}` : ''}` }) }) }));
  }
  drawHistory();
  return () => { stopPcm(); };
}

// --- One text on its own page: what you wrote, the corrections by lens, the porteño version, saving.
function entryPage(main, at) {
  const back = h('a', { href: '#/escribir', class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none;flex:none', 'aria-label': 'Volver a Escribir' }, '← Escribir');
  const e = load().history.find((x) => x.at === at);
  if (!e) {
    main.append(h('div', { class: 'row', style: 'gap:12px' }, back, h('h1', { style: 'font-size:24px' }, 'Escribir')),
      h('section', { class: 'card empty' }, h('p', { class: 'muted' }, 'Este texto ya no está guardado.')));
    return () => {};
  }
  main.append(h('div', { class: 'row', style: 'gap:12px;min-width:0;flex-wrap:nowrap;align-items:center' }, back,
    h('div', { style: 'min-width:0;display:flex;flex-direction:column;gap:2px' },
      h('h1', { style: 'font-size:22px;line-height:1.2' }, fmtLong(e.at)),
      h('span', { class: 'muted small' }, `${fmtHour(e.at)} · ${words(e.text)} palabras · ${e.result.changes.length} cambio${e.result.changes.length === 1 ? '' : 's'}`))),
  h('section', { class: 'card', style: 'gap:8px' },
    h('span', { class: 'kicker' }, 'CONSIGNA'), h('p', { style: 'font-family:var(--display);font-size:17px;line-height:1.4' }, e.prompt),
    h('span', { class: 'kicker', style: 'margin-top:6px' }, 'LO QUE ESCRIBISTE'), h('p', { style: 'font-size:16px;line-height:1.55;white-space:pre-wrap', lang: 'es-AR' }, e.text)),
  ...reviewView(e.text, e.result, {
    tag: '#Escribir',
    reuse: (corrected) => { save({ draft: corrected }); location.hash = '#/escribir'; },
  }));
  return () => { stopPcm(); };
}
