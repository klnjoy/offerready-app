/* Quick FAQ inside the help panel: instant answers to the questions people
 * ask most, without waiting for the assistant. Kept short and factual; the
 * Help Center has the full guides. */

import type { ReactNode } from "react";
import { docsUrl } from "../config";
import { Link } from "../lib/router";

const FAQ: { q: string; a: ReactNode }[] = [
  { q: "Is OfferReady free?", a: <>Yes. The free plan covers the full prep loop for one job, with no card needed. One-time passes raise the limits when an interview is booked. <Link to="/pricing">See pricing</Link>.</> },
  { q: "Does it help during a live interview?", a: <>No. OfferReady is for practice before the interview and a debrief after it. During a real interview you can type the questions into <Link to="/notes">Interview notes</Link>; there{"’"}s no AI and no microphone in it.</> },
  { q: "What does the AI Interview Coach do?", a: <>Ask any interview question and it builds an answer from your resume and stories, labels where each point came from, and flags numbers you never gave it. <Link to="/coach">Open the coach</Link>.</> },
  { q: "Where is my resume kept?", a: <>In your browser by default. It{"’"}s only stored on your account if you turn on resume sync. Details in <a href={docsUrl("Security/index.html")} target="_blank" rel="noopener noreferrer">Security and your data</a>.</> },
  { q: "How is readiness worked out?", a: <>From your resume match, your practice for that job and your plan progress. The ready date uses your pace over the last 14 days. <Link to="/dashboard">See readiness</Link>.</> },
  { q: "The voice interview doesn’t hear me", a: <>Use Chrome or Edge on a computer and allow the microphone. Or tick {"“"}Type my answers instead of speaking{"”"}.</> },
  { q: "Can I cancel or get a refund?", a: <>Passes are one-time payments, so there{"’"}s nothing to cancel. Refunds are covered in <a href={docsUrl("Terms/index.html#7-refunds")} target="_blank" rel="noopener noreferrer">the terms</a>.</> },
  { q: "How do I delete my data?", a: <>Account → Your data → Delete my data. You can download it first.</> },
];

export function HelpFaq({ onAsk }: { onAsk: () => void }) {
  return (
    <div className="hb-faq">
      <p className="hb-history-title">Quick answers</p>
      {FAQ.map((f) => (
        <details key={f.q} className="hb-faq-item">
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
      <p className="hb-note hb-faq-more">
        Didn{"’"}t find it? <button type="button" className="hb-link" onClick={onAsk}>Ask the assistant</button>, read the <a href={docsUrl("Help/index.html")} target="_blank" rel="noopener noreferrer">Help Center</a>, or <a href={docsUrl("Contact/index.html")} target="_blank" rel="noopener noreferrer">contact us</a>.
      </p>
    </div>
  );
}
