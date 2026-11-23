// Suprasegmentales y diacríticos: a plain-English guide to the marks in the app's IPA,
// with Rioplatense examples transcribed by the app (tap to hear them).
import { h, openModal, closeBtn } from './ui.js';
import { transcribe, narrow } from './ipa.js';
import { phoneSay, stopPhone } from './voz.js';

const det = (t) => narrow(transcribe(t));

// [mark, Spanish label, what it is and what it does (English), examples: text or [text, IPA]]
const SUPRA = [
  ['ˈ', 'Acento', 'Primary stress. It goes right before the stressed syllable: that syllable is louder, a bit longer and usually higher. In a phrase, only words with meaning get one; little words like la, de, que, me, se lean on the next word.',
    ['calle', 'café', '¿Y vos?']],
  ['.', 'Límite de sílaba', 'A syllable break. In connected speech syllables ignore word boundaries: a final consonant joins the vowel of the next word, so a sentence sounds like one long word.',
    ['los otros', 'mis amigos']],
  ['‿', 'Enlace (sinalefa)', 'Linking. Two vowels across words are said in one breath, with no gap or glottal catch. When they are the same vowel they usually fuse into one (la amiga → [la.ˈmi.ɣa]); an unstressed i or u becomes a glide (mi amigo → [mja…]).',
    ['lo hago', 'de agua', 'la amiga']],
  ['|', 'Pausa corta', 'A minor break, usually at a comma: you can take a quick breath, and the voice tends to stay up, showing more is coming.',
    ['Hace frío hoy, ¿no?']],
  ['‖', 'Pausa larga', 'A major break, at the end of a sentence: the melody finishes and you can stop.',
    ['Llegué tarde. Perdón.']],
  ['↗', 'Sube al final', 'Global rise: the pitch goes up at the end. Yes/no questions and the tag ¿no? / ¿viste? end like this. In Buenos Aires the rise often comes after a dip on the last stressed syllable.',
    ['¿Venís mañana?', 'Está bueno, ¿viste?']],
  ['↘', 'Baja al final', 'Global fall: the pitch goes down at the end. Statements, exclamations and questions with qué, cómo, dónde, cuándo… end like this.',
    ['¿Qué hacés?', 'Me voy a casa.']],
  ['ˑ', 'Vocal alargada', 'Half-long. The vowel is held a little longer. Porteños stretch the last stressed vowel before a pause: part of the sing-song, Italian-like melody of Buenos Aires.',
    ['¡Qué lindo día!', 'No pasa nada.']],
];

// How each mark is shown in its tile: on a syllable, so the small ones are visible.
const BIG = { 'ˈ': 'ˈka', '.': 'a.sa', '‿': 'o‿a', 'ˑ': 'aˑ' };

const DIA = [
  ['̪', 't̪ d̪ n̪ l̪', 'Dental', 'Bridge below = dental. The tongue tip touches the back of the upper front teeth, not the gum ridge as in English. t and d are always dental in Spanish; n and l become dental right before them.',
    ['todo', 'canto', 'alto']],
  ['̞', 'β̞ ð̞ ɣ̞', 'Más abierta', 'Lowering tack = more open. b, d, g between vowels are approximants: the lips or tongue only come close, with no friction. Softer than the English th in "this".',
    ['lobo', 'nada', 'agua']],
  ['̃', 'ã ẽ õ', 'Nasalizada', 'Tilde above = nasal vowel. Air also goes out through the nose because the soft palate drops early, before an m or n in the same syllable.',
    ['campo', 'tengo', 'un']],
  ['̯', 'i̯ u̯', 'No silábica', 'Arch below = not a syllable of its own. The i or u is a glide at the end of a diphthong: one syllable, not two.',
    ['hoy', 'auto', 'aire']],
  ['̥', 'ɾ̥', 'Sorda', 'Ring = voiceless. The vocal cords stop vibrating. A final r before a pause often fades into a breathy tap.',
    ['comer', 'hablar']],
  ['̬', 's̬', 'Sonora', 'Caret below = voiced. A sound that is normally voiceless picks up voicing from the next sound. In careful speech s before m, d, b becomes [s̬]; in everyday porteño it becomes a voiced breath [ɦ] instead.',
    [['mismo', '[ˈmis̬.mo] → [ˈmiɦ.mo]'], ['desde', '[ˈd̪es̬.ð̞e] → [ˈd̪eɦ.ð̞e]']]],
  ['͡', 't͡ʃ', 'Africada', 'Tie bar = one sound made of two: a stop released into a fricative. ch is [t͡ʃ]; note that ch does not turn into sh, only ll and y do.',
    ['che', 'leche']],
];

