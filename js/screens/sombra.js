import { h, iconEl, toast, LEVELS, shuffle, backHead } from '../ui.js';
import { db } from '../db.js';
import { getSettings } from '../settings.js';
import { ipaFor } from '../ipa.js';
import { Player, Recorder, decode, peaks } from '../audio.js';
import { Waveform, onset, speechEnd } from '../waveform.js';
import { pitchTrack } from '../pitch.js';
import { alignTakes } from '../dtw.js';
import { log } from '../progress.js';
import { FEATURES, prosodyLine, pauseLegend, showPauses, setShowPauses } from '../prosody.js';

const SESSION = 10;
let session = null; // survives tab switches: { ids, index, level }
let viewMode = 'wave'; // 'wave' | 'pitch'
const FOCO = 'cadencia.sombra.foco';
let focus = (() => { try { return localStorage.getItem(FOCO) || 'todas'; } catch { return 'todas'; } })();

// Header for the speaking and writing tools: back to Practicar and the tool's name.
const TITLES = { entonacion: 'Entonación', gramatica: 'Gramática', sombra: 'Sombra', charla: 'Charla', escribir: 'Escribir', diario: 'Diario', vos: 'Vos', oido: 'Oído', traba: 'Trabalenguas', elision: 'Elisión', cognados: 'Cognados' };
export function practiceTabs(active) { return backHead(TITLES[active] || 'Practicar'); }

// Small inline icons for the practice dock.
const SVG = {
  loop: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
  mix: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
  save: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  wave: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></svg>',
  tune: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 16c3-8 5-8 7-3s4 5 7-3 3-2 4 0"/></svg>',
};
const ic = (k) => h('span', { class: 'sb-ic', html: SVG[k] });

