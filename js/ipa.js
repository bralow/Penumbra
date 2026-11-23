// Rioplatense (Buenos Aires) rule-based IPA transcriber, for colloquial connected speech.
// Broad transcription: sheísmo [ʃ], s-aspiration before consonants [h], b/d/g lenition [β ð ɣ],
// nasal place assimilation, everyday drops (s before r, word-final d, hue- → [gwe]),
// resyllabification and vowel linking across words (sinalefa, ‿), unstressed function words,
// phrase stress on content monosyllables, pauses (| ‖) and final intonation (↗ ↘).

const STRONG = new Set(['a', 'e', 'o']);
const ACCENTED = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u' };
const VOWEL_CHARS = new Set(['a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú', 'ü']);
const FRONT = new Set(['e', 'i', 'é', 'í']);
const NASALS = new Set(['m', 'n', 'ɲ', 'ŋ']);
const ONSET_CLUSTERS = new Set(['pl', 'pɾ', 'bl', 'bɾ', 'fl', 'fɾ', 'kl', 'kɾ', 'gl', 'gɾ', 'tɾ', 'dɾ']);
const LENITE = { b: 'β', d: 'ð', g: 'ɣ' };

const isVowelChar = (c) => VOWEL_CHARS.has(c);

// Turn one lowercase word into segments: { p, v (vowel), acc (written accent), src (spelling) }.
function segment(word, opts = {}) {
  const o = typeof opts === 'boolean' ? { sheismo: opts } : opts;
  const SH = o.sheismo === false ? 'ʝ' : 'ʃ'; // Buenos Aires [ʃ]; most of the Spanish-speaking world [ʝ]
  const casual = o.coloquial !== false;
  const out = [];
  let pending = '';
  const push = (p, v, src, acc = false) => { out.push({ p, v, acc, src: pending + src }); pending = ''; };
  for (let i = 0; i < word.length; i++) {
    const c = word[i], n = word[i + 1] || '', nn = word[i + 2] || '';
    const prev = out.length ? out[out.length - 1].p : '';
    if (ACCENTED[c]) { push(ACCENTED[c], true, c, true); continue; }
    if (c === 'ü') { push('u', true, c); continue; }
    if ('aeiou'.includes(c)) { push(c, true, c); continue; }
    switch (c) {
      case 'c':
        if (n === 'h') { push('tʃ', false, 'ch'); i++; }
        else if (FRONT.has(n)) push('s', false, c);
        else push('k', false, c);
        break;
      case 'l':
        if (n === 'l') { push(SH, false, 'll'); i++; } else push('l', false, c);
        break;
      case 'r':
        if (n === 'r') { push('r', false, 'rr'); i++; }
        else if (out.length === 0 || prev === 'n' || prev === 'l' || prev === 's') push('r', false, c);
        else push('ɾ', false, c);
        break;
      case 'q':
        if (n === 'u') { push('k', false, 'qu'); i++; } else push('k', false, c);
        break;
      case 'g':
        if (n === 'u' && FRONT.has(nn)) { push('g', false, 'gu'); i++; }
        else if (FRONT.has(n)) push('x', false, c);
        else push('g', false, c);
        break;
      case 'j': push('x', false, c); break;
      case 'h':
        if (i === 0 && n === 'i' && isVowelChar(nn)) { push(SH, false, 'hi'); i++; } // hielo, hierba
        else if (casual && i === 0 && n === 'u' && 'eiéí'.includes(nn)) push('g', false, c); // huevo, hueso → [ˈgwe.βo]
        else pending += c; // silent
        break;
      case 'ñ': push('ɲ', false, c); break;
      case 'v': case 'b': push('b', false, c); break;
      case 'z': push('s', false, c); break;
      case 'x': // [ks] between vowels; plain [s] (then aspirated) before a consonant or at the start
        if (casual && (i === 0 || (n && !isVowelChar(n)))) push('s', false, c);
        else { push('k', false, ''); push('s', false, c); }
        break;
      case 'p':
        if (casual && i === 0 && n === 's') pending += c; // psicólogo → [si.ˈko.lo.ɣo]
        else push(c, false, c);
        break;
      case 'y':
        if (word === 'y') push('i', true, c);
        else if (isVowelChar(n)) push(SH, false, c);
        else push('i', true, c);
        break;
      case 'w': push('w', false, c); break;
      default:
        if (/[a-zñ]/.test(c)) push(c, false, c);
    }
  }
  if (pending && out.length) out[out.length - 1].src += pending;
  return out;
}

