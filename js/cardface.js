// The look of a Penumbra flashcard: night photo of the Obelisco on the front, Caminito on the back,
// neon rims (your accent colour in front, magenta behind), glass boxes for the phrase, IPA and meaning,
// and dictionary links at the bottom. Tags are never shown on a card: they're for decks and filters.
import { h } from './ui.js';

// --- Backgrounds: media/cards/obelisco.(webp|png) and media/cards/argentina.(avif|jpg).
// The first format the browser can load wins; until then (or if none loads) the card keeps its gradient.
let bgPromise = null;
const tryImg = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(src); i.onerror = fail; i.src = src; });
const firstOk = async (list) => { for (const s of list) { try { return await tryImg(s); } catch { /* next */ } } return null; };
export function loadCardBackgrounds() {
  if (!bgPromise) {
    bgPromise = Promise.all([
      firstOk(['media/cards/obelisco.webp', 'media/cards/obelisco.png']),
      firstOk(['media/cards/argentina.avif', 'media/cards/argentina.jpg']),
    ]).then(([front, back]) => {
      const root = document.documentElement.style;
      // Full addresses: a url() inside a CSS variable would otherwise be read relative to app.css.
      const abs = (x) => new URL(x, document.baseURI).href;
      if (front) root.setProperty('--fc-front-img', `url("${abs(front)}")`);
      if (back) root.setProperty('--fc-back-img', `url("${abs(back)}")`);
      return { front, back };
    });
  }
  return bgPromise;
}

const SPEAKER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';

// The glowing "Escuchar" button.
export function listenButton(onClick, label = 'Escuchar', { small = false } = {}) {
  const b = h('button', { type: 'button', class: `fc-listen${small ? ' small' : ''}` }, h('span', { html: SPEAKER, style: 'display:contents' }), label);
  b.onclick = async () => { b.classList.add('playing'); try { await onClick(); } finally { setTimeout(() => b.classList.remove('playing'), 900); } };
  return b;
}

// A card: badge top-left, deck name top-right (small), content in the middle.
export function cardShell(side, badge, deck) {
  const el = h('section', { class: `fc fc-${side}` });
  const badgeEl = h('span', { class: 'fc-badge' }, badge);
  el.append(h('div', { class: 'fc-top' }, badgeEl, deck ? h('span', { class: 'fc-deck' }, deck) : null));
  el.flip = (to, label) => { el.classList.remove('fc-front', 'fc-back'); el.classList.add(`fc-${to}`); badgeEl.textContent = label; };
  loadCardBackgrounds();
  return el;
}

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (t) => String(t || '').match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g) || [];
const SMALL = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'que', 'se', 'me', 'te', 'le', 'lo', 'nos', 'les', 'mi', 'tu', 'su', 'por', 'con', 'para', 'es', 'no', 'si', 'ya', 'muy', 'más', 'pero', 'como']);
// The word the dictionary buttons look up: the card's word, or for a sentence its first longer word.
export function mainWord(card) {
  const w = words(card.front);
  if (w.length <= 3) return card.front.trim();
  return (w.find((x) => x.length >= 4 && !SMALL.has(x.toLowerCase())) || w[0]).toLowerCase();
}

// WordReference and DLE for the current word. For sentences, tapping a word in the phrase changes it.
export function dictionaryBar(word) {
  const label = h('b', {}, word);
  const wr = h('a', { class: 'fc-dict', target: '_blank', rel: 'noopener' }, 'WordReference ↗');
  const dle = h('a', { class: 'fc-dict', target: '_blank', rel: 'noopener' }, 'DLE ↗');
  const set = (w) => {
    label.textContent = w;
    wr.href = `https://www.wordreference.com/es/en/translation.asp?spen=${encodeURIComponent(w)}`;
    dle.href = `https://dle.rae.es/${encodeURIComponent(w.toLowerCase())}`;
    wr.setAttribute('aria-label', `Buscar «${w}» en WordReference`); dle.setAttribute('aria-label', `Buscar «${w}» en el DLE`);
  };
  set(word);
  const bar = h('div', { class: 'fc-dictbar' }, h('span', { class: 'fc-dictword' }, 'Diccionarios · ', label), h('div', { class: 'fc-dictrow' }, wr, dle));
  bar.setWord = set;
  return bar;
}

// The phrase with each word tappable (to pick the word for the dictionaries).
function phrase(text, onWord, size) {
  const p = h('p', { class: 'fc-phrase', lang: 'es-AR', style: size ? `font-size:${size}px` : '' });
  text.split(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/).forEach((part, i) => {
    if (i % 2 && part) { const b = h('button', { type: 'button', class: 'fc-w', title: 'Buscar en los diccionarios' }, part); b.onclick = () => onWord(part, b); p.append(b); }
    else p.append(part);
  });
  return p;
}

// Everything on the answer side, for any card type: picture, phrase, IPA, meaning, note,
// example sentence, source, and the dictionaries at the bottom. Tags are left out on purpose.
export function backContent(card, { onListen, listenLabel = 'Escuchar', showPhrase = true, showIpa = true, extra = [] } = {}) {
  const dict = dictionaryBar(mainWord(card));
  const pick = (w, btn) => { dict.setWord(w); btn.parentElement.querySelectorAll('.fc-w').forEach((x) => x.classList.toggle('on', x === btn)); };
  const out = [];
  if (onListen) out.push(listenButton(onListen, listenLabel));
  if (card.image instanceof Blob) out.push(h('img', { class: 'fc-img', src: URL.createObjectURL(card.image), alt: '' }));
  if (showPhrase) out.push(h('div', { class: 'fc-box fc-box-phrase' }, phrase(card.front, pick, card.front.length > 60 ? 17 : card.front.length > 24 ? 19 : 24)));
  if (card.ipa && showIpa) out.push(h('div', { class: 'fc-box fc-box-ipa' }, h('p', { class: 'fc-ipa' }, card.ipa)));
  if (card.meaning) out.push(h('div', { class: 'fc-box fc-box-mean' }, h('p', { class: 'fc-mean', lang: 'en' }, card.meaning)));
  if (card.hint) out.push(h('p', { class: 'fc-hint' }, card.hint));
  const ctx = card.context || (card.back && card.back !== card.meaning && !/ · /.test(card.back) ? card.back : '');
  if (ctx) {
    const p = h('p', { class: 'fc-ctx', lang: 'es-AR' });
    ctx.split(new RegExp(`(${esc(card.front)})`, 'i')).forEach((part, i) => p.append(i % 2 ? h('b', {}, part) : part));
    out.push(h('div', { class: 'fc-box fc-box-ctx' }, p));
  }
  const src = card.source && card.source.label ? card.source.label : (/ · /.test(card.back || '') ? card.back : '');
  if (src) out.push(h('p', { class: 'fc-src' }, src));
  out.push(...extra.filter(Boolean));
  out.push(dict);
  return out;
}
