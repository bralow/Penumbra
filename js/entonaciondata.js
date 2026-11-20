// Sentence tunes of Buenos Aires Spanish, by clause type. Each item can be read, heard and recorded.
// shape: how the voice moves at the end. focus (Foco only): index of the stressed word among the words.
export const TUNES = [
  {
    id: 'sino', label: 'Sí / no ↗', title: 'Preguntas de sí o no', shape: 'rise',
    how: 'La voz va bajando suave por la frase y en la última sílaba acentuada sube con fuerza hasta el final. Sin la subida, suena a afirmación.',
    items: ['¿Venís mañana?', '¿Tenés cambio para el colectivo?', '¿Querés un mate?', '¿Ya comiste?', '¿Te gustó la película?', '¿Vamos a la cancha el domingo?', '¿Lo viste a Martín?'],
  },
  {
    id: 'qu', label: 'Qué, cómo… ↘', title: 'Preguntas con qué, cómo, dónde, cuándo', shape: 'fall',
    how: 'Arranca alto en la palabra interrogativa (qué, cómo, dónde) y después baja hasta el final, como una afirmación. Si subís al final suena a sorpresa o a repregunta.',
    items: ['¿Qué hacés esta noche?', '¿Cómo te fue en el laburo?', '¿Dónde vivís ahora?', '¿Cuándo volvés de Córdoba?', '¿Por qué no viniste ayer?', '¿Cuánto sale el café?', '¿Quién trajo las facturas?'],
  },
  {
    id: 'pedido', label: 'Pedidos', title: 'Pedidos amables', shape: 'rise',
    how: 'Un pedido amable suena a pregunta: empieza un poco más alto y termina subiendo, sin golpe. Si baja seco al final, suena a orden.',
    items: ['¿Me pasás la sal?', '¿Me prestás el cargador un segundo?', '¿Podés cerrar la ventana, porfa?', '¿Me alcanzás el control?', 'Disculpá, ¿me decís la hora?', '¿Me guardás el lugar?'],
  },
  {
    id: 'tag', label: '¿no? ¿viste?', title: 'Confirmación: ¿no?, ¿viste?, ¿eh?', shape: 'rise',
    how: 'Primero una afirmación que baja, una pausita, y la coletilla sube corta y aguda: «Hace frío, ↘ ¿no? ↗». ¿Viste? pide que el otro asienta; ¿eh? suena a advertencia o complicidad.',
    items: ['Hace frío hoy, ¿no?', 'Está buenísimo este lugar, ¿viste?', 'Mañana no hay clases, ¿eh?', 'Vos sos de Rosario, ¿no?', 'Llegamos tarde otra vez, ¿viste?', 'No le digas nada a nadie, ¿eh?'],
  },
  {
    id: 'foco', label: 'Foco', title: 'Foco contrastivo: la palabra que importa', shape: 'focus',
    how: 'La palabra que contrasta (la nueva o la que corrige) lleva el pico más alto y más largo; lo que viene después queda bajito y apretado. Misma frase, otro foco, otro sentido.',
    items: [
      { text: 'Juan compró las medialunas.', focus: 0, note: 'Juan, no Pedro' },
      { text: 'Juan compró las medialunas.', focus: 1, note: 'las compró, no las hizo' },
      { text: 'Juan compró las medialunas.', focus: 3, note: 'las medialunas, no el pan' },
      { text: 'Mi hermana vive en Palermo.', focus: 1, note: 'mi hermana, no mi prima' },
      { text: 'Mi hermana vive en Palermo.', focus: 2, note: 'vive ahí, no trabaja' },
      { text: 'Mi hermana vive en Palermo.', focus: 4, note: 'en Palermo, no en Belgrano' },
      { text: 'Yo te dije el martes.', focus: 0, note: 'yo, no otra persona' },
      { text: 'Yo te dije el martes.', focus: 4, note: 'el martes, no el jueves' },
    ],
  },
];

export const itemOf = (x) => (typeof x === 'string' ? { text: x } : x);
export const TYPE_NAMES = { decl: 'Afirmación ↘', sino: 'Pregunta de sí o no ↗', qu: 'Pregunta con qué/cómo… ↘', tag: 'Confirmación (¿no?, ¿viste?) ↗', excl: 'Exclamación' };