const weakUnacc = (s) => s.v && !s.acc && (s.p === 'i' || s.p === 'u');
const strongish = (s) => STRONG.has(s.p) || s.acc;

// Split a word's segments into syllables: [{ segs, acc }]
function syllabify(segs) {
  // Group vowels into nuclei.
  const nuclei = []; // { start, end } indexes into segs (inclusive)
  for (let i = 0; i < segs.length; i++) {
    if (!segs[i].v) continue;
    const last = nuclei[nuclei.length - 1];
    if (last && last.end === i - 1) {
      const a = segs[i - 1], b = segs[i];
      const join = (weakUnacc(a) || weakUnacc(b)) && !(strongish(a) && strongish(b));
      if (join) { last.end = i; continue; }
    }
    nuclei.push({ start: i, end: i });
  }
  if (!nuclei.length) return [{ segs: segs.slice(), acc: false }];

  // Turn weak vowels next to a peak into glides.
  for (const nu of nuclei) {
    const run = segs.slice(nu.start, nu.end + 1);
    if (run.length < 2) continue;
    let peak = run.findIndex(strongish);
    if (peak < 0) peak = run.length - 1; // ui / iu: second vowel is the peak
    run.forEach((s, k) => {
      if (k !== peak && (s.p === 'i' || s.p === 'u')) { s.glide = true; }
    });
  }

  // Distribute consonants.
  const bounds = []; // syllable start index for each nucleus
  bounds.push(0);
  for (let k = 1; k < nuclei.length; k++) {
    const from = nuclei[k - 1].end + 1, to = nuclei[k].start; // consonants in [from, to)
    const cs = segs.slice(from, to).map((s) => s.p);
    let split; // number of consonants staying in the coda
    if (cs.length === 0) split = 0;
    else if (cs.length === 1) split = 0;
    else if (cs.length === 2) split = ONSET_CLUSTERS.has(cs[0] + cs[1]) ? 0 : 1;
    else split = ONSET_CLUSTERS.has(cs[cs.length - 2] + cs[cs.length - 1]) ? cs.length - 2 : cs.length - 1;
    bounds.push(from + split);
  }
  const syls = [];
  for (let k = 0; k < nuclei.length; k++) {
    const start = bounds[k], end = k + 1 < bounds.length ? bounds[k + 1] : segs.length;
    const part = segs.slice(start, end);
    syls.push({ segs: part, acc: part.some((s) => s.acc) });
  }
  return syls;
}

function stressIndex(word, syls) {
  const marked = syls.findIndex((s) => s.acc);
  if (marked >= 0) return marked;
  if (syls.length < 2) return 0;
  const last = word[word.length - 1];
  return ('aeiouns'.includes(last)) ? syls.length - 2 : syls.length - 1;
}

const segIpa = (s) => {
  if (s.glide) return s.p === 'i' ? 'j' : 'w';
  return s.p;
};

// Analyse one word for the word panel: syllables (spelling + IPA) and stress.
export function analyzeWord(raw) {
  const word = raw.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  if (!word) return null;
  const syls = syllabify(segment(word));
  const stress = stressIndex(word, syls);
  return {
    word,
    stress,
    spelling: syls.map((s) => s.segs.map((x) => x.src).join('')),
    ipa: transcribe(word),
  };
}

// Words that carry no stress of their own in running speech: articles, clitic pronouns, unstressed
// possessives, most prepositions and conjunctions, and relatives without a written accent.
export const ATONAS = new Set(('el la los las lo le les me te se nos os mi mis tu tus su sus al del de a en con por para sin ' +
  'sobre entre hasta desde hacia según y e o u ni que si pero porque como cuando donde mientras aunque pues').split(' '));
const WH = /^(qué|quién|quiénes|cómo|dónde|adónde|cuándo|cuál|cuáles|cuánto|cuánta|cuántos|cuántas)$/;

// The rules, in the order the Transformador shows them. All are on by default.
export const RULE_KEYS = ['sheismo', 'aspira', 'coloquial', 'suaves', 'nasal', 'enlace', 'sinalefa', 'acento', 'tonos'];

