// Practicar: every practice and reading tool in one place, one card each, with what you have loaded.
// Each card opens the tool's own screen; the tools themselves are unchanged.
import { h, pageHead } from '../ui.js';
import { db } from '../db.js';
import { geminiReady } from '../gemini.js';
import { events } from '../progress.js';

const ICONS = {
  mic: '<path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  diary: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12 8h4M12 12h4"/>',
  vos: '<path d="M7 8h10M7 12h6"/><path d="M4 4h16v12H8l-4 4z"/>',
  ear: '<path d="M6 8.5a6 6 0 1 1 12 0c0 3.5-3 4.5-3 7.5a3 3 0 0 1-5.5 1.7"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-1.5 3.5"/>',
  tongue: '<path d="M4 7c4-3 12-3 16 0"/><path d="M6 10c0 6 3 10 6 10s6-4 6-10"/><path d="M12 12v4"/>',
  cut: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.5L20 18M8.5 15.5L20 6"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.6 2 3 .5-2.5.5-5.5.5-8z"/>',
  read: '<path d="M4 5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2V5z"/><path d="M8 7h8M8 11h6"/>',
  podcast: '<circle cx="12" cy="10" r="3"/><path d="M7.5 15a6.5 6.5 0 1 1 9 0M10.5 20l1.5-6 1.5 6z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  book: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6v14"/>',
  food: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 2-2 6 0 8v10"/>',
  slang: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10h6M9 14h4"/>',
  mate: '<path d="M7 8h10l-1 10a3 3 0 0 1-3 2h-2a3 3 0 0 1-3-2z"/><path d="M14 8l3-5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};
const icon = (k) => h('span', { class: 'ico', html: `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>` });

function tool({ href, ic, color, title, text, meta }) {
  return h('a', { href, class: 'tool', style: `--c:var(${color})` },
    h('div', {}, icon(ic), h('b', {}, title), h('p', {}, text)),
    h('div', { class: 'foot' }, h('span', {}, meta), h('span', { 'aria-hidden': 'true' }, '→')));
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function render(main) {
  const [clips, episodes, songs, books, diario] = await Promise.all(['clips', 'episodes', 'songs', 'books', 'diario'].map((s) => db.count(s)));
  const [{ LUNFARDO }, { RECETAS }, { TRABAS }, { CARDS }, { LENSES }, { VERBS }, { CONTRASTS }] = await Promise.all([
    import('../lunfardo.js'), import('../recetas.js'), import('../trabadata.js'), import('../culturadata.js'), import('../escribir.js'), import('../vosdata.js'), import('../pairsdata.js')]);
  const ai = geminiReady();
  const takes = events('sombra').filter((e) => e.recorded).length;
  const shows = new Set((await db.all('episodes')).map((e) => e.show));

  main.append(pageHead('HERRAMIENTAS DE EXPRESIÓN, ESCUCHA Y MEDIOS', 'Practicar',
    ai ? h('span', { class: 'tag' }, 'Clave de Gemini activa') : h('a', { href: '#/perfil', class: 'tag warn' }, 'Sin clave de Gemini · Agregar')));

  const section = (title, ...cards) => [h('h2', { class: 'kicker tool-cat' }, title), h('div', { class: 'tools' }, ...cards)];

  main.append(...section('HABLAR Y PRONUNCIAR',
    tool({ href: '#/sombra', ic: 'mic', color: '--accent', title: 'Sombra', text: 'Imitá frases de hablantes argentinos y compará tu voz con la nativa, onda por onda y en melodía.', meta: clips ? `${plural(clips, 'clip', 'clips')} · ${plural(takes, 'toma', 'tomas')}` : 'Importá los clips en Ajustes' }),
    tool({ href: '#/charla', ic: 'chat', color: '--c-green', title: 'Charla con Flor', text: 'Tu compañera porteña con IA: voseo y lunfardo, por texto o en voz en vivo.', meta: ai ? 'Gemini Live y texto' : 'Necesita la clave de Gemini' }),
    tool({ href: '#/calentamiento', ic: 'flame', color: '--c-amber', title: 'Calentamiento', text: 'Cinco frases en voz alta, dos veces cada una. Dos minutos para soltar la boca.', meta: clips ? '5 frases · 2 minutos' : 'Usa los clips de OpenSLR' }),
    tool({ href: '#/vos', ic: 'vos', color: '--c-indigo', title: 'Vos', text: 'Tenés, querés, vení, decime: el voseo del presente y del imperativo, en ráfagas cortas.', meta: plural(VERBS.length, 'verbo', 'verbos') }),
    tool({ href: '#/oido', ic: 'ear', color: '--c-cyan', title: 'Oído', text: 'Distinguí sonidos parecidos que en Buenos Aires cambian el significado.', meta: clips ? `${plural(CONTRASTS.length, 'contraste', 'contrastes')} · ${CONTRASTS.reduce((n, c) => n + c.pairs.length, 0)} pares` : 'Usa los clips de OpenSLR' }),
    tool({ href: '#/trabalenguas', ic: 'tongue', color: '--c-rose', title: 'Trabalenguas', text: 'Destrabá la lengua con trabalenguas a tres velocidades.', meta: plural(TRABAS.length, 'trabalenguas', 'trabalenguas') }),
    tool({ href: '#/elision', ic: 'cut', color: '--c-violet', title: 'Elisión', text: 'La «s» que se aspira o desaparece: escuchala en frases reales y a velocidad.', meta: clips ? 'Frases de OpenSLR' : 'Usa los clips de OpenSLR' })));

  main.append(...section('ESCRIBIR',
    tool({ href: '#/escribir', ic: 'pen', color: '--c-violet', title: 'Escribir', text: `Escribí textos cotidianos y revisalos con ${LENSES.length} lentes: ${LENSES.map((l) => l.label).join(', ')}.`, meta: `Corrección en ${LENSES.length} lentes` }),
    tool({ href: '#/diario', ic: 'diary', color: '--c-amber', title: 'Diario', text: 'Contá tu día en voz alta: la profe te escucha, corrige y te deja una versión mejorada.', meta: diario ? plural(diario, 'entrada', 'entradas') : 'Empezá hoy' })));

  main.append(...section('LEER Y ESCUCHAR',
    tool({ href: '#/leer', ic: 'read', color: '--accent', title: 'Lectura', text: 'Pegá cualquier texto y tocá las palabras para ver sílabas, sonidos y guardarlas.', meta: 'Texto o IPA' }),
    tool({ href: '#/podcast', ic: 'podcast', color: '--c-cyan', title: shows.size === 1 ? `Podcast ${[...shows][0]}` : 'Podcast', text: 'Escuchá episodios con la transcripción sincronizada palabra por palabra y guardá frases en Penumbra.', meta: episodes ? plural(episodes, 'episodio', 'episodios') : 'Importá los episodios' }),
    tool({ href: '#/canciones', ic: 'music', color: '--c-amber', title: 'Canciones', text: 'Canciones con la letra resaltada línea por línea, en tiempo real.', meta: songs ? plural(songs, 'canción', 'canciones') : 'Importá las canciones' }),
    tool({ href: '#/libros', ic: 'book', color: '--c-indigo', title: 'Libros y Cuentos', text: 'Importá tus PDF, leé cuento por cuento, consultá definiciones y guardá frases completas.', meta: books ? plural(books, 'libro', 'libros') : 'Importá un PDF' }),
    tool({ href: '#/recetas', ic: 'food', color: '--c-rose', title: 'Recetas Argentinas', text: 'Recetas tradicionales con los pasos en voseo, verbos para tocar y conversor de unidades.', meta: `${RECETAS.length} recetas · voseo` }),
    tool({ href: '#/lunfardo', ic: 'slang', color: '--c-green', title: 'Lunfardo', text: 'Voces y expresiones porteñas con significado, ejemplo y un toque para guardarlas.', meta: plural(LUNFARDO.length, 'voz', 'voces') }),
    tool({ href: '#/cultura', ic: 'mate', color: '--c-amber', title: 'Tarjeta del día', text: 'Una tarjeta de cultura por día: leela, escuchala y contestá la pregunta.', meta: `${CARDS.length} tarjetas` })));
  return () => {};
}
