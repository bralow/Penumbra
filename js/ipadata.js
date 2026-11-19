// The sounds of Rioplatense Spanish (broad IPA), for the soundboard and the games.
// ar: true = a sound that marks the Buenos Aires accent.
export const SOUNDS = [
  // Vowels
  { s: 'a', group: 'Vocales', name: 'a abierta', how: 'Boca bien abierta, lengua baja y relajada. Nunca se reduce como en inglés.', ex: ['casa', 'mate', 'pan'] },
  { s: 'e', group: 'Vocales', name: 'e media', how: 'Labios estirados, lengua a media altura. Pura, sin deslizarse a "ei".', ex: ['mesa', 'leche', 'tenés'] },
  { s: 'i', group: 'Vocales', name: 'i cerrada', how: 'Lengua alta y adelante, labios estirados. Corta y tensa.', ex: ['vino', 'mirá', 'sí'] },
  { s: 'o', group: 'Vocales', name: 'o media', how: 'Labios redondeados, lengua atrás. Pura, sin deslizarse a "ou".', ex: ['todo', 'dos', 'boludo'] },
  { s: 'u', group: 'Vocales', name: 'u cerrada', how: 'Labios bien redondos y adelantados, lengua alta y atrás.', ex: ['uno', 'gusto', 'tú'] },
  { s: 'j', group: 'Vocales', name: 'semivocal i', how: 'Una i débil que se pega a otra vocal en la misma sílaba (diptongo).', ex: ['tierra', 'bien', 'hoy'] },
  { s: 'w', group: 'Vocales', name: 'semivocal u', how: 'Una u débil que se pega a otra vocal en la misma sílaba.', ex: ['bueno', 'cuatro', 'llueve'] },
  // Stops
  { s: 'p', group: 'Oclusivas', name: 'p sin aire', how: 'Labios cerrados y se abren de golpe, sin el soplo de aire del inglés "p".', ex: ['pan', 'papá', 'pibe'] },
  { s: 'b', group: 'Oclusivas', name: 'b fuerte', how: 'Labios cerrados del todo. Al principio de frase o después de m/n. B y v suenan igual.', ex: ['bondi', 'vos', 'un vaso'] },
  { s: 't', group: 'Oclusivas', name: 't dental', how: 'La punta de la lengua toca los dientes de arriba (no las encías), sin soplo de aire.', ex: ['tango', 'todo', 'tenés'] },
  { s: 'd', group: 'Oclusivas', name: 'd fuerte', how: 'Punta de la lengua contra los dientes. Al principio de frase o después de n/l.', ex: ['dale', 'donde', 'el dedo'] },
  { s: 'k', group: 'Oclusivas', name: 'k sin aire', how: 'Atrás de la lengua contra el paladar blando, sin soplo. Se escribe c, qu o k.', ex: ['casa', 'que', 'kilo'] },
  { s: 'g', group: 'Oclusivas', name: 'g fuerte', how: 'Como la k pero con voz. Al principio de frase o después de n.', ex: ['gato', 'tengo', 'un gol'] },
  // Fricatives
  { s: 'β', group: 'Fricativas', name: 'b suave', how: 'Entre vocales la b/v no cierra los labios: casi se tocan y el aire pasa.', ex: ['la vaca', 'cabeza', 'lobo'] },
  { s: 'ð', group: 'Fricativas', name: 'd suave', how: 'Entre vocales la d es suave, la lengua apenas toca los dientes, como "th" en "this".', ex: ['todo', 'nada', 'cada'] },
  { s: 'ɣ', group: 'Fricativas', name: 'g suave', how: 'Entre vocales la g no cierra: el aire pasa raspando suave atrás.', ex: ['agua', 'lago', 'la gata'] },
  { s: 'f', group: 'Fricativas', name: 'f', how: 'Dientes de arriba sobre el labio de abajo, como en inglés.', ex: ['feca', 'fiaca', 'café'] },
  { s: 's', group: 'Fricativas', name: 's', how: 'Siempre s, nunca la "z" española: casa, cena y zapato llevan [s] (seseo).', ex: ['sí', 'cena', 'zapato'] },
  { s: 'h', group: 'Fricativas', name: 's aspirada', ar: true, how: 'La s antes de consonante se convierte en un soplo suave, como una h inglesa: e[h]tá, lo[h] pibe[h].', ex: ['está', 'mismo', 'los pibes'] },
  { s: 'x', group: 'Fricativas', name: 'jota', how: 'Atrás de la lengua cerca del paladar blando, el aire raspa. Más suave que la jota de España.', ex: ['jugo', 'gente', 'mujer'] },
  { s: 'ʃ', group: 'Fricativas', name: 'sh porteña', ar: true, how: 'La ll y la y suenan como "sh" en inglés: calle = [ˈka.ʃe]. En voces mayores puede sonar [ʒ], con voz.', ex: ['calle', 'yo', 'lluvia'] },
  // Affricate
  { s: 'tʃ', group: 'Africadas', name: 'ch', how: 'Como "ch" en "church". Ojo: la ch NO se convierte en sh, solo la ll/y.', ex: ['che', 'chabón', 'leche'] },
  // Nasals
  { s: 'm', group: 'Nasales', name: 'm', how: 'Labios cerrados, el aire por la nariz. La n antes de p/b/m también suena m.', ex: ['mate', 'mina', 'un beso'] },
  { s: 'n', group: 'Nasales', name: 'n', how: 'Punta de la lengua detrás de los dientes, el aire por la nariz.', ex: ['nada', 'noche', 'pan'] },
  { s: 'ɲ', group: 'Nasales', name: 'ñ', how: 'El medio de la lengua contra el paladar, el aire por la nariz.', ex: ['año', 'mañana', 'ñoqui'] },
  { s: 'ŋ', group: 'Nasales', name: 'n velar', how: 'La n antes de k, g o j se hace atrás, como "ng" en "sing".', ex: ['tengo', 'banco', 'en casa'] },
  { s: 'ɱ', group: 'Nasales', name: 'n labiodental', how: 'La n antes de f se hace con los dientes sobre el labio, como la f.', ex: ['enfermo', 'un feca', 'lunfardo'] },
  // Liquids
  { s: 'l', group: 'Líquidas', name: 'l clara', how: 'Punta de la lengua detrás de los dientes, siempre clara (nunca la "l oscura" del inglés "ball").', ex: ['luca', 'mal', 'el'] },
  { s: 'ɾ', group: 'Líquidas', name: 'r suave', how: 'Un solo toque rápido de la punta de la lengua, como la "tt" de "butter" en inglés americano.', ex: ['pero', 'caro', 'hablar'] },
  { s: 'r', group: 'Líquidas', name: 'rr fuerte', how: 'Varios golpes de la lengua: rr, r al principio de palabra, y r después de n, l o s.', ex: ['perro', 'rápido', 'Enrique'] },
];

