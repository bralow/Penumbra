// Light acoustic measurements for practice feedback: loudness envelope, syllable beats, how "hissy" a
// stretch is (to tell a full [s] from an aspirated [h]), and small canvases to show them.
// These are estimates from the waveform, good for spotting patterns, not lab measurements.

import { continuous } from './pitch.js';

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// RMS loudness every `hop` seconds, lightly smoothed. Returns { t: Float32Array, v: Float32Array, hop }.
export function envelope(buf, hop = 0.01) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, n = Math.max(1, Math.round(sr * hop));
  const len = Math.floor(d.length / n), v = new Float32Array(len), t = new Float32Array(len);
  for (let i = 0; i < len; i++) { let s = 0; for (let k = 0; k < n; k++) { const x = d[i * n + k]; s += x * x; } v[i] = Math.sqrt(s / n); t[i] = (i + 0.5) * hop; }
  const sm = v.map((_, i) => { let s = 0, c = 0; for (let k = -3; k <= 3; k++) { const x = v[i + k]; if (x !== undefined) { s += x; c++; } } return s / c; });
  return { t, v: sm, hop };
}

// Syllable nuclei: loudness peaks at least `gap` s apart that stand out from the dip before them.
export function syllableBeats(buf, t0 = 0, t1 = Infinity, gap = 0.09) {
  const { t, v } = envelope(buf);
  let top = 0; for (let i = 0; i < v.length; i++) if (t[i] >= t0 && t[i] <= t1) top = Math.max(top, v[i]);
  const peaks = [];
  let dip = Infinity;
  for (let i = 1; i < v.length - 1; i++) {
    if (t[i] < t0 || t[i] > t1) continue;
    dip = Math.min(dip, v[i]);
    if (v[i] >= v[i - 1] && v[i] > v[i + 1] && v[i] > top * 0.22 && v[i] - dip > top * 0.12) {
      const last = peaks[peaks.length - 1];
      if (last && t[i] - last.t < gap) { if (v[i] > last.v) { last.t = t[i]; last.v = v[i]; } continue; }
      peaks.push({ t: t[i], v: v[i] }); dip = v[i];
    }
  }
  return peaks;
}

// How hissy the sound is around time `at`: the strongest zero-crossing rate (crossings per second)
// among 20 ms frames within ±win that aren't silent. [s] ≈ 4500+/s, [h] or a dropped s much lower.
export function hiss(buf, at, win = 0.08) {
  const d = buf.getChannelData(0), sr = buf.sampleRate, fl = Math.round(sr * 0.02);
  const a = Math.max(0, Math.round((at - win) * sr)), b = Math.min(d.length - fl, Math.round((at + win) * sr));
  let loud = 0; for (let i = a; i < b; i += fl) { let s = 0; for (let k = 0; k < fl; k++) s += d[i + k] * d[i + k]; loud = Math.max(loud, Math.sqrt(s / fl)); }
  let best = 0;
  for (let i = a; i < b; i += Math.round(fl / 2)) {
    let s = 0, z = 0;
    for (let k = 0; k < fl; k++) { const x = d[i + k]; s += x * x; if (k && (x >= 0) !== (d[i + k - 1] >= 0)) z++; }
    if (Math.sqrt(s / fl) < loud * 0.05) continue;
    best = Math.max(best, (z / fl) * sr);
  }
  return best;
}
export const isFullS = (crossingsPerSec) => crossingsPerSec > 4500;

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, hgt = canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hgt);
  return { g, w, hgt };
}
function drawEnv(g, env, x0, x1, tFrom, tTo, yMid, amp, color) {
  let top = 0; for (const x of env.v) top = Math.max(top, x);
  g.fillStyle = color; g.beginPath(); g.moveTo(x0, yMid);
  const px = (tt) => x0 + ((tt - tFrom) / (tTo - tFrom)) * (x1 - x0);
  for (let i = 0; i < env.v.length; i++) { const tt = env.t[i]; if (tt < tFrom || tt > tTo) continue; g.lineTo(px(tt), yMid - (env.v[i] / (top || 1)) * amp); }
  for (let i = env.v.length - 1; i >= 0; i--) { const tt = env.t[i]; if (tt < tFrom || tt > tTo) continue; g.lineTo(px(tt), yMid + (env.v[i] / (top || 1)) * amp); }
  g.closePath(); g.fill();
  return px;
}

