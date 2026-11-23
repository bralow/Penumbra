// Gramática: a guided path from the vos forms (Vos) to free writing (Escribir). Four modules of short
// exercises with an explanation after each answer; your best score per module is kept.
import { h, toast, shuffle, backHead } from '../ui.js';
import { db } from '../db.js';
import { ipaFor } from '../ipa.js';
import { log } from '../progress.js';
import { checkTyped } from '../penumbra.js';
import { geminiReady } from '../gemini.js';
import { MODULES } from '../gramaticadata.js';

const KEY = 'cadencia.gramatica';
const progress = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const saveBest = (id, pct) => { const p = progress(); p[id] = { best: Math.max(pct, (p[id] && p[id].best) || 0), last: pct, at: Date.now() }; try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } };
let openMod = null;

export async function render(main) {
  main.append(h('div', { class: 'between' }, backHead('Gramática')));
  const mod = MODULES.find((m) => m.id === openMod);
  return mod ? lesson(main, mod) : overview(main);
}

function overview(main) {
  const p = progress();
  const nextUp = MODULES.find((m) => !p[m.id] || p[m.id].best < 80) || MODULES[0];
  main.append(h('p', { class: 'muted small', style: 'line-height:1.45' }, 'Un puente entre Vos (las formas sueltas) y Escribir (texto libre): módulos cortos con huecos, transformaciones y una frase tuya al final. Después de cada respuesta, la explicación. Con 80% o más, el módulo queda superado.'));
  main.append(h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, ...MODULES.map((m, i) => {
    const best = p[m.id] ? p[m.id].best : null;
    const b = h('button', { type: 'button', class: `card${m === nextUp ? ' selected' : ''}`, style: 'flex-direction:row;align-items:center;gap:14px;text-align:left;cursor:pointer;font:inherit;color:inherit;padding:14px 16px' },
      h('span', { style: `width:36px;height:36px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;${best >= 80 ? 'background:var(--accent);color:var(--accent-ink)' : 'border:2px solid var(--line)'}` }, best >= 80 ? '✓' : String(i + 1)),
      h('span', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px' },
        h('b', { style: 'font-family:var(--display);font-size:17px' }, m.title), h('span', { class: 'muted small' }, `${m.sub} · ${m.items.length} ejercicios`),
        best !== null ? h('div', { class: 'progress', style: 'margin-top:6px' }, h('div', { style: `width:${best}%` })) : null),
      h('span', { class: 'small', style: 'font-weight:700;color:var(--accent);white-space:nowrap' }, m === nextUp ? 'Seguir →' : best !== null ? `${best}%` : 'Empezar'));
    b.onclick = () => { openMod = m.id; window.dispatchEvent(new Event('cadencia:rerender')); };
    return b;
  })));
  main.append(h('div', { class: 'row wrap', style: 'gap:8px' },
    h('a', { href: '#/vos', class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none' }, '← Repasar formas en Vos'),
    h('a', { href: '#/escribir', class: 'pill', style: 'min-height:40px;display:inline-flex;align-items:center;text-decoration:none' }, 'Escribir texto libre →')));
  return () => {};
}

function lesson(main, mod) {
  const prompts = mod.items.filter((x) => x.t === 'prompt');
  const items = [...shuffle(mod.items.filter((x) => x.t !== 'prompt')), ...prompts];
  let i = 0, score = 0, graded = 0;
  const back = h('button', { type: 'button', class: 'pill', style: 'min-height:38px' }, '← Módulos');
  back.onclick = () => { openMod = null; window.dispatchEvent(new Event('cadencia:rerender')); };
  const counter = h('span', { class: 'muted small', style: 'font-weight:600' });
  const bar = h('div');
  main.append(h('div', { class: 'between' }, back, counter), h('h2', { style: 'font-size:22px' }, mod.title),
    h('details', { class: 'card', style: 'gap:6px', open: !progress()[mod.id] }, h('summary', { style: 'font-weight:700;cursor:pointer' }, 'La regla'), h('p', { class: 'small', style: 'line-height:1.5;margin-top:6px' }, mod.intro)),
    h('div', { class: 'progress' }, bar));
  const card = h('section', { class: 'card', style: 'gap:12px;padding:20px' });
  main.append(card);
  const fieldStyle = 'min-height:52px;padding:0 14px;border-radius:14px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font-size:19px;width:100%';
  const filled = (it, ans) => it.q.replace('___', ans);

  function show() {
    const it = items[i];
    counter.textContent = `${i + 1} / ${items.length}`;
    bar.style.width = `${(i / items.length) * 100}%`;
    const kind = { fill: 'COMPLETÁ', trans: 'TRANSFORMÁ', prompt: 'TU FRASE' }[it.t];
    const fb = h('div', { 'aria-live': 'polite', style: 'display:flex;flex-direction:column;gap:8px' });
    const parts = it.q.split('___');
    const question = h('p', { style: 'font-family:var(--display);font-size:22px;line-height:1.35;font-weight:600', lang: 'es-AR' },
      parts[0], parts.length > 1 ? h('span', { style: 'display:inline-block;min-width:70px;border-bottom:3px solid var(--accent);text-align:center;color:var(--accent)' }, '?') : '', parts[1] || '');
    card.replaceChildren(h('div', { class: 'between' }, h('span', { class: 'kicker' }, kind), it.hint ? h('span', { class: 'chip' }, it.hint) : null), question, fb);
    const done = (ok, accentsOnly, given) => {
      graded++; if (ok) score++;
      log('gramatica', { mod: mod.id, correct: ok });
      const answer = it.a[0];
      const full = it.t === 'fill' ? filled(it, ok ? given : answer).replace(/^./, (c) => c.toUpperCase()) : answer.replace(/^./, (c) => c.toUpperCase());
      const save = h('button', { type: 'button', class: 'pill' }, '+ Penumbra');
      save.onclick = async () => { await db.put('mazo', { front: full, ipa: ipaFor(full), back: it.exp, tag: '#Gramática', created: Date.now() }); toast('Guardada en Penumbra'); save.disabled = true; };
      fb.replaceChildren(
        h('b', { style: `color:${ok ? 'var(--accent)' : 'var(--gold-text)'}` }, ok ? (accentsOnly ? '¡Bien! Ojo con la tilde.' : '¡Bien!') : `Era: ${answer}`),
        h('p', { style: 'font-size:17px;font-family:var(--display);font-weight:600', lang: 'es-AR' }, full),
        h('p', { class: 'small', style: 'line-height:1.5' }, it.exp),
        h('div', { class: 'row wrap', style: 'gap:6px' }, save, nextBtn()));
    };
    if (it.t === 'prompt') return promptItem(it, fb, card);
    if (it.opts) {
      const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px' }, ...shuffle(it.opts).map((o) => {
        const b = h('button', { type: 'button', class: 'pill', style: 'min-height:52px;border-radius:14px;font-size:17px' }, o);
        b.onclick = () => {
          const ok = it.a.some((x) => x.toLowerCase() === o.toLowerCase());
          grid.querySelectorAll('button').forEach((x) => { x.disabled = true; if (it.a.some((y) => y.toLowerCase() === x.textContent.toLowerCase())) { x.style.background = 'var(--sel)'; x.style.color = 'var(--sel-ink)'; x.style.opacity = '1'; } });
          if (!ok) b.style.textDecoration = 'line-through';
          done(ok, false, o);
        };
        return b;
      }));
      card.insertBefore(grid, fb);
      return;
    }
    const input = h('input', { type: 'text', 'aria-label': 'Tu respuesta', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'es-AR', style: fieldStyle });
    const check = h('button', { type: 'button', class: 'btn' }, 'Comprobar');
    const go = () => {
      if (!input.value.trim()) return;
      input.disabled = true; check.hidden = true;
      const best = it.a.map((x) => checkTyped(input.value, x)).find((r) => r.ok) || { ok: false };
      done(best.ok, best.accentsOnly, input.value.trim());
    };
    check.onclick = go;
    input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    card.insertBefore(h('div', { class: 'row', style: 'gap:8px;flex-wrap:nowrap' }, input, check), fb);
    setTimeout(() => input.focus(), 50);
  }

  // Your own sentence: quick checks here, the model answer, and Gemini's correction if there's a key.
  function promptItem(it, fb, cardEl) {
    const ta = h('textarea', { rows: '3', 'aria-label': 'Tu frase', lang: 'es-AR', placeholder: 'Escribí acá…', style: 'width:100%;border-radius:14px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);padding:12px;font:inherit;font-size:17px;resize:vertical' });
    const check = h('button', { type: 'button', class: 'btn' }, geminiReady() ? 'Corregir' : 'Ver modelo');
    cardEl.insertBefore(h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, ta, check), fb);
    check.onclick = async () => {
      const text = ta.value.trim();
      if (text.split(/\s+/).length < 3) { toast('Escribí una frase completa.'); return; }
      check.disabled = true;
      const hits = (text.match(it.check) || []).length;
      const local = hits >= (it.min || 1);
      let ai = null;
      if (geminiReady()) {
        check.textContent = 'Corrigiendo…';
        try {
          const { ask } = await import('../gemini.js');
          ai = await ask({ system: 'Sos una profesora porteña de español. Respondés solo JSON.', json: true, temperature: 0.2, fast: true,
            turns: [{ role: 'user', text: `Consigna: «${it.q}». Frase del estudiante: «${text}». Devolvé {"ok": true si cumple la consigna y suena natural en Buenos Aires, "corrected": la frase corregida con voseo (igual si ya estaba bien), "note": una explicación corta en español simple}.` }] });
        } catch (e) { toast(`Sin corrección: ${e.message || e}`); }
      }
      const ok = ai ? !!ai.ok : local;
      graded++; if (ok) score++;
      log('gramatica', { mod: mod.id, correct: ok, prompt: true });
      const keep = ai && ai.corrected ? ai.corrected : text;
      const save = h('button', { type: 'button', class: 'pill' }, '+ Penumbra');
      save.onclick = async () => { await db.put('mazo', { front: keep, ipa: ipaFor(keep), back: `${mod.title}: ${it.q}`, tag: '#Gramática', created: Date.now() }); toast('Guardada en Penumbra'); save.disabled = true; };
      fb.replaceChildren(
        h('b', { style: `color:${ok ? 'var(--accent)' : 'var(--gold-text)'}` }, ok ? '¡Bien!' : ai ? 'Casi' : 'Revisá la consigna'),
        ai && ai.corrected ? h('p', { style: 'font-size:17px;font-family:var(--display);font-weight:600' }, ai.corrected) : null,
        ai && ai.note ? h('p', { class: 'small', style: 'line-height:1.5' }, ai.note) : h('p', { class: 'small', style: 'line-height:1.5' }, local ? 'Usaste la construcción que se pedía.' : 'No encontré la construcción que se pide en la consigna.'),
        h('p', { class: 'muted small' }, 'Modelo: ', h('i', {}, it.model)),
        h('div', { class: 'row wrap', style: 'gap:6px' }, save, nextBtn()));
    };
  }

  function nextBtn() {
    const b = h('button', { type: 'button', class: 'btn' }, i < items.length - 1 ? 'Siguiente' : 'Ver resultado');
    b.onclick = () => { if (i < items.length - 1) { i++; show(); } else finish(); };
    return b;
  }
  function finish() {
    const pct = Math.round((score / Math.max(1, graded)) * 100);
    saveBest(mod.id, pct);
    bar.style.width = '100%';
    const next = MODULES[MODULES.indexOf(mod) + 1];
    card.replaceChildren(h('span', { class: 'kicker' }, pct >= 80 ? 'MÓDULO SUPERADO' : 'MÓDULO TERMINADO'),
      h('p', { style: 'font-family:var(--display);font-size:30px;font-weight:700' }, `${score} de ${graded} · ${pct}%`),
      h('p', { class: 'muted small' }, pct >= 80 ? (next ? `Seguí con «${next.title}».` : 'Terminaste el recorrido. Ahora probalo escribiendo en Escribir.') : 'Repetilo hasta llegar al 80%.'),
      h('div', { class: 'row wrap', style: 'gap:8px' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => window.dispatchEvent(new Event('cadencia:rerender')) }, 'Repetir'),
        pct >= 80 && next ? h('button', { type: 'button', class: 'btn', onclick: () => { openMod = next.id; window.dispatchEvent(new Event('cadencia:rerender')); } }, `${next.title} →`) : null,
        pct >= 80 && !next ? h('a', { href: '#/escribir', class: 'btn' }, 'Ir a Escribir') : null,
        h('button', { type: 'button', class: 'pill', onclick: () => { openMod = null; window.dispatchEvent(new Event('cadencia:rerender')); } }, 'Ver módulos')));
  }
  show();
  return () => {};
}