export async function render(main) {
  const settings = getSettings();
  const all = await db.all('clips');
  const counter = h('span', { class: 'sb-count', 'aria-live': 'polite' });
  const prevBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Frase anterior' }, iconEl('prev'));
  const nextBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Siguiente frase' }, iconEl('next'));
  main.append(h('div', { class: 'sb-top' }, practiceTabs('sombra'), h('div', { class: 'sb-pager', role: 'group', 'aria-label': 'Frases' }, prevBtn, counter, nextBtn)));

  if (!all.length) {
    prevBtn.disabled = nextBtn.disabled = true;
    main.append(h('section', { class: 'card empty' },
      h('h2', {}, 'Todavía no hay clips'),
      h('p', { class: 'muted small' }, 'Prepará el paquete de audios de OpenSLR en tu compu y después importalo desde Ajustes.'),
      h('a', { class: 'btn', href: '#/perfil', style: 'align-self:center' }, 'Ir a Ajustes')));
    return () => {};
  }

  // Prosody focus: keep the round to one kind of sentence (questions, emphasis, heavy aspiration, fast speech) or mix.
  const feat = (id) => FEATURES.find((f) => f.id === id) || FEATURES[0];
  const counts = Object.fromEntries(FEATURES.map((f) => [f.id, all.filter((c) => f.test(c.text)).length]));
  if (!counts[focus]) focus = 'todas';
  const focusBtns = FEATURES.map((f) => h('button', { type: 'button', class: 'sb-chip', 'aria-pressed': String(f.id === focus), disabled: !counts[f.id], title: `${counts[f.id]} frases` },
    f.label, f.id !== 'todas' ? h('span', { class: 'n' }, String(counts[f.id])) : null));
  focusBtns.forEach((b, i) => { b.onclick = () => { focus = FEATURES[i].id; try { localStorage.setItem(FOCO, focus); } catch { /* ignore */ } session = null; window.dispatchEvent(new Event('cadencia:rerender')); }; });
  main.append(h('div', { class: 'sb-foco' }, h('span', { class: 'sb-label' }, 'FOCO'),
    h('div', { class: 'sb-chips', role: 'group', 'aria-label': 'Foco de prosodia' }, ...focusBtns)));

  // Pick a session of clips near the current level (within the chosen focus).
  const li = LEVELS.indexOf(settings.level);
  const focused = all.filter((c) => feat(focus).test(c.text));
  let pool = focused.filter((c) => Math.abs(LEVELS.indexOf(c.level) - li) <= 1);
  if (pool.length < SESSION) pool = focused;
  if (!session || session.level !== settings.level || session.focus !== focus || !session.ids.every((id) => all.some((c) => c.id === id))) {
    session = { ids: shuffle(pool).slice(0, SESSION).map((c) => c.id), index: 0, level: settings.level, focus };
  }
  const byId = new Map(all.map((c) => [c.id, c]));

  // --- Phrase card: metadata and the Pausas y ritmo switch on top, then the phrase, its IPA and the legend strip.
  const levelChip = h('span', { class: 'sb-tag strong' });
  const speakerChip = h('span', { class: 'sb-tag' });
  const sentence = h('p', { class: 'sentence sb-sentence', lang: 'es-AR' });
  const ipaLine = h('p', { class: 'ipa sb-ipa-text' });
  const pausesSw = h('button', { type: 'button', role: 'switch', class: 'switch', 'aria-checked': String(showPauses()), 'aria-label': 'Pausas y ritmo' }, h('span', { class: 'knob' }));
  const pausesLbl = h('label', { class: 'sb-switch' }, h('span', {}, 'Pausas y ritmo'), pausesSw);
  const legend = h('div', { class: 'sb-legend', hidden: !showPauses() }, pauseLegend());
  const paintSentence = () => { if (!current) return; sentence.replaceChildren(showPauses() ? prosodyLine(current.text, { size: 23 }) : current.text); legend.hidden = !showPauses(); };
  pausesSw.onclick = () => { setShowPauses(!showPauses()); pausesSw.setAttribute('aria-checked', String(showPauses())); paintSentence(); };
  main.append(h('section', { class: 'sb-card sb-phrase' },
    h('div', { class: 'sb-meta' }, h('div', { class: 'sb-tags' }, levelChip, speakerChip), pausesLbl),
    sentence,
    h('div', { class: 'sb-ipa' }, h('span', { class: 'sb-label' }, 'IPA RIOPLATENSE'), ipaLine),
    legend));

  // --- Compare card: Ondas / Melodía, Superponer, the canvas and the alignment drawer.
  const canvas = h('canvas', { class: 'wave sb-canvas', 'data-labels': 'on', role: 'img', 'aria-label': 'Ondas de la voz nativa y la tuya' });
  const waveTab = h('button', { type: 'button', 'aria-pressed': String(viewMode === 'wave') }, ic('wave'), 'Ondas');
  const pitchTab = h('button', { type: 'button', 'aria-pressed': String(viewMode === 'pitch') }, ic('tune'), 'Melodía');
  const overlaySw = h('button', { type: 'button', role: 'switch', class: 'switch', 'aria-checked': 'false', 'aria-label': 'Superponer' }, h('span', { class: 'knob' }));
  const overlayLbl = h('label', { class: 'sb-switch' }, h('span', {}, 'Superponer'), overlaySw);
  const stateLine = h('p', { class: 'sb-state', 'aria-live': 'polite' });
  const userKey = h('span', { class: 'sb-key user' }, h('i'), 'Vos');
  const timeEnd = h('span');
  const canvasWrap = h('div', { class: 'sb-canvas-wrap' }, canvas);

  // Alignment drawer (only with a recording): desfase readout, fine nudge, quick actions.
  const alignStart = h('button', { type: 'button', class: 'sb-btn' }, 'Alinear inicio');
  const matchLen = h('button', { type: 'button', class: 'sb-btn', 'aria-pressed': 'false' }, 'Igualar duración');
  const resetAlign = h('button', { type: 'button', class: 'sb-btn' }, 'Reiniciar');
  const syllBtn = h('button', { type: 'button', class: 'sb-btn', 'aria-pressed': 'false' }, 'Alinear sílabas');
  const rhythmInfo = h('div', { class: 'small', hidden: true, style: 'display:flex;flex-direction:column;gap:4px' });
  const alignInfo = h('span', { class: 'sb-offset', 'aria-live': 'polite' });
  const nudgeL = h('button', { type: 'button', class: 'sb-nudge', 'aria-label': 'Mover tu voz 50 milisegundos antes' }, '−');
  const nudgeR = h('button', { type: 'button', class: 'sb-nudge', 'aria-label': 'Mover tu voz 50 milisegundos después' }, '+');
  const slider = h('input', { type: 'range', min: '-1.5', max: '1.5', step: '0.01', value: '0', 'aria-label': 'Desfase de tu voz', class: 'sb-range' });
  const nudgeRow = h('div', { class: 'sb-nudge-row' }, nudgeL, slider, nudgeR);
  const dragHint = h('p', { class: 'muted small' }, 'Arrastrá tu onda en el gráfico o usá la barra para moverla en el tiempo.');
  const drawerBody = h('div', { class: 'sb-drawer-body' }, nudgeRow, h('div', { class: 'sb-actions' }, syllBtn, alignStart, matchLen, resetAlign), rhythmInfo, dragHint);
  const drawerToggle = h('button', { type: 'button', class: 'sb-drawer-head', 'aria-expanded': 'true' },
    h('span', { class: 'sb-drawer-title' }, 'Alinear tu voz'), alignInfo, h('span', { class: 'sb-chev', 'aria-hidden': 'true' }, '⌄'));
  const drawer = h('div', { class: 'sb-drawer', hidden: true }, drawerToggle, drawerBody);
  drawerToggle.onclick = () => { const open = drawerToggle.getAttribute('aria-expanded') !== 'true'; drawerToggle.setAttribute('aria-expanded', String(open)); drawer.classList.toggle('closed', !open); };

  main.append(h('section', { class: 'sb-card sb-compare', 'aria-label': 'Comparar voces' },
    h('div', { class: 'sb-compare-head' }, h('div', { class: 'sb-seg', role: 'group', 'aria-label': 'Vista' }, waveTab, pitchTab), overlayLbl),
    h('div', { class: 'sb-compare-sub' }, h('div', { class: 'sb-keys' }, h('span', { class: 'sb-key native' }, h('i'), 'Nativa'), userKey), stateLine),
    canvasWrap,
    h('div', { class: 'sb-axis' }, h('span', {}, '0,0 s'), timeEnd),
    drawer));

  const wave = new Waveform(canvas);
  wave.mode = viewMode;
  const STATES = {
    'wave-solo': 'Onda nativa. Grabá tu voz para comparar.',
    'wave-stack': 'Arriba la nativa, abajo vos.',
    'wave-over': 'Las dos ondas superpuestas: alineá tu voz con la nativa.',
    'wave-syl': 'Superpuestas, sílaba por sílaba.',
    'pitch-solo': 'Melodía nativa: cómo sube y baja la voz.',
    'pitch-both': 'Las dos melodías, cada una desde su tono medio (sirve aunque una voz sea más grave).',
  };
  function paintState() {
    const hasUser = !!wave.user;
    const key = viewMode === 'pitch' ? (hasUser ? 'pitch-both' : 'pitch-solo') : !hasUser ? 'wave-solo' : wave.warped() && wave.overlay ? 'wave-syl' : wave.overlay ? 'wave-over' : 'wave-stack';
    stateLine.textContent = STATES[key];
    canvasWrap.dataset.state = key;
    userKey.classList.toggle('off', !hasUser);
    overlaySw.disabled = viewMode === 'pitch' || !hasUser;
    overlayLbl.classList.toggle('disabled', overlaySw.disabled);
    overlaySw.setAttribute('aria-checked', String(wave.overlay && viewMode !== 'pitch'));
  }
  function setView(m) {
    viewMode = m; wave.mode = m;
    waveTab.setAttribute('aria-pressed', String(m === 'wave'));
    pitchTab.setAttribute('aria-pressed', String(m === 'pitch'));
    canvas.setAttribute('aria-label', m === 'pitch' ? 'Melodía de la voz nativa y la tuya' : 'Ondas de la voz nativa y la tuya');
    wave.draw(); showAlign();
  }
  waveTab.onclick = () => setView('wave');
  pitchTab.onclick = () => setView('pitch');
  function setOverlay(on) {
    wave.overlay = on;
    wave.draw(); showAlign();
  }
  overlaySw.onclick = () => setOverlay(!wave.overlay);
  // Alignment only makes sense on top of each other: the drawer's actions switch the waves to Superponer.
  const needOverlay = () => { if (viewMode === 'wave' && !wave.overlay) setOverlay(true); };

  const fmtSec = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2).replace('.', ',') + ' s';
  function showAlign() {
    drawer.hidden = !wave.user;
    const warped = wave.warped();
    alignInfo.textContent = !wave.user ? '' : warped ? 'sílaba por sílaba' : `desfase ${fmtSec(wave.offset)}${wave.scale !== 1 ? ` · ×${wave.scale.toFixed(2).replace('.', ',')}` : ''}`;
    [alignStart, matchLen, resetAlign, dragHint, nudgeRow].forEach((el) => { el.hidden = warped; });
    slider.value = String(Math.max(-1.5, Math.min(1.5, wave.offset)));
    rhythmInfo.hidden = !warped;
    paintState();
  }
  let nativeBuf = null, userBuf = null;
  function syllables(on) {
    syllBtn.setAttribute('aria-pressed', String(on));
    wave.warpOn = on;
    if (on) needOverlay();
    if (on && !wave.warp && nativeBuf && userBuf) {
      wave.warp = alignTakes(nativeBuf, userBuf, onset(wave.native), speechEnd(wave.native), onset(wave.user), speechEnd(wave.user));
      if (wave.warp) log('sombra', { rhythm: wave.warp.similarity });
      if (!wave.warp) { toast('No pude alinear esta toma. Probá grabarla de nuevo.'); syllBtn.setAttribute('aria-pressed', 'false'); wave.warpOn = false; }
    }
    if (wave.warp) {
      const pct = Math.round(wave.warp.similarity * 100);
      rhythmInfo.replaceChildren(
        h('span', { style: 'font-weight:700' }, `Ritmo parecido: ${pct}%`),
        h('span', { class: 'muted' }, h('span', { style: 'color:var(--user);font-weight:700' }, '■ naranja'), ': ahí fuiste más lento · ',
          h('span', { style: 'color:var(--native-fast);font-weight:700' }, '■ azul'), ': más rápido. Tu toma se estira para coincidir sílaba por sílaba.'));
    }
    if (on) matchLength(true); // keeps Mezcla 50/50 roughly in sync
    wave.draw(); showAlign();
  }
  syllBtn.onclick = () => syllables(syllBtn.getAttribute('aria-pressed') !== 'true');
  wave.onDrag = showAlign;
  function autoAlignStart() {
    if (!wave.user || !wave.native) return;
    wave.offset = onset(wave.native) - onset(wave.user) * wave.scale;
    wave.draw(); showAlign();
  }
  function matchLength(on) {
    matchLen.setAttribute('aria-pressed', String(on));
    if (!wave.user || !wave.native) return;
    if (on) {
      const nSpan = speechEnd(wave.native) - onset(wave.native);
      const uSpan = speechEnd(wave.user) - onset(wave.user);
      wave.scale = uSpan > 0.1 ? Math.min(3, Math.max(0.33, nSpan / uSpan)) : 1;
    } else wave.scale = 1;
    autoAlignStart();
  }
  const nudge = (d) => { needOverlay(); wave.offset = Math.round((wave.offset + d) * 100) / 100; wave.draw(); showAlign(); };
  nudgeL.onclick = () => nudge(-0.05);
  nudgeR.onclick = () => nudge(0.05);
  slider.oninput = () => { needOverlay(); wave.offset = parseFloat(slider.value); wave.draw(); showAlign(); };
  alignStart.onclick = () => { needOverlay(); autoAlignStart(); };
  matchLen.onclick = () => { needOverlay(); matchLength(matchLen.getAttribute('aria-pressed') !== 'true'); };
  resetAlign.onclick = () => { wave.offset = 0; wave.scale = 1; matchLen.setAttribute('aria-pressed', 'false'); if (syllBtn.getAttribute('aria-pressed') === 'true') syllables(false); wave.draw(); showAlign(); };

  // --- Practice dock: speed and loop, then Escuchar / Grabar / Mi voz, then Mezcla 50/50 and Guardar.
  const speeds = ['0.5', '0.75', '1'];
  let speed = speeds.includes(settings.speed) ? settings.speed : '1';
  const speedBtns = speeds.map((v) => h('button', { type: 'button', 'aria-pressed': String(v === speed), onclick: () => setSpeed(v) }, v === '1' ? '1.0x' : v + 'x'));
  const loopBtn = h('button', { type: 'button', class: 'sb-btn ghost', 'aria-pressed': 'false' }, ic('loop'), 'Bucle');
  const playBtn = h('button', { type: 'button', class: 'round native', 'aria-label': 'Escuchar la nativa' }, iconEl('play'));
  const recBtn = h('button', { type: 'button', class: 'round rec', 'aria-label': 'Grabar tu voz' }, iconEl('mic'));
  const recLabel = h('span', { class: 'rec-label' }, 'Grabar');
  const mineBtn = h('button', { type: 'button', class: 'round user', 'aria-label': 'Escuchar mi voz', disabled: true }, iconEl('play'));
  const mixBtn = h('button', { type: 'button', class: 'sb-btn ghost', disabled: true }, ic('mix'), 'Mezcla 50/50');
  const saveBtn = h('button', { type: 'button', class: 'sb-btn ghost', title: 'Guardar la frase en Penumbra' }, ic('save'), 'Guardar');
  main.append(h('div', { class: 'sb-dock', role: 'toolbar', 'aria-label': 'Práctica' },
    h('div', { class: 'sb-dock-side' }, h('div', { class: 'sb-seg small', role: 'group', 'aria-label': 'Velocidad' }, ...speedBtns), loopBtn),
    h('div', { class: 'sb-dock-main' },
      h('div', { class: 'control' }, playBtn, h('span', {}, 'Escuchar')),
      h('div', { class: 'control' }, recBtn, recLabel),
      h('div', { class: 'control' }, mineBtn, h('span', {}, 'Mi voz'))),
    h('div', { class: 'sb-dock-side end' }, mixBtn, saveBtn)));

  // --- State
  const native = new Player(), mine = new Player(), recorder = new Recorder();
  let nativeBlob = null, current = null, raf = 0, autoStop = 0, mixing = false, mixTimer = 0;

  function setSpeed(v) {
    speed = v;
    speedBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(speeds[i] === v)));
    native.rate = parseFloat(v);
  }
  native.rate = parseFloat(speed);

  function setIcon(btn, name) { btn.replaceChildren(iconEl(name)); }

  function stopAll() {
    native.pause(); mine.pause();
    clearTimeout(mixTimer);
    if (mixing) { native.volume = 1; mine.volume = 1; native.rate = parseFloat(speed); mine.rate = 1; mixing = false; }
    setIcon(playBtn, 'play'); setIcon(mineBtn, 'play');
  }

  function tick() {
    cancelAnimationFrame(raf);
    const loop = () => {
      const src = native.playing ? native : mine.playing ? mine : null;
      const t = !src ? null : src === native ? native.time : wave.warped() ? wave.fromUser(mine.time) : (wave.aligned() ? wave.offset + mine.time * wave.scale : mine.time);
      wave.playhead = src || mixing ? { t: src ? t : 0 } : null;
      if (!src && mixing && mixTimer) { raf = requestAnimationFrame(loop); return; }
      wave.draw();
      if (src) raf = requestAnimationFrame(loop);
      else { setIcon(playBtn, 'play'); setIcon(mineBtn, 'play'); if (mixing) stopAll(); }
    };
    raf = requestAnimationFrame(loop);
  }

  async function loadClip() {
    stopAll();
    if (recorder.recording) await stopRecording(true);
    const id = session.ids[session.index];
    current = byId.get(id);
    counter.textContent = `${session.index + 1} / ${session.ids.length}`;
    prevBtn.disabled = session.index === 0;
    levelChip.textContent = current.level;
    speakerChip.textContent = current.speaker ? `OpenSLR · ${current.speaker}` : 'OpenSLR';
    saveBtn.classList.remove('done'); saveBtn.lastChild.textContent = 'Guardar';
    paintSentence();
    ipaLine.textContent = ipaFor(current.text);
    mine.load(null); mineBtn.disabled = true; mixBtn.disabled = true;
    wave.offset = 0; wave.scale = 1; matchLen.setAttribute('aria-pressed', 'false');
    wave.nativePitch = null; wave.userPitch = null; wave.warp = null; userBuf = null; nativeBuf = null;
    wave.setUser(null); showAlign();
    nativeBlob = await db.audioFor(id);
    native.load(nativeBlob);
    if (nativeBlob) {
      try {
        const buf = await decode(nativeBlob);
        nativeBuf = buf;
        wave.setNative(peaks(buf), buf.duration);
        setTimeout(() => { if (current && current.id === id) wave.setNativePitch(pitchTrack(buf)); }, 0);
        timeEnd.textContent = buf.duration.toFixed(1).replace('.', ',') + ' s';
      } catch { wave.setNative(null); }
    }
  }

  async function stopRecording(discard = false) {
    clearTimeout(autoStop);
    const blob = await recorder.stop();
    recBtn.classList.remove('live'); setIcon(recBtn, 'mic'); recLabel.textContent = 'Grabar';
    recBtn.setAttribute('aria-label', 'Grabar tu voz');
    if (discard || !blob || !blob.size) return;
    mine.load(blob); mineBtn.disabled = false; mixBtn.disabled = false;
    try {
      const buf = await decode(blob);
      userBuf = buf; wave.warp = null;
      wave.setUser(peaks(buf), buf.duration);
      wave.setUserPitch(pitchTrack(buf));
      wave.scale = 1; matchLen.setAttribute('aria-pressed', 'false');
      autoAlignStart();
      log('sombra', { recorded: true });
      if (syllBtn.getAttribute('aria-pressed') === 'true') syllables(true);
    } catch { toast('No pude leer la grabación'); }
  }

  playBtn.onclick = () => {
    if (native.playing) { stopAll(); return; }
    stopAll(); native.play(); setIcon(playBtn, 'pause'); tick();
  };
  mineBtn.onclick = () => {
    if (mine.playing) { stopAll(); return; }
    stopAll(); mine.play(); setIcon(mineBtn, 'pause'); tick();
  };
  recBtn.onclick = async () => {
    if (recorder.recording) { await stopRecording(); return; }
    stopAll();
    try { await recorder.start(); }
    catch { toast('Necesito permiso para usar el micrófono'); return; }
    recBtn.classList.add('live'); setIcon(recBtn, 'stop'); recLabel.textContent = 'Detener';
    recBtn.setAttribute('aria-label', 'Detener la grabación');
    const dur = native.el.duration && isFinite(native.el.duration) ? native.el.duration : 5;
    autoStop = setTimeout(() => { if (recorder.recording) stopRecording(); }, Math.min(20000, (dur * 2 + 1.5) * 1000));
  };
  mixBtn.onclick = () => {
    stopAll();
    mixing = true;
    const off = wave.aligned() ? wave.offset : 0, sc = wave.aligned() ? wave.scale : 1;
    native.rate = 1; native.volume = 0.5; mine.volume = 0.5; mine.rate = 1 / sc;
    native.play();
    if (off > 0) { mine.el.currentTime = 0; mixTimer = setTimeout(() => { mixTimer = 0; if (mixing) mine.play(false); }, off * 1000); }
    else { mine.el.currentTime = -off / sc; mine.play(false); }
    tick();
  };
  loopBtn.onclick = () => {
    const on = loopBtn.getAttribute('aria-pressed') !== 'true';
    loopBtn.setAttribute('aria-pressed', String(on));
    native.loop = on;
  };
  saveBtn.onclick = async () => {
    if (!current) return;
    await db.put('mazo', { front: current.text, ipa: ipaFor(current.text), back: '', tag: '#Sombra', audio: nativeBlob || undefined, created: Date.now() });
    toast('Guardado en Penumbra');
    saveBtn.classList.add('done'); saveBtn.lastChild.textContent = 'Guardada';
  };
  prevBtn.onclick = () => { if (session.index > 0) { session.index--; loadClip(); } };
  nextBtn.onclick = () => {
    if (session.index < session.ids.length - 1) session.index++;
    else { session = null; toast('¡Sesión completa! Arrancamos otra.'); window.dispatchEvent(new Event('cadencia:rerender')); return; }
    loadClip();
  };

  await loadClip();
  setView(viewMode);
  requestAnimationFrame(() => wave.draw());

  return () => {
    stopAll(); cancelAnimationFrame(raf); clearTimeout(autoStop);
    if (recorder.recording) recorder.stop();
    native.load(null); mine.load(null); wave.destroy();
  };
}
