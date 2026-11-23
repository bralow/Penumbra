import { h, toast, LEVELS, pageHead } from '../ui.js';
import { getVoz, setVoz, listVoices, spanish, pickVoice, phoneSay } from '../voz.js';
import { getSettings, setSetting, validHex } from '../settings.js';
import { db, persist } from '../db.js';
import { importPack } from '../podcast.js';
import { APP_VERSION } from '../app.js';
import { getTts, setTts, VOICES, argentineAudio } from '../tts.js';
import { Player } from '../audio.js';
import { getGemini, setGemini, testKey } from '../gemini.js';
import { HOY_BLOCKS } from './hoy.js';
import { backupFile, restoreFile, driveConfig, setDriveConfig, driveConnected, signIn, syncNow, disconnect, syncState, BUILT_IN_CLIENT_ID } from '../sync.js';
import { settings as penSettings, saveSettings as savePen } from '../penumbra.js';

function pillGroup(label, options, value, onPick, { cls = 'grid6', goal = false, fmt = (x) => x } = {}) {
  const btns = options.map((o) => h('button', { type: 'button', class: 'pill' + (goal ? ' goal' : ''), 'aria-pressed': String(o === value) }, fmt(o)));
  btns.forEach((b, i) => { b.onclick = () => { btns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); onPick(options[i]); }; });
  return [h('h3', { style: 'font-size:15px;font-weight:700' }, label), h('div', { class: cls, role: 'group', 'aria-label': label }, btns)];
}