const RELATED = [
  ['h · ɦ', 'S aspirada', 's before a consonant becomes a breath [h] (voiceless) or [ɦ] (voiced, before m, n, l, b, d, g…).', ['está', 'los dedos']],
  ['∅', 'Sonido que se cae', 'Nothing: a sound that drops in everyday speech. Word-final d (verdad, usted), s before r (los reyes). The app simply leaves it out.', [['verdad', '[beɾ.ˈð̞a]'], ['los reyes', '[lo ˈreˑ.ʃes]']]],
  ['ʃ · ʒ', 'Sheísmo', 'll and y sound like English sh [ʃ]. Older speakers often voice it, [ʒ] as in "measure".', ['calle', 'yo']],
];

function example(e) {
  const [text, ipa] = Array.isArray(e) ? e : [e, det(e)];
  const b = h('button', { type: 'button', class: 'ig-ex', title: 'Tocá para escuchar', lang: 'es-AR' },
    h('span', { class: 'ig-w' }, '▶ ', text), h('span', { class: 'ipa' }, ipa));
  b.onclick = () => phoneSay(text.replace(/[¿?¡!]/g, ''));
  return b;
}

function row(sym, label, en, ex, big = sym) {
  return h('div', { class: 'ig-row' },
    h('div', { class: 'ig-sym', 'aria-hidden': 'true' }, big),
    h('div', { class: 'ig-body' },
      h('div', { class: 'ig-head' }, h('b', {}, label), h('span', { class: 'ig-code' }, sym)),
      h('p', { lang: 'en' }, en),
      h('div', { class: 'ig-exs' }, ...ex.map(example))));
}

export function openIpaGuide(returnTo) {
  openModal((api) => {
    api.box.classList.add('ig');
    api.box.setAttribute('aria-label', 'Suprasegmentales y diacríticos');
    const sample = '¿Y vos, qué hacés hoy?';
    api.onClose = () => stopPhone();
    api.box.replaceChildren(
      h('div', { class: 'row', style: 'gap:12px;align-items:flex-start' },
        h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px' },
          h('span', { class: 'kicker' }, 'GUÍA DE MARCAS'),
          h('h2', { style: 'font-size:22px' }, 'Suprasegmentales y diacríticos')),
        closeBtn(api.close)),
      h('p', { class: 'ig-intro', lang: 'en' }, 'Letters in IPA tell you which sounds to make. These extra marks tell you how: ',
        h('b', {}, 'suprasegmentals'), ' sit on top of whole syllables and phrases (stress, linking, pauses, melody), and ',
        h('b', {}, 'diacritics'), ' are small marks attached to one symbol that fine-tune it (where the tongue goes, voicing, nasality). Every transcription in Penumbra shows porteño speech as it is really said, so you will see these marks everywhere. Tap an example to hear it.'),
      h('div', { class: 'ig-sample' }, h('span', { class: 'sb-label' }, 'EJEMPLO COMPLETO'),
        example(sample),
        h('p', { class: 'small', lang: 'en', style: 'line-height:1.45' }, 'Read it as: "y" is unstressed and leans on [ˈβ̞oˑs]; the b is soft [β̞] because a vowel comes before it; | is the comma pause; [a.ˈse.ˈsoi̯] links hacés + hoy, with the s moving to the next vowel; ˑ stretches the last stressed vowel; ↘ the voice falls because it is a qué-question.')),
      h('h3', { class: 'ig-sec' }, 'SUPRASEGMENTALES'),
      h('p', { class: 'muted small', lang: 'en' }, 'Stress, syllables, linking, pauses and melody.'),
      ...SUPRA.map(([sym, label, en, ex]) => row(sym, label, en, ex, BIG[sym] || sym)),
      h('h3', { class: 'ig-sec' }, 'DIACRÍTICOS'),
      h('p', { class: 'muted small', lang: 'en' }, 'Small marks above or below a symbol. Shown with "IPA detallada" on (the default; switch it in Símbolos).'),
      ...DIA.map(([, sample, label, en, ex]) => row(sample, label, en, ex, sample.split(' ')[0])),
      h('h3', { class: 'ig-sec' }, 'OTROS SÍMBOLOS PORTEÑOS'),
      ...RELATED.map(([sym, label, en, ex]) => row(sym, label, en, ex, sym.split(' ')[0])));
  }, returnTo);
}
