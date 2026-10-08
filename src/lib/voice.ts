/* Browser speech helpers for the voice mock interview.
 *
 *  - Speech recognition: the Web Speech API (SpeechRecognition /
 *    webkitSpeechRecognition). Chrome and Edge support it (audio is sent to
 *    the browser vendor's speech service); Safari partly; Firefox not at all.
 *  - Speech synthesis: speechSynthesis (widely supported; voices vary by OS).
 *  - Mic level: getUserMedia + an AnalyserNode, for the level meter.
 *
 * SpeechRecognition isn't in the TS DOM lib, so minimal types live here. */

// ---- minimal Web Speech API types ------------------------------------------

interface SRAlternative { transcript: string; confidence: number }
interface SRResult { readonly isFinal: boolean; readonly length: number; [i: number]: SRAlternative }
interface SRResultList { readonly length: number; [i: number]: SRResult }
export interface SREvent { readonly resultIndex: number; readonly results: SRResultList; readonly timeStamp?: number }
interface SRErrorEvent { readonly error: string; readonly message?: string }

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

function srCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface VoiceSupport {
  recognition: boolean;
  synthesis: boolean;
  mic: boolean;
  /** Short browser name for the notice. */
  browser: "chrome" | "edge" | "safari" | "firefox" | "other";
}

export function detectSupport(): VoiceSupport {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const browser: VoiceSupport["browser"] = /Edg\//.test(ua) ? "edge"
    : /Firefox\//.test(ua) ? "firefox"
    : /Chrome\//.test(ua) ? "chrome"
    : /Safari\//.test(ua) ? "safari" : "other";
  return {
    recognition: !!srCtor(),
    synthesis: typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined",
    mic: typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function",
    browser,
  };
}

// ---- recognition -------------------------------------------------------------

export interface RecognizerHandlers {
  /** Full text so far: committed final text + the live interim guess. */
  onText(finalText: string, interim: string): void;
  /** Recognition stopped on its own (silence auto-stop or a fatal error). */
  onAutoStop?(reason: "silence" | "error", error?: string): void;
}

export interface RecognizerOptions {
  lang?: string;
  /** Auto-stop after this much silence once speech has started; 0 = never. */
  silenceMs?: number;
}

export interface Recognizer {
  start(): void;
  /** Stop listening; resolves with the final transcript and timing gaps. */
  stop(): Promise<{ transcript: string; gapsMs: number[] }>;
  abort(): void;
  readonly active: boolean;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Continuous recognizer that survives the engine's own restarts (Chrome ends
 * a session after a pause; we restart it while the user is still answering)
 * and records the silent gaps between results for the pause metric.
 */
export function createRecognizer(h: RecognizerHandlers, opts: RecognizerOptions = {}): Recognizer | null {
  const Ctor = srCtor();
  if (!Ctor) return null;
  let rec: SpeechRecognitionLike | null = null;
  let active = false;
  let finals: string[] = [];
  let sessionFinals: string[] = [];
  let interim = "";
  let lastResultAt = 0;
  const gaps: number[] = [];
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopResolve: ((v: { transcript: string; gapsMs: number[] }) => void) | null = null;
  let restarts = 0;

  const text = () => [...finals, ...sessionFinals].join(" ").replace(/\s+/g, " ").trim();
  const result = () => {
    const t = [text(), interim].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return { transcript: t, gapsMs: gaps.slice() };
  };
  const clearSilence = () => { if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; } };
  const armSilence = () => {
    clearSilence();
    const ms = opts.silenceMs || 0;
    if (!ms || !active) return;
    silenceTimer = setTimeout(() => {
      if (!active) return;
      active = false;
      try { rec?.stop(); } catch { /* ignore */ }
      h.onAutoStop?.("silence");
    }, ms);
  };

  const spawn = () => {
    const r = new Ctor();
    r.lang = opts.lang || (typeof navigator !== "undefined" && navigator.language) || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    sessionFinals = [];
    r.onresult = (e: SREvent) => {
      const t = now();
      if (lastResultAt) {
        const gap = t - lastResultAt;
        // Interim results stream every ~100–300 ms while speaking, so a big
        // gap between result events is silence.
        if (gap > 700) gaps.push(Math.round(gap));
      }
      lastResultAt = t;
      const sf: string[] = [];
      let live = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const s = res && res[0] ? res[0].transcript : "";
        if (res.isFinal) sf.push(s.trim());
        else live += s;
      }
      sessionFinals = sf.filter(Boolean);
      interim = live.trim();
      h.onText(text(), interim);
      armSilence();
    };
    r.onerror = (e: SRErrorEvent) => {
      // "no-speech" and "aborted" are routine; restart handles them.
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        active = false;
        clearSilence();
        h.onAutoStop?.("error", e.error);
      }
    };
    r.onend = () => {
      // Commit this engine session's text before any restart.
      finals = [...finals, ...sessionFinals];
      sessionFinals = [];
      if (interim) { finals.push(interim); interim = ""; }
      if (active && restarts < 50) {
        restarts++;
        try { spawn(); return; } catch { /* fall through */ }
      }
      active = false;
      clearSilence();
      h.onText(text(), "");
      if (stopResolve) { const f = stopResolve; stopResolve = null; f(result()); }
    };
    rec = r;
    r.start();
  };

  return {
    get active() { return active; },
    start() {
      finals = []; sessionFinals = []; interim = ""; lastResultAt = 0; gaps.length = 0; restarts = 0;
      active = true;
      spawn();
    },
    stop() {
      clearSilence();
      return new Promise((resolve) => {
        const wasActive = active;
        active = false;
        if (!rec || (!wasActive && !stopResolve)) { resolve(result()); return; }
        stopResolve = resolve;
        try { rec.stop(); } catch { stopResolve = null; resolve(result()); return; }
        // Some engines never fire onend after stop(); don't hang the UI.
        setTimeout(() => { if (stopResolve) { const f = stopResolve; stopResolve = null; f(result()); } }, 1500);
      });
    },
    abort() {
      active = false;
      clearSilence();
      stopResolve = null;
      try { rec?.abort(); } catch { /* ignore */ }
    },
  };
}

