/* /app: install OfferReady as an app on a computer or phone. It is the same
 * app as the website (an installable web app): one install, its own window or
 * home-screen icon, updates itself, and opens offline. Shows a one-click
 * install where the browser offers it, and plain steps everywhere else. */

import { useEffect, useState } from "react";
import { installState, isIos, promptInstall, subscribePwa } from "../lib/pwa";
import { Link } from "../lib/router";
import { Icon } from "../components/Icon";

type Device = "computer" | "android" | "iphone";

const STEPS: Record<Device, { title: string; steps: string[] }> = {
  computer: { title: "Windows or Mac (Chrome or Edge)", steps: [
    "Open OfferReady in Chrome or Microsoft Edge.",
    "Click the install icon at the right of the address bar, or open the browser menu and choose “Install OfferReady”.",
    "OfferReady opens in its own window. Find it in your Start menu, Dock or Launchpad like any app.",
  ] },
  android: { title: "Android phone or tablet", steps: [
    "Open OfferReady in Chrome.",
    "Tap the menu (three dots) and choose “Install app” or “Add to Home screen”.",
    "Open it from your home screen. It runs full screen, without the browser bar.",
  ] },
  iphone: { title: "iPhone or iPad", steps: [
    "Open OfferReady in Safari.",
    "Tap the Share button, then “Add to Home Screen”, then “Add”.",
    "Open it from your home screen. It runs full screen, without the browser bar.",
  ] },
};

function guessDevice(): Device {
  if (isIos()) return "iphone";
  if (/android/i.test(navigator.userAgent || "")) return "android";
  return "computer";
}

export default function GetAppPage() {
  const [state, setState] = useState(installState());
  const [msg, setMsg] = useState("");
  const [device, setDevice] = useState<Device>(guessDevice);
  useEffect(() => subscribePwa(() => setState(installState())), []);

  const install = async () => {
    const r = await promptInstall();
    setMsg(r === "accepted" ? "Installing OfferReady…" : r === "dismissed" ? "No problem. You can install it any time from this page." : "");
    setState(installState());
  };

  return (
    <div className="page ga">
      <section className="card ga-hero">
        <div>
          <h2>{state === "installed" ? "OfferReady is installed" : "One app on your computer and your phone"}</h2>
          <p className="muted">Same account, same jobs and practice on every device. It opens in its own window or from your home screen, updates itself, and works offline for notes and study.</p>
          {msg ? <p className="hint" role="status">{msg}</p> : null}
        </div>
        {state === "prompt" ? (
          <button type="button" className="btn btn-primary btn-lg" onClick={install}><Icon name="plus" size={18} /> Install OfferReady</button>
        ) : state === "installed" ? (
          <Link className="btn btn-primary btn-lg" to="/jobs">Open my jobs</Link>
        ) : null}
      </section>

      <section aria-labelledby="ga-steps-h">
        <h2 id="ga-steps-h" className="ga-h">How to install</h2>
        <div className="ga-tabs" role="tablist" aria-label="Your device">
          {(Object.keys(STEPS) as Device[]).map((d) => (
            <button key={d} type="button" role="tab" aria-selected={d === device} className={"ga-tab" + (d === device ? " on" : "")} onClick={() => setDevice(d)}>
              {d === "computer" ? "Computer" : d === "android" ? "Android" : "iPhone / iPad"}
            </button>
          ))}
        </div>
        <div className="card ga-card" role="tabpanel">
          <h3>{STEPS[device].title}</h3>
          <ol className="ga-steps">{STEPS[device].steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      </section>

      <section className="ga-facts">
        <div className="card"><h3>Is it a real app?</h3><p className="muted">Yes: it installs, has its own icon and window, and keeps your work on the device. It is built from the same code as the website, so both are always up to date.</p></div>
        <div className="card"><h3>What works offline?</h3><p className="muted">Interview notes, your plan and anything already opened. AI features (coach, feedback, voice interview) need a connection.</p></div>
        <div className="card"><h3>Voice on a phone</h3><p className="muted">Voice interviews work best on a computer in Chrome or Edge. On a phone you can type your answers instead.</p></div>
      </section>
    </div>
  );
}
