import { h, toast, shuffle, pageHead, wide, openModal, closeBtn } from '../ui.js';
import { SOUNDS, CONFUSABLE, WORDS, MEDIA, NARROW_LABEL, DETAIL, DIPHTHONGS } from '../ipadata.js';
import { transcribe, narrow } from '../ipa.js';
import { log, discover, TRACKED } from '../progress.js';
import { mouthSVG, describe } from '../boca.js';
import { steps } from '../transform.js';
import { phoneSay, stopPhone } from '../voz.js';

let mode = 'simbolos';
window.addEventListener('penumbra:modalclose', () => stopPhone());
const soundIds = (w) => { const ipa = transcribe(w); return TRACKED.filter((s) => s.match(ipa)).map((s) => s.id); };
const MODES = [['simbolos', 'Símbolos'], ['transformar', 'Transformar'], ['descifrar', 'Descifrar'], ['escribir', 'Escribir']];

// IPA string -> list of sound tokens (tʃ is one token), without brackets, stress or dots.
function tokens(ipa) {
  const s = ipa.replace(/[[\]ˈ.‖|]/g, '').replace(/\s+/g, ' ').trim();
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ' ') continue;
    if (s[i] === 't' && s[i + 1] === 'ʃ') { out.push('tʃ'); i++; } else out.push(s[i]);
  }
  return out;
}

// "IPA detallada": narrow Rioplatense transcription with diacritics. Off by default; remembered.
const DET = 'cadencia.ipa.detallada';
const detailed = () => { try { return localStorage.getItem(DET) === '1'; } catch { return false; } };
const setDetailed = (on) => { try { localStorage.setItem(DET, on ? '1' : '0'); } catch { /* ignore */ } };
const ipaOf = (word, det = detailed()) => (det ? narrow(transcribe(word)) : transcribe(word));
const COMB = '[̀-ͯ]*';
const symRe = (sym) => new RegExp(`(${[...sym].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(COMB)}${COMB})`, 'g');

// A word with its transcription; the sound in question is underlined inside the IPA. Tap to hear it.
function highlight(word, symbol, ipa = ipaOf(word)) {
  const nodes = ipa.split(symRe(symbol)).map((part, i) => (i % 2 ? h('b', { style: 'color:var(--accent);text-decoration:underline;text-underline-offset:3px' }, part) : part));
  const row = h('button', { type: 'button', class: 'between', title: 'Tocá para escucharla', style: 'all:unset;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;padding:8px 2px;border-bottom:1px solid var(--line);cursor:pointer' },
    h('span', { style: 'font-family:var(--display);font-size:17px;font-weight:600', lang: 'es-AR' }, '▶ ', word),
    h('span', { class: 'ipa', style: 'text-align:right' }, ...nodes));
  row.onclick = () => phoneSay(word);
  return row;
}

function detailSwitch(onChange) {
  const sw = h('button', { type: 'button', role: 'switch', 'aria-checked': String(detailed()), class: 'switch' }, h('span', { class: 'knob' }));
  sw.onclick = () => { const on = !detailed(); setDetailed(on); sw.setAttribute('aria-checked', String(on)); onChange(on); };
  return h('label', { class: 'row', style: 'gap:8px;cursor:pointer;font-size:13px;font-weight:600' }, sw, 'IPA detallada');
}

