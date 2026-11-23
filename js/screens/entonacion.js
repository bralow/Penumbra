// Entonación: sentence tunes beyond word stress. Listen and tell the clause type apart (real OpenSLR clips
// when there are some, otherwise the Argentine voice), then say the sentence yourself and compare melodies.
import { h, iconEl, toast, shuffle, backHead } from '../ui.js';
import { db } from '../db.js';
import { ipaFor } from '../ipa.js';
import { Player, Recorder, decode } from '../audio.js';
import { pitchTrack } from '../pitch.js';
import { log } from '../progress.js';
import { phoneSay, stopPhone } from '../voz.js';
import { geminiReady } from '../gemini.js';
import { breathGroups, clauseType } from '../prosody.js';
import { drawContours, contourShape } from '../acoustic.js';
import { TUNES, itemOf, TYPE_NAMES } from '../entonaciondata.js';

let mode = 'practicar', tuneId = 'sino', idx = 0;
const ROUND = 10;
const STYLE = 'Decilo con acento rioplatense de Buenos Aires, natural, como en una charla';

// --- The tune drawn over the syllables (a teaching sketch, not a measurement)
function sketch(text, shape, focus) {
  const groups = breathGroups(text);
  const syl = []; // { s, stressed, word }
  let wi = 0;
  groups.forEach((g) => g.words.forEach((w) => { w.syls.forEach((s, k) => syl.push({ s, stressed: w.beat && k === w.stress, word: wi })); wi++; }));
  const n = syl.length;
  if (!n) return h('span');
  const lastStress = syl.map((x) => x.stressed).lastIndexOf(true);
  const commaWord = (() => { let c = 0, at = -1; groups.forEach((g, gi) => { if (gi < groups.length - 1) at = c + g.words.length; c += g.words.length; }); return at; })();
  const lv = syl.map((x, i) => {
    let v = 0.55 - (i / n) * 0.15 + (x.stressed ? 0.12 : 0);
    if (shape === 'fall') { if (i === 0 || x.word === 0) v = 0.85; if (i > lastStress && lastStress >= 0) v = 0.18; else if (i === lastStress) v = 0.4; }
    if (shape === 'rise') {
      const tagStart = commaWord > 0 ? syl.findIndex((y) => y.word >= commaWord) : -1;
      if (tagStart > 0) { if (i < tagStart) v = i >= tagStart - 2 ? 0.25 : v; else v = 0.45 + ((i - tagStart + 1) / (n - tagStart)) * 0.5; }
      else if (i >= lastStress && lastStress >= 0) v = i === n - 1 ? 0.95 : i === lastStress ? (lastStress === n - 1 ? 0.95 : 0.32) : 0.7;
    }
    if (shape === 'focus') { if (x.word === focus) v = x.stressed ? 0.95 : 0.6; else if (x.word > focus) v = 0.22 - (i / n) * 0.06; }
    if (shape === 'decl' && i >= lastStress) v = i === lastStress ? 0.45 : 0.15;
    return Math.max(0.05, Math.min(0.98, v));
  });
  const W = Math.max(280, n * 34), H = 96, x = (i) => 17 + i * ((W - 34) / Math.max(1, n - 1)), y = (v) => 10 + (1 - v) * 54;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', '100%'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Melodía: ${shape === 'rise' ? 'sube al final' : shape === 'fall' ? 'baja al final' : shape === 'focus' ? 'pico en la palabra destacada' : 'baja al final'}`);
  svg.style.maxHeight = '120px';
  svg.innerHTML = `<polyline points="${lv.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    lv.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${syl[i].stressed ? 5.5 : 3.5}" fill="${syl[i].stressed ? 'var(--accent)' : 'var(--surface)'}" stroke="var(--accent)" stroke-width="2"/>`).join('') +
    syl.map((s, i) => `<text x="${x(i)}" y="${H - 8}" stroke="none" text-anchor="middle" font-size="12" font-family="Inter, sans-serif" font-weight="${s.stressed ? 700 : 400}" fill="${shape === 'focus' && s.word === focus ? 'var(--accent)' : 'var(--ink)'}">${s.s.replace(/[<&]/g, '')}</text>`).join('');
  return h('div', { style: 'overflow-x:auto' }, svg);
}

const words = (t) => t.split(/\s+/);
function focusText(text, focus) {
  return h('span', {}, ...words(text).flatMap((w, i) => [i ? ' ' : '', i === focus ? h('b', { style: 'color:var(--accent);text-decoration:underline;text-underline-offset:5px' }, w.toUpperCase()) : w]));
}
// Where the focused word sits in the sentence (0..1), by letters.
function focusPos(text, focus) {
  const ws = words(text), len = (s) => s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').length;
  const total = ws.reduce((a, w) => a + len(w), 0) || 1;
  const before = ws.slice(0, focus).reduce((a, w) => a + len(w), 0);
  return (before + len(ws[focus]) / 2) / total;
}

