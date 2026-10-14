/* Installable web app: service worker registration, the "update available"
 * signal and the install prompt.
 *
 * The worker (public/sw.js) is registered in production builds only, scoped
 * to the base path (/offerready-app/ on GitHub Pages), so dev servers never
 * serve stale code. */

/** Build id (vite.config.ts sets VITE_RELEASE; "dev" elsewhere). */
export const RELEASE: string = (import.meta.env.VITE_RELEASE as string | undefined) || "dev";

const BASE = ((import.meta.env.BASE_URL as string | undefined) || "/").replace(/\/?$/, "/");

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

let waiting: ServiceWorker | null = null;

/** Non-standard event, Chromium only. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let installEvent: InstallPromptEvent | null = null;
let installed = false;

export function subscribePwa(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function updateWaiting(): boolean {
  return !!waiting;
}

/** Activate the waiting worker, then reload once it takes control. */
export function applyUpdate(): void {
  if (!waiting) {
    window.location.reload();
    return;
  }
  waiting.postMessage({ type: "SKIP_WAITING" });
}

export function isStandalone(): boolean {
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* ignore */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad Safari, which has no install prompt (Share → Add to Home Screen). */
export function isIos(): boolean {
  const ua = navigator.userAgent || "";
  const iPadOs = navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
  return /iphone|ipad|ipod/i.test(ua) || iPadOs;
}

export function installState(): "installed" | "prompt" | "ios" | "manual" {
  if (installed || isStandalone()) return "installed";
  if (installEvent) return "prompt";
  if (isIos()) return "ios";
  return "manual";
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const ev = installEvent;
  if (!ev) return "unavailable";
  installEvent = null;
  emit();
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice.outcome;
  } catch {
    return "dismissed";
  }
}

/* Updates apply on their own, so nobody needs a hard refresh:
 *  - found just after the app opens or comes back to the screen (and you
 *    aren't typing): reload into the new version straight away;
 *  - found later: show "Update available", and apply it the next time the
 *    app goes to the background, so you come back to the new version.
 * Never in the middle of a voice or text interview. */
const QUIET_MS = 15000;
let quietUntil = Date.now() + QUIET_MS;

function busyRoute(): boolean {
  return /\/(interview\/voice|simulator)(\/|$)/.test(window.location.pathname);
}

function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "TEXTAREA" || (tag === "INPUT" && !/^(button|checkbox|radio|submit|reset|range|file)$/i.test((el as HTMLInputElement).type)) || el.isContentEditable;
}

/** The screen (path) you last typed on: an update never reloads it, so
 * nothing unsaved is lost. Leaving the screen clears it. */
let typedOn = "";
if (typeof document !== "undefined") document.addEventListener("input", () => { typedOn = window.location.pathname; }, true);

function autoApply(): boolean {
  if (!waiting || busyRoute() || typedOn === window.location.pathname) return false;
  if (document.visibilityState === "hidden" || (Date.now() < quietUntil && !typing())) {
    applyUpdate();
    return true;
  }
  return false;
}

function track(reg: ServiceWorkerRegistration) {
  const markWaiting = (w: ServiceWorker | null) => {
    // Only an update (a page already controlled by an older worker) waits.
    if (w && navigator.serviceWorker.controller) {
      waiting = w;
      if (!autoApply()) emit();
    }
  };
  if (reg.waiting) markWaiting(reg.waiting);
  reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener("statechange", () => {
      if (w.state === "installed") markWaiting(reg.waiting || w);
    });
  });
}

/** Call once at startup. Install-prompt capture works in every build; the
 * worker registers only when `enabled` (production). */
export function initPwa(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own "Install app" button on Account
    installEvent = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    installEvent = null;
    emit();
  });

  if (!enabled || !("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker
      .register(BASE + "sw.js", { scope: BASE })
      .then((reg) => {
        track(reg);
        // Hand over the assets this first page load already fetched, so they
        // are cached even though the worker wasn't in control yet.
        const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.includes(BASE + "assets/"));
        const send = (w: ServiceWorker | null) => w && w.postMessage({ type: "CACHE_URLS", urls });
        send(reg.active || reg.waiting || reg.installing);
        navigator.serviceWorker.ready.then((r) => send(r.active)).catch(() => {});
        // A long-open tab still learns about new deploys.
        const check = () => { reg.update().catch(() => {}); };
        setInterval(check, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") { quietUntil = Date.now() + QUIET_MS; check(); }
          else autoApply(); // going to the background: switch to the new version now
        });
      })
      .catch(() => {
        /* no offline support this time; the app works the same */
      });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Only reload for an update we applied (by tap or automatically).
      if (reloading || !waiting) return;
      reloading = true;
      window.location.reload();
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