// Symbols that are easy to confuse, used as traps in the "Escribir" game.
export const CONFUSABLE = { 'ɾ': ['r', 'l'], r: ['ɾ'], b: ['β', 'v'], 'β': ['b'], d: ['ð'], 'ð': ['d', 'θ'], g: ['ɣ'], 'ɣ': ['g'], 'ʃ': ['ʝ', 'tʃ', 'j'], h: ['s', 'x'], s: ['h', 'θ', 'z'], x: ['h', 'k'], 'ɲ': ['n'], n: ['ɲ', 'ŋ'], 'ŋ': ['n'], j: ['i', 'ʝ'], w: ['u'], 'tʃ': ['ʃ'], e: ['ɛ'], o: ['ɔ'] };

// Word bank for the games: everyday words that show off the porteño sounds.
export const WORDS = ['calle', 'lluvia', 'ayer', 'mismo', 'después', 'ciudad', 'perro', 'pero', 'niño', 'mañana', 'colectivo', 'estadio', 'gente', 'joven',
  'trabajo', 'cerveza', 'chico', 'ella', 'playa', 'yo', 'tenés', 'querés', 'vení', 'decime', 'pibe', 'laburo', 'quilombo', 'bondi', 'guita', 'fiaca',
  'birra', 'feca', 'pucho', 'boludo', 'mate', 'yerba', 'cuchillo', 'llave', 'estás', 'buscar', 'mosca', 'rápido', 'agua', 'cada', 'tengo', 'banco',
  'enfermo', 'jugo', 'lunfardo', 'arroyo', 'pollo', 'gallina', 'caballo', 'cebolla', 'castellano', 'mayo'];