export async function render(main) {
  main.append(h('div', { class: 'between' }, backHead('Entonación')));
  main.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'La melodía de la frase dice si preguntás, pedís, confirmás o corregís. Escuchá cómo suben y bajan las voces porteñas y después probá vos.'));
  const modeBtns = [['practicar', 'Practicar'], ['escuchar', 'Escuchar y elegir']].map(([k, l]) => h('button', { type: 'button', class: 'pill', style: 'min-height:40px;border:none', 'aria-pressed': String(mode === k) }, l));
  modeBtns.forEach((b, i) => { b.onclick = () => { mode = i ? 'escuchar' : 'practicar'; window.dispatchEvent(new Event('cadencia:rerender')); }; });
  main.append(h('div', { class: 'seg', role: 'group', 'aria-label': 'Modo' }, modeBtns));
  const clips = await db.all('clips');
  return mode === 'escuchar' ? quiz(main, clips) : practice(main);
}

// --- Practicar: one sentence at a time, model and your take, melodies compared.
function practice(main) {
  const tabs = TUNES.map((t) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(t.id === tuneId), style: 'min-height:38px;font-size:13px' }, t.label));
  tabs.forEach((b, i) => { b.onclick = () => { tuneId = TUNES[i].id; idx = 0; window.dispatchEvent(new Event('cadencia:rerender')); }; });
  main.append(h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Tipo de frase', style: 'gap:6px' }, tabs));
  const tune = TUNES.find((t) => t.id === tuneId);
  const item = itemOf(tune.items[idx % tune.items.length]);
  const counter = h('span', { class: 'muted small', style: 'font-weight:600' }, `${(idx % tune.items.length) + 1} / ${tune.items.length}`);
  const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Anterior' }, iconEl('prev'));
  const next = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Siguiente' }, iconEl('next'));
  prev.onclick = () => { idx = (idx - 1 + tune.items.length) % tune.items.length; window.dispatchEvent(new Event('cadencia:rerender')); };
  next.onclick = () => { idx++; window.dispatchEvent(new Event('cadencia:rerender')); };
  main.append(h('section', { class: 'card', style: 'gap:10px' },
    h('div', { class: 'between' }, h('span', { class: 'kicker' }, tune.title.toUpperCase()), h('div', { class: 'row', style: 'gap:0' }, prev, counter, next)),
    h('p', { class: 'sentence', lang: 'es-AR' }, item.focus !== undefined ? focusText(item.text, item.focus) : item.text),
    item.note ? h('p', { class: 'small', style: 'color:var(--gold-text)' }, `(${item.note})`) : null,
    h('p', { class: 'ipa' }, ipaFor(item.text)),
    sketch(item.text, tune.shape, item.focus),
    h('p', { class: 'muted small', style: 'line-height:1.45' }, tune.how)));

  const model = new Player(), mine = new Player(), rec = new Recorder();
  let modelBlob = null, autoStop = 0;
  const modelBtn = h('button', { type: 'button', class: 'round native', 'aria-label': 'Escuchar el modelo' }, iconEl('play'));
  const recBtn = h('button', { type: 'button', class: 'round rec', 'aria-label': 'Grabarme' }, iconEl('mic'));
  const recLabel = h('span', { style: 'font-weight:700;color:var(--accent)' }, 'Grabar');
  const mineBtn = h('button', { type: 'button', class: 'round user', 'aria-label': 'Escuchar mi voz', disabled: true }, iconEl('play'));
  const save = h('button', { type: 'button', class: 'pill' }, '+ Penumbra');
  main.append(h('div', { class: 'controls' },
    h('div', { class: 'control' }, modelBtn, h('span', {}, geminiReady() ? 'Modelo (Flor)' : 'Modelo')),
    h('div', { class: 'control' }, recBtn, recLabel),
    h('div', { class: 'control' }, mineBtn, h('span', {}, 'Mi voz'))),
  h('div', { class: 'row', style: 'justify-content:center' }, save));
  const canvas = h('canvas', { style: 'width:100%;height:120px;display:block', role: 'img', 'aria-label': 'Melodía del modelo y la tuya' });
  const verdict = h('div', { class: 'small', 'aria-live': 'polite', style: 'line-height:1.45;display:flex;flex-direction:column;gap:4px' });
  const result = h('section', { class: 'card', hidden: true, style: 'gap:8px' },
    h('span', { class: 'kicker' }, 'TU MELODÍA'),
    h('div', { class: 'legend' }, h('span', {}, h('i', { style: 'background:var(--native)' }), 'Modelo'), h('span', {}, h('i', { style: 'background:var(--user)' }), 'Vos')),
    canvas, verdict);
  main.append(result);
  if (!geminiReady()) main.append(h('p', { class: 'muted small' }, 'Con la clave de Gemini el modelo lo dice Flor y podés ver su melodía al lado de la tuya. Sin clave, lo lee la voz del teléfono.'));

  // The model: Flor (Gemini), saved after the first time; otherwise the phone's voice.
  const style = item.focus !== undefined ? `${STYLE}. Enfatizá con fuerza la palabra «${words(item.text)[item.focus].replace(/[^\p{L}]/gu, '')}», como corrigiendo a alguien` : STYLE;
  modelBtn.onclick = async () => {
    mine.pause();
    if (!geminiReady()) { phoneSay(item.text); return; }
    try {
      if (!modelBlob) { modelBtn.disabled = true; modelBlob = await import('../florvoz.js').then((m) => m.florClip(item.text, style)); model.load(modelBlob); }
      model.play();
    } catch (e) { toast(`Sin voz de Flor: ${e.message || e}. Uso la del teléfono.`); phoneSay(item.text); }
    modelBtn.disabled = false;
  };
  mineBtn.onclick = () => { model.pause(); mine.play(); };
  save.onclick = async () => {
    await db.put('mazo', { front: item.text, ipa: ipaFor(item.text), back: `${tune.title}${item.note ? ` (${item.note})` : ''}: ${tune.shape === 'rise' ? 'la voz sube al final ↗' : tune.shape === 'fall' ? 'la voz baja al final ↘' : 'pico en la palabra destacada'}`, tag: '#Entonación', audio: modelBlob || undefined, created: Date.now() });
    toast('Guardada en Penumbra');
  };

  async function stop() {
    clearTimeout(autoStop);
    const blob = await rec.stop();
    recBtn.classList.remove('live'); recBtn.replaceChildren(iconEl('mic')); recLabel.textContent = 'Grabar';
    if (!blob || !blob.size) return;
    mine.load(blob); mineBtn.disabled = false;
    try {
      const mt = pitchTrack(await decode(blob), { lenient: true });
      const nt = modelBlob ? pitchTrack(await decode(modelBlob)) : null;
      result.hidden = false;
      const css = getComputedStyle(canvas);
      drawContours(canvas, [nt && { track: nt, color: css.getPropertyValue('--native') }, { track: mt, color: css.getPropertyValue('--user') }]);
      const sh = contourShape(mt);
      let ok = false, msg = '';
      if (!sh) msg = 'No escuché bien la melodía. Grabá de nuevo, un poco más fuerte.';
      else if (tune.shape === 'rise') { ok = sh.rise > 1.2; msg = ok ? `¡Bien! Subiste al final (+${sh.rise.toFixed(1).replace('.', ',')} semitonos).` : 'Terminaste bajando o plano. En esta frase la voz tiene que subir en la última sílaba acentuada.'; }
      else if (tune.shape === 'fall') { ok = sh.rise < -0.5; msg = ok ? '¡Bien! Bajaste al final, como corresponde.' : 'Subiste al final: así suena a repregunta o sorpresa. Dejá caer la voz después de la palabra interrogativa.'; }
      else { const target = focusPos(item.text, item.focus); ok = Math.abs(sh.peakAt - target) < 0.22; msg = ok ? `¡Bien! Tu pico más alto cae en «${words(item.text)[item.focus]}».` : `Tu pico más alto quedó en otra parte de la frase. Subí y estirá «${words(item.text)[item.focus]}» y aplaná lo que sigue.`; }
      verdict.replaceChildren(h('b', { style: `color:${ok ? 'var(--accent)' : 'var(--gold-text)'}` }, ok ? '✓ Melodía correcta' : 'Todavía no'), h('span', {}, msg),
        h('span', { class: 'muted', style: 'font-size:12px' }, 'Cada línea se mide desde el tono medio de cada voz, así se comparan aunque sean voces distintas.'));
      log('entonacion', { mode: 'prod', tune: tune.id, ok });
    } catch { toast('No pude leer la grabación'); }
  }
  recBtn.onclick = async () => {
    if (rec.recording) { await stop(); return; }
    model.pause(); mine.pause(); stopPhone();
    try { await rec.start(); } catch { toast('Necesito permiso para usar el micrófono'); return; }
    recBtn.classList.add('live'); recBtn.replaceChildren(iconEl('stop')); recLabel.textContent = 'Detener';
    autoStop = setTimeout(() => { if (rec.recording) stop(); }, 8000);
  };
  return () => { clearTimeout(autoStop); if (rec.recording) rec.stop(); model.load(null); mine.load(null); stopPhone(); };
}

