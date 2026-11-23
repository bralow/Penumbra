// Prosody helpers for practice sentences: breath groups (where to pause), beats (stressed syllables),
// and the clause type of a sentence (for the Sombra filter and Entonación).
import { h } from './ui.js';
import { analyzeWord } from './ipa.js';

// Words that are usually unstressed in running speech (articles, clitics, most prepositions and conjunctions).
const ATONAS = new Set(('el la los las lo un una unos unas al del de a en con por para sin sobre entre hasta desde hacia según y e o u ni ' +
  'que se me te le les nos mi mis tu tus su sus si pero porque como cuando donde mientras aunque pues tan muy').split(' '));
// A long stretch usually breaks before these.
const BREAK_BEFORE = new Set('y pero porque que cuando donde aunque si mientras para sin cuando entonces o ni como'.split(' '));
const WORD = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/;

const pausePref = 'cadencia.pausas';
export const showPauses = () => { try { return localStorage.getItem(pausePref) === '1'; } catch { return false; } };
export const setShowPauses = (on) => { try { localStorage.setItem(pausePref, on ? '1' : '0'); } catch { /* ignore */ } };

// Splits a sentence into breath groups. Returns [{ words: [{ text, lead, tail, syls, stress, beat }], end: 'minor'|'major'|'' }]
export function breathGroups(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const groups = [];
  let cur = [];
  const close = (end) => { if (cur.length) { groups.push({ words: cur, end }); cur = []; } };
  tokens.forEach((tok, i) => {
    const m = tok.match(/^([^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*)([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'-]*)?(.*)$/u) || ['', tok, '', ''];
    const [, lead, core = '', tail] = m;
    const low = core.toLowerCase();
    // Long stretch without punctuation: break before a conjunction or relative, if both sides have 2+ words.
    const prev = cur.length ? cur[cur.length - 1].text.toLowerCase() : '';
    const glued = low === 'que' && /^(así|ya|para|sin|hasta|después|antes|lo|mientras|tal|ahora|siempre)$/.test(prev);
    if (cur.length >= 5 && BREAK_BEFORE.has(low) && !glued && tokens.length - i >= 2) close('minor');
    const a = core && WORD.test(core) ? analyzeWord(core) : null;
    cur.push({ text: core, lead, tail, syls: a ? a.spelling : [core], stress: a ? a.stress : 0, beat: !!a && !ATONAS.has(low) });
    if (/[.!?…;:]$/.test(tail) || /[.!?…]/.test(tail)) close('major');
    else if (/[,—–)]$/.test(tail)) close('minor');
  });
  close('');
  // The last beat of each group is the nucleus (the strongest one).
  for (const g of groups) { const beats = g.words.filter((w) => w.beat); if (beats.length) beats[beats.length - 1].nucleus = true; }
  return groups;
}

// The sentence with / and // between breath groups and the stressed syllables of content words marked.
export function prosodyLine(text, { size = 22 } = {}) {
  const p = h('p', { class: 'pros-line', lang: 'es-AR', style: `font-size:${size}px` });
  breathGroups(text).forEach((g, gi, all) => {
    const span = h('span', { class: 'pros-group' });
    g.words.forEach((w, wi) => {
      if (wi) span.append(' ');
      if (w.lead) span.append(w.lead);
      if (!w.beat) span.append(h('span', { class: 'pros-weak' }, w.text));
      else {
        const word = h('span', {});
        let i = 0;
        w.syls.forEach((s, k) => {
          const piece = w.text.slice(i, i + s.length); i += s.length;
          word.append(k === w.stress ? h('b', { class: w.nucleus ? 'pros-nuc' : 'pros-beat' }, piece) : piece);
        });
        if (i < w.text.length) word.append(w.text.slice(i));
        span.append(word);
      }
      if (w.tail) span.append(w.tail);
    });
    p.append(span);
    if (gi < all.length - 1 || g.end === 'major') p.append(h('span', { class: `pros-bar${g.end === 'major' ? ' major' : ''}`, 'aria-label': g.end === 'major' ? 'pausa larga' : 'pausa corta' }, g.end === 'major' ? ' // ' : ' / '));
  });
  return p;
}

export const pauseLegend = () => h('div', { class: 'pros-legend', role: 'note', 'aria-label': 'Leyenda' },
  h('span', {}, h('b', { class: 'pros-bar' }, '/'), 'pausa corta'),
  h('span', {}, h('b', { class: 'pros-bar major' }, '//'), 'pausa larga'),
  h('span', {}, h('b', { class: 'pros-beat' }, 'sí'), 'sílaba acentuada'),
  h('span', {}, h('b', { class: 'pros-nuc' }, 'sí'), 'golpe fuerte del grupo'),
  h('span', {}, h('span', { class: 'pros-weak' }, 'de la'), 'grises: átonas, se enlazan con la siguiente'));

// Clause type / prosodic feature of a sentence, for filters.
const QU = /^[¿¡"«]*\s*(qué|cómo|dónde|cuándo|cuánto|cuánta|cuántos|cuántas|quién|quiénes|cuál|cuáles|por qué|adónde)\b/i;
const SPOT = /[sz](?=\s*[bcdfgjklmnñpqrtvxyBCDFGJKLMNÑPQRTVXY])/g;
const LINK = /[aeiouáéíóúsnlr]\s+[aeiouáéíóúh]/gi; // word-to-word links: vowel+vowel or consonant+vowel
export const FEATURES = [
  { id: 'todas', label: 'Todas', test: () => true },
  { id: 'preguntas', label: 'Preguntas', test: (t) => /\?/.test(t) },
  { id: 'enfasis', label: 'Énfasis / Exclamaciones', test: (t) => /!/.test(t) || (/^[¿¡"«]*\s*(qué|cómo|cuánto)\b/i.test(t) && !/\?/.test(t)) || /\b(re|rebién|recontra|posta|tremendo)\b/i.test(t) },
  { id: 'aspirada', label: 'S aspirada', test: (t) => (t.match(SPOT) || []).length >= 3 },
  { id: 'rapida', label: 'Habla rápida / conectada', test: (t) => t.split(/\s+/).length >= 9 && (t.match(LINK) || []).length >= 4 },
];
export const clauseType = (t) => (/\?/.test(t) ? (QU.test(t) ? 'qu' : /,\s*¿?(no|viste|eh|sí|cierto|verdad)\?\s*$/i.test(t) ? 'tag' : 'sino') : /!/.test(t) ? 'excl' : 'decl');
