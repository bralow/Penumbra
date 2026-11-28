// Repaso: today's review, decks, the vault, settings and creating cards by hand.
import { h, toast, pageHead, wide, openModal, closeBtn } from '../ui.js';
import { db } from '../db.js';
import { buildQueue, decks, deckStats, settings, saveSettings, TYPES, updateCard, pendingMazo, migrateMazo, fillMeanings, setDeckNewPerDay } from '../penumbra.js';
import { human } from '../fsrs.js';
import { duplicateGroups, merge } from '../cardtools.js';
import { ACTIONS, keys, setKey, resetKeys, comboOf, label } from '../hotkeys.js';

let openDeck = null; // phone: the deck open full screen
let wideDeck = null; // PC: the deck shown beside the list
const field = 'min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:16px;width:100%';
const rerender = () => window.dispatchEvent(new Event('cadencia:rerender'));
const ownNew = (d) => (Number.isInteger(d.newPerDay) && d.newPerDay >= 0 ? d.newPerDay : null);

// Long press (or right-click) on an element. The click that ends a long press is swallowed.
function onLongPress(el, fn, ms = 500) {
  let timer = 0, start = null, fired = false;
  const cancel = () => { clearTimeout(timer); timer = 0; start = null; };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    fired = false; start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => { fired = true; timer = 0; if (navigator.vibrate) navigator.vibrate(15); fn(); }, ms);
  });
  el.addEventListener('pointermove', (e) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => el.addEventListener(t, () => { if (timer) cancel(); }));
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!fired) { cancel(); fired = true; fn(); } });
  el.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; } }, true);
}

// Sheet: how many new cards this deck gives you each day.
function deckLimitSheet(d, fresh, returnTo) {
  const general = settings().newPerDay;
  const PRESETS = [0, 3, 5, 10, 15, 20, 30];
  const cur = ownNew(d);
  openModal((api) => {
    api.box.setAttribute('aria-label', `Nuevas por día en ${d.name}`);
    const choice = cur === null ? 'general' : PRESETS.includes(cur) ? String(cur) : 'custom';
    const opts = [['general', `Como los demás (comparte las ${general} por día de Ajustes)`], ...PRESETS.map((n) => [String(n), n === 0 ? '0 · pausar las nuevas de este mazo' : `${n} por día`]), ['custom', 'Personalizado…']];
    const radios = opts.map(([v, l]) => {
      const r = h('input', { type: 'radio', name: 'deck-new', value: v });
      r.checked = v === choice;
      return h('label', { class: 'dl-opt' }, r, h('span', {}, l));
    });
    const num = h('input', { type: 'number', min: '0', max: '999', step: '1', inputmode: 'numeric', value: String(cur ?? 7), class: 'dl-num', 'aria-label': 'Número personalizado de nuevas por día', hidden: choice !== 'custom' });
    const err = h('p', { class: 'small', role: 'status', style: 'color:var(--gold-text);min-height:0' });
    api.box.addEventListener('change', (e) => { if (e.target.name === 'deck-new') { num.hidden = e.target.value !== 'custom'; if (!num.hidden) { num.focus(); num.select(); } } });
    const save = h('button', { type: 'button', class: 'btn', style: 'flex:1' }, 'Guardar');
    const cancel = h('button', { type: 'button', class: 'btn ghost', style: 'flex:1' }, 'Cancelar');
    cancel.onclick = api.close;
    save.onclick = async () => {
      const v = (api.box.querySelector('input[name="deck-new"]:checked') || {}).value || 'general';
      let n = null;
      if (v === 'custom') { n = Math.round(Number(num.value)); if (!Number.isFinite(n) || n < 0 || n > 999) { err.textContent = 'Poné un número entre 0 y 999.'; return; } }
      else if (v !== 'general') n = Number(v);
      await setDeckNewPerDay(d.id, n);
      api.close();
      toast(n === null ? `${d.name}: comparte las nuevas generales` : n === 0 ? `${d.name}: nuevas en pausa` : `${d.name}: ${n} nuevas por día`);
      rerender();
    };
    num.onkeydown = (e) => { if (e.key === 'Enter') save.click(); };
    api.box.replaceChildren(
      h('div', { class: 'row', style: 'gap:12px;align-items:flex-start' },
        h('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px' },
          h('span', { class: 'kicker' }, 'NUEVAS POR DÍA'),
          h('h2', { style: 'font-size:22px;display:flex;align-items:center;gap:8px' }, h('span', { style: `width:10px;height:10px;border-radius:50%;background:${d.color};flex:none` }), d.name)),
        closeBtn(api.close)),
      h('p', { class: 'muted small', style: 'line-height:1.45' }, `Quedan ${fresh} tarjeta${fresh === 1 ? '' : 's'} nueva${fresh === 1 ? '' : 's'} en este mazo. Con un número propio, este mazo te da exactamente esas nuevas cada día, aparte de las ${general} que comparten los demás.`),
      h('div', { class: 'dl-list', role: 'radiogroup', 'aria-label': 'Nuevas por día' }, radios),
      num, err,
      h('div', { class: 'row', style: 'gap:8px' }, cancel, save));
  }, returnTo);
}