// --- Escuchar y elegir: 10 sentences, text hidden; which kind of sentence was it?
function quiz(main, clips) {
  // Real clips first, sorted by type from their punctuation; the built-in sentences fill the gaps.
  const pool = new Map(Object.keys(TYPE_NAMES).map((k) => [k, []]));
  for (const c of clips) pool.get(clauseType(c.text)).push({ text: c.text, clip: c.id });
  for (const t of TUNES) if (t.id !== 'foco') for (const it of t.items) { const x = itemOf(it); const k = t.id === 'pedido' ? 'sino' : t.id; pool.get(k).push({ text: x.text, builtin: true }); }
  const kinds = [...pool.keys()].filter((k) => pool.get(k).length);
  const round = [];
  for (let i = 0; i < ROUND; i++) { const k = kinds[i % kinds.length]; const list = pool.get(k); const pick = list.splice(Math.floor(Math.random() * list.length), 1)[0]; if (pick) round.push({ ...pick, kind: k }); }
  shuffle(round);
  let qi = 0, score = 0;
  const player = new Player();
  const counter = h('span', { class: 'muted small', style: 'font-weight:600' });
  const play = h('button', { type: 'button', class: 'round native', style: 'width:72px;height:72px;align-self:center', 'aria-label': 'Escuchar la frase' }, iconEl('play'));
  const opts = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px' });
  const fb = h('div', { 'aria-live': 'polite', style: 'display:flex;flex-direction:column;gap:8px' });
  const card = h('section', { class: 'card', style: 'gap:12px;padding:20px' }, h('div', { class: 'between' }, h('span', { class: 'kicker' }, '¿QUÉ TIPO DE FRASE ES?'), counter), play, opts, fb);
  main.append(card, h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Las frases de tus clips de OpenSLR suenan con voces reales; si faltan de algún tipo, las lee la voz argentina. La frase aparece después de contestar.'));
  const say = async (q) => {
    if (q.clip) { player.load(await db.audioFor(q.clip)); player.play(); return; }
    if (geminiReady()) { try { const { florClip } = await import('../florvoz.js'); player.load(await florClip(q.text, STYLE)); player.play(); return; } catch { /* phone */ } }
    phoneSay(q.text);
  };
  function show() {
    const q = round[qi];
    counter.textContent = `${qi + 1} / ${round.length}`;
    fb.replaceChildren();
    opts.replaceChildren(...kinds.map((k) => {
      const b = h('button', { type: 'button', class: 'pill', style: 'min-height:52px;border-radius:14px;font-size:14px' }, TYPE_NAMES[k]);
      b.onclick = () => answer(k, b);
      return b;
    }));
    play.onclick = () => say(q);
    say(q);
  }
  function answer(k, btn) {
    const q = round[qi], ok = k === q.kind;
    if (ok) score++;
    log('entonacion', { mode: 'quiz', kind: q.kind, correct: ok });
    opts.querySelectorAll('button').forEach((b) => { b.disabled = true; if (b.textContent === TYPE_NAMES[q.kind]) { b.style.background = 'var(--sel)'; b.style.color = 'var(--sel-ink)'; b.style.opacity = '1'; } else if (b === btn) b.style.textDecoration = 'line-through'; });
    const shape = q.kind === 'qu' || q.kind === 'decl' || q.kind === 'excl' ? 'fall' : 'rise';
    const save = h('button', { type: 'button', class: 'pill' }, '+ Penumbra');
    save.onclick = async () => { await db.put('mazo', { front: q.text, ipa: ipaFor(q.text), back: `${TYPE_NAMES[q.kind]}`, tag: '#Entonación', audio: q.clip ? (await db.audioFor(q.clip)) || undefined : undefined, created: Date.now() }); toast('Guardada en Penumbra'); };
    const next = h('button', { type: 'button', class: 'btn' }, qi < round.length - 1 ? 'Siguiente' : 'Ver resultado');
    next.onclick = () => { if (qi < round.length - 1) { qi++; show(); } else finish(); };
    fb.replaceChildren(h('b', { style: `color:${ok ? 'var(--accent)' : 'var(--gold-text)'}` }, ok ? '¡Bien escuchado!' : `Era: ${TYPE_NAMES[q.kind]}`),
      h('p', { style: 'font-family:var(--display);font-size:19px;font-weight:600', lang: 'es-AR' }, q.text), sketch(q.text, shape),
      h('div', { class: 'row wrap', style: 'gap:6px' }, h('button', { type: 'button', class: 'pill', onclick: () => say(q) }, 'Escuchar otra vez'), save), next);
  }
  function finish() {
    card.replaceChildren(h('span', { class: 'kicker' }, 'RONDA TERMINADA'), h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, `${score} de ${round.length}`),
      h('button', { type: 'button', class: 'btn', onclick: () => window.dispatchEvent(new Event('cadencia:rerender')) }, 'Otra ronda'));
  }
  if (round.length) show(); else card.replaceChildren(h('p', { class: 'muted' }, 'No hay frases para esta ronda.'));
  return () => { player.load(null); stopPhone(); };
}