// Video of each sound (Seeing Speech, University of Glasgow / Strathclyde), in media/ipa/<file>.mp4
// with a still frame in media/ipa/<file>.jpg. Keyed by the symbol used in SOUNDS.
export const MEDIA = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', j: 'j', w: 'w', p: 'p', b: 'b', t: 't', d: 'd', k: 'k', g: 'g',
  'β': 'beta', 'ð': 'eth', 'ɣ': 'gamma', f: 'f', s: 's', h: 'h', x: 'x', 'ʃ': 'esh', 'tʃ': 'tesh',
  m: 'm', n: 'n', 'ɲ': 'enye', 'ŋ': 'eng', 'ɱ': 'mhook', l: 'l', 'ɾ': 'tap', r: 'r' };

// With "IPA detallada" on, the board shows these narrow forms on the cards.
export const NARROW_LABEL = { 'β': 'β̞', 'ð': 'ð̞', 'ɣ': 'ɣ̞', t: 't̪', d: 'd̪', 'tʃ': 't͡ʃ', j: 'j · i̯', w: 'w · u̯', a: 'a · ã', e: 'e · ẽ', i: 'i · ĩ', o: 'o · õ', u: 'u · ũ', n: 'n · n̪', l: 'l · l̪', 'ɾ': 'ɾ · ɾ̥', h: 'h · ɦ', s: 's · s̬' };