// ---- synthesis ---------------------------------------------------------------

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  try {
    return window.speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang) || !v.lang);
  } catch {
    return [];
  }
}

/** Calls back once now and again whenever the voice list changes. */
export function onVoicesChanged(cb: (v: SpeechSynthesisVoice[]) => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) { cb([]); return () => {}; }
  const fire = () => cb(listVoices());
  fire();
  const ss = window.speechSynthesis;
  try { ss.addEventListener("voiceschanged", fire); } catch { /* old Safari */ }
  return () => { try { ss.removeEventListener("voiceschanged", fire); } catch { /* ignore */ } };
}

/** Speak text; resolves when done, cancelled or after a safety timeout. */
export function speak(text: string, opts: { voiceURI?: string; rate?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) { resolve(); return; }
    const ss = window.speechSynthesis;
    try { ss.cancel(); } catch { /* ignore */ }
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(safety); resolve(); } };
    // ~13 chars/s at rate 1, plus slack, in case onend never fires.
    const safety = setTimeout(finish, 4000 + (text.length / 13) * 1000 * 1.6);
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = opts.voiceURI ? ss.getVoices().find((x) => x.voiceURI === opts.voiceURI) : undefined;
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = opts.rate || 1;
      u.onend = finish;
      u.onerror = finish;
      ss.speak(u);
    } catch {
      finish();
    }
  });
}

export function stopSpeaking(): void {
  try { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

// ---- mic level meter -----------------------------------------------------------

export interface MicMeter {
  stop(): void;
}

export type MicError = "denied" | "nodevice" | "unsupported" | "error";

/**
 * Open the mic and report a 0–1 level ~20×/s. Resolves to a meter, or an
 * error code (permission denied, no device, unsupported).
 */
export async function startMicMeter(onLevel: (level: number) => void): Promise<MicMeter | { error: MicError }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return { error: "unsupported" };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    const name = (e as { name?: string })?.name || "";
    return { error: name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "nodevice" : "error" };
  }
  const AC: typeof AudioContext | undefined = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) { stream.getTracks().forEach((t) => t.stop()); return { error: "unsupported" }; }
  const ctx = new AC();
  try { if (ctx.state === "suspended") await ctx.resume(); } catch { /* ignore */ }
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  let smooth = 0;
  const timer = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; sum += x * x; }
    const rms = Math.sqrt(sum / buf.length);
    // Speech RMS is ~0.02–0.3; map to 0–1 on a soft curve.
    const lvl = Math.min(1, Math.sqrt(rms * 6));
    smooth = smooth * 0.55 + lvl * 0.45;
    onLevel(smooth);
  }, 50);
  return {
    stop() {
      clearInterval(timer);
      try { src.disconnect(); } catch { /* ignore */ }
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}