export async function render(main) {
  const s = getSettings();
  main.append(pageHead('AJUSTES Y DATOS LOCALES', 'Perfil y configuración', h('span', { class: 'tag' }, `Versión ${APP_VERSION.split(' ')[0]}`)));
  // Layout: two compact cards on top (level, speed), Metas across the full width, then two columns:
  // appearance and voice on the left, the utility cards (Gemini, clips, sync) on the right.
  const top = h('div', { class: 'aj-pair' });
  const metasSlot = h('div', {});
  const left = h('div', { class: 'aj-col' }), right = h('div', { class: 'aj-col' });
  main.append(top, metasSlot, h('div', { class: 'aj-cols' }, left, right));
  const grid = { append: (...els) => left.append(...els) };

  const selectEl = (label, options, value, fmt = (x) => x) => {
    const sel = h('select', { class: 'aj-select', 'aria-label': label }, ...options.map((o) => h('option', { value: o }, fmt(o))));
    sel.value = value;
    return sel;
  };
  const fieldWrap = (label, control, extra = null) => h('div', { class: 'aj-field' }, h('span', { class: 'aj-label' }, label), control, extra);

  // Nivel y meta: two selects side by side and a badge.
  const lvl = selectEl('Nivel actual', LEVELS, s.level);
  const goalSel = selectEl('Meta', LEVELS, s.goal);
  const badge = h('span', { class: 'aj-badge', 'aria-live': 'polite' });
  const paintBadge = () => { badge.textContent = `${lvl.value} → ${goalSel.value}`; badge.classList.toggle('warn', LEVELS.indexOf(goalSel.value) < LEVELS.indexOf(lvl.value)); badge.title = badge.classList.contains('warn') ? 'La meta está por debajo de tu nivel' : ''; };
  lvl.onchange = () => { setSetting('level', lvl.value); paintBadge(); };
  goalSel.onchange = () => { setSetting('goal', goalSel.value); paintBadge(); };
  paintBadge();
  top.append(h('section', { class: 'card aj-card' },
    h('div', { class: 'aj-head' }, h('h3', {}, 'Nivel y meta'), badge),
    h('div', { class: 'aj-two' }, fieldWrap('Nivel actual', lvl), fieldWrap('Meta', goalSel)),
    h('p', { class: 'muted small aj-note' }, 'Tu nivel elige qué frases te tocan en Sombra: las de tu nivel y las de un nivel arriba o abajo.')));

  // Velocidad inicial: a smooth slider from 0.25x to 2x.
  const fmtSpeed = (v) => `${Number(v).toFixed(2)}x`;
  const startSpeed = Math.min(2, Math.max(0.25, parseFloat(s.speed) || 1));
  const speedOut = h('output', { class: 'aj-badge' }, fmtSpeed(startSpeed));
  const speedIn = h('input', { type: 'range', min: '0.25', max: '2', step: '0.05', value: String(startSpeed), class: 'aj-range', 'aria-label': 'Velocidad inicial', 'aria-valuetext': fmtSpeed(startSpeed) });
  const saveSpeed = (v) => { const x = Math.round(Math.min(2, Math.max(0.25, v)) * 100) / 100; speedIn.value = String(x); speedOut.textContent = fmtSpeed(x); speedIn.setAttribute('aria-valuetext', fmtSpeed(x)); setSetting('speed', String(x)); paintTicks(); };
  speedIn.oninput = () => { speedOut.textContent = fmtSpeed(speedIn.value); speedIn.setAttribute('aria-valuetext', fmtSpeed(speedIn.value)); };
  speedIn.onchange = () => saveSpeed(parseFloat(speedIn.value));
  const ticks = [[0.25, '0.25x'], [1, '1.0x'], [2, '2.0x']].map(([v, l]) => { const b = h('button', { type: 'button', class: 'aj-tick', 'aria-label': `Velocidad ${l}` }, l); b.onclick = () => saveSpeed(v); return [v, b]; });
  function paintTicks() { ticks.forEach(([v, b]) => b.setAttribute('aria-pressed', String(Math.abs(parseFloat(speedIn.value) - v) < 0.001))); }
  paintTicks();
  top.append(h('section', { class: 'card aj-card' },
    h('div', { class: 'aj-head' }, h('h3', {}, 'Velocidad inicial'), speedOut),
    speedIn,
    h('div', { class: 'aj-ticks' }, ...ticks.map(([, b]) => b)),
    h('p', { class: 'muted small aj-note' }, 'Con la que arranca el audio nativo en Sombra. Después la cambiás en cada práctica.')));

  // Appearance: accent, density, your name, which blocks Hoy shows. (Light/dark is the button in the top bar.)
  // Accent: quick presets or any colour of your own (picker or #hex). The whole app follows it.
  const ACCENTS = [['cian', 'Cian', '#2AB4D6'], ['azul', 'Azul', '#8FA8FF'], ['menta', 'Menta', '#5EEAD4'], ['ambar', 'Ámbar', '#FFB86B'], ['lila', 'Lila', '#E9A8FF']];
  const cur = () => getSettings().accent || 'cian';
  const swatches = ACCENTS.map(([k, l, c]) => {
    const b = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(cur() === k), style: 'display:flex;align-items:center;gap:6px;justify-content:center;min-width:0;border-radius:12px' },
      h('span', { style: `width:14px;height:14px;border-radius:50%;background:${c};flex:none` }), l);
    b.onclick = () => { setSetting('accent', k); paintAccent(); };
    return b;
  });
  const startHex = validHex(s.accentHex) ? s.accentHex.toUpperCase() : '#2AB4D6';
  const picker = h('input', { type: 'color', value: startHex.toLowerCase(), 'aria-label': 'Elegir color', style: 'display:block;width:46px;height:46px;padding:0;border:1px solid var(--line);border-radius:12px;background:none;cursor:pointer;flex:none' });
  const hexIn = h('input', { type: 'text', value: startHex, maxlength: '7', 'aria-label': 'Color en hexadecimal', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters',
    style: 'min-height:46px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:15px;width:110px;font-family:ui-monospace,monospace' });
  const customBtn = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(cur() === 'custom'), style: 'min-height:46px;border-radius:12px' }, 'Usar mi color');
  const preview = h('span', { class: 'muted small', style: 'line-height:1.4' });
  const useCustom = (hex) => { if (!validHex(hex)) { preview.textContent = 'Escribí un color como #2AB4D6.'; return; } setSetting('accentHex', hex.toUpperCase()); setSetting('accent', 'custom'); paintAccent(); };
  picker.oninput = () => { hexIn.value = picker.value.toUpperCase(); useCustom(picker.value); };
  hexIn.onchange = () => { let v = hexIn.value.trim(); if (!v.startsWith('#')) v = `#${v}`; if (validHex(v)) { picker.value = v.toLowerCase(); hexIn.value = v.toUpperCase(); } useCustom(v); };
  hexIn.onkeydown = (e) => { if (e.key === 'Enter') hexIn.onchange(); };
  customBtn.onclick = () => useCustom(hexIn.value.startsWith('#') ? hexIn.value : `#${hexIn.value}`);
  function paintAccent() {
    const a = cur();
    swatches.forEach((x, i) => x.setAttribute('aria-pressed', String(ACCENTS[i][0] === a)));
    customBtn.setAttribute('aria-pressed', String(a === 'custom'));
    const st = getSettings();
    preview.textContent = a === 'custom' ? `Tu color: ${st.accentHex}. En modo claro se oscurece un poco si hace falta para que el texto se lea bien.` : 'Elegí uno de la lista o tu propio color.';
  }
  paintAccent();
  const accentBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
    h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px' }, swatches),
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;align-items:center' }, picker, hexIn, customBtn), preview);
  const name = h('input', { type: 'text', value: s.name || '', placeholder: 'Para el saludo de Hoy', 'aria-label': 'Tu nombre', autocomplete: 'given-name',
    style: 'min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:15px;width:100%' });
  name.onchange = () => setSetting('name', name.value.trim());
  const hiddenSet = new Set(s.hoyHidden || []);
  const blockBoxes = Object.entries(HOY_BLOCKS).map(([k, l]) => {
    const cb = h('input', { type: 'checkbox' }); cb.checked = !hiddenSet.has(k);
    cb.onchange = () => { if (cb.checked) hiddenSet.delete(k); else hiddenSet.add(k); setSetting('hoyHidden', [...hiddenSet]); };
    return h('label', { style: 'display:flex;gap:10px;align-items:center;min-height:36px;cursor:pointer' }, cb, l);
  });
  grid.append(h('section', { class: 'card' },
    h('span', { class: 'kicker' }, 'APARIENCIA'),
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Color del tema'), accentBox,
    pillGroup('Densidad', ['comoda', 'compacta'], s.density || 'comoda', (v) => setSetting('density', v), { cls: 'grid3', fmt: (x) => ({ comoda: 'Cómoda', compacta: 'Compacta' })[x] }),
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Tu nombre'), name,
    h('details', {}, h('summary', { style: 'font-weight:700;cursor:pointer;font-size:15px' }, 'Qué muestra Hoy'), h('div', { style: 'display:flex;flex-direction:column;margin-top:6px' }, blockBoxes))));

  // Goals (FE-07): shown as meters on Hoy.
  const g = { reviews: 30, streak: 30, ...(s.goals || {}) };
  const pen = penSettings();
  const setGoal = (k, v) => { g[k] = v; setSetting('goals', { ...g }); };
  // Each goal is a select with a few common values and «Personalizado…», which shows a number box.
  const goalPicker = (label, presets, value, max, onSave) => {
    const CUSTOM = 'custom';
    const isPreset = presets.includes(Number(value));
    const sel = h('select', { class: 'aj-select', 'aria-label': label },
      ...presets.map((n) => h('option', { value: String(n) }, String(n))), h('option', { value: CUSTOM }, 'Personalizado…'));
    sel.value = isPreset ? String(value) : CUSTOM;
    const num = h('input', { type: 'number', min: '1', max: String(max), step: '1', inputmode: 'numeric', value: String(value), class: 'aj-num', 'aria-label': `${label}: número personalizado`, hidden: isPreset });
    const err = h('span', { class: 'aj-err', role: 'status' });
    const commit = () => {
      const n = Math.round(Number(num.value));
      if (!Number.isFinite(n) || n < 1 || n > max) { err.textContent = `Entre 1 y ${max}.`; return; }
      err.textContent = ''; num.value = String(n); onSave(n);
    };
    sel.onchange = () => {
      if (sel.value === CUSTOM) { num.hidden = false; num.focus(); num.select(); return; }
      num.hidden = true; err.textContent = ''; num.value = sel.value; onSave(Number(sel.value));
    };
    num.onchange = commit;
    num.onkeydown = (e) => { if (e.key === 'Enter') commit(); };
    return h('div', { class: 'aj-field' }, h('span', { class: 'aj-label', 'aria-hidden': 'true' }, label), sel, num, err);
  };
  const retBtns = ['0.85', '0.9', '0.95'].map((v) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(String(pen.retention) === v) }, `${Math.round(Number(v) * 100)}%`));
  retBtns.forEach((b, i) => { b.onclick = () => { retBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); savePen({ retention: Number(['0.85', '0.9', '0.95'][i]) }); }; });
  metasSlot.append(h('section', { class: 'card aj-card' },
    h('div', { class: 'aj-head' }, h('h3', {}, 'Metas'), h('span', { class: 'muted small' }, 'Se ven como medidores en Hoy')),
    h('div', { class: 'aj-three' },
      goalPicker('Repasos por día', [10, 20, 30, 50, 100], g.reviews, 9999, (n) => setGoal('reviews', n)),
      goalPicker('Tarjetas nuevas por día', [5, 10, 15, 20, 30], pen.newPerDay, 999, (n) => savePen({ newPerDay: n })),
      goalPicker('Meta de racha (días)', [7, 30, 100, 365], g.streak, 9999, (n) => setGoal('streak', n))),
    h('div', { class: 'aj-ret' }, h('span', { class: 'aj-label' }, 'Retención buscada'), h('div', { class: 'aj-seg', role: 'group', 'aria-label': 'Retención buscada' }, retBtns),
      h('span', { class: 'muted small', style: 'flex:1;min-width:200px;line-height:1.35' }, 'Cuánto querés recordar al repasar. Más alta = repasos más seguidos. 90% es el equilibrio habitual.'))));

  // Argentine voice (Azure)
  const tts = getTts();
  const field = (label, id, value, attrs = {}) => [
    h('label', { for: id, class: 'small', style: 'font-weight:600' }, label),
    h('input', { id, value, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', ...attrs,
      style: 'min-height:48px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:15px;width:100%' })];
  const keyField = field('Clave (Key 1)', 'ttskey', tts.key, { type: 'password' });
  const regionField = field('Región (Location/Region)', 'ttsregion', tts.region, { placeholder: 'por ejemplo: eastus' });
  const ttsStatus = h('p', { class: 'small', role: 'status' });
  const voicePills = pillGroup('Voz', VOICES.map((v) => v.id), tts.voice, (v) => setTts({ voice: v }), { cls: 'grid3', fmt: (id) => VOICES.find((v) => v.id === id).label });
  const testPlayer = new Player();
  const testBtn = h('button', { type: 'button', class: 'btn' }, 'Guardar y probar');
  testBtn.onclick = async () => {
    setTts({ key: keyField[1].value.trim(), region: regionField[1].value.trim() });
    ttsStatus.textContent = 'Probando…';
    try {
      testPlayer.load(await argentineAudio('¡Hola, che! ¿Todo bien?', { force: true }));
      await testPlayer.play();
      ttsStatus.textContent = '¡Funciona! Escuchar en Leer ya usa la voz argentina.';
    } catch (err) {
      ttsStatus.textContent = 'No funcionó: ' + (err.message || err);
    }
  };
  const SHOW_VOICE = false; // Azure voice setup is parked until the user wants it
  if (SHOW_VOICE) grid.append(h('section', { class: 'card' },
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Voz argentina'),
    h('p', { class: 'muted small', style: 'line-height:1.4' }, 'Para que Escuchar hable con acento argentino. Usa Azure (gratis hasta 500.000 caracteres por mes). Sin clave, usa la voz del teléfono.'),
    keyField, regionField, voicePills, testBtn, ttsStatus));

  // Voice for reading aloud: the phone's own (e.g. Vox Sherpa · Daniela) or Flor (Gemini).
  const vz = getVoz();
  const vSel = h('select', { 'aria-label': 'Voz del teléfono', style: 'width:100%;min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);padding:0 10px;font-size:15px' });
  const vStatus = h('p', { class: 'small', role: 'status', style: 'line-height:1.4' });
  const vTry = h('button', { type: 'button', class: 'btn' }, 'Probar');
  const vAll = h('button', { type: 'button', class: 'pill', style: 'min-height:40px;font-size:12px' }, 'Ver todas las voces');
  const srcBtns = [['phone', 'Voz del teléfono'], ['gemini', 'Flor (Gemini)']].map(([k, l]) => h('button', { type: 'button', class: 'pill', style: 'min-height:40px;border:none', 'aria-pressed': String(vz.source === k) }, l));
  let showAll = false;
  async function fillVoices() {
    const all = await listVoices();
    const list = showAll ? all : spanish(all);
    const chosen = pickVoice(all);
    vSel.replaceChildren(...(list.length ? list : all).map((v) => h('option', { value: v.voiceURI }, `${v.name} (${v.lang})`)));
    if (chosen) vSel.value = chosen.voiceURI;
    if (!all.length) vStatus.textContent = 'Chrome no muestra ninguna voz. Revisá el motor de texto a voz del teléfono.';
    else if (!all.some((v) => /es[-_]AR/i.test(v.lang) || /daniela|argentin/i.test(v.name))) vStatus.textContent = 'No veo una voz argentina. Si usás Vox Sherpa, ponela como motor preferido en Ajustes del teléfono (buscá «texto a voz»: suele estar en Administración general → Salida de texto a voz → Motor preferido), y después cerrá Chrome del todo y volvé a abrir la app.';
    else vStatus.textContent = chosen ? `Usando: ${chosen.name} (${chosen.lang}).` : '';
  }
  vSel.onchange = () => { setVoz({ voice: vSel.value }); fillVoices(); };
  vAll.onclick = () => { showAll = !showAll; vAll.textContent = showAll ? 'Solo voces en español' : 'Ver todas las voces'; fillVoices(); };
  vTry.onclick = () => { phoneSay('¡Hola, che! ¿Cómo andás? Yo te voy a leer en voz alta.'); };
  srcBtns.forEach((b, i) => { b.onclick = () => { setVoz({ source: i ? 'gemini' : 'phone' }); srcBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(i === j))); }; });
  grid.append(h('section', { class: 'card' },
    h('h3', { style: 'font-size:15px;font-weight:700' }, 'Voz para leer en voz alta'),
    h('p', { class: 'muted small', style: 'line-height:1.4' }, 'La voz del teléfono es gratis, instantánea y funciona sin internet. Se usa en Escuchar, Trabalenguas, la tarjeta del día, Escribir, Diario y las respuestas escritas de Flor. La charla en vivo siempre usa la voz de Gemini.'),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Voz para leer' }, srcBtns),
    h('label', { class: 'small', style: 'font-weight:600' }, 'Voz del teléfono'), vSel,
    h('div', { class: 'row wrap' }, vTry, vAll), vStatus));
  fillVoices();

  // Gemini (AI features)
  const gm = getGemini();
  const gKey = h('input', { id: 'gkey', type: 'password', value: gm.key, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'AQ.… o AIza…',
    style: 'min-height:48px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:15px;width:100%' });
  const gStatus = h('p', { class: 'small', role: 'status' }, gm.key && gm.model ? `Conectado (${gm.model}).` : '');
  const gTest = h('button', { type: 'button', class: 'btn' }, 'Guardar y probar');
  const gRemove = h('button', { type: 'button', class: 'pill aj-small', hidden: !gm.key }, 'Quitar clave');
  gTest.onclick = async () => {
    const k = gKey.value.trim();
    if (!k) { gStatus.textContent = 'Pegá tu clave primero.'; return; }
    gStatus.textContent = 'Probando con Google…';
    try {
      const r = await testKey(k);
      gStatus.textContent = `¡Funciona! Modelo: ${r.model}. Gemini dijo: “${r.text}”.`;
      gRemove.hidden = false;
    } catch (err) { gStatus.textContent = 'No funcionó: ' + (err.message || err); }
  };
  gRemove.onclick = () => { setGemini({ key: '', model: '' }); gKey.value = ''; gStatus.textContent = 'Clave quitada del teléfono.'; gRemove.hidden = true; };
  gKey.className = 'aj-input'; gKey.removeAttribute('style'); gKey.setAttribute('aria-label', 'Clave de Gemini');
  right.append(h('section', { class: 'card aj-card aj-tight' },
    h('div', { class: 'aj-head' }, h('h3', {}, 'Gemini (funciones con IA)'), h('span', { class: `aj-dot${gm.key && gm.model ? ' on' : ''}`, 'aria-hidden': 'true' })),
    h('div', { class: 'aj-inline' }, gKey, gTest), h('div', { class: 'aj-status' }, gStatus, gRemove),
    h('details', { class: 'aj-more' }, h('summary', {}, 'Sobre la clave'),
      h('p', { class: 'muted small' }, 'Pegá tu clave de Google AI Studio. Queda guardada solo en este teléfono y se envía únicamente a Google. En el plan gratis, Google puede usar lo que escribas para mejorar sus productos: no compartas datos privados.'))));

  // Clip pack import
  const count = h('span', { class: 'muted small' });
  const status = h('p', { class: 'small', role: 'status' });
  const refresh = async () => { const n = await db.count('clips'); count.textContent = n ? `${n} clips en el teléfono` : 'Todavía no hay clips'; };
  const input = h('input', { type: 'file', accept: '.zip,application/zip,application/x-zip-compressed,application/x-zip,application/octet-stream', id: 'pack' });
  const importBtn = h('label', { for: 'pack', class: 'btn', role: 'button', tabindex: '0' }, 'Importar paquete');
  importBtn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    importBtn.setAttribute('aria-disabled', 'true');
    status.textContent = 'Leyendo el paquete…';
    try {
      await persist();
      const r = await importPack(file, (d, t) => { status.textContent = `Importando… ${d} de ${t}`; });
      if (r.kind === 'podcast') { status.textContent = `Listo: ${r.n} episodios de ${r.show}${r.packs > 1 ? ` (paquete ${r.pack} de ${r.packs})` : ''}. Están en Practicar → Podcast.`; toast('Episodios importados'); }
      else if (r.kind === 'songs') { status.textContent = `Listo: ${r.n} canciones de ${r.show}. Están en Practicar → Canciones.`; toast('Canciones importadas'); }
      else { status.textContent = `Listo: ${r.n} clips importados.`; toast('Clips importados'); }
    } catch (err) {
      status.textContent = 'No se pudo importar: ' + (err.message || err);
    }
    importBtn.removeAttribute('aria-disabled');
    input.value = '';
    refresh();
  };
  const clearBtn = h('button', { type: 'button', class: 'btn ghost' }, 'Borrar clips');
  input.hidden = true;
  clearBtn.onclick = async () => {
    if (!(await db.count('clips'))) return;
    if (!window.confirm('¿Borrar todos los clips del teléfono? Tu Mazo no se toca.')) return;
    await db.clear('clips'); await db.clear('audio'); refresh(); toast('Clips borrados');
  };
  right.append(h('section', { class: 'card aj-card aj-tight' },
    h('div', { class: 'aj-head' }, h('h3', {}, 'Clips de audio'), count),
    h('div', { class: 'aj-inline' }, importBtn, input, clearBtn), status));
  refresh();

  const sync = syncSection();
  right.append(sync);
  if (/[?&]sync/.test(location.hash)) requestAnimationFrame(() => sync.scrollIntoView({ block: 'start' }));

  main.append(h('section', { style: 'padding:4px 4px 0;display:flex;flex-direction:column;gap:6px' },
    h('h3', { class: 'muted', style: 'font-size:13px;font-weight:700;letter-spacing:.08em' }, 'CRÉDITOS'),
    h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Audio: corpus de español argentino de OpenSLR (Google), con licencia ',
      h('a', { href: 'https://creativecommons.org/licenses/by-sa/4.0/', target: '_blank', rel: 'noopener' }, 'CC BY-SA 4.0'), '.'),
    h('div', { class: 'row', style: 'gap:10px;margin-top:6px' }, h('img', { src: 'icons/logo.svg', alt: '', width: '26', height: '28', style: 'filter:drop-shadow(0 0 5px rgba(42,180,214,.5))' }),
      h('p', { class: 'muted small' }, `Penumbra · versión ${APP_VERSION}`))));
}