// Rioplatense variants of each sound, for "IPA detallada": [narrow symbol, where it happens, examples].
// An example is a word (transcribed by the app) or [word, transcription] when the app's rules don't cover it.
export const DETAIL = {
  a: [['ã', 'nasalizada antes de m o n en la misma sílaba: el velo baja un poco antes de la consonante', ['campo', 'santo']]],
  e: [['ẽ', 'nasalizada antes de nasal en la misma sílaba', ['tengo', 'bien']]],
  i: [['ĩ', 'nasalizada antes de nasal en la misma sílaba', ['lindo', 'tinto']]],
  o: [['õ', 'nasalizada antes de nasal en la misma sílaba', ['once', 'pongo']]],
  u: [['ũ', 'nasalizada antes de nasal en la misma sílaba', ['mundo', 'un']]],
  j: [['j', 'al principio del diptongo (creciente): la i se desliza hacia la vocal fuerte', ['bien', 'familia']],
    ['i̯', 'al final del diptongo (decreciente): una i que no forma sílaba (la marca ̯ = no silábica)', ['hoy', 'aire', 'seis']]],
  w: [['w', 'al principio del diptongo (creciente), con los labios redondos', ['bueno', 'cuatro']],
    ['u̯', 'al final del diptongo (decreciente), sin formar sílaba', ['auto', 'deuda']]],
  p: [['p', 'sin aspiración: no sale soplo después, a diferencia del inglés [pʰ]', ['pan', 'papá']]],
  b: [['b', 'oclusiva: después de pausa o de m/n', ['bondi', 'un vaso']], ['β̞', 'aproximante: en las demás posiciones (ver β)', ['la vaca', 'lobo']]],
  t: [['t̪', 'dental (la marca ̪): la punta toca la cara de atrás de los dientes de arriba, sin aspirar', ['tango', 'todo']]],
  d: [['d̪', 'dental, después de pausa, n o l', ['dale', 'donde', 'el dedo']], ['ð̞', 'aproximante entre vocales y en las demás posiciones (ver ð)', ['todo', 'nada']]],
  k: [['k', 'sin aspiración', ['casa', 'que']]],
  g: [['g', 'oclusiva, después de pausa o de n', ['gato', 'tengo']], ['ɣ̞', 'aproximante en las demás posiciones (ver ɣ)', ['lago', 'agua']]],
  'β': [['β̞', 'aproximante: los labios se acercan sin rozar (la marca ̞ = más abierta que una fricativa)', ['lobo', 'la vaca', 'cabeza']]],
  'ð': [['ð̞', 'aproximante muy suave entre vocales', ['todo', 'cada']],
    ['∅', 'en -ado y al final de palabra muchas veces desaparece en el habla rápida', [['cansado', '[kãn̪.ˈsa.o]'], ['ciudad', '[sju.ˈð̞a]']]]],
  'ɣ': [['ɣ̞', 'aproximante: la parte de atrás de la lengua se acerca al velo sin rozar', ['lago', 'agua', 'la gata']]],
  f: [['f', 'labiodental sorda, como en inglés', ['café', 'fiaca']]],
  s: [['s', 'alveolar sorda, antes de vocal', ['sí', 'casa']],
    ['s̬', 'sonorizada (la marca ̬) antes de consonante sonora, en el habla cuidada', [['desde', '[ˈd̪es̬.ð̞e]'], ['mismo', '[ˈmis̬.mo]']]],
    ['h · ɦ', 'en el habla porteña de todos los días se aspira (ver h)', ['mismo', 'desde']]],
  h: [['h', 'aspiración sorda, antes de consonante sorda', ['está', 'buscar']],
    ['ɦ', 'aspiración sonora, antes de consonante sonora', ['mismo', 'desde', 'los dedos']],
    ['∅', 'al final de frase a veces se pierde', [['vamos', '[ˈba.mo]']]]],
  x: [['x', 'velar sorda, más suave que en España', ['jugo', 'gente']], ['h', 'a veces solo un soplo, sobre todo entre vocales', [['mujer', '[mu.ˈheɾ̥]']]]],
  'ʃ': [['ʃ', 'sorda: lo más común hoy en Buenos Aires', ['calle', 'yo']], ['ʒ', 'sonora (con zumbido): más común en voces mayores', [['calle', '[ˈka.ʒe]'], ['yo', '[ʒo]']]]],
  'tʃ': [['t͡ʃ', 'africada: la barra de unión indica que el cierre y el roce son un solo sonido', ['che', 'leche']]],
  m: [['m', 'bilabial; la n antes de p, b o m también suena así', ['mate', 'un beso']]],
  n: [['n', 'alveolar, antes de vocal o al final', ['nada', 'pan']], ['n̪', 'dental, antes de t o d', ['canto', 'donde']],
    ['m · ŋ · ɱ', 'se adapta a la consonante que sigue (ver esas tarjetas)', ['un beso', 'tengo', 'enfermo']]],
  'ɲ': [['ɲ', 'palatal', ['año', 'mañana']]],
  'ŋ': [['ŋ', 'velar, antes de k, g o j', ['tengo', 'banco']]],
  'ɱ': [['ɱ', 'labiodental, antes de f', ['enfermo', 'lunfardo']]],
  l: [['l', 'alveolar y siempre clara', ['luca', 'mal']], ['l̪', 'dental, antes de t o d', ['alto', 'caldo']]],
  'ɾ': [['ɾ', 'toque simple sonoro', ['pero', 'caro']], ['ɾ̥', 'ensordecida (la marca ̥) al final de frase: casi un soplo', ['hablar', 'comer']]],
  r: [['r', 'vibrante múltiple sonora', ['perro', 'rápido']]],
};

