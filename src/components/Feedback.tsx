import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { sendFeedback } from "../lib/track";

const OPEN_EVENT = "offerready:feedback";

/** Open the feedback dialog from anywhere. */
export function openFeedback(): void {
  try {
    window.dispatchEvent(new Event(OPEN_EVENT));
  } catch {
    /* ignore */
  }
}

const RATINGS: { n: number; label: string }[] = [
  { n: 1, label: "Not useful" },
  { n: 2, label: "A little" },
  { n: 3, label: "Okay" },
  { n: 4, label: "Useful" },
  { n: 5, label: "Very useful" },
];

/** Mounted once in App. A native <dialog>, so focus and Escape work for free. */
export function FeedbackDialog() {
  const auth = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    const open = () => {
      if (state === "sent" || state === "error") { setState("idle"); }
      if (state === "sent") { setRating(null); setMessage(""); setContactOk(false); }
      const d = ref.current;
      if (d && !d.open) {
        if (typeof d.showModal === "function") d.showModal();
        else d.setAttribute("open", "");
      }
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [state]);

  const close = () => {
    const d = ref.current;
    if (!d) return;
    if (typeof d.close === "function") d.close();
    else d.removeAttribute("open");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || state === "sending") return;
    setState("sending");
    const ok = await sendFeedback({ rating, message, contactOk });
    setState(ok ? "sent" : "error");
  };

  const signedIn = !!auth.email;

  return (
    <dialog
      ref={ref}
      className="fbk"
      aria-labelledby="fbk-title"
      onClick={(e) => { if (e.target === ref.current) close(); }}
    >
      {state === "sent" ? (
        <div className="fbk-body">
          <h2 id="fbk-title">Thank you</h2>
          <p className="muted">We read every message. It goes straight to the person building OfferReady.</p>
          <div className="fbk-actions">
            <button type="button" className="btn btn-primary" onClick={close}>Close</button>
          </div>
        </div>
      ) : (
        <form className="fbk-body" onSubmit={submit}>
          <h2 id="fbk-title">Send feedback</h2>
          <p className="muted">What worked, what didn{"’"}t, what{"’"}s missing. Short is fine.</p>
          <fieldset className="fbk-rating">
            <legend>How useful is OfferReady so far?</legend>
            <div className="fbk-scale">
              {RATINGS.map((r) => (
                <button
                  key={r.n}
                  type="button"
                  className={"fbk-pill" + (rating === r.n ? " on" : "")}
                  aria-pressed={rating === r.n}
                  onClick={() => setRating(rating === r.n ? null : r.n)}
                >
                  <b>{r.n}</b><span>{r.label}</span>
                </button>
              ))}
            </div>
            <div className="fbk-ends" aria-hidden="true"><span>Not useful</span><span>Very useful</span></div>
          </fieldset>
          <label className="fbk-label" htmlFor="fbk-msg">What should we fix or add?</label>
          <textarea
            id="fbk-msg"
            rows={5}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. The drill feedback was too generic for my answer about Kafka vs Kinesis."
            required
          />
          <p className="fbk-note">Please don{"’"}t paste passwords or private details. We save the page you{"’"}re on, not your answers.</p>
          {signedIn ? (
            <label className="fbk-check">
              <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} />
              It{"’"}s fine to email me about this
            </label>
          ) : null}
          {state === "error" ? <p className="fbk-err" role="alert">Couldn{"’"}t send that. Please try again in a moment.</p> : null}
          <div className="fbk-actions">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!message.trim() || state === "sending"}>
              {state === "sending" ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
