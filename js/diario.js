// Voice diary: speak, then Gemini transcribes exactly what you said, corrects it, and comments on
// how porteño it sounded. Recordings stay on the phone.
import { ask } from './gemini.js';
import { decode, peaks } from './audio.js';
import { onset, speechEnd } from './waveform.js';
import { pcmToWav } from './pcm.js';

export const SPEAK_PROMPTS = [
  'Contá cómo fue tu día: qué hiciste, con quién y cómo te sentiste.',
  '¿Qué comiste hoy? Contalo con detalles.',
  'Contá algo que te hizo reír esta semana.',
  '¿Qué planes tenés para el fin de semana?',
  'Describí el lugar donde estás ahora mismo.',
  'Contá algo que aprendiste hoy.',
  '¿Qué te preocupa o te entusiasma esta semana?',
  'Contale a un amigo porteño una película o serie que viste.',
  'Contá un recuerdo lindo de tu infancia.',
  '¿Qué harías si mañana te mudaras a Buenos Aires?',
  'Describí a alguien con quien hablaste hoy.',
  'Contá algo que te salió mal y cómo lo resolviste.',
];
export const promptOfDay = (d = new Date()) => SPEAK_PROMPTS[Math.floor(d.getTime() / 86400000) % SPEAK_PROMPTS.length];

// Gemini reliably takes WAV; the phone records WebM. Convert to 16 kHz mono (small, fine for speech).
async function toWav16k(blob) {
  const buf = await decode(blob);
  const len = Math.ceil(buf.duration * 16000);
  const off = new OfflineAudioContext(1, len, 16000);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return { wav: pcmToWav(out.getChannelData(0), 16000), buf };
}
const b64 = async (blob) => {
  const u = new Uint8Array(await blob.arrayBuffer()); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};

// Silent stretches inside the speech (from the loudness envelope): how many, how long on average, total.
export function pauses(buf, t0, t1, minLen = 0.25) {
  const data = buf.getChannelData(0), sr = buf.sampleRate, hop = Math.round(sr * 0.02);
  const rms = [];
  for (let i = Math.floor(t0 * sr); i + hop < Math.min(data.length, t1 * sr); i += hop) { let s = 0; for (let k = 0; k < hop; k++) s += data[i + k] * data[i + k]; rms.push(Math.sqrt(s / hop)); }
  const sorted = [...rms].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const gate = loud * 0.12;
  const runs = []; let run = 0;
  for (const v of rms) { if (v < gate) run++; else { if (run * 0.02 >= minLen) runs.push(run * 0.02); run = 0; } }
  const total = runs.reduce((a, b) => a + b, 0);
  return { count: runs.length, mean: runs.length ? total / runs.length : 0, total };
}

export async function analyze(blob, level, prompt) {
  const { wav, buf } = await toWav16k(blob);
  const track = { peaks: peaks(buf), duration: buf.duration };
  const speaking = Math.max(1, speechEnd(track) - onset(track));
  const pz = pauses(buf, onset(track), speechEnd(track));
  const medidas = `${pz.count} pausas de más de 0,25 s (promedio ${pz.mean.toFixed(2)} s), ${Math.round(speaking)} s hablando`;
  const r = await ask({
    system: 'Sos una profesora porteña de español. Escuchás grabaciones de un estudiante y lo ayudás a hablar como en Buenos Aires. Sos cálida, clara y precisa. Respondés solo en JSON.',
    turns: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'audio/wav', data: await b64(wav) } },
      { text: `Nivel del estudiante: ${level}. Consigna: «${prompt}».
Escuchá la grabación y devolvé un objeto JSON con:
- "transcript": lo que dijo, palabra por palabra, TAL CUAL (con sus errores, sin corregir; podés omitir "eh", "em").
- "corrected": la misma transcripción con solo los cambios necesarios, con voseo rioplatense.
- "porteno": cómo lo diría naturalmente un porteño en una charla.
- "changes": lista {"original": fragmento exacto de "transcript", "better": cómo queda, "lens": "gramática" | "voseo" | "porteño" | "vocabulario", "why": explicación corta en español simple}.
- "sounds": hasta 4 observaciones de pronunciación, cada una {"word": palabra, "note": qué escuchaste y cómo suena en Buenos Aires}. Fijate sobre todo en: ll/y como [ʃ] (sheísmo), la s antes de consonante aspirada [h], la r y la rr, vocales puras y la entonación porteña. Si algo ya suena porteño, decilo.
- "prosody": entre 2 y 4 observaciones sobre la PROSODIA, cada una {"aspect": "ritmo" | "entonación" | "pausas" | "velocidad" | "acentuación", "note": qué escuchaste y qué hacer, en español simple, "ok": true si ya suena natural}. Fijate en: si comprime o se come las sílabas átonas, si el ritmo es silábico como en español (cada sílaba con su tiempo) o acentual como en inglés (sílabas largas y cortas), dónde pone las pausas (entre grupos de sentido o en medio de una idea), si la entonación es plana o expresiva y si las preguntas suben o bajan como en Buenos Aires, y la velocidad. Usá estos datos medidos como apoyo: {MEDIDAS}.
- "praise": una frase corta y concreta sobre algo que hizo bien.
- "tip": un consejo breve para la próxima grabación.
- "level": nivel MCER estimado (A1 a C2).
Si la grabación está vacía o no se entiende, devolvé "transcript": "".`.replace('{MEDIDAS}', medidas) },
    ] }],
    json: true,
    temperature: 0.2,
  });
  const transcript = String(r.transcript || '').trim();
  const words = transcript ? transcript.split(/\s+/).length : 0;
  const changes = Array.isArray(r.changes) ? r.changes.filter((c) => c && c.better !== undefined) : [];
  return {
    transcript,
    corrected: String(r.corrected || transcript),
    porteno: String(r.porteno || ''),
    changes,
    sounds: Array.isArray(r.sounds) ? r.sounds.filter((s) => s && s.note) : [],
    prosody: Array.isArray(r.prosody) ? r.prosody.filter((p) => p && p.note).map((p) => ({ aspect: String(p.aspect || ''), note: String(p.note), ok: !!p.ok })) : [],
    pauses: pz.count,
    pauseMean: Math.round(pz.mean * 100) / 100,
    pausesPerMin: Math.round((pz.count / (speaking / 60)) * 10) / 10,
    artRate: words ? Math.round(words / (Math.max(0.5, speaking - pz.total) / 60)) : 0, // words per minute without the pauses
    praise: String(r.praise || ''),
    tip: String(r.tip || ''),
    level: String(r.level || ''),
    wpm: words ? Math.round(words / (speaking / 60)) : 0,
    errorRate: words ? Math.round((changes.length / words) * 1000) / 10 : 0, // per 100 words
    words,
  };
}