// The sound's video (Seeing Speech), loaded as a file so it also works offline once seen.
function soundVideo(slug, api) {
  const video = h('video', { controls: true, playsinline: true, preload: 'none', poster: `media/ipa/${slug}.jpg`, 'aria-label': 'Video de la articulación', style: 'width:100%;max-height:340px;aspect-ratio:1;object-fit:contain;background:#000;border-radius:14px' });
  let blobUrl = null;
  fetch(`media/ipa/${slug}.mp4`).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then((b) => { blobUrl = URL.createObjectURL(b); video.src = blobUrl; })
    .catch(() => { video.replaceWith(h('p', { class: 'muted small' }, 'No pude cargar el video (sin conexión la primera vez).')); });
  const slow = h('button', { type: 'button', class: 'pill', 'aria-pressed': 'false', style: 'min-height:36px;font-size:12px' }, 'Lento 0.5×');
  slow.onclick = () => { const on = slow.getAttribute('aria-pressed') !== 'true'; slow.setAttribute('aria-pressed', String(on)); video.playbackRate = on ? 0.5 : 1; video.defaultPlaybackRate = on ? 0.5 : 1; };
  api.onClose = () => { video.pause(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  return h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, video,
    h('div', { class: 'between' }, slow, h('span', { class: 'muted', style: 'font-size:10px' }, 'Video: Seeing Speech, University of Glasgow / Strathclyde')));
}

function facts(symbol) {
  const d = describe(symbol);
  if (!d) return null;
  const fact = (k, v) => h('div', { style: 'display:flex;flex-direction:column' }, h('span', { style: 'font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--muted)' }, k), h('span', { style: 'font-size:13px;line-height:1.3' }, v));
  return h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;background:var(--soft);border-radius:14px;padding:12px' },
    fact('DÓNDE', d.place), fact('CÓMO', d.manner),
    fact('CUERDAS VOCALES', d.voice ? 'vibran (zigzag)' : 'no vibran'), fact('AIRE', d.nasal ? 'por la nariz (velo bajo)' : 'por la boca (velo arriba)'));
}

function variants(list) {
  return h('section', { style: 'display:flex;flex-direction:column;gap:10px;border:1px solid color-mix(in srgb, var(--accent) 35%, var(--line));border-radius:14px;padding:12px' },
    h('span', { class: 'kicker' }, 'VARIANTES RIOPLATENSES (IPA DETALLADA)'),
    ...list.map(([sym, where, ex]) => h('div', { style: 'display:flex;flex-direction:column;gap:4px' },
      h('div', { class: 'row', style: 'gap:10px;align-items:baseline' }, h('span', { style: 'font-family:var(--ipa-font);font-size:24px;color:var(--accent);min-width:46px' }, `[${sym}]`), h('span', { class: 'small', style: 'line-height:1.4' }, where)),
      h('div', { style: 'padding-left:56px' }, ex.map((e) => (Array.isArray(e) ? highlight(e[0], sym.split(' ')[0], e[1]) : highlight(e, sym.split(' ')[0], narrow(transcribe(e)))))))));
}

function soundModal(x, card, repaint) {
  discover(`[${x.s}]`);
  openModal((api) => {
    const draw = () => {
      const det = detailed();
      api.box.setAttribute('aria-label', `Sonido ${x.s}: ${x.name}`);
      api.box.replaceChildren(
        h('div', { class: 'row', style: 'gap:12px;align-items:center' },
          h('span', { style: 'font-family:var(--ipa-font);font-size:44px;line-height:1;color:var(--accent)' }, `[${det && NARROW_LABEL[x.s] ? NARROW_LABEL[x.s].split(' · ').pop() : x.s}]`),
          h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px' },
            h('h2', { style: 'font-size:22px' }, x.name),
            h('div', { class: 'row wrap', style: 'gap:6px' }, h('span', { class: 'chip' }, x.group.toUpperCase()), x.ar ? h('span', { class: 'chip', style: 'background:var(--accent);color:var(--accent-ink)' }, 'RIOPLATENSE') : '')),
          closeBtn(api.close)),
        h('div', { class: 'between' }, detailSwitch(() => { draw(); repaint(); }), h('span', { class: 'muted', style: 'font-size:11px' }, 'Esc o tocá afuera para cerrar')),
        h('p', { style: 'font-size:15px;line-height:1.5' }, x.how),
        MEDIA[x.s] ? soundVideo(MEDIA[x.s], api) : h('div', { html: mouthSVG(x.s) }),
        facts(x.s),
        h('div', {}, h('span', { class: 'kicker', style: 'color:var(--muted)' }, 'EJEMPLOS · TOCÁ PARA ESCUCHAR'), ...x.ex.map((w) => highlight(w, x.s))),
        det && DETAIL[x.s] ? variants(DETAIL[x.s]) : null);
    };
    draw();
  }, card);
}

