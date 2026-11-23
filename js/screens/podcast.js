// Podcast (ArgenTalk): episodes with a word-timed transcript that follows the audio.
// Tapping a word opens a floating inspector over the text (meaning, IPA, syllables, save, replay from that word).
import { h, iconEl, toast } from '../ui.js';
import { readTabs } from './leer.js';
import { db, persist } from '../db.js';
import { importPack, positions, savePosition, segmentAt } from '../podcast.js';
import { features, phraseIPA } from '../wordpanel.js';
import { ipaFor, analyzeWord } from '../ipa.js';
import { log, discover } from '../progress.js';
import { speak } from '../tts.js';

let openEp = null;
const SPEEDS = [0.75, 0.9, 1, 1.25];
const PREF = 'cadencia.podcast.prefs';
const prefs = () => { try { return { speed: 1, follow: true, ...JSON.parse(localStorage.getItem(PREF) || '{}') }; } catch { return { speed: 1, follow: true }; } };
const setPref = (p) => { const v = { ...prefs(), ...p }; try { localStorage.setItem(PREF, JSON.stringify(v)); } catch { /* ignore */ } return v; };
const clock = (s) => { s = Math.max(0, Math.floor(s || 0)); const h_ = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h_ ? `${h_}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
const clean = (w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

export async function render(main) {
  const eps = (await db.all('episodes')).sort((a, b) => a.show.localeCompare(b.show) || a.n - b.n);
  const ep = openEp && eps.find((e) => e.id === openEp);
  if (ep) return episodeView(main, ep);
  main.append(h('div', { class: 'between' }, readTabs('podcast')));
  openEp = null;
  return listView(main, eps);
}

export function importCard() {
  const status = h('p', { class: 'small', role: 'status' });
  const input = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed,application/x-zip,application/octet-stream', id: 'podpack', hidden: true });
  const btn = h('label', { for: 'podpack', class: 'btn', role: 'button', tabindex: '0' }, 'Importar paquete');
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    status.textContent = 'Leyendo el paquete…';
    try {
      await persist();
      const r = await importPack(file, (d, t) => { status.textContent = `Importando… ${d} de ${t}`; });
      toast(r.kind === 'podcast' ? `${r.n} episodios importados` : r.kind === 'songs' ? `${r.n} canciones importadas` : `${r.n} clips importados`);
      window.dispatchEvent(new Event('cadencia:rerender'));
    } catch (err) { status.textContent = 'No se pudo importar: ' + (err.message || err); }
    input.value = '';
  };
  return h('section', { class: 'card', style: 'gap:8px' }, input, btn, status);
}

function listView(main, eps) {
  if (!eps.length) {
    main.append(h('section', { class: 'card empty' },
      h('h2', {}, 'Todavía no hay episodios'),
      h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Prepará los episodios en la computadora con prepare_podcast.py y después importá cada archivo argentalk-1.zip, argentalk-2.zip… acá o en Ajustes.')),
    importCard());
    return () => {};
  }
  const pos = positions();
  const done = eps.filter((e) => pos[e.id] && pos[e.id].done).length;
  main.append(h('div', { class: 'between' }, h('h1', { style: 'font-size:26px' }, eps[0].show), h('span', { class: 'muted small' }, `${done} de ${eps.length} escuchados`)));
  const search = h('input', { type: 'search', placeholder: 'Buscar en las transcripciones…', 'aria-label': 'Buscar', autocomplete: 'off',
    style: 'min-height:48px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:16px;width:100%' });
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren(...eps.filter((e) => !q || e.title.toLowerCase().includes(q) || e.segments.some((s) => s.t.toLowerCase().includes(q))).map((e) => {
      const p = pos[e.id] || {};
      const frac = e.duration ? Math.min(1, (p.t || 0) / e.duration) : 0;
      const b = h('button', { type: 'button', class: 'card', style: 'text-align:left;cursor:pointer;font:inherit;color:inherit;gap:6px;padding:12px 14px' },
        h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap' },
          h('b', { style: 'font-family:var(--display);font-size:17px;line-height:1.25' }, e.title),
          h('span', { class: 'muted small', style: 'white-space:nowrap' }, p.done ? '✓' : clock(e.duration))),
        frac > 0.01 && !p.done ? h('div', { class: 'progress' }, h('div', { style: `width:${frac * 100}%` })) : '');
      b.onclick = () => { openEp = e.id; window.dispatchEvent(new Event('cadencia:rerender')); };
      return b;
    }));
  };
  search.oninput = draw;
  draw();
  main.append(search, list, h('details', { style: 'margin-top:8px' }, h('summary', { class: 'muted small' }, 'Importar otro paquete'), importCard()));
  return () => {};
}

function episodeView(main, ep) {
  let p = prefs();
  const segs = ep.segments;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.preservesPitch = true;
  let url = null;

  // --- Header and transcript. Tapping a word opens the inspector over the text; playback is untouched.
  const back = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, '← Episodios');
  back.onclick = () => { openEp = null; window.dispatchEvent(new Event('cadencia:rerender')); };
  const transcript = h('article', { class: 'card', style: 'gap:2px;padding:14px 12px' });
  const segEls = [], wordEls = [];
  segs.forEach((s, i) => {
    const time = h('button', { type: 'button', 'aria-label': `Escuchar desde ${clock(s.s)}`, style: 'border:none;background:none;color:var(--muted);font:inherit;font-size:11px;font-weight:700;padding:2px 6px 0 0;min-width:38px;text-align:left;cursor:pointer;font-variant-numeric:tabular-nums' }, clock(s.s));
    time.onclick = () => { picked = i; stopAt = null; seek(s.s); play(); };
    const words = h('p', { style: 'font-size:17px;line-height:1.6;flex:1', lang: 'es-AR' });
    const ws = s.w && s.w.length ? s.w : [[s.t, s.s, s.e]];
    wordEls[i] = ws.map(([w], k) => {
      const span = h('span', { class: 'pw', role: 'button', tabindex: '0', 'aria-haspopup': 'dialog' }, w);
      span.onclick = () => openInspector(i, k);
      span.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openInspector(i, k); } };
      if (k) words.append(' ');
      words.append(span);
      return span;
    });
    const row = h('div', { style: 'display:flex;gap:4px;align-items:flex-start;padding:6px 6px;border-radius:10px;transition:background .15s' }, time, words);
    segEls[i] = row;
    transcript.append(row);
  });

  // --- Controls (stay at the bottom while you scroll)
  const playBtn = h('button', { type: 'button', class: 'round native', 'aria-label': 'Reproducir', style: 'width:56px;height:56px' }, iconEl('play'));
  const prevBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Frase anterior' }, iconEl('prev'));
  const nextBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Frase siguiente' }, iconEl('next'));
  const speedBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:38px;font-size:13px;min-width:58px', 'aria-label': 'Velocidad' }, `${p.speed}x`);
  const loopBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:38px;font-size:12px', 'aria-pressed': 'false' }, '🔁 Frase');
  const saveBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:38px;font-size:12px' }, '+ Penumbra');
  const timeEl = h('span', { class: 'muted small', style: 'font-variant-numeric:tabular-nums;white-space:nowrap' }, `0:00 / ${clock(ep.duration)}`);
  const bar = h('input', { type: 'range', min: '0', max: String(Math.round(ep.duration || 1)), step: '1', value: '0', 'aria-label': 'Posición', style: 'width:100%;accent-color:var(--accent)' });
  const controls = h('section', { class: 'card media-dock', 'aria-label': 'Reproductor' },
    bar,
    h('div', { class: 'between', style: 'flex-wrap:nowrap;gap:6px' }, timeEl,
      h('div', { class: 'row', style: 'gap:2px;flex-wrap:nowrap;align-items:center' }, prevBtn, playBtn, nextBtn)),
    h('div', { class: 'row', style: 'gap:6px;justify-content:center' }, speedBtn, loopBtn, saveBtn));

  main.append(
    h('div', { class: 'between' }, back, h('span', { class: 'muted small', style: 'text-align:right' }, 'Tocá una palabra')),
    h('h1', { style: 'font-size:22px;line-height:1.25' }, ep.title),
    transcript, controls);

  // --- Playback
  let loop = false, loopIdx = -1, picked = -1, cur = -1, curWord = null, raf = 0, lastSave = 0, userScroll = 0, stopAt = null;
  const seek = (t) => { audio.currentTime = Math.max(0, t); if (loop) loopIdx = Math.max(0, segmentAt(segs, t + 0.05)); paint(true); };
  const play = () => { audio.play().catch(() => {}); };
  const setRate = () => { audio.playbackRate = p.speed; audio.defaultPlaybackRate = p.speed; };
  (async () => {
    const rec = await db.get('epaudio', ep.id);
    if (!rec) { toast('No encuentro el audio de este episodio. Importá el paquete de nuevo.'); return; }
    url = URL.createObjectURL(rec.blob);
    audio.src = url;
    setRate();
    const saved = positions()[ep.id];
    if (saved && saved.t && !saved.done) audio.currentTime = saved.t;
  })();

  function paint(force) {
    const t = audio.currentTime;
    const i = segmentAt(segs, t);
    if (i !== cur || force) {
      if (cur >= 0 && segEls[cur]) segEls[cur].style.background = '';
      cur = i;
      if (cur >= 0 && segEls[cur]) {
        segEls[cur].style.background = 'var(--chip)';
        // Don't move the text while you're reading a word or scrolling yourself.
        if (!pop.isConnected && Date.now() - userScroll > 4000) segEls[cur].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    // Current word
    let w = null;
    if (cur >= 0) {
      const ws = segs[cur].w || [];
      for (let k = ws.length - 1; k >= 0; k--) if (ws[k][1] <= t) { w = wordEls[cur][k]; break; }
    }
    if (w !== curWord) {
      if (curWord) curWord.classList.remove('pw-cur');
      curWord = w;
      if (curWord) curWord.classList.add('pw-cur');
    }
    // Loop the current sentence
    // (checked against the sentence you chose, because by the time it ends the highlight has already moved on)
    if (loop && loopIdx >= 0 && segs[loopIdx] && t >= segs[loopIdx].e) { audio.currentTime = segs[loopIdx].s; return; }
    // "Reproducir desde esta palabra" without Seguir: stop at the end of that line.
    if (!loop && stopAt !== null && t >= stopAt) { stopAt = null; audio.pause(); }
    timeEl.textContent = `${clock(t)} / ${clock(ep.duration || audio.duration)}`;
    if (document.activeElement !== bar) bar.value = String(Math.round(t));
    if (Date.now() - lastSave > 5000) { lastSave = Date.now(); savePosition(ep.id, t, ep.duration || audio.duration); }
  }
  const tick = () => { paint(); raf = requestAnimationFrame(tick); };
  audio.onplay = () => { playBtn.replaceChildren(iconEl('stop')); playBtn.setAttribute('aria-label', 'Pausa'); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); paintReplay(); };
  audio.onpause = () => { playBtn.replaceChildren(iconEl('play')); playBtn.setAttribute('aria-label', 'Reproducir'); cancelAnimationFrame(raf); paint(); savePosition(ep.id, audio.currentTime, ep.duration); paintReplay(); };
  audio.onended = () => { savePosition(ep.id, ep.duration, ep.duration); log('podcast', { id: ep.id, done: true }); };
  playBtn.onclick = () => { stopAt = null; if (audio.paused) play(); else audio.pause(); };
  prevBtn.onclick = () => { const i = Math.max(0, (audio.currentTime - (cur >= 0 ? segs[cur].s : 0) > 1.5 ? cur : cur - 1)); if (segs[i]) seek(segs[i].s); };
  nextBtn.onclick = () => { if (segs[cur + 1]) seek(segs[cur + 1].s); };
  speedBtn.onclick = () => { p = setPref({ speed: SPEEDS[(SPEEDS.indexOf(p.speed) + 1) % SPEEDS.length] }); speedBtn.textContent = `${p.speed}x`; setRate(); };
  loopBtn.onclick = () => {
    loop = !loop;
    loopBtn.setAttribute('aria-pressed', String(loop));
    loopIdx = !loop ? -1 : !audio.paused && cur >= 0 ? cur : picked >= 0 ? picked : Math.max(0, segmentAt(segs, audio.currentTime));
    if (loop && audio.paused) { audio.currentTime = segs[loopIdx].s; paint(true); }
    toast(loop ? 'Repitiendo esta frase' : 'Repetición apagada');
  };
  const key = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const inPenumbra = async (front) => (await db.all('cards')).some((c) => key(c.front) === key(front));
  let saving = false;
  async function saveSentence(s) {
    if (saving || !s) return;
    saving = true;
    try {
      if (await inPenumbra(s.t)) { toast('Ya está en Penumbra'); return; }
      await db.put('mazo', { front: s.t, ipa: ipaFor(s.t), back: `${ep.show} · ${ep.title} · ${clock(s.s)}`, tag: '#ArgenTalk', created: Date.now(),
        source: { kind: 'podcast', id: ep.id, s: s.s, e: s.e, label: `${ep.title} · ${clock(s.s)}` } });
      toast('Guardada en Penumbra');
    } finally { setTimeout(() => { saving = false; }, 800); }
  }
  // The sentence you're hearing; when paused, the one you last tapped.
  saveBtn.onclick = () => saveSentence(segs[!audio.paused && cur >= 0 ? cur : picked >= 0 ? picked : Math.max(0, cur)]);
  bar.oninput = () => { stopAt = null; audio.currentTime = Number(bar.value); paint(true); };
  const markScroll = () => { userScroll = Date.now(); };
  window.addEventListener('touchmove', markScroll, { passive: true });
  window.addEventListener('wheel', markScroll, { passive: true });
  log('podcast', { id: ep.id, open: true });

  // --- Word inspector: a card floating over the transcript, next to the word you tapped.
  const pop = h('div', { class: 'wpop', role: 'dialog', 'aria-label': 'Palabra', tabindex: '-1' });
  let anchor = null, replayBtn = null, clip = null, clipRaf = 0;
  const paintReplay = () => { if (replayBtn) replayBtn.lastChild.textContent = !audio.paused && stopAt === null && anchor ? ' Reproduciendo…' : ' Reproducir desde esta palabra'; };

  function stopClip() { cancelAnimationFrame(clipRaf); if (clip) { clip.pause(); clip = null; } }
  // The speaker's own voice for just this word (a second player on the same audio, so your place isn't lost).
  function playWord(a, b, fallback) {
    stopClip();
    if (!url || !(b > a)) { speak(fallback).then((r) => { if (r.used === 'none') toast('Este dispositivo no tiene voz sintética'); }); return; }
    const resume = !audio.paused;
    if (resume) audio.pause();
    clip = new Audio(url);
    clip.playbackRate = Math.min(1, p.speed);
    clip.currentTime = Math.max(0, a - 0.06);
    const end = b + 0.08;
    const watch = () => { if (!clip) return; if (clip.currentTime >= end || clip.ended) { stopClip(); if (resume) play(); return; } clipRaf = requestAnimationFrame(watch); };
    clip.play().then(() => { clipRaf = requestAnimationFrame(watch); }).catch(() => { stopClip(); if (resume) play(); });
  }

  function place() {
    if (!anchor || !pop.isConnected) return;
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const bar_ = document.querySelector('.topbar');
    const topLimit = (bar_ && bar_.offsetParent !== null ? bar_.getBoundingClientRect().bottom : 0) + 8;
    const ctrl = controls.getBoundingClientRect();
    const bottomLimit = Math.min(vh, ctrl.top > r.bottom ? ctrl.top : vh) - 8;
    pop.style.maxHeight = `${Math.max(200, bottomLimit - topLimit)}px`;
    const ph = pop.offsetHeight, pw = pop.offsetWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), vw - pw - 8);
    const below = r.bottom + 8, above = r.top - 8 - ph;
    const top = below + ph <= bottomLimit ? below : above >= topLimit ? above : Math.min(Math.max(topLimit, below), bottomLimit - ph);
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${top + window.scrollY}px`;
  }

  function closeInspector() {
    stopClip();
    if (anchor) anchor.classList.remove('pw-pick');
    const was = anchor;
    anchor = null; replayBtn = null;
    pop.remove();
    if (was && document.activeElement && pop.contains(document.activeElement)) was.focus({ preventScroll: true });
  }

  function openInspector(si, wi) {
    const s = segs[si];
    const ws = s.w && s.w.length ? s.w : [[s.t, s.s, s.e]];
    const [raw, a, b] = ws[wi];
    const word = clean(raw);
    if (!word) return;
    picked = si;
    if (anchor) anchor.classList.remove('pw-pick');
    anchor = wordEls[si][wi];
    anchor.classList.add('pw-pick');
    stopClip();
    const info = analyzeWord(word);
    const lw = info ? info.word : word.toLowerCase();
    if (info) { log('lookup', { word: lw }); discover(info.ipa); }

    // Replay row
    replayBtn = h('button', { type: 'button', class: 'btn', style: 'flex:1;min-width:0;min-height:42px;font-size:13px;padding:0 12px;white-space:nowrap' }, iconEl('play'), ' Reproducir desde esta palabra');
    replayBtn.onclick = () => { stopClip(); stopAt = p.follow ? null : s.e; if (loop) loopIdx = si; seek(Math.max(0, a - 0.05)); play(); };
    const follow = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(p.follow), title: 'Encendido: sigue con las frases siguientes. Apagado: para al final de esta frase.', style: 'min-height:42px;font-size:12px;flex:none' }, 'Seguir');
    follow.onclick = () => { p = setPref({ follow: !p.follow }); follow.setAttribute('aria-pressed', String(p.follow)); if (!audio.paused && anchor) stopAt = p.follow ? null : s.e; toast(p.follow ? 'Sigue con las frases siguientes' : 'Para al final de la frase'); };
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', style: 'width:38px;height:38px;flex:none' }, h('span', { html: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>', style: 'display:contents' }));
    close.onclick = closeInspector;

    // The episode sentence with the word marked
    const sentence = h('p', { lang: 'es-AR', style: 'font-size:14px;line-height:1.5;color:var(--muted)' }, '«',
      ...ws.flatMap(([w], k) => [k ? ' ' : '', k === wi ? h('b', { style: 'color:var(--ink);background:color-mix(in srgb, var(--accent) 22%, transparent);border-radius:4px;padding:0 2px' }, w) : w]), '»',
      h('span', { style: 'font-size:11px;margin-left:6px;font-variant-numeric:tabular-nums' }, clock(s.s)));

    // Meaning: Lunfardo list or your own cards first, then Gemini (remembered on this device)
    const meaning = h('div', { 'aria-live': 'polite', style: 'display:flex;flex-direction:column;gap:3px' }, h('span', { class: 'muted small' }, 'Buscando el significado…'));
    meaningFor(lw, s.t).then((m) => {
      if (!meaning.isConnected) return;
      meaning.replaceChildren(...(m && m.meaning
        ? [h('span', { style: 'font-size:16px;font-weight:600', lang: 'en' }, m.meaning), m.note ? h('span', { class: 'small', style: 'color:var(--gold-text);line-height:1.4' }, m.note) : null].filter(Boolean)
        : [h('span', { class: 'muted small', style: 'line-height:1.4' }, m && m.error ? `No pude buscar el significado (${m.error}). Probá con el DLE.` : 'Sin significado guardado. Con la clave de Gemini (Ajustes) aparece acá; si no, mirá el DLE.')]));
      place();
    });

    // Sound: IPA and syllables
    const soundBits = [];
    if (info) {
      const sylRow = h('div', { class: 'row wrap', style: 'gap:4px;align-items:center' });
      info.spelling.forEach((sy, i) => {
        if (i) sylRow.append(h('span', { class: 'muted' }, '·'));
        const on = i === info.stress && info.spelling.length > 1;
        sylRow.append(h('span', { style: `padding:3px 9px;border-radius:8px;font-size:14px;background:${on ? 'var(--accent)' : 'var(--chip)'};color:${on ? 'var(--accent-ink)' : 'var(--ink)'};font-weight:${on ? 700 : 500}` }, on ? sy.toUpperCase() : sy));
      });
      const n = info.spelling.length;
      soundBits.push(sylRow, h('span', { class: 'muted', style: 'font-size:12px' }, `${n} sílaba${n > 1 ? 's' : ''}${n > 1 ? `, fuerza en la ${['1.ª', '2.ª', '3.ª', '4.ª', '5.ª', '6.ª'][info.stress] || `${info.stress + 1}.ª`}` : ''}`));
      const feats = features(lw, info.ipa).filter((f) => f[2]);
      if (feats.length) soundBits.push(h('div', { style: 'display:flex;flex-direction:column;gap:4px' }, feats.map(([, d]) => h('span', { class: 'small', style: 'display:flex;gap:6px;align-items:baseline' }, h('span', { class: 'chip', style: 'background:var(--accent);color:var(--accent-ink);font-size:10px' }, 'RIOPLATENSE'), d))));
    }

    // Actions
    const ext = (href, label) => h('a', { href, target: '_blank', rel: 'noopener', class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:4px;text-decoration:none;font-size:12px;flex:1' }, label, ' ↗');
    const listen = h('button', { type: 'button', class: 'pill', style: 'min-height:40px;font-size:12px;flex:1' }, '▶ Escuchar');
    listen.onclick = () => playWord(a, b, lw);
    const saveWord = h('button', { type: 'button', class: 'btn', style: 'min-height:40px;font-size:13px;flex:1;padding:0 12px' }, '+ Penumbra');
    const saveLine = h('button', { type: 'button', class: 'pill', style: 'min-height:40px;font-size:12px;flex:1' }, '+ Frase');
    saveLine.onclick = () => saveSentence(s);
    inPenumbra(lw).then((have) => { if (have) { saveWord.textContent = '✓ En Penumbra'; saveWord.disabled = true; } });
    saveWord.onclick = async () => {
      if (saving) return;
      saving = true; saveWord.disabled = true;
      try {
        if (await inPenumbra(lw)) { toast('Ya está en Penumbra'); saveWord.textContent = '✓ En Penumbra'; return; }
        await db.put('mazo', { front: lw, ipa: ipaFor(lw), back: s.t, tag: '#ArgenTalk', created: Date.now(),
          source: b > a ? { kind: 'podcast', id: ep.id, s: Math.max(0, a - 0.06), e: b + 0.08, label: `${ep.title} · ${clock(a)}` } : undefined });
        saveWord.textContent = '✓ En Penumbra';
        toast('Guardada en Penumbra');
      } catch (e) { saveWord.disabled = false; toast(String(e.message || e)); } finally { setTimeout(() => { saving = false; }, 800); }
    };

    pop.replaceChildren(
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, replayBtn, follow, close),
      h('div', { style: 'display:flex;flex-direction:column;gap:2px' },
        h('span', { style: 'font-family:var(--display);font-size:28px;font-weight:700;line-height:1.1' }, lw),
        info ? h('span', { class: 'ipa', style: 'font-size:16px;color:var(--accent)' }, ipaFor(lw)) : null),
      meaning, sentence,
      phraseIPA(ws.map(([w]) => w).join(' '), lw, ws.slice(0, wi).filter(([w]) => clean(w).toLowerCase() === lw).length, 'font-size:13.5px;line-height:1.5'),
      ...soundBits,
      h('div', { class: 'row', style: 'gap:6px' }, ext(`https://dle.rae.es/${encodeURIComponent(lw)}`, 'Ver en el DLE'), ext(`https://www.asale.org/damer/${encodeURIComponent(lw)}`, 'Americanismos')),
      h('div', { class: 'row', style: 'gap:6px' }, listen, saveLine, saveWord));
    pop.setAttribute('aria-label', `Palabra: ${lw}`);
    if (!pop.isConnected) document.body.append(pop);
    pop.scrollTop = 0;
    place();
    paintReplay();
    pop.focus({ preventScroll: true });
  }

  const onKey = (e) => { if (e.key === 'Escape' && pop.isConnected) { e.stopPropagation(); closeInspector(); } };
  const onDown = (e) => { if (pop.isConnected && !pop.contains(e.target) && !(e.target.closest && e.target.closest('.pw'))) closeInspector(); };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('resize', place);

  return () => {
    closeInspector();
    savePosition(ep.id, audio.currentTime, ep.duration);
    cancelAnimationFrame(raf);
    audio.pause(); audio.removeAttribute('src');
    if (url) URL.revokeObjectURL(url);
    window.removeEventListener('touchmove', markScroll);
    window.removeEventListener('wheel', markScroll);
    window.removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
  };
}