// Transcribe a phrase or passage as a porteño says it in connected, everyday speech.
// opts turns individual rules off (see RULE_KEYS): sheismo (ll/y → ʃ), aspira (s → h before consonants),
// coloquial (everyday drops: s before r, word-final d, hue- → gwe, x/ps- → s), suaves (b d g → β ð ɣ),
// nasal (n takes the place of the next consonant), enlace (final consonant + next vowel),
// sinalefa (vowels across words join: la‿amiga → [la.ˈmi.ɣa], mi amigo → [mja.ˈmi.ɣo], else ‿),
// acento (function words unstressed, content monosyllables stressed), tonos (↗ ↘ at the end of a sentence).
export function transcribe(text, opts = {}) { return run(text, opts).ipa; }

// Same, plus where each written word ended up in the transcription: words[i] = { word, start, end } (string offsets).
export function transcribeWords(text, opts = {}) { return run(text, opts); }

function run(text, opts) {
  const o = Object.fromEntries(RULE_KEYS.map((k) => [k, opts[k] !== false]));
  // Tokenize into words, pause marks and sentence starts (¿ ¡).
  const tokens = [];
  const re = /([a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+)|([,;:—])|([.!?…])|([¿¡])/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) tokens.push({ word: m[1].toLowerCase(), raw: m[1] });
    else if (m[2]) tokens.push({ pause: '|' });
    else if (m[3]) tokens.push({ pause: m[3] === '…' ? '|' : '‖', end: m[3] });
    else tokens.push({ open: m[4] });
  }
  const nWords = tokens.filter((t) => t.word).length;
  const phrase = nWords > 1;

  // Pause groups of words, each word a list of syllables; remember where each sentence (question) began.
  const groups = [];
  const allWords = [];
  let cur = { words: [], pause: null, tone: '' };
  let sentenceStart = 0; // index into allWords of the current sentence's first word
  const tone = (end) => {
    if (end === '?') {
      // A question word at the start of the question, after a leading y/e/pero, or at the start of its last
      // stretch ("¿Y vos, qué hacés?") makes it a qué-question: the voice falls.
      const isWh = (i) => { const a = allWords[i], b = allWords[i + 1]; return !!a && (WH.test(a.word) || (a.word === 'por' && !!b && b.word === 'qué')); };
      const lead = allWords[sentenceStart] && /^(y|e|pero|che)$/.test(allWords[sentenceStart].word);
      const lastStart = cur.words.length ? cur.words[0].idx : allWords.length;
      return isWh(sentenceStart) || (lead && isWh(sentenceStart + 1)) || (lastStart > sentenceStart && isWh(lastStart)) ? '↘' : '↗';
    }
    return end === '.' || end === '!' ? '↘' : '';
  };
  for (const t of tokens) {
    if (t.word) {
      const syls = syllabify(segment(t.word, o));
      const n = syls.length;
      const st = stressIndex(t.word, syls);
      const written = /[áéíóú]/.test(t.word);
      // Stressed in the phrase? Content words yes; function words only with a written accent (qué, cómo, él, sí, mí).
      const stressed = !o.acento ? n > 1 : !phrase ? n > 1 : (written || !ATONAS.has(t.word));
      syls.forEach((sy, i) => { sy.st = stressed && i === st; });
      const w = { word: t.word, syls, link: ' ', idx: allWords.length };
      cur.words.push(w); allWords.push(w);
    } else if (t.open) {
      sentenceStart = allWords.length;
    } else if (cur.words.length) {
      cur.pause = t.pause; if (o.tonos && t.end) cur.tone = tone(t.end);
      groups.push(cur); cur = { words: [], pause: null, tone: '' };
      if (t.end) sentenceStart = allWords.length;
    } else if (groups.length && t.pause === '‖') {
      const g = groups[groups.length - 1];
      g.pause = '‖'; if (o.tonos && t.end && !g.tone) g.tone = tone(t.end);
      if (t.end) sentenceStart = allWords.length;
    }
  }
  if (cur.words.length) groups.push(cur);

  const parts = [];
  const spans = new Map(); // word idx -> [start, end]
  let out = '[';
  const emit = (str) => { out += str; };
  groups.forEach((g, gi) => {
    // Flatten to segments with word positions for the sound rules.
    const flat = [];
    g.words.forEach((w, wi) => w.syls.forEach((sy) => sy.segs.forEach((seg) => flat.push({ seg, wi }))));
    const lastOf = (wi) => { const w = g.words[wi]; const sy = w.syls[w.syls.length - 1]; return sy.segs[sy.segs.length - 1]; };
    const startsWithVowel = (wi) => wi < g.words.length && g.words[wi].syls[0].segs[0] && g.words[wi].syls[0].segs[0].v;

    for (let i = 0; i < flat.length; i++) {
      const s = flat[i].seg;
      if (s.v) continue;
      const next = flat[i + 1] ? flat[i + 1].seg : null;
      if (o.nasal && s.p === 'n' && next && !next.v) {
        if (['p', 'b', 'm'].includes(next.p)) s.out = 'm';
        else if (['k', 'g', 'x'].includes(next.p)) s.out = 'ŋ';
        else if (next.p === 'f') s.out = 'ɱ';
        else if (['tʃ', 'ʃ', 'ɲ', 'ʝ'].includes(next.p)) s.out = 'ɲ';
      }
      if (s.p === 's' && next && !next.v) {
        if (o.coloquial && (next.p === 'r' || next.p === 'ɾ')) s.out = ''; // los reyes → [lo ˈre.ʃes], Israel
        else if (o.aspira) s.out = 'h';
      }
      // Word-final d of a longer word drops (verdad, usted, ciudad), unless a vowel follows and it links on.
      if (o.coloquial && s.p === 'd' && s === lastOf(flat[i].wi) && g.words[flat[i].wi].syls.length > 1 && !(next && next.v && flat[i + 1].wi !== flat[i].wi)) s.out = '';
    }
    for (let i = 0; i < flat.length; i++) {
      const s = flat[i].seg;
      if (!o.suaves || !LENITE[s.p] || s.out === '') continue;
      let k = i - 1;
      while (k >= 0 && flat[k].seg.out === '') k--; // a dropped sound doesn't block
      const prev = k >= 0 ? flat[k].seg : null;
      const prevOut = prev ? (prev.out || segIpa(prev)) : null;
      const stop = !prev || NASALS.has(prevOut) || (s.p === 'd' && prevOut === 'l');
      if (!stop) s.out = LENITE[s.p];
    }

    // Enlace: a final consonant joins the next word's vowel.
    for (let wi = 0; o.enlace && wi < g.words.length - 1; wi++) {
      const a = g.words[wi], b = g.words[wi + 1];
      if (!a.syls.length) continue;
      const lastSyl = a.syls[a.syls.length - 1];
      const tail = lastSyl.segs[lastSyl.segs.length - 1];
      const head = b.syls[0].segs[0];
      if (tail && !tail.v && tail.out !== '' && head && head.v && lastSyl.segs.some((x) => x.v)) {
        lastSyl.segs.pop();
        b.syls[0].segs.unshift(tail);
        a.link = '.';
      }
    }

    // Sinalefa: vowel + vowel across words.
    for (let wi = 0; o.sinalefa && wi < g.words.length - 1; wi++) {
      const a = g.words[wi], b = g.words[wi + 1];
      if (!a.syls.length || !startsWithVowel(wi + 1)) continue;
      const A = a.syls[a.syls.length - 1], B = b.syls[0];
      const v1 = A.segs[A.segs.length - 1], v2 = B.segs[0];
      if (!v1 || !v1.v) continue;
      if (v1.glide) { a.link = '‿'; continue; } // hoy es → [oj‿es]
      let merged = null;
      if (v1.p === v2.p && !(A.st && B.st)) { A.segs.pop(); merged = true; } // la amiga → [la.ˈmi.ɣa]
      else if (!A.st && (v1.p === 'i' || v1.p === 'u')) { v1.glide = true; merged = true; } // mi amigo → [mja.ˈmi.ɣo]
      else if (!B.st && (v2.p === 'i' || v2.p === 'u') && !v2.glide && STRONG.has(v1.p) && !(B.segs[1] && B.segs[1].v)) { v2.glide = true; merged = true; } // la idea → [laj.ˈðe.a]
      if (merged) {
        const syl = { segs: [...A.segs, ...B.segs], st: A.st || B.st };
        a.syls.pop(); b.syls[0] = syl;
        a.link = '.';
      } else a.link = '‿'; // two vowels said in one breath, without a break: lo‿ˈa.ɣo
    }

    // Render, keeping track of where each word lands.
    if (gi) emit(' ');
    let prevWord = null;
    g.words.forEach((w) => {
      w.syls.forEach((sy, si) => {
        if (prevWord !== null) emit(prevWord === w ? '.' : prevWord.link);
        const start = out.length;
        emit((sy.st ? 'ˈ' : '') + sy.segs.map((x) => (x.out !== undefined ? x.out : segIpa(x))).join(''));
        const sp = spans.get(w.idx);
        spans.set(w.idx, sp ? [sp[0], out.length] : [start, out.length]);
        prevWord = w;
      });
    });
    if (g.tone) emit(g.tone);
    if (g.pause && gi < groups.length - 1) emit(' ' + g.pause);
  });
  out += ']';
  const words = allWords.map((w) => { const sp = spans.get(w.idx); return { word: w.word, start: sp ? sp[0] : -1, end: sp ? sp[1] : -1 }; });
  return { ipa: out, words };
}