function diphthongModal(d, card, repaint) {
  discover(`[${d.s}]`);
  const broad = d.s.replace('i̯', 'j').replace('u̯', 'w');
  openModal((api) => {
    const draw = () => {
      const det = detailed();
      const mouthAt = (sym, label) => h('figure', { style: 'margin:0;display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;min-width:0' },
        h('div', { html: mouthSVG(sym), style: 'width:100%' }), h('figcaption', { class: 'small', style: 'font-family:var(--ipa-font)' }, label));
      api.box.setAttribute('aria-label', `Diptongo ${d.sp}`);
      api.box.replaceChildren(
        h('div', { class: 'row', style: 'gap:12px;align-items:center' },
          h('span', { style: 'font-family:var(--ipa-font);font-size:44px;line-height:1;color:var(--accent)' }, `[${d.s}]`),
          h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px' },
            h('h2', { style: 'font-size:22px' }, `Diptongo «${d.sp}»`),
            h('div', { class: 'row wrap', style: 'gap:6px' }, h('span', { class: 'chip' }, d.kind === 'creciente' ? 'CRECIENTE · SEMIVOCAL + VOCAL' : 'DECRECIENTE · VOCAL + SEMIVOCAL'))),
          closeBtn(api.close)),
        h('div', { class: 'between' }, detailSwitch(() => { draw(); repaint(); }), h('span', { class: 'muted', style: 'font-size:11px' }, 'Esc o tocá afuera para cerrar')),
        h('p', { style: 'font-size:15px;line-height:1.5' }, d.how),
        h('div', { style: 'display:flex;align-items:center;gap:6px;background:var(--soft);border-radius:14px;padding:8px' },
          mouthAt(d.from, `empieza: [${d.from === 'j' && d.kind === 'decreciente' ? 'i̯' : d.from}]`), h('span', { 'aria-hidden': 'true', style: 'font-size:22px;color:var(--accent)' }, '→'),
          mouthAt(d.to, `termina: [${d.kind === 'decreciente' ? (d.to === 'j' ? 'i̯' : 'u̯') : d.to}]`)),
        h('div', {}, h('span', { class: 'kicker', style: 'color:var(--muted)' }, 'EJEMPLOS · TOCÁ PARA ESCUCHAR'), ...d.ex.map((w) => highlight(w, det ? d.s : broad))),
        det ? h('p', { class: 'small', style: 'line-height:1.45;border:1px solid color-mix(in srgb, var(--accent) 35%, var(--line));border-radius:14px;padding:10px 12px' },
          d.kind === 'creciente' ? `La semivocal [${d.s[0]}] va antes de la vocal y se pronuncia rapidísimo, deslizándose hacia ella.` : `La marca ̯ en [${d.s.slice(1)}] indica que esa vocal no forma sílaba: es el final del deslizamiento.`,
          d.ex.length ? h('br') : '', ...d.ex.map((w, i) => [i ? ' · ' : '', h('span', { class: 'ipa' }, `${w} ${narrow(transcribe(w))}`)]).flat()) : null);
    };
    draw();
  }, card);
}