// A short English meaning for a word in this sentence: the Lunfardo list, your own cards,
// then Gemini (when there's a key). Gemini answers are kept on this device so each word is asked once.
const MEAN = 'cadencia.podcast.meanings';
const strip = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
async function meaningFor(word, sentence) {
  const k = strip(word);
  const { LUNFARDO } = await import('../lunfardo.js');
  const lun = LUNFARDO.find((x) => strip(x.w) === k);
  if (lun) return { meaning: lun.en, note: `Lunfardo: ${lun.es}` };
  const card = (await db.all('cards')).find((c) => c.meaning && strip(c.front) === k);
  if (card) return { meaning: card.meaning, note: card.hint || '' };
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(MEAN) || '{}'); } catch { /* ignore */ }
  const ck = `${k}|${strip(sentence).slice(0, 80)}`;
  if (cache[ck]) return cache[ck];
  const { geminiReady, ask } = await import('../gemini.js');
  if (!geminiReady()) return null;
  try {
    const r = await ask({
      system: 'Sos un diccionario rioplatense-inglés. Respondés solo JSON.',
      turns: [{ role: 'user', text: `Palabra: «${word}». Frase del podcast (español rioplatense): «${sentence}».\nDevolvé {"meaning": "significado breve en inglés (2 a 6 palabras), el de esta frase", "note": "nota muy corta en español sobre uso rioplatense o del contexto, o vacío"}` }],
      json: true, temperature: 0.2, fast: true,
    });
    const v = { meaning: String(r.meaning || ''), note: String(r.note || '') };
    if (v.meaning) {
      cache[ck] = v;
      const keys = Object.keys(cache);
      if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((x) => delete cache[x]);
      try { localStorage.setItem(MEAN, JSON.stringify(cache)); } catch { /* ignore */ }
    }
    return v;
  } catch (e) { return { error: String(e.message || e).slice(0, 60) }; }
}
