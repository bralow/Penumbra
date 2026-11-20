// Minimal pairs for ear training. Each pair differs in exactly one sound or in stress.
export const CONTRASTS = [
  {
    id: 'rr', label: 'r / rr', title: 'r suave o rr fuerte',
    note: 'La r simple [ɾ] es un solo toque rápido de la lengua. La rr [r] (y la r al principio de palabra) vibra varias veces.',
    pairs: [['pero', 'perro'], ['caro', 'carro'], ['para', 'parra'], ['cero', 'cerro'], ['coro', 'corro'], ['foro', 'forro'],
      ['moro', 'morro'], ['ahora', 'ahorra'], ['pera', 'perra'], ['vara', 'barra'], ['hiero', 'hierro'], ['corea', 'correa'], ['enterado', 'enterrado']],
  },
  {
    id: 'acento', label: 'Acento', title: 'dónde cae la fuerza',
    note: 'Mismas letras, otra sílaba fuerte: la tilde cambia el significado, y en los verbos muchas veces cambia el tiempo (paso = yo, ahora; pasó = él, ayer).',
    pairs: [['esta', 'está'], ['paso', 'pasó'], ['papa', 'papá'], ['sabia', 'sabía'], ['hablo', 'habló'], ['termino', 'terminó'],
      ['practico', 'practicó'], ['canto', 'cantó'], ['tomo', 'tomó'], ['llego', 'llegó'], ['miro', 'miró'], ['trabajo', 'trabajó'],
      ['continuo', 'continuó'], ['publico', 'publicó'], ['ingles', 'inglés'], ['secretaria', 'secretaría'], ['animo', 'ánimo']],
  },
  {
    id: 'ene', label: 'n / ñ', title: 'n o ñ',
    note: 'Para la ñ [ɲ] apoyás el medio de la lengua contra el paladar; para la n [n] solo la punta, detrás de los dientes.',
    pairs: [['pena', 'peña'], ['una', 'uña'], ['sueno', 'sueño'], ['cana', 'caña'], ['mono', 'moño'], ['pina', 'piña'],
      ['lena', 'leña'], ['mana', 'maña'], ['cena', 'seña']],
  },
  {
    id: 'sh', label: 'll·y / ch', title: 'sh porteña o ch',
    note: 'La ll y la y suenan [ʃ], un soplo largo y parejo, sin cierre. La ch [tʃ] arranca con un cierre corto de la lengua (como una t) y recién ahí sopla.',
    pairs: [['ella', 'echa'], ['mayo', 'macho'], ['haya', 'hacha'], ['halla', 'hacha'], ['raya', 'racha'], ['calle', 'cache'], ['callo', 'cacho'],
      ['tallo', 'tacho'], ['malla', 'macha'], ['leyes', 'leches'], ['bollo', 'bocho'], ['pollo', 'pocho']],
  },
  {
    id: 'ese', label: '-s / sin -s', title: 'con o sin s final',
    note: 'En Buenos Aires la s final antes de consonante se aspira [h] y a veces casi desaparece: «las casas» suena [lah ˈka.sah]. Escuchá ese soplito al final, o cómo cambia el artículo.',
    pairs: [['casa', 'casas'], ['cosa', 'cosas'], ['otra', 'otras'], ['toda', 'todas'], ['mucha', 'muchas'], ['una', 'unas'], ['día', 'días'],
      ['hora', 'horas'], ['año', 'años'], ['vida', 'vidas'], ['mismo', 'mismos'], ['tiene', 'tienes'], ['puede', 'puedes'], ['la', 'las'], ['lo', 'los']],
  },
  {
    id: 'oclus', label: 'b·d·g / p·t·k·r', title: 'suaves y fuertes',
    note: 'Entre vocales b, d y g se ablandan ([β ð ɣ]): casi no cierran. Ojo con no confundir la d suave de «todo» con la r de «toro», ni la b con la p (la p no vibra).',
    pairs: [['todo', 'toro'], ['cada', 'cara'], ['codo', 'coro'], ['mido', 'miro'], ['moda', 'mora'], ['peso', 'beso'], ['pata', 'bata'], ['boca', 'poca'],
      ['vino', 'pino'], ['dos', 'tos'], ['gasa', 'casa'], ['goma', 'coma'], ['dejar', 'tejar']],
  },
  {
    id: 'vocal', label: 'Vocales y diptongos', title: 'vocal o diptongo',
    note: 'Las vocales porteñas son cortas y puras; un diptongo junta dos en una sílaba (pe-na / pei-na). Escuchá si la lengua se desliza o se queda quieta.',
    pairs: [['pena', 'peina'], ['solo', 'suelo'], ['luego', 'lego'], ['causa', 'casa'], ['pausa', 'pasa'], ['veinte', 'vente'], ['reino', 'reno'],
      ['puerta', 'porta'], ['mesa', 'misa'], ['piso', 'peso'], ['luna', 'lona'], ['casa', 'cosa'], ['bien', 'ven']],
  },
];