function soundboard(root) {
  const det = detailed();
  const box = h('section', { class: 'card', style: 'gap:10px;padding:18px' });
  root.append(box);
  const cards = [];
  const repaint = () => { const on = detailed(); cards.forEach(({ el, x }) => { el.querySelector('.sym').textContent = on && NARROW_LABEL[x.s] ? NARROW_LABEL[x.s] : x.s; }); boardSwitch.firstChild.setAttribute('aria-checked', String(on)); };
  const boardSwitch = detailSwitch(repaint);
  box.append(h('div', { class: 'between' }, h('h2', { style: 'font-size:17px' }, `Tablero de sonidos (${SOUNDS.length}) y diptongos (${DIPHTHONGS.length})`), boardSwitch),
    h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Todos los sonidos del español rioplatense. Los marcados con ', h('b', { style: 'color:var(--accent)' }, '●'), ' son los que delatan el acento porteño. Tocá uno para ver el video y cómo se hace.'));
  const groups = [...new Set(SOUNDS.map((x) => x.group))];
  for (const g of groups) {
    box.append(h('h3', { style: 'font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--muted);margin-top:4px' }, g.toUpperCase()));
    box.append(h('div', { class: 'ipa-grid' }, SOUNDS.filter((x) => x.group === g).map((x) => {
      const b = h('button', { type: 'button', class: `ipa-card${x.ar ? ' ar' : ''}`, 'aria-label': `${x.s}: ${x.name}`, 'aria-haspopup': 'dialog' },
        MEDIA[x.s] ? h('img', { src: `media/ipa/${MEDIA[x.s]}.jpg`, alt: '', loading: 'lazy', decoding: 'async' }) : null,
        h('span', { class: 'sym' }, det && NARROW_LABEL[x.s] ? NARROW_LABEL[x.s] : x.s),
        h('span', { class: 'nm' }, x.name),
        x.ar ? h('span', { class: 'dot-ar', 'aria-hidden': 'true' }, '●') : null);
      b.onclick = () => soundModal(x, b, repaint);
      cards.push({ el: b, x });
      return b;
    })));
  }
  box.append(h('h3', { style: 'font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--muted);margin-top:8px' }, 'DIPTONGOS'),
    h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Dos vocales en una sola sílaba: la i o la u se vuelven semivocal. Crecientes: la semivocal va primero ([j], [w]). Decrecientes: va al final ([i̯], [u̯]).'));
  for (const kind of ['creciente', 'decreciente']) {
    box.append(h('div', { class: 'ipa-grid' }, DIPHTHONGS.filter((d) => d.kind === kind).map((d) => {
      const b = h('button', { type: 'button', class: 'ipa-card dip', 'aria-label': `Diptongo ${d.sp}: [${d.s}]`, 'aria-haspopup': 'dialog' },
        h('span', { class: 'sym' }, d.s), h('span', { class: 'nm' }, `${d.sp} · ${d.ex[0]}`), h('span', { class: 'kind' }, kind));
      b.onclick = () => diphthongModal(d, b, repaint);
      return b;
    })));
  }
}

// Transformar: watch a word or phrase become porteño, one rule at a time.
function transformer(root) {
  const input = h('input', { type: 'text', value: 'Las llaves del barco están en el bolsillo', 'aria-label': 'Palabra o frase', autocomplete: 'off', lang: 'es-AR',
    style: 'min-height:48px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:17px;width:100%' });
  const go = h('button', { type: 'button', class: 'btn' }, 'Transformar');
  const listen = h('button', { type: 'button', class: 'pill', style: 'min-height:44px' }, '▶ Escuchar');
  const out = h('div', { style: wide() ? 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start' : 'display:flex;flex-direction:column;gap:10px' });
  const EXAMPLES = ['yo me llamo Guillermo', 'los chicos están en la playa', 'un vaso de agua', 'desde ayer', 'mis amigos'];
  const chips = EXAMPLES.map((e) => { const b = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px' }, e); b.onclick = () => { input.value = e; run(); }; return b; });
  root.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Escribí una palabra o una frase y mirá cómo se convierte, regla por regla, en cómo suena en Buenos Aires.'),
    h('section', { class: 'card', style: 'gap:10px' }, input, h('div', { class: 'row wrap', style: 'gap:6px' }, chips), h('div', { class: 'row', style: 'gap:8px' }, go, listen)), out);
  function ipaLine(text, marks) {
    const p = h('p', { class: 'ipa', style: 'font-size:22px;line-height:1.5;color:var(--ink);word-break:break-word' });
    [...text].forEach((c, i) => p.append(marks && marks[i] && c.trim() ? h('b', { style: 'color:var(--accent);background:color-mix(in srgb, var(--accent) 16%, transparent);border-radius:4px' }, c) : c));
    return p;
  }
  function run() {
    const text = input.value.trim();
    if (!/[a-záéíóúüñ]/i.test(text)) { out.replaceChildren(); return; }
    const r = steps(text);
    let n = 0;
    out.replaceChildren(
      h('section', { class: 'card', style: 'gap:6px;grid-column:1/-1' }, h('span', { class: 'kicker' }, 'ESCRITO'),
        h('p', { style: 'font-size:20px;font-family:var(--display)' }, text),
        h('p', { class: 'muted small' }, 'Sílabas (en mayúscula, la que lleva el acento): ', h('b', {}, r.spelled))),
      ...r.steps.map((st) => {
        const num = st.applies ? ++n : null;
        return h('section', { class: 'card', style: `gap:6px;${st.applies ? '' : 'opacity:.55'}` },
          h('div', { class: 'between' }, h('span', { class: 'kicker' }, `${num ? `${num}. ` : ''}${st.title.toUpperCase()}`), st.applies ? '' : h('span', { class: 'muted small' }, 'no se aplica acá')),
          st.applies ? ipaLine(st.ipa, st.marks) : '',
          h('p', { class: 'small', style: 'line-height:1.45' }, st.explain));
      }),
      h('section', { class: 'hero', style: 'gap:6px;grid-column:1/-1' }, h('span', { class: 'kicker' }, 'ASÍ SUENA EN BUENOS AIRES'), h('p', { class: 'ipa', style: 'font-size:24px;color:var(--gold)' }, r.final)));
    log('transformar', { words: text.split(/\s+/).length });
  }
  go.onclick = run;
  input.onkeydown = (e) => { if (e.key === 'Enter') run(); };
  listen.onclick = () => { if (input.value.trim()) phoneSay(input.value.trim()); };
  run();
}

function decodeGame(root) {
  const ROUND = 10;
  let round = shuffle(WORDS).slice(0, ROUND), idx = 0, score = 0;
  const counter = h('span', { class: 'muted small', style: 'font-weight:600' });
  const ipaEl = h('p', { class: 'ipa', style: 'font-size:30px;text-align:center;color:var(--ink)' });
  const opts = h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px' });
  const fb = h('p', { 'aria-live': 'polite', style: 'font-size:15px;min-height:22px' });
  const next = h('button', { type: 'button', class: 'btn', hidden: true }, 'Siguiente');
  root.append(h('p', { class: 'muted small' }, 'Leé la transcripción y elegí la palabra que suena así.'),
    h('section', { class: 'card', style: 'gap:14px;padding:20px' }, h('div', { class: 'between' }, h('span', { class: 'kicker' }, 'DESCIFRAR'), counter), ipaEl, opts, fb, next));

  function show() {
    const w = round[idx];
    counter.textContent = `${idx + 1} / ${round.length}`;
    ipaEl.textContent = transcribe(w);
    // Distractors: words of similar length, preferring ones that share letters.
    const others = shuffle(WORDS.filter((x) => x !== w && Math.abs(x.length - w.length) <= 2)).slice(0, 3);
    fb.textContent = ''; next.hidden = true;
    opts.replaceChildren(...shuffle([w, ...others]).map((o) => {
      const b = h('button', { type: 'button', class: 'pill', style: 'min-height:56px;font-size:18px;font-family:var(--display);border-radius:14px' }, o);
      b.onclick = () => {
        opts.querySelectorAll('button').forEach((x) => { x.disabled = true; if (x.textContent === w) { x.style.background = 'var(--sel)'; x.style.color = 'var(--sel-ink)'; x.style.opacity = '1'; } });
        log('ipa', { game: 'decode', correct: o === w, sounds: soundIds(w) });
        if (o === w) { score++; fb.textContent = '¡Bien leído!'; }
        else { b.style.textDecoration = 'line-through'; fb.textContent = `“${o}” sería ${transcribe(o)}.`; }
        next.textContent = idx < round.length - 1 ? 'Siguiente' : 'Ver resultado';
        next.hidden = false;
      };
      return b;
    }));
  }
  next.onclick = () => {
    if (idx < round.length - 1) { idx++; show(); return; }
    root.querySelector('.card').replaceChildren(h('span', { class: 'kicker' }, 'RONDA TERMINADA'),
      h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, `${score} de ${round.length}`),
      h('button', { type: 'button', class: 'btn', onclick: () => window.dispatchEvent(new Event('cadencia:rerender')) }, 'Otra ronda'));
  };
  show();
}

function encodeGame(root) {
  const ROUND = 8;
  let round = shuffle(WORDS).slice(0, ROUND), idx = 0, score = 0;
  const counter = h('span', { class: 'muted small', style: 'font-weight:600' });
  const wordEl = h('p', { style: 'font-family:var(--display);font-size:32px;font-weight:700;text-align:center', lang: 'es-AR' });
  const built = h('div', { 'aria-live': 'polite', style: 'min-height:56px;border:2px dashed var(--line);border-radius:14px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;padding:8px;font-family:var(--ipa-font);font-size:24px' });
  const tiles = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center' });
  const undo = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Borrar');
  const check = h('button', { type: 'button', class: 'btn', style: 'flex:1' }, 'Comprobar');
  const fb = h('div', { 'aria-live': 'polite', style: 'font-size:15px;display:flex;flex-direction:column;gap:4px' });
  root.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Armá la pronunciación porteña tocando los símbolos en orden. Cuidado con las trampas: ɾ o r, b o β, ʃ o ʝ… (sin acento ni puntos).'),
    h('section', { class: 'card', style: 'gap:14px;padding:20px' }, h('div', { class: 'between' }, h('span', { class: 'kicker' }, 'ESCRIBIR'), counter), wordEl, built, tiles, h('div', { class: 'row' }, undo, check), fb));

  let answer = [], picked = [], tileEls = [], done = false;
  function drawBuilt() {
    built.replaceChildren(...(picked.length ? picked.map((t) => h('span', { style: 'padding:2px 6px;border-radius:8px;background:var(--chip)' }, tileEls[t].dataset.sym)) : [h('span', { class: 'muted', style: 'font-size:14px;font-family:var(--body)' }, 'tocá los símbolos…')]));
  }
  function show() {
    const w = round[idx];
    done = false;
    counter.textContent = `${idx + 1} / ${round.length}`;
    wordEl.textContent = w;
    answer = tokens(transcribe(w));
    const traps = shuffle([...new Set(answer.flatMap((t) => CONFUSABLE[t] || []))].filter((t) => !answer.includes(t))).slice(0, 4);
    const pool = shuffle([...answer, ...traps]);
    picked = []; fb.replaceChildren(); check.textContent = 'Comprobar';
    tileEls = pool.map((sym, i) => {
      const b = h('button', { type: 'button', class: 'pill', 'data-sym': sym, style: 'min-width:52px;min-height:52px;font-family:var(--ipa-font);font-size:22px;font-weight:500;border-radius:12px' }, sym);
      b.onclick = () => { if (done) return; picked.push(i); b.disabled = true; drawBuilt(); };
      return b;
    });
    tiles.replaceChildren(...tileEls);
    drawBuilt();
  }
  undo.onclick = () => { if (done || !picked.length) return; tileEls[picked.pop()].disabled = false; drawBuilt(); };
  check.onclick = () => {
    if (done) {
      if (idx < round.length - 1) { idx++; show(); return; }
      root.querySelector('.card').replaceChildren(h('span', { class: 'kicker' }, 'RONDA TERMINADA'),
        h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, `${score} de ${round.length}`),
        h('button', { type: 'button', class: 'btn', onclick: () => window.dispatchEvent(new Event('cadencia:rerender')) }, 'Otra ronda'));
      return;
    }
    const got = picked.map((i) => tileEls[i].dataset.sym);
    if (!got.length) { toast('Tocá los símbolos en orden'); return; }
    done = true;
    const ok = got.join('') === answer.join('');
    if (ok) score++;
    log('ipa', { game: 'encode', correct: ok, sounds: soundIds(round[idx]) });
    const w = round[idx];
    const traps = got.filter((s, i) => s !== answer[i]);
    fb.replaceChildren(...[
      h('b', { style: `color:${ok ? 'var(--accent)' : 'var(--ink)'}` }, ok ? '¡Perfecto!' : 'Casi. La pronunciación es:'),
      h('span', { class: 'ipa', style: 'font-size:20px' }, transcribe(w)),
      !ok && traps.length ? h('span', { class: 'muted small' }, `Revisá: ${[...new Set(traps)].map((t) => { const x = SOUNDS.find((y) => y.s === t); return x ? `[${t}] = ${x.name}` : `[${t}] no se usa en el español porteño`; }).join(' · ')}`) : null].filter(Boolean));
    check.textContent = idx < round.length - 1 ? 'Siguiente' : 'Ver resultado';
  };
  show();
}

export async function render(main) {
  const tabs = MODES.map(([k, label]) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(k === mode) }, label));
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  tabs.forEach((b, i) => { b.onclick = () => { mode = MODES[i][0]; tabs.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); draw(); }; });
  main.append(pageHead(`FONÉTICA RIOPLATENSE · ${SOUNDS.length} SONIDOS · ${DIPHTHONGS.length} DIPTONGOS`, 'IPA y pronunciación', h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Modo', style: 'gap:6px' }, tabs)), body);
  function draw() {
    body.replaceChildren();
    body.style.maxWidth = wide() && (mode === 'descifrar' || mode === 'escribir') ? '760px' : '';
    stopPhone();
    if (mode === 'simbolos') soundboard(body);
    else if (mode === 'transformar') transformer(body);
    else if (mode === 'descifrar') decodeGame(body);
    else encodeGame(body);
  }
  draw();
}