// Sync and backup (FE-01): Google Drive keeps devices identical; the backup file works anywhere, offline.
function syncSection() {
  const ago = (t) => { if (!t) return 'nunca'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };
  const box = h('section', { class: 'card aj-card aj-tight', id: 'sync', style: 'scroll-margin-top:72px' });
  const status = h('p', { class: 'small', role: 'status', style: 'line-height:1.45' });
  const fieldStyle = 'min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font-size:14px;width:100%';

  function paint() {
    const st = syncState(), connected = driveConnected();
    box.replaceChildren(h('span', { class: 'kicker' }, 'SINCRONIZACIÓN Y COPIA'));

    // Google Drive
    box.append(h('div', { class: 'aj-head' }, h('h3', {}, 'Google Drive'), h('span', { class: `aj-dot${connected && !st.error ? ' on' : ''}`, 'aria-hidden': 'true' })));
    if (!connected) {
      box.append(h('details', { class: 'aj-more' }, h('summary', {}, 'Cómo funciona'), h('p', { class: 'muted small' }, 'Mantiene el teléfono y la compu iguales usando una carpeta oculta de tu propio Drive. Penumbra solo ve esa carpeta, ninguno de tus otros archivos. Al conectar, vas a la página de Google y volvés solo.')));
      if (st.error) box.append(h('p', { class: 'small', style: 'color:var(--gold-text)' }, st.error));
      const id = h('input', { type: 'text', value: driveConfig().clientId || '', placeholder: 'Client ID de Google (termina en .apps.googleusercontent.com)', 'aria-label': 'Client ID de Google', autocomplete: 'off', spellcheck: 'false', style: fieldStyle, hidden: !!BUILT_IN_CLIENT_ID });
      const go = h('button', { type: 'button', class: 'btn' }, 'Conectar Google Drive');
      go.onclick = async () => {
        if (!BUILT_IN_CLIENT_ID) setDriveConfig({ clientId: id.value.trim() });
        status.textContent = 'Yendo a Google…';
        try { await signIn(true); status.textContent = 'Conectado. Sincronizando…'; await syncNow({ onProgress: (t) => { status.textContent = t; } }); paint(); toast('Sincronizado con Drive'); }
        catch (e) { status.textContent = `No se pudo conectar: ${e.message || e}`; }
      };
      box.append(h('div', { class: 'aj-inline' }, id, go));
    } else {
      const line = st.busy ? 'Sincronizando…' : st.error ? `Último intento falló: ${st.error}` : `Última sincronización: ${ago(st.lastSync)}`;
      const last = st.last && !st.error ? ` · ${st.last.in} llegaron, ${st.last.out} subieron${st.last.deleted ? `, ${st.last.deleted} borradas` : ''}${st.last.lenguatube ? `, ${st.last.lenguatube} de LenguaTube` : ''}` : '';
      const now = h('button', { type: 'button', class: 'btn' }, '☁ Sincronizar ahora');
      now.onclick = async () => {
        now.disabled = true;
        try { const r = await syncNow({ interactive: true, onProgress: (t) => { status.textContent = t; } }); status.textContent = r ? 'Listo.' : ''; toast('Sincronizado'); }
        catch (e) { status.textContent = `No se pudo: ${e.message || e}`; }
        paint();
      };
      const off = h('button', { type: 'button', class: 'btn ghost' }, 'Desconectar');
      off.onclick = () => { if (window.confirm('¿Desconectar Google Drive en este dispositivo? Tus datos no se borran.')) { disconnect(); paint(); } };
      box.append(h('p', { class: 'small' }, line + last), h('div', { class: 'aj-inline' }, now, off),
        h('details', { class: 'aj-more' }, h('summary', {}, 'Cómo funciona'), h('p', { class: 'muted small' }, 'Sincroniza sola al abrir la app y después de cada cambio, mientras la sesión de Google esté activa (una hora). Si venció, tocá «Sincronizar ahora». Los paquetes de clips, podcast y canciones no viajan: se importan una vez en cada dispositivo.')));
    }

    // Backup file
    const dl = h('button', { type: 'button', class: 'btn ghost' }, '⬇ Descargar copia');
    dl.onclick = async () => {
      dl.disabled = true; status.textContent = 'Armando la copia…';
      try {
        const r = await backupFile();
        const a = h('a', { href: URL.createObjectURL(r.blob), download: r.name });
        document.body.append(a); a.click(); a.remove();
        status.textContent = `Copia lista: ${r.name} (${r.items} cosas guardadas, ${r.blobs} audios e imágenes, ${Math.max(1, Math.round(r.blob.size / 1048576))} MB). Guardala en tu Drive o en la compu.`;
      } catch (e) { status.textContent = `No se pudo: ${e.message || e}`; }
      dl.disabled = false;
    };
    const file = h('input', { type: 'file', accept: '.zip,application/zip,application/octet-stream', hidden: true });
    const up = h('button', { type: 'button', class: 'btn ghost' }, '⬆ Restaurar copia');
    up.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      status.textContent = 'Restaurando…';
      try { const r = await restoreFile(f); status.textContent = `Listo: ${r.in} cosas restauradas${r.deleted ? `, ${r.deleted} borradas` : ''}. Lo que ya tenías acá se mantiene.`; toast('Copia restaurada'); }
      catch (e) { status.textContent = `No se pudo restaurar: ${e.message || e}`; }
    };
    box.append(h('div', { class: 'aj-head aj-sep' }, h('h3', {}, 'Copia de seguridad'), h('span', { class: 'muted small' }, `Última: ${ago(st.lastBackup)}`)),
      h('div', { class: 'aj-inline' }, dl, up, file),
      h('details', { class: 'aj-more' }, h('summary', {}, 'Qué guarda'), h('p', { class: 'muted small' }, 'Un archivo con tus tarjetas, repasos, libros, notas, diario y ajustes. Restaurarla combina, no pisa: no perdés nada de lo que hay en este dispositivo.')),
      status);
  }
  paint();
  return box;
}