// Narrow ("detailed") Rioplatense transcription, from the broad one: approximants with the lowering
// tack (β̞ ð̞ ɣ̞), dental t d and n l before them (t̪ d̪ n̪ l̪), voiced aspiration before voiced consonants (ɦ),
// nasalized vowels before a nasal in the same syllable (ã), non-syllabic glides at the end of a diphthong
// (i̯ u̯), devoiced r at the end of a phrase (ɾ̥), the tie bar in the affricate (t͡ʃ), and in phrases the
// half-long stressed vowel of the last stressed syllable before a pause (ˑ), the drawn-out nucleus typical of porteño melody.
export function narrow(ipa) {
  const TS = '\u0001';
  let out = ipa
    .replace(/tʃ/g, TS)
    .replace(/([βðɣ])/g, '$1̞')
    .replace(/([nl])(?=[.ˈ ‿]*[td])/g, '$1̪')
    .replace(/([td])/g, '$1̪')
    .replace(/h(?=[.ˈ ‿]*[bβdðgɣmnɲŋɱlɾrjw])/g, 'ɦ')
    .replace(/([aeiou])(?=[nmŋɲɱ](?![aeiou̪]*[aeiou]))/g, '$1̃')
    .replace(/([aeiou]̃?)j(?![aeiou])/g, '$1i̯')
    .replace(/([aeiou]̃?)w(?![aeiou])/g, '$1u̯')
    .replace(/ɾ(?=[↗↘]?(?: [|‖]|\]$))/g, 'ɾ̥')
    .replace(new RegExp(TS, 'g'), 't͡ʃ');
  if (/[ ‿↗↘]/.test(out)) {
    // Each stretch up to a pause: lengthen the vowel of its last stressed syllable.
    out = out.replace(/[^|‖[\]]+/g, (chunk) => {
      const k = chunk.lastIndexOf('ˈ');
      if (k < 0) return chunk;
      const rest = chunk.slice(k).replace(/([aeiou][̃]?)/, '$1ˑ');
      return chunk.slice(0, k) + rest;
    });
  }
  return out;
}