// Diphthongs: two vowels in one syllable. The i or u is a glide: [j w] before the main vowel
// (rising, "creciente"), [i̯ u̯] after it (falling, "decreciente"). from/to: mouth shapes for the drawing.
export const DIPHTHONGS = [
  { s: 'ja', sp: 'ia', kind: 'creciente', from: 'j', to: 'a', ex: ['gracias', 'familia', 'piano'], how: 'Arrancá con la lengua alta y adelante, como para una i corta, y bajala enseguida a la a abierta. La i no es sílaba aparte: gra-cias, no gra-ci-as.' },
  { s: 'je', sp: 'ie', kind: 'creciente', from: 'j', to: 'e', ex: ['bien', 'tiempo', 'viejo'], how: 'De una i rápida a la e media: la lengua baja un poco y queda adelante. Ojo: hie- al principio suena [ʃe] en Buenos Aires: hielo [ˈʃe.lo].' },
  { s: 'jo', sp: 'io', kind: 'creciente', from: 'j', to: 'o', ex: ['radio', 'despacio', 'novio'], how: 'De una i rápida a la o: la lengua va de adelante hacia atrás y los labios se redondean al llegar a la o.' },
  { s: 'ju', sp: 'iu', kind: 'creciente', from: 'j', to: 'u', ex: ['ciudad', 'viuda', 'triunfo'], how: 'La lengua alta pasa de adelante (i) a atrás (u) sin bajar, y los labios se redondean. Suele cargar la fuerza en la u.' },
  { s: 'wa', sp: 'ua', kind: 'creciente', from: 'w', to: 'a', ex: ['cuatro', 'agua', 'guapo'], how: 'Labios redondos y lengua atrás como para una u corta, y abrí todo hacia la a. No hagas dos sílabas: cua-tro.' },
  { s: 'we', sp: 'ue', kind: 'creciente', from: 'w', to: 'e', ex: ['bueno', 'puerta', 'luego'], how: 'De una u rápida a la e: los labios se estiran y la lengua viene adelante. hue- suele sonar con un roce suave atrás: huevo [ˈɣ̞we.β̞o].' },
  { s: 'wi', sp: 'ui', kind: 'creciente', from: 'w', to: 'i', ex: ['cuidado', 'ruido', 'Luis'], how: 'Labios redondos que se estiran, lengua de atrás hacia adelante, siempre alta. La fuerza va en la i. En muy suena al revés, decreciente: [mui̯].' },
  { s: 'wo', sp: 'uo', kind: 'creciente', from: 'w', to: 'o', ex: ['cuota', 'antiguo', 'arduo'], how: 'Los labios quedan redondos todo el tiempo; la lengua baja un poco de la u a la o. Es el menos frecuente.' },
  { s: 'ai̯', sp: 'ai / ay', kind: 'decreciente', from: 'a', to: 'j', ex: ['aire', 'bailar', 'hay'], how: 'Empezá en la a bien abierta y cerrá rápido hacia una i corta que no forma sílaba. Como "eye" en inglés, pero más corto y con la a más abierta.' },
  { s: 'ei̯', sp: 'ei / ey', kind: 'decreciente', from: 'e', to: 'j', ex: ['seis', 'peine', 'ley'], how: 'De la e media sube la lengua a una i corta. Parecido a "say" en inglés, pero con una e más tensa.' },
  { s: 'oi̯', sp: 'oi / oy', kind: 'decreciente', from: 'o', to: 'j', ex: ['hoy', 'boina', 'voy'], how: 'De la o con labios redondos, la lengua va adelante y arriba y los labios se estiran: como "boy" en inglés.' },
  { s: 'au̯', sp: 'au', kind: 'decreciente', from: 'a', to: 'w', ex: ['auto', 'jaula', 'causa'], how: 'De la a abierta, la lengua sube atrás y los labios se redondean hacia una u corta: como "how" en inglés.' },
  { s: 'eu̯', sp: 'eu', kind: 'decreciente', from: 'e', to: 'w', ex: ['deuda', 'Europa', 'neumático'], how: 'De la e con labios estirados a una u corta con labios redondos: la lengua va de adelante hacia atrás. No existe en inglés: practicalo despacio.' },
  { s: 'ou̯', sp: 'ou', kind: 'decreciente', from: 'o', to: 'w', ex: ['estadounidense', 'bou'], how: 'De la o a una u corta: los labios se cierran un poco más y la lengua sube atrás. Es raro en español.' },
];