// Two takes, one above the other, each over its own speech span; matching marks joined by lines.
// rows: [{ buf, t0, t1, color, label, marks: [{ t, color }] }, ...]; links: [[markIndexTop, markIndexBottom], ...]
export function drawTakes(canvas, rows, links = []) {
  const { g, w, hgt } = setup(canvas);
  const rowH = hgt / rows.length, pad = 6, labelW = 0;
  const pxs = rows.map((r, k) => {
    const yMid = k * rowH + rowH / 2;
    g.fillStyle = cssVar('--line'); g.fillRect(0, yMid - 0.5, w, 1);
    const px = drawEnv(g, envelope(r.buf), labelW + pad, w - pad, r.t0, r.t1, yMid, rowH / 2 - 8, r.color);
    g.font = '600 10px Inter, sans-serif'; g.fillStyle = cssVar('--muted'); g.fillText(r.label, pad, k * rowH + 12);
    return { px, yMid };
  });
  // Links first, marks on top.
  g.lineWidth = 1; g.setLineDash([3, 3]); g.strokeStyle = cssVar('--muted');
  for (const [a, b] of links) {
    const ta = rows[0].marks[a], tb = rows[1] && rows[1].marks[b];
    if (!ta || !tb) continue;
    g.beginPath(); g.moveTo(pxs[0].px(ta.t), pxs[0].yMid + rowH / 2 - 6); g.lineTo(pxs[1].px(tb.t), pxs[1].yMid - rowH / 2 + 6); g.stroke();
  }
  g.setLineDash([]);
  rows.forEach((r, k) => (r.marks || []).forEach((m) => {
    const x = pxs[k].px(m.t);
    g.fillStyle = m.color; g.globalAlpha = 0.22; g.fillRect(x - 7, k * rowH + 4, 14, rowH - 8); g.globalAlpha = 1;
    g.fillRect(x - 1, k * rowH + 4, 2, rowH - 8);
    if (m.label) { g.font = '700 10px Inter, sans-serif'; g.fillText(m.label, x + 4, k * rowH + rowH - 8); }
  }));
}

// Pitch contours (semitones around each speaker's median) of up to two takes, on a shared 0..1 time axis
// (each take's voiced span is stretched to the full width so shapes can be compared).
export function drawContours(canvas, tracks) {
  const { g, w, hgt } = setup(canvas);
  g.fillStyle = cssVar('--line'); g.fillRect(0, hgt / 2 - 0.5, w, 1);
  for (const tr of tracks) {
    if (!tr || !tr.track) continue;
    const c = continuous(tr.track);
    const { times, st, bridged } = c;
    const idx = []; for (let i = 0; i < st.length; i++) if (!Number.isNaN(st[i])) idx.push(i);
    if (idx.length < 3) continue;
    const a = times[idx[0]], b = times[idx[idx.length - 1]];
    const X = (i) => 8 + ((times[i] - a) / Math.max(0.01, b - a)) * (w - 16);
    const Y = (i) => hgt / 2 - (Math.max(-9, Math.min(9, st[i])) / 9) * (hgt / 2 - 6);
    g.strokeStyle = tr.color; g.lineCap = 'round'; g.lineJoin = 'round';
    // One continuous line; stretches joined across a long pause are drawn thinner and dashed.
    let k = 0;
    while (k < idx.length - 1) {
      const dashed = !!bridged[idx[k + 1]];
      let e = k + 1; while (e < idx.length - 1 && !!bridged[idx[e + 1]] === dashed) e++;
      g.beginPath(); g.setLineDash(dashed ? [5, 6] : []); g.lineWidth = dashed ? 1.5 : 3; g.globalAlpha = dashed ? 0.55 : 1;
      g.moveTo(X(idx[k]), Y(idx[k]));
      for (let m = k + 1; m <= e; m++) g.lineTo(X(idx[m]), Y(idx[m]));
      g.stroke();
      k = e;
    }
    g.setLineDash([]); g.globalAlpha = 1;
  }
}

// Shape of the end of a contour: compares the last fifth of the voiced frames to the part before it.
// Returns { rise: semitones (positive = goes up at the end), peakAt: 0..1 where the highest pitch is }.
export function contourShape(track) {
  const v = []; for (let i = 0; i < track.st.length; i++) if (!Number.isNaN(track.st[i])) v.push([track.times[i], track.st[i]]);
  if (v.length < 8) return null;
  const n = v.length, tail = v.slice(Math.floor(n * 0.8)), body = v.slice(Math.floor(n * 0.5), Math.floor(n * 0.8));
  const avg = (a) => a.reduce((s, x) => s + x[1], 0) / a.length;
  const end = tail.slice(-Math.max(2, Math.floor(tail.length / 2)));
  let peak = 0; v.forEach((x, i) => { if (x[1] > v[peak][1]) peak = i; });
  return { rise: avg(end) - avg(body), peakAt: (v[peak][0] - v[0][0]) / Math.max(0.01, v[n - 1][0] - v[0][0]) };
}