// "IPA detallada": the narrow transcription, with diacritics, everywhere in the app. On unless turned off.
const DET = 'cadencia.ipa.detallada';
export const detailedIPA = () => { try { return localStorage.getItem(DET) !== '0'; } catch { return true; } };
export const setDetailedIPA = (on) => { try { localStorage.setItem(DET, on ? '1' : '0'); } catch { /* ignore */ } };

// What the app shows: colloquial connected speech, detailed or broad per the setting.
export const ipaFor = (text, det = detailedIPA()) => (det ? narrow(transcribe(text)) : transcribe(text));

// The phrase's transcription plus each word's place in it (offsets into the shown string).
export function ipaWords(text, det = detailedIPA()) {
  const r = run(text, {});
  if (!det) return r;
  const wide = narrow(r.ipa);
  // narrow() only adds marks after a base sound (combining diacritics, ˑ, the tie bar) or swaps one base
  // sound for another (h → ɦ, ɾ → ɾ̥), so the base sounds line up one to one.
  const map = new Array(r.ipa.length + 1);
  let k = 0;
  const extra = (c) => /[̀-ͯˑ]/.test(c);
  for (let i = 0; i < r.ipa.length; i++) {
    map[i] = k; k++;
    while (k < wide.length && extra(wide[k])) k++;
  }
  map[r.ipa.length] = wide.length;
  return { ipa: wide, words: r.words.map((w) => (w.start < 0 ? w : { ...w, start: map[w.start], end: map[w.end] })) };
}