export async function render(main) {
  const [q, ds, stats] = await Promise.all([buildQueue(), decks(), deckStats()]);
  const isWide = wide();
  if (openDeck && !isWide) { const d = ds.find((x) => x.id === openDeck); if (d) return deckView(main, d); openDeck = null; }
  const total = q.reviews.length + q.fresh.length;
  const mins = Math.max(1, Math.round((total + q.counts.learning) * 8 / 60));
  const leeches = (await db.all('cards')).filter((c) => c.suspended === 'leech').length;
  if (isWide && !ds.some((d) => d.id === wideDeck)) wideDeck = (ds.find((d) => (stats.get(d.id) || {}).due) || ds[0] || {}).id || null;

  main.append(pageHead('REPETICIÓN ESPACIADA · FSRS-5', 'Mazos de Penumbra',
    leeches ? h('a', { href: '#/boveda', class: 'tag warn', style: 'min-height:40px' }, `🔒 Bóveda (${leeches})`) : null,
    newCardButton()));
  const left = h('div', { class: 'col' }), right = h('div', { class: 'col' });
  main.append(h('div', { class: 'cols list-detail' }, left, isWide && wideDeck ? right : null));

  left.append(h('section', { class: 'hero', style: 'gap:10px' },
    h('div', { class: 'between' }, h('span', { class: 'kicker' }, 'REPASO DE HOY'), total ? h('span', { class: 'small', style: 'opacity:.8' }, `≈ ${mins} min`) : ''),
    h('div', { style: 'display:flex;align-items:baseline;gap:10px' },
      h('span', { style: 'font-family:var(--display);font-size:52px;font-weight:700;line-height:1' }, String(total + q.counts.learning)),
      h('span', {}, 'tarjetas para hoy')),
    h('div', { class: 'small', style: 'opacity:.9' }, `${q.reviews.length} repaso · ${q.fresh.length} nuevas · ${q.overdue} vencidas${q.counts.learning ? ` · ${q.counts.learning} aprendiendo` : ''}`),
    h('a', { href: '#/sesion', class: 'btn', style: 'align-self:stretch;justify-content:center' }, total + q.counts.learning ? 'Empezar repaso' : 'Ver')));

  // Step 6: bring the old Mazo over.
  const pending = await pendingMazo();
  if (pending.length) left.append(migrateCard(pending));

  // Decks
  left.append(h('div', { class: 'between', style: 'margin-top:6px' }, h('span', { class: 'kicker', style: 'color:var(--muted)' }, 'TUS MAZOS ACTIVOS'), ds.length ? h('span', { class: 'muted', style: 'font-size:11px' }, 'Mantené apretado un mazo para elegir sus nuevas por día') : null));
  if (!ds.length) left.append(h('section', { class: 'card' }, h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Todavía no hay tarjetas. Tocá «+ Penumbra» o «Guardar» en cualquier módulo (Lectura, Podcast, Charla, Lunfardo…) y aparecen acá, cada una en el mazo de donde vino.')));
  for (const d of ds) {
    const s = stats.get(d.id) || { total: 0, notes: 0, due: 0, fresh: 0, leech: 0 };
    const on = isWide && d.id === wideDeck;
    const b = h('button', { type: 'button', class: `card${on ? ' selected' : ''}`, 'aria-pressed': isWide ? String(on) : null, style: 'flex-direction:row;align-items:center;gap:12px;text-align:left;cursor:pointer;font:inherit;color:inherit;padding:12px 14px' },
      h('span', { style: `width:8px;height:38px;border-radius:4px;flex:none;background:${d.color}` }),
      h('span', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px' }, h('b', { style: 'font-family:var(--display);font-size:16px' }, d.name), h('span', { class: 'muted small' }, `${s.notes} ${s.notes === 1 ? 'guardada' : 'guardadas'}${s.leech ? ` · ${s.leech} en la bóveda` : ''}`)),
      h('span', { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none' },
        h('span', { class: s.due ? 'tag' : 'tag muted', style: 'padding:3px 10px' }, `${s.due} para hoy`),
        h('span', { class: 'muted', style: 'font-size:11px' }, `+${s.fresh} nueva${s.fresh === 1 ? '' : 's'}${ownNew(d) === null ? '' : ownNew(d) === 0 ? ' · en pausa' : ` · ${ownNew(d)}/día`}`)));
    b.classList.add('deck-row');
    b.title = 'Mantené apretado (o clic derecho) para elegir cuántas nuevas por día';
    b.onclick = () => { if (wide()) wideDeck = d.id; else openDeck = d.id; rerender(); };
    onLongPress(b, () => deckLimitSheet(d, s.fresh, b));
    left.append(b);
  }

  // Vault, practice, crossword, stats
  if (leeches) left.append(h('a', { href: '#/boveda', class: 'card', style: 'flex-direction:row;align-items:center;gap:12px;text-decoration:none;color:inherit;padding:12px 14px' },
    h('span', { style: 'font-size:22px' }, '🔒'), h('span', { style: 'flex:1;display:flex;flex-direction:column' }, h('b', {}, `Bóveda · ${leeches}`), h('span', { class: 'muted small' }, 'tarjetas que fallaste muchas veces: mejoralas y reintegralas')), h('span', { class: 'muted' }, '→')));
  const nSel = h('select', { 'aria-label': 'Cuántas', style: `${field};width:auto;min-height:40px` }, [10, 20, 30, 50].map((n) => h('option', { value: n }, `${n} tarjetas`)));
  nSel.value = '20';
  const go = (set) => { location.hash = `#/sesion?modo=practica&set=${set}&n=${nSel.value}`; };
  const pbtn = (set, label, help) => { const b = h('button', { type: 'button', class: 'card', style: 'padding:10px 12px;gap:2px;text-align:left;cursor:pointer;font:inherit;color:inherit;flex:1;min-width:140px;background:var(--bg)' }, h('b', {}, label), h('span', { class: 'muted small' }, help)); b.onclick = () => go(set); return b; };
  const link = (href, label) => h('a', { href, class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none' }, label);
  left.append(h('section', { class: 'card', style: 'gap:10px' },
    h('div', { class: 'between' }, h('span', { class: 'kicker' }, 'PRÁCTICA LIBRE'), h('span', { class: 'chip' }, 'no cambia fechas')),
    h('div', { class: 'row wrap', style: 'gap:8px;align-items:stretch' }, pbtn('debiles', 'Débiles', 'las que más fallaste'), pbtn('olvidar', 'A punto de olvidar', 'las que se te están yendo'), pbtn('todo', 'Mezcla', 'de todos los mazos')),
    h('div', { class: 'row wrap', style: 'gap:8px' }, nSel),
    h('span', { class: 'kicker', style: 'margin-top:6px;color:var(--muted)' }, 'HERRAMIENTAS DEL MAZO'),
    h('div', { class: 'row wrap', style: 'gap:8px' }, link('#/crucigrama', '✏️ Crucigrama'), link('#/estadisticas', '📊 Estadísticas'), link('#/mazo', '📦 Mazo antiguo y Anki'))));

  // Settings
  let st = settings();
  const newSel = h('select', { 'aria-label': 'Nuevas por día', style: field }, [5, 10, 15, 20, 30].map((n) => h('option', { value: n }, `${n} nuevas por día`)));
  if (![5, 10, 15, 20, 30].includes(st.newPerDay)) newSel.append(h('option', { value: st.newPerDay }, `${st.newPerDay} nuevas por día`));
  newSel.value = String(st.newPerDay);
  const timerSel = h('select', { 'aria-label': 'Temporizador', style: field }, [[0, 'Sin temporizador'], [10, '10 segundos'], [20, '20 segundos'], [30, '30 segundos'], [45, '45 segundos']].map(([v, l]) => h('option', { value: v }, l)));
  timerSel.value = String(st.timer);
  newSel.onchange = () => { st = saveSettings({ newPerDay: Number(newSel.value) }); rerender(); };
  timerSel.onchange = () => { st = saveSettings({ timer: Number(timerSel.value) }); };
  left.append(h('details', { class: 'card', style: 'gap:10px' },
    h('summary', { style: 'font-weight:700;cursor:pointer' }, 'Ajustes de repaso'),
    h('div', { style: 'display:flex;flex-direction:column;gap:8px;margin-top:10px' }, newSel, timerSel, hotkeyPanel(),
      h('p', { class: 'muted small', style: 'line-height:1.4' }, `Una tarjeta pasa a la bóveda después de ${st.leech} fallas y se retira como dominada después de ${st.mastery} aciertos seguidos. El máximo entre repasos es de 6 meses.`))));

  // PC: the chosen deck's words, beside the list.
  if (isWide && wideDeck) {
    const box = h('section', { class: 'card', style: 'gap:12px;padding:20px' });
    right.append(box);
    await deckView(box, ds.find((x) => x.id === wideDeck), true);
  }
  return () => {};
}

function migrateCard(pending) {
  const tags = new Map();
  for (const r of pending) tags.set(r.tag || 'sin etiqueta', (tags.get(r.tag || 'sin etiqueta') || 0) + 1);
  const status = h('p', { class: 'small', 'aria-live': 'polite', style: 'line-height:1.45' });
  const bar = h('div', { class: 'progress', hidden: true }, h('div', { style: 'width:0' }));
  const go = h('button', { type: 'button', class: 'btn' }, `Pasar ${pending.length} a Penumbra`);
  const card = h('section', { class: 'hero', style: 'gap:10px' },
    h('span', { class: 'kicker' }, 'MAZO ANTIGUO'),
    h('b', { style: 'font-family:var(--display);font-size:22px' }, `${pending.length} tarjeta${pending.length === 1 ? '' : 's'} para pasar`),
    h('p', { class: 'small', style: 'line-height:1.45' }, `Cada una va al mazo de donde vino (${[...tags].map(([t, n]) => `${t.replace('#', '')} ${n}`).join(', ')}) y empieza como nueva. Las que ya están en Penumbra se saltean. El Mazo antiguo no se borra: sigue sirviendo para exportar a Anki.`),
    bar, status, go);
  go.onclick = async () => {
    go.disabled = true; bar.hidden = false;
    const fill = (a, b) => { bar.firstChild.style.width = `${(a / Math.max(1, b)) * 100}%`; };
    status.textContent = 'Pasando…';
    const r = await migrateMazo((a, b) => { fill(a, b); status.textContent = `Pasando… ${a} de ${b}`; });
    const names = new Map((await decks()).map((d) => [d.id, d.name]));
    status.textContent = `Listo: ${r.created} nueva${r.created === 1 ? '' : 's'}${r.skipped ? ` · ${r.skipped} ya estaba${r.skipped === 1 ? '' : 'n'}` : ''}. ${[...r.decks].map(([id, n]) => `${names.get(id)} ${n}`).join(' · ')}`;
    go.hidden = true;
    if (r.notes.length) {
      status.append(h('br'), 'Completando significados con Gemini…');
      fill(0, 1);
      try {
        const n = await fillMeanings(r.notes, (a, b) => { fill(a, b); status.lastChild.textContent = `Completando significados con Gemini… ${a} de ${b}`; });
        status.lastChild.textContent = n ? `Significados: ${n} completados.` : 'Sin clave de Gemini: los significados se pueden completar después desde el editor (✨ Revisar con IA).';
      } catch (e) { status.lastChild.textContent = `No pude completar los significados (${String(e.message || e).slice(0, 60)}). Podés hacerlo después desde el editor.`; }
    }
    const done = h('button', { type: 'button', class: 'btn ghost' }, 'Ver mis mazos');
    done.onclick = rerender;
    card.append(done);
  };
  return card;
}

function newCardButton(deckId, label = '+ Nueva tarjeta') {
  return h('a', { href: `#/tarjeta?new=1${deckId ? `&deck=${encodeURIComponent(deckId)}` : ''}`, class: 'pill', style: 'min-height:42px;display:inline-flex;align-items:center;text-decoration:none' }, label);
}

// Keyboard shortcuts (FE-04): tap an action, then press the key you want for it.
function hotkeyPanel() {
  const box = h('div', { style: 'display:flex;flex-direction:column;gap:4px;margin-top:6px' });
  const paint = () => {
    const k = keys();
    let group = '';
    box.replaceChildren();
    for (const [a, d] of Object.entries(ACTIONS)) {
      if (d.group !== group) { group = d.group; box.append(h('span', { class: 'kicker', style: 'margin-top:8px' }, group.toUpperCase())); }
      const b = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;min-width:84px;font-size:12px;font-family:ui-monospace,monospace' }, label(k[a]));
      b.onclick = () => {
        b.textContent = 'Presioná…';
        const grab = (e) => {
          const c = comboOf(e); if (!c) return;
          e.preventDefault(); e.stopPropagation(); document.removeEventListener('keydown', grab, true);
          const clash = Object.entries(keys()).find(([x, v]) => x !== a && v === c && ACTIONS[x].group === d.group);
          if (clash) toast(`«${label(c)}» ya es «${ACTIONS[clash[0]].label}»: lo cambié de lugar`), setKey(clash[0], k[a]);
          setKey(a, c); paint();
        };
        document.addEventListener('keydown', grab, true);
      };
      box.append(h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap' }, h('span', { class: 'small' }, d.label), b));
    }
    const reset = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px;align-self:flex-start;margin-top:8px' }, 'Volver a los atajos de fábrica');
    reset.onclick = () => { resetKeys(); paint(); };
    box.append(reset);
  };
  paint();
  return h('details', { style: 'margin-top:4px' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Atajos de teclado (en la PC)'), box);
}

async function deckView(main, d, embedded = false) {
  const cards = (await db.all('cards')).filter((c) => c.deck === d.id).sort((a, b) => b.created - a.created);
  const back = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, '← Mazos');
  back.onclick = () => { openDeck = null; rerender(); };
  // One row per saved word or sentence; its practice cards (read, listen, type…) are listed inside it.
  const notes = new Map();
  for (const c of cards) { if (!notes.has(c.note)) notes.set(c.note, []); notes.get(c.note).push(c); }
  if (embedded) main.append(h('div', { class: 'between', style: 'padding-bottom:12px;border-bottom:1px solid var(--line)' },
    h('div', { style: 'display:flex;flex-direction:column;gap:2px' }, h('span', { class: 'kicker' }, 'VISTA DEL MAZO'), h('h2', { style: 'font-size:22px;display:flex;align-items:center;gap:8px' }, h('span', { style: `width:10px;height:10px;border-radius:50%;background:${d.color}` }), d.name)),
    newCardButton(d.id, '+ En este mazo')));
  else main.append(h('div', { class: 'between' }, back, newCardButton(d.id)), h('h1', {}, d.name));
  const freshHere = cards.filter((c) => c.state === 'new' && !c.suspended).length;
  const own = ownNew(d);
  const limitBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:36px;font-size:12px', 'aria-haspopup': 'dialog' },
    own === null ? `Nuevas por día: como los demás (${settings().newPerDay})` : own === 0 ? 'Nuevas por día: en pausa' : `Nuevas por día: ${own}`);
  limitBtn.onclick = () => deckLimitSheet(d, freshHere, limitBtn);
  main.append(h('div', { class: 'row wrap', style: 'gap:8px;align-items:center' },
    h('span', { class: 'muted small' }, `${notes.size} ${notes.size === 1 ? 'frase o palabra' : 'frases y palabras'} · tocá una para editarla`), limitBtn));

  // Search and duplicates
  const search = h('input', { type: 'search', placeholder: 'Buscar en este mazo…', 'aria-label': 'Buscar en este mazo', style: field });
  const dupBtn = h('button', { type: 'button', class: 'pill', style: 'min-height:40px' }, 'Buscar duplicados');
  const dupBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  dupBtn.onclick = async () => {
    const groups = await duplicateGroups(d.id);
    if (!groups.length) { dupBox.replaceChildren(h('p', { class: 'small', style: 'color:var(--accent);font-weight:700' }, '✓ No hay duplicados en este mazo.')); return; }
    const all = h('button', { type: 'button', class: 'btn', style: 'min-height:42px' }, `Unir los ${groups.length} grupos`);
    all.onclick = async () => { for (const g of groups) await merge(g); toast('Duplicados unidos'); rerender(); };
    dupBox.replaceChildren(h('p', { class: 'small' }, 'Al unir, queda la que más practicaste; lo que le falte (significado, foto, audio) se toma de las otras.'),
      ...groups.map((g) => {
        const m = h('button', { type: 'button', class: 'pill', style: 'min-height:34px;font-size:12px' }, 'Unir');
        m.onclick = async () => { await merge(g); toast('Unidas'); rerender(); };
        return h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap;background:var(--soft);border-radius:12px;padding:8px 10px' }, h('span', { class: 'small', style: 'flex:1;min-width:0' }, g.map((n) => `«${n.front}»`).join(' · ')), m);
      }), all);
  };
  const link = (href, l) => h('a', { href, class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none' }, l);
  const enc = encodeURIComponent(d.id);
  main.append(h('div', { class: 'row wrap', style: 'gap:8px' }, link(`#/vista?deck=${enc}`, '👁 Vista previa'), link(`#/sesion?modo=practica&set=todo&n=20&deck=${enc}`, 'Practicar'), link(`#/crucigrama?deck=${enc}`, '✏️ Crucigrama')));
  main.append(h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, search, dupBtn), dupBox);

  const now = Date.now();
  const status = (c) => c.suspended === 'leech' ? 'en la bóveda' : c.suspended === 'mastered' ? 'dominada' : c.state === 'new' ? 'nueva' : c.due <= now ? 'para hoy' : `en ${human(c.due - now)}`;
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:10px' });
  const rows = [...notes].map(([note, sibs]) => {
    sibs.sort((a, b) => a.created - b.created);
    const c = sibs[0];
    const row = h('a', { href: `#/tarjeta?note=${encodeURIComponent(note)}`, class: 'card', style: 'gap:4px;padding:10px 12px;text-decoration:none;color:inherit' },
      h('div', { class: 'between', style: 'gap:8px;flex-wrap:nowrap' }, h('b', { style: 'flex:1;min-width:0' }, c.front),
        h('span', { class: 'muted small', style: 'white-space:nowrap' }, `${c.image ? '🖼 ' : ''}${c.audio || c.source ? '🔊 ' : ''}✎`)),
      c.meaning ? h('span', { class: 'small' }, c.meaning) : '',
      h('span', { class: 'muted small' }, sibs.map((x) => `${TYPES[x.type]}: ${status(x)}`).join(' · ')));
    row.dataset.q = `${c.front} ${c.meaning || ''} ${c.context || ''}`.toLowerCase();
    return row;
  });
  const draw = () => { const t = search.value.trim().toLowerCase(); list.replaceChildren(...rows.filter((r) => !t || r.dataset.q.includes(t)).slice(0, 300)); };
  search.oninput = draw;
  draw();
  main.append(list);
  return () => {};
}
